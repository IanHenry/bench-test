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
 *
 * Every two terminal part has its first terminal at the start of its axis and
 * its second at the end: at rot 0 the first is on the left, at rot 90 at the
 * top. A diode's first terminal is its anode, so the triangle points from the
 * first terminal to the second, the way conventional current flows forward.
 *
 * Types: R C L D DZ DV V B Q, and
 *   CP polarised capacitor, positive (hollow) plate on the first terminal
 *   S  switch            { open: true } draws it open; closed by default
 *   N  neon lamp         { lit: true } fills the envelope with its glow
 *   M  moving coil meter { meter: 'A' } the letter inside: 'V', 'mA', 'µA'...;
 *                        { reading: 0..1 } draws a needle instead of the letter
 *   T  transformer       four terminals, see TRANSFORMER_PINS; { humps: [4, 8] }
 *                        draws the turns ratio, { core: 'air' } drops the iron
 *                        core lines, { dots: true } marks the phasing
 * pins(el) gives the terminal positions that the checkers and the junction
 * dots use, so a symbol and its checks cannot disagree about where its leads
 * end, and runs(el) the stretches its charge is drawn along.
 */

const BODY = 26;   // length of the symbol body along its axis
const SPAN = 60;   // total length including both leads
// The resistor body keeps the house proportion, 56 by 20 (2.8 : 1), so it
// reads as the same symbol the course draws, at whatever scale the circuit
// is drawn.
const R_LEN = 28, R_THK = 10;

// Three terminal devices do not sit along an axis like the passives do.
// Relative to the centre at rot 0: base, collector, emitter.
const TRANSISTOR_PINS = [[-30, 0], [12, -32], [12, 32]];

// A transformer at rot 0 has its primary winding on the left and its
// secondary on the right, both running top to bottom. In order: primary top,
// primary bottom, secondary top, secondary bottom. Each winding carries its
// own current, positive from its top terminal to its bottom one.
const TRANSFORMER_PINS = [[-20, -30], [-20, 30], [20, -30], [20, 30]];

/** Rotate a point clockwise by rot degrees, on the canvas axes (y down). */
function turn(pt, deg) {
  const r = (deg || 0) * Math.PI / 180;
  const c = Math.cos(r), s = Math.sin(r);
  return [pt[0] * c - pt[1] * s, pt[0] * s + pt[1] * c];
}

/** Where an element's terminals land, in layout units, rounded to the grid. */
function pins(el) {
  const local = el.type === 'Q' ? TRANSISTOR_PINS
              : el.type === 'T' ? TRANSFORMER_PINS
              : null;
  if (local) {
    return local.map(pt => {
      const d = turn(pt, el.rot);
      return [el.at[0] + Math.round(d[0]), el.at[1] + Math.round(d[1])];
    });
  }
  const rad = (el.rot || 0) * Math.PI / 180;
  const dx = Math.round(Math.cos(rad) * SPAN / 2);
  const dy = Math.round(Math.sin(rad) * SPAN / 2);
  return [[el.at[0] - dx, el.at[1] - dy], [el.at[0] + dx, el.at[1] + dy]];
}

/*
 * The straight runs charge is drawn along for an element, each with the name
 * of the current it carries: [x1, y1, x2, y2, name], positive from the first
 * point to the second. A transformer has one run per winding, named by its
 * flow: ['primary current', 'secondary current']. An open switch has none,
 * because nothing crosses the gap. Sources and transistors have none either:
 * their bodies are not wire. forDrawing splits a run around a body that has
 * writing in it.
 */
function runs(el, forDrawing) {
  if (el.type === 'V' || el.type === 'B' || el.type === 'Q') return [];
  if (el.type === 'S' && el.open) return [];
  const p = pins(el);
  if (el.type === 'T') {
    // flowReversed: [false, true] turns one winding round, for a secondary
    // that drives its current out of its top terminal
    const f = Array.isArray(el.flow) ? el.flow : [];
    const rev = Array.isArray(el.flowReversed) ? el.flowReversed : [];
    const run = (a, b, name, back) => back
      ? [p[b][0], p[b][1], p[a][0], p[a][1], name]
      : [p[a][0], p[a][1], p[b][0], p[b][1], name];
    return [run(0, 1, f[0], rev[0]), run(2, 3, f[1], rev[1])];
  }
  const name = el.flow || el.name;
  const one = el.flowReversed
    ? [p[1][0], p[1][1], p[0][0], p[0][1], name]
    : [p[0][0], p[0][1], p[1][0], p[1][1], name];
  // Drawn charge stops at the edge of a meter, a neon or a lamp, so the
  // letter, the electrodes or the filament stay readable, and at the
  // contacts of a closed switch, so the lever still reads as a switch. At a
  // capacitor it stops at the plates: charge arrives at one and leaves the
  // other, and none crosses the dielectric between them. The checkers still
  // see one run end to end.
  const body = forDrawing && { M: 16, N: 14, S: 15, LP: 10, C: 8, CP: 11 }[el.type];
  if (!body) return [one];
  const [x1, y1, x2, y2] = one, len = Math.hypot(x2 - x1, y2 - y1);
  const ux = (x2 - x1) / len, uy = (y2 - y1) / len, mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  return [[x1, y1, mx - ux * body, my - uy * body, name],
          [mx + ux * body, my + uy * body, x2, y2, name]];
}

const NEON_GLOW = '255,122,26';   // the orange of a struck neon, as r,g,b

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
    ctx.beginPath();
    ctx.rect(-R_LEN / 2, -R_THK / 2, R_LEN, R_THK);
    ctx.fillStyle = ctx._surface;
    ctx.fill();
    ctx.stroke();
    lead(ctx, -SPAN / 2, -R_LEN / 2);
    lead(ctx, R_LEN / 2, SPAN / 2);
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

  /*
   * Polarised (electrolytic) capacitor: a hollow plate for the positive
   * side and a filled one for the negative. The positive plate is on the
   * first terminal, so at rot 90 the positive lead is at the top.
   */
  CP(ctx) {
    const h = 20, gap = 3, thk = 5;
    const lj = ctx.lineJoin;
    ctx.lineJoin = 'miter';
    ctx.beginPath();
    ctx.rect(-gap - thk, -h / 2, thk, h);
    ctx.fillStyle = ctx._surface;
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.rect(gap, -h / 2, thk, h);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
    ctx.stroke();
    ctx.lineJoin = lj;
    lead(ctx, -SPAN / 2, -gap - thk);
    lead(ctx, gap + thk, SPAN / 2);
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
  },

  /*
   * DC source, drawn as a cell: the long plate is positive and sits at the
   * start of the axis, so at rot 90 the positive end is at the top.
   */
  B(ctx) {
    const gap = 3.5;
    ctx.beginPath();
    ctx.moveTo(-gap, -12); ctx.lineTo(-gap, 12);
    ctx.stroke();
    const w = ctx.lineWidth;
    ctx.lineWidth = w * 2;
    ctx.beginPath();
    ctx.moveTo(gap, -6); ctx.lineTo(gap, 6);
    ctx.stroke();
    ctx.lineWidth = w;
    lead(ctx, -SPAN / 2, -gap);
    lead(ctx, gap, SPAN / 2);
  },

  /*
   * Switch: two contacts and a lever hinged on the first. Open, the lever is
   * lifted well clear of the second contact so the gap cannot be misread;
   * closed, it lies on it.
   */
  S(ctx, el) {
    const c = 13, r = 2.4;
    lead(ctx, -SPAN / 2, -c - r);
    lead(ctx, c + r, SPAN / 2);
    ctx.beginPath();
    ctx.arc(-c, 0, r, 0, Math.PI * 2);
    ctx.moveTo(c + r, 0);
    ctx.arc(c, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = ctx._surface;
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-c + r * 0.7, -r * 0.7);
    if (el && el.open) ctx.lineTo(c - 1, -14);
    else ctx.lineTo(c, -r);
    ctx.stroke();
  },

  /*
   * Neon lamp: a gas filled envelope with two electrodes facing across a gap,
   * and the dot that says the envelope holds gas. It conducts only once the
   * voltage across it reaches its striking voltage, and then it glows.
   */
  N(ctx, el) {
    const r = 14, e = 4, h = 7;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = ctx._surface;
    ctx.fill();
    if (el && el.lit) {
      const g = ctx.createRadialGradient(0, 0, 1, 0, 0, r);
      g.addColorStop(0, 'rgba(' + NEON_GLOW + ',0.95)');
      g.addColorStop(0.6, 'rgba(' + NEON_GLOW + ',0.5)');
      g.addColorStop(1, 'rgba(' + NEON_GLOW + ',0.08)');
      ctx.fillStyle = g;
      ctx.fill();
    }
    ctx.stroke();
    lead(ctx, -SPAN / 2, -e);
    lead(ctx, e, SPAN / 2);
    const w = ctx.lineWidth;
    ctx.lineWidth = w * 1.6;
    ctx.beginPath();
    ctx.moveTo(-e, -h); ctx.lineTo(-e, h);
    ctx.moveTo(e, -h); ctx.lineTo(e, h);
    ctx.stroke();
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.arc(0, 9.5, 1.7, 0, Math.PI * 2);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
  },

  /* Filament lamp: a circle with a cross through it. */
  LP(ctx) {
    const r = 10, k = r * Math.SQRT1_2;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = ctx._surface;
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-k, -k); ctx.lineTo(k, k);
    ctx.moveTo(-k, k); ctx.lineTo(k, -k);
    ctx.stroke();
    lead(ctx, -SPAN / 2, -r);
    lead(ctx, r, SPAN / 2);
  },

  /*
   * Moving coil meter: a circle with what it measures written inside. The
   * letter, or the needle, is drawn upright afterwards by meterFace, since a
   * meter on its side still reads the right way up.
   */
  M(ctx) {
    const r = 16;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = ctx._surface;
    ctx.fill();
    ctx.stroke();
    lead(ctx, -SPAN / 2, -r);
    lead(ctx, r, SPAN / 2);
  },

  /*
   * Transformer: two windings facing each other across the core. The number
   * of humps on each side can follow the turns ratio, so a step down
   * transformer looks like one.
   */
  T(ctx, el) {
    const humps = (el && el.humps) || [4, 4];
    const half = 20;                        // each winding spans y -20 to 20
    [[-20, 1, humps[0]], [20, -1, humps[1]]].forEach(([x, side, n]) => {
      n = Math.max(1, Math.round(n));
      const r = half / n;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const cy = -half + r * (2 * i + 1);
        // bulge towards the core: right for the primary, left for the secondary
        ctx.arc(x, cy, r, -Math.PI / 2, Math.PI / 2, side < 0);
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, -SPAN / 2); ctx.lineTo(x, -half);
      ctx.moveTo(x, half); ctx.lineTo(x, SPAN / 2);
      ctx.stroke();
    });
    if (!el || el.core !== 'air') {
      ctx.beginPath();
      ctx.moveTo(-3, -half - 2); ctx.lineTo(-3, half + 2);
      ctx.moveTo(3, -half - 2); ctx.lineTo(3, half + 2);
      ctx.stroke();
    }
    if (el && el.dots) {
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath();
      ctx.arc(-27, -half + 2, 2, 0, Math.PI * 2);
      ctx.arc(27, -half + 2, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
};

/*
 * The face of a meter, drawn upright whatever way round the meter sits: the
 * letter for what it measures, or, given a reading, a scale and a needle
 * deflected that fraction of full scale.
 */
function meterFace(ctx, el, t, colour) {
  ctx.save();
  ctx.translate(el.at[0], el.at[1]);
  if (typeof el.reading === 'number') {
    const k = Math.max(0, Math.min(1, el.reading));
    const py = 8, len = 15, a0 = -Math.PI * 5 / 6, a1 = -Math.PI / 6;
    ctx.strokeStyle = t.soft || '#666';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, py, len - 2, a0, a1, false);
    ctx.stroke();
    const a = a0 + (a1 - a0) * k;
    ctx.strokeStyle = colour;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(Math.cos(a) * len, py + Math.sin(a) * len);
    ctx.stroke();
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(0, py, 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = colour;
    ctx.font = '600 15px ' + (t.font || 'sans-serif');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(el.meter || 'A', 0, 1);
  }
  ctx.restore();
}

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
    if (el.type === 'Q') continue;          // its leads end inside the device drawing
    for (const [x, y] of pins(el)) bump(x, y);
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
    ctx.font = '600 13px ' + (t.font || 'sans-serif');
    ctx.textAlign = term.align || 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(term.label, term.at[0] + (term.align === 'right' ? -8 : 8), term.at[1]);
  }

  for (const el of layout.elements) {
    const hot = opts.highlight && opts.highlight.has(el.name);
    // a part is drawn in the colour of what it is, as the course draws it:
    // resistors dark, inductors green, capacitors purple; anything else, and
    // any token a caller did not supply, in the wire colour. A highlighted
    // part keeps that meaning and is drawn heavier, with its label in bold;
    // a part with no quantity colour is picked out in ink. t.hot overrides.
    const own = el.type === 'R' ? t.r : el.type === 'L' ? t.l
              : (el.type === 'C' || el.type === 'CP') ? t.c : null;
    const colour = hot ? (t.hot || own || t.ink || '#111')
                       : (own || t.wire || '#444');
    ctx.strokeStyle = colour;
    ctx.lineWidth = hot ? 2.6 : 1.6;
    rotated(ctx, el.at[0], el.at[1], el.rot || 0, () => {
      (SYMBOL[el.type] || SYMBOL.R)(ctx, el);
    });
    if (el.type === 'M') meterFace(ctx, el, t, colour);

    // labels stay upright whatever the symbol orientation
    const label = el.label || el.name;
    const value = opts.labels ? opts.labels[el.name] : null;
    if (label || value) {
      const vertical = (el.rot || 0) % 180 !== 0;
      const leftOf = el.labelAt === 'left';
      ctx.fillStyle = hot ? colour : (t.ink || '#111');
      ctx.font = (hot ? '600 ' : '') + '13px ' + (t.font || 'sans-serif');
      ctx.textAlign = vertical ? (leftOf ? 'right' : 'left') : 'center';
      ctx.textBaseline = vertical ? 'middle' : 'bottom';
      const off = el.type === 'T' ? 36 : (el.type === 'M' || el.type === 'N') ? 24 : 20;
      const lx = el.at[0] + (vertical ? (leftOf ? -off : off) : 0);
      // clear of the body, with a value under it; a transformer's terminals
      // reach 30 above its centre, so its name sits above those
      const ly = el.at[1] + (vertical ? 0 : (el.type === 'T' ? -36 : el.type === 'M' ? -24
                                             : el.type === 'LP' ? -26 : -22));
      ctx.fillText(label, lx, ly);
      if (value) {
        ctx.fillStyle = hot ? colour : (t.soft || '#666');
        ctx.font = '13px ' + (t.mono || 'monospace');
        ctx.fillText(value, lx, ly + (vertical ? 15 : 14));
      }
    }
  }

  // charge last, so it reads on top of the wires and the component bodies
  if (opts.flow && typeof window !== 'undefined' && window.Flow) {
    window.Flow.draw(ctx, layout, opts.flow, SPAN);
  }
}

const API = { draw, pins, runs, SPAN, BODY, R_LEN, R_THK, TRANSISTOR_PINS, TRANSFORMER_PINS };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.Schematic = API;
