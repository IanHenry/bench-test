/*
 * schematic.js - draw a circuit and annotate it from a live solution.
 *
 * A bench needs the diagram itself to move, not a static picture beside a
 * graph. This takes a layout (positions and orientations on a coarse grid)
 * and draws it with the symbols the RSGB specification actually prints, then
 * writes live values onto the components and can highlight whichever part of
 * the circuit the current explanation is talking about.
 *
 * Symbols follow UK/IEC practice, so a resistor is a plain rectangle rather
 * than the American zigzag.
 *
 * Layout format:
 *   {
 *     w: 300, h: 120,                       // logical drawing size
 *     wires: [[x1,y1,x2,y2], ...],
 *     grounds: [[x,y], ...],
 *     elements: [
 *       { name:'R1', type:'R', at:[60,20], rot:0, label:'R', anchor:'above' }
 *     ]
 *   }
 * rot is degrees clockwise; 0 runs left to right, 90 runs top to bottom.
 */

const BODY = 26;   // length of the symbol body along its axis
const SPAN = 60;   // total length including both leads

function rotated(ctx, x, y, deg, fn) {
  ctx.save();
  ctx.translate(x, y);
  if (deg) ctx.rotate(deg * Math.PI / 180);
  fn();
  ctx.restore();
}

/* ---- symbol bodies, drawn centred on the origin along the x axis ---- */

const SYMBOL = {
  R(ctx) {
    const h = 11;
    ctx.beginPath();
    ctx.rect(-BODY / 2, -h / 2, BODY, h);
    ctx.fillStyle = ctx._surface;
    ctx.fill();
    ctx.stroke();
    lead(ctx, -SPAN / 2, -BODY / 2);
    lead(ctx, BODY / 2, SPAN / 2);
  },

  C(ctx) {
    const h = 20, gap = 4;
    ctx.beginPath();
    ctx.moveTo(-gap, -h / 2); ctx.lineTo(-gap, h / 2);
    ctx.moveTo(gap, -h / 2); ctx.lineTo(gap, h / 2);
    ctx.stroke();
    lead(ctx, -SPAN / 2, -gap);
    lead(ctx, gap, SPAN / 2);
  },

  L(ctx) {
    // four semicircular humps, the usual UK coil
    const n = 4, r = BODY / (2 * n);
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      ctx.arc(-BODY / 2 + r * (2 * i + 1), 0, r, Math.PI, 0, false);
    }
    ctx.stroke();
    lead(ctx, -SPAN / 2, -BODY / 2);
    lead(ctx, BODY / 2, SPAN / 2);
  },

  /* Diode: triangle pointing the way conventional current flows, then the bar
   * it cannot get past in the other direction. */
  // A Zener carries the bent bar that says it is meant to break down, and a
  // varicap a pair of plates that say it is meant to be used as a capacitor.
  // Drawn as an ordinary diode, neither reads as the device it is.
  DZ(ctx) {
    const h = 9, w = 9;
    ctx.beginPath();
    ctx.moveTo(-w, -h); ctx.lineTo(w, 0); ctx.lineTo(-w, h);
    ctx.closePath();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(w - 4, -h); ctx.lineTo(w, -h); ctx.lineTo(w, h);
    ctx.lineTo(w + 4, h);
    ctx.stroke();
    lead(ctx, -SPAN / 2, -w);
    lead(ctx, w, SPAN / 2);
  },

  DV(ctx) {
    const h = 9, w = 7;
    ctx.beginPath();
    ctx.moveTo(-w - 4, -h); ctx.lineTo(w - 4, 0); ctx.lineTo(-w - 4, h);
    ctx.closePath();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(w - 4, -h); ctx.lineTo(w - 4, h);
    ctx.moveTo(w + 1, -h); ctx.lineTo(w + 1, h);
    ctx.stroke();
    lead(ctx, -SPAN / 2, -w - 4);
    lead(ctx, w + 1, SPAN / 2);
  },

  D(ctx) {
    const h = 9, w = 9;
    ctx.beginPath();
    ctx.moveTo(-w, -h); ctx.lineTo(w, 0); ctx.lineTo(-w, h);
    ctx.closePath();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(w, -h); ctx.lineTo(w, h);
    ctx.stroke();
    lead(ctx, -SPAN / 2, -w);
    lead(ctx, w, SPAN / 2);
  },

  /*
   * NPN transistor. Three terminals rather than two, so it does not follow the
   * along-the-axis rule the passives use. Relative to its centre: base out to
   * the left, collector up and right, emitter down and right. The RSGB symbol
   * table notes the enclosing circle is optional; it is drawn here because it
   * makes the device stand out among the passives.
   */
  Q(ctx) {
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.stroke();
    // the base bar
    ctx.beginPath();
    ctx.moveTo(-4, -13); ctx.lineTo(-4, 13);
    ctx.stroke();
    // base lead
    ctx.beginPath();
    ctx.moveTo(-30, 0); ctx.lineTo(-4, 0);
    ctx.stroke();
    // collector
    ctx.beginPath();
    ctx.moveTo(-4, -8); ctx.lineTo(12, -20); ctx.lineTo(12, -32);
    ctx.stroke();
    // emitter, with the arrow that says NPN
    ctx.beginPath();
    ctx.moveTo(-4, 8); ctx.lineTo(12, 20); ctx.lineTo(12, 32);
    ctx.stroke();
    const ax = 5.5, ay = 14.6, dx = 12 - -4, dy = 20 - 8;
    const len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
    ctx.beginPath();
    ctx.moveTo(ax + ux * 6, ay + uy * 6);
    ctx.lineTo(ax - uy * 3.4, ay + ux * 3.4);
    ctx.lineTo(ax + uy * 3.4, ay - ux * 3.4);
    ctx.closePath();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
  },

  V(ctx) {
    const r = 13;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = ctx._surface;
    ctx.fill();
    ctx.stroke();
    // a small sine inside marks it as an AC source
    ctx.beginPath();
    for (let i = -6; i <= 6; i++) {
      const y = -Math.sin(i / 6 * Math.PI) * 4.5;
      i === -6 ? ctx.moveTo(i, y) : ctx.lineTo(i, y);
    }
    ctx.stroke();
    lead(ctx, -SPAN / 2, -r);
    lead(ctx, r, SPAN / 2);
  }
};

function lead(ctx, from, to) {
  ctx.beginPath();
  ctx.moveTo(from, 0);
  ctx.lineTo(to, 0);
  ctx.stroke();
}

function ground(ctx, x, y, colour) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = colour;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(0, 7);
  ctx.stroke();
  for (let i = 0; i < 3; i++) {
    const w = 11 - i * 3.5;
    ctx.beginPath();
    ctx.moveTo(-w, 7 + i * 4); ctx.lineTo(w, 7 + i * 4);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Draw a layout.
 * opts: { tokens, labels:{name:text}, highlight:Set<name>, title }
 */
function draw(canvas, layout, opts) {
  opts = opts || {};
  const t = opts.tokens || {};
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  // fit the logical drawing into the canvas with a margin
  const pad = 16;
  const scale = Math.min((cssW - pad * 2) / layout.w, (cssH - pad * 2) / layout.h);
  const ox = (cssW - layout.w * scale) / 2;
  const oy = (cssH - layout.h * scale) / 2;
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);

  ctx._surface = t.surface || '#fff';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // wires first, so symbol bodies paint over their ends
  ctx.strokeStyle = t.wire || '#444';
  ctx.lineWidth = 1.6;
  for (const [x1, y1, x2, y2] of (layout.wires || [])) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  for (const [x, y] of (layout.grounds || [])) ground(ctx, x, y, t.wire || '#444');

  // Junction dots wherever three or more conductors meet. Component leads
  // count as conductors, otherwise a T formed by two wires and one component
  // terminal draws no dot and the circuit reads as a crossing.
  const ends = {};
  const bump = (x, y) => { const k = x + ',' + y; ends[k] = (ends[k] || 0) + 1; };
  for (const [x1, y1, x2, y2] of (layout.wires || [])) { bump(x1, y1); bump(x2, y2); }
  for (const el of layout.elements) {
    if (el.type === 'Q') continue;          // three terminals, not two
    const rad = (el.rot || 0) * Math.PI / 180;
    const dx = Math.round(Math.cos(rad) * SPAN / 2);
    const dy = Math.round(Math.sin(rad) * SPAN / 2);
    bump(el.at[0] - dx, el.at[1] - dy);
    bump(el.at[0] + dx, el.at[1] + dy);
  }
  ctx.fillStyle = t.wire || '#444';
  for (const k in ends) {
    if (ends[k] < 3) continue;
    const [x, y] = k.split(',').map(Number);
    ctx.beginPath();
    ctx.arc(x, y, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // labelled terminals, e.g. the output of a filter
  for (const term of (layout.terminals || [])) {
    ctx.fillStyle = t.wire || '#444';
    ctx.beginPath();
    ctx.arc(term.at[0], term.at[1], 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = t.soft || '#666';
    ctx.font = '600 10.5px ' + (t.font || 'sans-serif');
    ctx.textAlign = term.align || 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(term.label, term.at[0] + (term.align === 'right' ? -8 : 8), term.at[1]);
  }

  for (const el of layout.elements) {
    const hot = opts.highlight && opts.highlight.has(el.name);
    const colour = hot ? (t.marker || '#a02') : (t.wire || '#444');
    ctx.strokeStyle = colour;
    ctx.lineWidth = hot ? 2.4 : 1.6;
    rotated(ctx, el.at[0], el.at[1], el.rot || 0, () => {
      (SYMBOL[el.type] || SYMBOL.R)(ctx);
    });

    // labels stay upright whatever the symbol orientation
    const label = el.label || el.name;
    const value = opts.labels ? opts.labels[el.name] : null;
    if (label || value) {
      const vertical = (el.rot || 0) % 180 !== 0;
      const leftOf = el.labelAt === 'left';
      ctx.fillStyle = hot ? colour : (t.ink || '#111');
      ctx.font = (hot ? '600 ' : '') + '11px ' + (t.font || 'sans-serif');
      ctx.textAlign = vertical ? (leftOf ? 'right' : 'left') : 'center';
      ctx.textBaseline = vertical ? 'middle' : 'bottom';
      const lx = el.at[0] + (vertical ? (leftOf ? -20 : 20) : 0);
      const ly = el.at[1] + (vertical ? 0 : -18);
      ctx.fillText(label, lx, ly);
      if (value) {
        ctx.fillStyle = hot ? colour : (t.soft || '#666');
        ctx.font = '10.5px ' + (t.mono || 'monospace');
        ctx.fillText(value, lx, ly + (vertical ? 13 : 12));
      }
    }
  }

  // charge last, so it reads on top of the wires and the component bodies
  if (opts.flow && typeof window !== 'undefined' && window.Flow) {
    window.Flow.draw(ctx, layout, opts.flow, SPAN);
  }
}

const API = { draw, SPAN, BODY };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.Schematic = API;
