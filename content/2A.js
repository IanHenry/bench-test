/*
 * content/2A.js - Resistance, power and tolerance: syllabus groups 2A, 2B
 * and 2C on one page.
 *
 * The first page with Foundation circuits on it, so the circuits start as
 * simply as a circuit can: a battery, a lamp and a gap. By Full the same
 * ideas are solving networks backwards from whatever a question happens to
 * give, and working out how far a divider can drift when its resistors sit
 * at opposite ends of their tolerance.
 *
 * Every circuit is drawn with steady (DC) charge drift: dots move one way, at
 * a speed in proportion to the current in that branch, so the charge arriving
 * at a junction visibly equals the charge leaving it. The two Full circuits
 * that are not DC, a tuned circuit and a coupling capacitor, use the AC
 * slosh instead, because that is what their current does.
 *
 * The page draws its own labels, resistor bodies and a few symbols the shared
 * engine lacks (a lamp, an LED, a material sample), on top of the shared
 * drawing, so that every word on a circuit is at least 15 px whatever the
 * size of the canvas, and a resistor keeps the 2.8 to 1 proportion of the
 * house symbol. Terminal positions are unchanged, so both checkers see the
 * circuits exactly as the shared engine defines them.
 *
 * Headlines come from content/descriptions.json and are our own wording. The
 * RSGB owns the learning objectives, so nothing here is copied from them.
 */

const AF = window.Fmt;
const AM = window.MNA;
const { eng: aeng, trim: atrim } = window.Fmt;
const ANB = ' ';                  // no-break space, number to unit

/* ---------------------------------------------------------------------- */
/* constants of the fixed circuits                                         */
/* ---------------------------------------------------------------------- */

// 2A1 Foundation: a 6 V battery and a lamp that takes 200 mA, with a gap the
// material goes into. The sample is a strip about 5 cm long.
const MAT_V = 6, MAT_LAMP = 30;
const MATERIALS = [
  { name: 'Copper', kind: 'conductor', R: 0.001, fill: '#B87333' },
  { name: 'Brass', kind: 'conductor', R: 0.004, fill: '#C9A43B' },
  { name: 'Carbon', kind: 'conductor', R: 2, fill: '#2E2E2E' },
  { name: 'Plastic', kind: 'insulator', R: Infinity, fill: '#9AA7B0' },
  { name: 'Rubber', kind: 'insulator', R: Infinity, fill: '#3B3B3B' },
  { name: 'Glass', kind: 'insulator', R: Infinity, fill: '#CFE8EE' },
  { name: 'Ceramic', kind: 'insulator', R: Infinity, fill: '#F2EFE6' },
  // tap water on the surface of the glass: a film a tenth of a millimetre
  // thick and 5 mm wide comes to about 2 MΩ along the strip
  { name: 'Wet glass', kind: 'wet', R: 2e6, fill: '#7DBDE0' }
];

// 2A2 Foundation: two lamps that differ, so their voltages differ in series
const LAMP_A = 30, LAMP_B = 60;
const lampGlow = P => Math.max(0, Math.min(1, Math.sqrt(P / 1.2)));
// 2A1 Intermediate: the resistor sits across a 10 V supply
const TOL_V = 10;
// 2A1 Full: the resistance a coupling capacitor works into
const COUPLE_R = 10e3;
// and the top of the amplifier's range, set by the device, not the capacitors
const DEVICE_FH = 100e3;
// 2C1 Intermediate: one cell
const CELL_V = 1.5;
// 2C4 Foundation: the LED circuit
const LED_SUPPLY = 9, LED_R = 470, LED_VF = 2;
// the E12 preferred values, for a resistor worked out from a question
const E12 = [1, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];

function nearestE12(r) {
  if (!(r > 0) || !isFinite(r)) return NaN;
  const dec = Math.pow(10, Math.floor(Math.log10(r)));
  let best = NaN, gap = Infinity;
  for (const m of E12.concat([10])) {
    for (const k of [dec / 10, dec, dec * 10]) {
      const c = m * k;
      if (Math.abs(c - r) < gap) { gap = Math.abs(c - r); best = c; }
    }
  }
  // 8.2 × 1000 is 8199.999… in floating point; every E12 value has two figures
  return Number(best.toPrecision(2));
}

const clampInt = (x, lo, hi) => Math.max(lo, Math.min(hi, Math.round(x)));
// a signed figure: a true minus sign, a plus when above zero, no sign at zero
const signed = x => (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x);
// a figure in a sum: a true minus sign when below zero, nothing added above
const minus = x => (x < 0 ? '−' : '') + Math.abs(x);
const par = (a, b) => a * b / (a + b);
// a slider shows its value to 3 figures, so every sum uses that same figure:
// the working never says 997.7 Ω beside a slider reading 998 Ω
const fig3 = x => Number(Number(x).toPrecision(3));
// how a lamp looks, in words, from the glow it is drawn with
const glowWord = g => g < 0.15 ? 'too dim to see' : g < 0.45 ? 'dim' : 'lit';

/* ---------------------------------------------------------------------- */
/* colours that carry meaning, the course's: voltage blue, current orange  */
/* (the colour of the moving charge), resistance dark, power red, L green, */
/* C purple; notices in the warning yellow; marks and cursors neutral      */
/* ---------------------------------------------------------------------- */

function isDark(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(String(hex || '').trim());
  if (!m) return false;
  const [r, g, b] = [m[1], m[2], m[3]].map(x => parseInt(x, 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.4;
}
function hues(t) {
  const dark = isDark(t.surface);
  return {
    dark: dark,
    v: t.v, i: t.i, iInk: t.iInk, p: t.p, r: t.r, l: t.l, c: t.c,
    note: t.note, noteInk: t.noteInk, mark: t.mark,
    soft: t.soft, faint: t.faint, grid: t.grid, surface: t.surface, ink: t.ink, wire: t.wire
  };
}
// a colour for text: current and notices have a darker ink than their lines
const txt = (h, colour) => colour === h.i ? h.iInk : colour === h.note ? h.noteInk : colour;
// a lighter tint of a colour, toward the panel, for a second trace of one quantity
function tint(colour, toward, k) {
  const rgb = s => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(s || '').trim());
                     return m ? [m[1], m[2], m[3]].map(x => parseInt(x, 16)) : null; };
  const a = rgb(colour), b = rgb(toward);
  if (!a || !b) return colour;
  return '#' + a.map((x, j) => Math.round(x + (b[j] - x) * k).toString(16).padStart(2, '0')).join('');
}
const span = (colour, text) => '<span style="color:' + colour + '">' + text + '</span>';
// the legend under each instrument says what the colours mean
function colourKey(ctx, which) {
  const h = hues(ctx.t);
  const names = { v: 'Voltage', i: 'Current, and the moving charge', p: 'Power', r: 'Resistance' };
  return which.map(k => ctx.swatch(h[k], names[k])).join('');
}

/* ---------------------------------------------------------------------- */
/* drawing on top of the shared schematic                                  */
/* ---------------------------------------------------------------------- */

const R_LEN = 42, R_THK = 15;       // resistor body, 2.8 : 1 like the house symbol
const LABEL_PX = 15.5;              // smallest label on screen, in pixels

// how far a label must stand off an element's axis, by type
function halfThick(el) {
  if (el.type === 'R') return el.kind === 'lamp' ? 13 : R_THK / 2;
  return { M: 16, N: 14, B: 12, C: 10, L: 7, D: 9, DZ: 9, S: 16, V: 13 }[el.type] || 8;
}

function drawLabels(ctx, layout, h, fs, t) {
  ctx.textBaseline = 'middle';
  // text, so current and notices take their ink
  const colourOf = k => ({ v: h.v, i: h.iInk, p: h.p, r: h.r, l: h.l, c: h.c, soft: h.soft,
                           note: h.noteInk, mark: h.mark })[k] || h.ink;
  // a value takes the colour of what the part is: volts on a source, henries, farads, ohms
  const own = el => ({ B: 'v', V: 'v', L: 'l', C: 'c', CP: 'c' })[el.type] || 'r';
  for (const el of layout.elements) {
    const lines = [];
    if (el.label) lines.push({ text: el.label, font: '600 ' + fs + 'px ' + t.font, colour: h.ink });
    if (el.value) lines.push({ text: el.value, font: (fs * 0.97) + 'px ' + t.mono,
                               colour: colourOf(el.valueColour || own(el)) });
    if (el.value2) lines.push({ text: el.value2, font: (fs * 0.97) + 'px ' + t.mono,
                                colour: colourOf(el.value2Colour || 'v') });
    if (!lines.length) continue;
    const vertical = (el.rot || 0) % 180 !== 0;
    const off = halfThick(el) + 5;
    const lh = fs * 1.12;
    if (vertical) {
      const left = el.labelAt === 'left';
      ctx.textAlign = left ? 'right' : 'left';
      const x = el.at[0] + (left ? -off : off);
      const y0 = el.at[1] - (lines.length - 1) * lh / 2;
      lines.forEach((L, i) => { ctx.font = L.font; ctx.fillStyle = L.colour; ctx.fillText(L.text, x, y0 + i * lh); });
    } else {
      ctx.textAlign = 'center';
      const below = el.labelAt === 'below';
      const n = lines.length;
      lines.forEach((L, i) => {
        const y = below ? el.at[1] + off + lh * (i + 0.5)
                        : el.at[1] - off - lh * (n - i - 0.5);
        ctx.font = L.font; ctx.fillStyle = L.colour; ctx.fillText(L.text, el.at[0], y);
      });
    }
  }
  for (const n of (layout.notes || [])) {
    ctx.font = (n.bold ? '600 ' : '') + fs + 'px ' + (n.mono === false ? t.font : t.mono);
    ctx.fillStyle = colourOf(n.c);
    ctx.textAlign = n.align || 'center';
    ctx.textBaseline = n.base || 'middle';
    ctx.fillText(n.text, n.at[0], n.at[1]);
  }
  for (const term of (layout.terminals || [])) {
    if (!term.text) continue;
    ctx.font = '600 ' + fs + 'px ' + t.font;
    ctx.fillStyle = h.soft;
    ctx.textAlign = term.align === 'right' ? 'right' : 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(term.text, term.at[0] + (term.align === 'right' ? -7 : 7), term.at[1]);
  }
}

function drawBody(ctx, el, h, t, hot) {
  // a resistor is drawn in the resistance colour; the one a panel is about is heavier
  const colour = h.r;
  ctx.save();
  ctx.translate(el.at[0], el.at[1]);
  ctx.rotate((el.rot || 0) * Math.PI / 180);
  ctx.lineWidth = hot ? 3 : 1.8;
  ctx.strokeStyle = colour;
  if (el.kind === 'lamp') {
    // clear the shared resistor body, then the lamp: a circle with a cross
    ctx.fillStyle = h.surface;
    ctx.fillRect(-15.5, -7, 31, 14);
    ctx.strokeStyle = h.wire;
    ctx.beginPath(); ctx.moveTo(-15, 0); ctx.lineTo(-13, 0); ctx.moveTo(13, 0); ctx.lineTo(15, 0); ctx.stroke();
    ctx.strokeStyle = colour;
    const g = Math.max(0, Math.min(1, el.glow || 0));
    ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.fillStyle = h.surface; ctx.fill();
    if (g > 0.01) {
      const grd = ctx.createRadialGradient(0, 0, 1, 0, 0, 13);
      grd.addColorStop(0, 'rgba(255,214,90,' + (0.95 * g) + ')');
      grd.addColorStop(1, 'rgba(255,190,60,' + (0.25 * g) + ')');
      ctx.fillStyle = grd; ctx.fill();
    }
    ctx.stroke();
    const k = 13 * Math.SQRT1_2;
    ctx.beginPath(); ctx.moveTo(-k, -k); ctx.lineTo(k, k); ctx.moveTo(-k, k); ctx.lineTo(k, -k); ctx.stroke();
  } else if (el.kind === 'sample') {
    // a strip of material sitting in the gap: not a resistor, so not drawn as one
    ctx.fillStyle = h.surface;
    ctx.fillRect(-15, -7, 30, 14);
    ctx.fillStyle = el.fill || '#999';
    ctx.strokeStyle = h.ink;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-21, -8, 42, 16, 4); else ctx.rect(-21, -8, 42, 16);
    ctx.fill(); ctx.stroke();
    if (el.wet) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      [[-12, -2], [-2, 3], [9, -3], [15, 3]].forEach(([x, y]) => {
        ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
      });
    }
  } else {
    // the house resistor: 2.8 times as long as it is thick, filled in the
    // power red as it gets hot when it is asked to show power
    ctx.fillStyle = h.surface;
    ctx.fillRect(-R_LEN / 2, -R_THK / 2, R_LEN, R_THK);
    if (el.heat > 0) {
      ctx.globalAlpha = Math.max(0.08, Math.min(0.85, el.heat));
      ctx.fillStyle = h.p;
      ctx.fillRect(-R_LEN / 2, -R_THK / 2, R_LEN, R_THK);
      ctx.globalAlpha = 1;
    }
    ctx.strokeRect(-R_LEN / 2, -R_THK / 2, R_LEN, R_THK);
  }
  ctx.restore();
}

function drawExtras(ctx, el, h) {
  if (el.type === 'D' && el.kind === 'led') {
    // two arrows leaving the LED, and a glow when it conducts
    ctx.save();
    ctx.translate(el.at[0], el.at[1]);
    ctx.rotate((el.rot || 0) * Math.PI / 180);
    if (el.lit) {
      const grd = ctx.createRadialGradient(0, 0, 2, 0, 0, 22);
      grd.addColorStop(0, 'rgba(255,60,40,0.55)');
      grd.addColorStop(1, 'rgba(255,60,40,0)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = h.ink; ctx.fillStyle = h.ink; ctx.lineWidth = 1.4;
    [[-2, -12], [5, -12]].forEach(([x, y]) => {
      const ex = x + 7, ey = y - 9;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
      const a = Math.atan2(ey - y, ex - x);
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - 5 * Math.cos(a - 0.5), ey - 5 * Math.sin(a - 0.5));
      ctx.lineTo(ex - 5 * Math.cos(a + 0.5), ey - 5 * Math.sin(a + 0.5));
      ctx.closePath(); ctx.fill();
    });
    ctx.restore();
  }
}

// + and − beside each battery, on the side away from its label
function batterySigns(ctx, el, h, fs, t) {
  if (el.type !== 'B') return;
  const rot = ((el.rot || 0) % 360 + 360) % 360;
  const left = el.labelAt !== 'left';
  const dx = left ? -15 : 15;
  ctx.font = '700 ' + (fs * 1.3) + 'px ' + t.font;
  ctx.fillStyle = h.ink;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (rot === 90 || rot === 270) {
    const up = rot === 90 ? -1 : 1;           // which end the + plate is at
    ctx.fillText('+', el.at[0] + dx, el.at[1] + up * 13);
    ctx.fillText('−', el.at[0] + dx, el.at[1] - up * 13);
  } else {
    const lr = rot === 0 ? -1 : 1;
    ctx.fillText('+', el.at[0] + lr * 13, el.at[1] - 17);
    ctx.fillText('−', el.at[0] - lr * 13, el.at[1] - 17);
  }
}

function dashedBoxes(ctx, layout, h, fs, t) {
  for (const b of (layout.boxes || [])) {
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = h.soft; ctx.lineWidth = 1.3;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.restore();
    if (b.text) {
      ctx.font = '600 ' + fs + 'px ' + t.font;
      ctx.fillStyle = h.soft; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(b.text, b.x + b.w / 2, b.y + b.h + 4);
    }
  }
}

if (typeof window !== 'undefined' && window.Schematic && window.Schematic.draw &&
    typeof document !== 'undefined' && !window.Schematic.draw.house2A) {
  const plainDraw = window.Schematic.draw;
  const houseDraw = function (canvas, layout, opts) {
    if (!layout.house) return plainDraw(canvas, layout, opts);
    opts = opts || {};
    const t = opts.tokens || {};
    const h = hues(t);
    // the shared engine draws wires, symbols and junctions, with no words and
    // no charge; this page then adds its own bodies, charge and labels
    const bare = Object.assign({}, layout, {
      elements: layout.elements.map(e => Object.assign({}, e, { label: ' ' })),
      terminals: (layout.terminals || []).map(x => Object.assign({}, x, { label: '' }))
    });
    plainDraw(canvas, bare, Object.assign({}, opts, { labels: {}, flow: null }));
    const ctx = canvas.getContext('2d');
    const cssW = canvas.clientWidth, cssH = canvas.clientHeight;
    const scale = Math.min((cssW - 32) / layout.w, (cssH - 32) / layout.h);
    const fs = Math.max(13, LABEL_PX / scale);
    const hot = opts.highlight || new Set();
    dashedBoxes(ctx, layout, h, fs, t);
    for (const el of layout.elements) {
      if (el.type === 'R') drawBody(ctx, el, h, t, hot.has(el.name));
      drawExtras(ctx, el, h);
    }
    if (opts.flow && window.Flow) window.Flow.draw(ctx, layout, opts.flow, window.Schematic.SPAN);
    for (const el of layout.elements) batterySigns(ctx, el, h, fs, t);
    drawLabels(ctx, layout, h, fs, t);
  };
  houseDraw.house2A = true;
  window.Schematic.draw = houseDraw;
}

/*
 * Size the circuit canvas so the drawing comes out at a comfortable scale,
 * and the graph beside it to match. Called by every panel before it draws.
 */
function fitStage(p, lay, graphNeed) {
  const cw = (p.schem && p.schem.clientWidth) || 380;
  const s = Math.min(1.3, (cw - 32) / lay.w);
  const sh = Math.max(230, Math.round(s * lay.h + 32));
  if (p.schem) p.schem.style.height = sh + 'px';
  const side = typeof window !== 'undefined' && window.innerWidth >= 820;
  const gh = side ? Math.max(graphNeed || 230, sh - 30) : (graphNeed || 230);
  p.graph.style.height = gh + 'px';
  p.graph.style.cursor = 'default';
}

/* show only the sliders the current view of an item uses */
function showCtrls(p, ids) {
  if (!p.ctrls) return;
  p.ctrls.querySelectorAll('.ctrl').forEach(box => {
    if (ids.indexOf(box.dataset.ctrl) < 0) box.hidden = true;
  });
}

/* mark which of an item's preset buttons matches the current setting */
function markPreset(p, index) {
  if (!p.presets) return;
  p.presets.querySelectorAll('button').forEach((b, i) =>
    b.setAttribute('aria-pressed', String(i === index)));
}

/* ---------------------------------------------------------------------- */
/* canvas helpers for the graphs: every word at 15 px or more              */
/* ---------------------------------------------------------------------- */

const GF = '"Saira Semi Condensed", "Helvetica Neue", Arial, sans-serif';
const GM = '"IBM Plex Mono", ui-monospace, Consolas, monospace';

function prep(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth, H = canvas.clientHeight;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  const c = canvas.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, W, H);
  return { c, W, H };
}

function textW(c, s, font) { c.font = font; return c.measureText(s).width; }

/*
 * A table drawn as bars: one row per component, one column per quantity,
 * each column scaled to its own largest value, with the figure printed on
 * the bar. rows: [{ name, hot }], cols: [{ title, colour, values, fmt }].
 */
function barTable(canvas, h, rows, cols, opts) {
  opts = opts || {};
  const { c, W, H } = prep(canvas);
  const nameW = Math.max(...rows.map(r => textW(c, r.name, '600 16px ' + GF))) + 14;
  const colW = (W - nameW - 8) / cols.length;
  const top = 30, rowH = Math.min(46, (H - top - 6) / rows.length);
  c.textBaseline = 'middle';
  cols.forEach((col, j) => {
    const x0 = nameW + j * colW;
    c.font = '600 15px ' + GF; c.fillStyle = txt(h, col.colour); c.textAlign = 'left';
    c.fillText(col.title, x0 + 4, 14);
    const max = Math.max(1e-30, ...col.values.map(v => Math.abs(v || 0)));
    rows.forEach((r, i) => {
      const y = top + i * rowH;
      const v = col.values[i];
      const frac = isFinite(v) ? Math.abs(v) / max : 0;
      c.globalAlpha = r.dim ? 0.10 : 0.22;
      c.fillStyle = col.colour;
      c.fillRect(x0 + 2, y + 5, Math.max(0, (colW - 10) * frac), rowH - 10);
      c.globalAlpha = 1;
      if (frac > 0) { c.fillRect(x0 + 2, y + 5, 3, rowH - 10); }
      c.font = (r.hot && col.hotBold ? '600 ' : '500 ') + '16px ' + GM;
      c.fillStyle = r.dim ? h.faint : (col.textColour || h.ink);
      c.fillText(v === null || v === undefined ? '—' : col.fmt(v), x0 + 10, y + rowH / 2);
    });
  });
  rows.forEach((r, i) => {
    const y = top + i * rowH;
    c.font = '600 16px ' + GF; c.fillStyle = r.dim ? h.faint : h.ink; c.textAlign = 'left';
    c.fillText(r.name, 4, y + rowH / 2);
    c.strokeStyle = h.grid; c.lineWidth = 1;
    c.beginPath(); c.moveTo(0, y + rowH + 0.5); c.lineTo(W, y + rowH + 0.5); c.stroke();
    if (r.hot && opts.hotMark) {
      c.fillStyle = opts.hotMark;
      c.font = '600 15px ' + GF; c.textAlign = 'right';
      c.fillText(opts.hotText || 'hottest', W - 4, y + rowH / 2);
    }
  });
}

/* A number line with a shaded band and labelled markers. */
function numberLine(canvas, h, o) {
  const { c, W, H } = prep(canvas);
  const L = 18, R = W - 18, y = Math.round(H * 0.55);
  const X = v => L + (R - L) * (v - o.lo) / (o.hi - o.lo);
  c.strokeStyle = h.soft; c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(L, y); c.lineTo(R, y); c.stroke();
  if (o.band) {
    c.fillStyle = o.band.colour; c.globalAlpha = 0.16;
    c.fillRect(X(o.band.from), y - 24, X(o.band.to) - X(o.band.from), 48);
    c.globalAlpha = 1;
    c.strokeStyle = o.band.colour; c.lineWidth = 1;
    c.strokeRect(X(o.band.from) + 0.5, y - 24, X(o.band.to) - X(o.band.from), 48);
    if (o.band.text) {
      c.font = '600 15px ' + GF; c.fillStyle = txt(h, o.band.colour); c.textAlign = 'center';
      c.textBaseline = 'bottom';
      c.fillText(o.band.text, (X(o.band.from) + X(o.band.to)) / 2, y - 28);
    }
  }
  // ticks
  c.font = '15px ' + GM; c.fillStyle = h.faint; c.textBaseline = 'top'; c.textAlign = 'center';
  (o.ticks || []).forEach(v => {
    c.strokeStyle = h.grid; c.beginPath(); c.moveTo(X(v), y - 4); c.lineTo(X(v), y + 4); c.stroke();
  });
  // markers: each with its text above or below; texts that would collide are
  // moved down a row
  const placed = [];
  (o.marks || []).forEach(m => {
    const x = X(m.x);
    c.strokeStyle = m.colour; c.lineWidth = m.width || 2.5;
    c.beginPath(); c.moveTo(x, y - (m.tall || 30)); c.lineTo(x, y + (m.tall || 30)); c.stroke();
    if (m.dot) { c.fillStyle = m.colour; c.beginPath(); c.arc(x, y, 5, 0, Math.PI * 2); c.fill(); }
    if (!m.text) return;
    c.font = (m.bold ? '600 ' : '500 ') + '15px ' + GF;
    const lines = Array.isArray(m.text) ? m.text : [m.text];
    const w = Math.max(...lines.map(s => c.measureText(s).width));
    let tx = Math.min(R - w / 2, Math.max(L + w / 2, x));
    let row = 0;
    while (placed.some(q => q.row === row && Math.abs(q.x - tx) < (q.w + w) / 2 + 8)) row++;
    placed.push({ x: tx, w: w, row: row });
    c.fillStyle = txt(h, m.colour); c.textAlign = 'center'; c.textBaseline = 'top';
    lines.forEach((s, i) => c.fillText(s, tx, y + 36 + row * 40 + i * 18));
  });
}

/*
 * An x-y plot with its own axes, so its numbers can be 15 px.
 * o: { x: [a, b], y: [a, b], xlog, xFmt, yFmt, xTitle, yTitle, traces, points, hlines, vlines }
 */
function xyPlot(canvas, h, o) {
  const { c, W, H } = prep(canvas);
  c.font = '15px ' + GM;
  const yTicks = o.yTicks || 4;
  const yLabels = [];
  for (let i = 0; i <= yTicks; i++) yLabels.push(o.yFmt(o.y[0] + (o.y[1] - o.y[0]) * i / yTicks));
  const padL = Math.max(...yLabels.map(s => c.measureText(s).width)) + 14;
  const padR = 16, padT = o.yTitle ? 30 : 14, padB = o.xTitle ? 52 : 30;
  const PW = W - padL - padR, PH = H - padT - padB;
  const lx = v => o.xlog ? Math.log10(v) : v;
  const X = v => padL + PW * (lx(v) - lx(o.x[0])) / (lx(o.x[1]) - lx(o.x[0]));
  const Y = v => padT + PH * (1 - (v - o.y[0]) / (o.y[1] - o.y[0]));
  c.strokeStyle = h.grid; c.lineWidth = 1; c.fillStyle = h.faint;
  c.textAlign = 'right'; c.textBaseline = 'middle';
  for (let i = 0; i <= yTicks; i++) {
    const v = o.y[0] + (o.y[1] - o.y[0]) * i / yTicks, yy = Math.round(Y(v)) + 0.5;
    c.beginPath(); c.moveTo(padL, yy); c.lineTo(padL + PW, yy); c.stroke();
    c.fillText(yLabels[i], padL - 8, yy);
  }
  const xt = o.xTicks || [0, 1, 2, 3, 4].map(i => o.xlog
    ? Math.pow(10, lx(o.x[0]) + (lx(o.x[1]) - lx(o.x[0])) * i / 4)
    : o.x[0] + (o.x[1] - o.x[0]) * i / 4);
  c.textAlign = 'center'; c.textBaseline = 'top';
  xt.forEach((v, i) => {
    const xx = Math.round(X(v)) + 0.5;
    c.beginPath(); c.moveTo(xx, padT); c.lineTo(xx, padT + PH); c.stroke();
    const s = o.xFmt(v);
    const w = c.measureText(s).width;
    const cx = Math.min(W - w / 2 - 2, Math.max(padL + w / 2 - 20, xx));
    c.fillText(s, cx, padT + PH + 7);
  });
  if (o.xTitle) {
    c.font = '600 15px ' + GF; c.fillStyle = h.soft; c.textAlign = 'center'; c.textBaseline = 'bottom';
    c.fillText(o.xTitle, padL + PW / 2, H - 2);
  }
  if (o.yTitle) {
    c.font = '600 15px ' + GF; c.fillStyle = h.soft; c.textAlign = 'left'; c.textBaseline = 'top';
    c.fillText(o.yTitle, 2, 2);
  }
  c.save();
  c.beginPath(); c.rect(padL, padT - 2, PW, PH + 4); c.clip();
  (o.bands || []).forEach(b => {
    c.fillStyle = b.colour; c.globalAlpha = 0.12;
    c.fillRect(X(b.from), padT, X(b.to) - X(b.from), PH); c.globalAlpha = 1;
  });
  (o.hlines || []).forEach(l => {
    c.strokeStyle = l.colour; c.lineWidth = 1.4; c.setLineDash([5, 4]);
    c.beginPath(); c.moveTo(padL, Y(l.y)); c.lineTo(padL + PW, Y(l.y)); c.stroke(); c.setLineDash([]);
  });
  (o.vlines || []).forEach(l => {
    c.strokeStyle = l.colour; c.lineWidth = l.width || 1.4; c.setLineDash(l.solid ? [] : [5, 4]);
    c.beginPath(); c.moveTo(X(l.x), padT); c.lineTo(X(l.x), padT + PH); c.stroke(); c.setLineDash([]);
  });
  (o.traces || []).forEach(tr => {
    c.strokeStyle = tr.colour; c.lineWidth = tr.width || 2.4; c.setLineDash(tr.dash || []);
    c.beginPath();
    tr.pts.forEach((q, i) => { const xx = X(q.x), yy = Y(q.y); i ? c.lineTo(xx, yy) : c.moveTo(xx, yy); });
    c.stroke(); c.setLineDash([]);
  });
  c.restore();
  (o.points || []).forEach(q => {
    if (q.ring) {
      // a hollow ring, so a point in the mark colour cannot be taken for an ink trace
      c.beginPath(); c.arc(X(q.x), Y(q.y), 7, 0, Math.PI * 2);
      c.fillStyle = h.surface; c.fill();
      c.strokeStyle = q.colour; c.lineWidth = 3; c.stroke();
      return;
    }
    c.fillStyle = q.colour; c.beginPath(); c.arc(X(q.x), Y(q.y), 6, 0, Math.PI * 2); c.fill();
    c.strokeStyle = h.surface; c.lineWidth = 2; c.stroke();
  });
  // text pinned to the plot, kept inside it
  (o.labels || []).forEach(l => {
    c.font = (l.bold ? '600 ' : '500 ') + '15px ' + GF;
    c.fillStyle = txt(h, l.colour);
    const w = c.measureText(l.text).width;
    let x = X(l.x) + (l.dx || 0), y = Y(l.y) + (l.dy || 0);
    let align = l.align || 'left';
    if (align === 'left' && x + w > padL + PW) { align = 'right'; x = X(l.x) - (l.dx || 0); }
    if (align === 'right' && x - w < padL) { align = 'left'; x = X(l.x) + Math.abs(l.dx || 0); }
    y = Math.max(padT + 9, Math.min(padT + PH - 9, y));
    c.textAlign = align; c.textBaseline = 'middle';
    c.fillText(l.text, x, y);
  });
}

/* A column split into the voltages that add up to the supply. */
function voltStack(canvas, h, o) {
  const { c, W, H } = prep(canvas);
  const top = 22, bot = H - 22, x0 = 26, bw = Math.min(110, W * 0.22);
  const total = o.supply;
  const Yv = v => bot - (bot - top) * v / total;
  // supply column
  c.fillStyle = h.v; c.globalAlpha = 0.14; c.fillRect(x0, top, bw * 0.45, bot - top); c.globalAlpha = 1;
  c.strokeStyle = h.v; c.lineWidth = 1.5; c.strokeRect(x0 + 0.5, top + 0.5, bw * 0.45, bot - top);
  c.save(); c.translate(x0 + bw * 0.225, (top + bot) / 2); c.rotate(-Math.PI / 2);
  c.font = '600 15px ' + GF; c.fillStyle = h.v; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('supply ' + aeng(total, 'V', 4), 0, 0); c.restore();
  // the parts, from the top of the chain down
  const sx = x0 + bw * 0.45 + 18;
  let v = total;
  o.parts.forEach((part, i) => {
    const yTop = Yv(v), yBot = Yv(v - part.v);
    c.fillStyle = h.v; c.globalAlpha = 0.10 + 0.14 * (i % 2); c.fillRect(sx, yTop, bw, yBot - yTop); c.globalAlpha = 1;
    c.strokeStyle = h.v; c.lineWidth = 1.2; c.strokeRect(sx + 0.5, yTop + 0.5, bw, yBot - yTop);
    c.font = '600 16px ' + GF; c.fillStyle = h.ink; c.textAlign = 'left'; c.textBaseline = 'middle';
    const ym = (yTop + yBot) / 2;
    if (yBot - yTop >= 18) {
      c.fillText(part.name, sx + bw + 12, ym);
      c.font = '500 16px ' + GM; c.fillStyle = h.v;
      c.fillText(aeng(part.v, 'V', 4), sx + bw + 12 + textW(c, part.name + '  ', '600 16px ' + GF), ym);
    }
    v -= part.v;
  });
  // taps: where an output is taken, measured from the bottom rail
  (o.taps || []).forEach(tp => {
    const y = Yv(tp.v);
    c.strokeStyle = tp.colour || h.mark; c.lineWidth = 2; c.setLineDash(tp.solid ? [] : [6, 4]);
    c.beginPath(); c.moveTo(sx - 6, y); c.lineTo(W - 8, y); c.stroke(); c.setLineDash([]);
    c.font = '600 15px ' + GF; c.fillStyle = txt(h, tp.colour || h.mark); c.textAlign = 'right'; c.textBaseline = 'bottom';
    c.fillText(tp.text, W - 8, y - 3);
  });
  c.font = '15px ' + GF; c.fillStyle = h.faint; c.textAlign = 'left'; c.textBaseline = 'top';
  c.fillText('0 V', x0, bot + 3);
}

/* P = V × I as the area of a rectangle: height volts, width amps. */
function powerRect(canvas, h, o) {
  const { c, W, H } = prep(canvas);
  const padL = 64, padB = 44, padT = 32, padR = 20;
  const PW = W - padL - padR, PH = H - padT - padB;
  const X = i => padL + PW * i / o.iMax, Y = v => padT + PH * (1 - v / o.vMax);
  c.strokeStyle = h.grid; c.lineWidth = 1;
  c.font = '15px ' + GM; c.fillStyle = h.faint;
  for (let k = 0; k <= 4; k++) {
    const v = o.vMax * k / 4, yy = Math.round(Y(v)) + 0.5;
    c.beginPath(); c.moveTo(padL, yy); c.lineTo(padL + PW, yy); c.stroke();
    c.textAlign = 'right'; c.textBaseline = 'middle'; c.fillText(aeng(v, 'V', 2), padL - 8, yy);
    const i = o.iMax * k / 4, xx = Math.round(X(i)) + 0.5;
    c.beginPath(); c.moveTo(xx, padT); c.lineTo(xx, padT + PH); c.stroke();
    c.textAlign = 'center'; c.textBaseline = 'top'; c.fillText(aeng(i, 'A', 2), xx, padT + PH + 6);
  }
  c.font = '600 15px ' + GF; c.fillStyle = h.soft; c.textAlign = 'left'; c.textBaseline = 'top';
  c.fillText('voltage, the height', 2, 2);
  const x1 = X(Math.min(o.I, o.iMax)), y1 = Y(Math.min(o.V, o.vMax));
  c.fillStyle = h.p; c.globalAlpha = 0.22; c.fillRect(padL, y1, x1 - padL, padT + PH - y1); c.globalAlpha = 1;
  c.strokeStyle = h.p; c.lineWidth = 2; c.strokeRect(padL, y1, x1 - padL, padT + PH - y1);
  c.strokeStyle = h.v; c.lineWidth = 3; c.beginPath(); c.moveTo(padL, y1); c.lineTo(padL, padT + PH); c.stroke();
  c.strokeStyle = h.i; c.beginPath(); c.moveTo(padL, padT + PH); c.lineTo(x1, padT + PH); c.stroke();
  c.font = '600 16px ' + GF; c.fillStyle = h.p; c.textAlign = 'center'; c.textBaseline = 'middle';
  const label = 'P = ' + aeng(o.P, 'W', 3);
  const lw = textW(c, label, '600 16px ' + GF);
  if (x1 - padL > lw + 10 && padT + PH - y1 > 24) c.fillText(label, (padL + x1) / 2, (y1 + padT + PH) / 2);
  else { c.textAlign = 'left'; c.fillText(label, Math.min(x1 + 8, W - lw - 4), Math.max(padT + 10, y1 - 12)); }
  c.font = '600 15px ' + GF; c.fillStyle = h.soft; c.textAlign = 'center'; c.textBaseline = 'bottom';
  c.fillText('current, the width', padL + PW / 2, H - 2);
}

/* ---------------------------------------------------------------------- */
/* the circuits: layout and the steady currents each conductor carries     */
/* ---------------------------------------------------------------------- */

// a wire, carrying the named current from its first end to its second
const wire = (x1, y1, x2, y2, n) => [x1, y1, x2, y2, n];
// move a whole layout down (and right), to leave room for labels above it
function shiftLayout(lay, dx, dy) {
  const mv = pt => [pt[0] + dx, pt[1] + dy];
  lay.elements.forEach(e => { e.at = mv(e.at); });
  lay.wires = lay.wires.map(w => [w[0] + dx, w[1] + dy, w[2] + dx, w[3] + dy, w[4]]);
  (lay.notes || []).forEach(n => { n.at = mv(n.at); });
  (lay.terminals || []).forEach(t => { t.at = mv(t.at); });
  if (lay.grounds) lay.grounds = lay.grounds.map(mv);
  (lay.boxes || []).forEach(b => { b.x += dx; b.y += dy; });
  lay.w += dx; lay.h += dy;
  return lay;
}
// a round number at or above x, for an axis: 1, 2, 4, 5 or 8 times a power of ten
// chosen so that a quarter of each is a round number too, for four grid lines
function niceMax(x) {
  if (!(x > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  for (const m of [1, 1.2, 1.6, 2, 2.4, 3.2, 4, 4.8, 6, 8, 10]) if (m * p >= x * 0.9999) return m * p;
  return 10 * p;
}
const quarters = m => [0, m / 4, m / 2, 3 * m / 4, m];
// every conductor dead: what an open circuit looks like
function dead(lay) {
  lay.wires.forEach(w => { w[4] = '-'; });
  lay.elements.forEach(e => { if (e.type !== 'B' && e.type !== 'V' && !(e.type === 'S' && e.open)) e.flow = '-'; });
  return lay;
}

/* 2A1 Foundation: battery, ammeter, lamp, and the gap with the material in it */
function materialsCircuit(d) {
  const m = MATERIALS[d.matIdx];
  const I = d.matI;
  const lay = {
    house: true, w: 250, h: 232,
    elements: [
      { name: 'V1', type: 'B', at: [30, 110], rot: 90, label: 'battery', value: MAT_V + ANB + 'V', valueColour: 'v' },
      { name: 'RM', type: 'M', at: [110, 40], rot: 0, reading: Math.min(1, I / 0.25),
        label: 'ammeter', flow: 'I' },
      { name: 'RL', type: 'R', kind: 'lamp', at: [205, 100], rot: 90, label: 'lamp',
        glow: Math.min(1, I / 0.2), flow: 'I' },
      { name: 'RX', type: 'R', kind: 'sample', at: [118, 190], rot: 180, label: m.name,
        labelAt: 'below', fill: m.fill, wet: m.kind === 'wet', flow: 'I' }
    ],
    wires: [
      wire(30, 80, 30, 40, 'I'), wire(30, 40, 80, 40, 'I'), wire(140, 40, 205, 40, 'I'),
      wire(205, 40, 205, 70, 'I'), wire(205, 130, 205, 190, 'I'), wire(205, 190, 148, 190, 'I'),
      wire(88, 190, 30, 190, 'I'), wire(30, 190, 30, 140, 'I')
    ],
    notes: [{ at: [118, 166], text: 'the gap', c: 'soft', mono: false }]
  };
  if (!(I > 0)) dead(lay);
  return { layout: lay, currents: { I: I } };
}

/* 2A1 Intermediate and 2C1 Foundation: a supply, an ammeter, one resistor and
   a voltmeter across it. The voltmeter takes no current. */
function ohmCircuit(V, R, I, names) {
  names = names || {};
  const lay = {
    house: true, w: 315, h: 250,
    elements: [
      { name: 'V1', type: 'B', at: [35, 140], rot: 90, label: names.supply || 'supply',
        value: aeng(V, 'V', 4), valueColour: 'v' },
      { name: 'RM', type: 'M', at: [120, 65], rot: 0, meter: 'A', label: 'ammeter', flow: 'I',
        value: aeng(I, 'A', 4), valueColour: 'i' },
      { name: 'R1', type: 'R', at: [210, 140], rot: 90, label: names.r || 'R', labelAt: 'left',
        value: names.rValue || aeng(R, 'Ω', 4), valueColour: names.rColour || 'r', flow: 'I', heat: names.heat || 0 },
      { name: 'VM', type: 'M', at: [285, 140], rot: 90, meter: 'V', flow: '-' }
    ],
    wires: [
      wire(35, 110, 35, 65, 'I'), wire(35, 65, 90, 65, 'I'), wire(150, 65, 210, 65, 'I'),
      wire(210, 65, 210, 110, 'I'), wire(210, 170, 210, 220, 'I'), wire(210, 220, 35, 220, 'I'),
      wire(35, 220, 35, 170, 'I'),
      wire(210, 65, 285, 65, '-'), wire(285, 65, 285, 110, '-'),
      wire(285, 170, 285, 220, '-'), wire(285, 220, 210, 220, '-')
    ],
    notes: [{ at: [247, 140], text: aeng(V, 'V', 3), c: 'v' },
            { at: [285, 237], text: 'voltmeter', c: 'soft', mono: false }]
  };
  if (!(I > 0)) dead(lay);
  return { layout: lay, currents: { I: I } };
}

/* 2A2 Foundation: two lamps in series, with a switch */
function seriesLamps(d, open) {
  const I = open ? 0 : d.sI;
  const lay = {
    house: true, w: 270, h: 235,
    elements: [
      { name: 'V1', type: 'B', at: [30, 120], rot: 90, label: 'battery', value: aeng(d.sv, 'V', 3), valueColour: 'v' },
      { name: 'S1', type: 'S', at: [95, 40], rot: 0, label: open ? 'switch open' : 'switch', open: !!open,
        flow: open ? undefined : 'I' },
      { name: 'LA', type: 'R', kind: 'lamp', at: [185, 40], rot: 0, label: 'lamp A',
        glow: lampGlow(I * I * LAMP_A), flow: 'I',
        value: open ? '' : aeng(d.sVA, 'V', 3) + ' across', valueColour: 'v' },
      { name: 'LB', type: 'R', kind: 'lamp', at: [225, 125], rot: 90, label: 'lamp B', labelAt: 'left',
        glow: lampGlow(I * I * LAMP_B), flow: 'I',
        value: open ? '' : aeng(d.sVB, 'V', 3) + ' across', valueColour: 'v' }
    ],
    wires: [
      wire(30, 90, 30, 40, 'I'), wire(30, 40, 65, 40, 'I'), wire(125, 40, 155, 40, 'I'),
      wire(215, 40, 225, 40, 'I'), wire(225, 40, 225, 95, 'I'), wire(225, 155, 225, 205, 'I'),
      wire(225, 205, 30, 205, 'I'), wire(30, 205, 30, 150, 'I')
    ],
    notes: open ? [{ at: [128, 222], text: 'no current anywhere', c: 'soft', mono: false }]
      : [{ at: [128, 222], text: aeng(I, 'A', 3) + ' here', c: 'i' },
         { at: [48, 64], text: aeng(I, 'A', 3), c: 'i', align: 'left' }]
  };
  if (open) dead(lay);
  shiftLayout(lay, 0, 28);
  return { layout: lay, currents: { I: I } };
}

/* 2A2 Foundation and 2C1 Foundation: two loads in parallel. With a switch in
   branch B for 2A2, which can cut that branch alone. */
function parallelPair(o) {
  const IA = o.IA, IB = o.cut ? 0 : o.IB, IT = IA + IB;
  const lamp = !!o.lamps;
  const els = [
    { name: 'V1', type: 'B', at: [30, 130], rot: 90, label: o.supplyName || 'battery',
      value: aeng(o.V, 'V', 3), valueColour: 'v' },
    Object.assign({ name: 'LA', type: 'R', at: [120, 140], rot: 90, label: o.nameA,
      flow: 'A', value: o.valA, valueColour: o.valAColour || 'r', value2: o.val2A, value2Colour: 'i' },
      lamp ? { kind: 'lamp', glow: lampGlow(IA * o.V) } : {}),
    Object.assign({ name: 'LB', type: 'R', at: [210, 140], rot: 90, label: o.nameB,
      flow: o.cut ? '-' : 'B', value: o.valB, valueColour: o.valBColour || 'r', value2: o.val2B, value2Colour: 'i' },
      lamp ? { kind: 'lamp', glow: o.cut ? 0 : lampGlow(IB * o.V) } : {})
  ];
  const wires = [
    wire(30, 100, 30, 40, 'T'), wire(30, 40, 120, 40, 'T'), wire(120, 40, 210, 40, o.cut ? '-' : 'B'),
    wire(120, 40, 120, 110, 'A'), wire(120, 170, 120, 210, 'A'),
    wire(210, 170, 210, 210, o.cut ? '-' : 'B'), wire(210, 210, 120, 210, o.cut ? '-' : 'B'),
    wire(120, 210, 30, 210, 'T'), wire(30, 210, 30, 160, 'T')
  ];
  if (o.withSwitch) {
    els.push({ name: 'S2', type: 'S', at: [210, 75], rot: 90, label: o.cut ? 'cut' : '', open: !!o.cut,
               labelAt: 'left', flow: o.cut ? undefined : 'B' });
    wires.push(wire(210, 40, 210, 45, o.cut ? '-' : 'B'), wire(210, 105, 210, 110, o.cut ? '-' : 'B'));
  } else {
    wires.push(wire(210, 40, 210, 110, 'B'));
  }
  const lay = {
    house: true, w: 285, h: 240, elements: els, wires: wires,
    notes: [{ at: [75, 225], text: aeng(IT, 'A', 3) + ' in total', c: 'i' }]
  };
  return { layout: lay, currents: { T: IT, A: IA, B: IB } };
}

/* three resistors round a loop: 2C2 Foundation and 2C1 Intermediate */
function seriesThree(V, Rs, I, opts) {
  opts = opts || {};
  const Vs = Rs.map(r => I * r);
  const heat = opts.heat ? Vs.map((v, k) => (v * I) / Math.max(...Vs.map(x => x * I))) : [0, 0, 0];
  // two resistors leave the bottom of the loop a plain wire
  const two = Rs.length === 2;
  const lay = {
    house: true, w: 285, h: 262,
    elements: [
      { name: 'V1', type: 'B', at: [30, 125], rot: 90, label: 'supply', value: aeng(V, 'V', 4), valueColour: 'v' },
      { name: 'R1', type: 'R', at: [115, 45], rot: 0, label: 'R1', value: aeng(Rs[0], 'Ω', 3),
        value2: aeng(Vs[0], 'V', 4), flow: 'I', heat: heat[0] },
      { name: 'R2', type: 'R', at: [215, 125], rot: 90, label: 'R2', value: aeng(Rs[1], 'Ω', 3),
        value2: aeng(Vs[1], 'V', 4), flow: 'I', heat: heat[1] }
    ].concat(two ? [] : [
      { name: 'R3', type: 'R', at: [120, 205], rot: 180, label: 'R3', labelAt: 'below', value: aeng(Rs[2], 'Ω', 3),
        value2: aeng(Vs[2], 'V', 4), flow: 'I', heat: heat[2] }
    ]),
    wires: [
      wire(30, 95, 30, 45, 'I'), wire(30, 45, 85, 45, 'I'), wire(145, 45, 215, 45, 'I'),
      wire(215, 45, 215, 95, 'I'), wire(215, 155, 215, 205, 'I')
    ].concat(two ? [wire(215, 205, 30, 205, 'I')]
                 : [wire(215, 205, 150, 205, 'I'), wire(90, 205, 30, 205, 'I')],
             [wire(30, 205, 30, 155, 'I')]),
    notes: [{ at: [120, 125], text: aeng(I, 'A', 4), c: 'i' },
            { at: [120, 146], text: 'everywhere', c: 'soft', mono: false }]
  };
  shiftLayout(lay, 0, 24);
  return { layout: lay, currents: { I: I } };
}

/* three resistors side by side: 2C1 Intermediate */
function parallelThree(V, Rs) {
  const I = Rs.map(r => V / r), IT = I.reduce((a, b) => a + b, 0);
  const xs = [110, 185, 260];
  const els = [{ name: 'V1', type: 'B', at: [30, 130], rot: 90, label: 'supply', value: aeng(V, 'V', 4), valueColour: 'v' }];
  const names = ['R1', 'R2', 'R3'].slice(0, Rs.length);
  names.forEach((n, k) => els.push({ name: n, type: 'R', at: [xs[k], 130], rot: 90, label: n,
    value: aeng(Rs[k], 'Ω', 3), value2: aeng(I[k], 'A', 3), value2Colour: 'i', flow: n }));
  if (Rs.length === 2) {
    return { layout: { house: true, w: 260, h: 240, elements: els,
      wires: [
        wire(30, 100, 30, 40, 'T'), wire(30, 40, 110, 40, 'T'), wire(110, 40, 185, 40, 'R2'),
        wire(110, 40, 110, 100, 'R1'), wire(185, 40, 185, 100, 'R2'),
        wire(110, 160, 110, 220, 'R1'), wire(185, 160, 185, 220, 'R2'),
        wire(185, 220, 110, 220, 'R2'), wire(110, 220, 30, 220, 'T'), wire(30, 220, 30, 160, 'T')
      ],
      notes: [{ at: [70, 232], text: aeng(IT, 'A', 3), c: 'i' }] },
      currents: { T: IT, R1: I[0], R2: I[1] } };
  }
  const lay = {
    house: true, w: 330, h: 240, elements: els,
    wires: [
      wire(30, 100, 30, 40, 'T'), wire(30, 40, 110, 40, 'T'), wire(110, 40, 185, 40, 'S23'), wire(185, 40, 260, 40, 'R3'),
      wire(110, 40, 110, 100, 'R1'), wire(185, 40, 185, 100, 'R2'), wire(260, 40, 260, 100, 'R3'),
      wire(110, 160, 110, 220, 'R1'), wire(185, 160, 185, 220, 'R2'), wire(260, 160, 260, 220, 'R3'),
      wire(260, 220, 185, 220, 'R3'), wire(185, 220, 110, 220, 'S23'), wire(110, 220, 30, 220, 'T'),
      wire(30, 220, 30, 160, 'T')
    ],
    notes: [{ at: [70, 232], text: aeng(IT, 'A', 3), c: 'i' }]
  };
  return { layout: lay, currents: { T: IT, S23: I[1] + I[2], R1: I[0], R2: I[1], R3: I[2] } };
}

/* R1 in series with R2 and R3 in parallel: 2C1 Intermediate */
function comboThree(V, Rs) {
  const Rp = par(Rs[1], Rs[2]), RT = Rs[0] + Rp, I = V / RT, Vp = I * Rp;
  const I2 = Vp / Rs[1], I3 = Vp / Rs[2];
  const lay = {
    house: true, w: 330, h: 252,
    elements: [
      { name: 'V1', type: 'B', at: [30, 130], rot: 90, label: 'supply', value: aeng(V, 'V', 4), valueColour: 'v' },
      { name: 'R1', type: 'R', at: [115, 40], rot: 0, label: 'R1', value: aeng(Rs[0], 'Ω', 3),
        value2: aeng(I * Rs[0], 'V', 4), flow: 'R1' },
      { name: 'R2', type: 'R', at: [190, 130], rot: 90, label: 'R2', value: aeng(Rs[1], 'Ω', 3),
        value2: aeng(I2, 'A', 3), value2Colour: 'i', flow: 'R2' },
      { name: 'R3', type: 'R', at: [270, 130], rot: 90, label: 'R3', value: aeng(Rs[2], 'Ω', 3),
        value2: aeng(I3, 'A', 3), value2Colour: 'i', flow: 'R3' }
    ],
    wires: [
      wire(30, 100, 30, 40, 'R1'), wire(30, 40, 85, 40, 'R1'), wire(145, 40, 190, 40, 'R1'),
      wire(190, 40, 270, 40, 'R3'), wire(190, 40, 190, 100, 'R2'), wire(270, 40, 270, 100, 'R3'),
      wire(190, 160, 190, 220, 'R2'), wire(270, 160, 270, 220, 'R3'), wire(270, 220, 190, 220, 'R3'),
      wire(190, 220, 30, 220, 'R1'), wire(30, 220, 30, 160, 'R1')
    ],
    notes: [{ at: [230, 236], text: aeng(Vp, 'V', 4) + ' across the pair', c: 'v' },
            { at: [90, 236], text: aeng(I, 'A', 3), c: 'i' }]
  };
  shiftLayout(lay, 0, 30);
  return { layout: lay, currents: { R1: I, R2: I2, R3: I3 } };
}

/* cells in series along the bottom, or side by side: 2C1 Intermediate */
function cellsCircuit(n, inSeries, RL) {
  const els = [], wires = [], currents = {};
  if (inSeries) {
    const E = n * CELL_V, I = E / RL;
    for (let k = 0; k < n; k++) {
      els.push({ name: 'B' + (k + 1), type: 'B', at: [60 + 60 * k, 200], rot: 0,
                 label: '', value: k === 0 ? '' : '' });
    }
    const xr = 30 + 60 * n + 30;
    const xm = (30 + xr) / 2;
    els.push({ name: 'RL', type: 'R', at: [xm, 50], rot: 0, label: 'load ' + aeng(RL, 'Ω', 3),
               value: aeng(E, 'V', 3), valueColour: 'v', flow: 'I' });
    wires.push(wire(30, 200, 30, 50, 'I'), wire(30, 50, xm - 30, 50, 'I'), wire(xm + 30, 50, xr, 50, 'I'),
               wire(xr, 50, xr, 200, 'I'), wire(xr, 200, 30 + 60 * n, 200, 'I'));
    currents.I = I;
    return { layout: { house: true, w: Math.max(260, xr + 30), h: 250, elements: els, wires: wires,
      notes: [{ at: [30 + 30 * n, 232], text: n + ' cells: ' + aeng(E, 'V', 3), c: 'v' },
              { at: [xm, 125], text: aeng(I, 'A', 3), c: 'i' }] }, currents: currents };
  }
  const I = CELL_V / RL, Ic = I / n;
  const x = k => 40 + 60 * k;
  for (let k = 0; k < n; k++) {
    els.push({ name: 'B' + (k + 1), type: 'B', at: [x(k), 125], rot: 90, label: '', labelAt: 'left' });
    currents['C' + (k + 1)] = Ic;
    currents['S' + (k + 1)] = Ic * (k + 1);
    wires.push(wire(x(k), 95, x(k), 40, 'C' + (k + 1)), wire(x(k), 210, x(k), 155, 'C' + (k + 1)));
    if (k > 0) {
      wires.push(wire(x(k - 1), 40, x(k), 40, 'S' + k), wire(x(k), 210, x(k - 1), 210, 'S' + k));
    }
  }
  const xr = x(n - 1) + 80;
  els.push({ name: 'RL', type: 'R', at: [xr, 125], rot: 90, label: 'load', value: aeng(RL, 'Ω', 3),
             value2: aeng(I, 'A', 3), value2Colour: 'i', flow: 'S' + n });
  wires.push(wire(x(n - 1), 40, xr, 40, 'S' + n), wire(xr, 40, xr, 95, 'S' + n),
             wire(xr, 155, xr, 210, 'S' + n), wire(xr, 210, x(n - 1), 210, 'S' + n));
  return { layout: { house: true, w: Math.max(260, xr + 70), h: 240, elements: els, wires: wires,
    notes: [{ at: [x(0) + 30 * (n - 1), 230], text: aeng(Ic, 'A', 3) + ' from each cell', c: 'i' }] },
    currents: currents };
}

/* a two or three resistor divider, drawn the way the bank draws one */
function dividerCircuit(o) {
  const V = o.V, R1 = o.R1, R2 = o.R2;
  const three = o.R3 > 0;
  const RL = o.RL > 0 ? o.RL : 0;
  const els = [], wires = [], notes = [];
  const lbl = o.labels || {};
  if (!three) {
    const R2e = RL ? par(R2, RL) : R2;
    const I = V / (R1 + R2e), Vout = I * R2e, I2 = Vout / R2, IL = RL ? Vout / RL : 0;
    els.push({ name: 'V1', type: 'B', at: [30, 130], rot: 90, label: 'supply', value: aeng(V, 'V', 4), valueColour: 'v' },
             { name: 'R1', type: 'R', at: [130, 75], rot: 90, label: lbl.r1 || 'R1', value: lbl.v1 || aeng(R1, 'Ω', 3),
               labelAt: 'left', flow: 'I' },
             { name: 'R2', type: 'R', at: [130, 170], rot: 90, label: lbl.r2 || 'R2', value: lbl.v2 || aeng(R2, 'Ω', 3),
               labelAt: 'left', flow: 'I2' });
    wires.push(wire(30, 100, 30, 30, 'I'), wire(30, 30, 130, 30, 'I'), wire(130, 30, 130, 45, 'I'),
               wire(130, 105, 130, 122, 'I'), wire(130, 122, 130, 140, 'I2'),
               wire(130, 200, 130, 225, 'I2'), wire(130, 225, 30, 225, 'I'), wire(30, 225, 30, 160, 'I'));
    const terms = [];
    if (RL) {
      els.push({ name: 'RL', type: 'R', at: [215, 170], rot: 90, label: 'load', value: aeng(RL, 'Ω', 3), flow: 'IL' });
      wires.push(wire(130, 122, 215, 122, 'IL'), wire(215, 122, 215, 140, 'IL'),
                 wire(215, 200, 215, 225, 'IL'), wire(215, 225, 130, 225, 'IL'));
      notes.push({ at: [172, 108], text: aeng(Vout, 'V', 4), c: 'v' });
    } else {
      wires.push(wire(130, 122, 190, 122, '-'));
      terms.push({ at: [190, 122], text: lbl.out || 'out' });
      notes.push({ at: [196, 146], text: aeng(Vout, 'V', 4), c: 'v', align: 'left' });
    }
    const currents = { I: I, I2: I2 };
    if (RL) currents.IL = IL;
    return { layout: { house: true, w: o.w || 285, h: 245, elements: els, wires: wires,
      terminals: terms, notes: notes }, currents: currents, Vout: Vout, I: I };
  }
  const R3 = o.R3, RT = R1 + R2 + R3, I = V / RT;
  const VA = I * (R2 + R3), VB = I * R3;
  els.push({ name: 'V1', type: 'B', at: [30, 160], rot: 90, label: 'supply', value: aeng(V, 'V', 4), valueColour: 'v' },
           { name: 'R1', type: 'R', at: [130, 70], rot: 90, label: 'R1', value: aeng(R1, 'Ω', 3), flow: 'I' },
           { name: 'R2', type: 'R', at: [130, 160], rot: 90, label: 'R2', value: aeng(R2, 'Ω', 3), flow: 'I' },
           { name: 'R3', type: 'R', at: [130, 250], rot: 90, label: 'R3', value: aeng(R3, 'Ω', 3), flow: 'I' });
  wires.push(wire(30, 130, 30, 25, 'I'), wire(30, 25, 130, 25, 'I'), wire(130, 25, 130, 40, 'I'),
             wire(130, 100, 130, 115, 'I'), wire(130, 115, 130, 130, 'I'),
             wire(130, 190, 130, 205, 'I'), wire(130, 205, 130, 220, 'I'),
             wire(130, 280, 130, 300, 'I'), wire(130, 300, 30, 300, 'I'), wire(30, 300, 30, 190, 'I'),
             wire(130, 115, 215, 115, '-'), wire(130, 205, 215, 205, '-'));
  return { layout: { house: true, w: 285, h: 318, elements: els, wires: wires,
    terminals: [{ at: [215, 115], text: 'A' }, { at: [215, 205], text: 'B' }],
    notes: [{ at: [222, 137], text: aeng(VA, 'V', 4), c: 'v', align: 'left' },
            { at: [222, 227], text: aeng(VB, 'V', 4), c: 'v', align: 'left' }] },
    currents: { I: I }, VA: VA, VB: VB, I: I };
}

/* 2A1 Full: the tuned circuit of an oscillator */
function tankCircuit(d) {
  const lay = {
    house: true, w: 250, h: 200,
    elements: [
      { name: 'L1', type: 'L', at: [70, 100], rot: 90, label: 'L', labelAt: 'left',
        value: signed(d.el) + ANB + '%', flow: 'IL' },
      { name: 'C1', type: 'C', at: [170, 100], rot: 90, label: 'C',
        value: signed(d.ec) + ANB + '%', flow: 'IL', flowReversed: true }
    ],
    wires: [wire(70, 130, 70, 165, 'IL'), wire(70, 165, 170, 165, 'IL'), wire(170, 165, 170, 130, 'IL'),
            wire(170, 70, 170, 35, 'IL'), wire(170, 35, 70, 35, 'IL'), wire(70, 35, 70, 70, 'IL')],
    notes: [{ at: [120, 100], text: aeng(d.fAct, 'Hz', 4), c: 'soft' },
            { at: [120, 186], text: 'the oscillator’s tuned circuit', c: 'soft', mono: false }]
  };
  return { layout: lay, currents: { IL: { re: 1, im: 0 } } };
}

/* 2A1 Full: a coupling capacitor feeding the next stage's input resistance */
function couplingCircuit(C) {
  const lay = {
    house: true, w: 285, h: 215,
    elements: [
      { name: 'V1', type: 'V', at: [30, 110], rot: 90, label: 'signal', labelAt: 'right' },
      { name: 'C1', type: 'C', at: [105, 40], rot: 0, label: 'C1', value: aeng(C, 'F', 3) },
      { name: 'R1', type: 'R', at: [185, 115], rot: 90, label: 'input R', value: aeng(COUPLE_R, 'Ω', 3) }
    ],
    wires: [wire(30, 80, 30, 40, 'C1'), wire(30, 40, 75, 40, 'C1'), wire(135, 40, 185, 40, 'C1'),
            wire(185, 40, 185, 85, 'R1'), wire(185, 40, 245, 40, '-'),
            wire(185, 145, 185, 185, 'R1'), wire(185, 185, 105, 185, 'R1'), wire(105, 185, 30, 185, 'R1'),
            wire(30, 185, 30, 140, 'R1')],
    grounds: [[105, 185]],
    terminals: [{ at: [245, 40] }],
    notes: [{ at: [245, 20], text: 'to the stage', c: 'soft', mono: false, align: 'right' }]
  };
  return { layout: lay, netlist: 'V1 in 0 1\nC1 in out ' + AF.sci(C) + '\nR1 out 0 ' + AF.sci(COUPLE_R) };
}

/* 2B1 Full: the network in bank questions 7666 and 7667 */
function networkCircuit(n, R) {
  const P = [n.P1, n.P2, n.P3, n.P4];
  const pMax = Math.max(...P);
  const hot = P.indexOf(pMax);
  const els = [
    { name: 'V1', type: 'B', at: [30, 170], rot: 90, label: 'battery', value: aeng(n.Vs, 'V', 4), valueColour: 'v' },
    { name: 'R1', type: 'R', at: [142, 60], rot: 0, label: 'R1', value: aeng(R[0], 'Ω', 3),
      value2: aeng(n.Vp, 'V', 4), flow: 'R1', heat: P[0] / pMax },
    { name: 'R2', type: 'R', at: [100, 140], rot: 0, label: 'R2', value: aeng(R[1], 'Ω', 3),
      value2: aeng(n.V2, 'V', 4), flow: 'R2', heat: P[1] / pMax },
    { name: 'R3', type: 'R', at: [185, 140], rot: 0, label: 'R3', value: aeng(R[2], 'Ω', 3),
      value2: aeng(n.V3, 'V', 4), flow: 'R2', heat: P[2] / pMax },
    { name: 'R4', type: 'R', at: [280, 170], rot: 90, label: 'R4', value: aeng(R[3], 'Ω', 3),
      value2: aeng(n.V4, 'V', 4), flow: 'IT', heat: P[3] / pMax }
  ];
  const wires = [
    wire(30, 140, 30, 100, 'IT'), wire(30, 100, 50, 100, 'IT'),
    wire(50, 100, 50, 60, 'R1'), wire(50, 60, 112, 60, 'R1'), wire(172, 60, 235, 60, 'R1'), wire(235, 60, 235, 100, 'R1'),
    wire(50, 100, 50, 140, 'R2'), wire(50, 140, 70, 140, 'R2'), wire(130, 140, 155, 140, 'R2'),
    wire(215, 140, 235, 140, 'R2'), wire(235, 140, 235, 100, 'R2'),
    wire(235, 100, 280, 100, 'IT'), wire(280, 100, 280, 140, 'IT'),
    wire(280, 200, 280, 240, 'IT'), wire(280, 240, 30, 240, 'IT'), wire(30, 240, 30, 200, 'IT')
  ];
  const lay = { house: true, w: 345, h: 262, elements: els, wires: wires,
    notes: [{ at: [150, 256], text: aeng(n.IT, 'A', 4) + ' from the battery', c: 'i' }] };
  // room above R1 for its name, resistance and voltage
  shiftLayout(lay, 0, 14);
  return { layout: lay, currents: { IT: n.IT, R1: n.I1, R2: n.I23 }, hot: hot };
}

/* 2B1 Full: the bridge in bank question 7664 */
function bridgeCircuit(b, R, V) {
  const tiny = Math.abs(b.I5) < 1e-9 * b.IT;
  const els = [
    { name: 'V1', type: 'B', at: [30, 150], rot: 90, label: 'battery', value: aeng(V, 'V', 4), valueColour: 'v' },
    { name: 'R1', type: 'R', at: [120, 85], rot: 90, label: 'R1', value: aeng(R[0], 'Ω', 3), labelAt: 'left', flow: 'R1' },
    { name: 'R2', type: 'R', at: [120, 215], rot: 90, label: 'R2', value: aeng(R[1], 'Ω', 3), labelAt: 'left', flow: 'R2' },
    { name: 'R3', type: 'R', at: [240, 85], rot: 90, label: 'R3', value: aeng(R[2], 'Ω', 3), flow: 'R3' },
    { name: 'R4', type: 'R', at: [240, 215], rot: 90, label: 'R4', value: aeng(R[3], 'Ω', 3), flow: 'R4' },
    { name: 'R5', type: 'R', at: [180, 150], rot: 0, label: 'R5', value: aeng(R[4], 'Ω', 3),
      value2: tiny ? 'no current' : aeng(Math.abs(b.I5), 'A', 3), value2Colour: tiny ? 'soft' : 'i',
      flow: tiny ? '-' : 'R5' }
  ];
  const m = tiny ? '-' : 'R5';
  const wires = [
    wire(30, 120, 30, 30, 'IT'), wire(30, 30, 120, 30, 'IT'), wire(120, 30, 240, 30, 'R3'),
    wire(120, 30, 120, 55, 'R1'), wire(240, 30, 240, 55, 'R3'),
    wire(120, 115, 120, 150, 'R1'), wire(120, 150, 120, 185, 'R2'),
    wire(240, 115, 240, 150, 'R3'), wire(240, 150, 240, 185, 'R4'),
    wire(120, 150, 150, 150, m), wire(210, 150, 240, 150, m),
    wire(120, 245, 120, 270, 'R2'), wire(240, 245, 240, 270, 'R4'), wire(240, 270, 120, 270, 'R4'),
    wire(120, 270, 30, 270, 'IT'), wire(30, 270, 30, 180, 'IT')
  ];
  const currents = { IT: b.IT, R1: b.I1, R2: b.I2, R3: b.I3, R4: b.I4 };
  if (!tiny) currents.R5 = b.I5;
  return { layout: { house: true, w: 310, h: 288, elements: els, wires: wires,
    notes: [{ at: [180, 284], text: aeng(b.IT, 'A', 4) + ' from the battery', c: 'i' }] }, currents: currents };
}

/* 2B1 Full: a transceiver into a dummy load. RF, so the charge sloshes. */
function loadCircuit(d) {
  const lay = {
    house: true, w: 315, h: 205,
    elements: [
      { name: 'TX', type: 'V', at: [40, 105], rot: 90, label: 'transceiver', value: aeng(d.lv, 'V', 4) + ' RMS',
        valueColour: 'v' },
      { name: 'RL', type: 'R', at: [210, 105], rot: 90, label: 'dummy load',
        value: aeng(d.lr, 'Ω', 3), flow: 'RL', heat: 1 }
    ],
    wires: [wire(40, 75, 40, 35, 'RL'), wire(40, 35, 210, 35, 'RL'), wire(210, 35, 210, 75, 'RL'),
            wire(210, 135, 210, 175, 'RL'), wire(210, 175, 40, 175, 'RL'), wire(40, 175, 40, 135, 'RL')],
    notes: [{ at: [125, 192], text: aeng(d.lP, 'W', 4) + ' of heat', c: 'p' }]
  };
  return { layout: lay, currents: { RL: { re: d.lI, im: 0 } } };
}

/* 2C3 Intermediate: a cell with its source resistance inside a dashed box */
function emfCircuit(d, open) {
  const I = open ? 0 : d.eI;
  const Vt = open ? d.ee : d.eV;
  const lay = {
    house: true, w: 320, h: 252,
    boxes: [{ x: 8, y: 20, w: 115, h: 192, text: 'the battery' }],
    elements: [
      { name: 'E1', type: 'B', at: [45, 75], rot: 90, label: 'EMF', value: aeng(d.ee, 'V', 4), valueColour: 'v' },
      { name: 'RI', type: 'R', at: [45, 155], rot: 270, label: 'r', value: aeng(d.er, 'Ω', 3), flow: 'I' },
      { name: 'VM', type: 'M', at: [190, 115], rot: 90, meter: 'V', flow: '-' },
      { name: 'S1', type: 'S', at: [225, 30], rot: 0, open: !!open, flow: open ? undefined : 'I' },
      { name: 'RL', type: 'R', at: [285, 115], rot: 90, label: 'load', labelAt: 'left',
        value: aeng(d.el2, 'Ω', 3), flow: 'I' }
    ],
    wires: [
      wire(45, 45, 45, 30, 'I'), wire(45, 30, 190, 30, 'I'), wire(190, 30, 195, 30, 'I'),
      wire(255, 30, 285, 30, 'I'), wire(285, 30, 285, 85, 'I'),
      wire(285, 145, 285, 200, 'I'), wire(285, 200, 190, 200, 'I'), wire(190, 200, 45, 200, 'I'),
      wire(45, 200, 45, 185, 'I'), wire(45, 125, 45, 105, 'I'),
      wire(190, 30, 190, 85, '-'), wire(190, 145, 190, 200, '-')
    ],
    notes: [{ at: [170, 115], text: aeng(Vt, 'V', 3), c: 'v', align: 'right' },
            { at: [230, 232], text: open ? 'no current' : aeng(I, 'A', 4), c: open ? 'soft' : 'i' }]
  };
  if (open) dead(lay);
  return { layout: lay, currents: { I: I } };
}

/* 2C4 Foundation: an LED and its resistor, the battery either way round */
function polarityCircuit(reversed) {
  const I = reversed ? 0 : (LED_SUPPLY - LED_VF) / LED_R;
  const lay = {
    house: true, w: 250, h: 215,
    elements: [
      { name: 'V1', type: 'B', at: [35, 110], rot: reversed ? 270 : 90, label: 'battery', value: LED_SUPPLY + ANB + 'V',
        valueColour: 'v' },
      { name: 'R1', type: 'R', at: [115, 40], rot: 0, label: 'resistor', value: LED_R + ANB + 'Ω', flow: 'I' },
      { name: 'D1', type: 'D', kind: 'led', at: [195, 110], rot: 90, label: 'LED', labelAt: 'left', lit: !reversed, flow: 'I' }
    ],
    wires: [wire(35, 80, 35, 40, 'I'), wire(35, 40, 85, 40, 'I'), wire(145, 40, 195, 40, 'I'),
            wire(195, 40, 195, 80, 'I'), wire(195, 140, 195, 185, 'I'), wire(195, 185, 35, 185, 'I'),
            wire(35, 185, 35, 140, 'I')],
    notes: [{ at: [115, 200], text: reversed ? 'nothing flows' : aeng(I, 'A', 3), c: reversed ? 'note' : 'i' }]
  };
  if (reversed) dead(lay);
  return { layout: lay, currents: { I: I } };
}

/* ---------------------------------------------------------------------- */
/* the networks of 2B1 Full, solved                                        */
/* ---------------------------------------------------------------------- */

/* The bank network, R1 across (R2 + R3), then R4, from whichever figure is known. */
function solveNetwork(R, from, x) {
  const [R1, R2, R3, R4] = R;
  const Rp = par(R1, R2 + R3), RT = Rp + R4;
  let I23;
  if (from === 'supply') I23 = (x / RT) * Rp / (R2 + R3);
  else if (from === 'volts') I23 = x / R2;
  else I23 = Math.sqrt(x / R2);
  const Vp = I23 * (R2 + R3), I1 = Vp / R1, IT = I1 + I23, V4 = IT * R4, Vs = Vp + V4;
  return { Rp, RT, I23, Vp, I1, IT, V4, Vs, V2: I23 * R2, V3: I23 * R3,
           P1: Vp * Vp / R1, P2: I23 * I23 * R2, P3: I23 * I23 * R3, P4: IT * IT * R4 };
}

/* The bridge, by nodal analysis at DC. */
function solveBridge(V, R) {
  const ckt = AM.parseNetlist('V1 t 0 ' + V + '\nR1 t a ' + R[0] + '\nR2 a 0 ' + R[1] +
                              '\nR3 t b ' + R[2] + '\nR4 b 0 ' + R[3] + '\nR5 a b ' + R[4]);
  const sol = AM.solveAt(ckt, 0);
  const I = n => AM.currentThrough(sol, n).re;
  const out = { I1: I('R1'), I2: I('R2'), I3: I('R3'), I4: I('R4'), I5: I('R5'),
                Va: AM.nodeV(sol, 'a').re, Vb: AM.nodeV(sol, 'b').re };
  out.IT = out.I1 + out.I3;
  out.RT = V / out.IT;
  out.balanced = Math.abs(R[0] / R[1] - R[2] / R[3]) <= 1e-6 * (R[0] / R[1]);
  return out;
}

/* ---------------------------------------------------------------------- */

const BENCH = {
  group: '2A to 2C',
  groups: ['2A', '2B', '2C'],
  title: 'Resistance, power and tolerance',
  pageTitle: 'Resistance and Power Bench',
  levels: ['foundation', 'intermediate', 'full'],
  // the course sessions that send learners here, named in the colophon
  sessions: {
    foundation: ['Foundation session 3 (Volts, amps, ohms and watts)'],
    intermediate: ['Intermediate session 2 (Circuit sums)'],
    full: ['Full session 5 (Components, networks and time)']
  },
  circuitBased: true,
  circuitColumn: 420,
  standfirst: 'Move a control and watch what happens. Every current, voltage and power on this page is worked out live from the circuit as drawn.',
  colophonNote: {
    full: 'Every circuit is solved live, by nodal analysis or by the series and parallel rules the exam uses, and the two agree. In the DC circuits the charge moves faster where more current flows; in the tuned circuit, the coupling capacitor and the dummy load it moves back and forth. Circuit symbols follow the RSGB specification.',
    all: 'Every circuit is solved live, by nodal analysis or by the series and parallel rules the exam uses, and the two agree. The charge moves faster where more current flows. Circuit symbols follow the RSGB specification.'
  },
  bank: {
    url: 'https://rsgb.services/public/exams/eqdb/',
    topic: '2A, 2B and 2C',
    note: 'The RSGB bank covers Full only so far. On its site, choose 2A, 2B or 2C under Filter by Topic.'
  },

  intro: {
    foundation: [
      'Four quantities run through every piece of radio equipment: the voltage that pushes, the current that flows, the resistance that holds it back and the power that turns into heat. This page builds them up one at a time, starting with a battery, a lamp and a gap.',
      'Every circuit here is live. The dots show conventional current, from + round to −; the electrons themselves drift the other way. The dots move faster where more current flows, and stop where nothing can flow at all.'
    ],
    intermediate: [
      'At Foundation each idea stood on its own. At Intermediate they are put together: resistors in series and parallel, two or three of them sharing a supply as a divider, and a battery that turns out not to be quite the perfect source it looked.',
      'Each section shows the formula the exam expects with your values in it, marked by whether the Intermediate reference booklet prints it. The dots show conventional current, from + round to −, and they move faster where more current flows.'
    ],
    full: [
      'Two items at Full, and both are about working out what a real circuit does. Components are never exactly their marked value, so the first asks how far a result can drift. The second asks you to solve a network from whatever one figure a question happens to give.',
      'Each formula is shown with your values in it, and marked by whether the Full reference booklet (EX309) prints it. Several of the methods the exam relies on are not formulas at all, and those are marked too.'
    ]
  },

  /*
   * Read before this bench was designed. Our own summary of what each source
   * insists on; no wording from any of them appears here or in the bench.
   */
  sources: {
    read: [
      'Syllabus 2024 v1.6b, items 2A1, 2A2, 2B1 and 2C1 to 2C4, with the level of each statement',
      'EX309 Full reference data (Feb 2026), formula sheet on page 3',
      'Course decks: Foundation session 3, Intermediate session 2 and Full session 5, for what EX307 and EX308 print and for the worked examples',
      'Full Exam Secrets, technical basics, for the pitch of the 2A1 and 2B1 questions',
      'RSGB Full question bank, every question tagged 2A, 2B or 2C, with its diagram'
    ],
    keyMessages: [
      { at: '2A1', level: 'foundation', point: 'metals and carbon conduct; plastic, rubber, glass and ceramic do not, unless they are wet' },
      { at: '2A1', level: 'foundation', point: 'current is measured in amperes and voltage in volts' },
      { at: '2A1', level: 'intermediate', point: 'a marked value is a promise of a range, not of an exact figure' },
      { at: '2A1', level: 'full', point: 'the worst case in a divider is one resistor high and the other low, and the two directions are not equal' },
      { at: '2A1', level: 'full', point: 'a few per cent off in L or C moves an oscillator about half that per cent the other way' },
      { at: '2A1', level: 'full', point: 'coupling and decoupling capacitors set the lowest frequency, not the highest' },
      { at: '2A2', level: 'foundation', point: 'no complete loop, no current, anywhere in it' },
      { at: '2A2', level: 'foundation', point: 'series: one current everywhere; parallel: the same voltage across each branch' },
      { at: '2B1', level: 'foundation', point: 'P = V × I, in watts, and the power in a resistor becomes heat' },
      { at: '2B1', level: 'full', point: 'start from whatever the question gives and work outwards, using P = V²/R and P = I²R' },
      { at: '2B1', level: 'full', point: 'in a balanced bridge the middle resistor carries nothing and can be ignored' },
      { at: '2C1', level: 'foundation', point: 'double the voltage across a resistor and the current doubles' },
      { at: '2C1', level: 'foundation', point: 'currents in parallel add up to the supply current' },
      { at: '2C1', level: 'intermediate', point: 'series total exceeds the largest resistor; parallel total is below the smallest' },
      { at: '2C1', level: 'intermediate', point: 'cells in series add their voltages; in parallel the voltage stays and the current is shared' },
      { at: '2C2', level: 'foundation', point: 'the voltages round a series loop add up to the supply' },
      { at: '2C2', level: 'intermediate', point: 'the output of a divider is taken across the bottom resistor' },
      { at: '2C3', level: 'intermediate', point: 'EMF is what a source makes with no current drawn; the terminal voltage falls as current flows' },
      { at: '2C4', level: 'foundation', point: 'connect electronics the wrong way round and it may not work, or may be damaged' }
    ]
  },

  /* ---- every control, with the item that shows it ---- */
  controls: [
    // 2A1 Foundation: which material is in the gap, set by the buttons
    { id: 'mat', label: 'Material', unit: '', range: [0, 7], start: 0, linear: true, integer: true,
      desc: 'Which material sits in the gap, chosen with the buttons above the circuit' },
    // 2A1 Intermediate
    { id: 'tr', label: 'Marked value', unit: 'Ω', range: [10, 1e6], start: 4700, snap: nearestE12,
      desc: 'The value printed or colour coded on the resistor, one of the E12 preferred values' },
    { id: 'tt', label: 'Tolerance', unit: '%', range: [1, 20], start: 5, linear: true, integer: true,
      desc: 'How far from its marking the maker promises the resistor will be' },
    { id: 'te', label: 'This one is off by', unit: '%', range: [-25, 25], start: 3, linear: true, integer: true,
      desc: 'How far this particular resistor actually measures from its marking' },
    // 2A1 Full, the divider
    { id: 'tv', label: 'Supply', unit: 'V', range: [1, 30], start: 10, linear: true, integer: true,
      desc: 'The voltage across the whole divider' },
    { id: 't1', label: 'R1', unit: 'Ω', range: [1e3, 1e6], start: 80e3,
      desc: 'The top resistor, from the supply to the output' },
    { id: 't2', label: 'R2', unit: 'Ω', range: [1e3, 1e6], start: 20e3,
      desc: 'The bottom resistor, from the output to 0 V' },
    { id: 'tol', label: 'Tolerance', unit: '%', range: [1, 20], start: 5, linear: true, integer: true,
      desc: 'The tolerance of both resistors' },
    // 2A1 Full, the oscillator
    { id: 'fd', label: 'Designed for', unit: 'Hz', range: [1e6, 30e6], start: 8e6,
      desc: 'The frequency the oscillator would run at with exact parts' },
    { id: 'el', label: 'L is off by', unit: '%', range: [-10, 10], start: -2, linear: true, integer: true,
      desc: 'How far the coil is from its design value' },
    { id: 'ec', label: 'C is off by', unit: '%', range: [-10, 10], start: 0, linear: true, integer: true,
      desc: 'How far the capacitor is from its design value' },
    // 2A1 Full, the coupling capacitor
    { id: 'cc', label: 'C1', unit: 'F', range: [10e-9, 10e-6], start: 1e-6,
      desc: 'The marked value of the coupling capacitor' },
    { id: 'ctol', label: 'Its tolerance', unit: '%', range: [1, 50], start: 20, linear: true, integer: true,
      desc: 'Electrolytic coupling capacitors are often 20% or worse' },
    // 2A2 Foundation
    { id: 'sv', label: 'Battery', unit: 'V', range: [1, 12], start: 6, linear: true, integer: true,
      desc: 'The voltage of the battery driving both lamps' },
    // 2C1 Foundation
    { id: 'cmode', label: 'Find', unit: '', range: [0, 3], start: 0, linear: true, integer: true,
      desc: 'Which quantity is worked out, chosen with the buttons above the circuit' },
    { id: 'ov', label: 'Voltage', unit: 'V', range: [1, 24], start: 12, linear: true, integer: true,
      desc: 'The supply voltage, across the resistor' },
    { id: 'oi', label: 'Current', unit: 'A', range: [0.05, 2.05], start: 2, linear: true,
      desc: 'The current through the resistor' },
    { id: 'or', label: 'Resistance', unit: 'Ω', range: [1, 100], start: 6, linear: true, integer: true,
      desc: 'The resistance of the resistor' },
    { id: 'or2', label: 'Second load', unit: 'Ω', range: [1, 100], start: 12, linear: true, integer: true,
      desc: 'The resistance of the second load, side by side with the first' },
    // 2C2 Foundation
    { id: 'sv2', label: 'Supply', unit: 'V', range: [1, 24], start: 12, linear: true, integer: true,
      desc: 'The supply across the chain' },
    { id: 's1', label: 'R1', unit: 'Ω', range: [1, 100], start: 10, linear: true, integer: true,
      desc: 'The first resistor in the chain' },
    { id: 's2', label: 'R2', unit: 'Ω', range: [1, 100], start: 20, linear: true, integer: true,
      desc: 'The second resistor in the chain' },
    { id: 's3', label: 'R3', unit: 'Ω', range: [1, 100], start: 30, linear: true, integer: true,
      desc: 'The third resistor in the chain' },
    // 2B1 Foundation
    { id: 'bmode', label: 'Find', unit: '', range: [0, 2], start: 0, linear: true, integer: true,
      desc: 'Which quantity is worked out, chosen with the buttons above the circuit' },
    { id: 'pv', label: 'Voltage', unit: 'V', range: [1, 24], start: 12, linear: true, integer: true,
      desc: 'The voltage across the resistor' },
    { id: 'pi', label: 'Current', unit: 'A', range: [0.1, 2.1], start: 0.5, linear: true,
      desc: 'The current through the resistor' },
    { id: 'pp', label: 'Power', unit: 'W', range: [0.5, 25], start: 6, linear: true,
      desc: 'The power the resistor turns into heat' },
    // 2C1 Intermediate
    { id: 'nv', label: 'Supply', unit: 'V', range: [1, 24], start: 12, linear: true, integer: true,
      desc: 'The supply voltage across the network' },
    { id: 'n1', label: 'R1', unit: 'Ω', range: [100, 100e3], start: 1000, desc: 'First resistor' },
    { id: 'n2', label: 'R2', unit: 'Ω', range: [100, 100e3], start: 1000, desc: 'Second resistor' },
    { id: 'n3', label: 'R3', unit: 'Ω', range: [100, 100e3], start: 1000, desc: 'Third resistor, left out when there are two' },
    { id: 'nn', label: 'Resistors', unit: '', range: [2, 3], start: 3, linear: true, integer: true,
      desc: 'Two resistors or three, chosen with the buttons above the circuit' },
    { id: 'nc', label: 'Cells', unit: '', range: [1, 4], start: 4, linear: true, integer: true,
      desc: 'How many 1.5 V cells' },
    { id: 'nl', label: 'Load', unit: 'Ω', range: [1, 1000], start: 10,
      desc: 'The load the cells drive' },
    // 2C2 Intermediate
    { id: 'dv', label: 'Supply', unit: 'V', range: [1, 24], start: 12, linear: true, integer: true,
      desc: 'The voltage across the whole divider' },
    { id: 'd1', label: 'R1', unit: 'Ω', range: [100, 100e3], start: 6000, desc: 'The top resistor' },
    { id: 'd2', label: 'R2', unit: 'Ω', range: [100, 100e3], start: 3000, desc: 'The resistor below R1' },
    { id: 'd3', label: 'R3', unit: 'Ω', range: [100, 100e3], start: 3000, desc: 'The bottom resistor of three' },
    { id: 'dl', label: 'Load', unit: 'Ω', range: [100, 1e6], start: 3000,
      desc: 'A load connected across the output' },
    // 2C3 Intermediate
    { id: 'ee', label: 'EMF', unit: 'V', range: [1, 24], start: 12, linear: true, integer: true,
      desc: 'What the battery generates, measured with nothing drawn from it' },
    { id: 'er', label: 'Source resistance', unit: 'Ω', range: [0.01, 10], start: 0.5,
      desc: 'The resistance inside the battery itself' },
    { id: 'el2', label: 'Load', unit: 'Ω', range: [0.01, 1000], start: 5.5,
      desc: 'What the battery is connected to. Wind it right down for a short circuit' },
    // 2B1 Full, the network
    { id: 'f1', label: 'R1', unit: 'Ω', range: [100, 100e3], start: 4000, desc: 'The resistor on the upper path' },
    { id: 'f2', label: 'R2', unit: 'Ω', range: [100, 100e3], start: 1000, desc: 'The first resistor on the lower path' },
    { id: 'f3', label: 'R3', unit: 'Ω', range: [100, 100e3], start: 3000, desc: 'The second resistor on the lower path' },
    { id: 'f4', label: 'R4', unit: 'Ω', range: [100, 100e3], start: 3000, desc: 'The resistor in series with the pair of paths' },
    { id: 'fv', label: 'Supply', unit: 'V', range: [1, 1000], start: 60, desc: 'The battery voltage, when that is what is known' },
    { id: 'fvk', label: 'Volts across R2', unit: 'V', range: [0.1, 100], start: 6,
      desc: 'The voltage across R2, when that is what is known' },
    { id: 'fpk', label: 'Power in R2', unit: 'W', range: [0.001, 10], start: 2,
      desc: 'The power in R2, when that is what is known' },
    // 2B1 Full, the bridge
    { id: 'bv', label: 'Supply', unit: 'V', range: [1, 24], start: 12, linear: true, integer: true,
      desc: 'The battery voltage across the bridge' },
    { id: 'b1', label: 'R1', unit: 'Ω', range: [100, 100e3], start: 1000, desc: 'Top left' },
    { id: 'b2', label: 'R2', unit: 'Ω', range: [100, 100e3], start: 3000, desc: 'Bottom left' },
    { id: 'b3', label: 'R3', unit: 'Ω', range: [100, 100e3], start: 3000, desc: 'Top right' },
    { id: 'b4', label: 'R4', unit: 'Ω', range: [100, 100e3], start: 9000, desc: 'Bottom right' },
    { id: 'b5', label: 'R5', unit: 'Ω', range: [100, 100e3], start: 2000, desc: 'Across the middle' },
    // 2B1 Full, the bias divider
    { id: 'av', label: 'Supply', unit: 'V', range: [1, 24], start: 9, linear: true, integer: true,
      desc: 'The supply rail' },
    { id: 'a2', label: 'R2', unit: 'Ω', range: [100, 100e3], start: 2200, desc: 'The bottom resistor, which is known' },
    { id: 'ab', label: 'Base voltage', unit: 'V', range: [0.2, 8], start: 1.6, linear: true,
      desc: 'The voltage wanted at the junction of the two resistors' },
    // 2B1 Full, the dummy load
    { id: 'lv', label: 'RF voltage', unit: 'V', range: [1, 300], start: 100,
      desc: 'The RMS voltage measured across the load' },
    { id: 'lr', label: 'Load', unit: 'Ω', range: [10, 1000], start: 50, desc: 'The dummy load resistance' }
  ],

  /** Everything the panels and the working read, from the controls. */
  derive: (v0) => {
    // every sum uses each slider's value as the slider shows it, to 3 figures
    const v = Object.assign({}, v0);
    BENCH.controls.forEach(c => {
      if (!c.integer && !c.snap && isFinite(v[c.id])) v[c.id] = fig3(v[c.id]);
    });
    const d = Object.assign({}, v);
    // 2A1 Foundation
    d.matIdx = clampInt(v.mat, 0, MATERIALS.length - 1);
    const m = MATERIALS[d.matIdx];
    d.matI = isFinite(m.R) ? MAT_V / (MAT_LAMP + m.R) : 0;
    // 2A1 Intermediate
    d.trLo = v.tr * (1 - v.tt / 100);
    d.trHi = v.tr * (1 + v.tt / 100);
    d.trAct = v.tr * (1 + v.te / 100);
    d.trIn = Math.abs(v.te) <= v.tt;
    d.trInom = TOL_V / v.tr;
    d.trIact = TOL_V / d.trAct;
    // 2A1 Full, the divider at its design values and its two worst cases
    const k = v.tol / 100;
    d.dNom = v.tv * v.t2 / (v.t1 + v.t2);
    d.dLow = v.tv * v.t2 * (1 - k) / (v.t1 * (1 + k) + v.t2 * (1 - k));
    d.dHigh = v.tv * v.t2 * (1 + k) / (v.t1 * (1 - k) + v.t2 * (1 + k));
    // the oscillator
    d.fAct = v.fd / Math.sqrt((1 + v.el / 100) * (1 + v.ec / 100));
    d.fApprox = v.fd * (1 - (v.el + v.ec) / 200);
    // the coupling capacitor, and where its corner can land
    const ck = v.ctol / 100;
    d.fcNom = 1 / (2 * Math.PI * COUPLE_R * v.cc);
    d.fcLow = 1 / (2 * Math.PI * COUPLE_R * v.cc * (1 + ck));
    d.fcHigh = 1 / (2 * Math.PI * COUPLE_R * v.cc * (1 - ck));
    // 2A2 Foundation
    d.sI = v.sv / (LAMP_A + LAMP_B);
    d.sVA = d.sI * LAMP_A; d.sVB = d.sI * LAMP_B;
    d.pIA = v.sv / LAMP_A; d.pIB = v.sv / LAMP_B;
    // 2C1 Foundation, by which quantity is found
    d.cmode = clampInt(v.cmode, 0, 3);
    d.oI = v.ov / v.or;                 // find I
    d.oV = v.oi * v.or;                 // find V
    d.oR = v.ov / v.oi;                 // find R
    d.oI1 = v.ov / v.or; d.oI2 = v.ov / v.or2; d.oIT = d.oI1 + d.oI2;
    // 2C2 Foundation
    d.sRT = v.s1 + v.s2 + v.s3;
    d.sIs = v.sv2 / d.sRT;
    d.sV1 = d.sIs * v.s1; d.sV2 = d.sIs * v.s2; d.sV3 = d.sIs * v.s3;
    // 2B1 Foundation
    d.bmode = clampInt(v.bmode, 0, 2);
    d.bP = v.pv * v.pi;
    d.bI = v.pp / v.pv;
    d.bV = v.pp / v.pi;
    // 2C1 Intermediate
    // two resistors or three, for series and parallel; the mixture always has three
    d.nn = clampInt(v.nn, 2, 3);
    const R3 = [v.n1, v.n2, v.n3], Rn = R3.slice(0, d.nn);
    d.nSer = Rn.reduce((a, r) => a + r, 0);
    d.nPar = 1 / Rn.reduce((a, r) => a + 1 / r, 0);
    d.nP23 = par(R3[1], R3[2]);
    d.nCombo = R3[0] + d.nP23;
    d.nEs = v.nc * CELL_V;
    // 2C2 Intermediate
    d.dOut = v.dv * v.d2 / (v.d1 + v.d2);
    d.dRT3 = v.d1 + v.d2 + v.d3;
    d.dA = v.dv * (v.d2 + v.d3) / d.dRT3;
    d.dB = v.dv * v.d3 / d.dRT3;
    d.dP = par(v.d2, v.dl);
    d.dLoaded = v.dv * d.dP / (v.d1 + d.dP);
    // 2C3 Intermediate
    d.eI = v.ee / (v.el2 + v.er);
    d.eV = v.ee - d.eI * v.er;
    d.eLost = d.eI * v.er;
    d.ePL = d.eI * d.eI * v.el2;
    d.ePr = d.eI * d.eI * v.er;
    // 2B1 Full
    const RF = [v.f1, v.f2, v.f3, v.f4];
    d.netS = solveNetwork(RF, 'supply', v.fv);
    d.netV = solveNetwork(RF, 'volts', v.fvk);
    d.netP = solveNetwork(RF, 'power', v.fpk);
    d.br = solveBridge(v.bv, [v.b1, v.b2, v.b3, v.b4, v.b5]);
    d.aI = v.ab / v.a2;
    d.aV1 = v.av - v.ab;
    // a divider cannot give more than its supply: no resistor does that
    d.aOk = d.aV1 > 0;
    d.aR1 = d.aOk ? d.aV1 / d.aI : NaN;
    d.aE12 = nearestE12(d.aR1);
    d.lI = v.lv / v.lr;
    d.lP = v.lv * v.lv / v.lr;
    d.f0 = 0;
    return d;
  },

  /*
   * The equations this bench uses. `given` says whether the Full reference
   * booklet (EX309, Feb 2026, page 3) prints the formula, so that at Full it
   * is marked "given in the exam" or "learn this one". Below Full, `tag`
   * says the same for the Foundation booklet (EX307, which has no formula
   * sheet at all) and the Intermediate one (EX308, which prints V = IR,
   * P = VI, the series and parallel resistor formulas and the divider).
   */
  equations: {
    /* 2A1 Intermediate */
    tolRange: { given: false, tag: { intermediate: 'learn' },
      name: 'The range a marked value promises',
      eq: 'lowest = marked &times; (1 &minus; tolerance), highest = marked &times; (1 + tolerance)',
      work: d => ['<b>' + aeng(d.tr, 'Ω', 4) + '</b> &times; (1 &minus; <b>' + atrim(d.tt / 100, 3) + '</b>) to <b>' +
                  aeng(d.tr, 'Ω', 4) + '</b> &times; (1 + <b>' + atrim(d.tt / 100, 3) + '</b>)',
                  aeng(d.trLo, 'Ω', 4) + ' to ' + aeng(d.trHi, 'Ω', 4)] },
    tolCurrent: { given: true, tag: { intermediate: 'interest' },
      name: 'What that does to the current', eq: 'I = V / R',
      work: d => ['<b>' + TOL_V + ANB + 'V</b> / <b>' + aeng(d.trAct, 'Ω', 4) + '</b>, against <b>' + TOL_V + ANB +
                  'V</b> / <b>' + aeng(d.tr, 'Ω', 4) + '</b> as marked',
                  aeng(d.trIact, 'A', 4) + ', not ' + aeng(d.trInom, 'A', 4)] },

    /* 2A1 Full: the divider */
    divNom: { given: true, tag: { intermediate: 'given' },
      name: 'The divider at its marked values', eq: 'V<sub>out</sub> = V<sub>in</sub> &times; R2 / (R1 + R2)',
      applies: d => d.device === 'divider',
      work: d => ['<b>' + d.tv + ANB + 'V</b> &times; <b>' + aeng(d.t2, 'Ω', 4) + '</b> / (<b>' + aeng(d.t1, 'Ω', 4) +
                  '</b> + <b>' + aeng(d.t2, 'Ω', 4) + '</b>)', aeng(d.dNom, 'V', 4)] },
    divLow: { given: false, name: 'Lowest output: R1 high, R2 low',
      eq: 'V<sub>in</sub> &times; R2(1 &minus; t) / (R1(1 + t) + R2(1 &minus; t))',
      applies: d => d.device === 'divider',
      work: d => ['<b>' + d.tv + ANB + 'V</b> &times; <b>' + aeng(d.t2 * (1 - d.tol / 100), 'Ω', 4) + '</b> / (<b>' +
                  aeng(d.t1 * (1 + d.tol / 100), 'Ω', 4) + '</b> + <b>' + aeng(d.t2 * (1 - d.tol / 100), 'Ω', 4) + '</b>)',
                  aeng(d.dLow, 'V', 4) + ', ' + aeng((d.dNom - d.dLow), 'V', 3) + ' low'] },
    divHigh: { given: false, name: 'Highest output: R1 low, R2 high',
      eq: 'V<sub>in</sub> &times; R2(1 + t) / (R1(1 &minus; t) + R2(1 + t))',
      applies: d => d.device === 'divider',
      work: d => ['<b>' + d.tv + ANB + 'V</b> &times; <b>' + aeng(d.t2 * (1 + d.tol / 100), 'Ω', 4) + '</b> / (<b>' +
                  aeng(d.t1 * (1 - d.tol / 100), 'Ω', 4) + '</b> + <b>' + aeng(d.t2 * (1 + d.tol / 100), 'Ω', 4) + '</b>)',
                  aeng(d.dHigh, 'V', 4) + ', ' + aeng((d.dHigh - d.dNom), 'V', 3) + ' high'] },

    /* 2A1 Full: the oscillator */
    fLC: { given: true, name: 'Resonant frequency: only the product LC matters',
      eq: 'f = 1 / 2&pi;<span class="rad">&radic;</span>(LC), so f = f<sub>design</sub> / <span class="rad">&radic;</span>(L &times; C, each as a fraction of its design value)',
      applies: d => d.device === 'lc',
      work: d => ['<b>' + aeng(d.fd, 'Hz', 4) + '</b> / <span class="rad">&radic;</span>(<b>' + atrim(1 + d.el / 100, 4) +
                  '</b> &times; <b>' + atrim(1 + d.ec / 100, 4) + '</b>)', aeng(d.fAct, 'Hz', 5)] },
    fHalf: { given: false, name: 'The quick rule', eq: 'L or C a few % out: f moves about half that %, the other way',
      applies: d => d.device === 'lc',
      work: d => ['<b>' + aeng(d.fd, 'Hz', 4) + '</b> &times; (1 &minus; (<b>' + minus(d.el) + '</b> + <b>' + minus(d.ec) + '</b>) / 200)',
                  aeng(d.fApprox, 'Hz', 5)] },

    /* 2A1 Full: the coupling capacitor */
    fCR: { given: false, name: 'Where a coupling capacitor starts to bite',
      eq: 'f = 1 / 2&pi;CR, where X<sub>C</sub> = R',
      applies: d => d.device === 'coupling',
      work: d => ['1 / (2&pi; &times; <b>' + aeng(d.cc, 'F', 3) + '</b> &times; <b>' + aeng(COUPLE_R, 'Ω', 3) + '</b>)',
                  aeng(d.fcNom, 'Hz', 3) + ' as marked, ' + aeng(d.fcLow, 'Hz', 3) + ' to ' + aeng(d.fcHigh, 'Hz', 3) +
                  ' across its tolerance'] },

    /* 2C1 Foundation: Ohm's law three ways */
    ohmI: { given: true, tag: { foundation: 'learn', intermediate: 'given' },
      name: 'Current', eq: 'I = V / R', applies: d => d.cmode === 0,
      work: d => ['<b>' + d.ov + ANB + 'V</b> / <b>' + d.or + ANB + 'Ω</b>', aeng(d.oI, 'A', 4)] },
    ohmV: { given: true, tag: { foundation: 'learn', intermediate: 'given' },
      name: 'Voltage', eq: 'V = I &times; R', applies: d => d.cmode === 1,
      work: d => ['<b>' + aeng(d.oi, 'A', 4) + '</b> &times; <b>' + d.or + ANB + 'Ω</b>', aeng(d.oV, 'V', 4)] },
    ohmR: { given: true, tag: { foundation: 'learn', intermediate: 'given' },
      name: 'Resistance', eq: 'R = V / I', applies: d => d.cmode === 2,
      work: d => ['<b>' + d.ov + ANB + 'V</b> / <b>' + aeng(d.oi, 'A', 4) + '</b>', aeng(d.oR, 'Ω', 4)] },
    twoI: { given: true, tag: { foundation: 'learn' },
      name: 'Current in each load', eq: 'I = V / R, for each one', applies: d => d.cmode === 3,
      work: d => ['<b>' + d.ov + ANB + 'V</b> / <b>' + d.or + ANB + 'Ω</b> and <b>' + d.ov + ANB + 'V</b> / <b>' +
                  d.or2 + ANB + 'Ω</b>', aeng(d.oI1, 'A', 4) + ' and ' + aeng(d.oI2, 'A', 4)] },
    iSum: { given: false, tag: { foundation: 'learn' },
      name: 'Currents in parallel add up', eq: 'I<sub>total</sub> = I<sub>1</sub> + I<sub>2</sub>',
      applies: d => d.cmode === 3,
      work: d => ['<b>' + aeng(d.oI1, 'A', 4) + '</b> + <b>' + aeng(d.oI2, 'A', 4) + '</b>', aeng(d.oIT, 'A', 4)] },

    /* 2C2 Foundation */
    vEach: { given: true, tag: { foundation: 'learn' },
      name: 'Voltage across each resistor', eq: 'V = I &times; R',
      work: d => ['<b>' + aeng(d.sIs, 'A', 4) + '</b> &times; <b>' + d.s1 + '</b>, <b>' + d.s2 + '</b> and <b>' + d.s3 + ANB + 'Ω</b>',
                  aeng(d.sV1, 'V', 4) + ', ' + aeng(d.sV2, 'V', 4) + ' and ' + aeng(d.sV3, 'V', 4)] },
    vSum: { given: false, tag: { foundation: 'learn' },
      name: 'They add up to the supply', eq: 'V<sub>supply</sub> = V<sub>1</sub> + V<sub>2</sub> + V<sub>3</sub>',
      work: d => ['<b>' + aeng(d.sV1, 'V', 4) + '</b> + <b>' + aeng(d.sV2, 'V', 4) + '</b> + <b>' + aeng(d.sV3, 'V', 4) + '</b>',
                  aeng(d.sV1 + d.sV2 + d.sV3, 'V', 4)] },

    /* 2B1 Foundation */
    pVI: { given: true, tag: { foundation: 'learn' },
      name: 'Power', eq: 'P = V &times; I', applies: d => d.bmode === 0,
      work: d => ['<b>' + d.pv + ANB + 'V</b> &times; <b>' + aeng(d.pi, 'A', 4) + '</b>', aeng(d.bP, 'W', 4)] },
    pI: { given: true, tag: { foundation: 'learn' },
      name: 'Current, from the power', eq: 'I = P / V', applies: d => d.bmode === 1,
      work: d => ['<b>' + aeng(d.pp, 'W', 4) + '</b> / <b>' + d.pv + ANB + 'V</b>', aeng(d.bI, 'A', 4)] },
    pV: { given: true, tag: { foundation: 'learn' },
      name: 'Voltage, from the power', eq: 'V = P / I', applies: d => d.bmode === 2,
      work: d => ['<b>' + aeng(d.pp, 'W', 4) + '</b> / <b>' + aeng(d.pi, 'A', 4) + '</b>', aeng(d.bV, 'V', 4)] },

    /* 2C1 Intermediate */
    rSer: { given: true, tag: { intermediate: 'given' },
      name: 'Resistors in series', eq: 'R<sub>T</sub> = R<sub>1</sub> + R<sub>2</sub> + R<sub>3</sub>',
      applies: d => d.device === 'series' && d.nn === 3,
      work: d => ['<b>' + aeng(d.n1, 'Ω', 4) + '</b> + <b>' + aeng(d.n2, 'Ω', 4) + '</b> + <b>' + aeng(d.n3, 'Ω', 4) + '</b>',
                  aeng(d.nSer, 'Ω', 4)] },
    rSer2: { given: true, tag: { intermediate: 'given' },
      name: 'Resistors in series', eq: 'R<sub>T</sub> = R<sub>1</sub> + R<sub>2</sub>',
      applies: d => d.device === 'series' && d.nn === 2,
      work: d => ['<b>' + aeng(d.n1, 'Ω', 4) + '</b> + <b>' + aeng(d.n2, 'Ω', 4) + '</b>', aeng(d.nSer, 'Ω', 4)] },
    rPar: { given: true, tag: { intermediate: 'given' },
      name: 'Resistors in parallel', eq: 'R<sub>T</sub> = 1 / (1/R<sub>1</sub> + 1/R<sub>2</sub> + 1/R<sub>3</sub>)',
      applies: d => d.device === 'parallel' && d.nn === 3,
      work: d => ['1 / (1/<b>' + aeng(d.n1, 'Ω', 4) + '</b> + 1/<b>' + aeng(d.n2, 'Ω', 4) + '</b> + 1/<b>' +
                  aeng(d.n3, 'Ω', 4) + '</b>)', aeng(d.nPar, 'Ω', 4)] },
    rPar2: { given: true, tag: { intermediate: 'given' },
      name: 'Resistors in parallel', eq: 'R<sub>T</sub> = 1 / (1/R<sub>1</sub> + 1/R<sub>2</sub>)',
      applies: d => d.device === 'parallel' && d.nn === 2,
      work: d => ['1 / (1/<b>' + aeng(d.n1, 'Ω', 4) + '</b> + 1/<b>' + aeng(d.n2, 'Ω', 4) + '</b>)',
                  aeng(d.nPar, 'Ω', 4)] },
    rTwo: { given: false, tag: { intermediate: 'learn' },
      name: 'Two in parallel, the quick way', eq: 'R = R<sub>2</sub> &times; R<sub>3</sub> / (R<sub>2</sub> + R<sub>3</sub>)',
      applies: d => d.device === 'combo',
      work: d => ['<b>' + aeng(d.n2, 'Ω', 4) + '</b> &times; <b>' + aeng(d.n3, 'Ω', 4) + '</b> / (<b>' + aeng(d.n2, 'Ω', 4) +
                  '</b> + <b>' + aeng(d.n3, 'Ω', 4) + '</b>)', aeng(d.nP23, 'Ω', 4)] },
    rCombo: { given: true, tag: { intermediate: 'given' },
      name: 'Then add the series part, with the pair as one resistor', eq: 'R<sub>T</sub> = R<sub>1</sub> + R<sub>pair</sub>',
      applies: d => d.device === 'combo',
      work: d => ['<b>' + aeng(d.n1, 'Ω', 4) + '</b> + <b>' + aeng(d.nP23, 'Ω', 4) + '</b>', aeng(d.nCombo, 'Ω', 4)] },
    iNet: { given: true, tag: { intermediate: 'given' },
      name: 'Current from the supply', eq: 'I = V / R<sub>T</sub>',
      applies: d => d.device === 'series' || d.device === 'parallel' || d.device === 'combo',
      work: d => {
        const RT = d.device === 'series' ? d.nSer : d.device === 'parallel' ? d.nPar : d.nCombo;
        return ['<b>' + d.nv + ANB + 'V</b> / <b>' + aeng(RT, 'Ω', 4) + '</b>', aeng(d.nv / RT, 'A', 4)];
      } },
    // the syllabus asks for any one of V, I or R, not only the supply current
    vR1: { given: true, tag: { intermediate: 'given' },
      name: 'Voltage across R1: the whole current flows through it', eq: 'V<sub>1</sub> = I &times; R<sub>1</sub>',
      applies: d => d.device === 'series' || d.device === 'combo',
      work: d => { const I = d.nv / (d.device === 'series' ? d.nSer : d.nCombo);
        return ['<b>' + aeng(I, 'A', 4) + '</b> &times; <b>' + aeng(d.n1, 'Ω', 4) + '</b>', aeng(I * d.n1, 'V', 4)]; } },
    iR1: { given: true, tag: { intermediate: 'given' },
      name: 'Current in R1: it has the whole supply across it', eq: 'I<sub>1</sub> = V / R<sub>1</sub>',
      applies: d => d.device === 'parallel',
      work: d => ['<b>' + d.nv + ANB + 'V</b> / <b>' + aeng(d.n1, 'Ω', 4) + '</b>', aeng(d.nv / d.n1, 'A', 4)] },
    cellSer: { given: false, tag: { intermediate: 'learn' },
      name: 'Cells in series: the voltages add', eq: 'V = number of cells &times; 1.5 V',
      applies: d => d.device === 'cellsS',
      work: d => ['<b>' + d.nc + '</b> &times; <b>1.5' + ANB + 'V</b>', aeng(d.nEs, 'V', 3)] },
    cellPar: { given: false, tag: { intermediate: 'learn' },
      name: 'Cells in parallel: the current is shared', eq: 'V = 1.5 V, each cell gives I / number of cells',
      applies: d => d.device === 'cellsP',
      work: d => ['(<b>1.5' + ANB + 'V</b> / <b>' + aeng(d.nl, 'Ω', 4) + '</b>) / <b>' + d.nc + '</b>',
                  aeng(CELL_V / d.nl / d.nc, 'A', 4) + ' from each cell'] },

    /* 2C2 Intermediate */
    div: { given: true, tag: { intermediate: 'given' },
      name: 'The potential divider', eq: 'V<sub>out</sub> = V<sub>in</sub> &times; R2 / (R1 + R2)',
      applies: d => d.device === 'two' || d.device === 'loaded',
      work: d => ['<b>' + d.dv + ANB + 'V</b> &times; <b>' + aeng(d.d2, 'Ω', 4) + '</b> / (<b>' + aeng(d.d1, 'Ω', 4) +
                  '</b> + <b>' + aeng(d.d2, 'Ω', 4) + '</b>)', aeng(d.dOut, 'V', 4)] },
    div3: { given: true, tag: { intermediate: 'given' },
      name: 'Three resistors: the same formula, twice',
      eq: 'V<sub>A</sub> = V<sub>in</sub> (R2 + R3) / (R1 + R2 + R3), V<sub>B</sub> = V<sub>in</sub> R3 / (R1 + R2 + R3)',
      applies: d => d.device === 'three',
      work: d => ['<b>' + d.dv + ANB + 'V</b> &times; <b>' + aeng(d.d2 + d.d3, 'Ω', 4) + '</b> / <b>' + aeng(d.dRT3, 'Ω', 4) +
                  '</b>, and <b>' + d.dv + ANB + 'V</b> &times; <b>' + aeng(d.d3, 'Ω', 4) + '</b> / <b>' + aeng(d.dRT3, 'Ω', 4) + '</b>',
                  aeng(d.dA, 'V', 4) + ' at A, ' + aeng(d.dB, 'V', 4) + ' at B'] },
    divLoad: { given: false, tag: { intermediate: 'interest' },
      name: 'With a load across R2',
      eq: 'V<sub>out</sub> = V<sub>in</sub> &times; (R2 parallel R<sub>L</sub>) / (R1 + (R2 parallel R<sub>L</sub>))',
      applies: d => d.device === 'loaded',
      work: d => ['<b>' + d.dv + ANB + 'V</b> &times; <b>' + aeng(d.dP, 'Ω', 4) + '</b> / (<b>' + aeng(d.d1, 'Ω', 4) +
                  '</b> + <b>' + aeng(d.dP, 'Ω', 4) + '</b>)', aeng(d.dLoaded, 'V', 4)] },

    /* 2C3 Intermediate */
    eI: { given: false, tag: { intermediate: 'learn' },
      name: 'Current, with the source resistance counted', eq: 'I = E / (R + r)',
      // with only the voltmeter on the terminals there is no sum: the lead says why I is 0 A
      applies: d => d.device !== 'open',
      work: d => ['<b>' + d.ee + ANB + 'V</b> / (<b>' + aeng(d.el2, 'Ω', 4) + '</b> + <b>' + aeng(d.er, 'Ω', 4) + '</b>)',
                  aeng(d.eI, 'A', 4)] },
    eV: { given: false, tag: { intermediate: 'learn' },
      name: 'Terminal voltage', eq: 'V = E &minus; I &times; r',
      work: d => d.device === 'open'
        ? ['<b>' + d.ee + ANB + 'V</b> &minus; 0 &times; <b>' + aeng(d.er, 'Ω', 4) + '</b>', d.ee + ANB + 'V, the whole EMF']
        : ['<b>' + d.ee + ANB + 'V</b> &minus; <b>' + aeng(d.eI, 'A', 4) + '</b> &times; <b>' + aeng(d.er, 'Ω', 4) + '</b>',
           aeng(d.eV, 'V', 4) + ', with ' + aeng(d.eLost, 'V', 3) + ' lost inside'] },

    /* 2B1 Full: the network from the supply */
    sRp: { given: true, name: 'The two paths in parallel, the lower path being R2 + R3',
      eq: 'R<sub>pair</sub> = 1 / (1/R<sub>1</sub> + 1/(R<sub>2</sub> + R<sub>3</sub>))',
      applies: d => d.device === 'supply',
      work: d => ['1 / (1/<b>' + aeng(d.f1, 'Ω', 4) + '</b> + 1/<b>' + aeng(d.f2 + d.f3, 'Ω', 4) + '</b>)',
                  aeng(d.netS.Rp, 'Ω', 4)] },
    sRt: { given: true, name: 'Then R4 in series', eq: 'R<sub>T</sub> = R<sub>pair</sub> + R<sub>4</sub> (the series formula)',
      applies: d => d.device === 'supply',
      work: d => ['<b>' + aeng(d.netS.Rp, 'Ω', 4) + '</b> + <b>' + aeng(d.f4, 'Ω', 4) + '</b>', aeng(d.netS.RT, 'Ω', 4)] },
    sIT: { given: true, name: 'Current from the battery', eq: 'V = IR, so I = V / R',
      applies: d => d.device === 'supply',
      work: d => ['<b>' + aeng(d.fv, 'V', 4) + '</b> / <b>' + aeng(d.netS.RT, 'Ω', 4) + '</b>', aeng(d.netS.IT, 'A', 4)] },
    sVp: { given: true, name: 'Voltage across the pair of paths', eq: 'V = IR',
      applies: d => d.device === 'supply',
      work: d => ['<b>' + aeng(d.netS.IT, 'A', 4) + '</b> &times; <b>' + aeng(d.netS.Rp, 'Ω', 4) + '</b>', aeng(d.netS.Vp, 'V', 4)] },

    /* 2B1 Full: the network from a voltage or a power in R2 */
    kI2v: { given: true, name: 'Start where the figure is: current in R2', eq: 'V = IR, so I = V / R',
      applies: d => d.device === 'volts',
      work: d => ['<b>' + aeng(d.fvk, 'V', 4) + '</b> / <b>' + aeng(d.f2, 'Ω', 4) + '</b>', aeng(d.netV.I23, 'A', 4)] },
    kI2p: { given: true, name: 'Start where the figure is: current in R2', eq: 'P = I&sup2;R, so I = <span class="rad">&radic;</span>(P / R)',
      applies: d => d.device === 'power',
      work: d => ['<span class="rad">&radic;</span>(<b>' + aeng(d.fpk, 'W', 4) + '</b> / <b>' + aeng(d.f2, 'Ω', 4) + '</b>)',
                  aeng(d.netP.I23, 'A', 4)] },
    kVp: { given: true, name: 'The same current flows through R3, so across both', eq: 'V = IR',
      applies: d => d.device === 'volts' || d.device === 'power',
      work: d => { const n = d.device === 'volts' ? d.netV : d.netP;
        return ['<b>' + aeng(n.I23, 'A', 4) + '</b> &times; (<b>' + aeng(d.f2, 'Ω', 4) + '</b> + <b>' + aeng(d.f3, 'Ω', 4) + '</b>)',
                aeng(n.Vp, 'V', 4)]; } },
    kI1: { given: true, name: 'That voltage is across R1 as well', eq: 'I = V / R',
      applies: d => d.device === 'volts' || d.device === 'power',
      work: d => { const n = d.device === 'volts' ? d.netV : d.netP;
        return ['<b>' + aeng(n.Vp, 'V', 4) + '</b> / <b>' + aeng(d.f1, 'Ω', 4) + '</b>', aeng(n.I1, 'A', 4)]; } },
    kIT: { given: false, name: 'The two paths add up to the battery current', eq: 'I = I<sub>1</sub> + I<sub>2</sub>',
      applies: d => d.device === 'volts' || d.device === 'power',
      work: d => { const n = d.device === 'volts' ? d.netV : d.netP;
        return ['<b>' + aeng(n.I1, 'A', 4) + '</b> + <b>' + aeng(n.I23, 'A', 4) + '</b>', aeng(n.IT, 'A', 4)]; } },
    kVs: { given: false, name: 'Battery voltage: the pair plus R4', eq: 'V = V<sub>pair</sub> + I &times; R<sub>4</sub>',
      applies: d => d.device === 'volts' || d.device === 'power',
      work: d => { const n = d.device === 'volts' ? d.netV : d.netP;
        return ['<b>' + aeng(n.Vp, 'V', 4) + '</b> + <b>' + aeng(n.IT, 'A', 4) + '</b> &times; <b>' + aeng(d.f4, 'Ω', 4) + '</b>',
                aeng(n.Vs, 'V', 4)]; } },
    kP: { given: true, name: 'Power in R1', eq: 'P = V&sup2; / R',
      applies: d => d.device === 'volts' || d.device === 'power' || d.device === 'supply',
      work: d => { const n = d.device === 'volts' ? d.netV : d.device === 'power' ? d.netP : d.netS;
        return ['(<b>' + aeng(n.Vp, 'V', 4) + '</b>)&sup2; / <b>' + aeng(d.f1, 'Ω', 4) + '</b>', aeng(n.P1, 'W', 4)]; } },

    /* 2B1 Full: the bridge */
    bBal: { given: false, name: 'Is the bridge balanced?', eq: 'compare R1 / R2 with R3 / R4',
      applies: d => d.device === 'bridge',
      work: d => ['<b>' + aeng(d.b1, 'Ω', 4) + '</b> / <b>' + aeng(d.b2, 'Ω', 4) + '</b> = ' + atrim(d.b1 / d.b2, 4) +
                  ', <b>' + aeng(d.b3, 'Ω', 4) + '</b> / <b>' + aeng(d.b4, 'Ω', 4) + '</b> = ' + atrim(d.b3 / d.b4, 4),
                  d.br.balanced ? 'balanced: R5 carries nothing' : 'not balanced: R5 carries ' + aeng(Math.abs(d.br.I5), 'A', 3)] },
    bRt: { given: true, name: 'Resistance the battery sees, with R5 left out',
      eq: 'R<sub>T</sub> = 1 / (1/(R<sub>1</sub> + R<sub>2</sub>) + 1/(R<sub>3</sub> + R<sub>4</sub>))',
      applies: d => d.device === 'bridge' && d.br.balanced,
      work: d => ['1 / (1/<b>' + aeng(d.b1 + d.b2, 'Ω', 4) + '</b> + 1/<b>' + aeng(d.b3 + d.b4, 'Ω', 4) + '</b>)',
                  aeng(d.br.RT, 'Ω', 4)] },
    bI: { given: true, name: 'Current from the battery', eq: 'I = V / R',
      applies: d => d.device === 'bridge' && d.br.balanced,
      work: d => ['<b>' + d.bv + ANB + 'V</b> / <b>' + aeng(d.br.RT, 'Ω', 4) + '</b>', aeng(d.br.IT, 'A', 4)] },
    // an unbalanced bridge is not in the exam: R5 stays in and the whole network is solved
    bNet: { given: false, tag: { full: 'interest' },
      name: 'Not balanced, so R5 stays in: the whole network is solved for the battery current I',
      eq: 'R<sub>T</sub> = V / I',
      applies: d => d.device === 'bridge' && !d.br.balanced,
      work: d => ['<b>' + d.bv + ANB + 'V</b> / <b>' + aeng(d.br.IT, 'A', 4) + '</b>', aeng(d.br.RT, 'Ω', 4)] },

    /* 2B1 Full: the bias divider */
    aI: { given: true, name: 'Current down R2, and so through R1', eq: 'I = V / R',
      applies: d => d.device === 'bias' && d.aOk,
      work: d => ['<b>' + aeng(d.ab, 'V', 4) + '</b> / <b>' + aeng(d.a2, 'Ω', 4) + '</b>', aeng(d.aI, 'A', 4)] },
    aR1: { given: true, name: 'R1 drops the rest of the supply', eq: 'R = V / I',
      // at or above the supply there is no sum to do: the note says why
      applies: d => d.device === 'bias' && d.aOk,
      work: d => ['(<b>' + d.av + ANB + 'V</b> &minus; <b>' + aeng(d.ab, 'V', 4) + '</b>) / <b>' + aeng(d.aI, 'A', 4) + '</b>',
                  aeng(d.aR1, 'Ω', 4) + ', nearest preferred value ' + aeng(d.aE12, 'Ω', 3)] },

    /* 2B1 Full: the dummy load */
    lP: { given: true, name: 'Power in the load', eq: 'P = V&sup2; / R',
      applies: d => d.device === 'load',
      work: d => ['(<b>' + aeng(d.lv, 'V', 4) + '</b>)&sup2; / <b>' + aeng(d.lr, 'Ω', 4) + '</b>', aeng(d.lP, 'W', 4)] }
  },

  /* Words this bench introduces, defined where they are first used. */
  terms: {
    'electron': 'A tiny particle with a negative electric charge. In a metal some electrons are free to move, and when they all drift the same way that is an electric current.',
    'current': 'The flow of electric charge round a circuit. Its unit is the ampere, A, usually called the amp.',
    'voltage': 'The electrical push that drives a current, also called the potential difference or PD. Its unit is the volt, V.',
    'conductor': 'A material that lets electrons flow easily: copper, brass and other metals, and carbon.',
    'insulator': 'A material that stops electrons flowing: plastic, rubber, glass and ceramic. A wet insulator can let current across its surface.',
    'resistance': 'How strongly something opposes a current. Its unit is the ohm, &Omega;. A conductor has very little; an insulator has an enormous amount.',
    'tolerance': 'How far a component’s real value may be from its marked value, given as a percentage. A 4.7 k&Omega; resistor at &plusmn;5% may be anything from 4465 to 4935 &Omega;.',
    'worst case': 'The furthest a result can be pushed when every component sits at whichever end of its tolerance hurts most.',
    'potential divider': 'Two or more resistors in series across a supply, with an output taken from a point between them. The output is a fixed fraction of the supply.',
    'series': 'Connected end to end, one after another, so the same current flows through each part.',
    'parallel': 'Connected side by side, across the same two points, so each part has the same voltage across it.',
    'circuit': 'A complete loop from a source of electrical energy, through whatever it feeds, and back again.',
    'equivalent resistance': 'The one resistor that would draw the same current from the supply as the whole group does.',
    'cell': 'A single chemical source of voltage, 1.5 V for a common dry cell. A battery is several cells together.',
    'power': 'The rate at which electrical energy is turned into something else, such as heat or light. Its unit is the watt, W.',
    'balanced bridge': 'Two dividers side by side across one supply, set to the same ratio, so the two midpoints sit at the same voltage and a resistor joining them carries no current.',
    'preferred value': 'One of the standard resistor values that are actually made, such as the E12 series: 1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8 and 8.2, times a power of ten.',
    'EMF': 'Electromotive force: the voltage a source generates, which is what its terminals show when nothing at all is drawn from it.',
    'source resistance': 'The resistance inside a battery or other source. Current flowing through it loses some voltage before reaching the terminals. Also called internal resistance, or source impedance.',
    'terminal voltage': 'The voltage actually available at a source’s terminals, the EMF less whatever is lost across its source resistance.',
    'polarity': 'Which terminal is positive and which is negative. Red is positive, black negative.'
  },

  /* ---- how each panel draws itself ---- */
  panels: {

    /* 2A1 Foundation: put a material in the gap */
    materials(ctx) {
      const { p, d, t, ro } = ctx;
      const h = hues(t);
      markPreset(p, d.matIdx);
      const c = materialsCircuit(d);
      fitStage(p, c.layout, 300);
      const m = MATERIALS[d.matIdx];
      // the current each material would let through, on a log scale
      const { c: g, W, H } = prep(p.graph);
      const lo = 1e-7, hi = 1;
      const nameW = textW(g, 'Wet glass', '600 16px ' + GF) + 16;
      const top = 8, axis = 30;
      const rowH = (H - top - axis - 26) / MATERIALS.length;
      const X = I => nameW + (W - nameW - 12) * (Math.log10(I) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo));
      g.font = '15px ' + GM; g.fillStyle = h.faint; g.textAlign = 'center'; g.textBaseline = 'top';
      const ticks = [[1e-6, '1 µA'], [1e-3, '1 mA'], [1, '1 A']];
      ticks.forEach(([I, s]) => {
        g.strokeStyle = h.grid; g.lineWidth = 1;
        g.beginPath(); g.moveTo(X(I) + 0.5, top); g.lineTo(X(I) + 0.5, H - axis - 26); g.stroke();
        g.fillText(s.replace(' ', ANB), Math.min(W - 22, X(I)), H - axis - 20);
      });
      g.font = '600 15px ' + GF; g.fillStyle = h.soft; g.textBaseline = 'bottom';
      g.fillText('current through the gap, from ' + MAT_V + ANB + 'V', nameW + (W - nameW) / 2, H - 2);
      MATERIALS.forEach((mm, i) => {
        const y = top + i * rowH, I = isFinite(mm.R) ? MAT_V / (MAT_LAMP + mm.R) : 0;
        const sel = i === d.matIdx;
        g.font = (sel ? '700 ' : '600 ') + '16px ' + GF; g.fillStyle = sel ? h.ink : h.soft;
        g.textAlign = 'left'; g.textBaseline = 'middle';
        g.fillText(mm.name, 4, y + rowH / 2);
        if (I > 0) {
          g.fillStyle = h.i; g.globalAlpha = sel ? 0.9 : 0.35;
          g.fillRect(nameW, y + 6, Math.max(2, X(I) - nameW), rowH - 12);
          g.globalAlpha = 1;
          g.font = '500 15px ' + GM; g.fillStyle = sel ? h.ink : h.faint; g.textAlign = 'right';
          if (X(I) - nameW > 90) { g.fillStyle = sel && h.dark ? h.surface : h.ink; g.fillText(aeng(I, 'A', 3), X(I) - 6, y + rowH / 2); }
          else { g.textAlign = 'left'; g.fillText(aeng(I, 'A', 3), X(I) + 6, y + rowH / 2); }
        } else {
          g.font = '500 15px ' + GF; g.fillStyle = sel ? h.ink : h.faint; g.textAlign = 'left';
          g.fillText('far too small to measure', nameW + 4, y + rowH / 2);
        }
        if (sel) { g.strokeStyle = h.mark; g.lineWidth = 1.5; g.strokeRect(1, y + 2, W - 2, rowH - 4); }
      });
      p.legend.innerHTML = colourKey(ctx, ['i']) + '<span>Use the material buttons above the circuit to swap the sample.</span>';
      const kind = m.kind === 'conductor' ? 'conductor' : m.kind === 'wet' ? 'insulator, but wet' : 'insulator';
      p.readouts.innerHTML = ro([
        ['In the gap', m.name],
        ['It is', kind],
        ['Current', d.matI > 0 ? span(h.iInk, aeng(d.matI, 'A', 4)) : span(h.iInk, 'none to measure')],
        ['The lamp', d.matI > 0.1 ? 'lit' : 'dark'],
        ['Battery', span(h.v, MAT_V + ANB + 'V')]
      ]);
      return { layout: c.layout,
               flow: { mode: 'dc', currents: c.currents, iMax: 0.2, compress: true,
                       note: m.kind === 'wet' ? 'a trickle across the wet surface: the charge creeps'
                         : d.matI > 0 ? 'steady current: the charge drifts round the whole loop'
                         : 'no current: the charge cannot cross the gap' } };
    },

    /* 2A1 Intermediate: a marked value and the range it promises */
    tolerance(ctx) {
      const { p, d, t, ro } = ctx;
      const h = hues(t);
      const c = ohmCircuit(TOL_V, d.trAct, d.trIact,
        { r: 'R', rValue: aeng(d.tr, 'Ω', 3) + ' ±' + d.tt + '%' });
      c.layout.elements[2].value2 = 'is ' + aeng(d.trAct, 'Ω', 4);
      c.layout.elements[2].value2Colour = d.trIn ? 'r' : 'note';
      fitStage(p, c.layout, 270);   // room for a second row of marker labels on a phone
      const reach = Math.max(2.2 * d.tt, 1.3 * Math.abs(d.te), 8) / 100;
      const lo = d.tr * (1 - reach), hi = d.tr * (1 + reach);
      numberLine(p.graph, h, {
        lo: lo, hi: hi,
        band: { from: d.trLo, to: d.trHi, colour: h.r, text: 'inside tolerance: ' + aeng(d.trLo, 'Ω', 4) + ' to ' + aeng(d.trHi, 'Ω', 4) },
        ticks: [lo, d.tr, hi],
        marks: [
          { x: d.tr, colour: h.mark, width: 1.5, tall: 24, text: ['marked', aeng(d.tr, 'Ω', 4)] },
          { x: d.trAct, colour: d.trIn ? h.r : h.noteInk, dot: true, bold: true,
            text: [d.trIn ? 'this one: in tolerance' : 'this one: out of tolerance', aeng(d.trAct, 'Ω', 4)] }
        ]
      });
      p.legend.innerHTML = colourKey(ctx, ['r', 'i', 'v']);
      p.readouts.innerHTML = ro([
        ['Marked',aeng(d.tr, 'Ω', 4) + ' ±' + d.tt + '%'],
        ['Allowed range', aeng(d.trLo, 'Ω', 4) + ' to ' + aeng(d.trHi, 'Ω', 4)],
        ['This one', aeng(d.trAct, 'Ω', 4)],
        ['Verdict', d.trIn ? 'in tolerance' : span(h.noteInk, 'out of tolerance')],
        ['Current from 10 V', span(h.iInk, aeng(d.trIact, 'A', 4))]
      ]);
      return { layout: c.layout, flow: { mode: 'dc', currents: c.currents } };
    },

    /* 2A1 Full: worst cases, in a divider, an oscillator and an amplifier */
    worstcase(ctx) {
      const { p, d, t, ro } = ctx;
      const h = hues(t);
      const view = p.topology;
      if (view === 'lc') {
        showCtrls(p, ['fd', 'el', 'ec']);
        const c = tankCircuit(d);
        fitStage(p, c.layout, 260);
        p.fAnim = d.fAct;
        const pts = [], approx = [];
        for (let e = -10; e <= 10.001; e += 0.25) {
          pts.push({ x: e, y: d.fd / Math.sqrt(1 + e / 100) });
          approx.push({ x: e, y: d.fd * (1 - e / 200) });
        }
        const eEff = ((1 + d.el / 100) * (1 + d.ec / 100) - 1) * 100;
        const ymin = d.fd * 0.94, ymax = d.fd * 1.06;
        xyPlot(p.graph, h, {
          x: [-10, 10], y: [ymin, ymax], yTicks: 4,
          xTicks: [-10, -5, 0, 5, 10],
          xFmt: v => signed(v) + ANB + '%',
          yFmt: v => aeng(v, 'Hz', 4),
          xTitle: 'how far LC is from its design value',
          // frequency has no colour of its own in the scheme: it is drawn in ink,
          // the quick rule a dashed lighter ink, and this oscillator a ringed point
          traces: [{ pts: approx, colour: tint(h.ink, h.surface, 0.5), width: 1.6, dash: [6, 4] }, { pts: pts, colour: h.ink }],
          hlines: [{ y: d.fd, colour: h.faint }],
          vlines: [{ x: 0, colour: h.faint }],
          points: [{ x: eEff, y: d.fAct, colour: h.mark, ring: true }],
          // the reading goes in the empty corner on this oscillator's side, clear of
          // the falling trace and both dashed lines: low left when L C is low, high right when high
          labels: [eEff <= 0
            ? { x: -10, y: ymin, text: 'runs at ' + aeng(d.fAct, 'Hz', 5), colour: h.ink, bold: true, dx: 8, dy: -14 }
            : { x: 10, y: ymax, text: 'runs at ' + aeng(d.fAct, 'Hz', 5), colour: h.ink, bold: true, dx: -8, dy: 14, align: 'right' }]
        });
        p.legend.innerHTML = ctx.swatch(h.ink, 'Frequency, exactly') +
                             ctx.swatch(tint(h.ink, h.surface, 0.5), 'Half the per cent, the other way (dashed)') +
                             '<span><i style="width:13px;height:13px;border:3px solid ' + h.mark + ';border-radius:50%;box-sizing:border-box;background:transparent"></i>' +
                             '<span class="sw-l">This oscillator, the ring</span></span>';
        p.readouts.innerHTML = ro([
          ['Designed for', aeng(d.fd, 'Hz', 5)],
          ['L and C off by', signed(d.el) + ANB + '% and ' + signed(d.ec) + ANB + '%'],
          ['Runs at', aeng(d.fAct, 'Hz', 5)],
          ['Quick rule says', aeng(d.fApprox, 'Hz', 5)],
          ['Shift', signed(Number(atrim((d.fAct / d.fd - 1) * 100, 3))) + ANB + '%']
        ]);
        return { layout: c.layout, flow: { mode: 'ac', currents: c.currents } };
      }
      if (view === 'coupling') {
        showCtrls(p, ['cc', 'ctol']);
        const c = couplingCircuit(d.cc);
        fitStage(p, c.layout, 260);
        p.fAnim = 1000;
        const resp = (f, C) => {
          const fc = 1 / (2 * Math.PI * COUPLE_R * C);
          const hp = (f / fc) / Math.sqrt(1 + (f / fc) * (f / fc));
          const lp = 1 / Math.sqrt(1 + (f / DEVICE_FH) * (f / DEVICE_FH));
          return 20 * Math.log10(hp * lp);
        };
        const trace = C => { const out = []; for (let i = 0; i <= 300; i++) { const f = Math.pow(10, i / 50); out.push({ x: f, y: Math.max(-40, resp(f, C)) }); } return out; };
        const k = d.ctol / 100;
        const vEdge = tint(h.v, h.surface, 0.45);   // the same quantity, told apart by a lighter dashed line
        xyPlot(p.graph, h, {
          x: [1, 1e6], xlog: true, y: [-40, 0], yTicks: 4,
          // seven labels run together on a narrow graph: every other decade there
          xTicks: (p.graph.clientWidth || 600) < 600 ? [1, 100, 1e4, 1e6] : [1, 10, 100, 1e3, 1e4, 1e5, 1e6],
          xFmt: v => aeng(v, 'Hz', 2), yFmt: v => Math.round(v) + ANB + 'dB',
          xTitle: 'frequency',
          bands: [{ from: d.fcLow, to: d.fcHigh, colour: h.mark }],
          traces: [{ pts: trace(d.cc * (1 + k)), colour: vEdge, width: 1.4, dash: [5, 4] },
                   { pts: trace(d.cc * (1 - k)), colour: vEdge, width: 1.4, dash: [5, 4] },
                   { pts: trace(d.cc), colour: h.v }],
          hlines: [{ y: -3, colour: h.faint }],
          vlines: [{ x: DEVICE_FH, colour: h.faint }],
          labels: [{ x: d.fcNom, y: -12, text: 'moves with C1', colour: h.ink, bold: true, dx: 10 },
                   { x: DEVICE_FH, y: -12, text: 'fixed', colour: h.soft, bold: true, dx: -10, align: 'right' }]
        });
        p.legend.innerHTML = ctx.swatch(h.v, 'Output voltage, C1 as marked') +
                             ctx.swatch(vEdge, 'C1 at each end of its tolerance (dashed)') +
                             ctx.swatch(tint(h.mark, h.surface, 0.75), 'Where the low corner can land');
        p.readouts.innerHTML = ro([
          ['Low corner as marked', aeng(d.fcNom, 'Hz', 3)],
          ['Across the tolerance', aeng(d.fcLow, 'Hz', 3) + ' to ' + aeng(d.fcHigh, 'Hz', 3)],
          ['High corner', aeng(DEVICE_FH, 'Hz', 3) + ', unmoved'],
          ['Input R', aeng(COUPLE_R, 'Ω', 3)]
        ]);
        return { layout: c.layout, circuit: AM.parseNetlist(c.netlist) };
      }
      // the divider
      showCtrls(p, ['tv', 't1', 't2', 'tol']);
      const c = dividerCircuit({ V: d.tv, R1: d.t1, R2: d.t2,
        labels: { v1: aeng(d.t1, 'Ω', 3) + ' ±' + d.tol + '%', v2: aeng(d.t2, 'Ω', 3) + ' ±' + d.tol + '%',
                  out: 'Vout' } });
      fitStage(p, c.layout, 250);
      const span3 = Math.max(d.dHigh - d.dNom, d.dNom - d.dLow) * 1.8 || 1;
      numberLine(p.graph, h, {
        lo: d.dNom - span3, hi: d.dNom + span3,
        band: { from: d.dLow, to: d.dHigh, colour: h.v, text: 'every possible output' },
        ticks: [d.dLow, d.dNom, d.dHigh],
        marks: [
          { x: d.dLow, colour: h.v, text: ['R1 high, R2 low', aeng(d.dLow, 'V', 4), '−' + aeng(d.dNom - d.dLow, 'V', 3)] },
          { x: d.dNom, colour: h.mark, width: 1.5, tall: 24, text: ['design', aeng(d.dNom, 'V', 4)] },
          { x: d.dHigh, colour: h.v, text: ['R1 low, R2 high', aeng(d.dHigh, 'V', 4), '+' + aeng(d.dHigh - d.dNom, 'V', 3)] }
        ]
      });
      p.legend.innerHTML = colourKey(ctx, ['v', 'i']) + ctx.swatch(h.mark, 'The design value');
      p.readouts.innerHTML = ro([
        ['Design output', span(h.v, aeng(d.dNom, 'V', 4))],
        ['Lowest', span(h.v, aeng(d.dLow, 'V', 4)) + ' (−' + aeng(d.dNom - d.dLow, 'V', 3) + ')'],
        ['Highest', span(h.v, aeng(d.dHigh, 'V', 4)) + ' (+' + aeng(d.dHigh - d.dNom, 'V', 3) + ')'],
        ['Both high or both low', 'no change']
      ]);
      return { layout: c.layout, flow: { mode: 'dc', currents: c.currents } };
    },

    /* 2A2 Foundation: a complete loop, in series and in parallel */
    loop(ctx) {
      const { p, d, t, ro } = ctx;
      const h = hues(t);
      const view = p.topology;
      let c, rows;
      if (view === 'series' || view === 'open') {
        c = seriesLamps(d, view === 'open');
        const I = view === 'open' ? 0 : d.sI;
        rows = [{ name: 'Lamp A' }, { name: 'Lamp B' }];
        fitStage(p, c.layout, 200);
        barTable(p.graph, h, rows, [
          { title: 'Voltage across', colour: h.v, values: view === 'open' ? [0, 0] : [d.sVA, d.sVB], fmt: v => aeng(v, 'V', 3) },
          { title: 'Current through', colour: h.i, values: [I, I], fmt: v => aeng(v, 'A', 3) }
        ]);
        // say what the lamps look like from the glow they are drawn with
        const wA = glowWord(lampGlow(I * I * LAMP_A)), wB = glowWord(lampGlow(I * I * LAMP_B));
        p.readouts.innerHTML = ro([
          ['Switch', view === 'open' ? 'open: no loop' : 'closed'],
          ['Current, everywhere', span(h.iInk, aeng(I, 'A', 4))],
          ['Lamp A and lamp B', view === 'open' ? 'both dark'
            : (wA === wB ? 'both ' + wA : 'A ' + wA + ', B ' + wB) + ', same current'],
          ['Battery', span(h.v, aeng(d.sv, 'V', 4))]
        ]);
      } else {
        const cut = view === 'cut';
        c = parallelPair({ V: d.sv, IA: d.pIA, IB: d.pIB, cut: cut, lamps: true, withSwitch: true,
          nameA: 'lamp A', nameB: 'lamp B',
          valA: aeng(d.sv, 'V', 3), valAColour: 'v', val2A: aeng(d.pIA, 'A', 3),
          valB: cut ? '' : aeng(d.sv, 'V', 3), valBColour: 'v', val2B: cut ? '' : aeng(d.pIB, 'A', 3) });
        fitStage(p, c.layout, 200);
        barTable(p.graph, h, [{ name: 'Lamp A' }, { name: 'Lamp B', dim: cut }], [
          { title: 'Voltage across', colour: h.v, values: [d.sv, cut ? 0 : d.sv], fmt: v => aeng(v, 'V', 3) },
          { title: 'Current through', colour: h.i, values: [d.pIA, cut ? 0 : d.pIB], fmt: v => aeng(v, 'A', 3) }
        ]);
        p.readouts.innerHTML = ro([
          ['Voltage across each lamp', span(h.v, aeng(d.sv, 'V', 4))],
          ['Lamp A', glowWord(lampGlow(d.pIA * d.sv))],
          ['Lamp B', cut ? 'dark: its branch is cut' : glowWord(lampGlow(d.pIB * d.sv))],
          ['Battery supplies', span(h.iInk, aeng(d.pIA + (cut ? 0 : d.pIB), 'A', 4))]
        ]);
      }
      p.legend.innerHTML = colourKey(ctx, ['v', 'i']);
      return { layout: c.layout, flow: { mode: 'dc', currents: c.currents,
        note: view === 'open' ? 'no current anywhere: the loop is broken'
          : view === 'cut' ? 'lamp A carries on; nothing flows in the cut branch' : undefined } };
    },

    /* 2C1 Foundation: Ohm's law, and two loads on one supply */
    ohm(ctx) {
      const { p, d, t, ro } = ctx;
      const h = hues(t);
      markPreset(p, d.cmode);
      if (d.cmode === 3) {
        showCtrls(p, ['ov', 'or', 'or2']);
        const c = parallelPair({ V: d.ov, IA: d.oI1, IB: d.oI2, supplyName: 'supply',
          nameA: 'R1', nameB: 'R2', valA: d.or + ANB + 'Ω', val2A: aeng(d.oI1, 'A', 3),
          valB: d.or2 + ANB + 'Ω', val2B: aeng(d.oI2, 'A', 3) });
        fitStage(p, c.layout, 220);
        barTable(p.graph, h, [{ name: 'R1' }, { name: 'R2' }, { name: 'Total' }], [
          { title: 'Voltage across', colour: h.v, values: [d.ov, d.ov, d.ov], fmt: v => aeng(v, 'V', 3) },
          { title: 'Current', colour: h.i, values: [d.oI1, d.oI2, d.oIT], fmt: v => aeng(v, 'A', 3) }
        ]);
        p.legend.innerHTML = colourKey(ctx, ['v', 'i', 'r']);
        p.readouts.innerHTML = ro([
          ['Current in R1', span(h.iInk, aeng(d.oI1, 'A', 4))],
          ['Current in R2', span(h.iInk, aeng(d.oI2, 'A', 4))],
          ['From the supply', span(h.iInk, aeng(d.oIT, 'A', 4))],
          ['Voltage across each', span(h.v, d.ov + ANB + 'V')]
        ]);
        return { layout: c.layout, flow: { mode: 'dc', currents: c.currents } };
      }
      const V = d.cmode === 1 ? d.oV : d.ov;
      const R = d.cmode === 2 ? d.oR : d.or;
      const I = d.cmode === 0 ? d.oI : d.oi;
      showCtrls(p, d.cmode === 0 ? ['ov', 'or'] : d.cmode === 1 ? ['oi', 'or'] : ['ov', 'oi']);
      const c = ohmCircuit(V, R, I);
      fitStage(p, c.layout, 240);
      // round axes, with the operating point always on them
      const vMax = niceMax(Math.max(24, V)), iMax = niceMax(vMax / R);
      const vEnd = Math.min(vMax, iMax * R);
      // The two dashed lines through the operating point leave two empty boxes:
      // above the line to the left of it, and below the line to the right. The
      // line's label goes, on two rows, in the wider one, and the operating
      // point's label in the other, so neither crosses a dashed line.
      const lineText = [aeng(R, 'Ω', 4) + ', a straight line', 'through zero'];
      const right = V / vMax <= 0.5;
      const ln = (y, dy, k) => right
        ? { x: vMax, y: y, text: lineText[k], colour: h.r, align: 'right', dx: -8, dy: dy }
        : { x: 0, y: y, text: lineText[k], colour: h.r, align: 'left', dx: 8, dy: dy };
      const lineLabels = right
        ? (I / iMax >= 0.3 ? [ln(0, -30, 0), ln(0, -12, 1)] : [ln(I, -30, 0), ln(I, -12, 1)])
        : (1 - I / iMax >= 0.3 ? [ln(iMax, 12, 0), ln(iMax, 30, 1)] : [ln(I, 14, 0), ln(I, 32, 1)]);
      const pointText = aeng(V, 'V', 3) + ', ' + aeng(I, 'A', 3);
      const pointLabel = right
        ? { x: V, y: I, text: pointText, colour: h.ink, bold: true, align: 'right', dx: -12, dy: -16 }
        : { x: V, y: I, text: pointText, colour: h.ink, bold: true, dx: 12, dy: 16 };
      xyPlot(p.graph, h, {
        x: [0, vMax], y: [0, iMax], yTicks: 4,
        xTicks: quarters(vMax),
        xFmt: v => aeng(v, 'V', 3), yFmt: v => aeng(v, 'A', 3),
        xTitle: 'voltage across the resistor', yTitle: 'current',
        traces: [{ pts: [{ x: 0, y: 0 }, { x: vEnd, y: vEnd / R }], colour: h.r, width: 2 }],
        vlines: [{ x: V, colour: h.v }], hlines: [{ y: I, colour: h.i }],
        points: [{ x: V, y: I, colour: h.mark }],
        labels: lineLabels.concat([pointLabel])
      });
      p.legend.innerHTML = colourKey(ctx, ['v', 'i', 'r']);
      const found =['current', 'voltage', 'resistance'][d.cmode];
      p.readouts.innerHTML = ro([
        ['Working out', 'the ' + found],
        ['Voltage', span(h.v, aeng(V, 'V', 4))],
        ['Current', span(h.iInk, aeng(I, 'A', 4))],
        ['Resistance', span(h.r, aeng(R, 'Ω', 4))]
      ]);
      return { layout: c.layout, flow: { mode: 'dc', currents: c.currents } };
    },

    /* 2C1 Intermediate: series, parallel, both, and cells */
    network(ctx) {
      const { p, d, t, ro } = ctx;
      const h = hues(t);
      const view = p.topology;
      // two resistors or three, in series or in parallel; the mixture needs three
      const nn = view === 'series' || view === 'parallel' ? d.nn : 3;
      if (p.presets) p.presets.hidden = !(view === 'series' || view === 'parallel');
      if (view === 'series' || view === 'parallel') markPreset(p, nn === 3 ? 0 : 1);
      const Rs = [d.n1, d.n2, d.n3].slice(0, nn);
      if (view === 'cellsS' || view === 'cellsP') {
        showCtrls(p, ['nc', 'nl']);
        const ser = view === 'cellsS';
        const c = cellsCircuit(d.nc, ser, d.nl);
        fitStage(p, c.layout, 240);
        const E = ser ? d.nEs : CELL_V, I = E / d.nl;
        const rows = [], volts = [], amps = [];
        for (let k = 0; k < d.nc; k++) { rows.push({ name: 'Cell ' + (k + 1) }); volts.push(CELL_V); amps.push(ser ? I : I / d.nc); }
        rows.push({ name: 'Load' }); volts.push(E); amps.push(I);
        barTable(p.graph, h, rows, [
          { title: 'Voltage', colour: h.v, values: volts, fmt: v => aeng(v, 'V', 3) },
          { title: 'Current', colour: h.i, values: amps, fmt: v => aeng(v, 'A', 3) }
        ]);
        p.legend.innerHTML = colourKey(ctx, ['v', 'i']);
        p.readouts.innerHTML = ro([
          ['Cells', d.nc + ' of 1.5 V, ' + (ser ? 'in series' : 'in parallel')],
          ['Voltage on the load', span(h.v, aeng(E, 'V', 4))],
          ['Load current', span(h.iInk, aeng(I, 'A', 4))],
          ['From each cell', span(h.iInk, aeng(ser ? I : I / d.nc, 'A', 4))]
        ]);
        return { layout: c.layout, flow: { mode: 'dc', currents: c.currents } };
      }
      showCtrls(p, nn === 3 ? ['nv', 'n1', 'n2', 'n3'] : ['nv', 'n1', 'n2']);
      let c, RT, V3, I3;
      if (view === 'series') {
        RT = d.nSer; const I = d.nv / RT;
        c = seriesThree(d.nv, Rs, I);
        V3 = Rs.map(r => I * r); I3 = Rs.map(() => I);
      } else if (view === 'parallel') {
        RT = d.nPar;
        c = parallelThree(d.nv, Rs);
        V3 = Rs.map(() => d.nv); I3 = Rs.map(r => d.nv / r);
      } else {
        RT = d.nCombo; const I = d.nv / RT, Vp = I * d.nP23;
        c = comboThree(d.nv, Rs);
        V3 = [I * Rs[0], Vp, Vp]; I3 = [I, Vp / Rs[1], Vp / Rs[2]];
      }
      fitStage(p, c.layout, 250);
      const IT = d.nv / RT;
      barTable(p.graph, h, Rs.map((r, k) => ({ name: 'R' + (k + 1) })).concat([{ name: 'Total', hot: true }]), [
        { title: 'Resistance', colour: h.r, values: Rs.concat([RT]), fmt: v => aeng(v, 'Ω', 3), hotBold: true },
        { title: 'Voltage', colour: h.v, values: V3.concat([d.nv]), fmt: v => aeng(v, 'V', 3) },
        { title: 'Current', colour: h.i, values: I3.concat([IT]), fmt: v => aeng(v, 'A', 3) }
      ]);
      p.legend.innerHTML = colourKey(ctx, ['r', 'v', 'i']);
      const big = Math.max(...Rs), small = Math.min(...Rs);
      p.readouts.innerHTML = ro([
        ['Equivalent resistance', span(h.r, aeng(RT, 'Ω', 4))],
        ['Compared with the parts', view === 'series' ? (RT > big ? 'more than the largest' : '')
          : view === 'parallel' ? (RT < small ? 'less than the smallest' : '') : 'more than R1 alone, less than R1 + R2 + R3'],
        [view === 'parallel' ? 'Current in R1' : 'Voltage across R1', view === 'parallel'
          ? span(h.iInk, aeng(d.nv / Rs[0], 'A', 4)) : span(h.v, aeng(IT * Rs[0], 'V', 4))],
        ['Current from the supply', span(h.iInk, aeng(IT, 'A', 4))],
        ['Supply', span(h.v, d.nv + ANB + 'V')]
      ]);
      return { layout: c.layout, flow: { mode: 'dc', currents: c.currents } };
    },

    /* 2C2 Foundation: voltages round a series loop */
    seriesv(ctx) {
      const { p, d, t, ro } = ctx;
      const h = hues(t);
      const c = seriesThree(d.sv2, [d.s1, d.s2, d.s3], d.sIs);
      fitStage(p, c.layout, 250);
      voltStack(p.graph, h, { supply: d.sv2,
        parts: [{ name: 'R1', v: d.sV1 }, { name: 'R2', v: d.sV2 }, { name: 'R3', v: d.sV3 }] });
      p.legend.innerHTML = colourKey(ctx, ['v', 'i']);
      p.readouts.innerHTML = ro([
        ['Across R1', span(h.v, aeng(d.sV1, 'V', 4))],
        ['Across R2', span(h.v, aeng(d.sV2, 'V', 4))],
        ['Across R3', span(h.v, aeng(d.sV3, 'V', 4))],
        ['Added up', span(h.v, aeng(d.sV1 + d.sV2 + d.sV3, 'V', 4))],
        ['Current', span(h.iInk, aeng(d.sIs, 'A', 4))]
      ]);
      return { layout: c.layout, flow: { mode: 'dc', currents: c.currents } };
    },

    /* 2C2 Intermediate: two and three resistor dividers, and a loaded one */
    divider(ctx) {
      const { p, d, t, ro } = ctx;
      const h = hues(t);
      const view = p.topology;
      let c;
      if (view === 'three') {
        showCtrls(p, ['dv', 'd1', 'd2', 'd3']);
        c = dividerCircuit({ V: d.dv, R1: d.d1, R2: d.d2, R3: d.d3 });
        fitStage(p, c.layout, 300);
        const I = d.dv / d.dRT3;
        voltStack(p.graph, h, { supply: d.dv,
          parts: [{ name: 'R1', v: I * d.d1 }, { name: 'R2', v: I * d.d2 }, { name: 'R3', v: I * d.d3 }],
          taps: [{ v: d.dA, text: 'A: ' + aeng(d.dA, 'V', 4) }, { v: d.dB, text: 'B: ' + aeng(d.dB, 'V', 4) }] });
        p.readouts.innerHTML = ro([
          ['Output A', span(h.v, aeng(d.dA, 'V', 4))],
          ['Output B', span(h.v, aeng(d.dB, 'V', 4))],
          ['Current down the chain', span(h.iInk, aeng(I, 'A', 4))],
          ['Total resistance', span(h.r, aeng(d.dRT3, 'Ω', 4))]
        ]);
      } else {
        const loaded = view === 'loaded';
        showCtrls(p, loaded ? ['dv', 'd1', 'd2', 'dl'] : ['dv', 'd1', 'd2']);
        c = dividerCircuit({ V: d.dv, R1: d.d1, R2: d.d2, RL: loaded ? d.dl : 0, w: loaded ? 285 : 285 });
        fitStage(p, c.layout, 250);
        const Vout = loaded ? d.dLoaded : d.dOut;
        const taps = [{ v: d.dOut, text: (loaded ? 'formula: ' : 'out: ') + aeng(d.dOut, 'V', 4) }];
        if (loaded) taps.push({ v: d.dLoaded, text: 'loaded: ' + aeng(d.dLoaded, 'V', 4), solid: true });
        voltStack(p.graph, h, { supply: d.dv,
          parts: [{ name: 'R1', v: d.dv - Vout }, { name: loaded ? 'R2 and load' : 'R2', v: Vout }], taps: taps });
        p.readouts.innerHTML = ro([
          ['Output', span(h.v, aeng(Vout, 'V', 4))],
          ['Fraction of the supply', atrim(Vout / d.dv, 3)],
          loaded ? ['Formula, ignoring the load', aeng(d.dOut, 'V', 4)] : ['Current down the divider', span(h.iInk, aeng(d.dv / (d.d1 + d.d2), 'A', 4))],
          ['Supply', span(h.v, d.dv + ANB + 'V')]
        ]);
      }
      p.legend.innerHTML = colourKey(ctx, ['v', 'i']);
      return { layout: c.layout, flow: { mode: 'dc', currents: c.currents } };
    },

    /* 2B1 Foundation: P = V x I, and a resistor that warms */
    power(ctx) {
      const { p, d, t, ro } = ctx;
      const h = hues(t);
      markPreset(p, d.bmode);
      const V = d.bmode === 2 ? d.bV : d.pv;
      const I = d.bmode === 1 ? d.bI : d.pi;
      const P = d.bmode === 0 ? d.bP : d.pp;
      showCtrls(p, d.bmode === 0 ? ['pv', 'pi'] : d.bmode === 1 ? ['pp', 'pv'] : ['pp', 'pi']);
      const R = I > 0 ? V / I : Infinity;
      const c = ohmCircuit(V, R, I, { r: 'resistor', rValue: aeng(P, 'W', 3) + ' of heat', heat: Math.min(1, P / 60) });
      c.layout.elements[2].valueColour = 'p';
      fitStage(p, c.layout, 250);
      powerRect(p.graph, h, { V: V, I: I, P: P, vMax: niceMax(Math.max(24, V)), iMax: niceMax(Math.max(2, I)) });
      p.legend.innerHTML = colourKey(ctx, ['v', 'i', 'p']);
      p.readouts.innerHTML = ro([
        ['Voltage', span(h.v, aeng(V, 'V', 4))],
        ['Current', span(h.iInk, aeng(I, 'A', 4))],
        ['Power, as heat', span(h.p, aeng(P, 'W', 4))],
        ['The resistor is', isFinite(R) ? aeng(R, 'Ω', 4) : '—']
      ]);
      return { layout: c.layout, flow: { mode: 'dc', currents: c.currents } };
    },

    /* 2B1 Full: solve a network from whatever the question gives */
    solver(ctx) {
      const { p, d, t, ro } = ctx;
      const h = hues(t);
      const view = p.topology;
      if (view === 'bridge') {
        showCtrls(p, ['bv', 'b1', 'b2', 'b3', 'b4', 'b5']);
        const R = [d.b1, d.b2, d.b3, d.b4, d.b5];
        const c = bridgeCircuit(d.br, R, d.bv);
        const I = [d.br.I1, d.br.I2, d.br.I3, d.br.I4, d.br.I5];
        const V = I.map((x, k) => x * R[k]);
        const P = I.map((x, k) => x * x * R[k]);
        const hot = P.indexOf(Math.max(...P));
        c.layout.elements.forEach((e, k) => { if (k > 0) e.heat = P[k - 1] / P[hot]; });
        fitStage(p, c.layout, 290);
        barTable(p.graph, h, R.map((r, k) => ({ name: 'R' + (k + 1), hot: k === hot })), [
          { title: 'Voltage', colour: h.v, values: V.map(Math.abs), fmt: v => aeng(v, 'V', 3) },
          { title: 'Current', colour: h.i, values: I.map(Math.abs), fmt: v => aeng(v, 'A', 3) },
          { title: 'Power', colour: h.p, values: P, fmt: v => aeng(v, 'W', 3), hotBold: true }
        ], { hotMark: h.p, hotText: 'hottest' });
        p.legend.innerHTML = colourKey(ctx, ['v', 'i', 'p']);
        p.readouts.innerHTML = ro([
          ['Balanced?', d.br.balanced ? 'yes: R1/R2 = R3/R4' : 'no'],
          ['Current in R5', span(h.iInk, d.br.balanced ? 'none' : aeng(Math.abs(d.br.I5), 'A', 3))],
          ['Battery sees', span(h.r, aeng(d.br.RT, 'Ω', 4))],
          ['Current from the battery', span(h.iInk, aeng(d.br.IT, 'A', 4))]
        ]);
        return { layout: c.layout, flow: { mode: 'dc', currents: c.currents } };
      }
      if (view === 'bias') {
        showCtrls(p, ['av', 'a2', 'ab']);
        if (!d.aOk) {
          // nothing sensible to draw: say why, and show the circuit with the
          // largest R1 the slider could mean, dead
          const c = dividerCircuit({ V: d.av, R1: d.a2, R2: d.a2, labels: { v1: 'none', out: 'to the base' } });
          dead(c.layout);
          c.layout.notes = [{ at: [150, 240], text: 'base voltage at or above the supply', c: 'note', mono: false }];
          fitStage(p, c.layout, 220);
          barTable(p.graph, h, [{ name: 'R1', dim: true }, { name: 'R2' }], [
            { title: 'Voltage wanted', colour: h.v, values: [null, d.ab], fmt: v => aeng(v, 'V', 3) },
            { title: 'Supply', colour: h.v, values: [null, d.av], fmt: v => aeng(v, 'V', 3) }
          ]);
          p.legend.innerHTML = colourKey(ctx, ['v']);
          p.readouts.innerHTML = ro([['R1', span(h.noteInk, 'no value works')],
            ['Why', 'the base voltage is at or above the supply; it must be below it']]);
          return { layout: c.layout, flow: { mode: 'dc', currents: { I: 0, I2: 0 },
            note: 'no current: no value of R1 can give that voltage' } };
        }
        const c = dividerCircuit({ V: d.av, R1: d.aR1, R2: d.a2,
          labels: { v1: aeng(d.aR1, 'Ω', 4) + '?', out: 'to the base' } });
        fitStage(p, c.layout, 220);
        barTable(p.graph, h, [{ name: 'R1' }, { name: 'R2' }], [
          { title: 'Resistance', colour: h.r, values: [d.aR1, d.a2], fmt: v => aeng(v, 'Ω', 3) },
          { title: 'Voltage', colour: h.v, values: [d.aV1, d.ab], fmt: v => aeng(v, 'V', 3) },
          { title: 'Current', colour: h.i, values: [d.aI, d.aI], fmt: v => aeng(v, 'A', 3) }
        ]);
        p.legend.innerHTML = colourKey(ctx, ['r', 'v', 'i']);
        p.readouts.innerHTML = ro([
          ['R1 works out at', span(h.r, aeng(d.aR1, 'Ω', 4))],
          ['Nearest preferred value', span(h.r, aeng(d.aE12, 'Ω', 3))],
          ['Current in both', span(h.iInk, aeng(d.aI, 'A', 4))],
          ['Base current', 'taken as too small to matter']
        ]);
        return { layout: c.layout, flow: { mode: 'dc', currents: c.currents } };
      }
      if (view === 'load') {
        showCtrls(p, ['lv', 'lr']);
        const c = loadCircuit(d);
        fitStage(p, c.layout, 220);
        p.fAnim = 7.1e6;
        barTable(p.graph, h, [{ name: 'Load', hot: true }], [
          { title: 'Voltage, RMS', colour: h.v, values: [d.lv], fmt: v => aeng(v, 'V', 3) },
          { title: 'Current, RMS', colour: h.i, values: [d.lI], fmt: v => aeng(v, 'A', 3) },
          { title: 'Power', colour: h.p, values: [d.lP], fmt: v => aeng(v, 'W', 3), hotBold: true }
        ]);
        p.legend.innerHTML = colourKey(ctx, ['v', 'i', 'p']);
        p.readouts.innerHTML = ro([
          ['Power, V² / R', span(h.p, aeng(d.lP, 'W', 4))],
          ['Current', span(h.iInk, aeng(d.lI, 'A', 4))],
          ['If ' + aeng(d.lv, 'V', 3) + ' were the peak', aeng(d.lP / 2, 'W', 4)]
        ]);
        return { layout: c.layout, flow: { mode: 'ac', currents: c.currents } };
      }
      // the bank network, from the supply, from a voltage, or from a power
      showCtrls(p, ['f1', 'f2', 'f3', 'f4', view === 'supply' ? 'fv' : view === 'volts' ? 'fvk' : 'fpk']);
      const n = view === 'supply' ? d.netS : view === 'volts' ? d.netV : d.netP;
      const R = [d.f1, d.f2, d.f3, d.f4];
      const c = networkCircuit(n, R);
      fitStage(p, c.layout, 260);
      const Vs = [n.Vp, n.V2, n.V3, n.V4], Is = [n.I1, n.I23, n.I23, n.IT], Ps = [n.P1, n.P2, n.P3, n.P4];
      barTable(p.graph, h, R.map((r, k) => ({ name: 'R' + (k + 1), hot: k === c.hot })), [
        { title: 'Voltage', colour: h.v, values: Vs, fmt: v => aeng(v, 'V', 3) },
        { title: 'Current', colour: h.i, values: Is, fmt: v => aeng(v, 'A', 3) },
        { title: 'Power', colour: h.p, values: Ps, fmt: v => aeng(v, 'W', 3), hotBold: true }
      ], { hotMark: h.p, hotText: 'hottest' });
      p.legend.innerHTML = colourKey(ctx, ['v', 'i', 'p']);
      p.readouts.innerHTML = ro([
        ['Started from', view === 'supply' ? 'the battery, ' + aeng(d.fv, 'V', 4)
          : view === 'volts' ? aeng(d.fvk, 'V', 4) + ' across R2' : aeng(d.fpk, 'W', 4) + ' in R2'],
        ['Battery', span(h.v, aeng(n.Vs, 'V', 4))],
        ['Battery current', span(h.iInk, aeng(n.IT, 'A', 4))],
        ['Hottest', 'R' + (c.hot + 1) + ', ' + span(h.p, aeng(Ps[c.hot], 'W', 3))]
      ]);
      return { layout: c.layout, flow: { mode: 'dc', currents: c.currents } };
    },

    /* 2C3 Intermediate: EMF, source resistance and the terminal voltage */
    emf(ctx) {
      const { p, d, t, ro } = ctx;
      const h = hues(t);
      const open = p.topology === 'open';
      showCtrls(p, open ? ['ee', 'er'] : ['ee', 'er', 'el2']);
      const c = emfCircuit(d, open);
      fitStage(p, c.layout, 260);
      const Isc = d.ee / d.er;
      const I = open ? 0 : d.eI;
      const xMax = niceMax(Math.min(Isc, Math.max(d.eI * 2.5, Isc * 0.02)));
      const xEnd = Math.min(xMax, Isc);
      xyPlot(p.graph, h, {
        x: [0, xMax], y: [0, niceMax(d.ee * 1.1)], yTicks: 4, xTicks: quarters(xMax),
        xFmt: v => aeng(v, 'A', 3), yFmt: v => aeng(v, 'V', 3),
        xTitle: 'current drawn from the battery', yTitle: 'voltage at the terminals',
        hlines: [{ y: d.ee, colour: h.v }],
        traces: [{ pts: [{ x: 0, y: d.ee }, { x: xEnd, y: d.ee - xEnd * d.er }], colour: h.v }],
        vlines: [{ x: I, colour: h.i }],
        points: [{ x: I, y: open ? d.ee : d.eV, colour: h.mark }],
        labels: [{ x: xMax, y: d.ee, text: 'EMF ' + aeng(d.ee, 'V', 4), colour: h.v, align: 'right', dx: -6, dy: -13 },
                 { x: I, y: open ? d.ee : d.eV, text: aeng(open ? d.ee : d.eV, 'V', 4), colour: h.v, bold: true, dx: 12, dy: 18 }]
      });
      p.legend.innerHTML = colourKey(ctx, ['v', 'i']) + ctx.swatch(h.mark, 'This load') +
                           '<span>Dashed blue: the EMF. Solid blue: the terminal voltage.</span>';
      p.readouts.innerHTML = ro([
        ['EMF', span(h.v, aeng(d.ee, 'V', 4))],
        ['At the terminals', span(h.v, aeng(open ? d.ee : d.eV, 'V', 4))],
        ['Lost inside', span(h.v, aeng(open ? 0 : d.eLost, 'V', 3))],
        ['Current', span(h.iInk, aeng(I, 'A', 4))],
        ['Power in the load, for interest', open ? '0 W' : span(h.p, aeng(d.ePL, 'W', 3))],
        ['Heat inside, for interest', open ? '0 W' : span(h.p, aeng(d.ePr, 'W', 3))]
      ]);
      return { layout: c.layout, flow: { mode: 'dc', currents: c.currents,
        note: open ? 'no current: the voltmeter reads the whole EMF' : undefined } };
    },

    /* 2C4 Foundation: the right way round, and the wrong way */
    polarity(ctx) {
      const { p, d, t, ro } = ctx;
      const h = hues(t);
      const rev = p.topology === 'reversed';
      const c = polarityCircuit(rev);
      fitStage(p, c.layout, 230);
      // a radio's power lead, the right way round or crossed
      const { c: g, W, H } = prep(p.graph);
      const bx = 20, by = H / 2 - 50, rx = W - 190, ry = H / 2 - 60;
      g.lineWidth = 2; g.strokeStyle = h.ink; g.fillStyle = h.surface;
      g.strokeRect(bx, by, 110, 100);
      g.font = '600 16px ' + GF; g.fillStyle = h.ink; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('power supply', bx + 55, by + 50);
      g.strokeRect(rx, ry, 170, 120);
      g.fillText('radio', rx + 85, ry + 60);
      const pins = { sp: [bx + 110, by + 28], sn: [bx + 110, by + 72], rp: [rx, ry + 34], rn: [rx, ry + 86] };
      g.font = '700 18px ' + GF;
      g.fillText('+', pins.sp[0] - 14, pins.sp[1]); g.fillText('−', pins.sn[0] - 14, pins.sn[1]);
      g.fillText('+', pins.rp[0] + 14, pins.rp[1]); g.fillText('−', pins.rn[0] + 14, pins.rn[1]);
      const lead = (a, b, colour) => {
        g.strokeStyle = colour; g.lineWidth = 5; g.beginPath(); g.moveTo(a[0], a[1]);
        g.bezierCurveTo((a[0] + b[0]) / 2, a[1], (a[0] + b[0]) / 2, b[1], b[0], b[1]); g.stroke();
      };
      const red = '#D22B2B', black = h.dark ? '#BBBBBB' : '#1A1A1A';
      if (!rev) { lead(pins.sp, pins.rp, red); lead(pins.sn, pins.rn, black); }
      else { lead(pins.sp, pins.rn, red); lead(pins.sn, pins.rp, black); }
      g.font = '600 16px ' + GF; g.textAlign = 'center'; g.textBaseline = 'top';
      g.fillStyle = rev ? h.noteInk : h.ink;
      g.fillText(rev ? 'red on −, black on +: reversed' : 'red to +, black to −', W / 2, Math.min(H - 24, ry + 132));
      p.legend.innerHTML = colourKey(ctx, ['i']) + '<span>Red lead: positive. Black lead: negative.</span>';
      p.readouts.innerHTML = ro([
        ['Battery', rev ? 'reversed' : 'the right way round'],
        ['LED', rev ? span(h.noteInk, 'dark') : 'lit'],
        ['Current', rev ? span(h.iInk, 'none') : span(h.iInk, aeng((LED_SUPPLY - LED_VF) / LED_R, 'A', 3))]
      ]);
      return { layout: c.layout, flow: { mode: 'dc', currents: c.currents,
        note: rev ? 'no current: the LED will not conduct this way round' : undefined } };
    }
  },

  /* ---- the seven items, in reading order ---- */
  items: [
    {
      code: '2A1',
      levels: ['foundation', 'intermediate', 'full'],
      introduces: {
        foundation: ['electron', 'current', 'voltage', 'circuit', 'conductor', 'insulator', 'resistance'],
        intermediate: ['tolerance'],
        full: ['worst case', 'potential divider']
      },
      panel: { foundation: 'materials', intermediate: 'tolerance', full: 'worstcase' },
      circuit: 'divider',
      controls: {
        intermediate: ['tr', 'tt', 'te'],
        full: ['tv', 't1', 't2', 'tol', 'fd', 'el', 'ec', 'cc', 'ctol'],
        buttons: ['mat']
      },
      toggle: { label: 'Circuit', levels: ['full'],
                options: [['divider', 'Divider'], ['lc', 'Oscillator'], ['coupling', 'Coupling capacitor']] },
      presets: MATERIALS.map((m, i) => ({ label: m.name, values: { mat: i }, levels: ['foundation'],
                                          note: i === 0 ? 'Put a different material in the gap.' : undefined })),
      heading: { foundation: 'Conductors, insulators, amps and volts',
                 intermediate: 'Marked value and measured value',
                 full: 'Tolerance: how far a result can drift' },
      lead: {
        foundation: 'Start with the simplest circuit there is: a battery, a lamp, and a gap. What you put in the gap decides whether anything happens.',
        intermediate: 'A resistor marked 4.7 kΩ is almost never exactly 4.7 kΩ. The marking promises a range, and the tolerance says how wide it is.',
        full: 'Every part in a circuit is somewhere inside its tolerance. The question the exam asks is how far the result can move when they all land in the worst places at once.'
      },
      headline: {
        foundation: 'Current is electrons on the move. Which everyday materials let them through, and which do not.',
        intermediate: 'Components are never exactly their marked value. Every one carries a tolerance.',
        full: 'How tolerances add up across a circuit, and what that does to the result you get.'
      },
      formulas: {
        foundation: [],
        intermediate: ['tolRange', 'tolCurrent'],
        full: ['divNom', 'divLow', 'divHigh', 'fLC', 'fHalf', 'fCR']
      },
      workLead: {
        intermediate: 'The range first, from the marking and the tolerance, then what this particular resistor does to the current.',
        full: d => d.device === 'divider'
          ? 'The design value from the divider formula, then each worst case: put each resistor at whichever end of its tolerance pushes the output furthest.'
          : d.device === 'lc'
            ? 'The exact answer from the resonance formula, then the quick rule the exam expects you to know.'
            : 'The low corner of a coupling capacitor, at its marked value and at both ends of its tolerance.'
      },
      workNote: {
        foundation: 'There is no sum here. What this item asks for is which materials conduct and which do not, and the two units: current in amperes (A), voltage in volts (V). Neither unit is printed in the Foundation booklet, so learn them.',
        intermediate: 'At this level the exam asks you to know that a measured value can differ from the marked one, not to work out its effect. The range is worth being able to do in your head: 5% of 4.7 kΩ is 235 Ω, so 4465 to 4935 Ω.',
        full: d => d.device === 'divider'
          ? 'The divider formula is printed in the booklet; the worst case method is not, so learn it. Work out both ends: the two deviations are not equal, and the exam asks for the larger, or for one particular direction. If both resistors are high, or both low, by the same per cent, the ratio does not change and neither does the output.'
          : d.device === 'lc'
            ? 'The booklet prints f = 1 / 2&pi;&radic;(LC). It does not print the quick rule: a few per cent too much L or C lowers the frequency by about half that per cent, and too little raises it. The exact answer and the rule agree to within a few hundredths of a per cent at 2%, which is why the exam options can be read either way.'
            : 'Not printed in the booklet: it comes from X<sub>C</sub> = 1/2&pi;fC, which is printed, set equal to R. A coupling or decoupling capacitor that is 20% low pushes the low corner 25% higher, because f goes as 1/C. Nothing in that sum touches the top of the range, which is set by the transistor and the stray capacitance in the circuit.'
      },
      explain: {
        foundation: [
          'A metal wire is full of electrons that are free to move. Connect a battery and they all drift the same way round the loop: that drift is an electric current, measured in amperes. The battery’s push is its voltage, measured in volts. The dots show conventional current, from + round to −; the electrons themselves drift the other way.',
          'Press each material button and watch the lamp and the dots. Copper, brass and carbon are conductors: the electrons get through easily and the lamp lights. Plastic, rubber, glass and ceramic are insulators: the current is far too small to measure, and nothing moves.',
          'Now try wet glass. Water on the surface carries a trickle of current across an insulator that is dry inside. At 6 V it is only a few microamps, nowhere near enough to light a lamp, but at mains voltage the same wet surface can carry a dangerous current. That is why water and electrical equipment do not mix.'
        ],
        intermediate: [
          'The tolerance is the maker’s promise. A 4.7 kΩ resistor at ±5% will measure somewhere between 4465 Ω and 4935 Ω, and any value inside that band is a good resistor.',
          'Move the third slider to set where this particular resistor actually sits. Inside the shaded band it is in tolerance, however far it is from the marking. Outside it, the resistor is out of tolerance: faulty, damaged by heat, or drifted with age.',
          'The effect is real. The same 10 V across a resistor that measures 3% high gives a current about 3% lower than the marking suggests. For most circuits that does not matter, which is why 5% parts are ordinary; where it does, closer tolerances such as 1% are used.'
        ],
        full: [
          'Tolerances only matter when they change something you care about, so the exam asks about circuits rather than single parts. Choose a circuit with the tabs below the circuit and graph.',
          'In a potential divider the output depends only on the ratio of the two resistors. The ratio moves furthest when one resistor is high and the other low, so that is the worst case: R1 high and R2 low gives the lowest output, R1 low and R2 high the highest. Set R1 to 80 kΩ and R2 to 20 kΩ from 10 V and the design is 2.000 V; at 5% the output can be anywhere from 1.845 V to 2.165 V.',
          'In an oscillator the frequency goes as 1 / &radic;(LC), so a part 2% low raises the frequency by about 1%. In an amplifier, the coupling capacitors in and out and the capacitor bypassing the emitter or source resistor each make a corner at the bottom of the range, so the tolerance of every one of them moves the lowest frequency the stage will handle. None of them affects the highest, because at high frequencies they are all as good as short circuits.',
          'The worst case is a guarantee, not a forecast: most parts in a batch sit nearer the middle, so most circuits come out closer to the design. Designers still work to the worst case, because it is the one result they can promise.'
        ]
      }
    },

    {
      code: '2A2',
      levels: ['foundation'],
      introduces: {
        foundation: ['series', 'parallel']
      },
      panel: 'loop',
      circuit: 'series',
      controls: {
        foundation: ['sv']
      },
      toggle: { label: 'Connection', levels: ['foundation'],
                options: [['series', 'In series'], ['open', 'Series, switch open'],
                          ['parallel', 'In parallel'], ['cut', 'Parallel, one branch cut']] },
      heading: { foundation: 'A complete loop, in series and in parallel' },
      lead: {
        foundation: 'Current only flows round a complete loop, and the loop needs something to push it. How the parts are arranged in that loop decides what each of them gets.'
      },
      headline: {
        foundation: 'Current needs a complete loop and something to push it. How it splits, and how it does not.'
      },
      formulas: { foundation: [] },
      workNote: {
        foundation: 'Nothing to calculate in this item. Two facts to learn: in series the current is the same everywhere in the loop, and in parallel each branch has the same voltage across it.'
      },
      explain: {
        foundation: [
          'A circuit needs a source of electrical energy, here a battery, and a complete path from one terminal round to the other. Open the switch and the loop is broken: every dot stops, everywhere at once, not just near the switch.',
          'In series the two lamps sit one after the other, so the same current flows through both. Look at the dots: they move at the same speed in every part of the loop. The battery’s voltage is shared between the two lamps, which is why each is dimmer than it would be alone.',
          'In parallel each lamp is connected straight across the battery, so each has the full battery voltage across it. Cut one branch and the other lamp carries on exactly as before, which is why the lights in a house are wired in parallel.'
        ]
      }
    },

    {
      code: '2C1',
      levels: ['foundation', 'intermediate'],
      introduces: {
        foundation: [],
        intermediate: ['series', 'parallel', 'equivalent resistance', 'cell']
      },
      panel: { foundation: 'ohm', intermediate: 'network' },
      circuit: 'combo',
      controls: {
        foundation: ['ov', 'oi', 'or', 'or2'],
        intermediate: ['nv', 'n1', 'n2', 'n3', 'nc', 'nl'],
        buttons: ['cmode', 'nn']
      },
      toggle: { label: 'Network', levels: ['intermediate'],
                options: [['series', 'Series'], ['parallel', 'Parallel'], ['combo', 'Series and parallel'],
                          ['cellsS', 'Cells in series'], ['cellsP', 'Cells in parallel']] },
      presets: [
        { label: 'Find the current', values: { cmode: 0 }, levels: ['foundation'], note: 'Choose what to work out from the other two.' },
        { label: 'Find the voltage', values: { cmode: 1 }, levels: ['foundation'] },
        { label: 'Find the resistance', values: { cmode: 2 }, levels: ['foundation'] },
        { label: 'Two loads on one supply', values: { cmode: 3 }, levels: ['foundation'] },
        { label: 'Three resistors', values: { nn: 3 }, levels: ['intermediate'], note: 'Series or parallel, with two resistors or three.' },
        { label: 'Two resistors', values: { nn: 2 }, levels: ['intermediate'] }
      ],
      heading: { foundation: 'Ohm’s law', intermediate: 'Resistors and cells in series and parallel' },
      lead: {
        foundation: 'Voltage, current and resistance are tied together by one rule. Know any two and the third follows.',
        intermediate: 'Most circuits are a handful of resistors in some mixture of series and parallel. Collapse each group into the one resistor that would do the same job, and Ohm’s law does the rest.'
      },
      headline: {
        foundation: 'Resistance opposes current. How voltage, current and resistance tie together.',
        intermediate: 'Resistors and cells in series and parallel, and solving for whichever quantity you are missing.'
      },
      formulas: {
        foundation: ['ohmI', 'ohmV', 'ohmR', 'twoI', 'iSum'],
        intermediate: ['rSer', 'rSer2', 'rPar', 'rPar2', 'rTwo', 'rCombo', 'iNet', 'vR1', 'iR1', 'cellSer', 'cellPar']
      },
      workLead: {
        foundation: 'Ohm’s law, written the way round that gives the quantity you want.',
        intermediate: d => d.device === 'cellsS' || d.device === 'cellsP'
          ? 'Cells combine by their voltages, not by any formula on the sheet.'
          : 'Combine the resistors into one, then use Ohm’s law for the current from the supply, and again for any one resistor.'
      },
      workNote: {
        foundation: 'Not printed in the Foundation booklet, so learn it: V = I &times; R, and the two rearrangements I = V / R and R = V / I. If it helps, draw the triangle with V on top and I and R underneath, and cover the one you want.',
        intermediate: 'The series and parallel formulas and V = IR are printed in the Intermediate booklet; the shortcut for two in parallel, product over sum, is not. Convert everything to the same unit before you add: 1 kΩ plus 470 Ω is 1.47 kΩ. Milliamps times kilohms gives volts, which saves converting at all.'
      },
      explain: {
        foundation: [
          'Resistance is how strongly something opposes a current, measured in ohms (Ω). For a resistor, the current is in proportion to the voltage across it: double the voltage and the current doubles. That is why the graph is a straight line through zero.',
          'Choose what to work out with the buttons, then move the other two sliders and watch the answer follow. Give the unit every time: 12 V across 6 Ω is 2 A, not 2.',
          'Press “Two loads on one supply” to connect a second resistor alongside the first. Each draws its own current, and the supply provides the two added together. Every extra load connected across a supply adds its own current to the total.'
        ],
        intermediate: [
          'In series the resistances add, so the total is always more than the largest resistor. In parallel the total is always less than the smallest, because each extra path lets more current through. The equivalent resistance in the table moves as you drag each resistor, and the buttons above the circuit switch between two resistors and three.',
          'For a mixture, work from the inside out. Two resistors in parallel collapse to one; that one is in series with the rest, so add it on. For example, 1 kΩ in series with two 1 kΩ in parallel is 1.5 kΩ, which takes 8 mA from 12 V, with 8 V across R1 and 4 V across the pair.',
          'Cells follow their own rule. In series their voltages add: four 1.5 V cells make 6 V. In parallel the voltage stays at 1.5 V and each cell supplies a share of the current, so the battery lasts longer. Only identical cells should be connected in parallel, all the same way round.'
        ]
      }
    },

    {
      code: '2C2',
      levels: ['foundation', 'intermediate'],
      introduces: {
        foundation: [],
        intermediate: ['potential divider']
      },
      panel: { foundation: 'seriesv', intermediate: 'divider' },
      circuit: 'two',
      controls: {
        foundation: ['sv2', 's1', 's2', 's3'],
        intermediate: ['dv', 'd1', 'd2', 'd3', 'dl']
      },
      toggle: { label: 'Divider', levels: ['intermediate'],
                options: [['two', 'Two resistors'], ['three', 'Three resistors'], ['loaded', 'With a load, for interest']] },
      heading: { foundation: 'Voltages in series add up to the supply', intermediate: 'The potential divider' },
      lead: {
        foundation: 'Put three resistors in series across a supply and the supply voltage is shared between them. Not equally: in proportion to their size.',
        intermediate: 'Share a supply between resistors in series and take an output from part way down. That is a potential divider, and it is how a circuit gets a lower voltage from a higher one.'
      },
      headline: {
        foundation: 'The voltages across resistors in series add up to the supply voltage.',
        intermediate: 'Two or three resistors as a potential divider, and how to work out the output.'
      },
      formulas: {
        foundation: ['vEach', 'vSum'],
        intermediate: ['div', 'div3', 'divLoad']
      },
      workLead: {
        foundation: 'The same current flows through all three, so each voltage is that current times its own resistance.',
        intermediate: 'The output is the supply times the fraction of the total resistance it is taken across.'
      },
      workNote: {
        foundation: 'Neither line is in the Foundation booklet. The rule to remember is the second one: whatever the resistors, the voltages across them add up to the supply.',
        intermediate: 'Printed in the Intermediate booklet. R2 is always the resistor the output is taken across, the one between the output and 0 V. With three resistors, use the same formula with everything below the output counted as R2. The loaded case is for interest: the formula assumes nothing is connected to the output.'
      },
      explain: {
        foundation: [
          'Drag any resistor and watch the column on the right. The supply voltage is shared out between the three, and however you set them the three pieces always add up to the supply.',
          'The biggest resistor takes the biggest share. With 10, 20 and 30 Ω across 12 V the current is 0.2 A and the voltages are 2, 4 and 6 V: in the same proportion as the resistors, and adding up to 12 V.',
          'The dots move at the same speed all the way round, because in series there is only one current. What changes from one resistor to the next is the voltage, not the current.'
        ],
        intermediate: [
          'In a potential divider the output is the voltage across the bottom resistor, R2. The fraction it gets is R2 divided by the total, so 3 kΩ under 6 kΩ gives a third of the supply, 4 V from 12 V.',
          'Three resistors give two outputs. The formula is the same each time: everything below the tap counts as the bottom resistor. With 6 kΩ, 3 kΩ and 3 kΩ across 12 V, the taps sit at 6 V and 3 V.',
          'Switch to “With a load” for interest. Anything connected to the output draws current and sits in parallel with R2, so the output drops below what the formula says. Make the load much larger than R2 and the formula is close; make it comparable and it is not. That is why a divider feeding a transistor’s base is designed to carry several times the base current.'
        ]
      }
    },

    {
      code: '2B1',
      levels: ['foundation', 'full'],
      introduces: {
        foundation: ['power'],
        full: ['balanced bridge', 'preferred value']
      },
      panel: { foundation: 'power', full: 'solver' },
      circuit: 'volts',
      controls: {
        foundation: ['pv', 'pi', 'pp'],
        full: ['f1', 'f2', 'f3', 'f4', 'fv', 'fvk', 'fpk', 'bv', 'b1', 'b2', 'b3', 'b4', 'b5', 'av', 'a2', 'ab', 'lv', 'lr'],
        buttons: ['bmode']
      },
      toggle: { label: 'Start from', levels: ['full'],
                options: [['supply', 'The supply'], ['volts', 'Volts across R2'], ['power', 'Power in R2'],
                          ['bridge', 'A bridge'], ['bias', 'A bias divider'], ['load', 'A dummy load']] },
      presets: [
        { label: 'Find the power', values: { bmode: 0 }, levels: ['foundation'], note: 'Choose what to work out from the other two.' },
        { label: 'Find the current', values: { bmode: 1 }, levels: ['foundation'] },
        { label: 'Find the voltage', values: { bmode: 2 }, levels: ['foundation'] }
      ],
      heading: { foundation: 'Power, and where the heat comes from', full: 'Solving a network from any one figure' },
      lead: {
        foundation: 'Push a current through a resistor and it warms up. How fast it turns electrical energy into heat is its power.',
        full: 'A network question gives you one figure, often in the middle of the circuit, and asks for another somewhere else. Start where the figure is and work outwards.'
      },
      headline: {
        foundation: 'Power in watts, and why a resistor carrying current warms up.',
        full: 'Finding current, voltage, resistance and power anywhere in a series or parallel network.'
      },
      formulas: {
        foundation: ['pVI', 'pI', 'pV'],
        full: ['sRp', 'sRt', 'sIT', 'sVp', 'kI2v', 'kI2p', 'kVp', 'kI1', 'kIT', 'kVs', 'kP', 'bBal', 'bRt', 'bI', 'bNet', 'aI', 'aR1', 'lP']
      },
      workLead: {
        foundation: 'P = V &times; I, written the way round that gives the quantity you want.',
        full: d => ({
          supply: 'From the supply inwards: collapse the network to one resistance, find the battery current, then share it out.',
          volts: 'From the figure outwards: the current in R2 first, then the voltage across its whole path, then everything else.',
          power: 'From the figure outwards: P = I&sup2;R gives the current in R2, and from there it is the same as starting from a voltage.',
          bridge: 'Check the ratios first. If they match, the middle resistor can be ignored and the rest is two series pairs in parallel.',
          bias: 'With the base current ignored, the same current flows down both resistors, so find it from the one you know.',
          load: 'Power from voltage and resistance, without finding the current first.'
        })[d.device] || ''
      },
      workNote: {
        foundation: 'Not printed in the Foundation booklet: learn P = V &times; I, and that power is in watts (W). To find the power from V and R, find the current first with Ohm’s law, then multiply.',
        full: d => d.device === 'bridge'
          ? 'The series and parallel formulas, V = IR and the power formulas are all printed in the booklet. The bridge rule is not: if R1/R2 = R3/R4, the two midpoints sit at the same voltage and the middle resistor carries nothing, whatever its value.'
          : d.device === 'bias' && !d.aOk
            ? 'No sum to do: the base voltage asked for is at or above the ' + d.av + ' V supply, and a divider can only give less than its supply, so no value of R1 works. Bring the base voltage below the supply.'
          : d.device === 'bias'
            ? 'Every formula here is printed in the booklet. The exam says the base current can be ignored, so the divider is worked as if nothing were connected to it; in a real stage the base draws a little and the base voltage comes out slightly lower.'
            : d.device === 'load'
              ? 'P = V&sup2;/R is printed in the booklet. An RF voltage quoted without saying otherwise is taken as RMS, which is the value P = V&sup2;/R needs; a peak reading would give half the power.'
              : 'All printed in the booklet: series and parallel resistance, V = IR, and P = IV = V&sup2;/R = I&sup2;R. The method is not. Know V and R: use V&sup2;/R. Know I and R: use I&sup2;R. Know V and I: use IV.'
      },
      explain: {
        foundation: [
          'Power is measured in watts (W), and for anything carrying a current it is the voltage across it times the current through it: P = V &times; I. In a resistor every watt becomes heat. The resistor on the circuit turns redder as the power goes up.',
          'The graph shows why the formula is a multiplication. The voltage is the height of the rectangle and the current is its width, so the power is its area. Double either one and the area doubles; double both and it is four times as big.',
          'Choose what to work out with the buttons. Given the power and the voltage, the current is P / V: a 6 W lamp on 12 V takes 0.5 A. Given the power and the current, the voltage is P / I.'
        ],
        full: [
          'Choose where to start with the tabs below the circuit and graph. The first three use the network from bank questions 7666 and 7667: R1 on one path, R2 and R3 on the other, and R4 in series with the pair.',
          'Starting from the supply, collapse the network to one resistance, find the battery current, then share it out. Starting from a voltage or a power in the middle, go the other way: the current in R2 first, the voltage across its whole path, the current in R1, and add up towards the battery. Every resistor’s voltage, current and power is in the table, and the hottest is marked.',
          'The bridge is the circuit from bank question 7664. When the two sides divide in the same ratio, the middle resistor has the same voltage at each end, so it carries nothing and can be left out. Change any one resistor and watch the current appear in R5.',
          'The bias divider works backwards to a resistor value from the voltage wanted at the base, then rounds to a preferred value, since that is what can be bought. The dummy load shows the most direct use of P = V&sup2;/R: a voltage across a known resistance is a power measurement.'
        ]
      }
    },

    {
      code: '2C3',
      levels: ['intermediate'],
      introduces: {
        intermediate: ['EMF', 'source resistance', 'terminal voltage']
      },
      panel: 'emf',
      circuit: 'load',
      controls: {
        intermediate: ['ee', 'er', 'el2']
      },
      toggle: { label: 'Battery', levels: ['intermediate'],
                options: [['open', 'Nothing connected'], ['load', 'On load']] },
      heading: { intermediate: 'EMF, source resistance, and the voltage that sags' },
      lead: {
        intermediate: 'A battery is not a perfect source of voltage. Part of what it generates is lost inside it as soon as current flows.'
      },
      headline: {
        intermediate: 'EMF and potential difference are not the same thing. Draw current, and the source sags.'
      },
      formulas: { intermediate: ['eI', 'eV'] },
      workLead: {
        intermediate: d => d.device === 'open'
          ? 'Only the voltmeter is connected, and it draws no current, so I = 0 A and nothing is lost inside.'
          : 'The source resistance is in series with the load, so it goes in the sum for the current.'
      },
      workNote: {
        intermediate: 'Neither is printed in the Intermediate booklet; both follow from V = IR, which is. The voltage lost inside is I &times; r, and the terminal voltage is what is left.'
      },
      explain: {
        intermediate: [
          'The EMF is what the battery generates. You only see all of it at the terminals when nothing is drawn, which is what “Nothing connected” shows: no current, no loss, and the voltmeter reads the EMF.',
          'Switch to “On load”. Now current flows through the battery’s own source resistance as well as the load, and that resistance takes its share of the voltage like any resistor in series. The terminal voltage, the potential difference the load actually gets, falls below the EMF. The more current, the bigger the drop: the graph is a straight line falling from the EMF.',
          'Wind the load right down to make a short circuit. The terminal voltage collapses towards zero and almost all the power is turned to heat inside the battery itself, which is why a shorted battery gets hot and can be dangerous. A car battery has a very low source resistance, so it can deliver hundreds of amps; a small dry cell cannot.'
        ]
      }
    },

    {
      code: '2C4',
      levels: ['foundation'],
      introduces: {
        foundation: ['polarity']
      },
      panel: 'polarity',
      circuit: 'right',
      toggle: { label: 'Battery', levels: ['foundation'],
                options: [['right', 'Right way round'], ['reversed', 'Reversed']] },
      heading: { foundation: 'Polarity: getting it the right way round' },
      lead: {
        foundation: 'A lamp or a resistor does not mind which way round it is connected. Electronics does.'
      },
      headline: {
        foundation: 'Getting the polarity right, and what happens when you get it wrong.'
      },
      formulas: { foundation: [] },
      workNote: {
        foundation: 'Nothing to calculate here. Learn the colours: red is positive, black is negative.'
      },
      explain: {
        foundation: [
          'An LED lets current through in one direction only. Connected the right way, it lights. Reverse the battery and it goes dark: nothing flows at all, as the still dots show.',
          'Reversed, an LED simply stays dark here, though a high enough reverse voltage can damage one. A radio is less forgiving: connect its supply the wrong way round and parts inside can be damaged in an instant, so always check that the red lead goes to positive and the black lead to negative before switching on. Many rigs have a fuse or a protective diode for this reason, but it is not something to rely on.',
          'Some components are marked for polarity too, such as electrolytic capacitors, which can fail if fitted the wrong way round.'
        ]
      }
    }
  ],

  /*
   * Our own explanation of each answer, keyed by the bank's reference number.
   * The question, its options and the marked answer are the RSGB's and ship
   * unadapted. Everything here is ours. Each seed puts the bench on the
   * circuit in the question's diagram, with its values.
   */
  answers: {
    '2025-Full8066': {
      why: 'The output of a divider depends only on the ratio of the two resistors, so the furthest it can move is with one resistor at the top of its tolerance and the other at the bottom. Work out both directions, because they are not equal, and take the larger.',
      working: ['design: 10 V &times; 20 k / (80 k + 20 k) = 2.000 V',
                'R1 low, R2 high: 10 V &times; 21 k / (76 k + 21 k) = 2.165 V, which is +165 mV',
                'R1 high, R2 low: 10 V &times; 19 k / (84 k + 19 k) = 1.845 V, which is &minus;155 mV',
                'the larger deviation is 165 mV'],
      source: { eq: ['divNom', 'divLow', 'divHigh'], from: ['2A1'] },
      seed: { toggle: 'divider', tv: 10, t1: 80e3, t2: 20e3, tol: 5 },
      seedNote: 'Sets the divider to 10 V, 80 kΩ and 20 kΩ at 5%, so both worst cases can be read off the bench.'
    },
    '2025-Full7884': {
      why: 'The bias network is a potential divider, and the question asks only how far below its design value it can fall. That is R1 at the top of its tolerance and R2 at the bottom.',
      working: ['design: 10 V &times; 20 k / (80 k + 20 k) = 2.000 V',
                'R1 high, R2 low: 10 V &times; 18 k / (88 k + 18 k) = 1.698 V',
                '2.000 V &minus; 1.698 V = 302 mV, so 300 mV is the option'],
      source: { eq: ['divNom', 'divLow'], from: ['2A1'],
                note: 'The capacitors and the FET carry no DC into the divider, so it is worked as a plain divider' },
      seed: { toggle: 'divider', tv: 10, t1: 80e3, t2: 20e3, tol: 10 },
      seedNote: 'Sets the bias divider to 10 V, 80 kΩ and 20 kΩ at 10%. The lowest case is the one on the left.'
    },
    '2025-Full7759': {
      why: 'The frequency of an LC oscillator goes as 1 / &radic;(LC). An inductor 2% low makes LC 2% smaller, so the frequency rises by about half of that, 1%.',
      working: ['f = 8 MHz / <span class="rad">&radic;</span>(0.98 &times; 1)',
                '= 8 MHz &times; 1.0102',
                '= 8.08 MHz'],
      source: { eq: ['fLC', 'fHalf'], from: ['2A1'],
                note: 'The quick rule, half the per cent the other way, gives 8.08 MHz as well' },
      seed: { toggle: 'lc', fd: 8e6, el: -2, ec: 0 },
      seedNote: 'Sets the oscillator to 8 MHz with the coil 2% low and the capacitor exact.'
    },
    '2025-Full7966': {
      why: 'C1 and C2 couple the signal in and out, and C3 bypasses the source resistor. Each one has a reactance that rises as the frequency falls, and each makes a corner at the bottom of the amplifier’s range where that reactance becomes comparable with the resistance it works into. So the tolerance of all three moves the lowest frequency the amplifier will handle.',
      working: ['each capacitor makes a low corner at f = 1 / 2&pi;CR',
                'a capacitor 20% low puts its corner 25% higher, since f goes as 1 / C',
                'all three set a low corner, so the answer is C1, C2 and C3'],
      source: { eq: ['fCR'], from: ['2A1'] },
      seed: { toggle: 'coupling', cc: 1e-6, ctol: 20 },
      seedNote: 'Shows one coupling capacitor, 1 µF at 20%, and the corner it makes, with its tolerance band.'
    },
    '2025-Full7967': {
      why: 'At the top of the range every one of these capacitors is as good as a short circuit, so a few per cent either way in their values makes no difference there. The highest frequency is set by the transistor and the stray capacitance in the circuit, not by C1, C2 or C3.',
      working: ['X<sub>C</sub> = 1 / 2&pi;fC: a 1 &micro;F coupling capacitor at 100 kHz is 1 / (2&pi; &times; 100 kHz &times; 1 &micro;F) = 1.6 &Omega;',
                '1.6 &Omega; against a 10 k&Omega; input is as good as a short, and 20% either way changes nothing',
                'so the tolerance of none of them affects the highest frequency'],
      source: { eq: ['fCR'], from: ['2A1'] },
      seed: { toggle: 'coupling', cc: 1e-6, ctol: 20 },
      seedNote: 'Shows the low corner moving with the capacitor while the high corner stays put.'
    },
    '2025-Full7664': {
      why: 'Check the ratios first. On the left 1 k over 3 k is a third; on the right 3 k over 9 k is a third as well. The bridge is balanced, so the two midpoints sit at the same voltage and the 2 kΩ resistor across the middle carries nothing. Leave it out and what remains is two series pairs in parallel.',
      working: ['1 k / 3 k = 3 k / 9 k, so the 2 kΩ carries no current',
                'left path 1 k + 3 k = 4 kΩ, right path 3 k + 9 k = 12 kΩ',
                '4 k in parallel with 12 k = 4 &times; 12 / 16 = 3 kΩ',
                'I = 12 V / 3 kΩ = 4 mA'],
      source: { eq: ['bBal', 'bRt', 'bI'], from: ['2B1'] },
      seed: { toggle: 'bridge', bv: 12, b1: 1000, b2: 3000, b3: 3000, b4: 9000, b5: 2000 },
      seedNote: 'Sets the bridge to the values in the diagram. Change any one resistor and the middle starts to carry current.'
    },
    '2025-Full7666': {
      why: 'Start where the figure is. 6 V across 1 kΩ is 6 mA, and that same current flows through the 3 kΩ beside it, so the lower path has 24 V across it. The 4 kΩ path has the same 24 V across it, so it carries 6 mA too. The 12 mA total then flows through the right hand 3 kΩ.',
      working: ['I = 6 V / 1 kΩ = 6 mA in the lower path',
                'V = 6 mA &times; (1 k + 3 k) = 24 V across both paths',
                'upper path: 24 V / 4 kΩ = 6 mA, so 12 mA in total',
                '3 kΩ: 12 mA &times; 3 kΩ = 36 V',
                'battery: 24 V + 36 V = 60 V'],
      source: { eq: ['kI2v', 'kVp', 'kI1', 'kIT', 'kVs'], from: ['2B1'] },
      seed: { toggle: 'volts', f1: 4000, f2: 1000, f3: 3000, f4: 3000, fvk: 6 },
      seedNote: 'Sets the network to the diagram with 6 V across R2, the 1 kΩ.'
    },
    '2025-Full7667': {
      why: 'The 1 kΩ and the 3 kΩ beside it carry the same current, and together they are 4 kΩ: the same as the upper path. Two equal paths across the same voltage carry equal currents, so the 4 kΩ carries the same current as the 1 kΩ. With the same current, power goes as resistance, so four times the resistance dissipates four times the power.',
      working: ['P = I&sup2;R, so I = <span class="rad">&radic;</span>(2 W / 1 kΩ) = 44.7 mA in the lower path',
                'both paths are 4 kΩ, so the 4 kΩ carries 44.7 mA as well',
                'P = (44.7 mA)&sup2; &times; 4 kΩ = 0.002 &times; 4000',
                '= 8 W'],
      source: { eq: ['kI2p', 'kVp', 'kI1', 'kP'], from: ['2B1'] },
      seed: { toggle: 'power', f1: 4000, f2: 1000, f3: 3000, f4: 3000, fpk: 2 },
      seedNote: 'Sets the network to the diagram with 2 W in R2, the 1 kΩ. Read the power in R1.'
    },
    '2025-Full3361': {
      why: 'With the base current ignored, the same current flows down R1 and the 2.2 kΩ, so find it from the resistor you know. R1 has to drop the rest of the 9 V supply at that current.',
      working: ['I = 1.6 V / 2.2 kΩ = 0.727 mA',
                'V across R1 = 9 V &minus; 1.6 V = 7.4 V',
                'R1 = 7.4 V / 0.727 mA',
                '= 10.2 kΩ, so 10k is the nearest'],
      source: { eq: ['aI', 'aR1'], from: ['2B1'] },
      seed: { toggle: 'bias', av: 9, a2: 2200, ab: 1.6 },
      seedNote: 'Sets the divider to 9 V and 2.2 kΩ with 1.6 V wanted at the base.'
    },
    '2025-Full459': {
      why: 'A voltage across a known resistance is a power: P = V&sup2;/R, with no need to find the current first. An RF voltage given like this is the RMS value, which is what the formula needs.',
      working: ['P = V&sup2; / R = (100 V)&sup2; / 50 Ω',
                '= 10 000 / 50',
                '= 200 W'],
      source: { eq: ['lP'], from: ['2B1'],
                note: 'Had the 100 V been a peak reading, the RMS value would be 70.7 V and the power 100 W' },
      seed: { toggle: 'load', lv: 100, lr: 50 },
      seedNote: 'Sets the dummy load to 50 Ω with 100 V RMS across it.'
    }
  },

  outro: {
    foundation: [
      'Six items, and they all come back to four quantities: voltage pushes, current flows, resistance opposes, and power is the rate the energy turns into heat or light. V = I &times; R and P = V &times; I tie them together, and neither is in the booklet, so they are the two to learn.',
      'At Intermediate the same ideas are put together: several resistors at once, dividers that share out a voltage, and batteries that are not quite perfect.'
    ],
    intermediate: [
      'Everything here came down to collapsing a group of resistors into one, then using Ohm’s law. A divider is two resistors in series with an output taken between them; a real battery is a perfect one with a resistor in series inside it.',
      'Two habits pay off in the exam. Put every value in the same unit before adding, and remember that the output of a divider is taken across the bottom resistor.'
    ],
    full: [
      'Both Full items are about real circuits rather than ideal ones. Parts are never exactly their marked values, and a question rarely hands you the supply voltage and asks for the current.',
      'The booklet prints every formula used here except f = 1/2&pi;CR for a capacitor’s low corner. It does not print the methods: for the worst case, set one divider resistor high and the other low; an L or C a few per cent out moves the frequency about half that per cent the other way; and a network is solved from whatever figure you are given.'
    ]
  },

  /** Every circuit this bench draws, with the currents it shows, for the checkers. */
  allLayouts: () => {
    const v = {};
    BENCH.controls.forEach(c => { v[c.id] = c.start; });
    const d = BENCH.derive(v);
    const out = [];
    const dc = (name, c) => out.push({ name: name, layout: c.layout, flow: { mode: 'dc', currents: c.currents } });
    MATERIALS.forEach((m, i) => dc('materials, ' + m.name, materialsCircuit(BENCH.derive(Object.assign({}, v, { mat: i })))));
    dc('tolerance', ohmCircuit(TOL_V, d.trAct, d.trIact));
    dc('divider, worst case', dividerCircuit({ V: d.tv, R1: d.t1, R2: d.t2 }));
    out.push({ name: 'tuned circuit', layout: tankCircuit(d).layout, flow: { mode: 'ac', currents: tankCircuit(d).currents } });
    const cc = couplingCircuit(d.cc);
    out.push({ name: 'coupling capacitor', layout: cc.layout, netlist: cc.netlist });
    dc('lamps in series', seriesLamps(d, false));
    dc('lamps in series, switch open', seriesLamps(d, true));
    dc('lamps in parallel', parallelPair({ V: d.sv, IA: d.pIA, IB: d.pIB, lamps: true, withSwitch: true, nameA: 'A', nameB: 'B' }));
    dc('lamps in parallel, one cut', parallelPair({ V: d.sv, IA: d.pIA, IB: d.pIB, cut: true, lamps: true, withSwitch: true, nameA: 'A', nameB: 'B' }));
    dc('ohm', ohmCircuit(d.ov, d.or, d.oI));
    dc('two loads', parallelPair({ V: d.ov, IA: d.oI1, IB: d.oI2, nameA: 'R1', nameB: 'R2' }));
    dc('series three', seriesThree(d.sv2, [d.s1, d.s2, d.s3], d.sIs));
    dc('parallel three', parallelThree(d.nv, [d.n1, d.n2, d.n3]));
    dc('series and parallel', comboThree(d.nv, [d.n1, d.n2, d.n3]));
    dc('series two', seriesThree(d.nv, [d.n1, d.n2], d.nv / (d.n1 + d.n2)));
    dc('parallel two', parallelThree(d.nv, [d.n1, d.n2]));
    [1, 2, 3, 4].forEach(n => {
      dc(n + ' cells in series', cellsCircuit(n, true, d.nl));
      dc(n + ' cells in parallel', cellsCircuit(n, false, d.nl));
    });
    dc('divider, two', dividerCircuit({ V: d.dv, R1: d.d1, R2: d.d2 }));
    dc('divider, three', dividerCircuit({ V: d.dv, R1: d.d1, R2: d.d2, R3: d.d3 }));
    dc('divider, loaded', dividerCircuit({ V: d.dv, R1: d.d1, R2: d.d2, RL: d.dl }));
    dc('power', ohmCircuit(d.pv, d.pv / d.pi, d.pi));
    dc('network', networkCircuit(d.netV, [d.f1, d.f2, d.f3, d.f4]));
    dc('bridge, balanced', bridgeCircuit(d.br, [d.b1, d.b2, d.b3, d.b4, d.b5], d.bv));
    const ub = solveBridge(12, [1000, 3000, 3000, 6000, 2000]);
    dc('bridge, unbalanced', bridgeCircuit(ub, [1000, 3000, 3000, 6000, 2000], 12));
    const ub2 = solveBridge(12, [3000, 1000, 1000, 6000, 2000]);
    dc('bridge, unbalanced the other way', bridgeCircuit(ub2, [3000, 1000, 1000, 6000, 2000], 12));
    dc('bias divider', dividerCircuit({ V: d.av, R1: d.aR1, R2: d.a2 }));
    out.push({ name: 'dummy load', layout: loadCircuit(d).layout, flow: { mode: 'ac', currents: loadCircuit(d).currents } });
    dc('emf on load', emfCircuit(d, false));
    dc('emf open', emfCircuit(d, true));
    dc('polarity', polarityCircuit(false));
    dc('polarity reversed', polarityCircuit(true));
    return out;
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = BENCH;
if (typeof window !== 'undefined') window.BENCH = BENCH;
