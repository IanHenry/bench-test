/*
 * content/2D.js - Reactive components: capacitors, inductors, and how they
 * charge and discharge.
 *
 * Written to be read start to finish. Intermediate builds the two components
 * and combines them; Full puts numbers on the capacitor, follows the coil's
 * back EMF to the flyback diode, and ends on the CR and LR time constants.
 * Each level sees only its own items.
 *
 * Headlines come from content/descriptions.json and are our own wording. The
 * RSGB owns the learning objectives, so nothing here is copied from them.
 *
 * How the instruments are computed:
 *   - series and parallel networks, and the loss in a dielectric, are solved
 *     by the complex nodal analysis engine;
 *   - every charge and discharge is a closed form exponential, piecewise
 *     where a switch moves or a neon strikes, so the curves are exact;
 *   - the plate capacitor uses C = kA/d, the coil a standard single layer
 *     approximation, both marked for interest where the syllabus does not
 *     ask for the sum.
 *
 * Schematic labels are drawn by a small overlay below, at 15 px whatever the
 * drawing's scale, so the engine's own labels are switched off. The overlay
 * also lets a layout change with the moment a time series is showing: a
 * switch opening, a neon striking, a spark at the contacts.
 */

const { eng, trim } = window.Fmt;
const NBSP = String.fromCharCode(160);
const EPS0 = 8.854e-12;            // permittivity of free space, F/m
const PANEL = '"Saira Semi Condensed", sans-serif';
const MONOF = '"IBM Plex Mono", monospace';

/* ---- the dielectrics, typical figures, for interest ---- */

// Relative permittivity and a typical breakdown strength. Real figures vary
// with thickness and quality; these are round values for illustration.
const DIEL = {
  air: { name: 'Air', er: 1, kvmm: 3 },
  polyester: { name: 'Polyester film', er: 3.3, kvmm: 60 },
  mica: { name: 'Mica', er: 6, kvmm: 100 },
  glass: { name: 'Glass', er: 7, kvmm: 10 }
};
const dielOf = k => DIEL[k] || DIEL.air;
/*
 * The voltage a gap stands, roughly: breakdown strength times the gap. Air is
 * the exception at small gaps: however small the gap, it does not spark
 * below about VARC (2D4 uses the same figure), so that is its floor.
 */
function breakdownV(D, gap) {
  const v = D.kvmm * 1e3 * gap * 1e3;
  return D === DIEL.air ? Math.max(VARC, v) : v;
}
/** The plates of 2D1 at Full: capacitance, charge, and whether they hold. */
function plateState(d) {
  const D = dielOf(d.device), C = d.Cair * D.er, Vbd = breakdownV(D, d.gap);
  return { D, C, Q: C * d.Vc, Vbd, broken: d.Vc > Vbd };
}

// Loss factor (tan delta) against frequency. Air, mica and C0G ceramic are
// flat and low; plastic film rises with frequency. Typical, for illustration.
const LOSS = {
  polyester: { name: 'Polyester film', tan: f => 0.005 * Math.pow(f / 1e3, 0.17) },
  mica: { name: 'Mica', tan: () => 7e-4 },
  ceramic: { name: 'C0G ceramic', tan: () => 2e-4 },
  air: { name: 'Air', tan: () => 2e-5 }
};
const LOSS_C = 100e-12;            // the test capacitor
const LOSS_REF = 1.8e6;            // heat is compared with its figure at 1.8 MHz
// With the same voltage across it, the heat in a dielectric is in proportion
// to f x tan delta: more cycles each second, each losing its share. Compared,
// not given in watts, since no one voltage suits 100 pF from LF to UHF.
const heatVsRef = (k, f) => (f / LOSS_REF) * LOSS[k].tan(f) / LOSS[k].tan(LOSS_REF);

/* ---- small helpers ---- */

function isDark(t) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec((t && t.surface) || '#ffffff');
  if (!m) return false;
  const [r, g, b] = [m[1], m[2], m[3]].map(h => parseInt(h, 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.4;
}
/*
 * Colour carries meaning, the course's scheme (README, Colours): voltage
 * t.v blue, current t.i orange (t.iInk as text), power t.p red, capacitance
 * t.c purple, inductance t.l green, resistance t.r dark; a warning is
 * t.noteInk as text and t.note as a fill or a spark; a cursor or a mark that
 * is not a quantity is t.mark. Two traces of one quantity are told apart by
 * dashing, in the full colour, never by fading it or by a new hue: a faded
 * line falls below 4.5:1 on the panel. tint() is kept for bars and fills.
 */
const hex6 = s => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(s || '').trim());
  return m ? [m[1], m[2], m[3]].map(h => parseInt(h, 16)) : null;
};
/** The colour k of the way from col towards the panel, as a solid hex. */
function tint(col, t, k) {
  const a = hex6(col), b = hex6(t.surface) || [255, 255, 255];
  if (!a) return col;
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * k).toString(16).padStart(2, '0')).join('');
}
/** The same colour, see-through, for a fill. */
function alpha(col, a) {
  const c = hex6(col);
  return c ? 'rgba(' + c.join(',') + ',' + a + ')' : col;
}
/* Dash patterns for second, third and fourth traces of one quantity. */
const DASH = { dash: [6, 5], dot: [2, 4], dashdot: [8, 3, 2, 3] };
/** A legend swatch drawn with the same dashes as its trace. */
const dashed = (col, pat) => {
  const d = pat || DASH.dash, stops = [];
  let x = 0;
  d.forEach((len, i) => {
    stops.push((i % 2 ? 'transparent ' : col + ' ') + x + 'px ' + (x + len) + 'px');
    x += len;
  });
  return 'repeating-linear-gradient(90deg,' + stops.join(',') + ')';
};
function hues(t) {
  return {
    volt: t.v, amp: t.i, ampInk: t.iInk, warn: t.noteInk,
    power: t.p, cap: t.c, ind: t.l,
    capFill: alpha(t.c, isDark(t) ? 0.22 : 0.13),
    spark: t.note
  };
}
// notes on a schematic are text, so current is written in its ink
const colourOf = (k, t) => {
  const h = hues(t);
  return { v: h.volt, i: h.ampInk, p: h.power, r: t.r, warn: h.warn, mark: t.mark,
           soft: t.soft, faint: t.faint, ink: t.ink, cap: h.cap, ind: h.ind }[k] || k;
};
const font = (px, wt, mono) => (wt || 500) + ' ' + px + 'px ' + (mono ? MONOF : PANEL);

/** A canvas cleared and scaled for the device, in CSS pixels. */
function canvas2d(cv) {
  const dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth, H = cv.clientHeight;
  cv.width = Math.round(W * dpr);
  cv.height = Math.round(H * dpr);
  const c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, W, H);
  return { c, W, H };
}

/** A unit in a readout label, kept in its own case: the labels are set in capitals. */
const unitCase = u => '<span style="text-transform:none">' + u + '</span>';
/** A signed number with a true minus sign. */
const signed = s => String(s).replace(/^-/, '−');

/*
 * Log sliders move in steps of a few per cent, so a value would rarely land
 * on a round figure. Components snap to the E12 series, everything else to
 * two significant figures (three where a seed needs one more).
 */
const E12 = [1, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];
function snapE12(v) {
  const dec = Math.pow(10, Math.floor(Math.log10(v) + 1e-9));
  let best = v, err = Infinity;
  for (const m of E12.concat(10)) {
    const c = m * dec, e = Math.abs(Math.log(c / v));
    if (e < err) { err = e; best = c; }
  }
  return +best.toPrecision(3);
}
const snapSig = n => v => +(+v).toPrecision(n);

/** Area in square metres and a gap in metres, written out for the working. */
const sqm = m2 => trim(m2, 3) + NBSP + 'm²';
const metres = m => trim(m, 3) + NBSP + 'm';
const pct = x => trim(100 * x, 3) + '%';
const evenTicks = (a, b, n, fmt) => {
  const out = [];
  for (let i = 0; i <= n; i++) { const v = a + (b - a) * i / n; out.push({ v, label: fmt(v) }); }
  return out;
};

/*
 * A plot drawn at the page's own text size. The shared plotting engine writes
 * its axis labels at 13 px; these are 15 px, and the plotting area uses the
 * same margins as the engine so that dragging the cursor maps the same way.
 *
 * s = { x: [a, b], xTicks: [{v, label}], y: {min, max, ticks}, y2: {...},
 *       traces: [{pts: [{x, y}], colour, width, axis, dash, fill, label, labelColour}],
 *       hlines: [{y, axis, colour, dash, label}], vlines: [{x, colour, dash, label}],
 *       bands: [{from, to, colour, label}], cursor: {x, colour, label, dots: [{y, axis, colour}]} }
 */
// left and right as the engine's own (Plot.PAD), so a drag on the plot maps to
// the same moment; 70 on the right leaves room for "−6.3 mV" in any font
const PAD = { l: 80, r: 70, t: 16, b: 40 };
function chart(cv, s, t) {
  const { c, W, H } = canvas2d(cv);
  const w = W - PAD.l - PAD.r, h = H - PAD.t - PAD.b;
  const [xa, xb] = s.x;
  const X = v => PAD.l + w * (v - xa) / (xb - xa);
  const Y = (v, axis) => {
    const a = axis === 'right' ? s.y2 : s.y;
    return PAD.t + h * (1 - (v - a.min) / (a.max - a.min));
  };
  const clipY = y => Math.max(PAD.t - 1, Math.min(PAD.t + h + 1, y));

  c.lineWidth = 1;
  c.strokeStyle = t.grid;
  c.font = font(15, 500);
  c.fillStyle = t.faint;
  for (const k of s.y.ticks) {
    const y = Math.round(Y(k.v)) + 0.5;
    c.beginPath(); c.moveTo(PAD.l, y); c.lineTo(PAD.l + w, y); c.stroke();
    c.textAlign = 'right'; c.textBaseline = 'middle';
    c.fillText(k.label, PAD.l - 8, y);
  }
  if (s.y2) {
    for (const k of s.y2.ticks) {
      c.textAlign = 'left'; c.textBaseline = 'middle';
      c.fillText(k.label, PAD.l + w + 8, Math.round(Y(k.v, 'right')) + 0.5);
    }
  }
  for (const k of s.xTicks) {
    const x = Math.round(X(k.v)) + 0.5;
    c.beginPath(); c.moveTo(x, PAD.t); c.lineTo(x, PAD.t + h); c.stroke();
    c.textAlign = k.v <= xa ? 'left' : k.v >= xb ? 'right' : 'center';
    c.textBaseline = 'top';
    c.fillText(k.label, x + (k.v <= xa ? -2 : k.v >= xb ? 2 : 0), PAD.t + h + 8);
  }

  for (const b of (s.bands || [])) {
    const a = Math.max(PAD.l, X(b.from)), e = Math.min(PAD.l + w, X(b.to));
    if (e <= a) continue;
    c.globalAlpha = b.alpha || 0.07;
    c.fillStyle = b.colour;
    c.fillRect(a, PAD.t, e - a, h);
    c.globalAlpha = 1;
    if (b.label && e - a > 30) {
      c.fillStyle = t.faint; c.font = font(15, 600);
      c.textAlign = 'center'; c.textBaseline = 'top';
      c.fillText(b.label, (a + e) / 2, PAD.t + 3);
    }
  }

  c.save();
  c.beginPath(); c.rect(PAD.l, PAD.t - 2, w, h + 4); c.clip();
  for (const tr of s.traces) {
    if (!tr.pts.length || !tr.fill) continue;
    const base = Y(Math.max(s.y.min, Math.min(s.y.max, 0)), tr.axis);
    c.beginPath();
    c.moveTo(X(tr.pts[0].x), base);
    for (const p of tr.pts) c.lineTo(X(p.x), clipY(Y(p.y, tr.axis)));
    c.lineTo(X(tr.pts[tr.pts.length - 1].x), base);
    c.closePath();
    c.fillStyle = tr.fill;
    c.fill();
  }
  c.restore();

  c.setLineDash([4, 4]);
  for (const l of (s.hlines || [])) {
    const a = l.axis === 'right' ? s.y2 : s.y;
    if (l.y < a.min || l.y > a.max) continue;
    const y = Y(l.y, l.axis);
    c.strokeStyle = l.colour; c.lineWidth = 1.2;
    c.setLineDash(l.dash === false ? [] : [4, 4]);
    c.beginPath(); c.moveTo(PAD.l, y); c.lineTo(PAD.l + w, y); c.stroke();
    if (l.label) {
      c.fillStyle = l.colour; c.font = font(15, 600);
      c.textAlign = l.align === 'left' ? 'left' : 'right';
      c.textBaseline = l.below ? 'top' : 'bottom';
      c.fillText(l.label, l.align === 'left' ? PAD.l + 6 : PAD.l + w - 6, y + (l.below ? 3 : -3));
    }
  }
  for (const l of (s.vlines || [])) {
    if (l.x < xa || l.x > xb) continue;
    const x = X(l.x);
    c.strokeStyle = l.colour; c.lineWidth = 1.2;
    c.setLineDash(l.dash === false ? [] : [4, 4]);
    c.beginPath(); c.moveTo(x, PAD.t); c.lineTo(x, PAD.t + h); c.stroke();
    if (l.label) {
      c.fillStyle = l.colour; c.font = font(15, 600);
      const right = l.side === 'left' || (l.side !== 'right' && (xb - l.x) < (xb - xa) * 0.25);
      c.textAlign = right ? 'right' : 'left';
      c.textBaseline = l.bottom ? 'bottom' : 'top';
      c.fillText(l.label, x + (right ? -5 : 5), l.bottom ? PAD.t + h - 4 : PAD.t + (l.row || 0) * 18 + 3);
    }
  }
  c.setLineDash([]);

  c.save();
  c.beginPath(); c.rect(PAD.l, PAD.t - 2, w, h + 4); c.clip();
  for (const tr of s.traces) {
    if (!tr.pts.length) continue;
    c.strokeStyle = tr.colour;
    c.lineWidth = tr.width || 2.2;
    c.lineJoin = 'round';
    c.setLineDash(Array.isArray(tr.dash) ? tr.dash : tr.dash ? DASH.dash : []);
    c.beginPath();
    tr.pts.forEach((p, i) => {
      const x = X(p.x), y = clipY(Y(p.y, tr.axis));
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    });
    c.stroke();
    if (tr.label) {
      const at = tr.labelAt === undefined ? tr.pts.length - 1 : tr.labelAt;
      const p = tr.pts[Math.max(0, Math.min(tr.pts.length - 1, at))];
      c.setLineDash([]);
      c.fillStyle = tr.labelColour || tr.colour; c.font = font(15, 600);
      c.textAlign = 'right'; c.textBaseline = tr.labelBelow ? 'top' : 'bottom';
      const tw = c.measureText(tr.label).width;
      c.fillText(tr.label, Math.max(PAD.l + 4 + tw, Math.min(PAD.l + w - 4, X(p.x))),
                 clipY(Y(p.y, tr.axis)) + (tr.labelBelow ? 4 : -4));
    }
  }
  c.setLineDash([]);
  c.restore();

  const cu = s.cursor;
  if (cu && cu.x >= xa && cu.x <= xb) {
    const x = X(cu.x);
    c.strokeStyle = cu.colour; c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(x, PAD.t); c.lineTo(x, PAD.t + h); c.stroke();
    for (const dt of (cu.dots || [])) {
      const y = clipY(Y(dt.y, dt.axis));
      c.fillStyle = dt.colour || cu.colour;
      c.beginPath(); c.arc(x, y, 4.5, 0, Math.PI * 2); c.fill();
      c.strokeStyle = t.surface; c.lineWidth = 1.6; c.stroke();
    }
    if (cu.label) {
      c.fillStyle = t.soft; c.font = font(15, 600);
      const right = (xb - cu.x) < (xb - xa) * 0.3;
      c.textAlign = right ? 'right' : 'left'; c.textBaseline = 'bottom';
      c.fillText(cu.label, x + (right ? -7 : 7), PAD.t + h - 4);
    }
  }
  return { X, Y, c, W, H, w, h };
}
const cursorX = (p, a, b, fallback) => p.cursor === null || p.cursor === undefined
  ? fallback : a + (b - a) * p.cursor;

/* ---- the schematic overlay: labels at 15 px, and layouts that move ---- */

// How far a label sits from the centre of each symbol, in layout units
const LABEL_OFF = { R: 10, C: 12, CP: 12, L: 8, D: 11, DZ: 11, DV: 11, N: 18, M: 18, S: 15, B: 14, V: 15 };

function drawOverlay(ctx, lay, t, u, hot) {
  const lh = 17 * u;
  for (const el of lay.elements) {
    const lines = [];
    // a highlighted part keeps the colour of what it is, as the engine draws
    // it, with its label in bold: resistors dark, inductors green, capacitors
    // purple, anything else ink
    const isHot = hot && hot.has(el.name);
    const own = el.type === 'R' ? t.r : el.type === 'L' ? t.l
              : (el.type === 'C' || el.type === 'CP') ? t.c : t.ink;
    if (el.text) lines.push({ s: el.text, f: (isHot ? '700 ' : '600 ') + 15 * u + 'px ' + PANEL, c: isHot ? own : t.ink });
    if (el.value) {
      lines.push({ s: el.value, f: (isHot ? '600 ' : '500 ') + 15 * u + 'px ' + MONOF,
                   c: el.valueColour ? colourOf(el.valueColour, t) : (isHot ? own : t.soft) });
    }
    if (!lines.length) continue;
    if (el.inline && lines.length === 2) {
      // name and value on one line, above the part
      ctx.textBaseline = 'bottom';
      const off1 = (LABEL_OFF[el.type] || 12) + 4 * u, gap = 6 * u;
      ctx.font = lines[0].f; const w0 = ctx.measureText(lines[0].s).width;
      ctx.font = lines[1].f; const w1 = ctx.measureText(lines[1].s).width;
      const x0 = el.at[0] - (w0 + gap + w1) / 2, yb = el.at[1] - off1;
      ctx.textAlign = 'left';
      ctx.font = lines[0].f; ctx.fillStyle = lines[0].c; ctx.fillText(lines[0].s, x0, yb);
      ctx.font = lines[1].f; ctx.fillStyle = lines[1].c; ctx.fillText(lines[1].s, x0 + w0 + gap, yb);
      continue;
    }
    const vertical = (el.rot || 0) % 180 !== 0;
    const side = el.labelAt || (vertical ? 'right' : 'above');
    const off = (el.labelOff !== undefined ? el.labelOff : (LABEL_OFF[el.type] || 12)) + 4 * u;
    const [x, y] = el.at;
    lines.forEach((ln, i) => {
      ctx.font = ln.f;
      ctx.fillStyle = ln.c;
      if (side === 'right' || side === 'left') {
        ctx.textAlign = side === 'right' ? 'left' : 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(ln.s, x + (side === 'right' ? off : -off), y + (i - (lines.length - 1) / 2) * lh);
      } else if (side === 'above') {
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText(ln.s, x, y - off - (lines.length - 1 - i) * lh);
      } else {
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(ln.s, x, y + off + i * lh);
      }
    });
  }
  for (const n of (lay.notes || [])) {
    ctx.font = (n.weight || 600) + ' ' + (n.size || 15) * u + 'px ' + (n.mono ? MONOF : PANEL);
    ctx.fillStyle = colourOf(n.colour || 'ink', t);
    ctx.textAlign = n.align || 'center';
    ctx.textBaseline = n.base || 'middle';
    ctx.fillText(n.text, n.at[0], n.at[1]);
  }
  if (lay.paint) lay.paint(ctx, u, t, hot);
}

/** A jagged spark between two points, in layout units. */
function spark(ctx, x1, y1, x2, y2, t) {
  const h = hues(t), n = 6;
  ctx.save();
  ctx.strokeStyle = h.spark;
  ctx.lineWidth = 2.2;
  ctx.shadowColor = h.spark;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const f = i / n, j = (i % 2 ? 1 : -1) * (i && i < n ? 4 : 0);
    const x = x1 + (x2 - x1) * f - (y2 - y1) / Math.hypot(x2 - x1, y2 - y1) * j;
    const y = y1 + (y2 - y1) * f + (x2 - x1) / Math.hypot(x2 - x1, y2 - y1) * j;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
}

if (typeof window !== 'undefined' && window.Schematic && window.Schematic.draw &&
    !window.Schematic.draw.overlay2D) {
  const plainDraw = window.Schematic.draw;
  const withOverlay = function (canvas, layout, opts) {
    opts = opts || {};
    let lay = layout;
    // a layout that changes with the moment the charge is showing
    if (typeof layout.frame === 'function') {
      const fl = opts.flow;
      const tau = fl && fl.mode === 'time' && window.Flow ? window.Flow.timeOf(fl).tau : 0;
      lay = layout.frame(tau);
    }
    // the engine's labels are 13 px; switch them off and draw our own
    const quiet = Object.assign({}, lay, {
      elements: lay.elements.map(e => Object.assign({}, e, { label: ' ' }))
    });
    plainDraw(canvas, quiet, Object.assign({}, opts, { labels: {} }));
    // the engine leaves the context scaled into layout units
    const ctx = canvas.getContext('2d');
    const k = Math.min((canvas.clientWidth - 32) / lay.w, (canvas.clientHeight - 32) / lay.h);
    drawOverlay(ctx, lay, opts.tokens || {}, 1 / k, opts.highlight);
  };
  withOverlay.overlay2D = true;
  window.Schematic.draw = withOverlay;
}

/* ---- the models ---- */

/*
 * A capacitor charging through R with a neon across it. The neon is off until
 * the capacitor reaches its striking voltage; lit, it behaves as a burning
 * voltage in series with a small resistance, discharging the capacitor until
 * it goes out at its extinction voltage, and the charge starts again. Every
 * stretch is an exact exponential, so the curve is exact piecewise. The neon
 * figures (burning at 0.75, out at 0.85 of the striking voltage) are typical.
 */
function neonModel(V, R, C, Vs, rRatio) {
  const tau = R * C, Vb = 0.75 * Vs, Ve = 0.85 * Vs, r = R / (rRatio || 200);
  const Rp = R * r / (R + r), Vq = (V / R + Vb / r) * Rp, tn = C * Rp;
  const duration = 6 * tau;
  const segs = [];
  let t = 0, v = 0, lit = false;
  while (t < duration && segs.length < 6000) {
    if (!lit) {
      if (V <= Vs) { segs.push({ t0: t, t1: Infinity, v0: v, vi: V, ts: tau, lit: false }); break; }
      const dt = tau * Math.log((V - v) / (V - Vs));
      segs.push({ t0: t, t1: t + dt, v0: v, vi: V, ts: tau, lit: false });
      t += dt; v = Vs; lit = true;
    } else {
      if (Vq >= Ve) { segs.push({ t0: t, t1: Infinity, v0: v, vi: Vq, ts: tn, lit: true }); break; }
      const dt = tn * Math.log((v - Vq) / (Ve - Vq));
      segs.push({ t0: t, t1: t + dt, v0: v, vi: Vq, ts: tn, lit: true });
      t += dt; v = Ve; lit = false;
    }
  }
  segs[segs.length - 1].t1 = Infinity;
  // charge through R up to the start of each stretch, for the exact charge
  const cumR = [0];
  for (let i = 0; i < segs.length - 1; i++) {
    const s = segs[i], d = s.t1 - s.t0;
    const intV = s.vi * d + (s.v0 - s.vi) * s.ts * (1 - Math.exp(-d / s.ts));
    cumR.push(cumR[i] + (V * d - intV) / R);
  }
  const find = tt => {
    let lo = 0, hi = segs.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (tt < segs[m].t1) hi = m; else lo = m + 1; }
    return lo;
  };
  const at = tt => {
    const i = find(tt), s = segs[i], e = Math.exp(-(tt - s.t0) / s.ts);
    const vc = s.vi + (s.v0 - s.vi) * e;
    const iR = (V - vc) / R, iN = s.lit ? Math.max(0, (vc - Vb) / r) : 0;
    return { vc, iR, iN, iC: iR - iN, lit: s.lit, seg: i };
  };
  const charge = tt => {
    const i = find(tt), s = segs[i], d = tt - s.t0;
    const vc = s.vi + (s.v0 - s.vi) * Math.exp(-d / s.ts);
    const intV = s.vi * d + (s.v0 - s.vi) * s.ts * (1 - Math.exp(-d / s.ts));
    const qR = cumR[i] + (V * d - intV) / R, qC = C * vc;
    return { R1: qR, C1: qC, N1: qR - qC };
  };
  const first = V > Vs ? -tau * Math.log(1 - Vs / V) : null;
  return { tau, duration, at, charge, segs, first, Vb, Ve, r, Vq, steady: Vq >= Ve };
}

/* A charged capacitor discharging through a bleed resistor. */
function bleedModel(V, R, C) {
  const tau = R * C;
  return { tau, duration: 6 * tau,
           at: t => { const v = V * Math.exp(-t / tau); return { vc: v, i: v / R }; } };
}

/*
 * A coil switched on and off through a changeover switch: S1 connects the
 * battery, S2 gives the current a path when S1 opens. Six time constants on,
 * six off.
 */
function lrModel(V, R, L) {
  const tau = L / R, Ifin = V / R, Ton = 6 * tau, I1 = Ifin * (1 - Math.exp(-6));
  const at = t => {
    const on = t < Ton;
    const i = on ? Ifin * (1 - Math.exp(-t / tau)) : I1 * Math.exp(-(t - Ton) / tau);
    return { i, on, vR: i * R, vL: on ? V - i * R : -i * R };
  };
  return { tau, Ton, duration: 12 * tau, Ifin, at };
}

/*
 * A coil on a battery through a switch, with or without a flyback diode.
 *   none      at switch-off the current can only cross the opening contacts,
 *             so the voltage rises until they spark; the gap is taken to
 *             break down at VARC, roughly the least that sparks across a
 *             small gap in air, and the contacts are held there while the
 *             coil empties, in a fraction of a millisecond
 *   diode     the diode, cathode to the positive side, takes the current and
 *             it dies away with the diode drop and R slowing it
 *   reversed  the diode conducts straight across the supply whenever the
 *             switch is closed, holding the coil at one diode drop, and at
 *             switch-off it is reverse biased and does nothing; the current
 *             through it takes RINT for the battery and wiring, which the
 *             page says in words, since neither is drawn
 */
const VARC = 300, VD = 0.7, RINT = 0.2;
function coilModel(V, R, L, kind) {
  const tau = L / R, Ton = 6 * tau, rev = kind === 'reversed';
  const Von = rev ? VD : V;
  const Ifin = Von / R, I1 = Ifin * (1 - Math.exp(-6));
  let tEnd = 0;
  const Ia = (V - VARC) / R;
  if (kind === 'diode') tEnd = tau * Math.log(1 + I1 * R / VD);
  else if (I1 > 0) tEnd = tau * Math.log((I1 - Ia) / (-Ia));
  const Ishort = rev ? (V - VD) / RINT : 0;
  const at = t => {
    const on = t < Ton, s = t - Ton, active = !on && s < tEnd;
    let i;
    if (on) i = Ifin * (1 - Math.exp(-t / tau));
    else if (!active) i = 0;
    else if (kind === 'diode') i = Math.max(0, (I1 + VD / R) * Math.exp(-s / tau) - VD / R);
    else i = Math.max(0, Ia + (I1 - Ia) * Math.exp(-s / tau));
    let vsw, iS, iD, vL;
    if (on) { vsw = 0; iS = i + Ishort; iD = Ishort; vL = Von - i * R; }
    else if (kind === 'diode') { vsw = active ? V + VD : V; iS = 0; iD = active ? i : 0; vL = active ? -VD - i * R : 0; }
    else { vsw = active ? VARC : V; iS = active ? i : 0; iD = 0; vL = active ? V - VARC - i * R : 0; }
    return { i, on, active, vsw, iS, iD, vL };
  };
  return { tau, Ton, duration: 12 * tau, Ifin, I1, tEnd, Ishort, at, kind };
}

/* An electrolytic, 100 µF 25 V, behind a 10 ohm resistor. Illustrative. */
const EL_C = 100e-6, EL_RATE = 25, EL_R = 10;
function electrolytic(V, reversed) {
  if (!reversed) {
    // the usual specification, 0.01 CV microamps, climbing past the rating
    const i = 1e-6 * (EL_C * 1e6) * 0.01 * V * Math.exp(Math.max(0, V - EL_RATE) / 1.5);
    return { i, vcap: V - i * EL_R };
  }
  // reversed, the oxide layer stops insulating above about a volt
  const i = V <= 1 ? 1e-4 * V : 1e-4 + (V - 1) / (EL_R + 2);
  return { i, vcap: V - i * EL_R };
}

/* A single layer coil, by the standard approximation, and its slug. */
function coil(N, dia, pitch, slug) {
  const rIn = dia / 2 / 0.0254, lIn = N * pitch / 0.0254;
  const Lair = 1e-6 * rIn * rIn * N * N / (9 * rIn + 10 * lIn);
  // a ferrite slug in a small former raises L about four times fully in;
  // it counts most as it passes the middle of the winding
  const x = Math.max(0, Math.min(1, slug / 100));
  const k = 1 + 3 * x * x * (3 - 2 * x);
  return { Lair, k, L: Lair * k, rIn, lIn, length: N * pitch };
}

/* A conductor swinging up and down through a field, 2 cm each way. */
const SWING = 0.02, WIRE = 0.1;
function induction(f, B, N) {
  const w = 2 * Math.PI * f, vpk = w * SWING;
  return {
    vpk, Epk: N * B * WIRE * vpk,
    at: t => ({ y: SWING * Math.sin(w * t), v: vpk * Math.cos(w * t),
                e: N * B * WIRE * vpk * Math.cos(w * t) })
  };
}

/* ---- layouts ---- */

/*
 * Each layout is drawn as tight as its 15 px labels allow, so that the
 * schematic fills its panel: the drawing is scaled to fit, and every unit of
 * empty width or height makes the symbols smaller.
 */

/* 2D1: a battery across the plates, steady, nothing flowing. */
function plateLayout(v, Q, full, broken) {
  return {
    w: 182, h: 84,
    elements: [
      { name: 'B1', type: 'B', at: [50, 42], rot: 90, flow: '-', labelAt: 'left',
        text: 'V', value: eng(v, 'V', 3) },
      { name: 'C1', type: 'C', at: [120, 42], rot: 90, flow: '-',
        text: 'C', value: full ? eng(Q.C, 'F', 3) : '' }
    ],
    wires: [[50, 12, 120, 12, '-'], [120, 72, 50, 72, '-']],
    // past breakdown the plates are joined, and hold no charge
    notes: broken ? [] : [{ at: [102, 28], text: '+Q', colour: 'i', align: 'right' },
                          { at: [102, 58], text: '−Q', colour: 'i', align: 'right' }]
  };
}

/*
 * 2D2 and 2D5: three parts in parallel, in series, or a parallel pair then
 * one more in series. Every wire carries one element's current, so the
 * parallel feed comes in at the middle branch and the meter names the total.
 */
function comboLayout(T, topo, labels) {
  const n = i => T + i;
  const el = (i, extra) => Object.assign({ name: n(i), type: T }, labels[n(i)] || {}, extra);
  if (topo === 'parallel') {
    return {
      w: 192, h: 148,
      elements: [
        { name: 'V1', type: 'V', at: [20, 110], rot: 90, labelAt: 'right', text: 'AC', value: '1 V' },
        el(1, { at: [105, 30], inline: true }), el(2, { at: [105, 70], inline: true }),
        el(3, { at: [105, 110], inline: true }),
        { name: 'RM', type: 'M', at: [170, 110], rot: 90, meter: 'A' }
      ],
      wires: [[20, 80, 20, 70, 'RM'], [20, 70, 70, 70, 'RM'],
              [70, 70, 70, 30, n(1)], [70, 30, 75, 30, n(1)],
              [70, 70, 75, 70, n(2)],
              [70, 70, 70, 110, n(3)], [70, 110, 75, 110, n(3)],
              [135, 30, 145, 30, n(1)], [145, 30, 145, 70, n(1)],
              [135, 70, 145, 70, n(2)],
              [135, 110, 145, 110, n(3)], [145, 110, 145, 70, n(3)],
              [145, 70, 170, 70, 'RM'], [170, 70, 170, 80, 'RM'],
              [170, 140, 20, 140, 'RM']],
      netlist: 'V1 in 0 1\n' + n(1) + ' in b {1}\n' + n(2) + ' in b {2}\n' + n(3) + ' in b {3}\nRM b 0 0.001'
    };
  }
  if (topo === 'series') {
    return {
      w: 166, h: 134,
      elements: [
        { name: 'V1', type: 'V', at: [45, 60], rot: 90, labelAt: 'left', text: 'AC', value: '1 V' },
        el(1, { at: [105, 30], inline: true }), el(2, { at: [150, 60], rot: 90, labelAt: 'left' }),
        el(3, { at: [105, 90], rot: 180, labelAt: 'below' })
      ],
      wires: [[45, 30, 75, 30, n(1)], [135, 30, 150, 30, n(1)],
              [150, 90, 135, 90, n(3)], [75, 90, 45, 90, n(3)]],
      netlist: 'V1 in 0 1\n' + n(1) + ' in a {1}\n' + n(2) + ' a b {2}\n' + n(3) + ' b 0 {3}'
    };
  }
  return {
    w: 189, h: 138,
    elements: [
      { name: 'V1', type: 'V', at: [20, 100], rot: 90, labelAt: 'right', text: 'AC', value: '1 V' },
      el(1, { at: [105, 30], inline: true }), el(2, { at: [105, 70], inline: true }),
      el(3, { at: [175, 100], rot: 90, labelAt: 'left' })
    ],
    wires: [[20, 70, 60, 70, n(3)],
            [60, 70, 75, 70, n(2)], [60, 70, 60, 30, n(1)], [60, 30, 75, 30, n(1)],
            [135, 30, 150, 30, n(1)], [150, 30, 150, 70, n(1)], [135, 70, 150, 70, n(2)],
            [150, 70, 175, 70, n(3)],
            [175, 130, 20, 130, n(3)]],
    netlist: 'V1 in 0 1\n' + n(1) + ' in a {1}\n' + n(2) + ' in a {2}\n' + n(3) + ' a 0 {3}'
  };
}
const fillNet = (net, vals) => net.replace(/\{(\d)\}/g, (m, k) => window.Fmt.sci(vals[+k - 1]));

/* 2D2 Full: the loss drawn as a resistance in series with a perfect capacitor. */
function lossLayout(esr) {
  return {
    w: 154, h: 102,
    elements: [
      { name: 'V1', type: 'V', at: [55, 62], rot: 90, labelAt: 'left', text: 'AC' },
      { name: 'R1', type: 'R', at: [100, 32], inline: true, text: 'loss', value: eng(esr, 'Ω', 3), valueColour: 'r' },
      { name: 'C1', type: 'C', at: [140, 62], rot: 90, labelAt: 'left', text: 'C', value: '100 pF' }
    ],
    wires: [[55, 32, 70, 32, 'R1'], [130, 32, 140, 32, 'R1'], [140, 92, 55, 92, 'C1']]
  };
}

/* 2D3 Intermediate: an electrolytic behind a resistor, either way round. */
function polarLayout(V, reversed) {
  const plus = reversed ? 80 : 44;
  return {
    w: 165, h: 102,
    elements: [
      { name: 'B1', type: 'B', at: [55, 62], rot: 90, labelAt: 'left', text: 'V', value: eng(V, 'V', 3) },
      { name: 'R1', type: 'R', at: [100, 32], inline: true, text: 'R', value: '10 Ω' },
      // the polarised symbol, positive plate on its first terminal: turned
      // round when reversed, with its current still drawn top to bottom
      { name: 'C1', type: 'CP', at: [140, 62], rot: reversed ? 270 : 90, flow: 'R1',
        flowReversed: reversed, labelAt: 'left', text: '100 µF', value: '25 V' }
    ],
    wires: [[55, 32, 70, 32, 'R1'], [130, 32, 140, 32, 'R1'], [140, 92, 55, 92, 'R1']],
    notes: [{ at: [154, plus], text: '+', colour: reversed ? 'warn' : 'ink', size: 18 }]
  };
}

/* 2D3 Full: a capacitor on a DC supply through a resistor. */
function ratingLayout(V, broken) {
  const f = broken ? 'R1' : '-';
  return {
    w: 154, h: 102,
    elements: [
      { name: 'B1', type: 'B', at: [55, 62], rot: 90, labelAt: 'left', text: 'V', value: eng(V, 'V', 3) },
      { name: 'R1', type: 'R', at: [100, 32], inline: true, flow: f, text: 'R', value: '1 kΩ' },
      { name: 'C1', type: 'C', at: [140, 62], rot: 90, flow: f, labelAt: 'left', text: 'C', value: '100 nF' }
    ],
    wires: [[55, 32, 70, 32, f], [130, 32, 140, 32, f], [140, 92, 55, 92, f]],
    paint: broken ? (ctx, u, t) => spark(ctx, 132, 58, 148, 66, t) : null,
    notes: broken ? [{ at: [125, 83], text: 'short', colour: 'warn', align: 'right' }] : []
  };
}

/*
 * 2D4 Full: battery, switch, the coil's resistance and inductance, and a
 * diode across the coil. kind is 'none', 'diode' or 'reversed'.
 */
function coilLayout(kind, m, V) {
  const els = [
    { name: 'B1', type: 'B', at: [20, 92], rot: 90, text: 'V', value: eng(V, 'V', 3) },
    { name: 'S1', type: 'S', at: [60, 32], text: 'S' },
    { name: 'R1', type: 'R', at: [140, 62], rot: 90, flow: 'R1', text: 'r', value: eng(m.R, 'Ω', 3) },
    { name: 'L1', type: 'L', at: [140, 122], rot: 90, flow: 'R1', text: 'L', value: eng(m.L, 'H', 3) }
  ];
  const wires = [[20, 62, 20, 32, 'S1'], [20, 32, 30, 32, 'S1'], [90, 32, 100, 32, 'S1'],
                 [100, 32, 140, 32, 'R1'],
                 [140, 152, 100, 152, 'R1'], [100, 152, 20, 152, 'S1'], [20, 152, 20, 122, 'S1']];
  if (kind === 'diode') {
    els.push({ name: 'D1', type: 'D', at: [100, 92], rot: 270, labelAt: 'left', text: 'D' });
    wires.push([100, 62, 100, 32, 'D1'], [100, 152, 100, 122, 'D1']);
  } else if (kind === 'reversed') {
    els.push({ name: 'D1', type: 'D', at: [100, 92], rot: 90, labelAt: 'left', text: 'D' });
    wires.push([100, 32, 100, 62, 'D1'], [100, 122, 100, 152, 'D1']);
  }
  return { w: 205, h: 162, elements: els, wires };
}

/* 2D7: the neon, the bleed resistor and the LR changeover. */
function neonLayout(V, R, C) {
  return {
    w: 231, h: 175,
    elements: [
      { name: 'B1', type: 'B', at: [20, 120], rot: 90, text: 'V', value: eng(V, 'V', 3) },
      { name: 'S1', type: 'S', at: [20, 60], rot: 270, flow: 'R1', text: 'S' },
      { name: 'R1', type: 'R', at: [70, 30], inline: true, text: 'R', value: eng(R, 'Ω', 3) },
      { name: 'N1', type: 'N', at: [120, 90], rot: 90, labelAt: 'left', text: 'neon' },
      { name: 'C1', type: 'C', at: [175, 90], rot: 90, text: 'C', value: eng(C, 'F', 3) }
    ],
    wires: [[20, 30, 40, 30, 'R1'], [100, 30, 120, 30, 'R1'],
            [120, 30, 120, 60, 'N1'], [120, 30, 175, 30, 'C1'], [175, 30, 175, 60, 'C1'],
            [175, 120, 175, 150, 'C1'], [175, 150, 120, 150, 'C1'], [120, 120, 120, 150, 'N1'],
            [120, 150, 20, 150, 'R1']]
  };
}
function bleedLayout(V, R, C) {
  return {
    w: 240, h: 102,
    elements: [
      { name: 'B1', type: 'B', at: [60, 62], rot: 90, labelAt: 'left', text: 'supply', value: eng(V, 'V', 3) },
      { name: 'S1', type: 'S', at: [100, 32], open: true, flow: '-', text: 'off' },
      { name: 'C1', type: 'C', at: [150, 62], rot: 90, flow: 'R1', flowReversed: true,
        labelAt: 'left', text: 'C', value: eng(C, 'F', 3) },
      { name: 'R1', type: 'R', at: [228, 62], rot: 90, labelAt: 'left', text: 'bleed', value: eng(R, 'Ω', 3) }
    ],
    wires: [[60, 32, 70, 32, '-'], [130, 32, 150, 32, '-'],
            [150, 32, 228, 32, 'R1'], [228, 92, 150, 92, 'R1'],
            [150, 92, 60, 92, '-']]
  };
}
function lrLayout(V, R, L) {
  return {
    w: 231, h: 102,
    elements: [
      { name: 'B1', type: 'B', at: [20, 62], rot: 90, text: 'V', value: eng(V, 'V', 3) },
      { name: 'S1', type: 'S', at: [60, 32], text: 'S1' },
      { name: 'S2', type: 'S', at: [100, 62], rot: 270, text: 'S2' },
      { name: 'R1', type: 'R', at: [150, 32], inline: true, text: 'R', value: eng(R, 'Ω', 3) },
      { name: 'L1', type: 'L', at: [205, 62], rot: 90, labelAt: 'left', text: 'L', value: eng(L, 'H', 3) }
    ],
    wires: [[20, 32, 30, 32, 'S1'], [90, 32, 100, 32, 'S1'],
            [100, 32, 120, 32, 'R1'], [180, 32, 205, 32, 'R1'],
            [205, 92, 100, 92, 'L1'], [100, 92, 20, 92, 'S1']]
  };
}

/* Copy a layout with some elements changed, for one moment of a time series. */
const withEls = (lay, change, extra) => Object.assign({}, lay, extra || {}, {
  elements: lay.elements.map(e => change[e.name] ? Object.assign({}, e, change[e.name]) : e)
});

const BENCH = {
  group: '2D',
  title: 'Reactive components',
  pageTitle: 'Reactive Components Bench',
  levels: ['intermediate', 'full'],
  // the course sessions that send learners here, named in the colophon
  sessions: {
    intermediate: ['Intermediate session 3 (Capacitors and inductors)'],
    full: ['Full session 5 (Components and time constants)']
  },
  circuitBased: true,
  standfirst: 'Move a control and watch what happens. The networks are solved as you go, and the charge and discharge curves are calculated exactly.',
  colophonNote: 'The series and parallel networks and the dielectric losses are solved by a complex nodal analysis engine; every charge and discharge is an exact exponential, worked piece by piece where a switch moves or a neon strikes. The plate and coil figures use standard formulas, marked for interest where the syllabus does not ask for the sum. Circuit symbols follow the RSGB specification.',

  /** Every circuit this bench draws, for the two checkers. */
  allLayouts: () => {
    const out = [];
    out.push({ name: 'plates on a battery', layout: plateLayout(100, { C: 88.5e-12 }, true),
               flow: { mode: 'dc', currents: {} } });
    ['parallel', 'series', 'mixed'].forEach(topo => {
      const c = comboLayout('C', topo, {});
      out.push({ name: 'capacitors, ' + topo, layout: c, netlist: fillNet(c.netlist, [10e-9, 22e-9, 47e-9]) });
      const l = comboLayout('L', topo, {});
      out.push({ name: 'inductors, ' + topo, layout: l, netlist: fillNet(l.netlist, [10e-6, 22e-6, 47e-6]) });
    });
    out.push({ name: 'dielectric loss', layout: lossLayout(1.5),
               netlist: 'V1 in 0 141.4\nR1 in a 1.5\nC1 a 0 100p' });
    out.push({ name: 'electrolytic, right way', layout: polarLayout(12, false),
               flow: { mode: 'dc', currents: { R1: electrolytic(12, false).i } } });
    out.push({ name: 'electrolytic, reversed', layout: polarLayout(12, true),
               flow: { mode: 'dc', currents: { R1: electrolytic(12, true).i } } });
    out.push({ name: 'capacitor within its rating', layout: ratingLayout(50, false),
               flow: { mode: 'dc', currents: {} } });
    out.push({ name: 'capacitor broken down', layout: ratingLayout(150, true),
               flow: { mode: 'dc', currents: { R1: 0.15 } } });
    ['none', 'diode', 'reversed'].forEach(kind => {
      const m = coilModel(12, 24, 0.1, kind);
      out.push({ name: 'coil, ' + kind, layout: coilLayout(kind, { R: 24, L: 0.1 }, 12),
                 flow: { mode: 'time', duration: m.duration, currents: BENCH.coilCurrents(m) } });
    });
    // a neon that stays lit once struck, so that its current is sampled
    const nm = neonModel(100, 5e5, 10e-6, 65, 5);
    out.push({ name: 'CR with a neon', layout: neonLayout(100, 5e5, 10e-6),
               flow: { mode: 'time', duration: nm.duration, currents: BENCH.neonCurrents(nm) } });
    const bm = bleedModel(1500, 6e5, 100e-6);
    out.push({ name: 'bleed resistor', layout: bleedLayout(1500, 6e5, 100e-6),
               flow: { mode: 'time', duration: bm.duration, currents: t => ({ R1: bm.at(t).i }) } });
    const lm = lrModel(12, 100, 0.1);
    out.push({ name: 'LR changeover', layout: lrLayout(12, 100, 0.1),
               flow: { mode: 'time', duration: lm.duration, currents: BENCH.lrCurrents(lm) } });
    return out;
  },

  coilCurrents: m => t => {
    const a = m.at(t), out = { S1: a.iS, R1: a.i };
    if (m.kind !== 'none') out.D1 = a.iD;
    return out;
  },
  neonCurrents: m => t => { const a = m.at(t); return { R1: a.iR, N1: a.iN, C1: a.iC }; },
  lrCurrents: m => t => {
    const a = m.at(t);
    return { S1: a.on ? a.i : 0, S2: a.on ? 0 : a.i, R1: a.i, L1: a.i };
  },

  bank: {
    url: 'https://rsgb.services/public/exams/eqdb/',
    topic: '2D - Reactive components',
    note: 'Full level only. Choose the topic from the Filter by Topic list.'
  },

  intro: {
    intermediate: [
      'A capacitor stores charge on two plates held apart by an insulator. An inductor stores energy in the magnetic field around a coil of wire. Every radio is full of both, and here you can build and adjust each one.',
      'Every section has its own controls above its instrument. Move them and watch the working as well as the picture: which value changed, and which way, is the part worth remembering.'
    ],
    full: [
      'At Full the same two components go further: what sets a capacitor’s value and the voltage it will stand, why some dielectrics heat up at radio frequencies, the back EMF of a coil and the diode that tames it, and how current and voltage rise and fall in CR and LR circuits.',
      'Each section shows the formulas the exam uses with your values substituted. Some are printed on the formula sheet and some are not, and each is marked: the time constant rules that are not on the sheet are exactly the ones the questions ask for.'
    ]
  },

  /** Everything the working reads, from the controls. */
  derive: (v) => {
    const Am2 = v.A * 1e-4;
    const cl = coil(v.Nt, v.dia, v.pitch, v.slug);
    const ind = induction(v.spd, v.B, v.turns);
    return Object.assign({}, v, {
      Am2, Cair: EPS0 * Am2 / v.gap, coil: cl, ind,
      Cpair: v.C1 + v.C2, Lpair: 1 / (1 / v.L1 + 1 / v.L2)
    });
  },

  /*
   * Read before this bench was designed. Our own summary of what each source
   * insists on; no wording from any of them appears here or in the bench.
   */
  sources: {
    read: [
      'Syllabus 2024 v1.6b, items 2D1 to 2D7, with the per-level split from the standalone level documents',
      'EX309 Full reference booklet, February 2026, formula sheet',
      'Course sessions at course.g0lft.org: Intermediate 3 (capacitors and inductors) and Full 5 (components and time constants), and the Intermediate exam preparation session for what EX308 prints',
      'Exam Secrets, Full, capacitors and time constants',
      'RSGB Full question bank, the twenty questions tagged 2D'
    ],
    keyMessages: [
      { at: '2D1', level: 'intermediate',
        point: 'two plates and an insulator; more area, a smaller gap or a better dielectric all give more capacitance' },
      { at: '2D1', level: 'full',
        point: 'C = kA/d with k = permittivity of free space times the relative permittivity, in square metres and metres' },
      { at: '2D1', level: 'full',
        point: 'Q = CV is on the sheet as C = Q/V; Q = It is not' },
      { at: '2D1', level: 'full',
        point: 'a solid dielectric raises both the capacitance and the breakdown voltage' },
      { at: '2D2', level: 'intermediate',
        point: 'capacitors combine the opposite way to resistors: parallel adds, series uses reciprocals' },
      { at: '2D2', level: 'full',
        point: 'dielectric loss rises with frequency, steeply in plastic film; air, mica and C0G suit RF' },
      { at: '2D3', level: 'intermediate',
        point: 'electrolytics are polarised, and reversed they can overheat, vent or burst' },
      { at: '2D3', level: 'full',
        point: 'the rating is the most it is made to withstand, peaks included; over it, it usually fails short' },
      { at: '2D4', level: 'intermediate',
        point: 'relative movement induces a voltage that follows the speed, not the position' },
      { at: '2D4', level: 'intermediate',
        point: 'a current makes a field round a wire, and a coil concentrates it: an inductor, in henries' },
      { at: '2D4', level: 'full',
        point: 'back EMF opposes any change of current: zero current at switch-on, a spike at switch-off' },
      { at: '2D4', level: 'full',
        point: 'the flyback diode goes across the coil with its cathode to the positive supply' },
      { at: '2D5', level: 'intermediate',
        point: 'inductors combine like resistors, provided their fields do not interact' },
      { at: '2D6', level: 'intermediate',
        point: 'more turns, a wider coil, closer turns or a ferrite core raise the inductance; a slug tunes it' },
      { at: '2D7', level: 'full',
        point: '63% after one time constant, 37% left on discharge, settled after about five; none of these on the sheet' },
      { at: '2D7', level: 'full',
        point: 'in an LR circuit it is the current that rises, and the voltage across R has the same shape' },
      { at: '2D7', level: 'full',
        point: 'the exam rounds: a neon at 65% of the supply strikes at about one time constant, and 552 V is answered as about 500 V' }
    ]
  },

  controls: [
    { id: 'A', label: 'Plate area', unit: 'cm²', range: [1, 900], start: 100, snap: snapSig(2),
      desc: 'The area of each plate' },
    { id: 'gap', label: 'Gap', unit: 'm', range: [5e-5, 1e-2], start: 1e-3, snap: snapSig(2),
      desc: 'The distance between the plates, filled by the dielectric' },
    { id: 'Vc', label: 'Voltage', unit: 'V', range: [1, 5000], start: 100, snap: snapSig(2),
      desc: 'The battery voltage across the plates' },
    { id: 'C1', label: 'C1', unit: 'F', range: [1e-12, 1e-4], start: 10e-9, snap: snapE12,
      desc: 'The first capacitor' },
    { id: 'C2', label: 'C2', unit: 'F', range: [1e-12, 1e-4], start: 22e-9, snap: snapE12,
      desc: 'The second capacitor' },
    { id: 'C3', label: 'C3', unit: 'F', range: [1e-12, 1e-4], start: 47e-9, snap: snapE12,
      desc: 'The third capacitor' },
    { id: 'fq', label: 'Frequency', unit: 'Hz', range: [3e4, 3e9], start: 1.8e6, snap: snapSig(2),
      desc: 'The frequency of the AC across the capacitor, from LF to UHF' },
    { id: 'Vel', label: 'Supply', unit: 'V', range: [1, 35], start: 12, snap: snapSig(2),
      desc: 'The battery across the 100 µF 25 V electrolytic and its 10 Ω resistor' },
    { id: 'Vap', label: 'Applied voltage', unit: 'V', range: [1, 2000], start: 50, snap: snapSig(3),
      desc: 'The DC voltage applied to the capacitor through the 1 kΩ resistor, or the peak of any AC' },
    { id: 'Vr', label: 'Rating', unit: 'V', range: [10, 1000], start: 63, snap: snapSig(2),
      desc: 'The voltage marked on the capacitor' },
    { id: 'spd', label: 'Movement', unit: 'Hz', range: [0.25, 4], start: 1, snap: snapSig(2),
      desc: 'How many times a second the conductor moves up and back down' },
    { id: 'B', label: 'Field', unit: 'T', range: [0.05, 1], start: 0.5, snap: snapSig(2),
      desc: 'The strength of the magnetic field between the poles, in teslas' },
    { id: 'turns', label: 'Turns', unit: '', range: [1, 20], start: 1, linear: true, integer: true,
      desc: 'Turns of wire moving through the field together' },
    { id: 'VB', label: 'Battery', unit: 'V', range: [1.5, 48], start: 12, snap: snapSig(2),
      desc: 'The battery driving the coil' },
    { id: 'L', label: 'L', unit: 'H', range: [1e-3, 10], start: 0.1, snap: snapSig(2),
      desc: 'The inductance of the coil' },
    { id: 'RL', label: 'R', unit: 'Ω', range: [1, 1e4], start: 24, snap: snapSig(2),
      desc: 'All the resistance in the coil circuit, the coil’s own included' },
    { id: 'L1', label: 'L1', unit: 'H', range: [1e-7, 1], start: 10e-6, snap: snapE12,
      desc: 'The first inductor' },
    { id: 'L2', label: 'L2', unit: 'H', range: [1e-7, 1], start: 22e-6, snap: snapE12,
      desc: 'The second inductor' },
    { id: 'L3', label: 'L3', unit: 'H', range: [1e-7, 1], start: 47e-6, snap: snapE12,
      desc: 'The third inductor' },
    { id: 'Nt', label: 'Turns', unit: '', range: [2, 60], start: 20, linear: true, integer: true,
      desc: 'The number of turns on the coil' },
    { id: 'dia', label: 'Diameter', unit: 'm', range: [5e-3, 40e-3], start: 12e-3, snap: snapSig(2),
      desc: 'The diameter of the coil' },
    { id: 'pitch', label: 'Spacing', unit: 'm', range: [0.5e-3, 5e-3], start: 1e-3, snap: snapSig(2),
      desc: 'The distance from one turn to the next, centre to centre' },
    { id: 'slug', label: 'Slug', unit: '%', range: [0, 100], start: 0, linear: true,
      desc: 'How far the ferrite slug is screwed into the coil' },
    { id: 'V', label: 'Supply', unit: 'V', range: [10, 2000], start: 100, snap: snapSig(2),
      desc: 'The supply the capacitor charges from' },
    { id: 'R', label: 'R', unit: 'Ω', range: [1e3, 1e7], start: 5e5, snap: snapSig(2),
      desc: 'The charging resistor, or the bleed resistor' },
    { id: 'C', label: 'C', unit: 'F', range: [1e-7, 1e-3], start: 10e-6, snap: snapSig(2),
      desc: 'The capacitor' },
    { id: 'VS', label: 'Neon strikes at', unit: 'V', range: [40, 150], start: 65, snap: snapSig(2),
      desc: 'The voltage at which the neon lights' }
  ],

  /*
   * The equations this bench uses. `given` records whether the Full formula
   * sheet (EX309, Feb 2026, p3) prints the formula, so that at Full it is
   * marked "given in the exam" or "learn this one". Below Full the default is
   * "for interest"; `tag` overrides that where the Intermediate booklet
   * (EX308) prints it too, and marks formulas beyond the syllabus as for
   * interest at Full.
   */
  equations: {
    Ckad: { given: true, name: 'Capacitance from the plates',
          eq: 'C = k &times; A / d, with k = &epsilon;<sub>0</sub> &times; &epsilon;<sub>r</sub>',
          work: d => {
            const D = dielOf(d.device);
            return ['8.854 &times; 10<sup>&minus;12</sup> &times; <b>' + D.er + '</b> &times; <b>' +
                    sqm(d.Am2) + '</b> / <b>' + metres(d.gap) + '</b>',
                    eng(d.Cair * D.er, 'F', 4)];
          } },
    QCV: { given: true, name: 'Charge on the plates (the sheet prints C = Q / V)',
          eq: 'Q = C &times; V',
          work: d => {
            const s = plateState(d);
            return ['<b>' + eng(s.C, 'F', 4) + '</b> &times; <b>' + eng(d.Vc, 'V', 4) + '</b>',
                    s.broken ? eng(s.Q, 'C', 4) + ' if it held; past breakdown the plates are shorted and hold none'
                             : eng(s.Q, 'C', 4)];
          } },
    QIt: { given: false, name: 'Charge is current times time',
          eq: 'Q = I &times; t, so t = Q / I',
          applies: d => !plateState(d).broken,
          work: d => {
            const Q = plateState(d).Q;
            return ['<b>' + eng(Q, 'C', 4) + '</b> / 1' + NBSP + 'µA, the time a steady microamp takes to deliver it', eng(Q / 1e-6, 's', 4)];
          } },
    Vbd: { given: false, tag: { full: 'interest' }, name: 'Breakdown voltage, roughly',
          eq: 'V<sub>breakdown</sub> &asymp; breakdown strength &times; d',
          work: d => {
            const D = dielOf(d.device), raw = D.kvmm * 1e3 * d.gap * 1e3, v = breakdownV(D, d.gap);
            return ['<b>' + D.kvmm + NBSP + 'kV/mm</b> &times; <b>' + trim(d.gap * 1e3, 3) + NBSP + 'mm</b>' +
                    (v > raw ? ' = ' + eng(raw, 'V', 3) + ', but air does not spark below about ' + eng(VARC, 'V', 2) : ''),
                    eng(v, 'V', 3)];
          } },
    Cpar: { given: true, tag: { intermediate: 'given' }, name: 'Capacitors in parallel',
          eq: 'C<sub>T</sub> = C<sub>1</sub> + C<sub>2</sub> + C<sub>3</sub>',
          applies: d => d.device !== 'series',
          work: d => d.device === 'mixed'
            ? ['<b>' + eng(d.C1, 'F', 3) + '</b> + <b>' + eng(d.C2, 'F', 3) + '</b>, the pair C1 and C2', eng(d.C1 + d.C2, 'F', 4)]
            : ['<b>' + eng(d.C1, 'F', 3) + '</b> + <b>' + eng(d.C2, 'F', 3) + '</b> + <b>' + eng(d.C3, 'F', 3) + '</b>',
               eng(d.C1 + d.C2 + d.C3, 'F', 4)] },
    Cser: { given: true, tag: { intermediate: 'given' }, name: 'Capacitors in series',
          eq: '1 / C<sub>T</sub> = 1 / C<sub>1</sub> + 1 / C<sub>2</sub> + 1 / C<sub>3</sub>',
          applies: d => d.device !== 'parallel',
          work: d => d.device === 'mixed'
            ? ['1 / (1 / <b>' + eng(d.Cpair, 'F', 4) + '</b> + 1 / <b>' + eng(d.C3, 'F', 3) + '</b>), the pair then C3',
               eng(1 / (1 / d.Cpair + 1 / d.C3), 'F', 4)]
            : ['1 / (1 / <b>' + eng(d.C1, 'F', 3) + '</b> + 1 / <b>' + eng(d.C2, 'F', 3) + '</b> + 1 / <b>' + eng(d.C3, 'F', 3) + '</b>)',
               eng(1 / (1 / d.C1 + 1 / d.C2 + 1 / d.C3), 'F', 4)] },
    Lser: { given: true, tag: { intermediate: 'given' }, name: 'Inductors in series',
          eq: 'L<sub>T</sub> = L<sub>1</sub> + L<sub>2</sub> + L<sub>3</sub>',
          applies: d => d.device !== 'parallel',
          work: d => d.device === 'mixed'
            ? ['<b>' + eng(d.Lpair, 'H', 4) + '</b> + <b>' + eng(d.L3, 'H', 3) + '</b>, the pair then L3', eng(d.Lpair + d.L3, 'H', 4)]
            : ['<b>' + eng(d.L1, 'H', 3) + '</b> + <b>' + eng(d.L2, 'H', 3) + '</b> + <b>' + eng(d.L3, 'H', 3) + '</b>',
               eng(d.L1 + d.L2 + d.L3, 'H', 4)] },
    Lpar: { given: true, tag: { intermediate: 'given' }, name: 'Inductors in parallel',
          eq: '1 / L<sub>T</sub> = 1 / L<sub>1</sub> + 1 / L<sub>2</sub> + 1 / L<sub>3</sub>',
          applies: d => d.device !== 'series',
          work: d => d.device === 'mixed'
            ? ['1 / (1 / <b>' + eng(d.L1, 'H', 3) + '</b> + 1 / <b>' + eng(d.L2, 'H', 3) + '</b>), the pair L1 and L2', eng(d.Lpair, 'H', 4)]
            : ['1 / (1 / <b>' + eng(d.L1, 'H', 3) + '</b> + 1 / <b>' + eng(d.L2, 'H', 3) + '</b> + 1 / <b>' + eng(d.L3, 'H', 3) + '</b>)',
               eng(1 / (1 / d.L1 + 1 / d.L2 + 1 / d.L3), 'H', 4)] },
    XC: { given: true, name: 'Reactance of the test capacitor', eq: 'X<sub>C</sub> = 1 / 2&pi;fC',
          work: d => ['1 / (2&pi; &times; <b>' + eng(d.fq, 'Hz', 3) + '</b> &times; <b>100' + NBSP + 'pF</b>)',
                      eng(1 / (2 * Math.PI * d.fq * LOSS_C), 'Ω', 3)] },
    esr: { given: false, tag: { full: 'interest' }, name: 'The loss as a resistance in series, polyester',
          eq: 'loss resistance = tan &delta; &times; X<sub>C</sub>',
          work: d => {
            const tan = LOSS.polyester.tan(d.fq), xc = 1 / (2 * Math.PI * d.fq * LOSS_C);
            return ['<b>' + trim(tan, 3) + '</b> &times; <b>' + eng(xc, 'Ω', 3) + '</b>', eng(tan * xc, 'Ω', 3)];
          } },
    heat: { given: false, tag: { full: 'interest' }, name: 'Heat in polyester film, against 1.8 ' + unitCase('MHz'),
          eq: 'with the same voltage, heat &prop; f &times; tan &delta;, where tan &delta; is the loss factor',
          work: d => ['(<b>' + eng(d.fq, 'Hz', 3) + '</b> / 1.8' + NBSP + 'MHz) &times; (<b>' +
                      trim(LOSS.polyester.tan(d.fq), 3) + '</b> / ' + trim(LOSS.polyester.tan(LOSS_REF), 3) + ')',
                      '&times; ' + trim(heatVsRef('polyester', d.fq), 3)] },
    Vpk: { given: true, name: 'The RMS voltage whose peaks reach the setting',
          eq: 'V<sub>rms</sub> = V<sub>peak</sub> / &radic;2',
          work: d => ['<b>' + eng(d.Vap, 'V', 3) + '</b> / 1.414', eng(d.Vap / Math.SQRT2, 'V', 3) + ' RMS'] },
    emf: { given: false, name: 'Induced voltage at the fastest point',
          eq: 'E = N &times; B &times; l &times; v',
          work: d => ['<b>' + d.turns + '</b> &times; <b>' + eng(d.B, 'T', 3) + '</b> &times; 0.1' + NBSP +
                      'm of wire in the field &times; <b>' + trim(d.ind.vpk, 3) + NBSP + 'm/s</b>', eng(d.ind.Epk, 'V', 3)] },
    tauLR: { given: true, name: 'Time constant of the coil circuit', eq: '&tau; = L / R',
          applies: d => d.device !== 'neon' && d.device !== 'bleed',
          work: d => ['<b>' + eng(d.L, 'H', 3) + '</b> / <b>' + eng(d.RL, 'Ω', 3) + '</b>', eng(d.L / d.RL, 's', 3)] },
    Ifin: { given: true, name: 'The current once it has settled (from V = IR)', eq: 'I = V / R',
          applies: d => d.device !== 'neon' && d.device !== 'bleed',
          work: d => d.device === 'reversed'
            ? ['only one diode drop reaches the coil: <b>0.7' + NBSP + 'V</b> / <b>' + eng(d.RL, 'Ω', 3) + '</b>', eng(VD / d.RL, 'A', 3)]
            : ['<b>' + eng(d.VB, 'V', 3) + '</b> / <b>' + eng(d.RL, 'Ω', 3) + '</b>', eng(d.VB / d.RL, 'A', 3)] },
    spike: { given: false, tag: { full: 'interest' }, name: 'Back EMF while the contacts spark',
          eq: 'back EMF = L &times; (change in current / time it takes)',
          applies: d => d.device === 'none' || d.device === 'reversed',
          work: d => {
            const m = coilModel(d.VB, d.RL, d.L, d.device);
            return ['<b>' + eng(d.L, 'H', 3) + '</b> &times; (<b>' + eng(m.I1, 'A', 3) + '</b> / <b>' +
                    eng(m.tEnd, 's', 3) + '</b>)', eng(d.L * m.I1 / m.tEnd, 'V', 3)];
          } },
    tauCR: { given: true, name: 'Time constant of the CR circuit', eq: '&tau; = C &times; R',
          applies: d => d.device === 'neon' || d.device === 'bleed',
          work: d => ['<b>' + eng(d.C, 'F', 3) + '</b> &times; <b>' + eng(d.R, 'Ω', 3) + '</b>', eng(d.C * d.R, 's', 3)] },
    p63: { given: false, name: 'After one time constant, and after five',
          eq: '63% of the change done, 37% left; settled after about 5&tau;',
          work: d => {
            if (d.device === 'bleed') {
              return ['0.368 &times; <b>' + eng(d.V, 'V', 4) + '</b> left after <b>' + eng(d.C * d.R, 's', 3) + '</b>',
                      eng(0.3679 * d.V, 'V', 3) + ', and ' + eng(d.V * Math.exp(-5), 'V', 3) + ' after ' + eng(5 * d.C * d.R, 's', 3)];
            }
            if (d.device === 'lr') {
              return ['0.632 &times; <b>' + eng(d.VB / d.RL, 'A', 3) + '</b> after <b>' + eng(d.L / d.RL, 's', 3) + '</b>',
                      eng(0.6321 * d.VB / d.RL, 'A', 3) + ', and settled after ' + eng(5 * d.L / d.RL, 's', 3)];
            }
            return ['0.632 &times; <b>' + eng(d.V, 'V', 4) + '</b> after <b>' + eng(d.C * d.R, 's', 3) + '</b>',
                    eng(0.6321 * d.V, 'V', 3) + ', and full after ' + eng(5 * d.C * d.R, 's', 3)];
          } },
    exact: { given: false, tag: { full: 'interest' }, name: 'Where 63% and five time constants come from',
          eq: 'fraction of the change done = 1 &minus; e<sup>&minus;t/&tau;</sup>',
          work: () => ['1 &minus; e<sup>&minus;1</sup> = 1 &minus; 0.368 at t = &tau;; 1 &minus; e<sup>&minus;5</sup> at 5&tau;',
                       '63.2% and 99.3%'] },
    neon: { given: false, tag: { full: 'interest' }, name: 'When the neon strikes, exactly',
          eq: 't = &minus;&tau; ln(1 &minus; V<sub>strike</sub> / V)',
          applies: d => d.device === 'neon' && d.V > d.VS,
          work: d => ['&minus;<b>' + eng(d.C * d.R, 's', 3) + '</b> &times; ln(1 &minus; <b>' + eng(d.VS, 'V', 3) +
                      '</b> / <b>' + eng(d.V, 'V', 3) + '</b>)',
                      eng(-d.C * d.R * Math.log(1 - d.VS / d.V), 's', 3) + ' = ' +
                      trim(-Math.log(1 - d.VS / d.V), 3) + '&nbsp;&tau;'] },
    wheeler: { given: false, name: 'Inductance of a single layer air coil, approximately',
          eq: 'L in µH = r&sup2;N&sup2; / (9r + 10l), with r and l in inches',
          work: d => ['<b>' + trim(d.coil.rIn, 3) + '</b>&sup2; &times; <b>' + d.Nt + '</b>&sup2; / (9 &times; ' +
                      trim(d.coil.rIn, 3) + ' + 10 &times; <b>' + trim(d.coil.lIn, 3) + '</b>)',
                      eng(d.coil.Lair, 'H', 3)] },
    slugK: { given: false, name: 'With the slug in', eq: 'L = L<sub>air</sub> &times; slug factor',
          work: d => ['<b>' + eng(d.coil.Lair, 'H', 3) + '</b> &times; <b>' + trim(d.coil.k, 3) + '</b>',
                      eng(d.coil.L, 'H', 3)] }
  },

  /* Words this bench introduces, defined where they are first used. */
  terms: {
    'capacitor': 'Two conducting plates separated by an insulator, which stores electric charge.',
    'dielectric': 'The insulating material between the plates of a capacitor: air, plastic film, mica, ceramic or glass.',
    'capacitance': 'How much charge a capacitor stores for each volt across it, measured in farads.',
    'farad': 'The unit of capacitance. A farad is very large, so practical values are microfarads (µF, millionths), nanofarads (nF, thousand-millionths) and picofarads (pF, million-millionths).',
    'relative permittivity': 'How many times more capacitance a dielectric gives than a vacuum, or very nearly air, between the same plates. Written εᵣ.',
    'coulomb': 'The unit of electric charge: the charge carried by one ampere flowing for one second.',
    'breakdown voltage': 'The voltage at which the dielectric fails and a spark punches through it.',
    'dielectric loss': 'Energy turned into heat inside the dielectric each time an alternating voltage reverses across it.',
    'electrolytic': 'A capacitor whose dielectric is an extremely thin oxide layer grown on one plate, which packs a large capacitance into a small case.',
    'polarised': 'Made to work only one way round, with a marked positive and negative lead.',
    'leakage current': 'The small current that flows through the dielectric of a capacitor even when it is connected correctly.',
    'working voltage': 'The voltage a capacitor is rated to stand continuously, peaks included, as marked on its case.',
    'magnetic field': 'The region around a magnet or a current where magnetic forces act, drawn as lines running from north to south.',
    'inductor': 'A coil of wire made to concentrate the magnetic field of the current through it.',
    'inductance': 'The ability of a coil to store energy in its magnetic field, measured in henries. It depends on the number of turns and the dimensions of the coil.',
    'henry': 'The unit of inductance. RF coils are microhenries (µH); audio and smoothing chokes are millihenries (mH) or henries.',
    'induced voltage': 'A voltage produced in a conductor by moving it through a magnetic field, or by a changing field around it.',
    'self-inductance': 'A coil’s own changing magnetic field inducing a voltage in that same coil.',
    'back EMF': 'The voltage self-inductance produces. It always opposes the change in current that caused it.',
    'flyback diode': 'A diode across a coil, reverse biased in normal use, which gives the coil current a path when it is switched off.',
    'time constant': 'The time τ a CR or LR circuit takes to complete 63% of any change: τ = C × R, or τ = L ÷ R.',
    'permeability': 'How strongly a material concentrates a magnetic field. Ferrite and iron dust have a high permeability; air has a low one.',
    'slug tuning': 'Adjusting a coil’s inductance by screwing a ferrite core, the slug, further into or out of its former.',
    'bleed resistor': 'A resistor across a smoothing capacitor that discharges it after the power is switched off. Also called a bleeder.'
  },

  /* ---- how each panel draws itself ---- */
  panels: {

    /* 2D1: the plates, drawn edge on, with the circuit beside them. */
    plates(ctx) {
      const { p, d, t, level, ro, values } = ctx;
      const full = level === 'full';
      const D = dielOf(p.topology);
      const C = d.Cair * D.er, C0 = EPS0 * 100e-4 / 1e-3;
      const V = full ? values.Vc : 100;
      const Q = C * V, Vbd = breakdownV(D, values.gap);
      const broken = full && V > Vbd;
      const h = hues(t);

      const { c, W, H } = canvas2d(p.graph);
      // room below the plates for the dielectric's name and, past breakdown,
      // a line saying what has happened
      const cx = Math.round(W * 0.5), cy = H / 2 - 4;
      const lg = (x, a, b) => (Math.log(x) - Math.log(a)) / (Math.log(b) - Math.log(a));
      const hp = 36 + (H - 140) * lg(values.A, 1, 900);
      const gp = 10 + 100 * lg(values.gap, 5e-5, 1e-2);
      const xl = cx - gp / 2, xr = cx + gp / 2;
      // the dielectric, then the plates
      c.fillStyle = D.er > 1 ? h.capFill : 'transparent';
      c.fillRect(xl, cy - hp / 2, gp, hp);
      c.fillStyle = t.wire;
      c.fillRect(xl - 7, cy - hp / 2, 7, hp);
      c.fillRect(xr, cy - hp / 2, 7, hp);
      // leads out to the battery
      c.strokeStyle = t.wire; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(xl - 7, cy); c.lineTo(xl - 50, cy);
      c.moveTo(xr + 7, cy); c.lineTo(xr + 50, cy); c.stroke();
      // the field, from the positive plate to the negative
      if (gp >= 16 && !broken) {
        c.strokeStyle = h.volt; c.fillStyle = h.volt; c.lineWidth = 1.2;
        const n = Math.max(2, Math.min(6, Math.round(hp / 26)));
        for (let i = 0; i < n; i++) {
          const y = cy - hp / 2 + hp * (i + 0.5) / n;
          c.beginPath(); c.moveTo(xl + 3, y); c.lineTo(xr - 6, y); c.stroke();
          c.beginPath(); c.moveTo(xr - 3, y); c.lineTo(xr - 9, y - 3.5); c.lineTo(xr - 9, y + 3.5);
          c.closePath(); c.fill();
        }
      }
      // the charges: more of them for more charge, on a log scale; none once
      // a spark has joined the plates
      const nq = broken ? 0 : Math.max(1, Math.min(14, Math.round(5 + 3.2 * Math.log10(Q / (C0 * 100)))));
      c.font = font(16, 700); c.fillStyle = h.ampInk; c.textBaseline = 'middle';
      for (let i = 0; i < nq; i++) {
        const y = cy - hp / 2 + hp * (i + 0.5) / nq;
        c.textAlign = 'right'; c.fillText('+', xl - 9, y);
        c.textAlign = 'left'; c.fillText('−', xr + 9, y);
      }
      if (broken) {
        c.save(); c.translate(0, 0);
        const s = c; s.strokeStyle = h.spark; s.lineWidth = 2.4; s.shadowColor = h.spark; s.shadowBlur = 10;
        s.beginPath();
        for (let i = 0; i <= 6; i++) {
          const x = xl + gp * i / 6, y = cy + (i % 2 ? -7 : 7) * (i && i < 6 ? 1 : 0);
          i ? s.lineTo(x, y) : s.moveTo(x, y);
        }
        s.stroke(); c.restore();
      }
      // what is what
      c.font = font(15, 600); c.fillStyle = t.soft; c.textBaseline = 'alphabetic';
      c.textAlign = 'center';
      c.fillText('gap ' + eng(values.gap, 'm', 3), cx, cy - hp / 2 - 10);
      c.fillText(D.name + (full ? ', εᵣ = ' + D.er : ''), cx, cy + hp / 2 + 24);
      c.textAlign = 'right';
      // left of the column of + signs, and clear above the lead
      c.fillText('area ' + eng(values.A, 'cm²', 3), xl - 28, cy - 14);
      if (broken) {
        c.fillStyle = t.noteInk; c.textAlign = 'center';
        c.fillText('a spark punches through the dielectric', cx, cy + hp / 2 + 44);
      }

      p.legend.innerHTML = (broken ? '' : ctx.swatch(h.ampInk, 'Charge on the plates, more signs for more charge')) +
        (gp >= 16 && !broken ? ctx.swatch(h.volt, 'Electric field, + to −') : '') +
        (D.er > 1 ? ctx.swatch(h.cap, 'The dielectric') : '');
      p.schemNote.textContent = broken
        ? 'past breakdown: the dielectric has failed, and a spark joins the plates'
        : 'connected and steady: the capacitor is charged and no current flows';
      const rows = full ? [
        ['Capacitance', eng(C, 'F', 3), true],
        ['Charge, Q = C × V', broken ? '<span style="color:' + t.noteInk + '">none held: shorted</span>' : eng(Q, 'C', 3)],
        ['Breaks down at about', eng(Vbd, 'V', 2)],
        ['At this voltage', broken ? '<span style="color:' + t.noteInk + '">broken down</span>' : 'holding']
      ] : [
        ['Capacitance', eng(C, 'F', 3), true],
        ['Compared with the start', '× ' + trim(C / C0, 3)],
        ['Area, against the start', '× ' + trim(values.A / 100, 3)],
        ['Gap, against the start', '× ' + trim(values.gap / 1e-3, 3) + ', so C ÷ ' + trim(values.gap / 1e-3, 3)],
        ['Dielectric, against air', '× ' + D.er]
      ];
      p.readouts.innerHTML = ro(rows);
      return { layout: plateLayout(V, { C }, full, broken) };
    },

    /* 2D2 and 2D5 Intermediate: three parts, combined, with a bar for each. */
    combosC(ctx) { return BENCH.combos(ctx, 'C'); },
    combosL(ctx) { return BENCH.combos(ctx, 'L'); },

    /*
     * 2D2 Full: the loss factor of four dielectrics against frequency. It is
     * the share of the energy lost in each cycle: flat for air, mica and C0G,
     * rising for plastic film. The heat at the same voltage, which rises with
     * frequency in all of them, is given against its figure at 1.8 MHz.
     */
    losses(ctx) {
      const { p, t, values, ro, M, swatch } = ctx;
      const h = hues(t), f = values.fq;
      const lf = Math.log10;
      const xs = [lf(3e4), lf(3e9)];
      const keys = ['polyester', 'mica', 'ceramic', 'air'];
      // all four are one quantity, the share of each cycle lost as heat, so
      // all are power red in its full colour: polyester solid and heavier,
      // the low loss three told apart by their dashes and named in ink
      const style = {
        // labelled at the left, clear of the cursor's frequency at the foot
        polyester: { colour: h.power, width: 3, labelAt: 40 },
        mica: { colour: h.power, width: 2, dash: DASH.dash, labelAt: 40, labelColour: t.soft },
        ceramic: { colour: h.power, width: 2, dash: DASH.dot, labelAt: 40, labelBelow: true, labelColour: t.soft },
        air: { colour: h.power, width: 2, dash: DASH.dashdot, labelAt: 160, labelColour: t.soft }
      };
      const traces = keys.map(k => {
        const pts = [];
        for (let i = 0; i < 300; i++) {
          const x = xs[0] + (xs[1] - xs[0]) * i / 299;
          pts.push({ x, y: lf(LOSS[k].tan(Math.pow(10, x))) });
        }
        return Object.assign({ pts, label: LOSS[k].name.replace(' film', '').replace(' ceramic', '') }, style[k]);
      }).reverse();
      const wide = p.graph.clientWidth > 520;
      chart(p.graph, {
        x: xs,
        xTicks: (wide ? [1e5, 1e6, 1e7, 1e8, 1e9] : [1e5, 1e7, 1e9]).map(v => ({ v: lf(v), label: eng(v, 'Hz', 2) })),
        y: { min: -5.5, max: 0, ticks: [-5, -4, -3, -2, -1, 0].map(v => ({ v, label: trim(Math.pow(10, v), 1) })) },
        bands: [[3e4, 3e5, 'LF'], [3e5, 3e6, 'MF'], [3e6, 3e7, 'HF'], [3e7, 3e8, 'VHF'], [3e8, 3e9, 'UHF']]
          .map(([a, b, l], i) => ({ from: lf(a), to: lf(b), colour: i % 2 ? t.mark : 'transparent', alpha: 0.08, label: l })),
        traces,
        cursor: { x: lf(f), colour: t.mark, label: eng(f, 'Hz', 3),
                  dots: [{ y: lf(LOSS.polyester.tan(f)), colour: h.power }] }
      }, t);
      p.legend.innerHTML = swatch(h.power, 'Loss factor of polyester film: the share lost in each cycle') +
        swatch(dashed(h.power, DASH.dash), 'Mica, dashed') + swatch(dashed(h.power, DASH.dot), 'C0G ceramic, dotted') +
        swatch(dashed(h.power, DASH.dashdot), 'Air, dash and dot') +
        swatch(t.mark, 'The frequency set');
      const tan = LOSS.polyester.tan(f), esr = tan / (2 * Math.PI * f * LOSS_C);
      p.readouts.innerHTML = ro([
        ['Polyester film, loss factor', trim(tan, 3), true],
        ['Mica', trim(LOSS.mica.tan(f), 3)],
        ['C0G ceramic', trim(LOSS.ceramic.tan(f), 3)],
        ['Air', trim(LOSS.air.tan(f), 3)],
        ['Polyester heat, against 1.8' + NBSP + unitCase('MHz'), '× ' + trim(heatVsRef('polyester', f), 3)],
        ['Mica heat, against 1.8' + NBSP + unitCase('MHz'), '× ' + trim(heatVsRef('mica', f), 3)]
      ]);
      p.fAnim = f;
      const net = 'V1 in 0 141.4\nR1 in a ' + window.Fmt.sci(esr) + '\nC1 a 0 100p';
      return { layout: lossLayout(esr), circuit: M.parseNetlist(net) };
    },

    /* 2D3 Intermediate: an electrolytic the right way round, or reversed. */
    polarity(ctx) {
      const { p, t, values, ro, swatch } = ctx;
      const h = hues(t), rev = p.topology === 'reversed', V = values.Vel;
      const here = electrolytic(V, rev);
      const lf = Math.log10;
      const curve = r => {
        const pts = [];
        for (let i = 0; i <= 200; i++) { const v = 35 * i / 200; pts.push({ x: v, y: lf(Math.max(1e-7, electrolytic(v, r).i)) }); }
        return pts;
      };
      chart(p.graph, {
        x: [0, 35],
        xTicks: [0, 5, 10, 15, 20, 25, 30, 35].map(v => ({ v, label: v + NBSP + 'V' }))
          .filter((k, i) => p.graph.clientWidth > 520 || i % 2 === 0),
        y: { min: -7, max: 1, ticks: [-7, -5, -3, -1, 1].map(v => ({ v, label: eng(Math.pow(10, v), 'A', 1) })) },
        // both are current: the other way round is dashed
        traces: [
          { pts: curve(!rev), colour: h.amp, width: 1.8, dash: true, labelColour: t.soft,
            label: rev ? 'right way' : 'reversed', labelAt: rev ? 200 : 60 },
          { pts: curve(rev), colour: h.amp, width: 3, labelColour: h.ampInk,
            label: rev ? 'reversed' : 'right way', labelAt: rev ? 60 : 200 }
        ],
        vlines: [{ x: EL_RATE, colour: t.mark, label: 'rated 25 V', bottom: true }],
        cursor: { x: V, colour: t.mark, dots: [{ y: lf(Math.max(1e-7, here.i)), colour: h.amp }] }
      }, t);
      p.legend.innerHTML = swatch(h.amp, rev ? 'Current, reversed' : 'Current, right way round') +
        swatch(dashed(h.amp), 'The other way round, dashed, for comparison') +
        swatch(t.mark, 'The rating');
      // what it says follows the current and the heat, not just the connection
      const P = here.vcap * here.i;
      const warn = txt => '<span style="color:' + t.noteInk + '">' + txt + '</span>';
      const state = rev
        ? (P < 0.05 ? 'reversed: the leakage is rising'
           : P < 1 ? warn('reversed: warming up') : warn('overheating: may vent or burst'))
        : V <= EL_RATE ? 'normal: a tiny leakage current'
          : P < 0.5 ? 'over its rating: the leakage is climbing' : warn('over its rating: warming up');
      p.readouts.innerHTML = ro([
        ['Current', eng(here.i, 'A', 3), true],
        ['Heat in the capacitor', eng(P, 'W', 2)],
        ['State', state]
      ]);
      p.schemNote.textContent = '';
      // the speed is scaled against the largest current the reversed capacitor
      // can draw, compressed so that both microamps and amperes show
      const iMax = electrolytic(35, true).i;
      const note = here.i < 2e-4 ? 'a current of microamps: the charge barely moves'
        : here.i < 1e-3 ? 'hundreds of microamps: the charge creeps round'
        : here.i < 0.1 ? 'milliamps, far more than the usual leakage: the charge moves round'
        : 'a large current: the charge races round';
      return { layout: polarLayout(V, rev),
               flow: { mode: 'dc', currents: { R1: here.i }, iMax, compress: true, note } };
    },

    /* 2D3 Full: the voltage across a capacitor against its rating. */
    breakdown(ctx) {
      const { p, t, values, ro, swatch } = ctx;
      const h = hues(t), V = values.Vap, Vr = values.Vr, Vfail = 2 * Vr;
      const broken = V >= Vfail, over = V > Vr;
      const { c, W, H } = canvas2d(p.graph);
      const x0 = 30, x1 = W - 30, y = 110, bh = 30;
      const top = Math.max(2.6 * Vr, 1.12 * V);
      const X = v => x0 + (x1 - x0) * v / top;
      // the zones: within the rating, over it, beyond where this one fails
      const zone = (a, b, col, alpha) => { c.globalAlpha = alpha; c.fillStyle = col; c.fillRect(X(a), y, X(b) - X(a), bh); c.globalAlpha = 1; };
      // no green or orange here, which mean inductance and current: within
      // the rating is plain, over it a pale warning, past failure a strong one
      zone(0, Vr, t.mark, 0.1);
      zone(Vr, Vfail, t.note, 0.28);
      zone(Vfail, top, t.note, 0.75);
      c.strokeStyle = t.rule || t.grid; c.lineWidth = 1; c.strokeRect(x0, y, x1 - x0, bh);
      c.font = font(15, 600); c.textBaseline = 'middle'; c.fillStyle = t.ink;
      c.textAlign = 'center';
      const mid = (a, b) => (X(a) + X(b)) / 2;
      if (X(Vr) - X(0) > 100) c.fillText('within rating', mid(0, Vr), y + bh / 2);
      if (X(Vfail) - X(Vr) > 60) c.fillText('over it', mid(Vr, Vfail), y + bh / 2);
      // on the strong yellow, dark text in either theme
      c.fillStyle = '#1A1A1A';
      if (X(top) - X(Vfail) > 50) c.fillText('fails', mid(Vfail, top), y + bh / 2);
      // the rating as a dashed ink line, so it cannot be mistaken for a quantity
      c.save(); c.setLineDash([4, 3]); c.strokeStyle = t.ink; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(X(Vr), y - 4); c.lineTo(X(Vr), y + bh + 4); c.stroke(); c.restore();
      c.textBaseline = 'bottom';
      c.fillStyle = t.ink; c.fillText('rating ' + eng(Vr, 'V', 3), X(Vr), y - 6);
      c.fillStyle = h.warn;
      if (X(Vfail) - X(Vr) > 120) c.fillText('this one fails ' + eng(Vfail, 'V', 3), X(Vfail), y - 6);
      else c.fillText('fails ' + eng(Vfail, 'V', 3), X(Vfail), y - 28);
      // the voltage applied
      c.fillStyle = h.volt; c.strokeStyle = h.volt; c.lineWidth = 2.5;
      const xv = Math.min(x1, X(V));
      c.beginPath(); c.moveTo(xv, y - 2); c.lineTo(xv, y + bh + 2); c.stroke();
      c.beginPath(); c.moveTo(xv, y + bh + 2); c.lineTo(xv - 6, y + bh + 30); c.lineTo(xv + 6, y + bh + 30); c.closePath(); c.fill();
      c.textBaseline = 'top';
      c.textAlign = xv > W * 0.7 ? 'right' : 'left';
      c.fillText(eng(V, 'V', 3) + ' applied', xv + (xv > W * 0.7 ? -10 : 10), y + bh + 32);
      p.legend.innerHTML = swatch(h.volt, 'Voltage applied to the capacitor') + swatch(dashed(t.ink), 'Its rating, dashed') +
        swatch(alpha(t.note, 0.45), 'Over its rating') + swatch(t.note, 'Where this one fails, twice its rating');
      p.readouts.innerHTML = ro([
        ['Applied voltage', eng(V, 'V', 3), true],
        // once punctured the capacitor is a short, and the resistor takes it all
        ['Across it', broken ? '≈' + NBSP + '0' + NBSP + 'V (the 1' + NBSP + 'kΩ takes it all)' : eng(V, 'V', 3)],
        ['Rating', eng(Vr, 'V', 3)],
        ['Margin', over ? '<span style="color:' + t.noteInk + '">' + eng(V - Vr, 'V', 3) + ' over</span>'
                        : eng(Vr - V, 'V', 3) + ' to spare'],
        ['State', broken ? '<span style="color:' + t.noteInk + '">broken down: now a short circuit</span>'
                 : over ? 'over its rating: nothing guaranteed' : 'within its rating']
      ]);
      p.schemNote.textContent = broken ? '' : 'steady: the capacitor is charged and no current flows';
      const lay = ratingLayout(V, broken);
      return broken
        ? { layout: lay, flow: { mode: 'dc', currents: { R1: V / 1000 },
                                 note: 'the dielectric is punctured: current flows straight through' } }
        : { layout: lay };
    },

    /* 2D4 Intermediate: a conductor moving up and down through a field. */
    induction(ctx) {
      const { p, d, t, values, ro, swatch } = ctx;
      const h = hues(t), m = d.ind;
      const T = 2, tc = cursorX(p, 0, T, 1);
      const now = m.at(tc);
      const pos = [], emf = [];
      for (let i = 0; i <= 400; i++) {
        const tt = T * i / 400, a = m.at(tt);
        pos.push({ x: tt, y: a.y * 100 });
        emf.push({ x: tt, y: a.e });
      }
      const Emax = Math.max(m.Epk, 1e-6) * 1.25;
      chart(p.graph, {
        x: [0, T],
        xTicks: [0, 0.5, 1, 1.5, 2].map(v => ({ v, label: trim(v, 2) + NBSP + 's' })),
        y: { min: -2.5, max: 2.5, ticks: [-2, -1, 0, 1, 2].map(v => ({ v, label: signed(v) + NBSP + 'cm' })) },
        y2: { min: -Emax, max: Emax, ticks: [-2, -1, 0, 1, 2].map(k => ({ v: k * Emax / 2.5, label: eng(k * Emax / 2.5, 'V', 2) })) },
        // the height is not one of the course's quantities, so it is neutral
        traces: [{ pts: pos, colour: t.mark, width: 1.8, axis: 'left', dash: true },
                 { pts: emf, colour: h.volt, width: 2.6, axis: 'right' }],
        cursor: { x: tc, colour: t.mark, label: trim(tc, 3) + NBSP + 's',
                  dots: [{ y: now.y * 100, axis: 'left', colour: t.mark }, { y: now.e, axis: 'right', colour: h.volt }] }
      }, t);
      p.legend.innerHTML = swatch(dashed(t.mark), 'Height of the conductor, dashed, left scale') +
        swatch(h.volt, 'Voltage induced across it, right scale') + swatch(t.mark, 'Drag to choose a moment');

      // the conductor between the poles at that moment, seen end on
      const { c, W, H } = canvas2d(p.schem);
      const px = 40, cy = H / 2 - 6, gapW = W - 2 * px - 60;
      const lx = px, rx = W - px - 60;
      c.fillStyle = isDark(t) ? '#3A4652' : '#D5DDE4'; c.fillRect(lx - 28, cy - 70, 28, 140); c.fillRect(rx, cy - 70, 28, 140);
      c.font = font(18, 700); c.fillStyle = t.ink; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('N', lx - 14, cy); c.fillText('S', rx + 14, cy);
      c.strokeStyle = t.faint; c.lineWidth = 1; c.setLineDash([3, 4]);
      for (let k = -2; k <= 2; k++) {
        const yy = cy + k * 26;
        c.beginPath(); c.moveTo(lx + 4, yy); c.lineTo(rx - 4, yy); c.stroke();
      }
      c.setLineDash([]);
      const ccx = (lx + rx) / 2, ccy = cy - now.y / SWING * 52;
      c.beginPath(); c.arc(ccx, ccy, 11, 0, Math.PI * 2);
      c.fillStyle = t.surface; c.fill(); c.strokeStyle = t.ink; c.lineWidth = 1.8; c.stroke();
      // the way the induced voltage drives current along the wire, if its ends
      // are joined through the meter: into the page moving up, out moving down
      const into = now.v > 0;
      if (Math.abs(now.v) > 0.05 * m.vpk) {
        c.strokeStyle = h.ampInk; c.fillStyle = h.ampInk; c.lineWidth = 2;
        if (into) { c.beginPath(); c.moveTo(ccx - 6, ccy - 6); c.lineTo(ccx + 6, ccy + 6); c.moveTo(ccx + 6, ccy - 6); c.lineTo(ccx - 6, ccy + 6); c.stroke(); }
        else { c.beginPath(); c.arc(ccx, ccy, 3.2, 0, Math.PI * 2); c.fill(); }
      }
      // velocity arrow
      const len = 40 * now.v / m.vpk;
      if (Math.abs(len) > 3) {
        c.strokeStyle = t.mark; c.fillStyle = t.mark; c.lineWidth = 2;
        const ax = ccx + 26, y0 = ccy, y1 = ccy - len;
        c.beginPath(); c.moveTo(ax, y0); c.lineTo(ax, y1); c.stroke();
        const dir = Math.sign(len);
        c.beginPath(); c.moveTo(ax, y1 - dir * 7); c.lineTo(ax - 5, y1 + dir * 1); c.lineTo(ax + 5, y1 + dir * 1); c.closePath(); c.fill();
      }
      // a centre-zero meter
      const mx = W - 34, my = cy + 10, mr = 24;
      c.beginPath(); c.arc(mx, my, mr, Math.PI, 0); c.closePath();
      c.fillStyle = t.surface; c.fill(); c.strokeStyle = t.wire; c.lineWidth = 1.4; c.stroke();
      const ang = -Math.PI / 2 + (now.e / Math.max(1e-12, m.Epk)) * 1.1;
      c.strokeStyle = h.volt; c.lineWidth = 2;
      c.beginPath(); c.moveTo(mx, my); c.lineTo(mx + Math.cos(ang) * (mr - 4), my + Math.sin(ang) * (mr - 4)); c.stroke();
      c.font = font(15, 600); c.fillStyle = t.soft; c.textAlign = 'center'; c.textBaseline = 'top';
      // three short lines under the meter, clear of the S pole to its left
      ['meter', 'across', 'its ends'].forEach((s, i) => c.fillText(s, mx, my + 6 + 18 * i));
      c.textBaseline = 'alphabetic';
      c.fillStyle = Math.abs(now.v) < 0.05 * m.vpk ? t.soft : t.mark;
      c.fillText(Math.abs(now.v) < 0.05 * m.vpk ? 'turning round' : (into ? 'moving up' : 'moving down'), ccx, H - 14);
      p.schemNote.textContent = '';

      p.readouts.innerHTML = ro([
        ['Peak voltage', eng(m.Epk, 'V', 3), true],
        ['Height there', signed((Math.round(now.y * 1000) / 10).toFixed(1).replace('-0.0', '0.0')) + NBSP + 'cm'],
        ['Speed there', Math.abs(now.v) < 1e-3 * m.vpk ? '0' + NBSP + 'm/s' : trim(Math.abs(now.v), 2) + NBSP + 'm/s ' + (now.v > 0 ? 'up' : 'down')],
        ['Voltage there', Math.abs(now.e) < 1e-3 * m.Epk ? '0' + NBSP + 'V' : eng(now.e, 'V', 3)]
      ]);
      return {};
    },

    /* 2D4 Full: switch a coil off, with and without a flyback diode. */
    backemf(ctx) {
      const { p, t, values, ro, swatch } = ctx;
      const h = hues(t), kind = p.topology;
      const V = values.VB, R = values.RL, L = values.L;
      const m = coilModel(V, R, L, kind);
      const tau = m.tau;
      // the plot, in time constants, with the spark resolved exactly
      const xs = [];
      for (let i = 0; i <= 600; i++) xs.push(12 * tau * i / 600);
      const e = Math.min(m.tEnd, tau) * 1e-3;
      xs.push(m.Ton - 1e-12 * tau, m.Ton + 1e-9 * tau, m.Ton + m.tEnd - 1e-9 * tau, m.Ton + m.tEnd + e);
      xs.sort((a, b) => a - b);
      const cur = [], vsw = [];
      let vmax = V;
      for (const tt of xs) {
        const a = m.at(tt);
        cur.push({ x: tt / tau, y: a.i });
        vsw.push({ x: tt / tau, y: a.vsw });
        vmax = Math.max(vmax, a.vsw);
      }
      const tc = cursorX(p, 0, 12 * tau, 1.0 * tau);
      const now = m.at(tc);
      const imax = Math.max(m.Ifin, 1e-9) * 1.2, vtop = vmax * 1.15;
      chart(p.graph, {
        x: [0, 12],
        xTicks: [0, 2, 4, 6, 8, 10, 12].map(v => ({ v, label: v ? v + 'τ' : '0' })),
        y: { min: 0, max: imax, ticks: evenTicks(0, imax, 4, v => eng(v, 'A', 2)) },
        y2: { min: 0, max: vtop, ticks: evenTicks(0, vtop, 4, v => eng(v, 'V', 2)) },
        traces: [{ pts: vsw, colour: h.volt, width: 2.4, axis: 'right' },
                 { pts: cur, colour: h.amp, width: 2.6, axis: 'left', fill: t.iFill }],
        vlines: [{ x: 6, colour: t.mark, label: 'switch opens', side: 'left', row: 0 }],
        cursor: { x: tc / tau, colour: t.mark, label: trim(tc / tau, 2) + 'τ',
                  dots: [{ y: now.i, axis: 'left', colour: h.amp }, { y: now.vsw, axis: 'right', colour: h.volt }] }
      }, t);
      p.legend.innerHTML = swatch(h.amp, 'Coil current, left scale') +
        swatch(h.volt, 'Voltage across the switch contacts, right scale') + swatch(t.mark, 'Drag to read');
      const spikeRow = kind === 'diode'
        ? ['Contacts see at switch-off', eng(V + VD, 'V', 3) + ', supply plus one diode drop']
        : ['Contacts see at switch-off', '<span style="color:' + h.warn + '">about ' + eng(VARC, 'V', 2) + ': a spark</span>'];
      const rows = [
        ['Time constant, L ÷ R', eng(tau, 's', 3), true],
        ['Current settles at', eng(m.Ifin, 'A', 3)],
        spikeRow,
        kind === 'reversed' ? ['Diode current, switch closed', '<span style="color:' + h.warn + '">' + eng(m.Ishort, 'A', 2) + ': a near short</span>']
                            : ['Current gone after switch-off', eng(m.tEnd, 's', 3)]
      ];
      p.readouts.innerHTML = ro(rows);

      // the drawing follows the moment: the switch, the spark, the back EMF
      const base = coilLayout(kind, { R, L }, V);
      const show = Math.max(m.tEnd, 0.03 * m.duration);
      base.frame = tt => {
        const a = m.at(tt), off = !a.on;
        const lay = withEls(base, { S1: { open: off } });
        const notes = [];
        const rising = a.on && a.vL > 0.05 * (kind === 'reversed' ? VD : V);
        const falling = off && a.i > 1e-3 * m.Ifin;
        if (rising || falling) {
          notes.push({ at: [125, 104], text: rising ? '+' : '−', colour: 'v', size: 18 },
                     { at: [125, 142], text: rising ? '−' : '+', colour: 'v', size: 18 });
        }
        if (off && kind !== 'diode' && tt - m.Ton < show && m.I1 > 0) {
          lay.paint = (c, u, tk) => spark(c, 48, 28, 72, 28, tk);
          notes.push({ at: [60, 48], text: 'spark', colour: 'warn' });
        }
        if (kind === 'reversed' && a.on) notes.push({ at: [86, 122], text: 'short', colour: 'warn', align: 'right' });
        lay.notes = notes;
        return lay;
      };
      const fn = BENCH.coilCurrents(m);
      return { layout: base,
               flow: { mode: 'time', duration: m.duration, currents: fn, compress: kind === 'reversed',
                       iMax: kind === 'reversed' ? m.Ishort : m.Ifin,
                       label: tt => tt < m.Ton ? trim(tt / tau, 2) + NBSP + 'τ after the switch closes'
                                               : trim((tt - m.Ton) / tau, 2) + NBSP + 'τ after it opens' } };
    },

    /* 2D6: a coil you can wind, with a slug. */
    coil(ctx) {
      const { p, d, t, values, ro, swatch } = ctx;
      const h = hues(t), cl = d.coil;
      // inductance against turns, air and with the slug as set
      const air = [], slug = [];
      let top = 0;
      for (let n = 2; n <= 60; n++) {
        const a = coil(n, values.dia, values.pitch, values.slug);
        air.push({ x: n, y: a.Lair * 1e6 }); slug.push({ x: n, y: a.L * 1e6 });
        top = Math.max(top, a.L * 1e6);
      }
      top *= 1.1;
      chart(p.graph, {
        x: [2, 60],
        xTicks: [2, 10, 20, 30, 40, 50, 60].map(v => ({ v, label: String(v) })).filter((k, i) => p.graph.clientWidth > 520 || i % 2 === 0),
        y: { min: 0, max: top, ticks: evenTicks(0, top, 4, v => eng(v * 1e-6, 'H', 2)) },
        traces: values.slug > 0
          // both inductance: with no slug, dashed
          ? [{ pts: air, colour: h.ind, width: 1.8, dash: true, labelColour: t.soft,
               label: 'slug out', labelAt: 55 },
             { pts: slug, colour: h.ind, width: 2.8, label: 'slug in ' + Math.round(values.slug) + '%', labelAt: 40 }]
          : [{ pts: air, colour: h.ind, width: 2.8 }],
        vlines: [],
        cursor: { x: values.Nt, colour: t.mark, label: values.Nt + ' turns', dots: [{ y: cl.L * 1e6, colour: h.ind }] }
      }, t);
      p.legend.innerHTML = swatch(h.ind, 'Inductance against turns, for this diameter and spacing') +
        (values.slug > 0 ? swatch(dashed(h.ind), 'The same coil with no slug, dashed') : '') +
        swatch(t.mark, 'The turns set');

      // the coil itself, side on
      const { c, W, H } = canvas2d(p.schem);
      const len = cl.length, dia = values.dia;
      const sc = Math.min((W - 70) / Math.max(len, 0.03), (H - 110) / dia, 9000);
      const cx = W / 2, cy = H / 2 - 10;
      const Lp = len * sc, Dp = dia * sc;
      const x0 = cx - Lp / 2;
      // the former
      c.fillStyle = isDark(t) ? '#2B3640' : '#E9EEF2';
      c.fillRect(x0 - 14, cy - Dp / 2 + 3, Lp + 28, Dp - 6);
      // the slug, as long as the winding, entering from the right: its tip
      // reaches the middle of the winding at 50%, where the inductance climbs
      // fastest, and it fills the winding at 100%
      if (values.slug > 0) {
        const sl = Math.max(16, Lp);
        const sx = x0 + (1 - values.slug / 100) * Lp;
        c.fillStyle = isDark(t) ? '#56606B' : '#5B646E';
        c.fillRect(sx, cy - Dp / 2 + 7, sl, Dp - 14);
      }
      // the turns: copper fronts, darker backs
      const N = values.Nt, step = Lp / Math.max(1, N - 1 + 1e-9);
      c.lineWidth = Math.max(1.2, Math.min(3, step * 0.45));
      for (let i = 0; i < N; i++) {
        const x = N > 1 ? x0 + step * i : cx;
        c.strokeStyle = h.ind;
        c.beginPath(); c.moveTo(x - step * 0.25, cy - Dp / 2); c.lineTo(x + step * 0.25, cy + Dp / 2); c.stroke();
      }
      c.font = font(15, 600); c.fillStyle = t.soft; c.textAlign = 'center'; c.textBaseline = 'top';
      c.fillText(N + ' turns, ' + eng(len, 'm', 3) + ' long', cx, cy + Dp / 2 + 12);
      c.textBaseline = 'bottom';
      c.fillText('diameter ' + eng(dia, 'm', 3), cx, cy - Dp / 2 - 8);
      if (values.slug > 0) {
        c.textAlign = 'right'; c.textBaseline = 'top';
        c.fillText('ferrite slug', W - 8, cy + Dp / 2 + 34);
      }
      p.schemNote.textContent = '';
      p.readouts.innerHTML = ro([
        ['Inductance', eng(cl.L, 'H', 3), true],
        ['Without the slug', eng(cl.Lair, 'H', 3)],
        ['The slug multiplies it by', trim(cl.k, 3)],
        ['Compared with the start', '× ' + trim(cl.L / coil(20, 12e-3, 1e-3, 0).L, 3)]
      ]);
      return {};
    },

    /* 2D7: charge with a neon, discharge through a bleeder, LR rise and fall. */
    timeconst(ctx) {
      const { p, t, values, ro, swatch } = ctx;
      const h = hues(t), view = p.topology;
      // only the sliders this view uses
      const uses = { neon: ['V', 'R', 'C', 'VS'], bleed: ['V', 'R', 'C'], lr: ['VB', 'L', 'RL'] }[view];
      if (p.ctrls) p.ctrls.querySelectorAll('.ctrl').forEach(b => { if (!b.hidden) b.hidden = uses.indexOf(b.dataset.ctrl) < 0; });
      const wide = p.graph.clientWidth > 520;
      // the cursor names its own moment, so a line it sits on drops its label
      const near1 = x => Math.abs(x - 1) < 0.08;
      const tauTicks = n => { const out = []; for (let k = 0; k <= n; k++) if (wide || k % 2 === 0) out.push({ v: k, label: k ? k + 'τ' : '0' }); return out; };

      if (view === 'lr') {
        const V = values.VB, R = values.RL, L = values.L;
        const m = lrModel(V, R, L), tau = m.tau;
        const cur = [], vr = [], vl = [];
        const xs = [];
        for (let i = 0; i <= 480; i++) xs.push(12 * tau * i / 480);
        xs.push(m.Ton - 1e-9 * tau, m.Ton + 1e-9 * tau); xs.sort((a, b) => a - b);
        for (const tt of xs) {
          const a = m.at(tt);
          cur.push({ x: tt / tau, y: a.i }); vr.push({ x: tt / tau, y: a.vR }); vl.push({ x: tt / tau, y: a.vL });
        }
        const tc = cursorX(p, 0, 12 * tau, tau), now = m.at(tc);
        const im = m.Ifin * 1.15, vm = V * 1.15;
        chart(p.graph, {
          x: [0, 12], xTicks: tauTicks(12),
          y: { min: -im, max: im, ticks: evenTicks(-im, im, 4, v => eng(v, 'A', 2)) },
          y2: { min: -vm, max: vm, ticks: evenTicks(-vm, vm, 4, v => eng(v, 'V', 2)) },
          traces: [{ pts: vr, colour: h.volt, width: 5, axis: 'right' },
                   { pts: vl, colour: h.volt, width: 1.8, axis: 'right', dash: true },
                   { pts: cur, colour: h.amp, width: 2.2, axis: 'left' }],
          hlines: [{ y: 0.632 * m.Ifin, colour: t.mark, label: '63%', align: 'right' }],
          vlines: [{ x: 1, colour: t.mark, label: near1(tc / tau) ? '' : '1τ' },
                   { x: 6, colour: t.mark, label: 'S1 opens, S2 closes', side: 'left', row: 1.3 }],
          cursor: { x: tc / tau, colour: t.mark, label: trim(tc / tau, 2) + 'τ',
                    dots: [{ y: now.i, axis: 'left', colour: h.amp }] }
        }, t);
        p.legend.innerHTML = swatch(h.amp, 'Current, left scale') +
          swatch(h.volt, 'V across R, the same shape, right scale') +
          swatch(dashed(h.volt), 'V across L, dashed') + swatch(t.mark, 'Drag to read');
        p.readouts.innerHTML = ro([
          ['Time constant, L ÷ R', eng(tau, 's', 3), true],
          ['Final current, V ÷ R', eng(m.Ifin, 'A', 3)],
          ['After one time constant', eng(0.6321 * m.Ifin, 'A', 3) + ', 63%'],
          ['At the cursor', trim(tc / tau, 2) + NBSP + 'τ: ' + eng(now.i, 'A', 3)],
          ['V across R there', eng(now.vR, 'V', 3)]
        ]);
        const base = lrLayout(V, R, L);
        base.frame = tt => {
          const a = m.at(tt);
          const lay = withEls(base, { S1: { open: !a.on }, S2: { open: a.on } });
          const big = Math.abs(a.vL) > 0.05 * V;
          lay.notes = big ? [{ at: [219, 44], text: a.vL > 0 ? '+' : '−', colour: 'v', size: 18 },
                             { at: [219, 82], text: a.vL > 0 ? '−' : '+', colour: 'v', size: 18 }] : [];
          return lay;
        };
        return { layout: base,
                 flow: { mode: 'time', duration: m.duration, currents: BENCH.lrCurrents(m), iMax: m.Ifin,
                         label: tt => tt < m.Ton ? trim(tt / tau, 2) + NBSP + 'τ after S1 closes'
                                                 : trim((tt - m.Ton) / tau, 2) + NBSP + 'τ after S1 opens' } };
      }

      const V = values.V, R = values.R, C = values.C, tau = R * C;
      if (view === 'bleed') {
        const m = bleedModel(V, R, C);
        const vc = [], ic = [];
        for (let i = 0; i <= 400; i++) { const tt = 6 * tau * i / 400, a = m.at(tt); vc.push({ x: tt / tau, y: a.vc }); ic.push({ x: tt / tau, y: a.i }); }
        const tc = cursorX(p, 0, 6 * tau, tau), now = m.at(tc);
        chart(p.graph, {
          x: [0, 6], xTicks: tauTicks(6),
          y: { min: 0, max: V * 1.1, ticks: evenTicks(0, V * 1.1, 4, v => eng(v, 'V', 2)) },
          y2: { min: 0, max: V / R * 1.1, ticks: evenTicks(0, V / R * 1.1, 4, v => eng(v, 'A', 2)) },
          traces: [{ pts: vc, colour: h.volt, width: 5, axis: 'left', fill: t.vFill },
                   { pts: ic, colour: h.amp, width: 2, axis: 'right' }],
          hlines: [{ y: 0.3679 * V, colour: t.mark, label: '37% left', align: 'right' }],
          vlines: [{ x: 1, colour: t.mark, label: near1(tc / tau) ? '' : '1τ' },
                   { x: 5, colour: t.mark, label: near1(tc / tau - 4) ? '' : '5τ' }],
          cursor: { x: tc / tau, colour: t.mark, label: eng(tc, 's', 3) + ', ' + trim(tc / tau, 2) + 'τ',
                    dots: [{ y: now.vc, axis: 'left', colour: h.volt }] }
        }, t);
        p.legend.innerHTML = swatch(h.volt, 'Voltage on the capacitor, left scale') +
          swatch(h.amp, 'Current in the bleed resistor, the same shape, right scale') + swatch(t.mark, 'Drag to read');
        p.readouts.innerHTML = ro([
          ['Time constant, C × R', eng(tau, 's', 3), true],
          ['After one time constant', eng(0.3679 * V, 'V', 3) + ', 37% left'],
          ['After five time constants', eng(V * Math.exp(-5), 'V', 3)],
          ['At the cursor', eng(tc, 's', 3) + ': ' + eng(now.vc, 'V', 3)]
        ]);
        return { layout: bleedLayout(V, R, C),
                 flow: { mode: 'time', duration: m.duration, currents: tt => ({ R1: m.at(tt).i }), iMax: V / R,
                         label: tt => trim(tt / tau, 2) + NBSP + 'τ after switch-off' } };
      }

      // the neon
      const Vs = values.VS, m = neonModel(V, R, C, Vs);
      const xs = [];
      for (let i = 0; i <= 700; i++) xs.push(6 * tau * i / 700);
      for (const s of m.segs.slice(0, 400)) if (s.t0 > 0 && s.t0 < 6 * tau) xs.push(s.t0, s.t0 + 1e-9 * tau);
      xs.sort((a, b) => a - b);
      const vc = [], plain = [], ir = [];
      for (const tt of xs) {
        const a = m.at(tt);
        vc.push({ x: tt / tau, y: a.vc }); ir.push({ x: tt / tau, y: a.iR });
        plain.push({ x: tt / tau, y: V * (1 - Math.exp(-tt / tau)) });
      }
      const tc = cursorX(p, 0, 6 * tau, m.first !== null ? Math.min(m.first, 6 * tau) : tau), now = m.at(tc);
      const vtop = Math.max(V, Vs) * 1.1;
      chart(p.graph, {
        x: [0, 6], xTicks: tauTicks(6),
        y: { min: 0, max: vtop, ticks: evenTicks(0, vtop, 4, v => eng(v, 'V', 2)) },
        y2: { min: 0, max: V / R * 1.1, ticks: evenTicks(0, V / R * 1.1, 4, v => eng(v, 'A', 2)) },
        // both voltage on C: with no neon, dashed
        traces: [{ pts: plain, colour: h.volt, width: 1.6, axis: 'left', dash: true },
                 { pts: ir, colour: h.amp, width: 1.8, axis: 'right' },
                 { pts: vc, colour: h.volt, width: 2.8, axis: 'left' }],
        hlines: [{ y: Vs, colour: t.mark, label: 'neon strikes', align: 'right', dash: false },
                 { y: 0.632 * V, colour: t.mark, label: '63%', align: 'left', below: true }],
        vlines: [{ x: 1, colour: t.mark, label: near1(tc / tau) ? '' : '1τ' }],
        cursor: { x: tc / tau, colour: t.mark, label: eng(tc, 's', 3) + ', ' + trim(tc / tau, 2) + 'τ',
                  dots: [{ y: now.vc, axis: 'left', colour: h.volt }] }
      }, t);
      p.legend.innerHTML = swatch(h.volt, 'Voltage on the capacitor, left scale') +
        swatch(dashed(h.volt), 'With no neon, dashed') + swatch(h.amp, 'Current in R, right scale') +
        swatch(t.mark, 'Drag to read');
      p.readouts.innerHTML = ro([
        ['Time constant, C × R', eng(tau, 's', 3), true],
        ['After one time constant', eng(0.6321 * V, 'V', 3) + ', 63%'],
        ['Neon first strikes', m.first === null ? 'never: the supply is below its striking voltage'
          : eng(m.first, 's', 3) + ', ' + trim(m.first / tau, 3) + NBSP + 'τ'],
        ['At the cursor', eng(tc, 's', 3) + ': ' + eng(now.vc, 'V', 3)]
      ]);
      const base = neonLayout(V, R, C);
      const show = 0.035 * m.duration;
      base.frame = tt => {
        const a = m.at(tt);
        // a flash lasts milliseconds; it is drawn for a moment longer so it can be seen
        let lit = a.lit;
        if (!lit && !m.steady && m.first !== null && tt >= m.first) {
          const s = m.segs[a.seg - 1];
          lit = !!(s && s.lit && tt - s.t0 < show);
        }
        return withEls(base, { N1: { lit } },
                       { notes: [{ at: [147, 166], text: 'on C: ' + eng(a.vc, 'V', 3), colour: 'v' }] });
      };
      return { layout: base,
               flow: { mode: 'time', duration: m.duration, currents: BENCH.neonCurrents(m), charge: m.charge,
                       iMax: V / R,
                       label: tt => trim(tt / tau, 2) + NBSP + 'τ after the switch closes' } };
    }
  },

  /* The capacitor and inductor combinations share one instrument. */
  combos(ctx, type) {
    const { p, t, values, ro, M, swatch } = ctx;
    const h = hues(t), topo = p.topology;
    const unit = type === 'C' ? 'F' : 'H', pre = type;
    const x = [values[pre + '1'], values[pre + '2'], values[pre + '3']];
    const par = a => type === 'C' ? a.reduce((s, v) => s + v, 0) : 1 / a.reduce((s, v) => s + 1 / v, 0);
    const ser = a => type === 'C' ? 1 / a.reduce((s, v) => s + 1 / v, 0) : a.reduce((s, v) => s + v, 0);
    const pair = par([x[0], x[1]]);
    const total = topo === 'parallel' ? par(x) : topo === 'series' ? ser(x) : ser([pair, x[2]]);
    const colour = type === 'C' ? h.cap : h.ind, part = tint(colour, t, 0.45);
    // the bars, on a log scale so that picofarads and microfarads both show
    const rows = [[pre + '1', x[0]], [pre + '2', x[1]], [pre + '3', x[2]]];
    if (topo === 'mixed') rows.push([pre + '1 ∥ ' + pre + '2', pair]);
    rows.push(['Total', total]);
    const all = rows.map(r => r[1]);
    const lo = Math.min(...all) / 3, hi = Math.max(...all) * 3;
    const { c, W, H } = canvas2d(p.graph);
    const left = 92, right = W - 110, rh = Math.min(34, (H - 46) / rows.length);
    const L = v => left + (right - left) * Math.log(v / lo) / Math.log(hi / lo);
    rows.forEach(([name, v], i) => {
      const y = 10 + i * rh, isT = name === 'Total';
      // all one quantity: the parts in a lighter tint, the total solid
      c.fillStyle = isT ? colour : part;
      c.fillRect(left, y + 5, Math.max(2, L(v) - left), rh - 12);
      c.font = font(15, isT ? 700 : 600); c.fillStyle = t.ink; c.textAlign = 'right'; c.textBaseline = 'middle';
      c.fillText(name, left - 10, y + rh / 2);
      c.font = font(15, 500, true); c.fillStyle = isT ? t.ink : t.soft; c.textAlign = 'left';
      // derived values carry four figures, as in the readout and the working
      c.fillText(eng(v, unit, i < 3 ? 3 : 4), L(v) + 8, y + rh / 2);
    });
    const smallest = Math.min(...x), largest = Math.max(...x);
    const rule = topo === 'mixed' ? (type === 'C' ? 'The pair adds; then in series with ' + pre + '3 the total falls below both'
                                                  : 'The pair falls below the smaller; then ' + pre + '3 adds to it')
      : (topo === 'parallel') === (type === 'C')
        ? 'Adding: the total is more than the largest, ' + eng(largest, unit, 3)
        : 'Reciprocals: the total is less than the smallest, ' + eng(smallest, unit, 3);
    c.font = font(15, 600); c.fillStyle = t.mark; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.fillText(rule, 14, H - 12);
    p.legend.innerHTML = swatch(part, type === 'C' ? 'Each capacitor' : 'Each inductor') +
      swatch(colour, 'The combination') + swatch(t.mark, 'The check to make');
    p.readouts.innerHTML = ro([
      ['Total', eng(total, unit, 4), true],
      ['Connection', { parallel: 'parallel', series: 'series', mixed: pre + '1 and ' + pre + '2 in parallel, then ' + pre + '3 in series' }[topo]],
      ['Smallest part', eng(smallest, unit, 3)],
      ['Largest part', eng(largest, unit, 3)]
    ]);
    const labels = {};
    [1, 2, 3].forEach(i => { labels[pre + i] = { text: pre + i, value: eng(x[i - 1], unit, 3) }; });
    const lay = comboLayout(type, topo, labels);
    p.fAnim = 1000;
    return { layout: lay, circuit: M.parseNetlist(fillNet(lay.netlist, x)) };
  },

  /* ---- the seven items, in reading order ---- */
  items: [
    {
      code: '2D1',
      levels: ['intermediate', 'full'],
      introduces: {
        intermediate: ['capacitor', 'dielectric', 'capacitance', 'farad'],
        full: ['relative permittivity', 'coulomb', 'breakdown voltage']
      },
      panel: 'plates',
      circuit: 'air',
      controls: { intermediate: ['A', 'gap'], full: ['A', 'gap', 'Vc'] },
      toggle: { label: 'Dielectric', levels: ['intermediate', 'full'],
                options: [['air', 'Air'], ['polyester', 'Polyester'], ['mica', 'Mica'], ['glass', 'Glass']] },
      heading: { intermediate: 'Two plates and an insulator',
                 full: 'Building a capacitor: C = k × A ÷ d' },
      lead: {
        intermediate: 'Start with what a capacitor is made of, because everything it does follows from its shape.',
        full: 'The value of a capacitor is set by its plates and by what fills the gap between them, and one formula puts numbers on all three.'
      },
      headline: {
        intermediate: 'What a capacitor is made of, and how it holds a charge.',
        full: 'What sets the value: plate area, plate spacing, and the dielectric between them.'
      },
      formulas: {
        intermediate: [],
        full: ['Ckad', 'QCV', 'QIt', 'Vbd']
      },
      workLead: {
        full: 'From the plates to the capacitance, then the charge it holds at the voltage set, how long a small steady current takes to deliver that charge, and the voltage the gap will stand.'
      },
      workNote: {
        intermediate: 'There is no formula to use at this level. The syllabus asks what the capacitance depends on: the area of the plates, the gap between them, and the dielectric. The formula behind the picture, C = k × A ÷ d, comes at Full.',
        full: 'C = kA/d and C = Q/V are printed on the sheet. Q = I × t is not, so learn it. The breakdown strengths are typical figures for interest: real values depend on the thickness and quality of the material. Air is the exception at small gaps: however small the gap, it does not spark below about 300 V.'
      },
      explain: {
        intermediate: [
          'A capacitor is two metal plates held apart by an insulator, called the dielectric. Connect a battery and charge flows on to one plate and off the other until the voltage between them equals the battery voltage. One plate is left positive and the other negative, and the charge stays there after the battery is removed.',
          'How much charge it holds for each volt is its capacitance, measured in farads. A farad is enormous, so practical values are microfarads, nanofarads and picofarads. The capacitor drawn here starts at about 89 pF.',
          'Try each control in turn. Larger plates hold more charge. Plates closer together hold more. Replace the air with polyester, mica or glass and the same plates hold several times as much. The charges drawn on the plates grow and shrink with the capacitance.'
        ],
        full: [
          'C = k × A ÷ d. A is the area of one plate in square metres and d the gap in metres. k is the permittivity of the dielectric: the permittivity of free space, ε₀ = 8.854 × 10⁻¹² farads per metre, multiplied by the relative permittivity εᵣ of the material, which is about 1 for air.',
          'So doubling the area doubles C, halving the gap doubles C, and a dielectric with an εᵣ of 7 multiplies it by 7. Convert first: 100 cm² is 0.01 m² and 1 mm is 0.001 m. Losing a factor of ten thousand in the area is the usual slip.',
          'Charge follows from the voltage: Q = C × V, which the sheet prints as C = Q ÷ V. A coulomb is the charge carried by one ampere flowing for one second, so Q = I × t as well. That one is not on the sheet.',
          'The gap also decides the voltage the capacitor will stand before a spark jumps across: its breakdown voltage. Air breaks down at roughly 3 kV for every millimetre, and solid dielectrics stand more, many of them far more. A wider gap buys voltage at the cost of capacitance, which is why capacitors for transmitters are large. Wind the voltage up past the breakdown figure and watch.'
        ]
      },
      highlight: ['C1']
    },

    {
      code: '2D2',
      levels: ['intermediate', 'full'],
      introduces: {
        intermediate: [],
        full: ['dielectric loss']
      },
      panel: { intermediate: 'combosC', full: 'losses' },
      circuit: 'parallel',
      controls: { intermediate: ['C1', 'C2', 'C3'], full: ['fq'] },
      toggle: { label: 'Connection', levels: ['intermediate'],
                options: [['parallel', 'Parallel'], ['series', 'Series'], ['mixed', 'Mixed']] },
      heading: { intermediate: 'Capacitors in series and in parallel',
                 full: 'Dielectrics, and the heat they make at radio frequencies' },
      lead: {
        intermediate: 'Capacitors combine the opposite way round to resistors, and the plates explain why.',
        full: 'Every dielectric wastes a little of the energy that passes through it, and in some the waste grows with frequency.'
      },
      headline: {
        intermediate: 'Combining capacitors in series and in parallel.',
        full: 'Why different dielectrics suit different jobs, and how their losses grow with frequency.'
      },
      formulas: {
        intermediate: ['Cpar', 'Cser'],
        full: ['XC', 'esr', 'heat']
      },
      workNote: {
        intermediate: 'Both rules are printed in the booklet. Mixed means C1 and C2 side by side, and that pair in a line with C3: combine the pair first, then the rest.',
        full: 'No formula is asked for here: the syllabus wants the rule that losses rise with frequency, and the jobs each dielectric suits. The reactance is on the sheet; the loss resistance and the heat comparison are for interest, and the loss factors are typical values for illustration.'
      },
      explain: {
        intermediate: [
          'In parallel, capacitors add: C = C1 + C2 + C3. Side by side, their plates act like one capacitor with plates as large as all of theirs together, and larger plates mean more capacitance.',
          'In series, the reciprocals add: 1/C = 1/C1 + 1/C2 + 1/C3. In a line, the charge has to cross every gap in turn, which is like one capacitor with its plates further apart, so the total is less than the smallest. For two, product over sum is quicker: C1 × C2 ÷ (C1 + C2).',
          'Two checks catch most mistakes: a parallel total is more than the largest, and a series total is less than the smallest. Convert to the same unit before adding: 1 µF is 1000 nF, and 1 nF is 1000 pF.',
          'The circuit is driven from an AC source, so the charge sloshes back and forth. In parallel each capacitor carries a share in proportion to its capacitance; in series every capacitor carries the same current.'
        ],
        full: [
          'No dielectric is perfect. Each reversal of an alternating voltage twists the molecules of the material one way and then the other, and a little energy is lost as heat every time. With the same voltage across it, more reversals every second mean more heat, so as a general rule, which is how the exam puts it, the losses rise with frequency.',
          'The plot shows what differs between dielectrics: the loss factor, the share of the energy lost in each cycle. For air, mica and C0G ceramic it is tiny and almost flat. With some dielectrics, plastic films such as polyester above all, it grows with frequency as well, so the heat climbs faster still. With the same voltage across it, a polyester capacitor makes about 26 times as much heat at 29 MHz as at 1.8 MHz; drag the frequency and read the heat against 1.8 MHz.',
          'So the choice depends on the job. Air: tuning capacitors and antenna tuners, almost no loss, and wide spacing for high RF voltages, but only small values. Mica: stable, precise and low loss, for tuned circuits, filters and oscillators. Ceramic: small and cheap for RF decoupling; the C0G type is stable and low loss as well, while other ceramics lose more. Polyester film: fine for audio, coupling and timing, but it warms up in an RF power circuit.',
          'The loss is drawn as a small resistance in series with a perfect capacitor. That is where the heat is made, and its value changes with frequency: the working finds it from the loss factor and the reactance.'
        ]
      },
      highlight: { intermediate: [], full: ['R1'] }
    },

    {
      code: '2D3',
      levels: ['intermediate', 'full'],
      introduces: {
        intermediate: ['electrolytic', 'polarised', 'leakage current'],
        full: ['working voltage']
      },
      panel: { intermediate: 'polarity', full: 'breakdown' },
      circuit: 'right',
      controls: { intermediate: ['Vel'], full: ['Vap', 'Vr'] },
      toggle: { label: 'Connection', levels: ['intermediate'],
                options: [['right', 'Right way round'], ['reversed', 'Reversed']] },
      heading: { intermediate: 'Polarised capacitors, and which way round',
                 full: 'Breakdown voltage and the rating' },
      lead: {
        intermediate: 'Some capacitors work only one way round. Connected backwards, they can overheat and burst.',
        full: 'The gap that sets the value of a capacitor also sets the voltage it can stand.'
      },
      headline: {
        intermediate: 'Some capacitors are polarised. Connect one backwards and it can hurt you.',
        full: 'Every capacitor has a voltage it will not survive.'
      },
      formulas: {
        intermediate: [],
        full: ['Vpk']
      },
      workLead: {
        full: 'The setting is the peak voltage applied to the capacitor. The formula from the sheet gives the RMS voltage whose peaks reach it.'
      },
      workNote: {
        intermediate: 'There is nothing to calculate here. The current figures are illustrative, but the difference between the two connections is the real one: microamps one way, a large and rising current the other.',
        full: 'Failing at twice the rating is chosen for illustration. Real parts fail at no fixed figure above their rating, which is the reason for having one.'
      },
      explain: {
        intermediate: [
          'An electrolytic capacitor packs a large capacitance into a small can by using an extremely thin insulating layer, grown chemically on one plate. That layer only insulates while its plate is kept positive, so electrolytics are polarised: they must go in the right way round, positive to the more positive point.',
          'Connected the right way, a tiny leakage current flows, a few microamps. Press Reversed and watch the current and the charge: the layer stops insulating, a large current flows, and the capacitor heats up. It can boil its contents, vent or burst, which can hurt you as well as wreck the circuit.',
          'On an aluminium electrolytic a stripe marks the negative lead, which is also the shorter one. Tantalum capacitors are polarised too, and are usually marked + instead, so check. Ceramic and plastic film capacitors are not polarised.',
          'Electrolytics also carry a voltage rating, such as 100 µF 25 V, and must be used within it. Watch the current climb past the rating as well.'
        ],
        full: [
          'Every capacitor has a breakdown voltage: push the voltage across the dielectric high enough and a spark punches through it. The voltage marked on the case is the rating, the most it is made to withstand, set some way below where it actually fails.',
          'Drag the voltage up past the rating. Within it all is well. Above it nothing is guaranteed: where a particular part fails varies, and this one is set to fail at twice its rating. Once punctured, a capacitor usually becomes a short circuit, and the current that then flows can overheat it, make it smoke or burst it.',
          'On AC it is the peak that counts, not the RMS: 70.7 V RMS reaches 100 V at every peak. A reservoir capacitor in a power supply charges to the peak of the transformer voltage, so choose its working voltage from that peak. A 15 V RMS secondary peaks at 21.2 V, so a 35 V part, not a 16 V one.'
        ]
      },
      highlight: ['C1']
    },

    {
      code: '2D4',
      levels: ['intermediate', 'full'],
      introduces: {
        intermediate: ['magnetic field', 'inductor', 'inductance', 'henry', 'induced voltage'],
        full: ['self-inductance', 'back EMF', 'flyback diode', 'time constant']
      },
      panel: { intermediate: 'induction', full: 'backemf' },
      circuit: 'none',
      controls: { intermediate: ['spd', 'B', 'turns'], full: ['VB', 'L', 'RL'] },
      toggle: { label: 'Across the coil', levels: ['full'],
                options: [['none', 'No diode'], ['diode', 'Flyback diode'], ['reversed', 'Diode reversed']] },
      heading: { intermediate: 'Moving a conductor through a magnetic field',
                 full: 'Self-inductance, back EMF and the flyback diode' },
      lead: {
        intermediate: 'A current makes a magnetic field, and a moving field makes a voltage. The inductor uses both.',
        full: 'A coil resists any change in its current, and what it does when the current is switched off is something every circuit has to plan for.'
      },
      headline: {
        intermediate: 'Move a conductor through a magnetic field and you induce a voltage across it.',
        full: 'Self-inductance, and the back EMF a coil throws out when its current changes.'
      },
      formulas: {
        intermediate: ['emf'],
        full: ['tauLR', 'Ifin', 'spike']
      },
      workLead: {
        full: d => d.device === 'diode'
          ? 'The time constant and the final current, both from the sheet, then where the coil current goes.'
          : 'The time constant and the final current, both from the sheet, then the size of the spike.'
      },
      workNote: {
        intermediate: 'There is no formula to use at this level, and the one shown is for interest. What the syllabus asks for is the effect: relative movement induces a voltage, and more speed, a stronger field or more turns give more of it.',
        full: 'The spike is limited by the spark across the contacts, taken here as breaking down at about 300 V, roughly the least that sparks across a small gap in air. With the diode reversed, the current through it takes about 0.2 Ω for the battery and wiring. The back EMF formula is for interest: the syllabus asks you to recognise the effect, not to calculate it.'
      },
      explain: {
        intermediate: [
          'A current through a wire makes a magnetic field around it, in circles round the wire. Wind the wire into a coil and the fields of all the turns add up inside it, concentrating the field along the coil much as in a bar magnet. That is an inductor: a coil of wire made to concentrate the field.',
          'It works the other way round too. Move a conductor through a magnetic field, cutting across the lines of the field, and a voltage is induced across its ends. Drag along the plot to choose a moment and watch the conductor.',
          'The voltage follows the speed, not the position. It is largest as the conductor rushes through the middle and zero at the top and bottom of its travel, where it stops for an instant to turn round. Moving up gives one polarity and moving down the other. Join the ends of the conductor through the meter and the induced voltage drives a current round: the cross means current into the page, the dot current out of it.',
          'Move faster, use a stronger field or more turns, and the voltage rises. It is the relative movement that counts, so moving the magnet instead works as well. Generators and dynamic microphones work this way, and a transformer uses the same effect with a changing field in place of movement.',
          'An inductor stores energy in its magnetic field while current flows. That ability is its inductance, measured in henries, and it depends on the number of turns and the size of the coil. Smoothing chokes are measured in henries, RF coils in microhenries.'
        ],
        full: [
          'When the current in a coil changes, its own magnetic field changes, and that induces a voltage in the same coil. This is self-inductance, and the induced voltage is the back EMF. It always opposes the change that caused it.',
          'At switch-on the back EMF pushes against the battery. At the first instant it equals the battery’s EMF, so the current starts from zero and grows; how fast is set by the time constant, τ = L ÷ R, which the last section takes further. Once the current is steady nothing is changing, and there is no back EMF.',
          'At switch-off the current tries to stop at once. The field collapses fast and the back EMF reverses, trying to keep the current going. With nowhere else to go it drives the voltage across the opening contacts up to hundreds of volts, a spark jumps, and the energy of the coil is spent in it. That is the spike on the plot. Now pick Flyback diode.',
          'The diode goes across the coil with its cathode to the positive supply, so in normal use it is reverse biased and carries nothing. At switch-off the back EMF forward biases it, the coil current goes round through it and dies away, and the contacts see only the supply plus one diode drop. A transistor switching a relay coil needs the same protection: without it the spike lands on the collector.',
          'Pick Diode reversed. Fitted the wrong way round, it conducts straight across the supply whenever the switch is closed, a near short: taking about 0.2 Ω for the battery and wiring, 12 V drives some 57 A through it. The coil gets almost nothing, and at switch-off the diode is reverse biased and does nothing to stop the spike.'
        ]
      },
      highlight: { intermediate: [], full: ['L1', 'D1'] }
    },

    {
      code: '2D5',
      levels: ['intermediate'],
      panel: 'combosL',
      circuit: 'series',
      controls: ['L1', 'L2', 'L3'],
      toggle: { label: 'Connection', levels: ['intermediate'],
                options: [['series', 'Series'], ['parallel', 'Parallel'], ['mixed', 'Mixed']] },
      heading: { intermediate: 'Inductors in series and in parallel' },
      lead: {
        intermediate: 'Inductors combine the same way as resistors, which makes them the easy ones after capacitors.'
      },
      headline: {
        intermediate: 'Combining inductors in series and in parallel.'
      },
      formulas: { intermediate: ['Lser', 'Lpar'] },
      workNote: {
        intermediate: 'Both rules are printed in the booklet. The parallel rule for inductors has the same shape as the series rule for capacitors, which is the easiest way to keep the two straight. Mixed means L1 and L2 side by side, then L3 in series.'
      },
      explain: {
        intermediate: [
          'In series, inductances add: L = L1 + L2 + L3. In effect it is one coil with more turns in total.',
          'In parallel, the reciprocals add: 1/L = 1/L1 + 1/L2 + 1/L3, and the total is less than the smallest. For two, product over sum is quicker, and identical inductors in parallel divide: three of 30 µH give 10 µH.',
          'Both rules assume the coils are far enough apart, or screened, that their magnetic fields do not link. Coils whose fields interact affect each other, and the simple rules no longer hold.',
          'Resistors and inductors follow the same rules, and capacitors are the odd ones out, going the other way round. Compare the bars with the capacitor section above.'
        ]
      },
      highlight: []
    },

    {
      code: '2D6',
      levels: ['intermediate'],
      introduces: {
        intermediate: ['permeability', 'slug tuning']
      },
      panel: 'coil',
      circuit: 'air',
      controls: ['Nt', 'dia', 'pitch', 'slug'],
      heading: { intermediate: 'What sets the inductance of a coil' },
      lead: {
        intermediate: 'Four things decide how much inductance a coil has, and one of them can be adjusted with a screwdriver.'
      },
      headline: {
        intermediate: "What makes a coil's inductance larger: more turns, wider diameter, closer spacing, and the core."
      },
      formulas: { intermediate: ['wheeler', 'slugK'] },
      workNote: {
        intermediate: 'Both formulas are for interest: the syllabus asks which way each change moves the inductance, not for the sum. The first is a standard approximation for a single layer air coil, good to a few per cent when the coil is longer than its radius. The slug factor is typical of a ferrite slug in a small former.'
      },
      explain: {
        intermediate: [
          'Inductance rises with more turns, a larger diameter, and turns wound closer together. More turns add their fields together and each turn links the field of all the others; a wider coil encloses more field; closer turns share more of it.',
          'Here the turns keep their spacing, so adding turns makes the coil longer as well, and the inductance rises less steeply than the square of the turns. Wound into the same length, twice the turns would give about four times the inductance.',
          'A core of high permeability material, such as ferrite or iron dust, concentrates the magnetic field and raises the inductance a great deal. Slug tuning uses a threaded ferrite core, the slug, inside a plastic former: screw it in and the inductance rises, screw it out and it falls. That sets a coil precisely, for instance to put a tuned circuit exactly on frequency.',
          'Drag the slug control and watch the inductance follow. The effect is strongest as the slug passes the middle of the winding, where the field is most concentrated.'
        ]
      },
      highlight: []
    },

    {
      code: '2D7',
      levels: ['full'],
      introduces: {
        full: ['bleed resistor']
      },
      panel: 'timeconst',
      circuit: 'neon',
      controls: ['V', 'R', 'C', 'VS', 'VB', 'L', 'RL'],
      toggle: { label: 'View', levels: ['full'],
                options: [['neon', 'Charge, with a neon'], ['bleed', 'Discharge, bleed resistor'], ['lr', 'LR rise and fall']] },
      heading: { full: 'Charge and discharge: CR and LR time constants' },
      lead: {
        full: 'The voltage on a capacitor and the current in a coil cannot change instantly. Each moves towards its new value along a curve set by the time constant.'
      },
      headline: {
        full: 'How current and voltage rise and fall in LR and CR circuits, and what the time constant tells you.'
      },
      formulas: { full: ['tauCR', 'tauLR', 'Ifin', 'p63', 'exact', 'neon'] },
      workLead: {
        full: 'The time constant from the sheet, then what it means.'
      },
      workNote: {
        full: 'τ = CR and τ = L/R are printed on the sheet. The 63% and 37% rules and the five time constants are not, so learn them. The exponential is for interest: it is where the 63% comes from.'
      },
      explain: {
        full: [
          'Charge a capacitor through a resistor and its voltage rises fast at first, then ever more slowly, because as the capacitor fills less voltage is left across R to drive the current. After one time constant, τ = C × R, it has done 63% of the change. After about five it is treated as fully charged. Discharging, it falls to 37% after one time constant.',
          'Charge, with a neon: the neon across the capacitor lights when the capacitor reaches its striking voltage. 65 V is 65% of a 100 V supply, close to 63%, so it strikes after about one time constant. Once lit, the neon discharges the capacitor until it goes out and the charging starts again, which is a relaxation oscillator, shown here for interest.',
          'Discharge, bleed resistor: a bleed resistor across the smoothing capacitor of a high voltage supply discharges it after switch-off. After one time constant 37% is left, which on a 1500 V supply is still over 500 V. A capacitor can hold a lethal charge long after the power is off, so always check with a meter before touching.',
          'LR rise and fall: in a coil it is the current that rises and falls, with τ = L ÷ R. At switch-on the back EMF equals the battery’s EMF, so the current starts from zero, and it reaches 63% of its final value V ÷ R after one time constant. The voltage across R has exactly the same shape as the current, because V = I × R; the voltage across L starts at the full supply and dies away. More inductance slows both the rise and the fall, which is why a coil in a keying line softens the edges of a Morse signal.',
          'Drag along the plot to read any moment. The exam rounds: 63% and about five time constants are the answers it expects, though the exact figures are 63.2% and 99.3%.'
        ]
      },
      highlight: { full: ['C1', 'L1'] }
    }
  ],

  /*
   * Our own explanation of each answer, keyed by the bank's reference number.
   * The question, its options and the marked answer are the RSGB's and ship
   * unadapted. Everything here is ours.
   */
  answers: {
    '2025-Full3555': {
      why: 'Glass has a relative permittivity several times that of air, so filling the gaps multiplies the capacitance. It is also a far better insulator against sparks than air, so the breakdown voltage rises too.',
      working: ['C = k &times; A / d, with k = &epsilon;<sub>0</sub> &times; &epsilon;<sub>r</sub>',
                '&epsilon;<sub>r</sub> rises from 1 for air to about 7 for glass, so C rises about 7 times',
                'breakdown strength rises from about 3 kV/mm in air to about 10 kV/mm in glass',
                'so the capacitance will increase and the breakdown voltage will be higher'],
      source: { eq: ['Ckad', 'Vbd'], from: ['2D1'] },
      seed: { A: 100, gap: 1e-3, Vc: 100, toggle: 'glass' },
      seedNote: 'The bench is set to air spaced plates with glass in the gap. Switch back to Air and watch both figures fall.'
    },
    '2025-Full460': {
      why: 'C = k × A ÷ d, with the gap d on the bottom of the fraction, so widening the gap reduces the capacitance. A larger area or a dielectric with a higher permittivity would increase it, and the breakdown voltage has no effect on the capacitance.',
      working: ['C = k &times; A / d',
                'double the gap from 1 mm to 2 mm with 100 cm&sup2; of air: 88.5 pF falls to 44.3 pF',
                'so increasing the distance between the plates reduces it'],
      source: { eq: ['Ckad'], from: ['2D1'] },
      seed: { A: 100, gap: 2e-3, toggle: 'air' },
      seedNote: 'The bench is set to a 2 mm gap. Drag the gap back to 1 mm and the capacitance doubles.'
    },
    '2025-Full8026': {
      why: 'Every dielectric turns a little energy into heat at each reversal of the voltage, and in plastic film the loss in each cycle itself grows with frequency. So between LF and UHF the losses increase, steeply. The capacitance stays essentially the same.',
      working: ['with the same voltage, heat is in proportion to f &times; tan &delta;, and tan &delta; of polyester rises with f as well',
                'polyester: tan &delta; 0.0109 at 100 kHz and 0.0448 at 400 MHz, so 4000 times the frequency gives about 16 000 times the heat',
                'the losses will increase'],
      source: { eq: ['heat'], from: ['2D2'] },
      seed: { fq: 400e6 },
      seedNote: 'The bench is set to 400 MHz, in the UHF band. Drag down to the LF band and watch the loss factor and the heat fall.'
    },
    '2025-Full4063': {
      why: 'The same capacitors run cool at 1.8 MHz and warm at 29 MHz, at less power: the loss in a plastic dielectric rises with frequency. Strictly, polythene is one of the lowest loss plastics, which is why coaxial cable uses it. The question applies the general rule for plastic film, and polyester behaves exactly as it describes.',
      working: ['with the same voltage, heat is in proportion to f &times; tan &delta;',
                'polyester from 1.8 MHz to 29 MHz: 16.1 times the frequency &times; 1.6 times the loss factor = about 26 times the heat',
                'the dielectric has higher losses at higher frequencies'],
      source: { eq: ['heat'], from: ['2D2'] },
      seed: { fq: 29e6 },
      seedNote: 'The bench is set to 29 MHz. Drag down to 1.8 MHz and watch the polyester heat fall back to × 1.'
    },
    '2025-Full98': {
      why: 'Dielectric loss rises as the frequency rises. Every dielectric loses a little energy at each reversal of the voltage, and more reversals each second mean more heat.',
      working: ['with the same voltage, heat is in proportion to f &times; tan &delta;',
                'mica: tan &delta; stays at 0.0007, so 100 MHz makes 100 times the heat of 1 MHz',
                'the losses increase as the frequency is increased'],
      source: { eq: ['heat'], from: ['2D2'] },
      seed: { fq: 100e6 },
      seedNote: 'The bench is set to 100 MHz. The mica loss factor is flat, yet its heat is about 56 times its figure at 1.8 MHz: more cycles each second, each losing the same share.'
    },
    '2025-Full7886': {
      why: 'The voltage marked on a capacitor is its rating: the most it is made to withstand, peaks included. It is not an RMS figure, and it says nothing about mains use, which needs capacitors specially rated for safety.',
      working: ['250 V is the most the capacitor may see at any instant',
                'on AC that is a peak of 250 V, only 177 V RMS',
                'it is the maximum voltage the capacitor is rated to withstand'],
      source: { eq: ['Vpk'], from: ['2D3'] },
      seed: { Vr: 250, Vap: 250 },
      seedNote: 'The bench is set to a 250 V capacitor with 250 V across it: right at its rating.'
    },
    '2025-Full95': {
      why: 'A reservoir capacitor charges to the peak of the transformer voltage and stays there, so its working voltage must be comfortably above that peak; get it wrong and the capacitor breaks down. Size, spacing and dielectric follow from the working voltage and the capacitance.',
      working: ['a 15 V RMS secondary peaks at 15 &times; 1.414 = 21.2 V',
                'so choose a working voltage of 35 V, not 16 V',
                'the working voltage decides it'],
      source: { eq: ['Vpk'], from: ['2D3'] },
      seed: { Vr: 35, Vap: 21.2 },
      seedNote: 'The bench is set to the 21.2 V peak on a 35 V capacitor. Drag the rating down to 16 V to see why not.'
    },
    '2025-Full96': {
      why: 'Above its breakdown voltage the dielectric is punctured and the plates are joined through the damage: the capacitor usually becomes a short circuit, and may then overheat or burst.',
      working: ['rated 63 V, this one is set to fail at 126 V',
                'at 150 V the dielectric is punctured',
                'it becomes a short circuit'],
      source: { from: ['2D3'] },
      seed: { Vr: 63, Vap: 150 },
      seedNote: 'The bench is set past the point of failure: watch the current through the punctured capacitor.'
    },
    '2025-Full104': {
      why: 'A coil resists any increase in its current with a voltage induced by its own changing field. That opposing voltage is the back EMF.',
      working: ['back EMF = L &times; rate of change of current',
                'at switch-on, 12 V across 100 mH: the current can only start rising at 120 A per second, the rate at which the back EMF equals 12 V',
                'that opposing effect is the back EMF'],
      source: { from: ['2D4'] },
      seed: { toggle: 'diode', VB: 12, L: 0.1, RL: 24 },
      seedNote: 'Read the plot from the left: the current starts from zero, held back by the back EMF.'
    },
    '2025-Full105': {
      why: 'A changing current changes the magnetic field of the coil carrying it, and that changing field induces the back EMF in the same coil. It comes from the inductance; capacitors, cells and diodes have nothing to do with it.',
      source: { from: ['2D4'] }
    },
    '2025-Full106': {
      why: 'Self-inductance is the inductance of a single coil on its own: its own field acting on itself. The effect between two coils, as in a transformer or a bifilar winding, is mutual inductance.',
      source: { from: ['2D4'] }
    },
    '2025-Full7706': {
      why: 'A changing current makes a changing magnetic field, and that field induces a voltage in the same circuit. The other options swap voltage, current and resistance around; it is the changing current that induces a voltage.',
      source: { from: ['2D4'] }
    },
    '2025-Full3689': {
      why: 'With the switch closed the coil carries a steady current and stores energy in its field. Opening the switch tries to stop the current at once, and the collapsing field induces a back EMF large enough to arc across the opening contacts. The self-inductance itself does not change, and a resistor has no back EMF.',
      working: ['steady current 12 V / 24 &Omega; = 500 mA, stored in 100 mH',
                'at switch-off the current must fall to zero at once, so L &times; rate of change is huge: about 300 V across the contacts here',
                'the back-EMF of the coil is large enough to cause an arc'],
      source: { eq: ['spike'], from: ['2D4'] },
      seed: { toggle: 'none', VB: 12, L: 0.1, RL: 24 },
      seedNote: 'The bench is set to a coil with no diode. Watch the voltage across the contacts when the switch opens.'
    },
    '2025-Full7674': {
      why: 'The diode must sit across the coil with its cathode to the positive supply, so that it is reverse biased while the transistor conducts. At switch-off the back EMF forward biases it and the coil current goes round through it instead of spiking the collector. In circuit 2 the bar of the diode, its cathode, is at the + rail. In circuit 1 the diode points the other way: it would conduct straight across the coil whenever the transistor is on and do nothing at switch-off. A capacitor or a resistor across the coil softens the spike, but neither is the usual answer.',
      working: ['the diode belongs across the coil, cathode to the + supply',
                'circuit 2 has its bar, the cathode, at the + rail: reverse biased while the coil is energised, conducting only for the spike',
                'so circuit 2'],
      source: { from: ['2D4'] },
      seed: { toggle: 'diode' },
      seedNote: 'The bench is set to a flyback diode fitted the right way. A switch stands in for the transistor; the spike it saves is the one the collector would see.'
    },
    '2025-Full110': {
      why: 'An inductor opposes changes in current, so with one in the circuit the current takes time to rise when the circuit is made. Having negligible resistance, it does not change the final current, V ÷ R, and when the circuit is broken it slows the fall rather than speeding it up.',
      working: ['&tau; = L / R',
                '100 mH with 100 &Omega;: &tau; = 1 ms, so the current takes about 5 ms to reach its final 120 mA',
                'the inductor will slow down the rise in current'],
      source: { eq: ['tauLR'], from: ['2D7'] },
      seed: { toggle: 'lr', VB: 12, L: 0.1, RL: 100 },
      seedNote: 'The bench is set to 100 mH and 100 Ω. Drag L up and watch the rise stretch out.'
    },
    '2025-Full3556': {
      why: 'Find the time constant first: 0.5 MΩ × 10 µF = 5 s. The neon strikes at 65 V, which is 65% of the 100 V supply, close to the 63% reached after one time constant, so it lights after about one time constant: about 5 s.',
      working: ['&tau; = C &times; R = 10 &micro;F &times; 0.5 M&Omega; = 5 s',
                '65 V is 65% of 100 V, close to the 63% reached after 1 &tau;',
                'exactly, for interest: t = 5 s &times; ln(100 / 35) = 5.25 s',
                'so about 5 s'],
      source: { eq: ['tauCR', 'p63', 'neon'], from: ['2D7'] },
      seed: { toggle: 'neon', V: 100, R: 5e5, C: 10e-6, VS: 65 },
      seedNote: 'The bench is set to the circuit in the question. The cursor sits at the moment the neon first strikes.'
    },
    '2025-Full3690': {
      why: 'At the instant the switch closes the current is trying to change from zero, and the back EMF opposes that change completely: it equals the EMF of the battery, so nothing is left to drive current through R. The current then grows as the back EMF dies away.',
      working: ['at t = 0 the back EMF equals the battery EMF, so V across R = 0 and I = 0',
                'after 1 &tau; the back EMF has fallen to 37% and the current reached 63%',
                'the back EMF of the inductor is equal and opposite to the battery EMF'],
      source: { eq: ['tauLR', 'p63'], from: ['2D7', '2D4'] },
      seed: { toggle: 'lr' },
      seedNote: 'Read the dashed voltage across L at the left of the plot: it starts at the full battery voltage.'
    },
    '2025-Full462': {
      why: 'Time constant first: 100 µF × 600 kΩ = 60 s, so one minute is one time constant, and after one time constant 37% of the voltage is left. 37% of 1500 V is 552 V. The options are 50 V, 500 V, 1000 V and 1500 V. Of the four, 500 V is nearest to 552 V, and the question asks for an approximate figure.',
      working: ['&tau; = C &times; R = 100 &micro;F &times; 600 k&Omega; = 60 s, so 1 minute = 1 &tau;',
                'after 1 &tau;, 37% is left: 0.368 &times; 1500 V = 552 V',
                'nearest option: about 500 V'],
      source: { eq: ['tauCR', 'p63'], from: ['2D7'] },
      seed: { toggle: 'bleed', V: 1500, C: 100e-6, R: 6e5 },
      seedNote: 'The bench is set to the supply in the question. The cursor sits at one minute: read the voltage still on the capacitor.'
    },
    '2025-Full7676': {
      why: 'At switch-on the back EMF holds the current at zero; then the current rises along the exponential curve to V ÷ R. The voltage across the resistor is I × R, so it has the same shape: starting from zero, rising quickly, then levelling off at V. That is graph 2. Graph 3 is the voltage across the coil.',
      working: ['V across R = I &times; R, and I starts at 0',
                'after 1 &tau;, 63% of V; after about 5 &tau;, all of V',
                'graph 2'],
      source: { eq: ['tauLR', 'p63'], from: ['2D7'] },
      seed: { toggle: 'lr' },
      seedNote: 'The thick blue curve is the voltage across R: compare it with graph 2.'
    },
    '2025-Full7889': {
      why: 'With the key down the 1 kΩ resistor and the coil are in series, so the time constant is L ÷ R.',
      working: ['&tau; = L / R',
                '= 0.8 H / 1000 &Omega;',
                '= 0.0008 s = 800 &micro;s'],
      source: { eq: ['tauLR'], from: ['2D7'] },
      seed: { toggle: 'lr', L: 0.8, RL: 1000 },
      seedNote: 'The bench is set to 800 mH and 1 kΩ. Read the time constant.'
    }
  },

  outro: {
    intermediate: [
      'Six items, two components. A capacitor stores charge between plates, and its value grows with the area and the dielectric and falls with the gap; an inductor stores energy in a magnetic field, and its value grows with turns, diameter, close winding and a core.',
      'Remember the odd one out when combining: inductors behave like resistors, and capacitors go the other way round, adding in parallel. What both of them do with AC, reactance and phase, comes next.'
    ],
    full: [
      'Five items, one idea: a capacitor’s voltage and a coil’s current take time to change. Charge builds up on plates, a coil fights changes in its current, and both settle along the same curve.',
      'Three things to carry into the exam, none of them on the sheet: Q = I × t; 63% of the change after one time constant and 37% left on discharge; and about five time constants to settle. Then use the options: the exam rounds, so 552 V is about 500 V.'
    ]
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = BENCH;
if (typeof window !== 'undefined') window.BENCH = BENCH;
