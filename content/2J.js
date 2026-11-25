/*
 * content/2J.js - Power supplies.
 *
 * Group 2J: cells and batteries at Foundation and Intermediate; rectifiers,
 * smoothing, stabilisers, PIV, and linear and switch mode supplies at
 * Intermediate and Full.
 *
 * Nothing on this page is a drawn waveform. Every rectifier, reservoir and
 * regulator is stepped through time by engine/tran.js, with real diodes
 * (about 0.7 V at a tenth of an amp, more at the peak current), 0.3 ohms of
 * winding resistance and a transistor with its own base-emitter drop. The
 * ripple, the diode current, the reverse voltage across each diode and the
 * regulator's output are read off the solution. Where a rule of thumb
 * differs from the solved circuit, the page shows both and says why.
 *
 * Headlines come from content/descriptions.json and are our own wording.
 */

const Fm = window.Fmt;
const TR = window.Tran;
const NBSP = String.fromCharCode(160);

const F_MAINS = 50;                 // Hz
const PERIOD = 1 / F_MAINS;
const MAINS = 230;                  // V RMS on the primary
const RW = 0.3;                     // ohms of winding resistance, referred to the secondary
const STEPS = 400;                  // time steps in each cycle
const R_ZENER = 100;                // feeds the Zener and the pass transistor's base
// the error amplifier stabiliser: R5 and C3 smooth the supply to R3, which
// feeds Q1's base and Q2's collector; the divider is R1 (a slider) over R2
const FB = { r5: 15, c3: 2200e-6, r3: 47, r2: 330, q2: 'is=7e-14 bf=300', zener: 'izt=40m' };
const R2 = FB.r2;
const IC_R3 = 1000, IC_R4 = 1000, IC_R2 = 1000;   // inside the IC model
const IC_VREF = 5.1, IC_R1 = 1050;  // inside the IC, set for 12 V like a 7812
const IC_VOUT = 12;
const SW_VPK = 15.5, SW_RW = 0.05;  // the switch mode output stage
const N4000 = [50, 100, 200, 400, 600, 800, 1000];   // 1N4001 to 1N4007 ratings

/*
 * Colours (README, Colours): voltage blue, current orange, power red,
 * capacitance purple; a second trace of one quantity is dashed, never faded.
 */
const INK = { v: '--q-v', i: '--q-i-ink', p: '--q-p', c: '--q-c', r: '--q-r' };
const hue = (k, html) => '<span style="color:var(' + INK[k] + ')">' + html + '</span>';
const DASH = [7, 5];
const dashSwatch = (c, label) =>
  '<span><i style="background:repeating-linear-gradient(90deg,' + c + ' 0 4px,transparent 4px 7px)"></i>' +
  '<span class="sw-l">' + label + '</span></span>';
const sym = s => '<span style="text-transform:none">' + s + '</span>';

/* ---------------- numbers ---------------- */

const volts = (v, s) => Fm.eng(v, 'V', s || 3);
const amps = (v, s) => Fm.eng(v, 'A', s || 3);
const watts = (v, s) => Fm.eng(v, 'W', s || 3);
const farads = v => v > 0 ? Fm.eng(v, 'F', 2) : 'none';
const ohms = v => Fm.eng(v, 'Ω', 3);
const b = x => '<b>' + x + '</b>';
const t3 = (v, s) => Fm.trimText(v, s || 3);
const niceMax = v => { const e = Math.pow(10, Math.floor(Math.log10(v))); const m = v / e;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * e; };
// an axis top whose quarters are round numbers, since the plot rules four divisions
function axisTop(v) {
  const q = v / 4, e = Math.pow(10, Math.floor(Math.log10(q))), m = q / e;
  return 4 * e * [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find(x => x >= m - 1e-9);
}
const E6 = [1, 1.5, 2.2, 3.3, 4.7, 6.8];
const E12 = [1, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];
const ZENERS = [2.7, 3, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1, 10, 11, 12, 13, 15, 16, 18,
                20, 22, 24, 27, 30];
// the nearest preferred value, judged on a log scale as the sliders are
function snapTo(v, series) {
  const e = Math.floor(Math.log10(v));
  let best = v, gap = Infinity;
  for (const k of [e - 1, e, e + 1]) for (const m of series) {
    const c = m * Math.pow(10, k), g = Math.abs(Math.log(c / v));
    if (g < gap) { gap = g; best = c; }
  }
  return Number(best.toPrecision(3));
}
const nearestOf = (v, list) => list.reduce((a, c) => Math.abs(c - v) < Math.abs(a - v) ? c : a, list[0]);
const sig2 = v => Number(v.toPrecision(2));

/* ---------------- drawing at a readable size ---------------- */

/*
 * As on the feeders page: the circuit canvas is made tall enough for the
 * drawing to reach its scale where the width allows; its labels are drawn at
 * 15 px whatever the scale (layout.labelPx). The graph beside it gets the
 * same height, and room for two plots when stacked on a narrow screen.
 */
const wide = () => typeof window !== 'undefined' && window.matchMedia &&
  window.matchMedia('(min-width:820px)').matches;
function sizeFor(p, lay, most) {
  let h = 260;
  if (p.schem) {
    const cw = p.schem.clientWidth || 380;
    const s = Math.min(most || 1.6, (cw - 32) / lay.w);
    h = Math.max(240, Math.round(s * lay.h + 32));
    p.schem.style.height = h + 'px';
  }
  p.graph.style.height = wide() ? Math.max(360, h) + 'px' : '380px';
}
// on a narrow graph only the ends and the middle of the x axis are labelled
const xLabels = (canvas, a, bb, f) => v => {
  if ((canvas.clientWidth || 500) >= 520) return f(v);
  const i = Math.round(4 * (v - a) / (bb - a));
  return i % 2 ? '' : f(v);
};
/* An item shows one row of toggles; the panel hides the ones this level does not use. */
function levelToggle(p, keys) {
  p.sec.querySelectorAll('.toggle button').forEach(x => { x.hidden = keys.indexOf(x.dataset.k) < 0; });
  if (keys.indexOf(p.topology) < 0) { p.topology = keys[0]; p.cursor = null; }
  return p.topology;
}
/* Show only the item's sliders that the chosen circuit uses. */
function onlyCtrls(p, hide) {
  if (!p.ctrls) return;
  p.ctrls.querySelectorAll('.ctrl').forEach(box => {
    if (hide.indexOf(box.dataset.ctrl) >= 0) box.hidden = true;
  });
}
/* Two plots, one above the other, sharing the time axis: volts above, the other quantity below. */
function twoPlots(Plot, canvas, t, xr, xFmt, top, bottom) {
  Plot.draw(canvas, Object.assign({ xRange: xr, tokens: t, band: [0, 0.47], hideX: true, xFmt }, top));
  Plot.draw(canvas, Object.assign({ xRange: xr, tokens: t, band: [0.57, 1], append: true, xFmt }, bottom));
}

/* ---------------- simulations, remembered ---------------- */

const cache = new Map();
function remember(key, make) {
  if (cache.has(key)) return cache.get(key);
  const v = make();
  cache.set(key, v);
  if (cache.size > 48) cache.delete(cache.keys().next().value);
  return v;
}
const sine = (vpk, f, sign) => t => sign * vpk * Math.sin(2 * Math.PI * f * t);

/*
 * A rectifier fed by its transformer. The secondary is a sine source with
 * 0.3 ohms in series; a centre-tapped secondary is two, in opposite phase.
 * The load is a resistor; the reservoir, when there is one, is C1.
 *
 *   half    VS s 0, RW, D1 to the output
 *   ct      VA s1 0 and VB s2 0, each with its own resistance, D1 and D2
 *   bridge  VS x y floating, RW, D1 and D2 to the output, D3 and D4 from 0 V:
 *           D1 and D4 conduct on one half of the cycle, D2 and D3 on the other
 */
function rectNet(kind, c, rl, rw, v0) {
  // v0: a starting charge on the reservoir, so that a steady run settles sooner
  const C = c > 0 ? 'C1 p 0 ' + c + (v0 > 0 ? ' ic=' + v0.toFixed(3) : '') + '\n' : '';
  rw = rw || RW;
  if (kind === 'half') return 'VS s 0 0\nRW s a ' + rw + '\nD1 a p\n' + C + 'RL p 0 ' + rl;
  if (kind === 'ct') return 'VA s1 0 0\nVB s2 0 0\nRA s1 a ' + rw + '\nRB s2 b ' + rw + '\nD1 a p\nD2 b p\n' + C + 'RL p 0 ' + rl;
  return 'VS x y 0\nRW x a ' + rw + '\nD1 a p\nD2 y p\nD3 0 a\nD4 0 y\n' + C + 'RL p 0 ' + rl;
}
const rectSources = (kind, vrms, f) => kind === 'ct'
  ? { VA: sine(vrms * Math.SQRT2, f, 1), VB: sine(vrms * Math.SQRT2, f, -1) }
  : { VS: sine(vrms * Math.SQRT2, f, 1) };

/*
 * The currents the drawing shows, worked out from the solution so that what
 * arrives at every junction leaves it exactly. A diode carrying less than a
 * thousandth of the largest current (its leakage) is drawn as carrying none,
 * so only the diodes that conduct have moving charge.
 */
function drawnRect(kind, r, hasC, ratio) {
  const n = r.t.length, out = {};
  const peak = Math.max(...['D1', 'D2', 'D3', 'D4'].filter(k => r.i[k]).map(k => Math.max(...r.i[k])));
  const thr = Math.max(2e-3, 1e-3 * peak);
  const on = v => v > thr ? v : 0;
  const mk = () => new Float64Array(n);
  ['IP', 'D1', 'D2', 'D3', 'D4', 'IS', 'C1', 'RL', 'W1', 'IR'].forEach(k => { out[k] = mk(); });
  for (let k = 0; k < n; k++) {
    let d1 = 0, d2 = 0, d3 = 0, d4 = 0, is = 0, total;
    if (kind === 'half') { d1 = on(r.i.D1[k]); is = d1; total = d1; }
    else if (kind === 'ct') { d1 = on(r.i.D1[k]); d2 = on(r.i.D2[k]); is = d1 - d2; total = d1 + d2; }
    else {
      const w = r.i.RW[k];
      if (w > thr) { d1 = d4 = w; } else if (w < -thr) { d2 = d3 = -w; }
      is = d1 - d2; total = d1 + d2;
    }
    // with no reservoir every bit of the rectifier's current goes through the load
    const rl = hasC ? r.i.RL[k] : total;
    out.D1[k] = d1; out.D2[k] = d2; out.D3[k] = d3; out.D4[k] = d4; out.IS[k] = is;
    out.RL[k] = rl; out.C1[k] = total - rl; out.W1[k] = d1 - rl; out.IR[k] = total;
    out.IP[k] = ratio * is;
  }
  return out;
}

function rectSim(kind, vrms, c, rl, start) {
  return remember(['rect', kind, vrms, c, rl, start ? 1 : 0].join('|'), () => {
    const v0 = start ? 0 : vrms * Math.SQRT2 - (kind === 'bridge' ? 1.7 : 0.9);
    const ckt = TR.parse(rectNet(kind, c, rl, RW, v0));
    const sources = rectSources(kind, vrms, F_MAINS);
    const r = start
      ? TR.run(ckt, { dt: PERIOD / STEPS, tStop: 6 * PERIOD, sources })
      : TR.settle(ckt, { period: PERIOD, stepsPerCycle: STEPS, sources, keep: 2, cycles: 80, tol: 2e-4 });
    const vout = r.v.p;
    const vw = kind === 'half' ? r.v.s : kind === 'ct' ? r.v.s1 : TR.across(r, 'x', 'y');
    const ratio = vrms / MAINS;
    const dr = drawnRect(kind, r, c > 0, ratio);
    const rev1 = TR.across(r, 'p', 'a');      // reverse voltage across D1, cathode less anode
    return { kind, vrms, c, rl, r, vout, vw, dr, rev1, vpk: vrms * Math.SQRT2 };
  });
}

/* A time series of named arrays, as the flow engine wants it: t => { name: amperes }. */
function seriesFn(t, arrays, names) {
  const n = t.length;
  return tt => {
    let lo = 0, hi = n - 1;
    if (tt <= t[0]) hi = 0; else if (tt >= t[n - 1]) lo = hi = n - 1;
    else { while (hi - lo > 1) { const m = (lo + hi) >> 1; if (t[m] <= tt) lo = m; else hi = m; } }
    const f = hi === lo ? 0 : (tt - t[lo]) / (t[hi] - t[lo]);
    const o = {};
    for (const k of names) { const a = arrays[k]; o[k] = a[lo] + f * (a[hi] - a[lo]); }
    return o;
  };
}
const msLabel = tau => Fm.trim(tau * 1000, 3) + NBSP + 'ms into the record';

/* ---------------- layouts ---------------- */

/*
 * Every wire names the current it carries, positive the way it is drawn.
 * The mains side is the primary between the terminals L and N; its current
 * is the secondary's, scaled by the turns ratio. Labels are drawn at 15 px.
 */
const mainsTerms = (y1, y2, top, bottom) => [{ at: [50, y1], label: top === undefined ? 'L' : top, align: 'right' },
                                           { at: [50, y2], label: bottom === undefined ? 'N' : bottom, align: 'right' }];
function halfLayout(hasC) {
  const els = [
    { name: 'TX', type: 'T', at: [100, 75], label: ' ', flow: ['IP', 'D1'], flowReversed: [false, true], humps: [6, 3] },
    { name: 'D1', type: 'D', at: [180, 45], label: 'D1' },
    { name: 'RL', type: 'R', at: [310, 75], rot: 90, label: 'load', labelAt: 'left' }
  ];
  const wires = [[50, 45, 80, 45, 'IP'], [80, 105, 50, 105, 'IP'], [120, 45, 150, 45, 'D1']];
  if (hasC) {
    els.push({ name: 'C1', type: 'CP', at: [240, 75], rot: 90, label: 'C', labelAt: 'left' });
    wires.push([210, 45, 240, 45, 'D1'], [240, 45, 310, 45, 'RL'], [310, 105, 240, 105, 'RL'], [240, 105, 120, 105, 'D1']);
  } else {
    wires.push([210, 45, 310, 45, 'RL'], [310, 105, 120, 105, 'RL']);
  }
  return { w: 340, h: 135, labelPx: 15, elements: els, wires, terminals: mainsTerms(45, 105) };
}
function ctLayout(hasC) {
  const els = [
    { name: 'TX', type: 'T', at: [100, 105], label: ' ', tap: true, flow: ['IP', 'D1', 'D2'],
      flowReversed: [false, true, false], humps: [6, 4] },
    { name: 'D1', type: 'D', at: [200, 45], label: 'D1' },
    { name: 'D2', type: 'D', at: [200, 195], label: 'D2' },
    { name: 'RL', type: 'R', at: [250, 105], rot: 90, label: 'load', labelAt: 'left' }
  ];
  const wires = [[50, 75, 80, 75, 'IP'], [80, 135, 50, 135, 'IP'],
                 [120, 75, 120, 45, 'D1'], [120, 45, 170, 45, 'D1'], [230, 45, 250, 45, 'D1'],
                 [250, 45, 250, 75, 'RL'],
                 [120, 135, 120, 195, 'D2'], [120, 195, 170, 195, 'D2'], [230, 195, 330, 195, 'D2'],
                 [330, 195, 330, 45, 'D2'],
                 [250, 135, 160, 135, 'IR'], [160, 135, 160, 105, 'IR'], [160, 105, 120, 105, 'IR']];
  if (hasC) {
    els.push({ name: 'C1', type: 'CP', at: [300, 105], rot: 90, label: 'C', labelAt: 'left' });
    wires.push([250, 45, 300, 45, 'W1'], [300, 45, 300, 75, 'C1'], [330, 45, 300, 45, 'D2'], [300, 135, 250, 135, 'C1']);
  } else {
    wires.push([330, 45, 250, 45, 'D2']);
  }
  return { w: 345, h: 215, labelPx: 15, elements: els, wires, terminals: mainsTerms(75, 135) };
}
/*
 * The bridge, drawn with the load inside the loop of the diodes so that no
 * wires cross: D1 along the top, D2 along the bottom and up the right-hand
 * side, D3 and D4 from the 0 V side of the load to either end of the winding.
 */
function bridgeLayout(hasC, terms) {
  const els = [
    { name: 'TX', type: 'T', at: [100, 105], label: ' ', flow: ['IP', 'IS'], flowReversed: [false, true], humps: [6, 3] },
    { name: 'D1', type: 'D', at: [200, 45], label: 'D1' },
    { name: 'D3', type: 'D', at: [160, 105], rot: 270, label: 'D3', labelAt: 'left' },
    { name: 'D4', type: 'D', at: [180, 165], rot: 90, label: 'D4' },
    { name: 'D2', type: 'D', at: [240, 195], label: 'D2' },
    { name: 'RL', type: 'R', at: [250, 105], rot: 90, label: 'load', labelAt: 'left' }
  ];
  const wires = [[50, 75, 80, 75, 'IP'], [80, 135, 50, 135, 'IP'],
                 [120, 75, 120, 45, 'IS'], [120, 45, 160, 45, 'IS'], [160, 45, 170, 45, 'D1'],
                 [160, 75, 160, 45, 'D3'], [180, 135, 160, 135, 'D3'],
                 [180, 195, 120, 195, 'IS'], [120, 195, 120, 135, 'IS'],
                 [180, 195, 210, 195, 'D2'], [270, 195, 330, 195, 'D2'], [330, 195, 330, 45, 'D2'],
                 [230, 45, 250, 45, 'D1'], [250, 45, 250, 75, 'RL'],
                 [250, 135, 180, 135, 'IR']];
  if (hasC) {
    els.push({ name: 'C1', type: 'CP', at: [300, 105], rot: 90, label: 'C', labelAt: 'left' });
    wires.push([250, 45, 300, 45, 'W1'], [300, 45, 300, 75, 'C1'], [330, 45, 300, 45, 'D2'], [300, 135, 250, 135, 'C1']);
  } else {
    wires.push([330, 45, 250, 45, 'D2']);
  }
  return { w: 345, h: 215, labelPx: 15, elements: els, wires,
           terminals: terms || mainsTerms(75, 135) };
}
const rectLayout = (kind, hasC) => kind === 'half' ? halfLayout(hasC) : kind === 'ct' ? ctLayout(hasC) : bridgeLayout(hasC);
const RECT_NAMES = { half: ['IP', 'D1', 'C1', 'RL'], ct: ['IP', 'D1', 'D2', 'C1', 'RL', 'W1', 'IR'],
                     bridge: ['IP', 'IS', 'D1', 'D2', 'D3', 'D4', 'C1', 'RL', 'W1', 'IR'] };

/* ---------------- the stabilisers ---------------- */

/*
 * A bridge and reservoir from a 50 Hz transformer, then the stabiliser:
 *
 *   zener     RZ from the input to the base node, the Zener from there to
 *             0 V, Q1 an emitter follower: Vout = Vz - Vbe
 *   feedback  the course's circuit: R3 to the base node, Q2 (the error
 *             amplifier) from there to the Zener, which Q2's own current
 *             keeps conducting; Q2's base on the divider R1 over R2:
 *             Vout = (Vz + Vbe2)(R1 + R2) / R2. R3 is fed through R5 and C3,
 *             which smooth its supply: without them the reservoir's ripple
 *             drives a rippling current through R3 that Q2 has to soak up,
 *             and the regulator lets through more ripple than the Zener alone.
 *             Q2 is a medium power transistor with V_BE = 0.7 V near its 40 mA
 *             working current, and the Zener is rated at 40 mA, so the rule
 *             holds where the circuit runs.
 *   ic        an error amplifier circuit set for 12 V and drawn as one box;
 *             inside it the pass transistor is a Darlington pair, Q1 driving
 *             Q3, as in a real 7812, so it needs little base current and
 *             about 2 V of headroom
 *
 * Q1 is a power transistor of current gain 100, Q2 one of 300.
 */
function regNet(kind, c, rl, vz, vref, r1, v0) {
  const lines = (...a) => a.join(String.fromCharCode(10));
  const front = lines('VS x y 0', 'RW x a ' + RW, 'D1 a in', 'D2 y in', 'D3 0 a', 'D4 0 y',
                      'C1 in 0 ' + c + (v0 > 0 ? ' ic=' + v0.toFixed(3) : ''));
  if (kind === 'zener') return lines(front, 'RZ in b ' + R_ZENER, 'Z1 0 b ' + vz, 'Q1 in b out is=1p bf=100', 'RL out 0 ' + rl);
  if (kind === 'ic') {
    return lines(front, 'R3 in b ' + IC_R3, 'Q1 in b e1 is=1e-14 bf=100', 'Q3 in e1 out is=1p bf=50',
                 'Q2 b m z is=1e-14 bf=300', 'R4 in z ' + IC_R4, 'Z1 0 z ' + IC_VREF,
                 'R1 out m ' + IC_R1, 'R2 m 0 ' + IC_R2, 'RL out 0 ' + rl);
  }
  // the filter starts charged to about the reservoir's level, less R5's share
  const vf = v0 > 0 ? ' ic=' + Math.max(0, v0 - 0.8).toFixed(3) : '';
  return lines(front, 'R5 in f ' + FB.r5, 'C3 f 0 ' + FB.c3 + vf, 'R3 f b ' + FB.r3,
               'Q1 in b out is=1p bf=100', 'Q2 b m z ' + FB.q2, 'Z1 0 z ' + vref + ' ' + FB.zener,
               'R1 out m ' + r1, 'R2 m 0 ' + FB.r2, 'RL out 0 ' + rl);
}
const regRule = (kind, vz, vref, r1) => kind === 'zener' ? vz - 0.7
  : kind === 'ic' ? IC_VOUT : (vref + 0.7) * (r1 + R2) / R2;

function drawnReg(kind, r) {
  const n = r.t.length, o = {};
  const get = k => r.i[k] || new Float64Array(n);
  if (kind === 'zener') {
    ['Q1', 'Q1b', 'Z1', 'RZ', 'IIN', 'RL', 'IRET'].forEach(k => { o[k] = new Float64Array(n); });
    for (let k = 0; k < n; k++) {
      const q1 = get('Q1')[k], qb = get('Q1.b')[k], z = -get('Z1')[k], rl = get('RL')[k];
      o.Q1[k] = q1; o.Q1b[k] = qb; o.Z1[k] = z; o.RZ[k] = qb + z; o.IIN[k] = qb + z + q1;
      o.RL[k] = rl; o.IRET[k] = rl + z;
    }
    return o;
  }
  if (kind === 'ic') {
    // drawn as one box: only what enters and leaves it
    ['UIN', 'UG', 'RL'].forEach(k => { o[k] = new Float64Array(n); });
    for (let k = 0; k < n; k++) {
      const z = get('R4')[k] + get('Q2')[k] + get('Q2.b')[k], rl = get('RL')[k], r2 = get('R1')[k] - get('Q2.b')[k];
      o.RL[k] = rl; o.UG[k] = r2 + z; o.UIN[k] = rl + r2 + z;
    }
    return o;
  }
  const names = ['IIN', 'Q1', 'R5', 'C3', 'R3', 'Q1b', 'Q2', 'Q2b', 'Z1', 'R1', 'R2', 'RL', 'W1', 'W2', 'W4', 'IRET'];
  names.forEach(k => { o[k] = new Float64Array(n); });
  for (let k = 0; k < n; k++) {
    const q1 = get('Q1')[k], q1b = get('Q1.b')[k], q2 = get('Q2')[k], q2b = get('Q2.b')[k];
    const r5 = get('R5')[k], r1 = get('R1')[k], rl = get('RL')[k];
    const r3 = q1b + q2, c3 = r5 - r3, z = q2 + q2b, r2 = r1 - q2b;
    o.Q1[k] = q1; o.Q1b[k] = q1b; o.Q2[k] = q2; o.Q2b[k] = q2b; o.Z1[k] = z;
    o.R5[k] = r5; o.C3[k] = c3; o.R3[k] = r3; o.IIN[k] = r5 + q1;
    o.R1[k] = r1; o.R2[k] = r2; o.RL[k] = rl; o.W1[k] = r1 + rl; o.W2[k] = rl + r2;
    o.W4[k] = rl + r2 + z; o.IRET[k] = rl + r2 + z + c3;
  }
  return o;
}

function regSim(kind, vsec, c, il, vz, vref, r1) {
  return remember(['reg', kind, vsec, c, il, kind === 'zener' ? vz : '', kind === 'feedback' ? vref + ',' + r1 : ''].join('|'), () => {
    const rule = regRule(kind, vz, vref, r1);
    const rl = Math.max(0.5, Math.max(0.5, rule) / il);
    const ckt = TR.parse(regNet(kind, c, rl, vz, vref, r1, vsec * Math.SQRT2 - 1.7));
    const r = TR.settle(ckt, { period: PERIOD, stepsPerCycle: STEPS, sources: { VS: sine(vsec * Math.SQRT2, F_MAINS, 1) },
                               keep: 2, cycles: 80, tol: 2e-4 });
    const vin = r.v.in, vout = r.v.out;
    // heat in the pass transistor, moment by moment: Vce Ic + Vbe Ib
    const heat = kind === 'ic'
      ? vin.map((v, k) => (v - r.v.e1[k]) * r.i.Q1[k] + (r.v.b[k] - r.v.e1[k]) * r.i['Q1.b'][k] +
                          (v - vout[k]) * r.i.Q3[k] + (r.v.e1[k] - vout[k]) * r.i['Q3.b'][k])
      : vin.map((v, k) => (v - vout[k]) * r.i.Q1[k] + (r.v.b[k] - vout[k]) * r.i['Q1.b'][k]);
    const dr = drawnReg(kind, r);
    const pin = vin.map((v, k) => v * (kind === 'ic' ? dr.UIN[k] : dr.IIN[k])), pout = vout.map((v, k) => v * r.i.RL[k]);
    const S = a => TR.stats(r, a);
    const head = vin.map((v, k) => v - vout[k]);
    return { kind, r, rl, rule, vin, vout, heat, dr, sIn: S(vin), sOut: S(vout), sHeat: S(heat),
             sHead: S(head), iz: S(dr.Z1 || r.i.Z1.map(v => -v)), iL: S(r.i.RL), eff: S(pout).mean / S(pin).mean };
  });
}
// dropping out: the output ripple has grown to a good share of the input's
const droppingOut = s => s.sOut.pp > 0.05 && s.sOut.pp > 0.2 * s.sIn.pp;

function zenerLayout() {
  return {
    w: 320, h: 215, labelPx: 15,
    elements: [
      { name: 'RZ', type: 'R', at: [100, 73], rot: 90, label: 'R' },
      { name: 'Z1', type: 'DZ', at: [100, 165], rot: 270, label: 'Zener', labelAt: 'left', flow: 'Z1', flowReversed: true },
      { name: 'Q1', type: 'Q', at: [190, 103], label: 'Q1', labelAt: 'right' },
      { name: 'RL', type: 'R', at: [270, 165], rot: 90, label: 'load' }
    ],
    wires: [[40, 43, 100, 43, 'IIN'], [100, 43, 202, 43, 'Q1'], [202, 43, 202, 71, 'Q1'],
            [100, 103, 160, 103, 'Q1b'], [100, 103, 100, 135, 'Z1'],
            [202, 135, 270, 135, 'RL'], [270, 195, 100, 195, 'RL'], [100, 195, 40, 195, 'IRET']],
    terminals: [{ at: [40, 43], label: 'in', align: 'right' }, { at: [40, 195], label: '0 V', align: 'right' }]
  };
}
function feedbackLayout() {
  return {
    w: 360, h: 300, labelPx: 15,
    elements: [
      { name: 'R5', type: 'R', at: [70, 70], rot: 90, label: 'R5', labelAt: 'left' },
      { name: 'C3', type: 'CP', at: [70, 130], rot: 90, label: 'C3', labelAt: 'left' },
      { name: 'R3', type: 'R', at: [100, 100], label: 'R3' },
      { name: 'Q1', type: 'Q', at: [208, 100], label: 'Q1', labelAt: 'right' },
      { name: 'Q2', type: 'Q', at: [142, 192], mirror: true, label: 'Q2', labelAt: 'left' },
      { name: 'Z1', type: 'DZ', at: [130, 254], rot: 270, label: 'Zener', labelAt: 'right', flow: 'Z1', flowReversed: true },
      { name: 'R1', type: 'R', at: [280, 162], rot: 90, label: 'R1', labelAt: 'left' },
      { name: 'R2', type: 'R', at: [280, 222], rot: 90, label: 'R2', labelAt: 'left' },
      { name: 'RL', type: 'R', at: [340, 162], rot: 90, label: 'load', labelAt: 'left' }
    ],
    wires: [[40, 40, 70, 40, 'IIN'], [70, 40, 220, 40, 'Q1'], [220, 40, 220, 68, 'Q1'],
            [130, 100, 178, 100, 'Q1b'], [130, 100, 130, 160, 'Q2'],
            [220, 132, 280, 132, 'W1'], [280, 132, 340, 132, 'RL'],
            [280, 192, 172, 192, 'Q2b'],
            [280, 252, 280, 284, 'R2'], [340, 192, 340, 284, 'RL'],
            [340, 284, 280, 284, 'RL'], [280, 284, 130, 284, 'W2'], [130, 284, 70, 284, 'W4'],
            [70, 160, 70, 284, 'C3'], [70, 284, 40, 284, 'IRET']],
    terminals: [{ at: [40, 40], label: 'in', align: 'right' }, { at: [40, 284], label: '0 V', align: 'right' }]
  };
}
function icLayout() {
  return {
    w: 300, h: 150, labelPx: 15,
    elements: [
      { name: 'U1', type: 'U', at: [150, 55], label: 'regulator', text: '7812' },
      { name: 'RL', type: 'R', at: [240, 85], rot: 90, label: 'load' }
    ],
    wires: [[40, 55, 120, 55, 'UIN'], [180, 55, 240, 55, 'RL'], [150, 85, 150, 115, 'UG'],
            [240, 115, 150, 115, 'RL'], [150, 115, 40, 115, 'UIN']],
    terminals: [{ at: [40, 55], label: 'in', align: 'right' }, { at: [40, 115], label: '0 V', align: 'right' }]
  };
}
const regLayout = kind => kind === 'zener' ? zenerLayout() : kind === 'ic' ? icLayout() : feedbackLayout();
const REG_NAMES = {
  zener: ['IIN', 'RZ', 'Q1', 'Q1b', 'Z1', 'RL', 'IRET'],
  feedback: ['IIN', 'Q1', 'R5', 'C3', 'R3', 'Q1b', 'Q2', 'Q2b', 'Z1', 'R1', 'R2', 'RL', 'W1', 'W2', 'W4', 'IRET'],
  ic: ['UIN', 'RL', 'UG']
};

/* ---------------- the switch mode output stage ---------------- */

/*
 * The output of a switch mode supply, simplified: the ferrite transformer's
 * secondary gives a square wave, +15.5 V for the first quarter of each
 * switching cycle and -15.5 V for the third, with gaps between (each switch
 * is on for half its half of the cycle). A bridge rectifies it into a
 * reservoir and the load. Real supplies add a choke ahead of the capacitor;
 * this one leaves it out so the comparison with 50 Hz is like for like.
 */
function squareWave(vpk, f) {
  const e = 0.01;   // each edge takes a hundredth of the cycle
  const pulse = (x, a, z) => x < a || x > z ? 0 : Math.min(1, (x - a) / e, (z - x) / e);
  return t => { const ph = (t * f) % 1; return vpk * (pulse(ph, 0, 0.25) - pulse(ph, 0.5, 0.75)); };
}
function smpsSim(fs, c, isw) {
  return remember(['smps', fs, c, isw].join('|'), () => {
    const rl = (SW_VPK - 1.7) / isw;
    const ckt = TR.parse(rectNet('bridge', c, rl, SW_RW, SW_VPK - 1.7 - 0.05 * isw));
    const r = TR.settle(ckt, { period: 1 / fs, stepsPerCycle: 200, sources: { VS: squareWave(SW_VPK, fs) },
                               keep: 2, cycles: 80, tol: 2e-4 });
    const dr = drawnRect('bridge', r, true, SW_VPK / 325);
    const sOut = TR.stats(r, r.v.p);
    // the gap between charging pulses: the time in each half cycle with no diode conducting
    let off = 0;
    for (let k = 1; k < r.t.length; k++) if (dr.D1[k] === 0 && dr.D2[k] === 0) off += r.t[k] - r.t[k - 1];
    const gap = off / (2 * (r.t[r.t.length - 1] - r.t[0]) * fs);
    return { r, rl, dr, sOut, gap, vw: TR.across(r, 'x', 'y') };
  });
}
// the same parts on 50 Hz mains through a bridge, the same peak voltage
function mainsSame(c, isw) {
  return remember(['mains', c, isw].join('|'), () => {
    const rl = (SW_VPK - 1.7) / isw;
    const r = TR.settle(TR.parse(rectNet('bridge', c, rl, RW, SW_VPK - 1.7)), { period: PERIOD, stepsPerCycle: STEPS,
      sources: { VS: sine(SW_VPK, F_MAINS, 1) }, keep: 1, cycles: 80, tol: 2e-4 });
    return { r, sOut: TR.stats(r, r.v.p) };
  });
}

/* ---------------- panels ---------------- */

const PANELS = {

  /*
   * 2J2 Intermediate: the three rectifiers, steady, over two cycles of the
   * mains, with or without a reservoir.
   */
  rect(ctx) {
    const { p, d, t, Plot, swatch, ro } = ctx;
    const kind = levelToggle(p, ['half', 'ct', 'bridge']);
    const s = rectSim(kind, d.vsec, d.cres, d.rl, false);
    const lay = rectLayout(kind, d.cres > 0);
    sizeFor(p, lay, 1.6);
    const r = s.r, ms = Array.from(r.t, x => (x - r.t[0]) * 1000), T = 2 * PERIOD * 1000;
    const so = TR.stats(r, s.vout);
    const irect = s.dr.IR, ipk = Math.max(...irect);
    const vmax = axisTop(s.vpk * 1.08), imax = axisTop(Math.max(ipk, 0.01) * 1.1);
    const pts = (a, f) => ms.map((x, k) => ({ x, y: f ? f(a[k]) : a[k] }));
    // the winding swings both ways; on a half wave and centre tap show it as it is
    const vwPts = pts(s.vw);
    twoPlots(Plot, p.graph, t, [0, T], xLabels(p.graph, 0, T, v => Fm.trim(v, 3) + ' ms'),
      { left: { min: -vmax, max: vmax, fmt: v => Fm.trim(v, 3) + ' V' },
        traces: [{ pts: vwPts, colour: t.v, width: 1.6, dash: DASH }, { pts: pts(s.vout), colour: t.v, width: 2.8 }] },
      { left: { min: 0, max: imax, fmt: v => Fm.eng(v, 'A', 3) },
        traces: [{ pts: pts(irect), colour: t.i, width: 2, fill: t.iFill },
                 { pts: pts(s.dr.RL), colour: t.i, width: 1.8, dash: DASH }] });
    p.legend.innerHTML = dashSwatch(t.v, kind === 'ct' ? 'Each half of the winding' : 'The winding') +
      swatch(t.v, 'Across the load') + swatch(t.i, 'Through the diodes') + dashSwatch(t.i, 'Through the load');
    const peaks = kind === 'half' ? 1 : 2;
    const cond = Array.from(irect).filter(v => v > 0).length / irect.length;   // share of the time a diode conducts
    const rows = [
      ['Peak across the load', volts(so.max), true],
      ['Winding peak, ' + sym('1.414 × ' + t3(d.vsec) + ' V'), volts(s.vpk)],
      ['Lost in the ' + (kind === 'bridge' ? 'two diodes' : 'diode') + ' and winding at the peak', volts(s.vpk - so.max)],
      d.cres > 0 ? ['Ripple, peak to trough', volts(so.pp)] : ['Between pulses', 'falls to ' + volts(so.min, 2)],
      ['Ripple frequency', (peaks * F_MAINS) + NBSP + 'Hz: ' + (peaks === 1 ? 'one pulse' : 'two pulses') + ' a cycle'],
      ['Average across the load', volts(so.mean)],
      ['Peak diode current', amps(ipk)],
      ['Diodes conduct for', Math.round(cond * 100) + '% of the time']
    ];
    p.readouts.innerHTML = ro(rows);
    const names = RECT_NAMES[kind].filter(k => d.cres > 0 || (k !== 'C1' && k !== 'W1'));
    return { layout: lay, flow: { mode: 'time', duration: T / 1000, loop: 8, hideStill: true,
                                  currents: seriesFn(r.t.map(x => x - r.t[0]), s.dr, names), label: msLabel } };
  },

  /*
   * 2J3 Intermediate: switching on into an empty reservoir, the first six
   * cycles, and the steady ripple against I / (fC).
   */
  reservoir(ctx) {
    const { p, d, t, Plot, swatch, ro } = ctx;
    const kind = levelToggle(p, ['half', 'bridge']);
    const s = rectSim(kind, d.vsec, d.cres, d.rl, true);
    const steady = rectSim(kind, d.vsec, d.cres, d.rl, false);
    const lay = rectLayout(kind, d.cres > 0);
    sizeFor(p, lay, 1.6);
    const r = s.r, ms = Array.from(r.t, x => x * 1000), T = 6 * PERIOD * 1000;
    const irect = s.dr.IR;
    const first = Math.max(...Array.from(irect).filter((v, k) => r.t[k] < PERIOD / 2));
    const steadyPk = Math.max(...steady.dr.IR);
    const so = TR.stats(steady.r, steady.vout);
    const vmax = axisTop(s.vpk * 1.08), imax = axisTop(Math.max(first, 0.01) * 1.05);
    const pts = a => ms.map((x, k) => ({ x, y: a[k] }));
    twoPlots(Plot, p.graph, t, [0, T], xLabels(p.graph, 0, T, v => Fm.trim(v, 3) + ' ms'),
      { left: { min: 0, max: vmax, fmt: v => Fm.trim(v, 3) + ' V' },
        traces: [{ pts: pts(s.vw.map(Math.abs)), colour: t.v, width: 1.4, dash: DASH }, { pts: pts(s.vout), colour: t.v, width: 2.8 }] },
      { left: { min: 0, max: imax, fmt: v => Fm.eng(v, 'A', 3) },
        traces: [{ pts: pts(irect), colour: t.i, width: 2, fill: t.iFill },
                 { pts: pts(s.dr.RL), colour: t.i, width: 1.8, dash: DASH }] });
    p.legend.innerHTML = dashSwatch(t.v, 'The winding, rectified, with no diode drop') + swatch(t.v, 'Across the load') +
      swatch(t.i, 'Through the diodes') + dashSwatch(t.i, 'Through the load') +
      '<span>switched on at a zero crossing of the mains, the reservoir empty</span>';
    const f = (kind === 'half' ? 1 : 2) * F_MAINS;
    const il = TR.stats(steady.r, steady.dr.RL).mean;
    const rows = d.cres > 0 ? [
      ['Ripple once settled, peak to trough', volts(so.pp), true],
      ['Rule of thumb, ' + sym('I ÷ (f × C)'), volts(il / (f * d.cres))],
      ['Ripple frequency', f + NBSP + 'Hz'],
      ['Load current, average', amps(il)],
      ['First pulse, filling the empty reservoir', amps(first)],
      ['Each pulse once settled', amps(steadyPk)],
      ['Settled peak across the load', volts(so.max)]
    ] : [
      ['No reservoir: the load sees pulses', 'from 0 to ' + volts(so.max), true],
      ['Ripple frequency', f + NBSP + 'Hz'],
      ['Peak diode current', amps(steadyPk)]
    ];
    p.readouts.innerHTML = ro(rows);
    const names = RECT_NAMES[kind].filter(k => d.cres > 0 || (k !== 'C1' && k !== 'W1'));
    return { layout: lay, flow: { mode: 'time', duration: T / 1000, loop: 18, hideStill: true, compress: true,
                                  currents: seriesFn(r.t, s.dr, names),
                                  label: tau => Fm.trim(tau * 1000, 3) + NBSP + 'ms after switching on' } };
  },

  /*
   * 2J3 Full: the reverse voltage across D1, read from the solution, against
   * the rule for each circuit.
   */
  piv(ctx) {
    const { p, d, t, Plot, swatch, ro } = ctx;
    const mode = levelToggle(p, ['half0', 'half', 'ct', 'bridge']);
    const kind = mode === 'half0' ? 'half' : mode;
    const c = mode === 'half0' ? 0 : d.cres;
    const s = rectSim(kind, d.vsec, c, d.rl, false);
    const lay = rectLayout(kind, c > 0);
    sizeFor(p, lay, 1.6);
    const r = s.r, ms = Array.from(r.t, x => (x - r.t[0]) * 1000), T = 2 * PERIOD * 1000;
    const piv = Math.max(...s.rev1), rule = pivRule(mode, d.vsec);
    const vmax = axisTop(s.vpk * 1.08), rmax = axisTop(Math.max(rule, piv) * 1.1);
    const pts = a => ms.map((x, k) => ({ x, y: a[k] }));
    const at = ms[s.rev1.indexOf(piv)];
    twoPlots(Plot, p.graph, t, [0, T], xLabels(p.graph, 0, T, v => Fm.trim(v, 3) + ' ms'),
      { left: { min: -vmax, max: vmax, fmt: v => Fm.trim(v, 3) + ' V' },
        traces: [{ pts: pts(s.vw), colour: t.v, width: 1.6, dash: DASH }, { pts: pts(s.vout), colour: t.v, width: 2.8 }] },
      { left: { min: 0, max: rmax, fmt: v => Fm.trim(v, 3) + ' V' },
        traces: [{ pts: [{ x: 0, y: rule }, { x: T, y: rule }], colour: t.mark, width: 1.4, dash: [3, 3] },
                 { pts: pts(s.rev1.map(v => Math.max(0, v))), colour: t.v, width: 2.4, fill: t.vFill }],
        marks: [{ x: at }] });
    p.legend.innerHTML = dashSwatch(t.v, mode === 'ct' ? 'Each half of the winding' : 'The winding') +
      swatch(t.v, 'Across the load') + swatch(t.v, 'Reverse voltage across D1, filled, lower graph') +
      dashSwatch(t.mark, 'The rule: ' + pivRuleText(mode));
    const ipk = Math.max(...s.dr.D1);
    const rating = N4000.find(v => v >= rule);
    const rows = [
      ['PIV across D1, solved', volts(piv), true],
      ['The rule, ' + sym(pivRuleText(mode)), volts(rule)],
      ['Solved less than the rule by', volts(rule - piv)],
      ['Smallest 1N400x rating above the rule', rating ? rating + NBSP + 'V' : 'more than one diode in series'],
      ['Peak current in D1', amps(ipk)],
      ['Average current in D1', amps(TR.stats(r, s.dr.D1).mean)]
    ];
    p.readouts.innerHTML = ro(rows);
    const names = RECT_NAMES[kind].filter(k => c > 0 || (k !== 'C1' && k !== 'W1'));
    return { layout: lay, flow: { mode: 'time', duration: T / 1000, loop: 8, hideStill: true,
                                  currents: seriesFn(r.t.map(x => x - r.t[0]), s.dr, names), label: msLabel } };
  },

  /*
   * 2J2 Full and 2J4 Intermediate: the stabiliser, fed by a bridge and
   * reservoir, solved over two cycles.
   */
  reg(ctx) {
    const { p, d, t, Plot, swatch, ro, level } = ctx;
    const kind = levelToggle(p, level === 'full' ? ['zener', 'feedback'] : ['zener', 'ic']);
    onlyCtrls(p, kind === 'zener' ? ['vref', 'r1'] : kind === 'feedback' ? ['vz'] : ['vz', 'vref', 'r1']);
    const s = regSim(kind, d.vsreg, d.creg, d.ireg, d.vz, d.vref, d.r1);
    const lay = regLayout(kind);
    sizeFor(p, lay, kind === 'feedback' ? 1.3 : 1.6);
    const r = s.r, ms = Array.from(r.t, x => (x - r.t[0]) * 1000), T = 2 * PERIOD * 1000;
    const vmax = axisTop(Math.max(s.sIn.max, s.sOut.max) * 1.1);
    const pts = a => ms.map((x, k) => ({ x, y: a[k] }));
    const hmax = axisTop(Math.max(0.1, s.sHeat.max) * 1.15);
    twoPlots(Plot, p.graph, t, [0, T], xLabels(p.graph, 0, T, v => Fm.trim(v, 3) + ' ms'),
      { left: { min: 0, max: vmax, fmt: v => Fm.trim(v, 3) + ' V' },
        traces: [{ pts: pts(s.vin), colour: t.v, width: 1.8, dash: DASH }, { pts: pts(s.vout), colour: t.v, width: 2.8 }] },
      { left: { min: 0, max: hmax, fmt: v => Fm.eng(v, 'W', 3) },
        traces: [{ pts: pts(s.heat), colour: t.p, width: 2.2, fill: t.pFill }] });
    p.legend.innerHTML = dashSwatch(t.v, 'Input, from the reservoir') + swatch(t.v, 'Output') +
      swatch(t.p, 'Heat in the pass transistor' + (kind === 'ic' ? ' inside the IC' : '') + ', lower graph');
    const drop = droppingOut(s);
    const rows = [
      ['Output, solved, average', volts(s.sOut.mean), true],
      [kind === 'zener' ? 'The rule, ' + sym('V<sub>Z</sub> − 0.7') : kind === 'feedback'
        ? 'The rule, ' + sym('(V<sub>Z</sub> + 0.7) × (R1 + R2) ÷ R2') : 'What the IC is made for', volts(s.rule)],
      ['Ripple on the input', volts(s.sIn.pp)],
      ['Ripple on the output', volts(s.sOut.pp) + (drop ? ': dropping out at the troughs' : '')],
      ['Lowest input, at the troughs', volts(s.sIn.min)],
      ['Least headroom, input less output', volts(s.sHead.min)],
      ['Heat in the pass transistor, average', watts(s.sHeat.mean)],
      ['Efficiency of the regulator', Math.round(s.eff * 100) + '%']
    ];
    if (level === 'full') rows.push(['Zener current, average', amps(s.iz.mean)]);
    p.readouts.innerHTML = ro(rows);
    return { layout: lay, flow: { mode: 'time', duration: T / 1000, loop: 8,
                                  currents: seriesFn(r.t.map(x => x - r.t[0]), s.dr, REG_NAMES[kind]), label: msLabel } };
  },

  /*
   * 2J4 Full: the output stage of a switch mode supply at its switching
   * frequency, against the same capacitor on 50 Hz mains.
   */
  smps(ctx) {
    const { p, d, t, Plot, swatch, ro } = ctx;
    const s = smpsSim(d.fs, d.csw, d.isw), m = mainsSame(d.csw, d.isw);
    const lay = bridgeLayout(true, mainsTerms(75, 135, '', ''));
    lay.elements[0].label = ' ';
    sizeFor(p, lay, 1.6);
    const r = s.r, T = 2 / d.fs;
    const unit = T < 2e-3 ? 1e6 : 1e3, uName = unit === 1e6 ? 'µs' : 'ms';
    const xs = Array.from(r.t, x => (x - r.t[0]) * unit), X = T * unit;
    const pts = a => xs.map((x, k) => ({ x, y: a[k] }));
    const vmax = axisTop(SW_VPK * 1.1), ipk = Math.max(...s.dr.IR), imax = axisTop(Math.max(ipk, 0.01) * 1.1);
    twoPlots(Plot, p.graph, t, [0, X], xLabels(p.graph, 0, X, v => Fm.trim(v, 3) + ' ' + uName),
      { left: { min: -vmax, max: vmax, fmt: v => Fm.trim(v, 3) + ' V' },
        traces: [{ pts: pts(s.vw), colour: t.v, width: 1.6, dash: DASH }, { pts: pts(r.v.p), colour: t.v, width: 2.8 }] },
      { left: { min: 0, max: imax, fmt: v => Fm.eng(v, 'A', 3) },
        traces: [{ pts: pts(s.dr.IR), colour: t.i, width: 2, fill: t.iFill },
                 { pts: pts(s.dr.RL), colour: t.i, width: 1.8, dash: DASH }] });
    p.legend.innerHTML = dashSwatch(t.v, 'The ferrite transformer’s secondary') + swatch(t.v, 'Across the load') +
      swatch(t.i, 'Through the diodes') + dashSwatch(t.i, 'Through the load');
    const gap50 = 1 / (2 * F_MAINS);
    const il = TR.stats(r, s.dr.RL).mean;
    const rows = [
      ['Ripple at ' + Fm.eng(d.fs, 'Hz', 3) + ', solved', volts(s.sOut.pp), true],
      ['Gap between charging pulses, solved', Fm.eng(s.gap, 's', 3)],
      ['The same capacitor and load on 50 Hz mains', volts(m.sOut.pp) + ' of ripple'],
      ['Gap between charging pulses on 50 Hz', Fm.eng(gap50, 's', 2) + ' at most'],
      ['Capacitor 50 Hz would need for this ripple, ' + sym('I × t ÷ ΔV'), Fm.eng(il * gap50 / Math.max(1e-6, s.sOut.pp), 'F', 2)],
      ['Load current', amps(il)]
    ];
    p.readouts.innerHTML = ro(rows);
    return { layout: lay, flow: { mode: 'time', duration: T, loop: 8, hideStill: true,
                                  currents: seriesFn(r.t.map(x => x - r.t[0]), s.dr, RECT_NAMES.bridge),
                                  label: tau => Fm.eng(tau, 's', 3) + ' into the record' } };
  }
};

/* The PIV rules, as the exam states them, and the figure each gives. */
function pivRule(mode, vrms) {
  const vpk = vrms * Math.SQRT2;
  return mode === 'half' || mode === 'ct' ? 2 * vpk : vpk;
}
function pivRuleText(mode) {
  return { half0: 'PIV = V<sub>peak</sub>', half: 'PIV = 2 × V<sub>peak</sub>',
           ct: 'PIV = 2 × V<sub>peak</sub> of each half', bridge: 'PIV = V<sub>peak</sub>' }[mode];
}

/* ---------------- the working ---------------- */

function rectFor(d, start) {
  const kind = d.device === 'half0' ? 'half' : d.device;
  return rectSim(kind, d.vsec, d.device === 'half0' ? 0 : d.cres, d.rl, start);
}
const regFor = d => regSim(d.device, d.vsreg, d.creg, d.ireg, d.vz, d.vref, d.r1);

/* ---------------- the page ---------------- */

const BENCH = {
  group: '2J',
  title: 'Power supplies',
  pageTitle: 'Power Supply Bench',
  levels: ['foundation', 'intermediate', 'full'],
  // the course sessions that send learners here, named in the colophon
  sessions: {
    foundation: ['Foundation session 3 (Volts, amps, ohms and watts)'],
    intermediate: ['Intermediate session 7 (Transformers and power supplies)'],
    full: ['Full session 9 (Power supplies and electrical safety)']
  },
  circuitBased: true,
  standfirst: {
    foundation: 'Cells, batteries and where their energy comes from. The circuits on this page start at Intermediate.',
    intermediate: 'Move a control and the page recalculates. Every rectifier and regulator here is stepped through time, cycle by cycle, with real diodes and a real transistor, so the ripple and the diode current are the circuit’s own.',
    full: 'Move a control and the page recalculates. Every circuit here is stepped through time with real diodes and transistors, so the PIV, the ripple and the regulator’s output are read off the solution, beside the rule the exam uses.'
  },
  colophonNote: 'Circuits are solved by a time-step nodal analysis engine with exponential diode and transistor models, checked against hand calculations. The transformer is a sine source with 0.3 Ω of winding resistance; the switch mode output stage is simplified, with no output choke. Circuit symbols follow the RSGB specification.',
  circuitColumn: 500,

  /** Every circuit this page draws, with what flows in it, for the checkers. */
  allLayouts: () => {
    const out = [];
    ['half', 'ct', 'bridge'].forEach(kind => [1e-3, 0].forEach(c => {
      const s = rectSim(kind, 12, c, 15, false);
      const names = RECT_NAMES[kind].filter(k => c > 0 || (k !== 'C1' && k !== 'W1'));
      out.push({ name: kind + (c ? ' with reservoir' : ' without'), layout: rectLayout(kind, c > 0),
                 flow: { mode: 'time', duration: 2 * PERIOD, hideStill: true,
                         currents: seriesFn(s.r.t.map(x => x - s.r.t[0]), s.dr, names) } });
    }));
    ['zener', 'feedback', 'ic'].forEach(kind => {
      const s = regSim(kind, 16, 4.7e-3, 1, 15, 6.8, 330);
      out.push({ name: 'stabiliser ' + kind, layout: regLayout(kind),
                 flow: { mode: 'time', duration: 2 * PERIOD,
                         currents: seriesFn(s.r.t.map(x => x - s.r.t[0]), s.dr, REG_NAMES[kind]) } });
    });
    const sw = smpsSim(100e3, 22e-6, 5);
    out.push({ name: 'switch mode output', layout: bridgeLayout(true, mainsTerms(75, 135, '', '')),
               flow: { mode: 'time', duration: 2e-5, hideStill: true,
                       currents: seriesFn(sw.r.t.map(x => x - sw.r.t[0]), sw.dr, RECT_NAMES.bridge) } });
    return out;
  },

  bank: {
    url: 'https://rsgb.services/public/exams/eqdb/',
    topic: '2J - Cells and power supplies',
    note: 'The RSGB bank covers Full only; pick section 2 in its Filter by Topic list.'
  },

  intro: {
    foundation: [
      'A radio needs a steady supply of direct current. At Foundation that comes from cells and batteries, and this page says what a battery is, where its energy comes from and how to look after one.',
      'The circuits further down the page, rectifiers and regulators, belong to the Intermediate and Full levels. Switch level at the top to see them.'
    ],
    intermediate: [
      'A mains power supply turns 230 V AC into the steady 13.8 V or so a radio wants. A transformer brings the voltage down, a rectifier makes it flow one way, a reservoir capacitor smooths it, and a regulator holds it steady.',
      'Here each of those circuits is stepped through time with real diodes, which drop about 0.7 V and more at the peak, and a real transistor. So what you see is what the circuit does, not a picture of the textbook answer.'
    ],
    full: [
      'At Full the questions go inside the boxes: what reverse voltage each rectifier diode must block, how the Zener, the pass transistor and the error amplifier hold the output, and why a switch mode supply can use a smaller capacitor.',
      'Each section shows the exam’s rule with your values in it, beside the circuit solved without its simplifications. Where they differ, usually by a diode drop or two, the readouts say by how much.'
    ]
  },

  /*
   * Read before this page was designed. Our own summary of what each source
   * insists on; no wording from any of them appears here.
   */
  sources: {
    read: [
      'Foundation session 3, Intermediate session 7 and Full session 9 of the course (course.g0lft.org)',
      'Syllabus 2024 v1.6b, items 2J1 to 2J4, with the level lists for which sentence belongs to which level',
      'EX309 Full reference booklet: V<sub>RMS</sub> = V<sub>peak</sub> ÷ √2, the divider and P = IV are on it; the PIV rules and V<sub>BE</sub> are not',
      'The licence manuals and Exam Secrets, power supplies at each level'
    ],
    keyMessages: [
      { at: '2J1', level: 'foundation', point: 'a battery is cells in series; it stores chemical energy and has a potential difference across it' },
      { at: '2J1', level: 'foundation', point: 'unwanted batteries go for proper disposal; rechargeable cells reverse their chemistry' },
      { at: '2J1', level: 'intermediate', point: 'different chemistries give different cell voltages; capacity is in ampere-hours' },
      { at: '2J2', level: 'intermediate', point: 'half wave, centre tap full wave and bridge: one pulse a cycle or two' },
      { at: '2J2', level: 'full', point: 'a stabiliser holds the output steady; a Zener gives the reference and a pass transistor carries the load' },
      { at: '2J2', level: 'full', point: 'with a divider and error amplifier, the Zener is the divided output less 0.7 V' },
      { at: '2J3', level: 'intermediate', point: 'the reservoir charges near each peak and feeds the load between; AC, pulsed DC and smoothed DC look different' },
      { at: '2J3', level: 'full', point: 'PIV: twice the peak for half wave with a reservoir and for centre tap, the peak for a bridge' },
      { at: '2J3', level: 'full', point: 'replace failed rectifiers with PIV and current ratings at least the originals' },
      { at: '2J4', level: 'intermediate', point: 'linear supplies, discrete or IC; against switch mode: size, weight, heat, efficiency, RFI, cost' },
      { at: '2J4', level: 'full', point: 'switch mode blocks: rectify the mains, switch fast, ferrite transformer, rectify, smooth, feed back through an opto-isolator' },
      { at: '2J4', level: 'full', point: 'switching fast shortens the gap between charging pulses, so the capacitor can be smaller' }
    ]
  },

  controls: [
    { id: 'vsec', label: 'Secondary voltage, RMS', unit: 'V', range: [3, 40], start: 12,
      desc: 'The transformer’s secondary. For the centre tap, each half of it', snap: v => Math.round(v * 10) / 10 },
    { id: 'cres', label: 'Reservoir capacitor', unit: 'F', range: [1e-6, 22e-3], start: 4.7e-3,
      desc: 'Far left is none at all', snap: v => v < 1.4e-6 ? 0 : snapTo(v, E6) },
    { id: 'rl', label: 'Load resistance', unit: 'Ω', range: [2.2, 1000], start: 15,
      desc: 'What the supply feeds. Less resistance draws more current', snap: v => snapTo(v, E12) },
    { id: 'vsreg', label: 'Transformer secondary, RMS', unit: 'V', range: [10, 30], start: 16,
      desc: 'Feeding a bridge rectifier and the reservoir, which feed the regulator', snap: v => Math.round(v * 10) / 10 },
    { id: 'creg', label: 'Reservoir capacitor', unit: 'F', range: [470e-6, 22e-3], start: 4.7e-3,
      desc: 'Smaller leaves more ripple on the regulator’s input', snap: v => snapTo(v, E6) },
    { id: 'ireg', label: 'Load current', unit: 'A', range: [0.05, 3], start: 1,
      desc: 'What the load draws at the regulator’s intended output', snap: v => sig2(v) },
    { id: 'vz', label: 'Zener voltage', unit: 'V', range: [3.3, 30], start: 15,
      desc: 'The reference held on the pass transistor’s base', snap: v => nearestOf(v, ZENERS) },
    { id: 'vref', label: 'Zener voltage', unit: 'V', range: [3, 12], start: 6.8,
      desc: 'The reference held on the error amplifier’s emitter', snap: v => Math.round(v * 10) / 10 },
    { id: 'r1', label: 'R1, top of the divider', unit: 'Ω', range: [68, 1000], start: 330,
      desc: 'R2, the bottom, is 330 Ω. A bigger R1 gives a higher output', snap: v => snapTo(v, E12) },
    { id: 'fs', label: 'Switching frequency', unit: 'Hz', range: [50, 200e3], start: 100e3,
      desc: 'How often the transistors switch, and so how often the output is topped up', snap: v => sig2(v) },
    { id: 'csw', label: 'Output capacitor', unit: 'F', range: [1e-6, 22e-3], start: 22e-6,
      desc: 'The reservoir after the output rectifier', snap: v => snapTo(v, E6) },
    { id: 'isw', label: 'Load current', unit: 'A', range: [0.5, 10], start: 5,
      desc: 'What the radio draws', snap: v => Math.round(v * 2) / 2 }
  ],

  /** Everything the working reads. The panels solve their own circuits. */
  derive: (v) => Object.assign({}, v),

  labels: () => ({}),

  /*
   * The equations. `given` records whether the Full reference booklet
   * (EX309) prints the formula; `tag` overrides the mark at a level.
   */
  equations: {
    vpk: { given: true, name: 'The peak of the winding’s voltage',
      eq: hue('v', 'V<sub>peak</sub>') + ' = √2 × ' + hue('v', 'V<sub>RMS</sub>'),
      work: d => ['1.414 × ' + b(t3(d.vsec)) + ' V', volts(d.vsec * Math.SQRT2)] },
    vout: { given: false, tag: { intermediate: 'interest' }, name: 'The peak across the load',
      eq: hue('v', 'V<sub>out</sub>') + ' ≈ ' + hue('v', 'V<sub>peak</sub>') + ' − the diode drops',
      work: d => { const s = rectFor(d), n = d.device === 'bridge' ? 2 : 1, so = TR.stats(s.r, s.vout);
        return [b(t3(s.vpk)) + ' − ' + n + ' × 0.7', volts(s.vpk - 0.7 * n) + '; solved, ' + volts(so.max) +
                ', as the drops are larger at the peak current and the winding has resistance']; } },
    rippleF: { given: false, tag: { intermediate: 'learn' }, name: 'How often the ripple repeats',
      eq: 'f<sub>ripple</sub> = f<sub>mains</sub> for half wave, 2 × f<sub>mains</sub> for full wave and bridge',
      work: d => d.device === 'half' ? [b('50') + ' Hz × 1', '50 Hz'] : ['2 × ' + b('50') + ' Hz', '100 Hz'] },
    ripple: { given: false, tag: { intermediate: 'interest', full: 'interest' }, name: 'Ripple, roughly',
      eq: hue('v', 'ΔV') + ' ≈ ' + hue('i', 'I') + ' ÷ (f<sub>ripple</sub> × ' + hue('c', 'C') + ')',
      applies: d => d.cres > 0,
      work: d => { const s = rectFor(d, false), f = (d.device === 'half' ? 1 : 2) * F_MAINS;
        const il = TR.stats(s.r, s.dr.RL).mean, so = TR.stats(s.r, s.vout);
        return [b(t3(il)) + ' A ÷ (' + b(f) + ' Hz × ' + b(farads(d.cres)) + ')',
                volts(il / (f * d.cres)) + '; solved, ' + volts(so.pp)]; } },
    pivNone: { given: false, name: 'PIV, one diode with no reservoir',
      eq: 'PIV = ' + hue('v', 'V<sub>peak</sub>'), applies: d => d.device === 'half0',
      work: d => ['√2 × ' + b(t3(d.vsec)) + ' V', volts(pivRule('half0', d.vsec))] },
    pivHalf: { given: false, name: 'PIV, one diode with a reservoir',
      eq: 'PIV = 2 × ' + hue('v', 'V<sub>peak</sub>'), applies: d => d.device === 'half',
      work: d => ['2 × 1.414 × ' + b(t3(d.vsec)) + ' V', volts(pivRule('half', d.vsec))] },
    pivCt: { given: false, name: 'PIV, centre tap',
      eq: 'PIV = 2 × ' + hue('v', 'V<sub>peak</sub>') + ' of each half', applies: d => d.device === 'ct',
      work: d => ['2 × 1.414 × ' + b(t3(d.vsec)) + ' V', volts(pivRule('ct', d.vsec))] },
    pivBridge: { given: false, name: 'PIV, each diode of a bridge',
      eq: 'PIV = ' + hue('v', 'V<sub>peak</sub>') + ' of the whole winding', applies: d => d.device === 'bridge',
      work: d => ['1.414 × ' + b(t3(d.vsec)) + ' V', volts(pivRule('bridge', d.vsec))] },
    vzPass: { given: false, name: 'The output of a Zener and pass transistor',
      eq: hue('v', 'V<sub>out</sub>') + ' = ' + hue('v', 'V<sub>Z</sub>') + ' − 0.7',
      applies: d => d.device === 'zener',
      work: d => [b(t3(d.vz)) + ' − 0.7', volts(d.vz - 0.7) + '; solved, ' + volts(regFor(d).sOut.mean)] },
    vzDiv: { given: false, name: 'The output set by the divider',
      eq: hue('v', 'V<sub>out</sub>') + ' = (' + hue('v', 'V<sub>Z</sub>') + ' + 0.7) × (R1 + R2) ÷ R2',
      applies: d => d.device === 'feedback',
      work: d => ['(' + b(t3(d.vref)) + ' + 0.7) × (' + b(t3(d.r1)) + ' + ' + b(R2) + ') ÷ ' + b(R2),
                  volts(regRule('feedback', d.vz, d.vref, d.r1)) + '; solved, ' + volts(regFor(d).sOut.mean)] },
    vzBack: { given: false, name: 'Choosing the Zener for an output',
      eq: hue('v', 'V<sub>Z</sub>') + ' = ' + hue('v', 'V<sub>out</sub>') + ' × R2 ÷ (R1 + R2) − 0.7',
      applies: d => d.device === 'feedback',
      work: d => { const vo = regRule('feedback', d.vz, d.vref, d.r1);
        return [b(t3(vo)) + ' × ' + b(R2) + ' ÷ (' + b(t3(d.r1)) + ' + ' + b(R2) + ') − 0.7',
                volts(vo * R2 / (d.r1 + R2) - 0.7)]; } },
    heat: { given: true, tag: { intermediate: 'interest' }, name: 'Heat in the pass transistor',
      eq: hue('p', 'P') + ' = (' + hue('v', 'V<sub>in</sub>') + ' − ' + hue('v', 'V<sub>out</sub>') + ') × ' + hue('i', 'I'),
      work: d => { const s = regFor(d);
        return ['(' + b(t3(s.sIn.mean)) + ' − ' + b(t3(s.sOut.mean)) + ') × ' + b(t3(s.iL.mean)) + ' A',
                watts((s.sIn.mean - s.sOut.mean) * s.iL.mean) + ' on average; solved, ' + watts(s.sHeat.mean)]; } },
    eff: { given: false, tag: { intermediate: 'interest', full: 'interest' }, name: 'Efficiency of the regulator',
      eq: 'efficiency = ' + hue('p', 'P<sub>out</sub>') + ' ÷ ' + hue('p', 'P<sub>in</sub>'),
      work: d => { const s = regFor(d), po = s.sOut.mean * s.iL.mean;
        return [b(t3(po)) + ' W ÷ ' + b(t3(po / s.eff)) + ' W', Math.round(s.eff * 100) + '%']; } },
    gap: { given: false, tag: { full: 'interest' }, name: 'The gap between charging pulses, at most',
      eq: 't = 1 ÷ (2 × f)',
      work: d => ['1 ÷ (2 × ' + b(Fm.eng(d.fs, 'Hz', 3)) + ')', Fm.eng(1 / (2 * d.fs), 's', 3) +
                  ' (half of that here, as each switch is on for half its turn)'] },
    cfor: { given: false, tag: { full: 'interest' }, name: 'The capacitor for a given ripple',
      eq: hue('c', 'C') + ' ≈ ' + hue('i', 'I') + ' × t ÷ ' + hue('v', 'ΔV'),
      work: d => { const s = smpsSim(d.fs, d.csw, d.isw), il = TR.stats(s.r, s.dr.RL).mean;
        return [b(t3(il)) + ' A × ' + b(Fm.eng(s.gap, 's', 3)) + ' ÷ ' + b(volts(s.sOut.pp)),
                Fm.eng(il * s.gap / Math.max(1e-9, s.sOut.pp), 'F', 2) + ', against ' + Fm.eng(d.csw, 'F', 2) + ' fitted'] } }
  },

  /* Words this page introduces, defined where they are first used. */
  terms: {
    'cell': 'One unit that turns stored chemical energy into electrical energy, with a fixed voltage set by its chemistry: 1.5 V for an alkaline cell, 2 V for lead acid.',
    'battery': 'Cells joined together, usually in series so their voltages add: six 2 V lead acid cells make a 12 V car battery.',
    'potential difference': 'The voltage between two points, such as a battery’s terminals. It is what pushes current round a circuit.',
    'rechargeable': 'A cell whose chemical reaction can be run backwards by a charger, also called a secondary cell. A primary cell, such as an ordinary alkaline one, cannot be recharged.',
    'ampere-hour': 'The unit of a battery’s capacity, written Ah: the charge it holds. 7 Ah could supply 1 A for 7 hours, or 7 A for one hour.',
    'rectifier': 'One or more diodes that let current through one way only, turning AC into DC that flows one way in pulses.',
    'half wave': 'A rectifier with one diode. It passes one half of each cycle and wastes the other: one pulse a cycle.',
    'full wave': 'A rectifier that uses both halves of each cycle, turning the second half the right way up: two pulses a cycle.',
    'centre tap': 'A connection to the middle of a transformer’s secondary. Two diodes, one to each end, make a full wave rectifier.',
    'bridge rectifier': 'Four diodes in a ring. Two conduct on each half of the cycle, so it is full wave without a centre tap.',
    'pulsed DC': 'What a rectifier gives with nothing to smooth it: current one way only, in pulses that fall to zero between.',
    'reservoir capacitor': 'A large capacitor across a rectifier’s output. It fills up near each peak and feeds the load between them.',
    'ripple': 'The rise and fall left on a smoothed supply, as the reservoir is topped up and then drained by the load.',
    'stabiliser': 'A circuit that holds a supply’s output at one voltage whatever the load and the mains do. Also called a regulator.',
    'series pass transistor': 'The transistor in series with the load in a stabiliser. It carries the whole load current and drops the spare voltage.',
    'error amplifier': 'The transistor in a stabiliser that compares a fraction of the output with the Zener and steers the pass transistor to correct any difference.',
    'dropout': 'When the stabiliser’s input falls too close to its output, so it can no longer hold the output and the ripple gets through.',
    'peak inverse voltage': 'The largest reverse voltage a rectifier diode has across it in a circuit, written PIV. A diode’s PIV rating must be more than this.',
    'surge': 'The large current that flows at switch-on, while the empty reservoir capacitor charges.',
    'linear power supply': 'A supply that steps the mains down with a transformer, rectifies and smooths it, and holds the output steady with a pass transistor that is always partly on.',
    'switch mode power supply': 'A supply that rectifies the mains first, then switches it on and off very fast through a small ferrite transformer, and rectifies and smooths that.',
    'opto-isolator': 'A light emitting diode and a light sensor in one package, separated by an insulating gap. A signal crosses as light; nothing conducts.'
  },

  panels: PANELS,

  /* ---- the four items, in reading order ---- */
  items: [
    {
      code: '2J1',
      levels: ['foundation', 'intermediate'],
      introduces: {
        foundation: ['cell', 'battery', 'potential difference', 'rechargeable'],
        intermediate: ['cell', 'ampere-hour']
      },
      panel: null,
      heading: { foundation: 'Cells and batteries', intermediate: 'Cell voltages and capacity' },
      lead: {
        foundation: 'A battery is a store of chemical energy that gives it up as electrical energy. Most are several cells joined in series.',
        intermediate: 'The chemistry inside a cell sets its voltage. How much charge it holds, its capacity, is measured in ampere-hours.'
      },
      headline: {
        foundation: 'Cells and batteries, and where the energy in them comes from.',
        intermediate: 'Different chemistries give different voltages. Capacity is measured in ampere-hours.'
      },
      workNote: {
        foundation: 'Nothing to work out here. Foundation session 3 of the course has the slides A battery is cells in series and How much is in the battery?',
        intermediate: 'Hours of use = capacity in ampere-hours ÷ current in amps, near enough: a 17 Ah battery feeding 2 A lasts about 8.5 hours. Intermediate session 7 of the course has the slides Cells and Capacity, each with buttons to try.'
      },
      explain: {
        foundation: [
          'Inside a cell, two different materials sit in a chemical called the electrolyte. The reaction between them pushes electrons out of one terminal and takes them in at the other, so there is a potential difference across the terminals: the cell’s voltage. Connect a circuit and current flows, and the chemical energy is turned into electrical energy as it does.',
          'One cell gives only a volt or two, so most batteries are several cells in series, each one adding its voltage to the last. A 9 V battery is six small 1.5 V cells; a 12 V car battery is six 2 V lead acid cells.',
          'Some cells can be recharged: a charger drives current in backwards and the chemical reaction runs in reverse, storing energy again. Those are rechargeable or secondary cells, such as lead acid, nickel metal hydride and lithium ion. Ordinary alkaline cells are primary cells and cannot be recharged safely.',
          'A battery can deliver a very large current if its terminals are shorted, enough to melt a wire or start a fire, so keep loose terminals covered. Charge each type only with the charger meant for it. When a battery is finished, do not put it in the household rubbish: take it to a battery recycling point, where its metals and chemicals can be dealt with safely.'
        ],
        intermediate: [
          'Each chemistry gives its own cell voltage. Typical figures: alkaline 1.5 V, not rechargeable; nickel metal hydride 1.2 V; lead acid 2 V, so six make a 12 V battery; lithium ion about 3.6 to 3.7 V; lithium iron phosphate about 3.2 V, so four make about 12.8 V. The exam asks you to know that they differ; the exact chemistries are for interest.',
          'A lead acid battery is charged at about 13.8 V, and that is why radio equipment is designed for 13.8 V: it runs from a car battery being charged, or from a bench supply set to the same voltage.',
          'A battery’s capacity, the charge it holds, is measured in ampere-hours. In principle a 17 Ah battery supplies 1 A for 17 hours or 17 A for one hour, so the time it lasts is about its capacity divided by the current. A handheld drawing 0.5 A on receive from a 2 Ah pack lasts about 4 hours.',
          'Beyond the syllabus: a real battery gives less than its rated capacity at high currents, and lead acid lasts many more cycles if it is not run flat. A transmitter drawing 20 A from a 17 Ah battery will not manage the 50 minutes the sum suggests.'
        ]
      }
    },

    {
      code: '2J2',
      levels: ['intermediate', 'full'],
      introduces: {
        intermediate: ['rectifier', 'half wave', 'full wave', 'centre tap', 'bridge rectifier', 'pulsed DC', 'reservoir capacitor', 'ripple'],
        full: ['stabiliser', 'series pass transistor', 'error amplifier', 'dropout']
      },
      panel: { intermediate: 'rect', full: 'reg' },
      circuit: 'bridge',
      toggle: { label: 'Circuit', levels: ['intermediate', 'full'],
                options: [['half', 'Half wave'], ['ct', 'Centre tap'], ['bridge', 'Bridge'],
                          ['zener', 'Zener and pass transistor'], ['feedback', 'With an error amplifier']] },
      heading: { intermediate: 'Three rectifiers', full: 'Holding the output steady' },
      lead: {
        intermediate: 'A diode lets current one way only. One diode, two with a centre tap, or four in a bridge each turn AC into DC, and each leaves a different ripple.',
        full: 'A stabiliser takes the rippling DC off the reservoir and holds its output steady. A Zener sets the voltage; a transistor carries the current.'
      },
      headline: {
        intermediate: 'Half wave, full wave and bridge rectifiers, and how each one turns AC into DC.',
        full: 'Stabilising circuits, and how they hold the output steady when the load changes.'
      },
      presets: [
        { label: 'Half wave', levels: ['intermediate'], values: { toggle: 'half', vsec: 12, cres: 4.7e-3, rl: 15 },
          note: '12 V RMS, 4.7 mF, 15 Ω' },
        { label: 'Bridge', levels: ['intermediate'], values: { toggle: 'bridge', vsec: 12, cres: 4.7e-3, rl: 15 } },
        { label: 'No reservoir: pulsed DC', levels: ['intermediate'], values: { toggle: 'bridge', vsec: 12, cres: 1e-6, rl: 15 } },
        { label: 'Course example', levels: ['intermediate'], values: { toggle: 'bridge', vsec: 11.3, cres: 1e-3, rl: 16 } },
        { label: '15 V Zener', levels: ['full'], values: { toggle: 'zener', vsreg: 16, creg: 4.7e-3, ireg: 1, vz: 15 },
          note: '16 V RMS, 4.7 mF, 1 A' },
        { label: 'Equal resistors and 6.8 V', levels: ['full'], values: { toggle: 'feedback', vsreg: 16, creg: 4.7e-3, ireg: 1, vref: 6.8, r1: 330 } },
        { label: 'Dropping out', levels: ['full'], values: { toggle: 'feedback', vsreg: 16, creg: 1e-3, ireg: 1, vref: 6.8, r1: 330 } }
      ],
      formulas: {
        intermediate: ['vpk', 'vout', 'rippleF'],
        full: ['vzPass', 'vzDiv', 'vzBack', 'heat']
      },
      workLead: {
        intermediate: 'The winding’s peak, what the diodes leave of it, and how often the ripple repeats:',
        full: d => d.device === 'zener'
          ? 'The rule for the output, then the heat the pass transistor sheds:'
          : 'The output the divider sets, the same sum turned round to choose the Zener, then the heat:'
      },
      workNote: {
        intermediate: 'Only the ripple frequency is for learning: 50 Hz from a half wave rectifier, 100 Hz from full wave or a bridge on 50 Hz mains. The diode drops are for interest; the solved figure shows they grow with the current.',
        full: 'V<sub>BE</sub> ≈ 0.7 V is not on the sheet: learn it. The divider and P = IV are. The bench uses 330 Ω for R2, so the divider carries many times Q2’s base current and is not upset by it; only the ratio R1 : R2 enters the sum.'
      },
      explain: {
        intermediate: [
          'The circuit is a mains transformer and a rectifier feeding a load, with a reservoir capacitor across it. The graph shows two cycles of the mains, solved step by step: above, the winding’s voltage, dashed, and what reaches the load; below, the current through the diodes and through the load. The moving dots show conventional current, and only the diodes that are conducting carry any.',
          'Choose Half wave. One diode passes the half of each cycle that drives it forward and blocks the other half, so there is one pulse a cycle and half of every cycle is wasted. Press No reservoir: pulsed DC to see the pulses on their own, falling to zero between.',
          'Choose Centre tap. The two halves of the winding take turns: on one half of the cycle the top half drives current through D1, on the other the bottom half drives it through D2, and both push it the same way through the load. Two pulses a cycle, but it needs a centre-tapped secondary, each half giving the full voltage.',
          'Choose Bridge. Four diodes, and no centre tap needed: D1 and D4 conduct on one half of the cycle, D2 and D3 on the other, and the load current always flows the same way. Watch the dots switch path. The cost is two diodes in the path at once, so the output is about 1.4 V below the winding’s peak, against 0.7 V for the other two. At the peak current each drops nearer 0.9 V, and the winding’s resistance takes a little more: the readout gives the total.',
          'With the reservoir in, the output sits near the peak with a ripple on it, at 50 Hz from the half wave rectifier and 100 Hz from the other two. Press Course example: 16 V peak, 16 Ω and 1000 µF, the course’s values, and see what the diode drops and the winding take off.',
          'The primary of a mains transformer is at 230 V. Building or probing on the mains side is for those who know how to do it safely; everything you need to see is on the low voltage side.'
        ],
        full: [
          'The reservoir’s output rises and falls with the ripple, and it changes with the mains and the load. A stabiliser holds the output at one voltage regardless. Here a bridge and a reservoir feed it, solved over two cycles; the input is dashed, the output solid, and the lower graph is the heat in the pass transistor.',
          'Choose Zener and pass transistor. The Zener diode, reverse biased and fed through R, holds Q1’s base at its voltage. Q1, the series pass transistor, is an emitter follower in series with the load: its emitter sits one base emitter drop below its base, so the output is V<sub>Z</sub> − 0.7 V. A 15 V Zener gives about 14.3 V. Q1 carries the whole load current, and the Zener provides the reference.',
          'Choose With an error amplifier. R1 and R2 feed a fraction of the output to Q2’s base, and Q2’s emitter is held at V<sub>Z</sub> by the Zener, which Q2’s own current keeps conducting, as in the course’s drawing. If the output starts to fall, Q2 conducts less, more of R3’s current drives Q1, and the output comes back up: negative feedback. Balanced, Q2’s base sits at V<sub>Z</sub> + 0.7, so the output is (V<sub>Z</sub> + 0.7) × (R1 + R2) ÷ R2. Two equal resistors and a 6.8 V Zener give 15 V. Turned round, a wanted output sets the Zener: divide the output down, then take off 0.7 V. Compare the two circuits at the same load: the ripple on the output is smaller with the error amplifier, several times smaller at the default 1 A.',
          'Press Dropping out. The reservoir is only 1 mF, so it droops far between pulses and its troughs fall below the 15 V the output is set for. Q1’s collector is fed from the reservoir, so the output cannot be higher than that: at each trough it follows the input down and the ripple gets through. The readout says so. A stabiliser needs headroom even at the lowest point of the ripple.',
          'An IC regulator, such as a 7812, holds the same parts in one package: a reference, an error amplifier and a pass transistor, with current limiting and thermal shutdown added. It needs about 2 V of headroom. In a circuit diagram it is the three-legged box between the reservoir and the output.',
          'Beyond the syllabus: R5 and C3 smooth the supply to R3, a common refinement that the course’s drawing and exam diagrams leave out. Without them the reservoir’s ripple would drive a rippling current through R3, and Q2 would have to soak it all up. The solved output sits within about a tenth of a volt of the rule at the usual settings, and moves by up to a few tenths of a volt at the ends of the load and input ranges, because V<sub>BE</sub> and the Zener’s voltage both change with the current through them. The rule is what the exam marks.', 'D2', 'D3', 'D4'], full: ['Z1', 'Q1'] },
      controls: { intermediate: ['vsec', 'cres', 'rl'], full: ['vsreg', 'creg', 'ireg', 'vz', 'vref', 'r1'] }
    },

    {
      code: '2J3',
      levels: ['intermediate', 'full'],
      introduces: {
        intermediate: ['reservoir capacitor', 'ripple', 'surge'],
        full: ['peak inverse voltage']
      },
      panel: { intermediate: 'reservoir', full: 'piv' },
      circuit: 'bridge',
      toggle: { label: 'Circuit', levels: ['intermediate', 'full'],
                options: [['half0', 'Half wave, no reservoir'], ['half', 'Half wave'], ['ct', 'Centre tap'], ['bridge', 'Bridge']] },
      heading: { intermediate: 'The reservoir capacitor', full: 'Peak inverse voltage' },
      lead: {
        intermediate: 'Switch on, and the empty reservoir fills in a burst of current. After that it tops up near each peak and feeds the load in between.',
        full: 'While a rectifier diode is off it has to block a reverse voltage. Read it off the circuit, and see how close the exam’s rule comes.'
      },
      headline: {
        intermediate: 'A reservoir capacitor fills the gaps between rectifier pulses and smooths what comes out.',
        full: 'Peak inverse voltage, and choosing a diode that will survive it.'
      },
      presets: [
        { label: 'Bridge, 4.7 mF, 15 Ω', levels: ['intermediate'], values: { toggle: 'bridge', vsec: 12, cres: 4.7e-3, rl: 15 },
          note: '12 V RMS, switched on into an empty reservoir' },
        { label: 'Half wave, the same', levels: ['intermediate'], values: { toggle: 'half', vsec: 12, cres: 4.7e-3, rl: 15 } },
        { label: 'Small reservoir, 470 µF', levels: ['intermediate'], values: { toggle: 'bridge', vsec: 12, cres: 4.7e-4, rl: 15 } },
        { label: 'Big reservoir, 22 mF', levels: ['intermediate'], values: { toggle: 'bridge', vsec: 12, cres: 22e-3, rl: 15 } },
        { label: '20 V RMS, half wave', levels: ['full'], values: { toggle: 'half', vsec: 20, cres: 4.7e-3, rl: 1000 },
          note: 'Light load, 1 kΩ' },
        { label: 'The same, bridge', levels: ['full'], values: { toggle: 'bridge', vsec: 20, cres: 4.7e-3, rl: 1000 } },
        { label: 'Half wave, heavy load', levels: ['full'], values: { toggle: 'half', vsec: 20, cres: 4.7e-3, rl: 10 } }
      ],
      formulas: { intermediate: ['ripple', 'rippleF'], full: ['vpk', 'pivNone', 'pivHalf', 'pivCt', 'pivBridge'] },
      workLead: {
        intermediate: 'The rule of thumb for the ripple, against the solved figure, and how often it repeats:',
        full: 'The winding’s peak, then the exam’s rule for this circuit:'
      },
      workNote: {
        intermediate: 'The ripple sum is beyond the syllabus, for interest: it assumes the reservoir feeds the load for the whole of each gap, so it comes out high. What the syllabus asks is that you know why the reservoir smooths, and recognise AC, pulsed DC and smoothed DC.',
        full: 'None of the PIV rules is on the sheet: learn them. V<sub>peak</sub> = √2 × V<sub>RMS</sub> is. The rules take the diodes as perfect; the solved figure is lower by about a diode drop, and lower again with a heavy load on the half wave rectifier. Choose the rule’s figure and a margin above it.'
      },
      explain: {
        intermediate: [
          'This is the rectifier switched on at a zero crossing of the mains, the reservoir empty, and the first six cycles solved. The upper graph is the voltage across the load, the lower the current through the diodes and through the load.',
          'Look at the first pulse. The empty reservoir is close to a short circuit, so the first half cycle drives a large current into it, limited only by the winding’s resistance and the diodes: many amps, several times any later pulse. That is the switch-on surge, and it is why supplies with big reservoirs have slow-blow fuses.',
          'Once settled, the reservoir is topped up for a short burst near each peak, the only time the winding’s voltage is above it, and in between the reservoir alone feeds the load and its voltage falls. The diodes carry the load’s whole share of charge in those short, tall pulses, which is why the peak diode current is several times the load current.',
          'Press Small reservoir and then Big reservoir. A bigger capacitor holds more charge for the same voltage, so it falls less between top-ups: less ripple. A heavier load, less resistance, drains it faster: more ripple. The half wave rectifier tops it up only once a cycle, so it leaves about twice the ripple of the bridge.',
          'The readout puts the solved ripple beside a rule of thumb, I ÷ (f × C). The rule comes out high, by about 40% at the default settings, because it assumes the reservoir feeds the load for the whole gap between pulses, when the diodes take over for part of it.',
          'A charged reservoir can hold its voltage long after the supply is switched off. In a high voltage supply that is dangerous, which is why such supplies have a bleeder resistor across the capacitor. Even so, check with a meter that it has discharged before touching anything.'
        ],
        full: [
          'The lower graph is the reverse voltage across D1, read from the solved circuit over two cycles: its peak is the PIV. The dotted line is the exam’s rule for the circuit chosen.',
          'Choose Half wave, no reservoir. With D1 off, the load carries no current and the whole winding voltage is across the diode: the PIV is the peak, V<sub>peak</sub> = √2 × V<sub>RMS</sub>.',
          'Choose Half wave, with the reservoir. At the positive peak C charges to about V<sub>peak</sub>. Half a cycle later the winding is at −V<sub>peak</sub> while C still holds its charge, so D1 has both in series across it: about 2 × V<sub>peak</sub>. Press 20 V RMS, half wave: the peak is 28.3 V, the rule says 56.6 V, and the solved PIV is about 55 V, a diode drop and a little ripple lower.',
          'Choose Centre tap. While D1 is off, D2 is conducting and puts the far end of the winding on the output, so D1 has the whole winding across it, both halves: 2 × V<sub>peak</sub> of each half.',
          'Choose Bridge. When D1 is off, D3 is on, so D1 sees the output plus one diode drop: about V<sub>peak</sub> of the whole winding. Two diodes share the job. For the same output a bridge needs diodes of half the rating of a centre tap circuit.',
          'Press Half wave, heavy load. The reservoir now sags between pulses, and the PIV falls several volts below the light-load figure. The rule does not change: design for the worst case, the lightest load, and add a margin for spikes on the mains.',
          'When a rectifier fails it usually fails short circuit, which can take out the fuse, the transformer or the reservoir. Replace it with a diode whose PIV and current ratings are at least those of the original. The readout gives the peak current in D1 as well: in the short charging pulses it is several times the load current.'
        ]
      },
      highlight: { intermediate: ['C1'], full: ['D1'] },
      controls: ['vsec', 'cres', 'rl']
    },

    {
      code: '2J4',
      levels: ['intermediate', 'full'],
      introduces: {
        intermediate: ['linear power supply', 'switch mode power supply'],
        full: ['switch mode power supply', 'opto-isolator']
      },
      panel: { intermediate: 'reg', full: 'smps' },
      circuit: 'zener',
      toggle: { label: 'Regulator', levels: ['intermediate'],
                options: [['zener', 'Discrete: Zener and transistor'], ['ic', 'IC regulator']] },
      heading: { intermediate: 'Linear supplies, and switch mode', full: 'Inside a switch mode supply' },
      lead: {
        intermediate: 'A linear supply’s regulator acts like a resistor that adjusts itself: it drops whatever voltage is spare, and turns it into heat.',
        full: 'A switch mode supply tops up its output capacitor thousands of times a second rather than a hundred. Raise the frequency and see what that does to the ripple.'
      },
      headline: {
        intermediate: 'Linear power supplies, and how they stack up against switch mode ones.',
        full: 'How a switch mode supply works, at block diagram level.'
      },
      presets: [
        { label: 'Discrete, 1 A', levels: ['intermediate'], values: { toggle: 'zener', vsreg: 16, creg: 4.7e-3, ireg: 1, vz: 15 },
          note: '16 V RMS, 4.7 mF' },
        { label: 'IC, 1 A', levels: ['intermediate'], values: { toggle: 'ic', vsreg: 16, creg: 4.7e-3, ireg: 1 } },
        { label: 'IC, 2.5 A, 2.2 mF', levels: ['intermediate'], values: { toggle: 'ic', vsreg: 16, creg: 2.2e-3, ireg: 2.5 } },
        { label: '100 kHz, 22 µF', levels: ['full'], values: { fs: 100e3, csw: 22e-6, isw: 5 }, note: '5 A' },
        { label: '20 kHz', levels: ['full'], values: { fs: 20e3, csw: 22e-6, isw: 5 } },
        { label: '1 kHz', levels: ['full'], values: { fs: 1e3, csw: 22e-6, isw: 5 } },
        { label: '50 Hz, 22 mF', levels: ['full'], values: { fs: 50, csw: 22e-3, isw: 5 } }
      ],
      formulas: { intermediate: ['heat', 'eff'], full: ['gap', 'cfor'] },
      workLead: {
        intermediate: 'The heat the pass transistor sheds, and what share of the power reaches the load:',
        full: 'The longest the capacitor has to carry the load, and the capacitor that needs for this ripple:'
      },
      workNote: {
        intermediate: 'Neither sum is asked for at Intermediate; P = IV is on the Full sheet. What the syllabus asks is that you know a linear supply wastes its spare voltage as heat, and how linear and switch mode compare.',
        full: 'Both sums are for interest: the exam asks why the capacitor can be smaller, not how small. The answer is the time between charging pulses.'
      },
      explain: {
        intermediate: [
          'A linear power supply is the chain from the sections above: a mains transformer, a rectifier, a reservoir, then a regulator. The regulator here is fed by a bridge and a 4.7 mF reservoir, solved over two cycles; the dashed line is its input, the solid line its output.',
          'Choose Discrete. A Zener diode holds the base of a power transistor at a fixed voltage, and the transistor, in series with the load, passes the current: the output is the Zener voltage less about 0.7 V. The input ripples by a volt or more; the output hardly moves.',
          'The transistor is always partly on. Whatever voltage is spare, input less output, is across it while the whole load current goes through it, so it turns (V<sub>in</sub> − V<sub>out</sub>) × I into heat: the lower graph, in red. That is why linear supplies have big heatsinks, and why the heat grows with the load current.',
          'Choose IC regulator. A three-terminal IC, such as a 7812 for 12 V, holds the whole regulator in one package: input, output and a common lead to 0 V. Inside are the same reference, transistor and feedback. Press IC, 2.5 A, 2.2 mF: with a heavier load and a smaller reservoir the input droops further between pulses, the troughs come within 2 V of the output, and the IC loses control there: the ripple gets through. It needs about 2 V to spare even at the troughs.',
          'A switch mode power supply avoids most of that waste. It rectifies the mains straight away, switches the DC on and off tens of thousands of times a second through a small ferrite transformer, then rectifies and smooths the result. The switching transistor is either fully on or fully off, so it wastes little.',
          'Comparing them: a linear supply is big and heavy, because of its mains transformer, runs warm and is less efficient, needs a mains voltage near the one it was designed for, and gives a clean output with no radio interference. A switch mode supply is small, light and efficient, runs cool and often accepts a wide range of input voltage, but its fast switching can cause RF interference unless it is well filtered. At higher powers it is usually the cheaper.'
        ],
        full: [
          'The blocks of a switch mode supply, in order: a mains filter, which keeps the supply’s switching noise out of the mains; a rectifier and reservoir giving about 325 V DC straight off the mains; switching transistors running at tens or hundreds of kilohertz; a small ferrite transformer, which steps the square wave down and isolates the output; fast rectifiers; and a small filter capacitor at the output. Feedback compares the output with a reference and adjusts how long the transistors stay on.',
          'The feedback has to cross from the low voltage output back to the switching circuit, which is connected to the mains. It goes through an opto-isolator, as light across an insulating gap, so that nothing conducts across and the output stays isolated from the mains. That is for safety, not for speed or RF.',
          'The circuit here is the output stage, simplified: the ferrite transformer’s secondary, a square wave at the switching frequency, a bridge, the output capacitor and the load. Press 100 kHz, 22 µF: the capacitor is topped up every 5 µs, the gap between charging pulses is a couple of microseconds, and 22 µF holds the ripple to a fraction of a volt at 5 A.',
          'Press 20 kHz and then 1 kHz, keeping 22 µF: the gaps get longer and the ripple grows, until at 1 kHz the capacitor can no longer hold the load up between pulses. The readout runs the same capacitor and load on 50 Hz mains through a bridge, where the gap is up to 10 ms: 22 µF cannot hold the load at all. Press 50 Hz, 22 mF: a thousand times the capacitance, and still about twice the ripple that 22 µF leaves at 100 kHz. The time between successive charging pulses is much shorter, so the capacitor can be much smaller.',
          'The same goes for the transformer: at tens of kilohertz a much smaller core and fewer turns pass the same power, so a ferrite transformer the size of a matchbox replaces a heavy laminated iron one. That is where a switch mode supply’s small size and weight come from.',
          'The price is interference. The fast switching edges are rich in harmonics, falling on every multiple of the switching frequency far up into HF. A poorly filtered supply puts a row of carriers or a rough hash across the bands, and radiates it from its leads. Good filtering, a screened case and ferrite chokes on the leads keep it down.',
          'Inside, the rectified mains is at about 325 V, and its reservoir can stay charged after the plug is pulled. Do not open a switch mode supply unless you know what you are doing.',
          'Beyond the syllabus: a real supply puts a choke between the rectifier and the capacitor, which smooths further and lets the feedback set the output by the transistors’ on-time. It is left out here so that the comparison with 50 Hz is like for like.'
        ]
      },
      highlight: { intermediate: ['Q1', 'U1'], full: ['C1'] },
      controls: { intermediate: ['vsreg', 'creg', 'ireg', 'vz'], full: ['fs', 'csw', 'isw'] }
    }
  ],

  /*
   * Our own explanation of each answer, keyed by the bank's reference number.
   * The question, its options and the marked answer are the RSGB's and ship
   * unadapted. Everything here is ours. A seed sets the bench to the
   * question's own values where they fit the controls.
   */
  answers: {
    '2025-Full3427': {
      why: 'This is the stabiliser with an error amplifier. The Zener sits on the error amplifier’s emitter, so it equals the voltage the divider puts on that transistor’s base, less 0.7 V: work out the divided output from the resistor values in the diagram, then take off 0.7 V. The key gives 7.5 V. The diagram is not reproduced on this page.',
      source: { eq: ['vzBack'], from: ['2J2'] }
    },
    '2025-Full350': {
      why: 'The Zener diode gives the reference: it holds its voltage whatever current it carries, and the stabiliser compares the output with it. The series pass transistor carries the load current, and the transformer and bridge come before the stabiliser.',
      source: { from: ['2J2'] },
      seed: { toggle: 'zener', vsreg: 16, creg: 4.7e-3, ireg: 1, vz: 15 },
      seedNote: 'The Zener holds Q1’s base at 15 V; the output follows it, 0.7 V lower.'
    },
    '2025-Full352': {
      why: 'A stabilised supply holds its output with a series pass transistor, which carries the load current, steered by a Zener diode, which sets the voltage. The bridge rectifier and the reservoir capacitor come before it and do not control the output.',
      source: { from: ['2J2'] },
      seed: { toggle: 'zener', vsreg: 16, creg: 4.7e-3, ireg: 1, vz: 15 },
      seedNote: 'The input ripples by more than a volt; the output, held by the Zener and Q1, barely moves.'
    },
    '2025-Full3595': {
      why: 'A three-legged device between the reservoir capacitor and the output, with its third leg to the common rail, is an integrated voltage regulator, such as a 7812. A series pass transistor would need a Zener and a resistor beside it. The diagram is not reproduced on this page.',
      source: { from: ['2J2', '2J4'] }
    },
    '2025-Full3794': {
      why: 'The divider puts a fraction of the output on the error amplifier’s base, and the Zener is one base emitter drop below that. With equal resistors the base sits at half the output. 12.7 V forgets to divide, 13.4 V is the output itself, and 0.7 V is the drop, not the Zener.',
      working: ['V<sub>base</sub> = 13.4 × 10 ÷ (10 + 10) = 6.7 V',
                'V<sub>Z</sub> = 6.7 − 0.7',
                '= 6 V'],
      source: { eq: ['vzBack'], from: ['2J2'] },
      seed: { toggle: 'feedback', vsreg: 16, creg: 4.7e-3, ireg: 1, vref: 6, r1: 330 },
      seedNote: 'The bench has a 6 V Zener and two equal resistors, 330 Ω rather than 10 kΩ: only the ratio enters the sum. Read the output: about 13.5 V, a little over the rule’s 13.4 V, as the Zener and V<sub>BE</sub> run slightly above their nominal values at the currents they carry here.'
    },
    '2025-Full7767': {
      why: 'In a linear supply the series pass transistor is always partly on, in class A, with the spare voltage across it and the whole load current through it, so it dissipates (V<sub>in</sub> − V<sub>out</sub>) × I as heat. Switching on and off at kilohertz and running the transformer above 50 Hz describe a switch mode supply.',
      source: { eq: ['heat'], from: ['2J2', '2J4'] },
      seed: { toggle: 'zener', vsreg: 16, creg: 4.7e-3, ireg: 1, vz: 15 },
      seedNote: 'Read the heat in the pass transistor, and drag the load current up.'
    },
    '2025-Full3428': {
      why: 'Work out the peak of the winding’s voltage, √2 × V<sub>RMS</sub>, then apply the rule for the circuit drawn: twice the peak for a single diode with a reservoir capacitor, the peak for a bridge. The keyed answer is 2500 V. At those voltages no single ordinary rectifier will do, and several are used in series. The diagram is not reproduced on this page.',
      source: { eq: ['vpk', 'pivHalf'], from: ['2J3'] }
    },
    '2025-Full344': {
      why: 'A replacement diode has to survive both the reverse voltage and the current of the original. A 12 V supply’s rectifiers see far more than 12 V reverse, and in the short charging pulses they carry several times the load current, so matching the PIV rating alone is not enough. A Zener is not a rectifier.',
      working: ['a bridge from a 12 V RMS winding: PIV about 1.414 × 12 = 17 V, more than 12 V',
                'the bench, 0.9 A to the load: 4.5 A peak in each diode',
                'so a PIV and a current rating at least those of the original diodes'],
      source: { eq: ['pivBridge'], from: ['2J3'] },
      seed: { toggle: 'bridge', vsec: 12, cres: 4.7e-3, rl: 15 },
      seedNote: 'A 12 V RMS bridge into 15 Ω: read the PIV and the peak current in D1.'
    },
    '2025-Full347': {
      why: 'One diode with a capacitor: at one peak the capacitor charges to the winding’s peak, and half a cycle later the winding’s opposite peak adds to it across the diode. So the PIV is twice the peak, not twice the RMS voltage.',
      working: ['V<sub>peak</sub> = 1.414 × 20 = 28.3 V',
                'half wave with a reservoir: PIV = 2 × 28.3 = 56.6 V',
                'about 60 V'],
      source: { eq: ['vpk', 'pivHalf'], from: ['2J3'] },
      seed: { toggle: 'half', vsec: 20, cres: 4.7e-3, rl: 1000 },
      seedNote: 'The bench: 20 V RMS, one diode, 4.7 mF, a light load. The solved PIV is a diode drop under 56.6 V.'
    },
    '2025-Full348': {
      why: 'With a smoothing capacitor the diode has the capacitor’s charge, about the peak, on one side, and the winding at its opposite peak on the other: twice the peak secondary voltage. Without the capacitor it would be the peak alone.',
      working: ['C holds about +V<sub>peak</sub>; the winding swings to −V<sub>peak</sub>',
                'across the diode: V<sub>peak</sub> + V<sub>peak</sub> = 2 × V<sub>peak</sub>',
                'so twice the peak secondary voltage'],
      source: { eq: ['pivHalf'], from: ['2J3'] },
      seed: { toggle: 'half', vsec: 12, cres: 4.7e-3, rl: 1000 },
      seedNote: 'Choose Half wave, no reservoir and back again: the PIV halves without the capacitor.'
    },
    '2025-Full3593': {
      why: 'The keyed answer, 30 V, fits a single diode with a reservoir capacitor: twice the peak of a 10 V RMS winding is 28.3 V, and 30 V is the smallest option above it. For a bridge it would be the peak, 14.1 V. The diagram is not reproduced on this page.',
      working: ['V<sub>peak</sub> = 1.414 × 10 = 14.1 V',
                'one diode with a reservoir: 2 × 14.1 = 28.3 V',
                'so at least 30 V'],
      source: { eq: ['vpk', 'pivHalf'], from: ['2J3'] },
      seed: { toggle: 'half', vsec: 10, cres: 4.7e-3, rl: 1000 },
      seedNote: '10 V RMS, one diode and a reservoir. Choose Bridge to see the PIV halve.'
    },
    '2025-Full4077': {
      why: 'Find the winding’s peak, √2 × V<sub>RMS</sub>, from the voltage in the diagram, and apply the rule for the circuit drawn: twice the peak for one diode with a reservoir capacitor, the peak for a bridge. The key gives 180 V. The diagram is not reproduced on this page.',
      source: { eq: ['vpk', 'pivHalf', 'pivBridge'], from: ['2J3'] }
    },
    '2025-Full7002': {
      why: 'In a switch mode supply the block between the switching transistors and the output rectifier is the transformer: a small ferrite one, which steps the high frequency square wave down and isolates the output from the mains. The filter comes first, at the mains input, and the smoothing capacitor after the output rectifier. The diagram is not reproduced on this page.',
      source: { from: ['2J4'] }
    },
    '2025-Full7682': {
      why: 'The output side of the supply must stay electrically isolated from the mains, for safety. An opto-isolator carries the feedback across as light, so nothing conducts from one side to the other. It is not there for RF, speed or ease of regulation.',
      source: { from: ['2J4'] }
    },
    '2025-Full7741': {
      why: 'A capacitor only has to carry the load between charging pulses. At the switching frequency those pulses come thousands of times more often than at 100 Hz, so far less charge, and far less capacitance, carries the load through each gap. The smoothing is still on the output side, and feedback does not remove the need for it.',
      working: ['50 Hz full wave: charging pulses up to 10 ms apart',
                '100 kHz: 5 µs apart, two thousand times closer',
                'the time between successive charging pulses is much shorter'],
      source: { eq: ['gap', 'cfor'], from: ['2J4'] },
      seed: { fs: 100e3, csw: 22e-6, isw: 5 },
      seedNote: '22 µF at 100 kHz and 5 A. The readout runs the same capacitor on 50 Hz mains.'
    },
    '2025-Full7770': {
      why: 'Power lost in a transistor is the voltage across it times the current through it. A switching transistor is either fully on, with almost no voltage across it, or fully off, with no current, so it wastes little; the linear pass transistor works in class A, always partly on. Ferrite cores and fast response are true of switch mode supplies but are not why they are efficient.',
      source: { eq: ['heat'], from: ['2J4'] }
    },
    '2025-Full7771': {
      why: 'The fast switching edges are rich in harmonics that fall all through HF, so a switch mode supply is a greater risk of RF interference than a linear one, which has no switching. The other options are not true in general.',
      source: { from: ['2J4'] }
    },
    '2025-Full7808': {
      why: 'A switch mode supply’s transformer runs at the switching frequency, several tens of kilohertz, which is why it can be a small ferrite one. It has no series pass transistor, and its output capacitors are topped up at the switching frequency, not at 100 Hz. Its harmonics make filtering more necessary, not less.',
      source: { from: ['2J4'] },
      seed: { fs: 50e3, csw: 22e-6, isw: 5 },
      seedNote: 'The output stage running at 50 kHz.'
    }
  },

  outro: {
    foundation: [
      'A battery is cells in series, turning chemical energy into electrical energy, with a potential difference across its terminals. Rechargeable cells run their chemistry backwards when charged; unwanted batteries go to a recycling point, never the bin.',
      'Foundation session 3 of the course covers batteries alongside volts, amps and ohms.'
    ],
    intermediate: [
      'Three things to take from this page. A half wave rectifier gives one pulse a cycle and 50 Hz ripple; full wave and bridge give two, and 100 Hz. The reservoir capacitor fills near each peak and feeds the load between, so a bigger capacitor or a lighter load leaves less ripple. And a linear regulator holds the output steady by turning the spare voltage into heat.',
      'The course session on transformers and power supplies walks through each circuit a half cycle at a time; this page shows the same circuits running.'
    ],
    full: [
      'Rules to learn, none on the sheet: PIV is twice the peak for half wave with a reservoir and for centre tap, the peak for a bridge; a Zener and pass transistor give V<sub>Z</sub> − 0.7; with a divider, the Zener is the divided output less 0.7. Real diodes make every PIV a little lower than the rule; design to the rule with a margin.',
      'A switch mode supply can use a smaller capacitor and transformer because it switches fast, which shortens the gap between charging pulses. Its feedback crosses through an opto-isolator for isolation, and its switching is a source of RF interference.'
    ]
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = BENCH;
if (typeof window !== 'undefined') window.BENCH = BENCH;
