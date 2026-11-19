/*
 * content/2E.js - AC theory.
 *
 * The group every later circuit page leans on: what alternating current is,
 * how it is measured, and what resistors, capacitors and inductors each do to
 * it. Foundation meets AC, the frequencies radio uses and wavelength.
 * Intermediate adds period, phase, RMS, reactance as a ratio and the two
 * reactance graphs, impedance in words, v = f x wavelength and the current
 * along a long wire. Full puts numbers on reactance and impedance, and on
 * the coupling, decoupling and choke circuits built from them.
 *
 * Every circuit is solved by the nodal analysis engine at the frequency on
 * the sliders. Signals with a DC part and an AC part (the coupling and choke
 * circuits) are solved twice, once at 0 Hz for the DC and once at the signal
 * frequency, and added, which is exact for a linear circuit.
 *
 * Headlines come from content/descriptions.json and are our own wording.
 *
 * The fifth entry on a wire names the element whose current flows along it,
 * in the direction the wire is written. That is what the charge follows.
 */

const M = window.MNA;
const { eng, trim } = window.Fmt;
const TWO_PI = 2 * Math.PI;
const C_LIGHT = 3e8;          // the booklet's figure for radio waves
const SQRT2 = Math.SQRT2;
/** Six figures, so a round trip such as 999 999.99 Hz shows as 1 MHz. */
const r6 = x => +x.toPrecision(6);

/* ---- small helpers ---- */

/**
 * Legend text with subscripts in it. A legend entry lays its parts out as a
 * row with gaps, which would split "X<sub>C</sub>" into "X C"; wrapped, the
 * text stays one piece.
 */
const inline = html => '<span style="display:inline">' + html + '</span>';

/** A small sine wave for a legend: two cycles about a centre line. */
function sineIcon(colour, centre) {
  let d = '';
  for (let k = 0; k <= 64; k++) {
    const x = 2 + k * 66 / 64, y = 14 - 10 * Math.sin(k / 64 * 4 * Math.PI);
    d += (k ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
  }
  return '<svg width="70" height="28" viewBox="0 0 70 28" aria-hidden="true">' +
    '<line x1="2" y1="14" x2="68" y2="14" stroke="' + centre + '" stroke-width="1"/>' +
    '<path d="' + d + '" fill="none" stroke="' + colour + '" stroke-width="2.2"/></svg>';
}

/*
 * Colours. Every line, label and legend swatch takes the colour of the
 * quantity it shows (t.v voltage, t.i current, t.p power, t.l and t.c the
 * reactances, t.z impedance, t.r resistance); a cursor or mark that is not a
 * quantity is t.mark. Two of the same quantity are told apart by a dashed
 * line or a fainter tint of the same colour, never by a new hue.
 */

/*
 * How far a quieter line is mixed towards the surface. 0.25 keeps it at 3:1
 * or better against the panel in both themes, the least a line needs to be
 * seen; it is told from the full colour by being thinner as well.
 */
const PALE = 0.25;

/** A colour mixed towards the panel surface: a quieter line for the same quantity. */
function tint(hex, surface, k) {
  const rgb = h => /^#[0-9a-f]{6}$/i.test(h) ? [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)) : null;
  const a = rgb(hex), b = rgb(surface);
  if (!a || !b) return hex;
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * k).toString(16).padStart(2, '0')).join('');
}

/** A legend entry for a dashed line. */
const dashSwatch = (colour, html) =>
  '<span><i style="background:repeating-linear-gradient(90deg,' + colour + ' 0 4px,transparent 4px 7px)"></i>' +
  '<span class="sw-l">' + html + '</span></span>';

/** A legend entry for a cursor: an upright stroke, as it is drawn. */
const cursorSwatch = (colour, html) =>
  '<span><i style="width:3px;height:15px;background:' + colour + '"></i><span class="sw-l">' + html + '</span></span>';

/** A legend entry for points marked as dots. */
const dotSwatch = (colour, html) =>
  '<span><i style="width:8px;height:8px;border-radius:50%;background:' + colour + '"></i><span class="sw-l">' + html + '</span></span>';

/**
 * A trace drawn over a plot Plot.draw has just made, for a dashed line, which
 * the plot engine does not draw. Follows the spec's band and axis.
 */
function overlay(cv, spec, pts, colour, width, dash, axis) {
  const P = window.Plot.PAD, c = cv.getContext('2d');
  const W = cv.clientWidth - P.l - P.r, full = cv.clientHeight - P.t - P.b;
  const band = spec.band || [0, 1], H = full * (band[1] - band[0]), yOff = full * band[0];
  const ax = axis === 'right' ? spec.right : spec.left, lo = ax.min || 0;
  const [xa, xb] = spec.xRange;
  const X = v => P.l + W * (v - xa) / (xb - xa), Y = v => P.t + yOff + H * (1 - (v - lo) / (ax.max - lo));
  c.save();
  c.strokeStyle = colour; c.lineWidth = width; c.lineJoin = 'round'; c.setLineDash(dash || [7, 5]);
  c.beginPath();
  pts.forEach((p, i) => i ? c.lineTo(X(p.x), Y(p.y)) : c.moveTo(X(p.x), Y(p.y)));
  c.stroke();
  c.restore();
}

/** A worked result in the colour of its quantity: v, i-ink, p, l, c, z. */
const Q = (k, html) => '<span style="color:var(--q-' + k + ')">' + html + '</span>';

/** A canvas ready to draw on at the device's pixel density. */
function prep(cv) {
  const dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth, H = cv.clientHeight;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  const c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, W, H);
  return { c, W, H };
}

/*
 * Axis limits whose four divisions land on round figures. The plot engine
 * labels the top, the bottom and three lines between, so a top of 13.2 V
 * would be labelled 3.3, 6.6 and 9.9 V. These pick the next limit up whose
 * steps read cleanly at two significant figures.
 */
const NICE = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
function niceStep(x) {
  if (!(x > 0)) return 1;
  const e = Math.pow(10, Math.floor(Math.log10(x)));
  return e * NICE.find(n => n * e >= x * (1 - 1e-9));
}
/** -m to m, at least as wide as asked: the centre line and two steps each way. */
const symAxis = m => { const s = niceStep(m / 2); return { min: -2 * s, max: 2 * s }; };
/** 0 to m, at least as tall as asked, in four steps. */
const zeroAxis = m => { const s = niceStep(m / 4); return { min: 0, max: 4 * s }; };
/** Any lo to hi, in four round steps that cover it. */
function spanAxis(lo, hi) {
  let s = niceStep((hi - lo) / 4);
  for (let guard = 0; guard < 40; guard++) {
    const min = Math.floor(lo / s + 1e-9) * s;
    if (min + 4 * s >= hi * (1 - 1e-9)) return { min, max: min + 4 * s };
    s = niceStep(s * 1.0001);
  }
  return { min: lo, max: hi };
}

/**
 * Hide the item's sliders that do nothing in the view the toggle has chosen.
 * The template has already shown the ones this level lists, so this only
 * takes some away, and the next render starts again from the level's list.
 */
function idle(p, ids) {
  if (!p.ctrls) return;
  const boxes = [...p.ctrls.querySelectorAll('.ctrl')];
  boxes.forEach(box => { if (ids.indexOf(box.dataset.ctrl) >= 0) box.hidden = true; });
  p.ctrls.hidden = !boxes.some(box => !box.hidden);
}

/** An angle in degrees, to one decimal place, as a calculator gives it. */
const degText = a => (Math.abs(a) < 0.05 ? 0 : a).toFixed(1) + '°';

/** Points of y = fn(x) across [0, span]. */
function curve(span, fn, n) {
  const pts = [], N = n || 500;
  for (let i = 0; i < N; i++) { const x = span * i / (N - 1); pts.push({ x, y: fn(x) }); }
  return pts;
}

/** Solve a netlist at one frequency. */
function solve(net, f) {
  const ckt = M.parseNetlist(net);
  return { ckt, sol: M.solveAt(ckt, f) };
}

/** A horizontal arrow with heads at both ends, or one end. */
function arrow(c, x1, y, x2, colour, both) {
  c.strokeStyle = colour; c.fillStyle = colour; c.lineWidth = 1.6;
  c.beginPath(); c.moveTo(x1, y); c.lineTo(x2, y); c.stroke();
  const head = (x, dir) => {
    c.beginPath(); c.moveTo(x, y); c.lineTo(x - dir * 7, y - 4); c.lineTo(x - dir * 7, y + 4);
    c.closePath(); c.fill();
  };
  if (Math.abs(x2 - x1) < 4) return;
  const dir = Math.sign(x2 - x1);
  head(x2, dir);
  if (both) head(x1, -dir);
}

/**
 * One line of text in several colours, [[text, colour], ...], placed as a
 * single label would be, so a figure can wear its quantity's colour.
 */
function labelRun(c, t, parts, x, y, align, base, weight) {
  c.font = (weight || '600') + ' 15px "Saira Semi Condensed", sans-serif';
  const widths = parts.map(([s]) => c.measureText(s).width), total = widths.reduce((a, b) => a + b, 0);
  const cw = c.canvas.clientWidth || 1e9;
  let left = align === 'left' ? x : align === 'right' ? x - total : x - total / 2;
  left += Math.max(6 - left, Math.min(0, cw - 6 - (left + total)));
  c.textAlign = 'left'; c.textBaseline = base || 'alphabetic';
  // every halo first, so one part's halo cannot clip the letters of the last
  c.lineWidth = 4; c.strokeStyle = t.surface; c.lineJoin = 'round';
  let at = left;
  parts.forEach(([s], i) => { c.strokeText(s, at, y); at += widths[i]; });
  at = left;
  parts.forEach(([s, colour], i) => { c.fillStyle = colour; c.fillText(s, at, y); at += widths[i]; });
}

/** x for a centred label kept between a plot's two scales, where it fits there. */
function within(c, cv, text, x) {
  c.font = '600 15px "Saira Semi Condensed", sans-serif';
  const P = window.Plot.PAD, w = c.measureText(text).width;
  const lo = P.l + w / 2, hi = cv.clientWidth - P.r - w / 2;
  return lo > hi ? x : Math.min(hi, Math.max(lo, x));
}

/** Text with a surface-coloured halo, so it reads over a trace. */
function label(c, t, text, x, y, colour, align, base, weight) {
  c.font = (weight || '600') + ' 15px "Saira Semi Condensed", sans-serif';
  // keep the whole label on the canvas, whichever way it is aligned
  const wd = c.measureText(text).width, cw = c.canvas.clientWidth || 1e9;
  align = align || 'center';
  const left = align === 'left' ? x : align === 'right' ? x - wd : x - wd / 2;
  const shift = Math.max(6 - left, Math.min(0, cw - 6 - (left + wd)));
  x += shift;
  c.textAlign = align;
  c.textBaseline = base || 'alphabetic';
  c.lineWidth = 4; c.strokeStyle = t.surface; c.lineJoin = 'round';
  c.strokeText(text, x, y);
  c.fillStyle = colour;
  c.fillText(text, x, y);
}

/** How a phase difference reads in words. */
function phaseWords(deg) {
  const d = ((deg % 360) + 360) % 360;
  if (d < 0.5 || d > 359.5) return 'in phase';
  if (Math.abs(d - 180) < 0.5) return 'antiphase, half a cycle apart';
  return d < 180 ? 'B lags A by ' + trim(d, 3) + '°' : 'B leads A by ' + trim(360 - d, 3) + '°';
}

/* ---- the circuits, drawn: geometry here, values from the panels ---- */

/** A source on the left, one part across the top, the return along the bottom. */
function loopOne(src, part, I) {
  return {
    w: 205, h: 120,
    elements: [
      Object.assign({ at: [70, 70], rot: 90, labelAt: 'left' }, src),
      Object.assign({ at: [130, 40] }, part)
    ],
    wires: [[70, 40, 100, 40, I], [160, 40, 190, 40, I],
            [190, 40, 190, 100, I], [190, 100, 70, 100, I]]
  };
}

/** A source, one part across the top and a second down the right. */
function loopTwo(src, top, right, I) {
  return {
    w: 205, h: 120,
    elements: [
      Object.assign({ at: [70, 70], rot: 90, labelAt: 'left' }, src),
      Object.assign({ at: [125, 40] }, top),
      Object.assign({ at: [185, 70], rot: 90, labelAt: 'left' }, right)
    ],
    wires: [[70, 40, 95, 40, I], [155, 40, 185, 40, I], [185, 100, 70, 100, I]]
  };
}

/** Series R and C with the three test points of the exam diagram. */
function rcTaps() {
  const I = 'R1';
  return {
    w: 210, h: 125,
    elements: [
      { name: 'V1', type: 'V', at: [40, 85], rot: 90, label: 'AC', labelAt: 'left' },
      { name: 'R1', type: 'R', at: [90, 55], label: 'R' },
      { name: 'C1', type: 'C', at: [150, 55], label: 'C', flow: 'R1' }
    ],
    wires: [[40, 55, 50, 55, I], [50, 55, 60, 55, I], [180, 55, 190, 55, I], [190, 55, 200, 55, I],
            [200, 55, 200, 115, I], [200, 115, 40, 115, I],
            [50, 55, 50, 80, '-'], [120, 55, 120, 80, '-'], [190, 55, 190, 80, '-']],
    terminals: [{ at: [50, 80], label: 'A' }, { at: [120, 80], label: 'B' },
                { at: [190, 80], label: 'C', align: 'right' }]
  };
}

/* Two sources stacked on the left: a DC or audio part above, the signal below. */
const STACK = (top, bottom) => [
  Object.assign({ at: [45, 68], rot: 90, labelAt: 'left' }, top),
  Object.assign({ at: [45, 128], rot: 90, labelAt: 'left' }, bottom)
];

/** A stage's output coupled through C into the next stage's input. */
function coupleLayout() {
  const I = 'RS';
  return {
    w: 210, h: 168,
    elements: STACK({ name: 'VB', type: 'B', label: 'DC' }, { name: 'V1', type: 'V', label: 'AC' }).concat([
      { name: 'RS', type: 'R', at: [85, 38], label: 'stage' },
      { name: 'C1', type: 'C', at: [155, 38], label: 'C', flow: 'RS' },
      { name: 'RIN', type: 'R', at: [200, 98], rot: 90, label: 'next stage', labelAt: 'left' }
    ]),
    wires: [[45, 38, 55, 38, I], [115, 38, 125, 38, I], [185, 38, 200, 38, I], [200, 38, 200, 68, I],
            [200, 128, 200, 158, I], [200, 158, 45, 158, I]],
    grounds: [[120, 158]]
  };
}

/** A supply line with RF on it, decoupled to ground by C before the load. */
function decoupleLayout() {
  return {
    w: 210, h: 168,
    elements: STACK({ name: 'VB', type: 'B', label: 'DC' }, { name: 'V1', type: 'V', label: 'RF' }).concat([
      { name: 'RF', type: 'R', at: [90, 38], label: 'feed' },
      { name: 'C1', type: 'C', at: [135, 98], rot: 90, label: 'C', labelAt: 'left' },
      { name: 'RL', type: 'R', at: [200, 98], rot: 90, label: 'load', labelAt: 'left' }
    ]),
    wires: [[45, 38, 60, 38, 'RF'], [120, 38, 135, 38, 'RF'],
            [135, 38, 135, 68, 'C1'], [135, 38, 200, 38, 'RL'], [200, 38, 200, 68, 'RL'],
            [200, 128, 200, 158, 'RL'], [135, 128, 135, 158, 'C1'],
            [200, 158, 135, 158, 'RL'], [135, 158, 45, 158, 'RF']],
    grounds: [[90, 158]]
  };
}

/** A choke in series with a line: a DC feed, or a microphone lead. */
function chokeLayout(mic) {
  const I = 'L1';
  return {
    w: 210, h: 168,
    elements: STACK(mic ? { name: 'VA', type: 'V', label: 'AF' } : { name: 'VB', type: 'B', label: 'DC' },
                    { name: 'V1', type: 'V', label: 'RF' }).concat([
      { name: 'L1', type: 'L', at: [120, 38], label: mic ? 'coil' : 'choke' },
      { name: 'RLD', type: 'R', at: [200, 98], rot: 90, label: mic ? 'mic amp' : 'load', labelAt: 'left' }
    ]),
    wires: [[45, 38, 90, 38, I], [150, 38, 200, 38, I], [200, 38, 200, 68, I],
            [200, 128, 200, 158, I], [200, 158, 45, 158, I]],
    grounds: [[120, 158]]
  };
}

/* Netlists for the coupling and choke circuits. dc and ac are the source values. */
const NET = {
  couple: (Cc, dc, ac) => `V1 m 0 ${ac}\nVB a m ${dc}\nRS a b 1000\nC1 b c ${Cc}\nRIN c 0 10000`,
  decouple: (Cc, dc, ac) => `V1 m 0 ${ac}\nVB a m ${dc}\nRF a r 100\nC1 r 0 ${Cc}\nRL r 0 1000`,
  feed: (Lc, dc, ac) => `V1 m 0 ${ac}\nVB a m ${dc}\nL1 a o ${Lc}\nRLD o 0 100`,
  mic: (Lc, af, rf) => `V1 m 0 ${rf}\nVA a m ${af}\nL1 a o ${Lc}\nRLD o 0 1000`
};
const MIC_AF = 1000;          // the speech tone on the microphone lead, Hz
const MIC_IN = 1000;          // the microphone amplifier's input, ohms

/**
 * The microphone lead's note, from the coil on the sliders: how much of the
 * speech and of the RF reach the 1 kΩ input through it.
 */
function micNote(d) {
  const share = X => MIC_IN / Math.hypot(MIC_IN, X);
  const pct = X => trim(100 * share(X), 2) + '%';
  const a = d.XLa, s = d.XLs;
  const speech = share(a) > 0.995
    ? 'nothing beside the 1&nbsp;k&Omega; amplifier input, so speech passes untouched'
    : 'no longer small beside the 1&nbsp;k&Omega; amplifier input, so only ' + pct(a) + ' of the speech arrives';
  const rf = share(s) > 0.995 ? 'so the signal passes it as freely as the speech'
    : share(s) < 0.5 ? 'so only ' + pct(s) + ' of the RF reaches the amplifier'
    : 'which still lets ' + pct(s) + ' of the RF through to the amplifier';
  return 'At 1&nbsp;kHz the coil is ' + eng(a, 'Ω', 3) + ', ' + speech + '. At ' + eng(d.fs, 'Hz', 3) +
    ' it is ' + eng(s, 'Ω', 3) + ', ' + rf + '. In practice a small capacitor to ground after the coil finishes the job, making a low pass filter.';
}

/** The standing or travelling pattern on a wire, at phase wt, position x. */
function wireAt(kind, k, len, x, wt) {
  if (kind === 'stand') {
    // open at the far end: current zero there, voltage greatest
    return { i: Math.sin(k * (len - x)) * Math.cos(wt), v: Math.cos(k * (len - x)) * Math.sin(wt) };
  }
  // matched: the same wave travelling towards the load, current and voltage in step
  return { i: Math.cos(wt - k * x), v: Math.cos(wt - k * x) };
}

const BENCH = {
  group: '2E',
  title: 'AC theory',
  pageTitle: 'AC Theory Bench',
  levels: ['foundation', 'intermediate', 'full'],
  // the course sessions that send learners here, named in the colophon
  sessions: {
    foundation: ['Foundation session 4 (Waves, frequency and modulation)'],
    intermediate: ['Intermediate session 4 (AC, reactance and phase)'],
    full: ['Full session 6 (AC at Full: reactance, impedance and transformers)']
  },
  circuitBased: true,
  standfirst: 'Move a control and watch what happens. Every circuit here is solved live at the frequency on its sliders, and each of its waves is drawn from that solution.',
  bank: {
    url: 'https://rsgb.services/public/exams/eqdb/',
    topic: '2E - AC theory',
    note: 'Full level only. Choose the topic from the Filter by Topic list.'
  },

  intro: {
    foundation: [
      'The battery in a torch pushes current one way round the circuit, all the time. The mains in a house pushes it one way, then the other, completing fifty cycles every second. Radio signals do the same thing millions of times a second.',
      'This page starts with that difference, then looks at how fast signals alternate and what that does to the length of the wave they send out. Move a control and watch the picture change with it.'
    ],
    intermediate: [
      'Alternating current needs a few more words than direct current: how big it is, how fast it repeats, and how far one wave is behind another. Then come the three parts every circuit is made of, because a resistor, a capacitor and an inductor each treat AC differently.',
      'Each section shows its circuit solved at the frequency on its own sliders. Watch the moving charge as well as the graph: in a capacitor and an inductor the current and the voltage do not rise and fall together.'
    ],
    full: [
      'At Full the ideas from Intermediate become calculations: reactance from frequency and component value, and back again; impedance and current in a series circuit; and the coupling, decoupling and choke circuits found in every radio.',
      'Each formula is shown with your values in it. Each is marked ‘given in the exam’ if EX309 prints it, or ‘learn this one’ if not, and the rearrangements that are not printed are worked out for you, because the exam asks for them in every direction.'
    ]
  },

  /** Everything the working blocks read, from the controls. */
  derive: (v) => {
    const d = Object.assign({}, v);
    d.XC = 1 / (TWO_PI * v.f * v.C);
    d.XL = TWO_PI * v.f * v.L;
    d.XCs = 1 / (TWO_PI * v.fs * v.Cc);
    d.XLs = TWO_PI * v.fs * v.Lc;
    d.XLa = TWO_PI * MIC_AF * v.Lc;
    d.lam = C_LIGHT / v.fl;
    d.Vrms = 0.707 * v.Vp;
    d.Irms = d.Vrms / v.Rh;
    // f0 is the template's fallback animation frequency; each panel sets its own
    d.f0 = v.f;
    return d;
  },

  /*
   * A value written under a horizontal capacitor's name lands on its plates,
   * so there the value joins the name on one line above the symbol instead.
   */
  labels: (p) => {
    const out = Object.assign({}, p._labels || {});
    ((p.layout && p.layout.elements) || []).forEach(el => {
      if (el.type === 'C' && !((el.rot || 0) % 180) && out[el.name]) {
        el.label = (el.label || el.name) + ' ' + out[el.name];
        delete out[el.name];
      }
    });
    return out;
  },

  /*
   * Read before this bench was designed. Our own summary of what each source
   * insists on; no wording from any of them appears here or in the bench.
   */
  sources: {
    read: [
      'Foundation, Intermediate and Full licence manuals, AC and reactance',
      'Exam Secrets, technical basics at Foundation, Intermediate and Full',
      'Syllabus 2024 v1.6b, items 2E1 to 2E8, and the EX307, EX308 and EX309 reference booklets',
      'The course sessions on waves (Foundation 4), AC and phase (Intermediate 4) and reactance and impedance (Full 6)'
    ],
    keyMessages: [
      { at: '2E1', level: 'foundation',
        point: 'DC flows one way; AC reverses direction twice in every cycle' },
      { at: '2E1', level: 'intermediate',
        point: 'a capacitor passes AC by charging one way then the other; no charge crosses the dielectric, and on DC it stops once charged' },
      { at: '2E2', level: 'foundation',
        point: 'mains 50 Hz, hearing 20 Hz to 15 kHz, speech 300 Hz to 3 kHz, RF from below 30 kHz to beyond 3000 MHz, HF, VHF and UHF' },
      { at: '2E2', level: 'intermediate',
        point: 'a sine wave needs both its frequency and its amplitude; T = 1/f; phase difference in degrees, 360 to a cycle' },
      { at: '2E3', level: 'intermediate',
        point: 'in a resistor V and I are in phase, the power varies over the cycle, and RMS is the DC that heats the same; 0.707 of the peak' },
      { at: '2E3', level: 'intermediate',
        point: 'reactance is opposition with V and I 90 degrees apart, and no heat' },
      { at: '2E3', level: 'full',
        point: 'current lags by 90 degrees in an inductor and leads in a capacitor; find any one of X, f and L or C from the other two' },
      { at: '2E4', level: 'intermediate',
        point: 'reactance of a capacitor is V rms over I rms and falls as frequency rises, a curve flattening out' },
      { at: '2E4', level: 'full',
        point: 'a series capacitor couples AC and blocks DC; one to ground decouples AC and RF' },
      { at: '2E5', level: 'intermediate',
        point: 'an inductor takes time to store and release energy; its reactance rises with frequency in a straight line' },
      { at: '2E5', level: 'full',
        point: 'a choke passes DC and low frequencies and blocks RF' },
      { at: '2E6', level: 'intermediate',
        point: 'heat in the resistance, storage and release in the reactance; impedance is V over I, in ohms, with no phase at this level' },
      { at: '2E6', level: 'full',
        point: 'Z = square root of R squared plus X squared, I = V/Z, and the voltages add at right angles, not arithmetically' },
      { at: '2E7', level: 'foundation',
        point: 'higher frequency, shorter wavelength; hertz and metres; the booklet gives the graph and the speed of radio waves' },
      { at: '2E7', level: 'intermediate',
        point: 'v = f x wavelength with v = 3 x 10^8 m/s, so wavelength in metres is 300 over f in MHz' },
      { at: '2E8', level: 'intermediate',
        point: 'on a conductor comparable to a wavelength, current and voltage vary like a sine wave along it and reverse every half wavelength' }
    ]
  },

  controls: [
    // held at the three figures the slider shows, so the working never reads
    // 49.99 Hz under a slider reading 50 Hz
    { id: 'fw', label: 'Frequency', unit: 'Hz', range: [1, 20000], start: 50,
      snap: v => +v.toPrecision(3),
      desc: 'How many complete cycles the AC supply makes each second' },
    { id: 'C1', label: 'C', unit: 'F', range: [1e-6, 1e-3], start: 100e-6,
      desc: 'The capacitor in series with the lamp' },
    { id: 'fr', label: 'Frequency', unit: 'Hz', range: [10, 1e10], start: 1000,
      desc: 'Where on the scale of frequencies to look, from 10 Hz to 10 GHz' },
    { id: 'amp', label: 'Amplitude', unit: 'V', range: [0.1, 20], start: 5,
      desc: 'The peak voltage of both signals, measured from the centre line' },
    { id: 'ph', label: 'Phase of B, degrees', unit: '', range: [0, 360], start: 90,
      integer: true, linear: true,
      desc: 'How far signal B is behind signal A, as a fraction of a cycle in degrees' },
    { id: 'Vp', label: 'Peak voltage', unit: 'V', range: [1, 400], start: 325.3,
      desc: 'The peak of the AC supply. 325 V peak is the UK mains, 230 V RMS' },
    { id: 'Rh', label: 'R', unit: 'Ω', range: [1, 1000], start: 52.9,
      desc: 'The heater. 52.9 Ω takes 1 kW from the mains' },
    { id: 'V', label: 'Supply, RMS', unit: 'V', range: [0.1, 300], start: 10,
      desc: 'The RMS voltage of the AC supply' },
    { id: 'f', label: 'Frequency', unit: 'Hz', range: [10, 1e8], start: 1e6,
      desc: 'The frequency of the AC supply' },
    { id: 'R', label: 'R', unit: 'Ω', range: [1, 1e5], start: 300,
      desc: 'Resistance' },
    { id: 'L', label: 'L', unit: 'H', range: [1e-7, 10], start: 63.66e-6,
      desc: 'Inductance' },
    { id: 'C', label: 'C', unit: 'F', range: [1e-12, 1e-4], start: 397.9e-12,
      desc: 'Capacitance' },
    { id: 'fs', label: 'Signal frequency', unit: 'Hz', range: [100, 1e8], start: 7e6,
      desc: 'The frequency of the AC or RF on the line' },
    { id: 'Cc', label: 'C', unit: 'F', range: [1e-12, 1e-4], start: 100e-9,
      desc: 'The coupling or decoupling capacitor' },
    { id: 'Lc', label: 'L', unit: 'H', range: [1e-7, 0.1], start: 100e-6,
      desc: 'The choke' },
    { id: 'fl', label: 'Frequency', unit: 'Hz', range: [1e6, 1e9], start: 145e6,
      desc: 'The frequency of the radio wave, 1 MHz to 1000 MHz as on the booklet graph' },
    { id: 'lw', label: 'Wire length', unit: 'm', range: [0.1, 20], start: 2,
      desc: 'How long the conductor is' }
  ],

  /*
   * Every circuit this page draws, for the two checkers. Each carries the
   * flow it is drawn with, so the checkers also prove that the current
   * arriving at every junction equals the current leaving it.
   */
  allLayouts: () => {
    const ac = { mode: 'ac' };
    const tau = 100 * 100e-6;
    const L = [
      { name: '2E1 lamp on DC', layout: BENCH.lay.lamp('dc'), flow: { mode: 'dc', currents: { R1: 0.12 } } },
      { name: '2E1 lamp on AC', layout: BENCH.lay.lamp('ac'), netlist: 'V1 a 0 12\nR1 a 0 100', flow: ac },
      { name: '2E1 capacitor on DC, charging', layout: BENCH.lay.capLamp('dc'),
        flow: { mode: 'time', duration: 10 * tau, currents: t => ({ R1: 0.12 * Math.exp(-t / tau) }) } },
      { name: '2E1 capacitor on AC', layout: BENCH.lay.capLamp('ac'),
        netlist: 'V1 a 0 12\nR1 a b 100\nC1 b 0 100u', flow: ac },
      { name: '2E3 heater on AC', layout: BENCH.lay.single('R', 'V'), netlist: 'V1 a 0 325\nR1 a 0 52.9', flow: ac },
      { name: '2E3 heater on equal DC', layout: BENCH.lay.single('R', 'B'), flow: { mode: 'dc', currents: { R1: 4.35 } } },
      { name: '2E3 inductor alone', layout: BENCH.lay.single('L', 'V'), netlist: 'V1 a 0 10\nL1 a 0 63.66u', flow: ac },
      { name: '2E3 capacitor alone', layout: BENCH.lay.single('C', 'V'), netlist: 'V1 a 0 10\nC1 a 0 397.9n', flow: ac },
      { name: '2E3 R and C with test points', layout: rcTaps(), netlist: 'V1 a 0 10\nR1 a b 300\nC1 b 0 397.9n', flow: ac },
      { name: '2E4 capacitor and meter', layout: BENCH.lay.meter('C'), netlist: 'V1 a 0 10\nRM a b 0.001\nC1 b 0 397.9n', flow: ac },
      { name: '2E5 inductor and meter', layout: BENCH.lay.meter('L'), netlist: 'V1 a 0 10\nRM a b 0.001\nL1 b 0 63.66u', flow: ac },
      { name: '2E4 coupling', layout: coupleLayout(), netlist: NET.couple('100n', 0, 1), flow: ac },
      { name: '2E4 decoupling', layout: decoupleLayout(), netlist: NET.decouple('100n', 0, 1), flow: ac },
      { name: '2E5 choke on a DC feed', layout: chokeLayout(false), flow: { mode: 'dc', currents: { L1: 0.12, RLD: 0.12 } } },
      { name: '2E5 coil on a microphone lead', layout: chokeLayout(true), netlist: NET.mic('100u', 0.01, 0), flow: ac },
      { name: '2E6 series CR', layout: BENCH.lay.series('CR'), netlist: 'V1 a 0 10\nR1 a b 300\nC1 b 0 397.9n', flow: ac },
      { name: '2E6 series LR', layout: BENCH.lay.series('LR'), netlist: 'V1 a 0 10\nR1 a b 300\nL1 b 0 63.66u', flow: ac }
    ];
    return L;
  },

  /* The drawings that depend on a choice, kept beside each other. */
  lay: {
    lamp: (src) => loopOne(src === 'dc'
        ? { name: 'VB', type: 'B', label: 'DC' } : { name: 'V1', type: 'V', label: 'AC' },
      { name: 'R1', type: 'LP', label: 'lamp' }, 'R1'),
    capLamp: (src) => loopTwo(src === 'dc'
        ? { name: 'VB', type: 'B', label: 'DC' } : { name: 'V1', type: 'V', label: 'AC' },
      { name: 'R1', type: 'LP', label: 'lamp' },
      { name: 'C1', type: 'C', label: 'C', flow: src === 'dc' ? 'R1' : 'C1' }, 'R1'),
    single: (kind, srcType) => loopOne(srcType === 'B'
        ? { name: 'VB', type: 'B', label: 'DC' } : { name: 'V1', type: 'V', label: 'AC' },
      { name: kind + '1', type: kind, label: kind }, kind + '1'),
    meter: (kind) => loopTwo({ name: 'V1', type: 'V', label: 'AC' },
      { name: 'RM', type: 'M', meter: 'mA', label: 'meter' },
      { name: kind + '1', type: kind, label: kind }, 'RM'),
    series: (kind) => loopTwo({ name: 'V1', type: 'V', label: 'AC' },
      { name: 'R1', type: 'R', label: 'R' },
      kind === 'CR' ? { name: 'C1', type: 'C', label: 'C' } : { name: 'L1', type: 'L', label: 'L' }, 'R1')
  },

  /*
   * The equations this page shows. `given` records whether the Full booklet
   * (EX309, Feb 2026) prints the formula, which sets "given in the exam" or
   * "learn this one" at Full. Below Full the default is "for interest"; `tag`
   * overrides it where the Intermediate booklet (EX308) prints the formula,
   * or where the syllabus asks for it anyway.
   */
  equations: {
    T: { given: true, tag: { intermediate: 'given' },
         name: 'Periodic time', eq: 'T = 1 / f',
         work: d => ['1 / <b>' + eng(d.fw, 'Hz', 4) + '</b>', eng(1 / d.fw, 's', 4)] },
    fT: { given: true, tag: { intermediate: 'given' },
          name: 'Frequency from the period', eq: 'f = 1 / T',
          work: d => ['1 / <b>' + eng(1 / d.fw, 's', 4) + '</b>', eng(d.fw, 'Hz', 4)] },
    phdeg: { given: false, tag: { intermediate: 'learn' },
             name: 'Phase difference in degrees', eq: 'phase = (time between them / T) &times; 360&deg;',
             work: d => ['(<b>' + eng(d.ph / 360 / d.fw, 's', 3) + '</b> / <b>' + eng(1 / d.fw, 's', 4) +
                         '</b>) &times; 360&deg;', trim(d.ph, 3) + '&deg;'] },
    rms: { given: true, tag: { intermediate: 'given' },
           name: 'RMS from peak', eq: 'V<sub>rms</sub> = V<sub>peak</sub> / &radic;2 = 0.707 &times; V<sub>peak</sub>',
           work: d => ['0.707 &times; <b>' + eng(d.Vp, 'V', 4) + '</b>', Q('v', eng(d.Vrms, 'V', 4))] },
    peak: { given: false, tag: { intermediate: 'learn' },
            name: 'Peak from RMS, the other way round', eq: 'V<sub>peak</sub> = V<sub>rms</sub> / 0.707 = 1.414 &times; V<sub>rms</sub>',
            work: d => ['<b>' + eng(d.Vrms, 'V', 4) + '</b> / 0.707', Q('v', eng(r6(d.Vrms / 0.707), 'V', 4))] },
    Irms: { given: true, tag: { intermediate: 'given' }, applies: d => d.device === 'R' || d.device === 'dc',
            name: 'RMS current', eq: 'V = I &times; R, so I<sub>rms</sub> = V<sub>rms</sub> / R',
            work: d => ['<b>' + eng(d.Vrms, 'V', 4) + '</b> / <b>' + eng(d.Rh, 'Ω', 4) + '</b>', Q('i-ink', eng(d.Irms, 'A', 4))] },
    Pav: { given: true, tag: { intermediate: 'given' }, applies: d => d.device === 'R' || d.device === 'dc',
           name: 'Average power, which is the heat', eq: 'P = V<sub>rms</sub> &times; I<sub>rms</sub>',
           work: d => ['<b>' + eng(d.Vrms, 'V', 4) + '</b> &times; <b>' + eng(d.Irms, 'A', 4) + '</b>',
                       Q('p', eng(d.Vrms * d.Irms, 'W', 4))] },
    XL: { given: true, tag: { intermediate: 'given' },
          applies: d => ['C', 'CR', 'RC', 'R', 'dc'].indexOf(d.device) < 0,
          name: 'Reactance of the inductor', eq: 'X<sub>L</sub> = 2&pi;fL',
          work: d => ['2&pi; &times; <b>' + eng(d.f, 'Hz', 4) + '</b> &times; <b>' + eng(d.L, 'H', 4) + '</b>',
                      Q('l', eng(d.XL, 'Ω', 4))] },
    XC: { given: true, tag: { intermediate: 'given' },
          applies: d => ['L', 'LR', 'R', 'dc'].indexOf(d.device) < 0,
          name: 'Reactance of the capacitor', eq: 'X<sub>C</sub> = 1 / 2&pi;fC',
          work: d => ['1 / (2&pi; &times; <b>' + eng(d.f, 'Hz', 4) + '</b> &times; <b>' + eng(d.C, 'F', 4) + '</b>)',
                      Q('c', eng(d.XC, 'Ω', 4))] },
    Lfor: { given: false, applies: d => d.device === 'L',
            name: 'Rearranged for L', eq: 'L = X<sub>L</sub> / 2&pi;f',
            work: d => ['<b>' + eng(d.XL, 'Ω', 4) + '</b> / (2&pi; &times; <b>' + eng(d.f, 'Hz', 4) + '</b>)',
                        Q('l', eng(r6(d.XL / (TWO_PI * d.f)), 'H', 4))] },
    fXL: { given: false, applies: d => d.device === 'L',
           name: 'Rearranged for f', eq: 'f = X<sub>L</sub> / 2&pi;L',
           work: d => ['<b>' + eng(d.XL, 'Ω', 4) + '</b> / (2&pi; &times; <b>' + eng(d.L, 'H', 4) + '</b>)',
                       eng(r6(d.XL / (TWO_PI * d.L)), 'Hz', 4)] },
    Cfor: { given: false, applies: d => d.device === 'C',
            name: 'Rearranged for C', eq: 'C = 1 / 2&pi;fX<sub>C</sub>',
            work: d => ['1 / (2&pi; &times; <b>' + eng(d.f, 'Hz', 4) + '</b> &times; <b>' + eng(d.XC, 'Ω', 4) + '</b>)',
                        Q('c', eng(r6(1 / (TWO_PI * d.f * d.XC)), 'F', 4))] },
    fXC: { given: false, applies: d => d.device === 'C',
           name: 'Rearranged for f', eq: 'f = 1 / 2&pi;CX<sub>C</sub>',
           work: d => ['1 / (2&pi; &times; <b>' + eng(d.C, 'F', 4) + '</b> &times; <b>' + eng(d.XC, 'Ω', 4) + '</b>)',
                       eng(r6(1 / (TWO_PI * d.C * d.XC)), 'Hz', 4)] },
    XCr: { given: false, tag: { intermediate: 'learn' },
           name: 'Reactance as a ratio', eq: 'X<sub>C</sub> = V<sub>rms</sub> / I<sub>rms</sub>',
           work: d => ['<b>' + eng(d.V, 'V', 4) + '</b> / <b>' + eng(d.V / d.XC, 'A', 4) + '</b>', Q('c', eng(d.XC, 'Ω', 4))] },
    XLr: { given: false, tag: { intermediate: 'learn' },
           name: 'Reactance as a ratio', eq: 'X<sub>L</sub> = V<sub>rms</sub> / I<sub>rms</sub>',
           work: d => ['<b>' + eng(d.V, 'V', 4) + '</b> / <b>' + eng(d.V / d.XL, 'A', 4) + '</b>', Q('l', eng(d.XL, 'Ω', 4))] },
    XCs: { given: true, name: 'Reactance of the capacitor at the signal frequency', eq: 'X<sub>C</sub> = 1 / 2&pi;fC',
           work: d => ['1 / (2&pi; &times; <b>' + eng(d.fs, 'Hz', 4) + '</b> &times; <b>' + eng(d.Cc, 'F', 4) + '</b>)',
                       Q('c', eng(d.XCs, 'Ω', 4))] },
    XLs: { given: true, name: 'Reactance of the choke at the signal frequency', eq: 'X<sub>L</sub> = 2&pi;fL',
           work: d => ['2&pi; &times; <b>' + eng(d.fs, 'Hz', 4) + '</b> &times; <b>' + eng(d.Lc, 'H', 4) + '</b>',
                       Q('l', eng(d.XLs, 'Ω', 4))] },
    XLa: { given: true, applies: d => d.device === 'mic',
           name: 'And at the speech frequency', eq: 'X<sub>L</sub> = 2&pi;fL',
           work: d => ['2&pi; &times; <b>' + eng(MIC_AF, 'Hz', 4) + '</b> &times; <b>' + eng(d.Lc, 'H', 4) + '</b>',
                       Q('l', eng(d.XLa, 'Ω', 4))] },
    Zr: { given: false, tag: { intermediate: 'learn' },
          name: 'Impedance as a ratio', eq: 'Z = V<sub>rms</sub> / I<sub>rms</sub>',
          work: d => {
            const X = d.device === 'LR' ? d.XL : d.XC, Z = Math.hypot(d.R, X);
            return ['<b>' + eng(d.V, 'V', 4) + '</b> / <b>' + eng(d.V / Z, 'A', 4) + '</b>', Q('z', eng(Z, 'Ω', 4))];
          } },
    Zs: { given: true, applies: d => ['RC', 'CR', 'LR'].indexOf(d.device) >= 0,
          name: 'Impedance of R and X in series', eq: 'Z = <span class="rad">&radic;</span>(R&sup2; + X&sup2;)',
          work: d => {
            const X = d.device === 'LR' ? d.XL : d.XC;
            return ['<span class="rad">&radic;</span>(<b>' + eng(d.R, 'Ω', 4) + '</b>&sup2; + <b>' + eng(X, 'Ω', 4) + '</b>&sup2;)',
                    Q('z', eng(Math.hypot(d.R, X), 'Ω', 4))];
          } },
    Iz: { given: true, name: 'Current', eq: 'V = IR, so I = V / Z',
          work: d => {
            const Z = Math.hypot(d.R, d.device === 'LR' ? d.XL : d.XC);
            return ['<b>' + eng(d.V, 'V', 4) + '</b> / <b>' + eng(Z, 'Ω', 4) + '</b>', Q('i-ink', eng(d.V / Z, 'A', 4))];
          } },
    VR: { given: true, name: 'Voltage across R', eq: 'V = IR, here V<sub>R</sub> = I &times; R',
          work: d => {
            const I = d.V / Math.hypot(d.R, d.device === 'LR' ? d.XL : d.XC);
            return ['<b>' + eng(I, 'A', 4) + '</b> &times; <b>' + eng(d.R, 'Ω', 4) + '</b>', Q('v', eng(I * d.R, 'V', 4))];
          } },
    VX: { given: true, name: 'Voltage across the reactance', eq: 'V = IR, here V<sub>X</sub> = I &times; X',
          work: d => {
            const X = d.device === 'LR' ? d.XL : d.XC, I = d.V / Math.hypot(d.R, X);
            return ['<b>' + eng(I, 'A', 4) + '</b> &times; <b>' + eng(X, 'Ω', 4) + '</b>', Q('v', eng(I * X, 'V', 4))];
          } },
    VT: { given: true, name: 'The two voltages add at right angles',
          eq: 'V<sub>T</sub> = <span class="rad">&radic;</span>(V<sub>R</sub>&sup2; + V<sub>C</sub>&sup2; (or V<sub>L</sub>&sup2;))',
          work: d => {
            const X = d.device === 'LR' ? d.XL : d.XC, I = d.V / Math.hypot(d.R, X);
            return ['<span class="rad">&radic;</span>(<b>' + eng(I * d.R, 'V', 4) + '</b>&sup2; + <b>' + eng(I * X, 'V', 4) + '</b>&sup2;)',
                    Q('v', eng(d.V, 'V', 4))];
          } },
    phi: { given: false, tag: { full: 'interest' },
           name: 'The angle in the triangle', eq: '&phi; = tan<sup>&minus;1</sup>(X / R)',
           work: d => {
             const X = d.device === 'LR' ? d.XL : d.XC;
             return ['tan<sup>&minus;1</sup>(<b>' + eng(X, 'Ω', 4) + '</b> / <b>' + eng(d.R, 'Ω', 4) + '</b>)',
                     degText(Math.atan2(X, d.R) * 180 / Math.PI)];
           } },
    lam: { given: true, tag: { foundation: 'interest', intermediate: 'given' },
           name: 'Wavelength', eq: 'v = f &times; &lambda;, so &lambda; = v / f',
           work: d => ['3 &times; 10<sup>8</sup> m/s / <b>' + eng(d.fl, 'Hz', 4) + '</b>', eng(d.lam, 'm', 4)] },
    flam: { given: true, tag: { foundation: 'interest', intermediate: 'given' },
            name: 'Frequency from wavelength', eq: 'f = v / &lambda;',
            work: d => ['3 &times; 10<sup>8</sup> m/s / <b>' + eng(d.lam, 'm', 4) + '</b>', eng(d.fl, 'Hz', 4)] },
    mhz: { given: false, tag: { foundation: 'interest', intermediate: 'learn' },
           name: 'The same sum in megahertz', eq: '&lambda; in metres = 300 / f in MHz',
           work: d => ['300 / <b>' + trim(d.fl / 1e6, 4) + '</b>', eng(300 / (d.fl / 1e6), 'm', 4)] },
    ratio: { given: false, tag: { intermediate: 'interest' },
             name: 'Length in wavelengths', eq: 'length / &lambda;',
             work: d => ['<b>' + eng(d.lw, 'm', 4) + '</b> / <b>' + eng(d.lam, 'm', 4) + '</b>',
                         trim(d.lw / d.lam, 3) + ' wavelengths'] }
  },

  /* Words this page introduces, defined where they are first used. */
  terms: {
    'DC': 'Direct current: current that flows one way round a circuit all the time, as from a battery.',
    'AC': 'Alternating current: current that flows one way, then the other, over and over again, as from the mains.',
    'cycle': 'One complete repeat of an alternating current: up one way, back through zero, the other way, and back to where it started.',
    'frequency': 'How many complete cycles happen in one second, measured in hertz.',
    'hertz': 'The unit of frequency, Hz: one cycle per second. 1 kHz is a thousand, 1 MHz a million, 1 GHz a thousand million.',
    'dielectric': 'The insulator between the two plates of a capacitor. Charge collects on the plates but never crosses it.',
    'sine wave': 'The smooth curve that shows an alternating current or voltage rising, falling and reversing over time.',
    'AF': 'Audio frequency: a frequency in the range you can hear, about 20 Hz to 15 kHz.',
    'RF': 'Radio frequency: the frequencies radio signals use, from below 30 kHz to beyond 3000 MHz.',
    'HF': 'High frequency: 3 MHz to 30 MHz.',
    'VHF': 'Very high frequency: 30 MHz to 300 MHz.',
    'UHF': 'Ultra high frequency: 300 MHz to 3000 MHz.',
    'amplitude': 'How big a wave gets, here the peak voltage measured from the centre line.',
    'periodic time': 'The time one cycle takes, T, in seconds. It is one divided by the frequency.',
    'square wave': 'A wave that jumps between two levels instead of changing smoothly.',
    'phase difference': 'How far one wave is behind another of the same frequency, as a fraction of a cycle. A whole cycle is 360°.',
    'RMS': 'Root mean square: the value of an AC voltage or current that heats a resistor exactly as much as the same value of DC.',
    'reactance': 'The opposition of a capacitor or an inductor to AC, in ohms. It stores energy and gives it back, so it makes no heat, and the voltage and current are 90° apart.',
    'lags': 'Reaches its peak later. A current that lags the voltage by 90° peaks a quarter of a cycle after it.',
    'leads': 'Reaches its peak earlier. A current that leads the voltage by 90° peaks a quarter of a cycle before it.',
    'AC coupling': 'Passing a signal from one stage to the next through a capacitor in series, so the AC gets through and the DC does not.',
    'decoupling': 'Sending unwanted AC or RF to ground through a capacitor, so it cannot travel along a supply line or bias line. Also called bypassing.',
    'choke': 'An inductor used to pass DC, or low frequencies, while blocking AC or RF. At RF it is called an RF choke.',
    'impedance': 'The overall opposition of a circuit to AC, the ratio of the voltage to the current, in ohms. It covers both the resistance and the reactance.',
    'impedance triangle': 'A right-angled triangle with R along one side, X at right angles to it and Z as the long side. It is how resistance and reactance combine.',
    'wavelength': 'The distance a wave travels during one cycle, measured in metres. Written &lambda;, the Greek letter lambda.'
  },

  /* ---- how each panel draws itself ---- */
  panels: {

    /* 2E1: the same lamp on DC and AC, and then with a capacitor in series. */
    dcac(ctx) {
      const { p, d, t, level, Plot, swatch, ro } = ctx;
      const dc = p.topology === 'dc', f = d.fw, T = 1 / f, R = 100, Vs = 12;
      p.fAnim = f;
      // DC has no frequency: its slider and the mains button would do nothing
      if (dc) { idle(p, ['fw']); if (p.presets) p.presets.hidden = true; }
      if (level === 'foundation') {
        const I = Vs / R, span = 3 * T;
        Plot.draw(p.graph, {
          xRange: [0, span], xFmt: x => eng(x, 's', 2), tokens: t,
          left: { min: -0.16, max: 0.16, fmt: y => eng(y, 'A', 2) },
          traces: [{ pts: curve(span, x => dc ? I : I * Math.sin(TWO_PI * f * x)), colour: t.i, axis: 'left', width: 2.6 }],
          cursor: null
        });
        p.legend.innerHTML = swatch(t.i, 'Current through the lamp, against time') +
          '<span>Above the centre line it flows one way round, below it the other</span>';
        p.readouts.innerHTML = ro([
          ['Supply', Q('v', dc ? '12 V DC' : '12 V peak AC')],
          ['Current', Q('i-ink', dc ? eng(I, 'A', 3) + ', steady' : eng(I, 'A', 3) + ' at its peak')],
          ['Direction', dc ? 'always the same way' : 'reverses twice in every cycle', true],
          ['Cycles each second', dc ? 'none: it never repeats' : trim(f, 4)]
        ]);
        p._labels = { VB: '12 V', V1: '12 V', R1: '100 Ω' };
        const layout = BENCH.lay.lamp(dc ? 'dc' : 'ac');
        if (dc) return { layout, flow: { mode: 'dc', currents: { R1: I } } };
        return { layout, circuit: M.parseNetlist('V1 a 0 12\nR1 a 0 100') };
      }
      // Intermediate: a capacitor in series
      const C = d.C1, tau = R * C, layout = BENCH.lay.capLamp(dc ? 'dc' : 'ac');
      p._labels = { VB: '12 V', V1: '12 V', R1: '100 Ω', C1: eng(C, 'F', 3) };
      if (dc) {
        const I0 = Vs / R, span = 10 * tau;
        Plot.draw(p.graph, {
          xRange: [0, span], xFmt: x => eng(x, 's', 2), tokens: t,
          left: Object.assign(zeroAxis(1.1 * Vs), { fmt: y => eng(y, 'V', 2) }),
          right: Object.assign(zeroAxis(1.1 * I0), { fmt: y => eng(y, 'A', 2) }),
          traces: [
            { pts: curve(span, x => I0 * Math.exp(-x / tau)), colour: t.i, axis: 'right', width: 2.6 },
            { pts: curve(span, x => Vs * (1 - Math.exp(-x / tau))), colour: t.v, axis: 'left', width: 2 }
          ],
          cursor: null
        });
        p.legend.innerHTML = swatch(t.i, 'Current, right scale') +
          swatch(t.v, 'Voltage across the capacitor, left scale');
        p.readouts.innerHTML = ro([
          ['Current at first', Q('i-ink', eng(I0, 'A', 3))],
          ['Current once charged', Q('i-ink', '0 A'), true],
          ['Capacitor voltage', Q('v', 'climbs to 12 V')],
          ['Across the dielectric', 'no charge crosses']
        ]);
        return { layout, flow: { mode: 'time', duration: span,
          currents: x => ({ R1: I0 * Math.exp(-x / tau) }),
          charge: x => ({ R1: I0 * tau * (1 - Math.exp(-x / tau)) }),
          label: x => eng(x, 's', 2) + ' after the supply is connected' } };
      }
      const net = `V1 a 0 ${Vs}\nR1 a b ${R}\nC1 b 0 ${C}`;
      const { ckt, sol } = solve(net, f);
      const I = M.currentThrough(sol, 'R1'), Vc = M.nodeV(sol, 'b');
      const span = 3 * T, Ipk = M.abs(I);
      Plot.draw(p.graph, {
        xRange: [0, span], xFmt: x => eng(x, 's', 2), tokens: t,
        left: Object.assign(symAxis(1.1 * Vs), { fmt: y => eng(y, 'V', 2) }),
        right: Object.assign(symAxis(1.2 * Ipk), { fmt: y => eng(y, 'A', 2) }),
        traces: [
          { pts: curve(span, x => Ipk * Math.sin(TWO_PI * f * x + M.arg(I))), colour: t.i, axis: 'right', width: 2.6 },
          { pts: curve(span, x => M.abs(Vc) * Math.sin(TWO_PI * f * x + M.arg(Vc))), colour: t.v, axis: 'left', width: 2 }
        ],
        cursor: null
      });
      p.legend.innerHTML = swatch(t.i, 'Current, right scale') +
        swatch(t.v, 'Voltage across the capacitor, left scale');
      p.readouts.innerHTML = ro([
        ['Current', Q('i-ink', eng(Ipk, 'A', 3) + ' peak, both ways'), true],
        ['Capacitor charges', 'one way, then the other'],
        ['Across the dielectric', 'no charge crosses'],
        ['Frequency', eng(f, 'Hz', 4)]
      ]);
      return { layout, circuit: ckt };
    },

    /* 2E2 Foundation: where a frequency sits on the scale radio uses. */
    ruler(ctx) {
      const { p, d, t, ro, swatch } = ctx;
      const { c, W, H } = prep(p.graph);
      const L = 18, R = W - 18, lo = 1, hi = 10;
      const X = f => L + (R - L) * (Math.log10(f) - lo) / (hi - lo);
      const axisY = H - 40, narrow = (R - L) / 9 < 70;
      // decade grid and labels
      c.font = '500 15px "Saira Semi Condensed", sans-serif';
      c.textBaseline = 'top'; c.textAlign = 'center';
      const names = ['10 Hz', '100 Hz', '1 kHz', '10 kHz', '100 kHz', '1 MHz', '10 MHz', '100 MHz', '1 GHz', '10 GHz'];
      names.forEach((n, i) => {
        const x = Math.round(X(Math.pow(10, i + 1))) + 0.5;
        c.strokeStyle = t.grid; c.lineWidth = 1;
        c.beginPath(); c.moveTo(x, 26); c.lineTo(x, axisY); c.stroke();
        if (!narrow || i % 2 === 0) {
          c.fillStyle = t.faint;
          c.textAlign = i === 0 ? 'left' : i === 9 ? 'right' : 'center';
          c.fillText(n.replace(' ', ' '), i === 0 ? x - 4 : i === 9 ? x + 4 : x, axisY + 8);
        }
      });
      c.strokeStyle = t.faint; c.beginPath(); c.moveTo(L, axisY + 0.5); c.lineTo(R, axisY + 0.5); c.stroke();

      // the cursor, behind the bands so their names stay readable over it
      const fr = d.fr, xc = X(fr);
      // neutral, like the bands, so it is told apart by its shape: heavier, with a head
      c.strokeStyle = t.mark; c.fillStyle = t.mark; c.lineWidth = 2.6;
      c.beginPath(); c.moveTo(xc, 22); c.lineTo(xc, axisY); c.stroke();
      c.beginPath(); c.moveTo(xc - 6, 22); c.lineTo(xc + 6, 22); c.lineTo(xc, 30); c.closePath(); c.fill();
      const right = xc > W * 0.7;
      label(c, t, eng(fr, 'Hz', 3), xc + (right ? -7 : 7), 14, t.mark, right ? 'right' : 'left', 'middle', '700');

      // the bands, one row each, labelled inside if they fit and beside if not
      const rows = [
        [{ from: 20, to: 15e3, text: 'hearing, 20 Hz to 15 kHz', short: 'hearing', colour: t.faint }],
        [{ from: 300, to: 3e3, text: 'speech on the radio, 300 Hz to 3 kHz', short: 'speech, 300 Hz to 3 kHz', colour: t.faint }],
        [{ from: 30e3, to: 3e9, text: 'RF: from below 30 kHz to beyond 3000 MHz', short: 'RF, below 30 kHz to beyond 3000 MHz', tiny: 'RF', colour: t.ink, open: true }],
        [{ from: 3e6, to: 30e6, text: 'HF', colour: t.ink }, { from: 30e6, to: 300e6, text: 'VHF', colour: t.ink },
         { from: 300e6, to: 3e9, text: 'UHF', colour: t.ink }]
      ];
      const fit = (txt) => c.measureText(txt).width;
      rows.forEach((row, ri) => {
        const y = 34 + ri * 36, h = 22;
        row.forEach(b => {
          const x1 = X(b.from), x2 = X(b.to);
          c.globalAlpha = 0.22; c.fillStyle = b.colour;
          c.fillRect(x1, y, x2 - x1, h);
          c.globalAlpha = 1; c.strokeStyle = b.colour; c.lineWidth = 1.4;
          c.strokeRect(x1 + 0.5, y + 0.5, x2 - x1 - 1, h - 1);
          if (b.open) {                       // it carries on beyond both ends
            c.setLineDash([3, 3]);
            c.beginPath(); c.moveTo(x1 - 22, y + h / 2); c.lineTo(x1, y + h / 2);
            c.moveTo(x2, y + h / 2); c.lineTo(Math.min(R, x2 + 22), y + h / 2); c.stroke();
            c.setLineDash([]);
          }
          c.font = '600 15px "Saira Semi Condensed", sans-serif';
          c.textBaseline = 'middle';
          let txt = b.text, w = fit(txt);
          const put = (s2, x, al) => label(c, t, s2, x, y + h / 2, t.ink, al, 'middle');
          if (w + 10 <= x2 - x1) return put(txt, (x1 + x2) / 2, 'center');
          if (b.short && fit(b.short) + 10 <= x2 - x1) return put(b.short, (x1 + x2) / 2, 'center');
          if (x2 + 8 + w <= R) return put(txt, x2 + 8, 'left');
          if (b.short) { txt = b.short; w = fit(txt); }
          if (x2 + 8 + w <= R) return put(txt, x2 + 8, 'left');
          if (b.tiny) return put(b.tiny, (x1 + x2) / 2, 'center');
          if (x1 - 8 - w >= L) return put(txt, x1 - 8, 'right');
          put(b.text, (x1 + x2) / 2, 'center');
        });
      });
      // the mains, marked where the bottom row is empty
      const xm = Math.round(X(50)) + 0.5;
      c.strokeStyle = t.soft; c.setLineDash([4, 3]); c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(xm, 30); c.lineTo(xm, axisY); c.stroke(); c.setLineDash([]);
      label(c, t, 'mains 50 Hz', xm + 6, 34 + 3 * 36 + 11, t.soft, 'left', 'middle');


      p.legend.innerHTML = '<span>' + sineIcon(t.ink, t.faint) + 'A sine wave: how AC is drawn against time</span>' +
        swatch(t.faint, 'Audio: what you can hear') +
        swatch(t.ink, 'Radio frequencies') + cursorSwatch(t.mark, 'Your frequency');
      const af = fr >= 20 && fr <= 15e3;
      const band = fr >= 3e6 && fr < 30e6 ? 'HF' : fr >= 30e6 && fr < 300e6 ? 'VHF'
                 : fr >= 300e6 && fr <= 3e9 ? 'UHF' : fr >= 30e3 && fr < 3e6 ? 'RF below HF'
                 : fr > 3e9 ? 'beyond UHF' : fr > 15e3 ? 'below the 30 kHz figure; radio can start lower' : 'not a radio band';
      const kind = af ? 'AF, audio frequency' : fr >= 30e3 ? 'RF, radio frequency'
                 : fr < 20 ? 'too low to hear' : 'too high to hear; radio can start below 30 kHz';
      p.readouts.innerHTML = ro([
        ['Frequency', eng(fr, 'Hz', 4), true],
        ['AF or RF', kind],
        ['In the hearing range?', af ? 'yes' : 'no'],
        ['Speech on the radio?', fr >= 300 && fr <= 3e3 ? 'yes, 300 Hz to 3 kHz' : 'no'],
        ['Radio band', band]
      ]);
      return {};
    },

    /* 2E2 Intermediate: two signals on a scope, with period and phase marked. */
    scope(ctx) {
      const { p, d, t, Plot, swatch, ro } = ctx;
      const f = d.fw, T = 1 / f, A = d.amp, phi = d.ph, sq = p.topology === 'square';
      const span = 2 * T, w = TWO_PI * f, sh = phi / 360 * T;
      const a = x => sq ? (Math.sin(w * x) >= 0 ? A : -A) : A * Math.sin(w * x);
      const b = x => A * Math.sin(w * x - phi * Math.PI / 180);
      let ptsA = curve(span, a, 800);
      if (sq) {                                  // vertical edges, exactly where they fall
        ptsA = [];
        for (let k = 0; k < 4; k++) {
          const s = k % 2 ? -A : A;
          ptsA.push({ x: k * T / 2, y: s }, { x: (k + 1) * T / 2, y: s });
        }
      }
      const spec = {
        xRange: [0, span], xFmt: x => eng(x, 's', 3), tokens: t,
        left: Object.assign(symAxis(1.5 * A), { fmt: y => eng(y, 'V', 2) }),
        traces: [{ pts: ptsA, colour: t.v, axis: 'left', width: 2.8 }],
        marks: [{ x: T, colour: t.v }, { x: T + sh, colour: t.v }],
        cursor: null
      };
      Plot.draw(p.graph, spec);
      // B is a voltage too, so it is the same blue, told apart by its dashes
      overlay(p.graph, spec, curve(span, b, 800), t.v, 2, [8, 5]);
      // the period across the top, the phase shift across the bottom
      const c = p.graph.getContext('2d');
      const xs = v => Plot.xAt(p.graph, spec.xRange, v), ys = v => Plot.leftY(p.graph, spec, v);
      const yTop = ys(1.28 * A), yBot = ys(-1.28 * A);
      arrow(c, xs(0), yTop, xs(T), t.mark, true);
      label(c, t, 'T = ' + eng(T, 's', 3), (xs(0) + xs(T)) / 2, yTop - 5, t.mark, 'center', 'bottom');
      if (phi > 0.5 && phi < 359.5) {
        arrow(c, xs(T), yBot, xs(T + sh), t.mark, false);
        const mid = xs(T + sh / 2), txt = trim(phi, 3) + '°';
        label(c, t, txt, mid, yBot + 4, t.mark, 'center', 'top');
      }
      p.legend.innerHTML = swatch(t.v, sq ? 'Signal A, a square wave' : 'Signal A') +
        dashSwatch(t.v, 'Signal B, the same frequency') +
        '<span>Thin dotted lines: where each begins its second cycle</span>';
      p.readouts.innerHTML = ro([
        ['Frequency', eng(f, 'Hz', 4)],
        ['Periodic time T', eng(T, 's', 4), true],
        ['Amplitude', Q('v', eng(A, 'V', 3) + ' peak')],
        ['Peak to peak', Q('v', eng(2 * A, 'V', 3))],
        ['Phase difference', phaseWords(phi)]
      ]);
      return {};
    },

    /*
     * 2E3. Intermediate: a heater on AC, the DC that heats it the same, and a
     * capacitor or inductor in its place. Full: R, L or C alone, and R with C
     * in series, with the voltage and current plotted together.
     */
    acr(ctx) {
      const { p, d, t, level, Plot, swatch, ro } = ctx;
      const full = level === 'full';
      // one toggle serves both levels; each level offers its own choices
      const allowed = full ? ['R', 'L', 'C', 'RC'] : ['R', 'dc', 'L', 'C'];
      if (allowed.indexOf(p.topology) < 0) p.topology = 'R';
      p.sec.querySelectorAll('.toggle button').forEach(b => { b.hidden = allowed.indexOf(b.dataset.k) < 0; });
      const dev = p.topology;
      return full ? BENCH.panels.acrFull(ctx, dev) : BENCH.panels.acrInt(ctx, dev);
    },

    acrInt(ctx, dev) {
      const { p, d, t, Plot, swatch, ro } = ctx;
      const f = 50, T = 1 / f, w = TWO_PI * f, Vp = d.Vp, R = d.Rh;
      const Ip = Vp / R, Vr = Vp / SQRT2, Ppk = Vp * Ip, span = 2 * T;
      p.fAnim = f;
      const reactive = dev === 'L' || dev === 'C';
      // in the L and C views the same slider sets the reactance, and is named for it
      p.sec.querySelectorAll('.ctrl[data-ctrl="Rh"] .ctrl-desc').forEach(el => {
        el.textContent = reactive ? 'Sets the reactance, equal to the heater’s R'
                                  : BENCH.controls.find(c => c.id === 'Rh').desc;
      });
      p.sec.querySelectorAll('.ctrl[data-ctrl="Rh"] .ctrl-name').forEach(el => {
        el.textContent = reactive ? 'X' : BENCH.controls.find(c => c.id === 'Rh').label;
      });
      const sgn = dev === 'C' ? 1 : -1;          // current leads in C, lags in L
      const v = x => dev === 'dc' ? Vr : Vp * Math.sin(w * x);
      const i = x => dev === 'dc' ? Vr / R : reactive ? Ip * Math.sin(w * x + sgn * Math.PI / 2) : Ip * Math.sin(w * x);
      const top = {
        band: [0, 0.44], hideX: true,
        xRange: [0, span], xFmt: x => eng(x, 's', 2), tokens: t,
        left: Object.assign(symAxis(1.15 * Vp), { fmt: y => eng(y, 'V', 2) }),
        // current drawn at about 70% of the voltage's height, so neither hides the other
        right: Object.assign(symAxis(1.6 * Ip), { fmt: y => eng(y, 'A', 2) }),
        // the AC a DC supply replaces is a voltage too: the same blue, paler and thinner
        traces: (dev === 'dc' ? [{ pts: curve(span, x => Vp * Math.sin(w * x)), colour: tint(t.v, t.surface, PALE), axis: 'left', width: 1.4 }] : [])
          .concat([{ pts: curve(span, v), colour: t.v, axis: 'left', width: 2.6 },
                   { pts: curve(span, i), colour: t.i, axis: 'right', width: 1.8 }]),
        cursor: null
      };
      Plot.draw(p.graph, top);
      const pmin = reactive ? -0.6 * Ppk : 0, pmax = reactive ? 0.6 * Ppk : 1.1 * Ppk;
      const pw = x => v(x) * i(x);
      const avg = reactive ? 0 : Ppk / 2;
      const low = {
        append: true, band: [0.56, 1],
        xRange: [0, span], xFmt: x => eng(x, 's', 2), tokens: t,
        left: Object.assign(reactive ? symAxis(-pmin) : zeroAxis(pmax), { fmt: y => eng(y, 'W', 2) }),
        traces: [{ pts: curve(span, pw), colour: t.p, fill: dev === 'R' || dev === 'dc' ? t.pFill : null, axis: 'left', width: 2.4 }],
        cursor: null
      };
      Plot.draw(p.graph, low);
      // the average is a power as well: the same red, dashed
      overlay(p.graph, low, [{ x: 0, y: avg }, { x: span, y: avg }], t.p, 1.6, [7, 5]);
      p.legend.innerHTML = swatch(t.v, 'Voltage, top left scale') + swatch(t.i, 'Current, top right scale') +
        swatch(t.p, 'Power, lower plot') + dashSwatch(t.p, 'Average power') +
        (dev === 'dc' ? swatch(tint(t.v, t.surface, PALE), 'The AC voltage it replaces') : '');
      const name = { R: 'R1', dc: 'R1', C: 'C1', L: 'L1' }[dev];
      p._labels = { V1: eng(Vp, 'V', 3), VB: eng(0.707 * Vp, 'V', 3), R1: eng(R, 'Ω', 3),
                    C1: 'X = ' + eng(R, 'Ω', 3), L1: 'X = ' + eng(R, 'Ω', 3) };
      const layout = BENCH.lay.single(name[0], dev === 'dc' ? 'B' : 'V');
      if (dev === 'R') {
        p.readouts.innerHTML = ro([
          ['Peak voltage', Q('v', eng(Vp, 'V', 4))],
          ['RMS, 0.707 × peak', Q('v', eng(0.707 * Vp, 'V', 4)), true],
          ['RMS current', Q('i-ink', eng(0.707 * Vp / R, 'A', 4))],
          ['Average power', Q('p', eng(0.707 * Vp * 0.707 * Vp / R, 'W', 4))],
          ['Peak power', Q('p', eng(Ppk, 'W', 4) + ', twice the average')]
        ]);
        return { layout, circuit: M.parseNetlist(`V1 a 0 ${Vp}\nR1 a 0 ${R}`) };
      }
      if (dev === 'dc') {
        p.readouts.innerHTML = ro([
          ['DC supply, equal to the RMS', Q('v', eng(0.707 * Vp, 'V', 4)), true],
          ['Current', Q('i-ink', eng(0.707 * Vp / R, 'A', 4))],
          ['Power, steady', Q('p', eng(0.707 * Vp * 0.707 * Vp / R, 'W', 4))],
          ['Heats the same as', Q('v', eng(Vp, 'V', 3) + ' peak AC')]
        ]);
        return { layout, flow: { mode: 'dc', currents: { R1: Vr / R } } };
      }
      p.readouts.innerHTML = ro([
        ['Reactance, set equal to R', Q(dev === 'C' ? 'c' : 'l', eng(R, 'Ω', 4))],
        ['Peak current', Q('i-ink', eng(Ip, 'A', 4))],
        ['Voltage and current', '90° apart', true],
        ['Average power', Q('p', '0 W') + ': stored, then given back']
      ]);
      const part = dev === 'C' ? `C1 a 0 ${1 / (w * R)}` : `L1 a 0 ${R / w}`;
      return { layout, circuit: M.parseNetlist(`V1 a 0 ${Vp}\n${part}`) };
    },

    acrFull(ctx, dev) {
      const { p, d, t, Plot, swatch, ro } = ctx;
      const f = d.f, T = 1 / f, w = TWO_PI * f, V = d.V, span = 2 * T;
      p.fAnim = f;
      const XL = d.XL, XC = d.XC;
      // R plays no part beside a lone L or C, nor L in the R and C circuit
      if (dev === 'L' || dev === 'C') idle(p, ['R']);
      if (dev === 'RC') idle(p, ['L']);
      p._labels = { V1: eng(V, 'V', 3), R1: eng(d.R, 'Ω', 3), L1: eng(d.L, 'H', 3), C1: eng(d.C, 'F', 3) };
      const c2 = p.graph.getContext('2d');
      if (dev === 'RC') {
        const net = `V1 a 0 ${V}\nR1 a b ${d.R}\nC1 b 0 ${d.C}`;
        const { ckt, sol } = solve(net, f);
        const I = M.currentThrough(sol, 'R1');
        const VRp = M.mul(I, M.cx(d.R, 0)), VCp = M.nodeV(sol, 'b');
        const pk = SQRT2 * V;
        const tr = ph => x => SQRT2 * M.abs(ph) * Math.sin(w * x + M.arg(ph));
        // V_R peaks where wt + arg = pi/2; take the one in the second cycle
        const peakAt = ph => { let x = (Math.PI / 2 - M.arg(ph)) / w; while (x < T) x += T; while (x >= 2 * T) x -= T; return x; };
        const xR = peakAt(VRp), xC = peakAt(VCp);
        const spec = {
          xRange: [0, span], xFmt: x => eng(x, 's', 3), tokens: t,
          left: Object.assign(symAxis(1.45 * pk), { fmt: y => eng(y, 'V', 2) }),
          // all three are voltages: the supply pale and thin, V_C solid, V_R dashed
          traces: [{ pts: curve(span, x => pk * Math.sin(w * x)), colour: tint(t.v, t.surface, PALE), axis: 'left', width: 1.4 },
                   { pts: curve(span, tr(VCp)), colour: t.v, axis: 'left', width: 2.6 }],
          marks: [{ x: xR, colour: t.v }, { x: xC, colour: t.v }],
          cursor: null
        };
        Plot.draw(p.graph, spec);
        overlay(p.graph, spec, curve(span, tr(VRp)), t.v, 2.2, [8, 5]);
        const xs = v => Plot.xAt(p.graph, spec.xRange, v), y = Plot.leftY(p.graph, spec, 1.3 * pk);
        arrow(c2, xs(xR), y, xs(xC), t.mark, false);
        label(c2, t, 'V across R peaks a quarter cycle before V across C', (xs(xR) + xs(xC)) / 2, y - 6, t.mark, 'center', 'bottom');
        p.legend.innerHTML = dashSwatch(t.v, inline('V<sub>R</sub>, A to B, across R')) +
          swatch(t.v, inline('V<sub>C</sub>, B to C, across C')) + swatch(tint(t.v, t.surface, PALE), 'Supply, A to C');
        p.readouts.innerHTML = ro([
          ['X<sub>C</sub>', Q('c', eng(XC, 'Ω', 4))],
          ['V<sub>R</sub>, A to B', Q('v', eng(M.abs(VRp), 'V', 4) + ' RMS')],
          ['V<sub>C</sub>, B to C', Q('v', eng(M.abs(VCp), 'V', 4) + ' RMS')],
          ['Peaks first', 'V<sub>R</sub>, by 90°', true]
        ]);
        // the values are on the sliders; beside each other above the line they would collide
        p._labels = { V1: eng(V, 'V', 3) };
        return { layout: rcTaps(), circuit: ckt };
      }
      const name = dev + '1', val = dev === 'R' ? d.R : dev === 'L' ? d.L : d.C;
      const net = `V1 a 0 ${V}\n${name} a 0 ${val}`;
      const { ckt, sol } = solve(net, f);
      const I = M.currentThrough(sol, name), Ip = SQRT2 * M.abs(I), pk = SQRT2 * V;
      // voltage peaks at T + T/4; the current's nearest peak shows lead or lag
      const xV = 1.25 * T, xI = xV - M.arg(I) / w;
      const spec = {
        xRange: [0, span], xFmt: x => eng(x, 's', 3), tokens: t,
        left: Object.assign(symAxis(1.45 * pk), { fmt: y => eng(y, 'V', 2) }),
        // current drawn at about 70% of the voltage's height, so neither hides the other
        right: Object.assign(symAxis(2.05 * Ip), { fmt: y => eng(y, 'A', 2) }),
        traces: [{ pts: curve(span, x => pk * Math.sin(w * x)), colour: t.v, axis: 'left', width: 2.6 },
                 { pts: curve(span, x => Ip * Math.sin(w * x + M.arg(I))), colour: t.i, axis: 'right', width: 2 }],
        marks: dev === 'R' ? [{ x: xV, colour: t.mark }] : [{ x: xV, colour: t.v }, { x: xI, colour: t.i }],
        cursor: null
      };
      Plot.draw(p.graph, spec);
      const xs = v => Plot.xAt(p.graph, spec.xRange, v), y = Plot.leftY(p.graph, spec, 1.3 * pk);
      const words = dev === 'R' ? 'voltage and current peak together'
                  : dev === 'L' ? 'current peaks ¼ cycle after the voltage: it lags'
                  : 'current peaks ¼ cycle before the voltage: it leads';
      if (dev !== 'R') arrow(c2, xs(xV), y, xs(xI), t.mark, false);
      // kept between the two scales, so on a phone it does not run over the current's labels
      label(c2, t, words, within(c2, p.graph, words, dev === 'R' ? xs(xV) : (xs(xV) + xs(xI)) / 2), y - 6, t.mark, 'center', 'bottom');
      const what = { R: 'the resistor', L: 'the inductor', C: 'the capacitor' }[dev];
      p.legend.innerHTML = swatch(t.v, 'Voltage across ' + what + ', left scale') +
        swatch(t.i, 'Current through it, right scale');
      const rows = [];
      if (dev === 'R') rows.push(['Resistance', Q('r', eng(d.R, 'Ω', 4))], ['Current', Q('i-ink', eng(M.abs(I), 'A', 4) + ' RMS')],
                                 ['Voltage and current', 'in phase', true]);
      if (dev === 'L') rows.push(['Reactance X<sub>L</sub>', Q('l', eng(XL, 'Ω', 4)), true], ['Current', Q('i-ink', eng(M.abs(I), 'A', 4) + ' RMS')],
                                 ['Phase of the current', 'lags the voltage by 90°']);
      if (dev === 'C') rows.push(['Reactance X<sub>C</sub>', Q('c', eng(XC, 'Ω', 4)), true], ['Current', Q('i-ink', eng(M.abs(I), 'A', 4) + ' RMS')],
                                 ['Phase of the current', 'leads the voltage by 90°']);
      if (dev !== 'L') rows.push(['X<sub>L</sub> of the L slider', Q('l', eng(XL, 'Ω', 4))]);
      if (dev !== 'C') rows.push(['X<sub>C</sub> of the C slider', Q('c', eng(XC, 'Ω', 4))]);
      p.readouts.innerHTML = ro(rows);
      return { layout: BENCH.lay.single(dev, 'V'), circuit: ckt };
    },

    /* 2E4 and 2E5 Intermediate: reactance as volts over amps, and its graph. */
    xcurve(ctx) {
      const { p, d, t, Plot, swatch, ro } = ctx;
      const cap = p.item.code === '2E4', f = d.f, V = d.V;
      p.fAnim = f;
      const X = cap ? d.XC : d.XL, I = V / X;
      const Xat = g => cap ? 1 / (TWO_PI * g * d.C) : TWO_PI * g * d.L;
      const fmax = 3 * f, ymax = zeroAxis(3.2 * X).max;
      const pts = [];
      for (let k = 1; k <= 400; k++) {
        const g = fmax * k / 400, y = Xat(g);
        if (y <= ymax * 1.02) pts.push({ x: g, y });
      }
      if (cap) pts.unshift({ x: 1 / (TWO_PI * ymax * 1.02 * d.C), y: ymax * 1.02 });
      else pts.unshift({ x: 0, y: 0 });
      Plot.draw(p.graph, {
        xRange: [0, fmax], xFmt: v => eng(v, 'Hz', 3), tokens: t,
        left: { min: 0, max: ymax, fmt: v => eng(v, 'Ω', 2) },
        traces: [{ pts, colour: cap ? t.c : t.l, axis: 'left', width: 2.6 }],
        marks: [{ x: 2 * f, colour: t.mark }],
        cursor: { x: f, colour: t.mark, dot: { y: X, axis: 'left' }, label: eng(X, 'Ω', 3) }
      });
      p.legend.innerHTML = swatch(cap ? t.c : t.l, inline(cap ? 'X<sub>C</sub>, reactance of the capacitor, against frequency'
                                                          : 'X<sub>L</sub>, reactance of the inductor, against frequency')) +
        cursorSwatch(t.mark, 'Your frequency') + dashSwatch(t.mark, 'Twice your frequency');
      p.readouts.innerHTML = ro([
        ['Supply', Q('v', eng(V, 'V', 3) + ' RMS')],
        ['Meter reads', Q('i-ink', eng(I, 'A', 4) + ' RMS')],
        ['Reactance, V&nbsp;÷&nbsp;I', Q(cap ? 'c' : 'l', eng(X, 'Ω', 4)), true],
        ['At twice the frequency', Q(cap ? 'c' : 'l', eng(Xat(2 * f), 'Ω', 4)) + (cap ? ', half' : ', double')]
      ]);
      const kind = cap ? 'C' : 'L';
      // the meter's reading is in the readouts: a value under its name would sit on the dial
      p._labels = { V1: eng(V, 'V', 3), C1: eng(d.C, 'F', 3), L1: eng(d.L, 'H', 3) };
      const net = `V1 a 0 ${V}\nRM a b 0.001\n${kind}1 b 0 ${cap ? d.C : d.L}`;
      return { layout: BENCH.lay.meter(kind), circuit: M.parseNetlist(net) };
    },

    /*
     * 2E4 and 2E5 Full: a line carrying DC or audio with AC or RF on it. Solved
     * once at 0 Hz (or the audio frequency) and once at the signal frequency,
     * then added: the two parts do not affect each other in a linear circuit.
     */
    line(ctx) {
      const { p, d, t, Plot, swatch, ro } = ctx;
      const mode = p.topology, fs = d.fs;
      const cap = mode === 'couple' || mode === 'decouple';
      const part = cap ? d.Cc : d.Lc;
      const dcV = mode === 'couple' ? 6 : 12;
      const lo = mode === 'mic' ? { f: MIC_AF, src: [0.01, 0] } : { f: 0, src: [dcV, 0] };
      const hiAmp = mode === 'mic' ? 0.01 : 1;
      const netOf = (a, b) => NET[mode](part, a, b);
      const sLo = solve(netOf(lo.src[0], lo.src[1]), lo.f);
      const sHi = solve(netOf(0, hiAmp), fs);
      const before = mode === 'couple' ? 'b' : 'a';
      const after = { couple: 'c', decouple: 'r', feed: 'o', mic: 'o' }[mode];
      const lb = M.nodeV(sLo.sol, before), la = M.nodeV(sLo.sol, after);
      const hb = M.nodeV(sHi.sol, before), ha = M.nodeV(sHi.sol, after);
      const wHi = TWO_PI * fs;
      // both lines are voltages: before the part the same blue, fainter
      const before_ = tint(t.v, t.surface, PALE);
      let traces, left, span;
      if (mode === 'mic') {
        // the RF is far too fast to draw against speech, so it is shown as the
        // band it fills either side of the speech waveform
        span = 2 / MIC_AF;
        const wLo = TWO_PI * MIC_AF;
        const sp = ph => x => M.abs(ph) * Math.sin(wLo * x + M.arg(ph));
        const env = (ph, rf, s) => x => sp(ph)(x) + s * M.abs(rf);
        const top = 0.01 + hiAmp;
        left = Object.assign(symAxis(1.3 * top), { fmt: y => eng(y, 'V', 2) });
        traces = [
          { pts: curve(span, env(lb, hb, 1)), colour: before_, axis: 'left', width: 1.6 },
          { pts: curve(span, env(lb, hb, -1)), colour: before_, axis: 'left', width: 1.6 },
          { pts: curve(span, env(la, ha, 1)), colour: t.v, axis: 'left', width: 2.2 },
          { pts: curve(span, env(la, ha, -1)), colour: t.v, axis: 'left', width: 2.2 }
        ];
      } else {
        span = 3 / fs;
        const wave = (dcv, ph) => x => dcv.re + M.abs(ph) * Math.sin(wHi * x + M.arg(ph));
        const vals = [lb.re + M.abs(hb), lb.re - M.abs(hb), la.re + M.abs(ha), la.re - M.abs(ha)];
        const top = Math.max(...vals), bot = Math.min(0, ...vals);
        left = Object.assign(spanAxis(bot < 0 ? bot - 0.15 * (top - bot) : 0, top + 0.15 * (top - bot)),
                             { fmt: y => eng(y, 'V', 2) });
        traces = [{ pts: curve(span, wave(lb, hb)), colour: before_, axis: 'left', width: 1.8 },
                  { pts: curve(span, wave(la, ha)), colour: t.v, axis: 'left', width: 2.6 }];
      }
      Plot.draw(p.graph, { xRange: [0, span], xFmt: x => eng(x, 's', 2), tokens: t, left, traces, cursor: null });
      const where = { couple: ['At the stage’s output, before C', 'At the next stage’s input, after C'],
                      decouple: ['On the supply line, before the feed resistor', 'At the load, after decoupling'],
                      feed: ['On the line, before the choke', 'At the load, after the choke'],
                      mic: ['Before the coil: speech, with the RF band either side', 'After the coil'] }[mode];
      p.legend.innerHTML = swatch(before_, where[0]) + swatch(t.v, where[1]) +
        (mode === 'decouple' ? '<span>Moving charge: the RF part only. The DC also flows, through the feed resistor and the load</span>'
         : mode === 'mic' ? '<span>Moving charge: the speech only. The RF the coil lets through is left out</span>' : '');
      const X = cap ? d.XCs : d.XLs, Xn = cap ? 'X<sub>C</sub>' : 'X<sub>L</sub>', xq = cap ? 'c' : 'l';
      const rows = {
        couple: [['DC before C', Q('v', eng(lb.re, 'V', 3))], ['DC after C', Q('v', eng(Math.abs(la.re) < 1e-9 ? 0 : la.re, 'V', 3)), true],
                 ['Signal before', Q('v', eng(M.abs(hb), 'V', 3) + ' peak')], ['Signal after', Q('v', eng(M.abs(ha), 'V', 3) + ' peak')],
                 [Xn + ' at the signal frequency', Q(xq, eng(X, 'Ω', 3))]],
        decouple: [['DC at the load', Q('v', eng(la.re, 'V', 4))], ['RF before', Q('v', eng(M.abs(hb), 'V', 3) + ' peak')],
                   ['RF at the load', Q('v', eng(M.abs(ha), 'V', 3) + ' peak'), true],
                   ['Without C it would be', Q('v', eng(1000 / 1100, 'V', 3) + ' peak')],
                   [Xn + ' at the signal frequency', Q(xq, eng(X, 'Ω', 3))]],
        feed: [['DC at the load', Q('v', eng(la.re, 'V', 4))], ['RF before', Q('v', eng(M.abs(hb), 'V', 3) + ' peak')],
               ['RF at the load', Q('v', eng(M.abs(ha), 'V', 3) + ' peak'), true],
               [Xn + ' at the signal frequency', Q(xq, eng(X, 'Ω', 3))], [Xn + ' at DC', Q(xq, '0 Ω')]],
        mic: [['Speech after the coil', Q('v', eng(M.abs(la), 'V', 3) + ' peak')], ['RF before', Q('v', eng(M.abs(hb), 'V', 3) + ' peak')],
              ['RF after the coil', Q('v', eng(M.abs(ha), 'V', 3) + ' peak'), true],
              [Xn + ' at the signal frequency', Q(xq, eng(X, 'Ω', 3))], [Xn + ' at the speech frequency', Q(xq, eng(d.XLa, 'Ω', 3))]]
      }[mode];
      p.readouts.innerHTML = ro(rows);
      p._labels = { VB: dcV + ' V', V1: (mode === 'mic' ? '10 mV' : '1 V'), VA: '10 mV',
                    RS: '1 kΩ', C1: mode === 'couple' ? '' : eng(d.Cc, 'F', 3), RIN: '10 kΩ', RF: '100 Ω', RL: '1 kΩ',
                    L1: eng(d.Lc, 'H', 3), RLD: mode === 'mic' ? '1 kΩ' : '100 Ω' };
      const layout = mode === 'couple' ? coupleLayout() : mode === 'decouple' ? decoupleLayout() : chokeLayout(mode === 'mic');
      if (mode === 'feed') {
        // what the choke is for: the DC current flows straight through it
        const I = M.currentThrough(sLo.sol, 'RLD').re;
        return { layout, flow: { mode: 'dc', currents: { L1: I, RLD: I },
                 note: 'the DC through the choke: it drifts one way, unhindered' } };
      }
      if (mode === 'mic') { p.fAnim = MIC_AF; return { layout, circuit: sLo.ckt }; }
      p.fAnim = fs;
      return { layout, circuit: sHi.ckt };
    },

    /*
     * 2E6. Intermediate: where the energy goes in a series CR or LR circuit.
     * Full: the impedance triangle, drawn to scale, with the voltages on it.
     */
    series(ctx) {
      const { p, d, t, level, Plot, swatch, ro } = ctx;
      const lr = p.topology === 'LR', f = d.f, V = d.V, w = TWO_PI * f;
      p.fAnim = f;
      // the part that is not in the circuit has no say in it
      idle(p, [lr ? 'C' : 'L']);
      const X = lr ? d.XL : d.XC, xn = lr ? 'L1' : 'C1';
      const net = `V1 a 0 ${V}\nR1 a b ${d.R}\n${xn} b 0 ${lr ? d.L : d.C}`;
      const { ckt, sol } = solve(net, f);
      const I = M.currentThrough(sol, 'R1'), Z = Math.hypot(d.R, X), Irms = M.abs(I);
      const VX = M.nodeV(sol, 'b');
      p._labels = { V1: eng(V, 'V', 3), R1: eng(d.R, 'Ω', 3), C1: eng(d.C, 'F', 3), L1: eng(d.L, 'H', 3) };
      const layout = BENCH.lay.series(lr ? 'LR' : 'CR');
      if (level !== 'full') {
        const span = 2 / f, Ip = SQRT2 * Irms;
        const i = x => Ip * Math.sin(w * x + M.arg(I));
        const vx = x => SQRT2 * M.abs(VX) * Math.sin(w * x + M.arg(VX));
        const pR = x => i(x) * i(x) * d.R, pX = x => vx(x) * i(x);
        const top = Math.max(Ip * Ip * d.R, SQRT2 * M.abs(VX) * Ip / 2) * 1.15;
        const spec = {
          xRange: [0, span], xFmt: x => eng(x, 's', 2), tokens: t,
          left: { min: -top, max: top, fmt: y => eng(y, 'W', 2) },
          traces: [{ pts: curve(span, x => 0), colour: t.grid, axis: 'left', width: 1 },
                   { pts: curve(span, pR), colour: t.p, axis: 'left', width: 2.6 }],
          cursor: null
        };
        Plot.draw(p.graph, spec);
        // both are powers: the same red, the reactance's dashed
        overlay(p.graph, spec, curve(span, pX), t.p, 2.2, [8, 5]);
        p.legend.innerHTML = swatch(t.p, 'Power into R: always into it, as heat') +
          dashSwatch(t.p, lr ? 'Power into L: in while its field builds, out as it collapses'
                             : 'Power into C: in while it charges, out as it discharges');
        p.readouts.innerHTML = ro([
          ['Supply', Q('v', eng(V, 'V', 3) + ' RMS')],
          ['Current', Q('i-ink', eng(Irms, 'A', 4) + ' RMS')],
          ['Impedance, V&nbsp;÷&nbsp;I', Q('z', eng(V / Irms, 'Ω', 4)), true],
          ['Heat in R', Q('p', eng(Irms * Irms * d.R, 'W', 4))],
          ['Kept by ' + (lr ? 'L' : 'C') + ' on average', Q('p', '0 W') + ': it all comes back']
        ]);
        return { layout, circuit: ckt };
      }
      // Full: the triangle on the graph canvas
      const { c, W, H } = prep(p.graph);
      const VR = Irms * d.R, VXr = Irms * X;
      // room for the Z label on the left of the long side and the X labels on the right
      c.font = '700 15px "Saira Semi Condensed", sans-serif';
      const zLead = 'Z = ' + eng(Z, 'Ω', 3), zTail = 'supply ' + eng(V, 'V', 3);
      const zText = zLead + ', ' + zTail;
      const xText = 'V across ' + (lr ? 'L' : 'C') + ' = ' + eng(VXr, 'V', 3);
      const padL = Math.min(W * 0.4, c.measureText(zText).width + 40), padR = c.measureText(xText).width + 30;
      const padT = lr ? 20 : 34, padB = lr ? 40 : 18;
      const s = Math.min((W - padL - padR) / d.R, (H - padT - padB) / X);
      const a = Math.max(2, d.R * s), b = Math.max(2, X * s);
      // centre the triangle in the space between the labels
      const ox = padL + Math.max(0, (W - padL - padR - a) / 2), oy = lr ? H - padB : padT;
      const cx = ox + a, cy = lr ? oy - b : oy + b;
      c.lineCap = 'round';
      const tx = lr ? t.l : t.c;
      c.lineWidth = 3; c.strokeStyle = t.r;
      c.beginPath(); c.moveTo(ox, oy); c.lineTo(cx, oy); c.stroke();
      c.strokeStyle = tx;
      c.beginPath(); c.moveTo(cx, oy); c.lineTo(cx, cy); c.stroke();
      c.lineWidth = 3.4; c.strokeStyle = t.z;
      c.beginPath(); c.moveTo(ox, oy); c.lineTo(cx, cy); c.stroke();
      // the right angle, and the angle at the origin
      const sq = Math.min(10, a / 2, b / 2);
      c.lineWidth = 1.2; c.strokeStyle = t.faint;
      c.beginPath(); c.moveTo(cx - sq, oy); c.lineTo(cx - sq, oy + (lr ? -sq : sq)); c.lineTo(cx, oy + (lr ? -sq : sq)); c.stroke();
      const ang = Math.atan2(X, d.R), nm = lr ? 'L' : 'C';
      c.beginPath(); c.arc(ox, oy, 26, 0, lr ? -ang : ang, lr); c.stroke();
      const deg = degText(ang * 180 / Math.PI);
      label(c, t, 'φ = ' + deg, ox + 32, oy + (lr ? -8 : 8), t.faint, 'left', lr ? 'bottom' : 'top', '500');
      // R along the base, X up or down the side, Z along the long side
      // each side in its own quantity's colour, and the voltage it stands for in blue
      labelRun(c, t, [['R = ' + eng(d.R, 'Ω', 3), t.r], [', ', t.soft], ['V across R = ' + eng(VR, 'V', 3), t.v]],
               ox + a / 2, oy + (lr ? 22 : -10), 'center', lr ? 'top' : 'bottom');
      label(c, t, 'X = ' + eng(X, 'Ω', 3), cx + 10, (oy + cy) / 2 - 10, tx, 'left', 'middle');
      label(c, t, 'V across ' + nm + ' = ' + eng(VXr, 'V', 3), cx + 10, (oy + cy) / 2 + 10, t.v, 'left', 'middle');
      const mx = (ox + cx) / 2, my = (oy + cy) / 2;
      const nx = -(cy - oy), ny = (cx - ox), nl = Math.hypot(nx, ny) || 1;
      const sgn = lr ? -1 : 1;
      labelRun(c, t, [[zLead, t.z], [', ', t.soft], [zTail, t.v]],
               mx + sgn * 14 * nx / nl - 10, my + sgn * 14 * ny / nl, 'right', 'middle', '700');
      p.legend.innerHTML = swatch(t.r, 'R, resistance') +
        swatch(tx, inline('X<sub>' + nm + '</sub>, reactance')) +
        swatch(t.z, 'Z, impedance') +
        swatch(t.v, 'The voltage each side stands for: across R, across ' + nm + ', and the supply');
      p.readouts.innerHTML = ro([
        ['X<sub>' + nm + '</sub>', Q(lr ? 'l' : 'c', eng(X, 'Ω', 4))],
        ['Impedance Z', Q('z', eng(Z, 'Ω', 4)), true],
        ['Current, V&nbsp;÷&nbsp;Z', Q('i-ink', eng(V / Z, 'A', 4) + ' RMS')],
        ['V<sub>R</sub>', Q('v', eng(VR, 'V', 4))],
        ['V<sub>' + nm + '</sub>', Q('v', eng(VXr, 'V', 4))],
        ['V<sub>R</sub> + V<sub>' + nm + '</sub>', Q('v', eng(VR + VXr, 'V', 4)) + (VR + VXr > 1.005 * V
          ? ', more than the supply' : ', equal to the supply: one voltage is negligible')]
      ]);
      return { layout, circuit: ckt };
    },

    /* 2E7: the frequency and wavelength graph, as in the booklet. */
    lambda(ctx) {
      const { p, d, t, level, swatch, ro } = ctx;
      const { c, W, H } = prep(p.graph);
      const L = 74, R = W - 20, T = 18, B = H - 40;
      const X = f => L + (R - L) * (Math.log10(f / 1e6)) / 3;            // 1 to 1000 MHz
      const Y = lam => T + (B - T) * (Math.log10(300) - Math.log10(lam)) / 3; // 300 m down to 0.3 m
      c.font = '500 15px "Saira Semi Condensed", sans-serif';
      c.lineWidth = 1;
      for (let k = 0; k <= 3; k++) {
        const x = Math.round(X(Math.pow(10, k) * 1e6)) + 0.5, y = Math.round(Y(300 / Math.pow(10, k))) + 0.5;
        c.strokeStyle = t.grid;
        c.beginPath(); c.moveTo(x, T); c.lineTo(x, B); c.stroke();
        c.beginPath(); c.moveTo(L, y); c.lineTo(R, y); c.stroke();
        c.fillStyle = t.faint;
        c.textAlign = k === 3 ? 'right' : k === 0 ? 'left' : 'center'; c.textBaseline = 'top';
        c.fillText(['1 MHz', '10 MHz', '100 MHz', '1000 MHz'][k].replace(' ', ' '), k === 3 ? x + 4 : k === 0 ? x - 2 : x, B + 8);
        c.textAlign = 'right'; c.textBaseline = 'middle';
        c.fillText(['300 m', '30 m', '3 m', '0.3 m'][k].replace(' ', ' '), L - 10, y);
      }
      c.strokeStyle = t.ink; c.lineWidth = 2.6;
      c.beginPath(); c.moveTo(X(1e6), Y(300)); c.lineTo(X(1e9), Y(0.3)); c.stroke();
      // a few bands, named by their wavelength
      const bands = [['80 m', 3.6e6], ['40 m', 7.1e6], ['20 m', 14.2e6], ['10 m', 28.5e6],
                     ['6 m', 50.5e6], ['2 m', 145e6], ['70 cm', 433e6]];
      // the line falls to the right, so above-right and below-left are clear of it;
      // on a narrow screen only every other band is named
      const narrow = W < 620;
      bands.forEach(([n, f], i) => {
        const x = X(f), y = Y(C_LIGHT / f);
        c.fillStyle = t.soft;
        c.beginPath(); c.arc(x, y, 3.5, 0, TWO_PI); c.fill();
        if (narrow && i % 2 === 1) return;
        const below = !narrow && i % 2 === 1;
        label(c, t, n, x + (below ? -8 : 8), y + (below ? 14 : -14), t.soft, below ? 'right' : 'left', 'middle', '500');
      });
      // your frequency
      const fl = d.fl, lam = C_LIGHT / fl, xp = X(fl), yp = Y(lam);
      c.strokeStyle = t.mark; c.lineWidth = 1.4; c.setLineDash([4, 3]);
      c.beginPath(); c.moveTo(xp, B); c.lineTo(xp, yp); c.lineTo(L, yp); c.stroke(); c.setLineDash([]);
      c.fillStyle = t.mark; c.beginPath(); c.arc(xp, yp, 5.5, 0, TWO_PI); c.fill();
      // above and to the right of the point, where the falling line is not;
      // near the right edge, below and to the left instead
      const right = xp > W - 230;
      label(c, t, eng(fl, 'Hz', 4) + ' → ' + eng(lam, 'm', 4), xp + (right ? -12 : 12), yp + (right ? 18 : -16),
            t.mark, right ? 'right' : 'left', 'middle', '700');
      p.legend.innerHTML = swatch(t.ink, 'Wavelength against frequency, both scales in tens') +
        cursorSwatch(t.mark, 'Your frequency') + dotSwatch(t.soft, 'Bands, named by wavelength');
      const near = bands.find(([n, f]) => Math.abs(Math.log10(fl / f)) < 0.06);
      const rows = [
        ['Frequency', eng(fl, 'Hz', 4)],
        ['Wavelength', eng(lam, 'm', 4), true],
        ['Nearest band', near ? 'the ' + near[0] + ' band' : 'none named here'],
        ['Double the frequency', 'the wavelength halves, to ' + eng(lam / 2, 'm', 3)]
      ];
      if (level === 'intermediate') rows.push(['The shortcut gives', eng(300 / (fl / 1e6), 'm', 4)]);
      p.readouts.innerHTML = ro(rows);
      return {};
    },

    /*
     * 2E8: the current along a wire, at one instant, moving as the cycle goes
     * on. Drawn by its own loop while the charge is set moving, because the
     * pattern along the wire is what matters and the circuit engine draws one
     * current per wire.
     */
    wire(ctx) {
      const { p, d, t, swatch, ro } = ctx;
      const lam = C_LIGHT / d.fl, len = d.lw, k = TWO_PI / lam, kind = p.topology;
      const n = len / lam;
      p._wire = { lam, len, k, kind, n, t };
      const draw = (wt) => {
        const s = p._wire, tk = s.t;
        const { c, W, H } = prep(p.graph);
        const L = 46, R = W - 34, wy = 48, axis = 146, amp = 50;
        const X = x => L + (R - L) * x / s.len;
        // source at the left, and a load or an open end at the right
        c.strokeStyle = tk.wire; c.lineWidth = 1.6;
        c.beginPath(); c.arc(L - 18, wy, 12, 0, TWO_PI); c.stroke();
        c.beginPath();
        for (let i = -6; i <= 6; i++) { const yy = wy - Math.sin(i / 6 * Math.PI) * 4.5; i === -6 ? c.moveTo(L - 18 + i, yy) : c.lineTo(L - 18 + i, yy); }
        c.stroke();
        c.lineWidth = 4; c.strokeStyle = tk.ink;
        c.beginPath(); c.moveTo(L - 6, wy); c.lineTo(R, wy); c.stroke();
        if (s.kind === 'travel') {
          c.lineWidth = 1.6; c.strokeStyle = tk.wire; c.fillStyle = tk.surface;
          c.fillRect(R + 2, wy - 13, 11, 26); c.strokeRect(R + 2, wy - 13, 11, 26);
        } else {
          c.fillStyle = tk.ink; c.beginPath(); c.arc(R, wy, 4, 0, TWO_PI); c.fill();
        }
        label(c, tk, 'source', L - 18, wy + 26, tk.soft, 'center', 'middle', '500');
        label(c, tk, s.kind === 'travel' ? 'matched load' : 'open end', R + 8, wy + 26, tk.soft, 'right', 'middle', '500');
        // arrows: the current at each point at this instant
        const count = s.n > 6 ? 0 : Math.max(8, Math.min(48, Math.round(s.n * 16)));
        for (let j = 0; j < count; j++) {
          const x = s.len * (j + 0.5) / count, val = wireAt(s.kind, s.k, s.len, x, wt).i;
          const room = Math.min(40, 0.8 * (R - L) / count);
          const len2 = room * Math.abs(val);
          if (len2 < 3) continue;
          const cxp = X(x), dir = Math.sign(val);
          c.globalAlpha = 0.4 + 0.6 * Math.abs(val);
          arrow(c, cxp - dir * len2 / 2, wy - 18, cxp + dir * len2 / 2, tk.i, false);
          c.globalAlpha = 1;
        }
        // current and voltage along the wire, below it
        c.strokeStyle = tk.grid; c.lineWidth = 1;
        c.beginPath(); c.moveTo(L, axis + 0.5); c.lineTo(R, axis + 0.5); c.stroke();
        const plot = (fn, colour, width) => {
          c.strokeStyle = colour; c.lineWidth = width; c.beginPath();
          for (let i = 0; i <= 600; i++) {
            const x = s.len * i / 600, y = axis - amp * fn(x);
            i ? c.lineTo(X(x), y) : c.moveTo(X(x), y);
          }
          c.stroke();
        };
        // the envelope: how big the current at each point ever gets, in a
        // fainter orange, dashed
        const envC = tint(tk.i, tk.surface, 0.35);
        c.setLineDash([4, 4]);
        if (s.kind === 'stand') {
          plot(x => Math.abs(Math.sin(s.k * (s.len - x))), envC, 1.4);
          plot(x => -Math.abs(Math.sin(s.k * (s.len - x))), envC, 1.4);
        } else { plot(() => 1, envC, 1.4); plot(() => -1, envC, 1.4); }
        c.setLineDash([]);
        // the voltage on a scale of its own, drawn a little smaller so it never hides the current
        plot(x => 0.7 * wireAt(s.kind, s.k, s.len, x, wt).v, tk.v, 2);
        plot(x => wireAt(s.kind, s.k, s.len, x, wt).i, tk.i, 2.6);
        // a scale of wavelengths underneath
        c.font = '500 15px "Saira Semi Condensed", sans-serif';
        c.fillStyle = tk.faint; c.textBaseline = 'top';
        const step = s.n <= 2 ? 0.25 : s.n <= 6 ? 0.5 : Math.ceil(s.n / 8);
        const names = { 0.25: '¼λ', 0.5: '½λ', 0.75: '¾λ' };
        let last = -1e9;
        for (let m = 0; m <= s.n + 1e-9; m += step) {
          const x = X(m * s.lam);
          if (x - last < 34) continue;
          c.strokeStyle = tk.faint; c.beginPath(); c.moveTo(x, axis + amp + 6); c.lineTo(x, axis + amp + 12); c.stroke();
          const whole = Math.abs(m - Math.round(m)) < 1e-9;
          const txt = m === 0 ? '0' : whole ? (Math.round(m) === 1 ? 'λ' : Math.round(m) + 'λ')
                    : names[m % 1] ? (Math.floor(m) ? Math.floor(m) + ' ' : '') + names[m % 1] : trim(m, 2) + 'λ';
          c.textAlign = 'center'; c.fillText(txt, x, axis + amp + 16);
          last = x;
        }
        if (!count) label(c, tk, 'more than six wavelengths: too many to draw arrows for', (L + R) / 2, wy - 22, tk.soft, 'center', 'bottom', '500');
      };
      p._wireDraw = draw;
      // an eighth of a cycle in, so with the charge held still neither trace is a flat line
      p._wt = p._wt || Math.PI / 4;
      draw(p._wt);
      // keep it moving while the charge is set moving and the panel can be seen
      if (!p._wireLoop) {
        p._wireLoop = true;
        let last = 0;
        const step = (ts) => {
          const btn = document.getElementById('animBtn');
          const moving = btn && btn.getAttribute('aria-pressed') === 'true';
          const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0;
          last = ts;
          if (moving && !p.sec.hidden && p._wireDraw) {
            p._wt += dt * TWO_PI * 0.4;
            p._wireDraw(p._wt);
          }
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }
      p.legend.innerHTML = swatch(t.i, 'Current at each point, at this instant') +
        swatch(t.v, 'Voltage at each point, on its own scale') +
        dashSwatch(tint(t.i, t.surface, 0.35), 'The largest the current at each point reaches');
      // under half a wavelength there is no room for the pattern to repeat: on an
      // open wire it never reverses, and a travelling one reverses at most once
      const varies = n < 0.05 ? 'almost the same all along: the wire is short'
                   : n < 0.5 ? (kind === 'stand' ? 'varies along it, but one way all along: too short to reverse'
                                                 : 'varies along it, reversing at most once: too short for more')
                   : 'varies along it, and reverses every half wavelength';
      p.readouts.innerHTML = ro([
        ['Wavelength', eng(lam, 'm', 4)],
        ['Wire length', eng(len, 'm', 4)],
        ['Length in wavelengths', trim(n, 3), true],
        ['Current at one instant', varies]
      ]);
      return {};
    }
  },

  /* ---- the eight items, in reading order ---- */
  items: [
    {
      code: '2E1',
      levels: ['foundation', 'intermediate'],
      introduces: {
        foundation: ['DC', 'AC', 'cycle', 'frequency', 'hertz'],
        intermediate: ['dielectric']
      },
      panel: 'dcac',
      circuit: 'dc',
      toggle: { label: 'Supply', options: [['dc', 'DC supply'], ['ac', 'AC supply']] },
      controls: { foundation: ['fw'], intermediate: ['fw', 'C1'] },
      presets: [{ label: 'Mains, 50 Hz', values: { fw: 50 } }],
      heading: { foundation: 'Direct current and alternating current',
                 intermediate: 'Why a capacitor passes AC and blocks DC' },
      lead: {
        foundation: 'Start with the difference that everything else on this page builds on: which way the current flows, and whether it keeps changing its mind.',
        intermediate: 'With a capacitor in the circuit, DC stops once the capacitor has charged, but AC keeps flowing.'
      },
      headline: {
        foundation: 'Direct current flows one way. Alternating current keeps changing direction.',
        intermediate: 'A capacitor charges and discharges each way, so it passes AC but blocks DC.'
      },
      formulas: { foundation: [], intermediate: [] },
      workNote: {
        foundation: 'There is nothing to calculate here. Switch between the two supplies and watch the charge in the wires: on DC it drifts steadily one way round, and on AC it moves to and fro on the spot.',
        intermediate: 'There is nothing to calculate yet. Watch the dots at the two plates of the capacitor: they arrive at one plate and leave the other, but none ever crosses the gap between them.'
      },
      explain: {
        foundation: [
          'A battery has a positive end and a negative end that never swap, so the current always flows the same way round the circuit. That is DC, direct current. On the graph it is a flat line: the same size, the same direction, for as long as you like.',
          'The mains is different. Its current flows one way, slows, stops, and flows back the other way, then does it all again. One complete repeat is a cycle, and in each cycle the current reverses twice. That is AC, alternating current.',
          'How many cycles happen in one second is the frequency, measured in hertz. UK mains is 50 Hz, which the exam expects you to know. On the AC supply, move the frequency slider and watch the cycles crowd together or spread out on the graph.'
        ],
        intermediate: [
          'A capacitor is two plates with an insulator between them, so no current can flow through it. Connect it to DC and current flows only while charge piles up on one plate and drains from the other. Once the capacitor is charged to the supply voltage the current stops, and it stays stopped. A capacitor blocks DC.',
          'Connect it to AC and the supply keeps reversing. The capacitor charges one way, discharges, charges the other way and discharges again, over and over. Charge flows back and forth in the wires on both sides all the time, so as far as the rest of the circuit can tell, an alternating current is flowing through it.',
          'Change the frequency and the capacitor’s value and watch the current. A bigger capacitor, or a higher frequency, lets more AC through, which is the subject of 2E4 further down.'
        ]
      },
      highlight: { foundation: [], intermediate: ['C1'] }
    },

    {
      code: '2E2',
      levels: ['foundation', 'intermediate'],
      introduces: {
        foundation: ['sine wave', 'AF', 'RF', 'HF', 'VHF', 'UHF'],
        intermediate: ['amplitude', 'periodic time', 'square wave', 'phase difference']
      },
      panel: { foundation: 'ruler', intermediate: 'scope' },
      noSchematic: { foundation: true, intermediate: true },
      circuit: 'sine',
      toggle: { label: 'Signal A', levels: ['intermediate'],
                options: [['sine', 'Sine wave'], ['square', 'Square wave']] },
      controls: { foundation: ['fr'], intermediate: ['fw', 'amp', 'ph'] },
      presets: [
        { levels: ['foundation'], label: 'Mains, 50 Hz', values: { fr: 50 } },
        { levels: ['foundation'], label: 'Speech, 1 kHz', values: { fr: 1000 } },
        { levels: ['foundation'], label: 'Top of hearing, 15 kHz', values: { fr: 15000 } },
        { levels: ['foundation'], label: '40 m band, 7.1 MHz', values: { fr: 7.1e6 } },
        { levels: ['foundation'], label: '2 m band, 145 MHz', values: { fr: 145e6 } },
        { levels: ['foundation'], label: '70 cm band, 433 MHz', values: { fr: 433e6 } },
        { levels: ['intermediate'], label: 'Mains, 50 Hz', values: { fw: 50 } }
      ],
      heading: { foundation: 'The sine wave, and the frequencies radio uses',
                 intermediate: 'Amplitude, period and phase' },
      lead: {
        foundation: 'AC drawn against time makes a smooth curve with a name of its own: there is one in the key under the scale, and 2E1 draws it live on AC supply. How many times it repeats each second decides whether you hear it, find it in the mains, or tune it in on a radio.',
        intermediate: 'Two numbers pin down a sine wave, and a third compares it with another one. All three can be read straight off a screen.'
      },
      headline: {
        foundation: 'The sine wave as a picture of AC, and the frequencies radio works at.',
        intermediate: 'Reading amplitude and frequency off a sine wave, and how period and frequency relate.'
      },
      formulas: { foundation: [], intermediate: ['T', 'fT', 'phdeg'] },
      workLead: {
        intermediate: 'The period from the frequency, the frequency back from the period, then the phase difference as a share of one period.'
      },
      workNote: {
        foundation: 'Nothing to calculate: these ranges are ones to remember. Try the buttons above the scale, then drag the slider and read where you are.',
        intermediate: 'Both forms of the period formula are printed in the EX308 booklet. Handy pairs: hertz go with seconds, kilohertz with milliseconds and megahertz with microseconds. The phase rule is not printed: a whole cycle is 360°, so a quarter of a cycle is 90° and half a cycle is 180°.'
      },
      explain: {
        foundation: [
          'That smooth curve, in the key under the scale, is a sine wave. It is how an alternating current or voltage is drawn: time runs along the bottom, and the curve rises, falls through zero, goes the other way and comes back.',
          'Sound you can hear runs from about 20 Hz to 15 kHz. Those are audio frequencies, AF. A voice on the radio only needs 300 Hz to 3 kHz, which is why speech is sent in that narrower band.',
          'Radio frequencies, RF, run from below 30 kHz to beyond 3000 MHz. Three bands within that have names to learn: HF is 3 to 30 MHz, VHF 30 to 300 MHz and UHF 300 to 3000 MHz. Each one starts where the last one stops, ten times higher up.',
          'The scale goes up in tens, so each step along it is ten times the frequency of the one before. The mains, at 50 Hz, sits right down at the bottom.'
        ],
        intermediate: [
          'A sine wave is not described until you give two things: its frequency, how often it repeats, and its amplitude, how big it gets. Two waves can share one and differ in the other, so both have to be stated.',
          'The time one cycle takes is the periodic time, T, in seconds. It is one divided by the frequency, and the frequency is one divided by T. At 50 Hz a cycle takes 20 ms; at 1 MHz it takes 1 µs.',
          'Switch signal A to a square wave and recognise the shape: it jumps between two levels rather than changing smoothly.',
          'Now drag the phase. Signal B has the same frequency, but it reaches each point of its cycle later than A. That delay, as a share of one cycle, is the phase difference, given in degrees: 360° is a whole cycle, 90° a quarter, 180° a half. Being 270° behind is the same as being 90° ahead.'
        ]
      },
      highlight: []
    },

    {
      code: '2E3',
      levels: ['intermediate', 'full'],
      introduces: {
        intermediate: ['RMS', 'reactance'],
        full: ['lags', 'leads']
      },
      panel: 'acr',
      circuit: 'R',
      toggle: { label: 'In the circuit',
                options: [['R', 'Resistor'], ['dc', 'DC of equal heating'], ['L', 'Inductor'],
                          ['C', 'Capacitor'], ['RC', 'R and C in series']] },
      controls: { intermediate: ['Vp', 'Rh'], full: ['V', 'f', 'R', 'L', 'C'] },
      heading: { intermediate: 'Resistance, RMS and reactance',
                 full: 'Lead, lag, and reactance any way round' },
      lead: {
        intermediate: 'AC is always changing, so it needs a single figure for its heating effect. RMS is that figure.',
        full: 'In an inductor the current peaks after the voltage; in a capacitor, before it. Learn which way round, then find any one of X, f and L or C from the other two.'
      },
      headline: {
        intermediate: 'In a resistor, voltage and current stay in step. What RMS means and why it is used.',
        full: 'Current lags voltage in an inductor and leads it in a capacitor. Working out reactance.'
      },
      formulas: {
        intermediate: ['rms', 'peak', 'Irms', 'Pav'],
        full: ['XL', 'Lfor', 'fXL', 'XC', 'Cfor', 'fXC', 'Zs']
      },
      workLead: {
        intermediate: d => d.device === 'R' || d.device === 'dc'
          ? 'The RMS from the peak, the peak back from the RMS, then the current and the heat they give.'
          : 'The supply is the same; only the part across it has changed.',
        full: d => d.device === 'R'
          ? 'A resistor has no reactance, so there is nothing to rearrange. Switch to an inductor or a capacitor.'
          : d.device === 'RC' ? 'The capacitor’s reactance, then R and X combined, as item 2E6 explains.'
          : 'The reactance from the booklet formula, then the same formula turned round to give back each of the other two.'
      },
      workNote: {
        intermediate: d => d.device === 'R' || d.device === 'dc'
          ? 'The EX308 booklet prints V<sub>rms</sub> = V<sub>peak</sub> / &radic;2. The syllabus writes it as 0.707 &times; V<sub>peak</sub>, which is the same thing, since 1 / &radic;2 = 0.7071. Exam answers use 0.707. It holds for sine waves only, and a question that gives the peak to peak value needs halving first.'
          : 'In a pure capacitor or inductor there is no heat to work out: the average power is zero. The ratio of RMS voltage to RMS current is still measured in ohms, and that is its reactance.',
        full: 'EX309 prints the two reactance formulas. It does not print them rearranged, and the exam asks for all three directions, so the rearrangements here are the ones to learn. Exam answers are often the nearest preferred value: E12 runs 1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2 in each decade.'
      },
      explain: {
        intermediate: [
          'In a resistor the voltage and the current rise and fall together: they are in phase. The power at each instant is the voltage times the current, and because both change sign together it is never negative. But it is not steady either: it peaks twice in every cycle and drops to zero each time the current reverses.',
          'What warms the heater is the average of that power. RMS is the AC value that heats a resistor exactly as much as the same value of DC would. Switch to DC of equal heating and compare the lower plot: the steady power sits exactly on the average of the AC. For a sine wave the RMS is 0.707 of the peak, so the 325 V peak mains is 230 V RMS. Meters read RMS.',
          'Now switch to a capacitor or an inductor. The current is now a quarter of a cycle away from the voltage, 90°, and the power swings above and below the line equally: energy goes in, then comes back out. Opposition of this kind, with the voltage and current 90° apart and no heat made, is called reactance. Which of the two leads is a Full level question.'
        ],
        full: [
          'In a pure inductor the current lags the voltage by 90°: it peaks a quarter of a cycle later. An inductor opposes any change in its current, so the voltage across it is largest while the current is changing fastest, which is as the current passes through zero.',
          'In a pure capacitor the current leads by 90°. Its current is the rate at which its charge changes, so it is largest while the voltage is changing fastest, and zero at the voltage peaks, when the capacitor is momentarily full. CIVIL is the usual reminder: in C, I comes before V; V comes before I in L.',
          'Switch to R and C in series and the same rule shows across the two parts. The current is common to both, the voltage across R is in step with it, and the voltage across C lags it, so V<sub>R</sub> peaks a quarter of a cycle before V<sub>C</sub>. The points A, B and C are where a meter or a scope would be connected.',
          'For the numbers, put every value in base units before you start: hertz, henrys, farads and ohms. Tens to a few hundred ohms is typical at HF for a few microhenrys or a few hundred picofarads, which is a useful check on the answer.'
        ]
      },
      highlight: { intermediate: [], full: [] }
    },

    {
      code: '2E4',
      levels: ['intermediate', 'full'],
      introduces: {
        intermediate: [],
        full: ['AC coupling', 'decoupling']
      },
      panel: { intermediate: 'xcurve', full: 'line' },
      circuit: 'couple',
      toggle: { label: 'Job', levels: ['full'],
                options: [['couple', 'Coupling'], ['decouple', 'Decoupling']] },
      controls: { intermediate: ['V', 'f', 'C'], full: ['fs', 'Cc'] },
      heading: { intermediate: 'Capacitive reactance falls as the frequency rises',
                 full: 'Coupling and decoupling capacitors' },
      lead: {
        intermediate: 'The capacitor that blocked DC earlier on lets AC through more easily the faster it alternates. The meter shows how much more.',
        full: 'Those two facts, no DC and an easy path for AC, give the capacitor its two everyday jobs.'
      },
      headline: {
        intermediate: 'Capacitive reactance, and why it falls as the frequency climbs.',
        full: 'Using a capacitor to couple a signal through, or to send it to ground.'
      },
      formulas: { intermediate: ['XCr', 'XC'], full: ['XCs'] },
      workLead: {
        intermediate: 'The meter reading gives the reactance as a ratio. The booklet formula gives the same figure from f and C.',
        full: 'The one figure that decides whether the capacitor does its job: its reactance at the signal frequency.'
      },
      workNote: {
        intermediate: 'The EX308 booklet prints X<sub>C</sub> = 1 / 2&pi;fC, though this level asks only for the trend and the graph, not the sum. Double the frequency and the reactance halves, which the last readout shows.',
        full: d => d.device === 'decouple'
          ? 'For decoupling the reactance has to be small compared with the resistance feeding the point, here 100 &Omega;. Then most of the RF current goes to ground through the capacitor and little is left at the load.'
          : 'For coupling the reactance has to be small compared with the input resistance of the next stage, here 10 k&Omega;. Then almost all of the signal arrives, while the DC arrives not at all.'
      },
      explain: {
        intermediate: [
          'The meter reads the RMS current, and the supply is set as an RMS voltage. Divide one by the other and the result, in ohms, is the reactance of the capacitor: the same ratio that gives resistance, measured while the capacitor stores and returns energy in its electric field.',
          'Raise the frequency and the current climbs, because the capacitor is being charged and discharged more often and more charge moves each second. So the reactance falls as the frequency rises. Lower it towards DC and the reactance heads up without limit, which is the capacitor blocking DC again.',
          'This is the graph to recognise: a curve that starts very high, falls steeply, then flattens out towards the axis without ever reaching it. A bigger capacitor moves the whole curve down.'
        ],
        full: [
          'In coupling the capacitor sits in series with the signal path. The stage before it has its output sitting on a DC level, 6 V here, set by its own bias. The next stage has its own bias and must not have that 6 V forced on it. The capacitor blocks the DC and passes the AC, so the signal arrives centred on the next stage’s own level. The capacitors at the input and output of an amplifier stage are coupling capacitors.',
          'In decoupling the capacitor goes from a point to ground. A supply line or a bias point should carry DC only, but RF and AC find their way onto it. The capacitor offers that AC an easy path to ground, so it does not reach the load or travel along the line to other stages. It is also called bypassing, as in an RF bypass capacitor, and a capacitor across an emitter resistor decouples it in the same way.',
          'Drag the frequency down on the decoupling circuit and watch the RF at the load come back as the capacitor’s reactance rises. Each job needs a capacitor big enough for the lowest frequency it has to handle.'
        ]
      },
      highlight: { intermediate: ['C1'], full: ['C1'] }
    },

    {
      code: '2E5',
      levels: ['intermediate', 'full'],
      introduces: {
        intermediate: [],
        full: ['choke']
      },
      panel: { intermediate: 'xcurve', full: 'line' },
      circuit: 'feed',
      toggle: { label: 'Where', levels: ['full'],
                options: [['feed', 'DC feed'], ['mic', 'Microphone lead']] },
      controls: { intermediate: ['V', 'f', 'L'], full: ['fs', 'Lc'] },
      heading: { intermediate: 'Inductive reactance rises with the frequency',
                 full: 'The choke: DC and audio through, RF blocked' },
      lead: {
        intermediate: 'An inductor does the opposite. It takes time to store energy in its magnetic field and to give it back, so the faster the supply alternates the harder it pushes back.',
        full: 'The inductor’s job is the mirror image of the coupling capacitor’s.'
      },
      headline: {
        intermediate: 'Inductive reactance, and why it rises as the frequency climbs.',
        full: 'Using an inductor to block AC while letting DC pass.'
      },
      formulas: { intermediate: ['XLr', 'XL'], full: ['XLs', 'XLa'] },
      workLead: {
        intermediate: 'Reactance from the meter as a ratio, then the same figure from the booklet formula.',
        full: 'The choke’s reactance at the frequency it has to stop, and where it matters, at the frequency it has to pass.'
      },
      workNote: {
        intermediate: 'The EX308 booklet prints X<sub>L</sub> = 2&pi;fL, though this level asks only for the trend and the graph. Double the frequency and the reactance doubles: a straight line through zero.',
        full: d => d.device === 'mic'
          ? micNote(d)
          : 'An ideal inductor has no reactance at all at DC, so the DC current flows freely. A real choke has a little resistance in its wire, which is why its DC rating matters. At RF its reactance should be large compared with the load it is protecting, here 100 &Omega;.'
      },
      explain: {
        intermediate: [
          'An inductor stores energy in its magnetic field, and that takes time: the field has to build up and collapse again in every cycle. The ratio of RMS voltage to RMS current while it does so is its reactance, in ohms, just as for the capacitor.',
          'Raise the frequency and the current falls, because the field has less time to build each half cycle. The reactance rises in direct proportion to the frequency. At DC an ideal inductor has no reactance at all.',
          'The graph to recognise is a straight line through zero, climbing as the frequency rises. Put it beside the capacitor’s falling curve and the two must cross somewhere: that crossing is resonance, the subject of the tuned circuits page.'
        ],
        full: [
          'An inductor used to pass DC while blocking AC is a choke, or at radio frequencies an RF choke. Its reactance is nothing at DC and large at RF, so it lets a supply through while stopping RF from getting past it in either direction. That is DC decoupling, AC blocking, in the syllabus’s words.',
          'The usual places are the supply feed to an RF amplifier, where the choke keeps the stage’s RF off the supply line, and the DC fed up a coaxial cable to a masthead preamplifier. Drag the frequency and the choke and watch how much RF reaches the load.',
          'Switch to the microphone lead. A coil of 0.1 mH in series with a microphone input is almost invisible at speech frequencies, but at HF its reactance is thousands of ohms, so RF picked up on the lead is kept out of the microphone amplifier. The bank question on this is worked below.'
        ]
      },
      highlight: { intermediate: ['L1'], full: ['L1'] }
    },

    {
      code: '2E6',
      levels: ['intermediate', 'full'],
      introduces: {
        intermediate: ['impedance'],
        full: ['impedance triangle']
      },
      panel: 'series',
      circuit: 'CR',
      toggle: { label: 'Circuit', options: [['CR', 'Series CR'], ['LR', 'Series LR']] },
      controls: { intermediate: ['V', 'f', 'R', 'C', 'L'], full: ['V', 'f', 'R', 'C', 'L'] },
      heading: { intermediate: 'Heat and storage in one circuit: impedance',
                 full: 'Impedance and current in series CR and LR' },
      lead: {
        intermediate: 'Put a resistor and a reactance in the same circuit and the supply has two jobs at once: making heat in one and filling and emptying the other.',
        full: 'Resistance and reactance do not simply add. They combine at right angles, and a triangle shows how.'
      },
      headline: {
        intermediate: 'Put resistance and reactance together and the circuit both stores energy and loses it as heat.',
        full: 'Impedance as resistance and reactance combined, and working it out for a series CR or LR circuit.'
      },
      formulas: {
        intermediate: ['Zr'],
        full: ['XC', 'XL', 'Zs', 'Iz', 'VR', 'VX', 'VT', 'phi']
      },
      workLead: {
        intermediate: 'One ratio, from the supply and the current it draws.',
        full: 'Reactance first, then the impedance, the current, the voltage across each part, and the check that those voltages combine back to the supply.'
      },
      workNote: {
        intermediate: 'That is the only sum at this level. Working the impedance out from R and X needs phase and vectors, which the syllabus leaves out at Intermediate, so the bench solves the circuit and reports the ratio.',
        full: 'EX309 prints Z = &radic;(R&sup2; + X&sup2;) and V<sub>T</sub> = &radic;(V<sub>R</sub>&sup2; + V<sub>C</sub>&sup2; (or V<sub>L</sub>&sup2;)). I = V / Z is Ohm’s law, printed as V = IR, with Z in place of R, and V<sub>R</sub> and V<sub>X</sub> come from the same formula. Keep the unrounded figures in the calculator between steps: exam questions chain a transformer, a reactance, an impedance and a current together.'
      },
      explain: {
        intermediate: [
          'Watch the two power traces. The one for the resistor is always above the line: energy goes into it and is turned into heat, and none of it comes back. The one for the capacitor or inductor goes above and below equally: energy goes in, is stored, and is returned to the supply later in the cycle.',
          'The ratio of the supply voltage to the current is the impedance, Z, measured in ohms like resistance and reactance. The name means opposition to both at once: to energy being turned into heat, and to energy being stored and returned.',
          'Drag R and the capacitor or the inductor and watch the impedance change. It is always at least as large as the larger of the two, but it is not their sum, for reasons that belong to the Full syllabus.'
        ],
        full: [
          'In a series circuit the same current flows through R and through X. The voltage across R is in phase with that current, while the voltage across C lags it by 90° (across L it leads by 90°). So the two voltages add at right angles, and so do R and X: they form the two short sides of a right-angled triangle, and Z is the long side.',
          'That is why Z = &radic;(R&sup2; + X&sup2;), and why equal R and X give 1.41 times R, not twice it. Then I = V / Z, V<sub>R</sub> = I &times; R and V<sub>X</sub> = I &times; X. Add V<sub>R</sub> and V<sub>X</sub> arithmetically and you get more than the supply, though a meter across each part reads exactly those two figures.',
          'The defaults are a 3, 4, 5 triangle: 300 &Omega; and 400 &Omega; give 500 &Omega;, and 10 V drives 20 mA. Watch for those numbers in the exam. In CR the reactance is drawn downwards and in LR upwards, which is the usual convention.'
        ]
      },
      highlight: { intermediate: ['R1', 'C1', 'L1'], full: [] }
    },

    {
      code: '2E7',
      levels: ['foundation', 'intermediate'],
      introduces: {
        foundation: ['wavelength'],
        intermediate: []
      },
      panel: 'lambda',
      noSchematic: { foundation: true, intermediate: true },
      circuit: 'chart',
      controls: ['fl'],
      presets: [
        { label: '80 m band, 3.6 MHz', values: { fl: 3.6e6 } },
        { label: '20 m band, 14.2 MHz', values: { fl: 14.2e6 } },
        { label: '2 m band, 145 MHz', values: { fl: 145e6 } },
        { label: '70 cm band, 433 MHz', values: { fl: 433e6 } }
      ],
      heading: { foundation: 'Frequency and wavelength',
                 intermediate: 'From frequency to wavelength and back' },
      lead: {
        foundation: 'A radio wave travels at a fixed speed, so the faster it alternates the less distance it covers in each cycle.',
        intermediate: 'The relationship on the graph is one multiplication, and it is quicker to do than to read off.'
      },
      headline: {
        foundation: 'How frequency and wavelength relate, and the units each one uses.',
        intermediate: 'Using v = f x wavelength to get from one to the other.'
      },
      formulas: { foundation: ['lam'], intermediate: ['lam', 'flam', 'mhz'] },
      workLead: {
        intermediate: 'Wavelength from frequency, frequency back from wavelength, then the shortcut with the frequency in megahertz.'
      },
      workNote: {
        foundation: 'You do not have to calculate this at Foundation. The EX307 booklet gives a graph like this one, with the speed of radio waves, and you read the answer off it: find the frequency along the bottom, go up to the line, then across. Both scales go up in tens, so practise on the real booklet graph.',
        intermediate: 'EX308 prints v = f &times; &lambda; and v = 3 &times; 10<sup>8</sup> m/s; you rearrange it yourself. In free space the speed is 2.998 &times; 10<sup>8</sup> m/s, a little less in air; the exam uses 3 &times; 10<sup>8</sup>, so use that. Write the formula, put the numbers in, and give the unit.'
      },
      explain: {
        foundation: [
          'The wavelength is the distance a radio wave travels during one cycle, and it is measured in metres. Frequency is measured in hertz.',
          'Radio waves always travel at the same speed, so the higher the frequency, the shorter the wavelength. Double the frequency and the wavelength halves. Drag the slider and watch the point slide down the line.',
          'Many bands are named by their wavelength rather than their frequency. The 2 m band is around 145 MHz, and the wavelength there is about 2 m. Try the buttons.'
        ],
        intermediate: [
          'Velocity equals frequency times wavelength, v = f &times; &lambda;. The velocity of radio waves is 300 000 000 metres per second, so &lambda; = v / f and f = v / &lambda;.',
          'With the frequency in megahertz the sum shrinks to 300 / f, giving metres. 7 MHz gives about 43 m, which is why it is called the 40 m band: band names are rough wavelengths.',
          'The other direction is just as common. A half-wave dipole is half a wavelength long, so double its length to get &lambda;, then f = 300 / &lambda;. A dipole 10.6 m long suits 300 / 21.2, about 14.2 MHz, though real dipoles are cut a little shorter than this.'
        ]
      },
      highlight: []
    },

    {
      code: '2E8',
      levels: ['intermediate'],
      introduces: {
        intermediate: []
      },
      panel: 'wire',
      noSchematic: { intermediate: true },
      circuit: 'travel',
      toggle: { label: 'Far end', options: [['travel', 'Matched load, as on a feeder'], ['stand', 'Open end, as on an antenna']] },
      controls: ['fl', 'lw'],
      heading: { intermediate: 'Current along a wire as long as the wave' },
      lead: {
        intermediate: 'Everything so far assumed the current is the same all along a wire. At radio frequencies a wire can be as long as the wave itself, and then it is not.'
      },
      headline: {
        intermediate: 'On a wire as long as the wave it carries, current and voltage differ from one end to the other.'
      },
      formulas: { intermediate: ['lam', 'ratio'] },
      workLead: {
        intermediate: 'The wavelength at your frequency, then how many of them fit along the wire.'
      },
      workNote: {
        intermediate: 'Nothing here is examined as a sum. What matters is the comparison: when the wire is a good fraction of a wavelength or more, the current at one point is not the current at another.'
      },
      explain: {
        intermediate: [
          'At 50 Hz a wavelength is 6000 km, so any wire in a house is a tiny fraction of one, and at any instant the current is the same all along it. At 145 MHz a wavelength is about 2 m, and a feeder or an antenna can easily be that long or longer.',
          'Then, at any instant, the size and the direction of the current vary along the wire like a sine wave: forward here, zero a quarter of a wavelength along, reversed half a wavelength along. The voltage varies in the same way. The arrows show the current at each point at one instant.',
          'On a feeder ending in a matched load the pattern travels along towards the load, as the arrows show. Switch to an open end, as on an antenna, and the pattern stands still instead: the current is always zero at the open end and largest a quarter of a wavelength back, with the voltage the other way round. That case is for interest here, and returns with antennas.',
          'Shorten the wire, or lower the frequency, until it is a small fraction of a wavelength, and the arrows all point the same way and are all the same size. That is the low frequency world everything else on this page lives in.'
        ]
      },
      highlight: []
    }
  ],


  /*
   * Our own explanation of each answer, keyed by the bank's reference number.
   * The question, its options and the marked answer are the RSGB's and ship
   * unadapted. Everything here is ours.
   */
  answers: {
    '2025-Full120': {
      why: 'This is the booklet formula used straight, once the prefixes are turned into powers of ten. A microhenry at sixteen megahertz is about a hundred ohms.',
      working: ['X<sub>L</sub> = 2&pi;fL',
                '= 2&pi; &times; 16 &times; 10<sup>6</sup> &times; 1 &times; 10<sup>&minus;6</sup>',
                '= <span style="color:var(--q-l)">100.5 &Omega;</span>, approximately <span style="color:var(--q-l)">100 &Omega;</span>'],
      source: { eq: ['XL'], from: ['2E3'] },
      seed: { item: '2E3', toggle: 'L', f: 16e6, L: 1e-6 },
      seedNote: 'The bench is set to 1 &micro;H at 16 MHz with the inductor selected.'
    },
    '2025-Full118': {
      why: 'The question gives the reactance and the frequency and asks for the capacitance, so the capacitor formula has to be turned round. Then pick the nearest value offered.',
      working: ['C = 1 / 2&pi;fX<sub>C</sub>',
                '= 1 / (2&pi; &times; 7 &times; 10<sup>6</sup> &times; 190)',
                '= 1.197 &times; 10<sup>&minus;10</sup> F = <span style="color:var(--q-c)">119.7 pF</span>, so <span style="color:var(--q-c)">120 pF</span>'],
      source: { eq: ['Cfor', 'XC'], from: ['2E3'] },
      seed: { item: '2E3', toggle: 'C', f: 7e6, C: 120e-12 },
      seedNote: 'The bench is set to 120 pF at 7 MHz: read X<sub>C</sub>, about 190 &Omega;, back off the readouts.'
    },
    '2025-Full671': {
      why: 'A trap is a tuned circuit, and it resonates where the two reactances are equal. So the capacitor needs a reactance of 200 &Omega; at 14 MHz as well, and the capacitor formula turned round gives its value.',
      working: ['X<sub>C</sub> = X<sub>L</sub> = 200 &Omega; at resonance',
                'C = 1 / 2&pi;fX<sub>C</sub> = 1 / (2&pi; &times; 14 &times; 10<sup>6</sup> &times; 200)',
                '= <span style="color:var(--q-c)">56.8 pF</span>, so approximately <span style="color:var(--q-c)">56 pF</span>'],
      source: { eq: ['Cfor', 'XL'], from: ['2E3'],
                note: 'Resonance itself is on the tuned circuits page' },
      seed: { item: '2E3', toggle: 'C', f: 14e6, L: 2.274e-6, C: 56e-12 },
      seedNote: 'The bench is set to 14 MHz with a coil of 2.274 &micro;H, which is 200 &Omega;, and 56 pF: compare the two reactances in the readouts.'
    },
    '2025-Full124': {
      why: 'In a series circuit the current is the same through both parts. The voltage across the resistor is in step with that current, and the voltage across the capacitor lags it by 90°, so V<sub>R</sub> reaches its peak a quarter of a cycle before V<sub>C</sub>. On the graph V2 peaks first, at the very start, and V1 peaks a quarter of a cycle later.',
      working: ['V<sub>R</sub> is in phase with I; V<sub>C</sub> lags I by 90°',
                'so the wave that peaks first is V<sub>R</sub>: V2, between A and B, across R',
                'so V1 is the PD between points B and C, and V2 between points A and B'],
      source: { from: ['2E3'] },
      seed: { item: '2E3', toggle: 'RC', R: 100, C: 1e-9, f: 1e6 },
      seedNote: 'The bench shows the same circuit with the test points marked. V<sub>C</sub> is drawn larger than V<sub>R</sub>, as V1 is in the question.'
    },
    '2025-Full127': {
      why: 'C1 is in series with the signal path, between the input and the emitter. It lets the AC signal through while stopping any DC on the source from upsetting the transistor’s bias, which is what a coupling capacitor does. C2, from the base to ground, is the one doing a decoupling job.',
      source: { from: ['2E4'] },
      seed: { item: '2E4', toggle: 'couple' },
      seedNote: 'The bench shows a coupling capacitor between two stages: the DC stops at it and the signal goes on.'
    },
    '2025-Full3322': {
      why: 'Capacitor C is in series between the emitter, which sits at a DC voltage set by the bias, and whatever the oscillator feeds. It passes the oscillator’s output and blocks its DC, so the DC does not enter, or upset, the stages that follow.',
      source: { from: ['2E4'] },
      seed: { item: '2E4', toggle: 'couple' },
      seedNote: 'The coupling circuit on the bench does the same job: compare the DC before and after the capacitor.'
    },
    '2025-Full7679': {
      why: 'A 0.1 mH coil in series with the lead is an RF choke. Its reactance at speech frequencies is far too small to affect the audio, and at HF it is thousands of ohms, so it keeps RF picked up on the microphone lead out of the microphone amplifier.',
      working: ['X<sub>L</sub> = 2&pi;fL',
                'at 14 MHz: 2&pi; &times; 14 &times; 10<sup>6</sup> &times; 0.1 &times; 10<sup>&minus;3</sup> = <span style="color:var(--q-l)">8.8 k&Omega;</span>',
                'at 1 kHz: 2&pi; &times; 1000 &times; 0.1 &times; 10<sup>&minus;3</sup> = <span style="color:var(--q-l)">0.63 &Omega;</span>',
                'so it minimises any RF reaching the microphone amplifier'],
      source: { eq: ['XLs', 'XLa'], from: ['2E5'] },
      seed: { item: '2E5', toggle: 'mic', fs: 14e6, Lc: 1e-4 },
      seedNote: 'The bench is set to a 0.1 mH coil with 14 MHz on the microphone lead.'
    },
    '2025-Full3569': {
      why: 'A and B are across the capacitor, so the question wants V<sub>C</sub>. Find the reactance at 50 Hz, then the impedance and the current, and the current times the reactance is the voltage across the capacitor. Notice that it is not 250 V minus the voltage across the resistor: the two voltages add at right angles.',
      working: ['X<sub>C</sub> = 1 / (2&pi; &times; 50 &times; 8 &times; 10<sup>&minus;6</sup>) = <span style="color:var(--q-c)">397.9 &Omega;</span>',
                'Z = &radic;(300&sup2; + 397.9&sup2;) = <span style="color:var(--q-z)">498.3 &Omega;</span>',
                'I = 250 / 498.3 = <span style="color:var(--q-i-ink)">0.5017 A</span>',
                'V<sub>C</sub> = 0.5017 &times; 397.9 = <span style="color:var(--q-v)">199.6 V</span>, approximately <span style="color:var(--q-v)">200 V</span>'],
      source: { eq: ['XC', 'Zs', 'Iz', 'VX'], from: ['2E6'] },
      seed: { item: '2E6', toggle: 'CR', V: 250, R: 300, C: 8e-6, f: 50 },
      seedNote: 'The bench is set to the circuit in the diagram: read V<sub>C</sub> off the triangle.'
    },
    '2025-Full4076': {
      why: 'Find the capacitor’s reactance at that frequency first; it comes out at almost exactly 3000 &Omega;. Then combine it with the 4000 &Omega; at right angles. It is a 3, 4, 5 triangle in thousands of ohms.',
      working: ['X<sub>C</sub> = 1 / (2&pi; &times; 1.965 &times; 10<sup>6</sup> &times; 27 &times; 10<sup>&minus;12</sup>) = <span style="color:var(--q-c)">3000 &Omega;</span>',
                'Z = &radic;(4000&sup2; + 3000&sup2;) = &radic;25 000 000',
                '= <span style="color:var(--q-z)">5000 &Omega;</span>'],
      source: { eq: ['XC', 'Zs'], from: ['2E6'] },
      seed: { item: '2E6', toggle: 'CR', V: 10, R: 4000, C: 27e-12, f: 1.965e6 },
      seedNote: 'The bench is set to 4 k&Omega; and 27 pF at 1.965 MHz.'
    },
    '2025-Full758': {
      why: 'Resistance and reactance combine at right angles, not by adding. With the two equal the impedance is &radic;2 times either one, about 1.41 times, not twice.',
      working: ['Z = &radic;(R&sup2; + X&sup2;)',
                '= &radic;(1000&sup2; + 1000&sup2;) = &radic;2 000 000',
                '= <span style="color:var(--q-z)">1414 &Omega;</span>, approximately <span style="color:var(--q-z)">1400 &Omega;</span>'],
      source: { eq: ['Zs'], from: ['2E6'] },
      seed: { item: '2E6', toggle: 'CR', V: 10, R: 1000, C: 159.2e-12, f: 1e6 },
      seedNote: 'The bench is set to 1 k&Omega; and a capacitor of 1 k&Omega; reactance at 1 MHz.'
    },
    '2025-Full771': {
      why: 'Three steps, chained. The transformer steps the 250 V down by 50, the capacitor’s reactance at 50 Hz combines with the resistor at right angles, and the current is the secondary voltage over that impedance. The same current flows through the resistor, because it is a series circuit.',
      working: ['secondary: 250 / 50 = <span style="color:var(--q-v)">5 V</span>',
                'X<sub>C</sub> = 1 / (2&pi; &times; 50 &times; 8 &times; 10<sup>&minus;6</sup>) = <span style="color:var(--q-c)">397.9 &Omega;</span>',
                'Z = &radic;(300&sup2; + 397.9&sup2;) = <span style="color:var(--q-z)">498.3 &Omega;</span>',
                'I = 5 / 498.3 = <span style="color:var(--q-i-ink)">10.0 mA</span>'],
      source: { eq: ['XC', 'Zs', 'Iz'], from: ['2E6'],
                note: 'The turns ratio rule is on the transformer page' },
      seed: { item: '2E6', toggle: 'CR', V: 5, R: 300, C: 8e-6, f: 50 },
      seedNote: 'The bench is set to the 5 V secondary feeding 300 &Omega; and 8 &micro;F at 50 Hz.'
    }
  },

  outro: {
    foundation: [
      'Three ideas carry forward from here. DC flows one way and AC keeps reversing. Frequency is cycles per second, and the frequencies radio uses run from below 30 kHz to beyond 3000 MHz, with HF, VHF and UHF named within them. And the higher the frequency, the shorter the wavelength.',
      'In the exam the booklet gives you the wavelength graph and the speed of radio waves. The ranges, the mains frequency and the band edges you have to remember.'
    ],
    intermediate: [
      'A resistor turns energy into heat with its voltage and current in step, and RMS is the measure of that heat. A capacitor and an inductor store energy and give it back, with their voltage and current 90° apart, and their reactance moves in opposite directions as the frequency rises.',
      'Those two opposite curves are where the tuned circuits page begins. Before then, practise T = 1 / f and &lambda; = 300 / f in MHz until they need no thought, and remember that 0.707 works for sine waves only.'
    ],
    full: [
      'Four calculations sum up this page: reactance in any direction, impedance at right angles, current from the impedance, and the voltage across each part. Most exam questions chain two or three of them, sometimes behind a transformer.',
      'The booklet prints the reactance formulas, Z = &radic;(R&sup2; + X&sup2;) and the voltage rule, but not the rearrangements for f, L and C. Practise those, and keep coupling, decoupling and the choke straight: a capacitor in series couples, a capacitor to ground decouples, and an inductor in series chokes.'
    ]
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = BENCH;
if (typeof window !== 'undefined') window.BENCH = BENCH;
