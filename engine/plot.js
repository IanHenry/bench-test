/*
 * plot.js - the response display shared by every bench.
 *
 * One linear x axis, up to two y axes, any number of traces, plus the
 * furniture a bench keeps needing: a shaded band (half-power points), dashed
 * markers, and a draggable cursor. Colours come from CSS custom properties so
 * the plot follows the page theme without the caller thinking about it. A
 * trace with no colour is drawn as a voltage (--q-v), as a scope would; a
 * band, mark or cursor with none in the neutral --q-mark.
 */

const PAD = { l: 80, r: 70, t: 14, b: 38 };   // room for 15 px axis labels
const LABEL_PX = 15;                           // nothing on a plot smaller than this
// a tick label with a true minus sign rather than a hyphen
const minus = v => String(v).replace(/^-/, '−');
// words drawn over the traces get a halo of the background, so a curve
// running through them does not cut the letters
function haloText(ctx, text, x, y, surface) {
  ctx.save();
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = surface || '#fff';
  ctx.strokeText(text, x, y);
  ctx.restore();
  ctx.fillText(text, x, y);
}

/**
 * spec = {
 *   xRange: [a, b], xUnit: 'Hz',
 *   left:  { max, unit, sig },            // 0..max
 *   right: { min, max, fmt },             // optional second axis
 *   traces: [{ pts:[{x,y}], axis:'left'|'right', colour, fill, fillTo, width, dash:[on,off] }],
 *   bands:  [{ from, to, colour }],
 *   marks:  [{ x, colour, dashed, label }],
 *   cursor: { x, colour, label, dot:{axis,y} },
 *   tokens: { grid, faint, soft, surface, panelFont, v, mark }
 * }
 */
function draw(canvas, spec) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth, cssH = canvas.clientHeight;
  // A second plot sharing the canvas must not resize it, because resizing
  // clears it, and must not wipe what the first one drew. The first of a pair
  // leaves `append` off and does both as usual.
  if (!spec.append) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!spec.append) ctx.clearRect(0, 0, cssW, cssH);

  const t = spec.tokens || {};
  const W = cssW - PAD.l - PAD.r;
  const band = spec.band || [0, 1];
  const full = cssH - PAD.t - PAD.b;
  const H = full * (band[1] - band[0]);
  const yOff = full * band[0];
  const [xa, xb] = spec.xRange;
  const font = t.panelFont || 'sans-serif';

  const X = v => PAD.l + W * (v - xa) / (xb - xa);
  // left axis runs min .. max; min defaults to zero, so a response curve is
  // unaffected while a waveform can swing either side of the line
  const lmin = spec.left.min || 0;
  const YL = v => PAD.t + yOff + H * (1 - (v - lmin) / (spec.left.max - lmin));
  const YR = v => {
    const { min, max } = spec.right;
    return PAD.t + yOff + H * (1 - (v - min) / (max - min));
  };
  const Y = (v, axis) => (axis === 'right' ? YR(v) : YL(v));

  /* grid and axis labels */
  ctx.strokeStyle = t.grid || '#ddd';
  ctx.lineWidth = 1;
  ctx.font = '500 ' + LABEL_PX + 'px ' + font;
  ctx.fillStyle = t.faint || '#888';
  for (let i = 0; i <= 4; i++) {
    const y = Math.round(PAD.t + yOff + H * i / 4) + 0.5;
    ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(PAD.l + W, y); ctx.stroke();
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(minus(spec.left.fmt(spec.left.max - (spec.left.max - lmin) * i / 4)), PAD.l - 9, y);
    if (spec.right) {
      ctx.textAlign = 'left';
      const v = spec.right.max - (spec.right.max - spec.right.min) * i / 4;
      ctx.fillText(minus(spec.right.fmt(v)), PAD.l + W + 9, y);
    }
  }
  for (let i = 0; i <= 4; i++) {
    const v = xa + (xb - xa) * i / 4, x = Math.round(X(v)) + 0.5;
    ctx.beginPath(); ctx.moveTo(x, PAD.t + yOff); ctx.lineTo(x, PAD.t + yOff + H); ctx.stroke();
    if (!spec.hideX) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(minus(spec.xFmt(v)), x, PAD.t + yOff + H + 9);
    }
  }

  /* shaded bands, behind everything */
  for (const b of (spec.bands || [])) {
    if (b.to < xa || b.from > xb) continue;
    ctx.fillStyle = b.colour || t.mark || '#495057';
    ctx.globalAlpha = 0.07;
    const a = Math.max(X(b.from), PAD.l), c = Math.min(X(b.to), PAD.l + W);
    ctx.fillRect(a, PAD.t + yOff, c - a, H);
    ctx.globalAlpha = 1;
  }

  /* dashed markers */
  ctx.setLineDash([3, 3]);
  for (const m of (spec.marks || [])) {
    if (m.x < xa || m.x > xb) continue;
    ctx.strokeStyle = m.colour || t.mark || '#495057';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(X(m.x), PAD.t + yOff); ctx.lineTo(X(m.x), PAD.t + yOff + H);
    ctx.stroke();
  }

  // free text pinned to a point on the plot, for naming one curve in a family
  // where a legend entry would have to name them all
  for (const l of (spec.labels || [])) {
    if (l.x < xa || l.x > xb) continue;
    const y = (l.axis === 'right' ? YR : YL)(l.y);
    if (y < PAD.t + yOff - 2 || y > PAD.t + yOff + H + 2) continue;
    ctx.fillStyle = l.colour || t.mark || '#495057';
    ctx.font = LABEL_PX + 'px ' + font;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    haloText(ctx, l.text, X(l.x), y - 3, t.surface);
  }
  ctx.setLineDash([]);

  /* traces, filled ones first so lines stay on top */
  for (const tr of spec.traces) {
    if (!tr.fill || !tr.pts.length) continue;
    ctx.beginPath();
    // down to the foot of the axis, or to the value fillTo names (a current
    // that is never negative, filled to its zero on an axis that goes below)
    const base = Math.min(PAD.t + yOff + H, Math.max(PAD.t + yOff,
      tr.fillTo === undefined ? YL(lmin) : Y(tr.fillTo, tr.axis)));
    ctx.moveTo(X(tr.pts[0].x), base);
    for (const p of tr.pts) ctx.lineTo(X(p.x), Y(p.y, tr.axis));
    ctx.lineTo(X(tr.pts[tr.pts.length - 1].x), base);
    ctx.closePath();
    ctx.fillStyle = tr.fill;
    ctx.fill();
  }
  for (const tr of spec.traces) {
    if (!tr.pts.length) continue;
    ctx.strokeStyle = tr.colour || t.v || '#0D6EFD';
    ctx.lineWidth = tr.width || 2.2;
    ctx.lineJoin = 'round';
    // a second trace of the same quantity is told apart by being dashed,
    // not by being faded, so it keeps the colour's full contrast
    ctx.setLineDash(tr.dash || []);
    ctx.beginPath();
    tr.pts.forEach((p, i) => {
      const x = X(p.x), y = Y(p.y, tr.axis);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /* cursor */
  const c = spec.cursor;
  if (c && c.x >= xa && c.x <= xb) {
    ctx.strokeStyle = c.colour || t.mark || '#495057';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(X(c.x), PAD.t + yOff); ctx.lineTo(X(c.x), PAD.t + yOff + H);
    ctx.stroke();
    if (c.dot) {
      ctx.fillStyle = c.colour || t.mark || '#495057';
      ctx.beginPath();
      ctx.arc(X(c.x), Y(c.dot.y, c.dot.axis), 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = t.surface || '#fff';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    if (c.label) {
      ctx.fillStyle = t.soft || '#666';
      ctx.font = '600 ' + LABEL_PX + 'px ' + font;
      const nearRight = (xb - c.x) < (xb - xa) * 0.18;
      ctx.textAlign = nearRight ? 'right' : 'left';
      ctx.textBaseline = 'top';
      haloText(ctx, c.label, X(c.x) + (nearRight ? -8 : 8), PAD.t + yOff + 4, t.surface);
    }
  }
}

/** Map a pointer event to a 0..1 position across the plotting area. */
function cursorFraction(canvas, ev) {
  const r = canvas.getBoundingClientRect();
  const f = (ev.clientX - r.left - PAD.l) / (r.width - PAD.l - PAD.r);
  return Math.min(1, Math.max(0, f));
}

/** Map a value on the left axis to a y pixel, for callers drawing extras. */
function leftY(canvas, spec, v) {
  const H = canvas.clientHeight - PAD.t - PAD.b;
  const lmin = spec.left.min || 0;
  return PAD.t + H * (1 - (v - lmin) / (spec.left.max - lmin));
}

/** Map a value on the x axis to an x pixel. */
function xAt(canvas, xRange, v) {
  const W = canvas.clientWidth - PAD.l - PAD.r;
  return PAD.l + W * (v - xRange[0]) / (xRange[1] - xRange[0]);
}

const API = { draw, cursorFraction, leftY, xAt, PAD };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.Plot = API;
