/*
 * content/3I.js - The superhet receiver.
 *
 * Group 3I at Intermediate and Full: the superhet and the double superhet,
 * the mixer and its products, the IF and the image, the IF transformer and
 * coupled tuned circuits, and phase noise.
 *
 * The tuned circuits are solved by the nodal analysis engine. The IF
 * transformer is two tanks with a mutual inductance between them, the K
 * element, so its bandwidth, its humps and its dip are the circuit's and not
 * a drawn curve. The preselector is a tuned circuit tuned to the signal, and
 * the image rejection is its response at the image. The mixer is not a linear
 * circuit, so it is done the other way: its two inputs are sampled, multiplied
 * (or passed through a curved characteristic), and the spectrum is the
 * Fourier transform of the result, from dsp.js. Every tone is a whole number
 * of 5 kHz bins, so each product lands on one bin with no window needed.
 *
 * Headlines come from content/descriptions.json and are our own wording.
 */

const MN = window.MNA;
const Fm = window.Fmt;
const DS = window.DSP;
const NBSP = String.fromCharCode(160);

const F_IF = 455e3;          // the IF transformer's frequency, and the second IF of a double superhet
const L_IF = 100e-6;         // each winding of the IF transformer
const C_IF = 1 / (Math.pow(2 * Math.PI * F_IF, 2) * L_IF);
const L_RF = 1e-6;           // the preselector's coil; its capacitor tunes it to the signal
const SSB_BW = 2.4e3;        // an SSB filter's width, for the Q it needs

/*
 * Colours (README, Colours). Every response here is a voltage, so it is
 * drawn in the voltage colour; a second response of the same kind is
 * dashed, never faded. Frequencies, marks and the filter band are neutral.
 */
const INK = { v: '--q-v', i: '--q-i-ink', r: '--q-r', l: '--q-l', c: '--q-c', z: '--q-z', p: '--q-p' };
const hue = (k, html) => '<span style="color:var(' + INK[k] + ')">' + html + '</span>';
const DASH = [7, 5];
const dashSwatch = (c, label) =>
  '<span><i style="background:repeating-linear-gradient(90deg,' + c + ' 0 4px,transparent 4px 7px)"></i>' +
  '<span class="sw-l">' + label + '</span></span>';
// readout labels are set in capitals; a symbol inside one keeps its case
const sym = s => '<span style="text-transform:none">' + s + '</span>';

/* ---------------- numbers ---------------- */

const num = v => String(Number(Number(v).toPrecision(12)));
// a frequency to the figures a hand calculation keeps: 10.245 MHz, 535 kHz
function freq(f, s) {
  s = s || 5;
  const a = Math.abs(f);
  if (a >= 1e6) return Fm.trim(f / 1e6, s) + NBSP + 'MHz';
  if (a >= 1e3) return Fm.trim(f / 1e3, s) + NBSP + 'kHz';
  return Fm.trim(f, s) + NBSP + 'Hz';
}
const mhzN = f => Fm.trim(f / 1e6, 5);
const khzN = f => Fm.trim(f / 1e3, 5);
// to a hundredth of a decibel at most, so a flat top reads 0 dB rather than 2e-15
const db = (v, s) => Fm.trimText(Math.abs(v) < 0.005 ? 0 : Math.round(v * 100) / 100, s || 3) + NBSP + 'dB';
// how far a response is down, as a cut
const cutBy = v => db(-v);
const snap5k = v => Math.max(5e3, Math.round(v / 5e3) * 5e3);
const niceMax = v => { const e = Math.pow(10, Math.floor(Math.log10(v))); const m = v / e;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * e; };

/* ---------------- drawing at a readable size ---------------- */

function canvasOf(cv) {
  const dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth, H = cv.clientHeight;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  const c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, W, H);
  return { c, W, H };
}
/*
 * As on the feeders page: the circuit canvas is made tall enough for the
 * drawing to reach SCHEM_SCALE where the width allows, so the part labels
 * come out at a readable size, and the graph beside it gets the same height.
 */
const SCHEM_SCALE = 1.7;
function fitSchem(cv, lay) {
  if (!cv) return 230;
  const cw = cv.clientWidth || 380;
  const s = Math.min(SCHEM_SCALE, (cw - 32) / lay.w);
  const h = Math.max(230, Math.round(s * lay.h + 32));
  cv.style.height = h + 'px';
  return h;
}
const wide = () => typeof window !== 'undefined' && window.matchMedia &&
  window.matchMedia('(min-width:820px)').matches;
function matchGraph(p, h) { p.graph.style.height = wide() ? Math.max(270, h) + 'px' : '280px'; }
function sizeFor(p, lay) { matchGraph(p, fitSchem(p.schem, lay)); }
// on a narrow graph only the ends and the middle of the x axis are labelled
const xLabels = (canvas, a, b, f) => v => {
  if ((canvas.clientWidth || 500) >= 500) return f(v);
  const i = Math.round(4 * (v - a) / (b - a));
  return i % 2 ? '' : f(v);
};
const logTicks = (canvas, a, b) => xLabels(canvas, a, b, v => {
  const f = Math.pow(10, v);
  return f >= 1e6 ? Fm.trim(f / 1e6, 3) + ' MHz' : Fm.trim(f / 1e3, 3) + ' kHz';
});

/* An item shows one row of toggles; the panel hides the ones this level does not use. */
function levelToggle(p, keys) {
  const btns = p.sec.querySelectorAll('.toggle button');
  btns.forEach(b => { b.hidden = keys.indexOf(b.dataset.k) < 0; });
  if (keys.indexOf(p.topology) < 0) { p.topology = keys[0]; p.cursor = null; }
  return p.topology;
}

/* ---------------- the IF transformer ---------------- */

/*
 * One stage's IF transformer. V1 and RS are the stage before it as seen from
 * the primary: its signal, and its output resistance together with the
 * primary's own loss. R2 is the next stage's input with the secondary's
 * loss. Each tank is 100 µH with the capacitor that tunes it to 455 kHz, and
 * RS = R2 = Q × 2πf0L, so each is loaded to the Q on the slider. K1 couples
 * the two windings with a coefficient k. The most a matched source can give
 * the secondary is V1 / 2, so the response is drawn against that: critical
 * coupling peaks at 0 dB.
 */
const rFor = (q, f0, l) => q * 2 * Math.PI * f0 * l;
function pairNet(k, q) {
  const r = rFor(q, F_IF, L_IF);
  return 'V1 s 0 1\nRS s p ' + num(r) + '\nC1 p 0 ' + num(C_IF) + '\nL1 p 0 ' + num(L_IF) +
         '\nL2 q 0 ' + num(L_IF) + '\nK1 L1 L2 ' + num(k) + '\nC2 q 0 ' + num(C_IF) + '\nR2 q 0 ' + num(r);
}
const pairDb = (ck, f) => 20 * Math.log10(Math.max(1e-9, MN.abs(MN.nodeV(MN.solveAt(ck, f), 'q')) / 0.5));
/*
 * The drawing. Every wire names the current it carries, positive the way it
 * is drawn; each winding carries its own, L1 and L2, top to bottom.
 */
function pairLayout() {
  return {
    w: 330, h: 125,
    elements: [
      { name: 'V1', type: 'V', at: [20, 75], rot: 90, label: 'IF in' },
      { name: 'RS', type: 'R', at: [50, 45], label: 'R1' },
      { name: 'C1', type: 'C', at: [110, 75], rot: 90, label: 'C1' },
      { name: 'TX', type: 'T', at: [170, 75], label: 'L1 and L2', flow: ['L1', 'L2'],
        core: 'air', dots: true, inductors: true },
      { name: 'C2', type: 'C', at: [230, 75], rot: 90, label: 'C2' },
      { name: 'R2', type: 'R', at: [280, 75], rot: 90, label: 'R2' }
    ],
    wires: [[80, 45, 110, 45, 'RS'], [110, 45, 150, 45, 'L1'],
            [150, 105, 110, 105, 'L1'], [110, 105, 20, 105, 'RS'],
            [230, 45, 190, 45, 'L2'], [230, 45, 280, 45, 'R2'],
            [190, 105, 230, 105, 'L2'], [280, 105, 230, 105, 'R2']],
    grounds: [[20, 105], [230, 105]]
  };
}
/* One tuned circuit loaded to Q, the comparison: its output is V1 at resonance. */
function tankNet(f0, q, l) {
  const c = 1 / (Math.pow(2 * Math.PI * f0, 2) * l);
  return 'V1 s 0 1\nRS s a ' + num(rFor(q, f0, l)) + '\nL1 a 0 ' + num(l) + '\nC1 a 0 ' + num(c);
}
const tankDb = (ck, f) => 20 * Math.log10(Math.max(1e-9, MN.abs(MN.nodeV(MN.solveAt(ck, f), 'a'))));

/* A response swept across offsets from its centre, with the −3 dB edges and the peaks found. */
function sweepOf(fn, f0, span, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const off = -span + 2 * span * i / n;
    pts.push({ x: off, y: fn(f0 + off) });
  }
  const top = Math.max(...pts.map(q => q.y));
  // the outer half-power edges, interpolated between samples
  const cross = (a, b) => a.x + (b.x - a.x) * (top - 3.0103 - a.y) / (b.y - a.y);
  let lo = null, hi = null;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (lo === null && a.y < top - 3.0103 && b.y >= top - 3.0103) lo = cross(a, b);
    if (a.y >= top - 3.0103 && b.y < top - 3.0103) hi = cross(a, b);
  }
  const peaks = pts.filter((q, i) => i > 0 && i < pts.length - 1 && q.y > pts[i - 1].y && q.y >= pts[i + 1].y);
  return { pts, top, lo, hi, bw: lo !== null && hi !== null ? hi - lo : null, peaks };
}
/* Refine a peak of fn near f by golden section, to well under a hertz. */
function refinePeak(fn, a, b) {
  const g = (Math.sqrt(5) - 1) / 2;
  let c = b - g * (b - a), d = a + g * (b - a);
  for (let i = 0; i < 60; i++) {
    if (fn(c) > fn(d)) { b = d; } else { a = c; }
    c = b - g * (b - a); d = a + g * (b - a);
  }
  return (a + b) / 2;
}
/* Everything the coupled pair's readouts and working need, at one k and Q. */
function pairFacts(k, q) {
  const ck = MN.parseNetlist(pairNet(k, q)), fn = f => pairDb(ck, f);
  const span = niceMax(Math.max(3 * F_IF / q, 0.8 * k * F_IF));
  const sw = sweepOf(fn, F_IF, span, 600);
  const step = 2 * span / 600;
  const humps = sw.peaks.map(pk => refinePeak(fn, F_IF + pk.x - step, F_IF + pk.x + step));
  return { ck, fn, span, sw, humps, kq: k * q,
           centre: fn(F_IF), peak: Math.max(...humps.map(fn), sw.top),
           h2: fn(2 * F_IF), h3: fn(3 * F_IF) };
}

/* ---------------- the preselector, and the frequency plan ---------------- */

/*
 * The RF stage's tuned circuit, tuned to the signal: a 1 µH coil and the
 * capacitor that resonates with it there, fed through RS, which stands for
 * the aerial's loading of the circuit and is chosen to give the Q on the
 * slider. The mixer's input is taken as a high impedance. Its response is
 * then exactly 1 / (1 + jQ(f/f0 − f0/f)), with no allowance made for it.
 */
function preNet(fs, q) {
  const c = 1 / (Math.pow(2 * Math.PI * fs, 2) * L_RF);
  return { netlist: 'V1 s 0 1\nRS s a ' + num(rFor(q, fs, L_RF)) + '\nL1 a 0 ' + num(L_RF) + '\nC1 a 0 ' + num(c), c };
}
const preDb = (ck, f) => 20 * Math.log10(Math.max(1e-9, MN.abs(MN.nodeV(MN.solveAt(ck, f), 'a'))));
function preLayout() {
  return {
    w: 290, h: 125,
    elements: [
      { name: 'V1', type: 'V', at: [20, 75], rot: 90, label: 'aerial' },
      { name: 'RS', type: 'R', at: [50, 45], label: 'RS' },
      { name: 'L1', type: 'L', at: [110, 75], rot: 90, label: 'L' },
      { name: 'C1', type: 'C', at: [170, 75], rot: 90, label: 'C' }
    ],
    wires: [[80, 45, 110, 45, 'RS'], [110, 45, 170, 45, 'C1'],
            [170, 105, 110, 105, 'C1'], [110, 105, 20, 105, 'RS'],
            [170, 45, 225, 45, '-']],
    grounds: [[20, 105]],
    terminals: [{ at: [225, 45], label: 'mixer' }]
  };
}

/*
 * The frequencies, for LO above, LO below, or a double superhet whose second
 * IF is 455 kHz with its LO below the first IF, as in the Full course.
 * The image is the other frequency one IF from the LO: of LO + IF and
 * |LO − IF|, the one that is not the signal.
 */
function planOf(mode, s, fif) {
  if (mode === 'double') {
    const ok = fif > 2.4 * F_IF;
    return { mode, ok, s, if1: fif, if2: F_IF, lo: s + fif, lo2: fif - F_IF,
             image: s + 2 * fif, image2: s + 2 * F_IF, image2at: fif - 2 * F_IF };
  }
  if (mode === 'below') {
    if (Math.abs(s - fif) < 50e3) return { mode, ok: false, s, if1: fif };
    const lo = Math.abs(s - fif), sum = fif > s;
    const c = [lo + fif, Math.abs(lo - fif)];
    const image = Math.abs(c[0] - s) > Math.abs(c[1] - s) ? c[0] : c[1];
    return { mode, ok: true, s, if1: fif, lo, sum, image };
  }
  return { mode: 'above', ok: true, s, if1: fif, lo: s + fif, image: s + 2 * fif };
}

/* ---------------- the mixer, sampled ---------------- */

/*
 * 32768 samples at 163.84 MHz: 5 kHz bins up to 81.92 MHz. Every control is
 * held to a multiple of 5 kHz, so every product is a whole number of cycles
 * in the record and lands on one bin, and the transform needs no window.
 * The signal is 0.1 of the LO's amplitude, as a weak signal is.
 *
 *   ideal  output = LO × RF, a perfect multiplier: the sum and the difference
 *   real   output = 0.05x + x² + 0.15x³, x = LO + RF: a curved characteristic,
 *          illustrative, which lets the inputs through and adds m × LO ± n × RF
 *   image  the ideal mixer with a second station, as strong, on the image
 */
const MIX = { fs: 163.84e6, n: 32768, aLo: 1, aRf: 0.1, a1: 0.05, a2: 1, a3: 0.15 };
const mixCache = {};
function mixSamples(mode, frf, flo, fim, t) {
  const w = 2 * Math.PI;
  const lo = Math.cos(w * flo * t) * MIX.aLo, rf = Math.cos(w * frf * t) * MIX.aRf;
  if (mode === 'real') { const x = lo + rf; return MIX.a1 * x + MIX.a2 * x * x + MIX.a3 * x * x * x; }
  if (mode === 'imageOnly') return lo * Math.cos(w * fim * t + Math.PI / 2) * MIX.aRf;
  return lo * rf;
}
// the size of the wanted product, against which every line is drawn in dB
const mixRef = mode => mode === 'real' ? MIX.a2 * MIX.aLo * MIX.aRf : MIX.aLo * MIX.aRf / 2;
function mixSpectrum(mode, frf, flo, fim) {
  const key = [mode, frf, flo, fim].join('|');
  if (mixCache[key]) return mixCache[key];
  const x = new Float64Array(MIX.n);
  for (let i = 0; i < MIX.n; i++) x[i] = mixSamples(mode, frf, flo, fim, i / MIX.fs);
  const sp = DS.spectrum(x, MIX.fs, { window: false, floor: -300 });
  const ref = 20 * Math.log10(mixRef(mode === 'imageOnly' ? 'ideal' : mode));
  const lines = [];
  for (let k = 1; k < sp.bins; k++) {
    const d = sp.db[k] - ref;
    if (d > -60) lines.push({ f: sp.freq[k], db: d });
  }
  for (const k of Object.keys(mixCache)) delete mixCache[k];   // keep only the latest
  return (mixCache[key] = lines);
}
/* Which m × LO ± n × RF a line is, lowest order first, written as a reader would. */
function productName(f, flo, frf) {
  const close = (a, b) => Math.abs(a - b) < 1;
  let best = null;
  for (let m = 0; m <= 3; m++) {
    for (let n = -3; n <= 3; n++) {
      if (!m && !n) continue;
      const v = m * flo + n * frf;
      if (!close(Math.abs(v), f)) continue;
      const order = m + Math.abs(n);
      if (!best || order < best.order) best = { m: v < 0 ? -m : m, n: v < 0 ? -n : n, order };
    }
  }
  if (!best) return '';
  const terms = [[best.m, 'LO'], [best.n, 'RF']].filter(q => q[0]);
  terms.sort((a, b) => b[0] - a[0]);
  return terms.map((q, i) => {
    const c = Math.abs(q[0]), s = (c > 1 ? c + ' × ' : '') + q[1];
    return i === 0 ? s : (q[0] < 0 ? ' − ' : ' + ') + s;
  }).join('');
}
/* The other station a mixer turns into the IF: from LO + IF and |LO − IF|, the one that is not the signal. */
function mixImage(frf, flo, fif) {
  const c = [flo + fif, Math.abs(flo - fif)];
  const hit = c.findIndex(f => Math.abs(f - frf) < 1);
  return hit < 0 ? null : c[1 - hit];
}
/* The three waveforms, for the left-hand display. */
function drawWaves(cv, t, frf, flo, mode) {
  const { c, W, H } = canvasOf(cv);
  const span = Math.min(4e-6, Math.max(0.4e-6, 12 / Math.max(frf, flo)));
  const rows = [
    ['signal (RF)', x => Math.cos(2 * Math.PI * frf * x)],
    ['local oscillator', x => Math.cos(2 * Math.PI * flo * x)],
    ['mixer output', x => mixSamples(mode === 'real' ? 'real' : 'ideal', frf, flo, 0, x)]
  ];
  const top = 6, lane = (H - top - 28) / 3, left = 8, right = W - 8;
  c.font = '15px ' + t.panelFont;
  rows.forEach(([name, fn], r) => {
    // the trace sits under its name with clear space above the next row's name
    const y0 = top + lane * r, mid = y0 + lane / 2 + 10, amp = lane / 2 - 17;
    // the output's own peak, so its shape is seen whatever its size
    let big = 0;
    const ys = [];
    for (let i = 0; i <= 700; i++) { const v = fn(span * i / 700); ys.push(v); big = Math.max(big, Math.abs(v)); }
    const offset = mode === 'real' && r === 2 ? (Math.max(...ys) + Math.min(...ys)) / 2 : 0;
    big = Math.max(...ys.map(v => Math.abs(v - offset))) || 1;
    c.strokeStyle = t.grid; c.lineWidth = 1;
    c.beginPath(); c.moveTo(left, mid); c.lineTo(right, mid); c.stroke();
    c.strokeStyle = t.v; c.lineWidth = 1.5;
    c.beginPath();
    ys.forEach((v, i) => {
      const x = left + (right - left) * i / 700, y = mid - amp * (v - offset) / big;
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    });
    c.stroke();
    c.fillStyle = t.ink; c.textAlign = 'left'; c.textBaseline = 'top';
    c.fillText(name, left, y0);
  });
  c.fillStyle = t.soft; c.textBaseline = 'bottom';
  c.textAlign = 'left'; c.fillText('0', left, H - 4);
  c.textAlign = 'right'; c.fillText(Fm.eng(span, 's', 2), right, H - 4);
  c.textAlign = 'center'; c.fillText('time', (left + right) / 2, H - 4);
}

/* ---------------- panels ---------------- */

const PANELS = {

  /*
   * 3I2: the mixer's output spectrum, from the sampled waveform.
   */
  mixer(ctx) {
    const { p, d, t, Plot, swatch, ro, level } = ctx;
    const mode = level === 'full' ? levelToggle(p, ['ideal', 'real', 'image']) : 'ideal';
    const frf = d.frf, flo = d.flo, fif = d.fif;
    const fim = mixImage(frf, flo, fif);
    // the left-hand display: the waveforms going in and coming out
    if (p.schem) {
      p.schem.style.height = (wide() ? 300 : 260) + 'px';
      matchGraph(p, wide() ? 300 : 260);
      drawWaves(p.schem, t, frf, flo, mode);
      if (p.schemNote) p.schemNote.textContent = mode === 'real'
        ? 'the waveforms, each scaled to fit its row: the output is what an illustrative curved characteristic makes of their sum'
        : 'the waveforms, each scaled to fit its row: the output is the product of the two';
    }
    const lines = mixSpectrum(mode === 'image' ? 'ideal' : mode, frf, flo, 0);
    const imLines = mode === 'image' && fim ? mixSpectrum('imageOnly', frf, flo, fim) : [];
    const inFilter = f => Math.abs(f - fif) <= 5e3;
    const fmax = Math.max(...lines.concat(imLines).map(q => q.f), fif, frf, flo);
    const xb = niceMax(fmax * 1.12), floor = -60;
    const traces = [], labels = [];
    const named = {};
    lines.forEach(q => {
      const nm = productName(q.f, flo, frf), hit = inFilter(q.f);
      named[q.f] = nm;
      traces.push({ pts: [{ x: q.f, y: floor }, { x: q.f, y: q.db }], colour: t.v, width: hit ? 4 : 2.2 });
      // names along the top, above the tallest line (2 × LO, 14 dB up), so
      // no line crosses them: the sum and the difference, and on the real
      // mixer only what is in the IF filter; the readouts name the rest
      const main = nm === 'LO + RF' || nm === 'LO − RF' || nm === 'RF − LO';
      if (hit || (main && mode !== 'real')) {
        // right-aligned on its line, unless that would run it into the axis
        const room = (p.graph.clientWidth || 500) - Plot.PAD.l - Plot.PAD.r, cx2 = p.graph.getContext('2d');
        cx2.font = '15px ' + t.panelFont;
        const need = (cx2.measureText(nm).width + 6) / room * xb;
        labels.push({ x: Math.max(q.f, need), y: 14.5, text: nm, colour: t.ink });
      }
    });
    imLines.forEach(q => {
      traces.push({ pts: [{ x: q.f, y: floor }, { x: q.f, y: q.db }], colour: t.v, width: 2.2, dash: DASH });
    });
    const bw = Math.max(xb * 0.012, 10e3);
    Plot.draw(p.graph, {
      xRange: [0, xb], tokens: t,
      xFmt: xLabels(p.graph, 0, xb, v => Fm.trim(v / 1e6, 3) + ' MHz'),
      left: { min: floor, max: 20, fmt: v => Math.round(v) + ' dB' },
      bands: [{ from: fif - bw / 2, to: fif + bw / 2, colour: t.mark }],
      // what goes in, as short dashed ticks at the foot, so no label crosses them
      traces: [frf, flo].concat(fim && mode === 'image' ? [fim] : []).map(f =>
        ({ pts: [{ x: f, y: floor }, { x: f, y: floor + 14 }], colour: t.mark, width: 1.6, dash: [3, 3] })).concat(traces),
      labels
    });
    p.legend.innerHTML = swatch(t.v, mode === 'image' ? 'From the wanted station' : 'What comes out, against the wanted product') +
      (mode === 'image' ? dashSwatch(t.v, 'From the station on the image') : '') +
      dashSwatch(t.mark, 'What goes in: RF, LO' + (mode === 'image' ? ', image' : '')) +
      swatch(t.mark, 'The IF filter, ' + freq(fif));
    const hits = lines.filter(q => inFilter(q.f));
    const hitName = hits.length ? hits.map(q => named[q.f]).join(' and ') : 'nothing';
    const rows = [
      ['Difference, ' + sym(flo >= frf ? 'LO − RF' : 'RF − LO'), freq(Math.abs(flo - frf))],
      ['Sum, ' + sym('LO + RF'), freq(flo + frf)],
      ['In the IF filter at ' + sym(freq(fif)), hitName, true]
    ];
    if (level === 'full') {
      rows.push(['A station on ' + (fim ? sym(freq(fim)) : 'the image'),
                 fim ? 'also comes out on ' + freq(fif) : 'none: neither the sum nor the difference is on the IF']);
      if (mode === 'real') {
        const spur = hits.filter(q => { const nm = named[q.f]; return nm !== 'LO − RF' && nm !== 'RF − LO' && nm !== 'LO + RF'; });
        rows.push(['Lines out of the mixer', String(lines.length)]);
        if (spur.length) rows.push(['Spurious response', sym(named[spur[0].f]) + ' = ' + freq(spur[0].f)]);
      }
    }
    p.readouts.innerHTML = ro(rows);
    p.lab = {};
    return {};
  },

  /*
   * 3I3 Intermediate and 3I4: the IF transformer, solved. At Intermediate it
   * is held at critical coupling and compared with one tuned circuit at the
   * signal frequency; at Full the coupling is on a slider.
   */
  coupled(ctx) {
    const { p, d, t, Plot, swatch, ro, level } = ctx;
    const ifamp = level === 'intermediate';
    const q = d.qif, k = ifamp ? 1 / q : d.k;
    const lay = pairLayout();
    sizeFor(p, lay);
    const fx = pairFacts(k, q);
    let span = fx.span, rfCk = null;
    if (ifamp) {
      span = niceMax(Math.max(10e3, 4 * F_IF / q));
      rfCk = MN.parseNetlist(tankNet(d.fsig, q, L_RF));
    }
    const one = MN.parseNetlist(tankNet(F_IF, q, L_IF));
    const N = 400, clip = v => Math.max(-40, v);
    const pair = [], other = [];
    for (let i = 0; i <= N; i++) {
      const off = -span + 2 * span * i / N;
      pair.push({ x: off / 1e3, y: clip(fx.fn(F_IF + off)) });
      other.push({ x: off / 1e3, y: clip(ifamp ? tankDb(rfCk, d.fsig + off) : tankDb(one, F_IF + off)) });
    }
    const defOff = ifamp ? Math.min(10e3, span * 0.6) : 0;
    const off = p.cursor === null ? defOff : -span + 2 * span * p.cursor;
    const atPair = fx.fn(F_IF + off), atOther = ifamp ? tankDb(rfCk, d.fsig + off) : tankDb(one, F_IF + off);
    const xs = span / 1e3;
    Plot.draw(p.graph, {
      xRange: [-xs, xs], tokens: t,
      xFmt: xLabels(p.graph, -xs, xs, v => (Math.abs(v) < 1e-9 ? '0' : Fm.trim(v, 3)) + ' kHz'),
      left: { min: -40, max: 0, fmt: v => Math.round(v) + ' dB' },
      bands: fx.sw.bw ? [{ from: fx.sw.lo / 1e3, to: fx.sw.hi / 1e3, colour: t.mark }] : [],
      traces: [{ pts: other, colour: t.v, width: 1.8, dash: DASH },
               { pts: pair, colour: t.v, width: 2.8 }],
      // the cursor's reading goes in the legend: at the top of the graph it
      // would sit on the curves
      cursor: { x: off / 1e3, colour: t.mark, dot: { y: clip(atPair), axis: 'left' } }
    });
    p.legend.innerHTML = swatch(t.v, 'IF transformer, at ' + freq(F_IF)) +
      dashSwatch(t.v, ifamp ? 'One tuned circuit at ' + freq(d.fsig, 4) + ', the same Q' : 'One tuned circuit, the same Q') +
      swatch(t.mark, 'Bandwidth, −3 dB') +
      swatch(t.mark, 'Cursor: ' + (Math.abs(off) < 1 ? '' : off > 0 ? '+' : '−') + freq(Math.abs(off), 3) +
             ', ' + db(atPair - (ifamp ? fx.sw.top : 0)));
    const away = freq(Math.abs(off), 3);
    let rows;
    if (ifamp) {
      rows = [
        ['IF transformer bandwidth', fx.sw.bw ? freq(fx.sw.bw, 3) : '—', true],
        ['One tuned circuit at ' + sym(freq(d.fsig, 4)), freq(d.fsig / q, 3) + ' wide'],
        ['A station ' + sym(away) + ' away: the IF transformer cuts it by', cutBy(atPair - fx.sw.top)],
        ['The tuned circuit at the signal cuts it by', cutBy(atOther)],
        [sym('LO') + ', signal + IF', freq(d.fsig + F_IF)]
      ];
    } else {
      const kq = fx.kq;
      const kind = kq < 0.97 ? 'under-coupled' : kq > 1.03 ? 'over-coupled' : 'critical';
      const two = fx.humps.length >= 2;
      rows = [
        [sym('k × Q'), Fm.trim(kq, 3) + ', ' + kind, true],
        ['Bandwidth, −3 dB', fx.sw.bw ? freq(fx.sw.bw, 3) + (fx.sw.top - fx.centre > 3.0103 ? ', outer edges' : '') : '—'],
        ['One tuned circuit, the same Q', freq(F_IF / q, 3)],
        [two ? 'Humps, solved' : 'Peak', two ? Fm.trim(Math.min(...fx.humps) / 1e3, 4) + ' and ' + freq(Math.max(...fx.humps), 4)
                                            : freq(fx.humps.length ? fx.humps[0] : F_IF, 4) + ', ' + db(fx.peak, 2)],
        two ? ['Lossless rule, ' + sym('f₀ ÷ √(1 ± k)'), Fm.trim(F_IF / Math.sqrt(1 + k) / 1e3, 4) + ' and ' + freq(F_IF / Math.sqrt(1 - k), 4)]
            : ['Output at the centre, against critical', db(fx.centre, 2)],
        two ? ['Dip at the centre', db(fx.centre - fx.peak, 2)] : null,
        ['Harmonics of the IF: ' + sym('2 × IF') + ', ' + sym('3 × IF'), db(fx.h2, 2) + ', ' + db(fx.h3, 2)]
      ].filter(Boolean);
    }
    p.readouts.innerHTML = ro(rows);
    p.lab = {};
    p.fAnim = F_IF + off;
    return { layout: lay, circuit: fx.ck };
  },

  /*
   * 3I3 Full: the preselector, and where the image falls for LO above, LO
   * below, or a double superhet.
   */
  image(ctx) {
    const { p, d, t, Plot, swatch, ro } = ctx;
    const mode = levelToggle(p, ['above', 'below', 'double']);
    const pl = planOf(mode, d.fsig, d.fif);
    const lay = preLayout();
    sizeFor(p, lay);
    const pre = preNet(d.fsig, d.qrf), ck = MN.parseNetlist(pre.netlist);
    const resp = f => preDb(ck, f);
    const fr = [d.fsig].concat(pl.ok ? [pl.lo, pl.image] : []).concat(pl.ok && mode === 'double' ? [pl.image2] : []);
    const a = Math.log10(Math.max(20e3, Math.min(...fr) / 1.6)), b = Math.log10(Math.max(...fr) * 1.6);
    const pts = [];
    for (let i = 0; i <= 500; i++) {
      const lf = a + (b - a) * i / 500;
      pts.push({ x: lf, y: Math.max(-60, resp(Math.pow(10, lf))) });
    }
    const fc = p.cursor === null ? (pl.ok ? pl.image : d.fsig) : Math.pow(10, a + (b - a) * p.cursor);
    // each mark is named at the foot of the graph, where the curve does not
    // reach, in rows so that marks close together keep their names apart
    // the images lowest, under the curve's tail, and the signal highest, where
    // the curve has already risen away to its peak
    const ROW = [-55, -49.5, -44];
    const marks = [{ x: Math.log10(d.fsig) }], labels = [{ x: Math.log10(d.fsig), y: ROW[2], text: 'signal', colour: t.ink }];
    if (pl.ok) {
      const dbl = mode === 'double';
      marks.push({ x: Math.log10(pl.lo) }, { x: Math.log10(pl.image) });
      labels.push({ x: Math.log10(pl.lo), y: ROW[1], text: dbl ? 'LO 1' : 'LO', colour: t.soft },
                  { x: Math.log10(pl.image), y: ROW[0], text: dbl ? 'image 1' : 'image', colour: t.ink });
      if (dbl) {
        marks.push({ x: Math.log10(pl.image2) });
        labels.push({ x: Math.log10(pl.image2), y: ROW[0], text: 'image 2', colour: t.ink });
      }
    }
    Plot.draw(p.graph, {
      xRange: [a, b], xFmt: logTicks(p.graph, a, b), tokens: t,
      left: { min: -60, max: 0, fmt: v => Math.round(v) + ' dB' },
      traces: [{ pts, colour: t.v, width: 2.6 }],
      marks, labels,
      cursor: { x: Math.log10(fc), colour: t.mark, dot: { y: Math.max(-60, resp(fc)), axis: 'left' } }
    });
    p.legend.innerHTML = swatch(t.v, 'The RF stage’s tuned circuit, Q ' + Fm.trim(d.qrf, 3) + ', tuned to ' + freq(d.fsig, 4)) +
      dashSwatch(t.mark, 'Signal, LO and image') +
      swatch(t.mark, 'Cursor: ' + freq(fc, 4) + ', ' + db(resp(fc), 3));
    let rows;
    if (!pl.ok) {
      rows = mode === 'double'
        ? [['First IF', freq(d.fif) + ': too low. Set it above ' + freq(2.4 * F_IF, 3), true]]
        : [['LO below', 'none: the IF is the signal frequency', true]];
    } else if (mode === 'double') {
      rows = [
        [sym('LO 1') + ', signal + IF 1', freq(pl.lo)],
        [sym('LO 2') + ', ' + sym('IF 1 − 455 kHz'), freq(pl.lo2)],
        ['Image of mixer 1, ' + sym(freq(pl.image)), 'cut by ' + cutBy(resp(pl.image)) + ' in the RF stage', true],
        ['Image of mixer 2, at the aerial', freq(pl.image2) + ', cut by only ' + cutBy(resp(pl.image2))],
        ['The same, at the first IF', freq(pl.image2at) + ', for the first IF filter'],
        ['Q a ' + sym('2.4 kHz') + ' filter needs at ' + sym('455 kHz'), Fm.trim(F_IF / SSB_BW, 3)]
      ];
    } else {
      rows = [
        [sym('LO') + (mode === 'above' ? ', above the signal' : pl.sum ? ', IF − signal' : ', below the signal'), freq(pl.lo)],
        ['Image, ' + sym(freq(Math.abs(pl.image - d.fsig))) + ' from the signal', freq(pl.image)],
        ['Image rejection, this tuned circuit', cutBy(resp(pl.image)), true],
        ['Bandwidth of the tuned circuit', freq(d.fsig / d.qrf, 3)],
        ['Q a ' + sym('2.4 kHz') + ' filter needs at this IF', Fm.trim(d.fif / SSB_BW, 3)]
      ];
    }
    p.readouts.innerHTML = ro(rows);
    p.lab = { C1: Fm.eng(pre.c, 'F', 3), L1: '1 µH' };
    p.fAnim = fc;
    return { layout: lay, circuit: ck };
  }
};

/* ---------------- the working ---------------- */

const fM = f => '<b>' + mhzN(f) + '</b>';
function loWork(d) {
  const pl = planOf(d.device, d.fsig, d.fif);
  if (!pl.ok) return ['no usable LO here', '—'];
  if (pl.mode === 'double') {
    return [fM(d.fsig) + ' + ' + fM(d.fif) + ', then ' + fM(d.fif) + ' − <b>0.455</b>',
            'LO 1 ' + freq(pl.lo) + ', LO 2 ' + freq(pl.lo2)];
  }
  if (pl.mode === 'above') return [fM(d.fsig) + ' + ' + fM(d.fif), freq(pl.lo)];
  return pl.sum ? [fM(d.fif) + ' − ' + fM(d.fsig) + ' (the IF is then the sum)', freq(pl.lo)]
                : [fM(d.fsig) + ' − ' + fM(d.fif), freq(pl.lo)];
}
function imageWork(d) {
  const pl = planOf(d.device, d.fsig, d.fif);
  if (!pl.ok) return ['no image without an LO', '—'];
  if (pl.mode === 'double') {
    return [fM(d.fsig) + ' + 2 × ' + fM(d.fif) + '; at the second mixer ' + fM(d.fsig) + ' + 2 × <b>0.455</b>',
            'image 1 ' + freq(pl.image) + ', image 2 ' + freq(pl.image2)];
  }
  if (pl.mode === 'above') return [fM(d.fsig) + ' + 2 × ' + fM(d.fif), freq(pl.image)];
  if (d.fsig > 2 * d.fif) return [fM(d.fsig) + ' − 2 × ' + fM(d.fif), freq(pl.image)];
  // RF − 2 × IF would be below zero: the image is then 2 × IF − RF, which
  // reaches the IF as the sum with the LO, or, with the IF the sum, as the difference
  return pl.sum ? ['2 × ' + fM(d.fif) + ' − ' + fM(d.fsig) + ', one IF above the LO', freq(pl.image)]
                : ['2 × ' + fM(d.fif) + ' − ' + fM(d.fsig) + ': RF − 2 × IF is below zero, and this station plus the LO makes the IF',
                   freq(pl.image)];
}
function rejWork(d) {
  const pl = planOf(d.device, d.fsig, d.fif);
  if (!pl.ok) return ['nothing to reject', '—'];
  const fi = pl.image, r = fi / d.fsig - d.fsig / fi, x = d.qrf * r;
  const g = 1 / Math.sqrt(1 + x * x);
  return ['1 ÷ √(1 + <b>' + Fm.trim(d.qrf, 3) + '</b>² × (' + Fm.trim(fi / 1e6, 5) + ' ÷ ' + Fm.trim(d.fsig / 1e6, 5) + ' − ' +
          Fm.trim(d.fsig / 1e6, 5) + ' ÷ ' + Fm.trim(fi / 1e6, 5) + ')²) = 1 ÷ √(1 + ' + Fm.trim(x, 4) + '²)',
          hue('v', Fm.trim(g, 3)) + ', which is ' + db(20 * Math.log10(g), 3)];
}

/* ---------------- the page ---------------- */

const BENCH = {
  group: '3I',
  title: 'The superhet receiver',
  pageTitle: 'Superhet Receiver Bench',
  levels: ['intermediate', 'full'],
  // the course sessions that send learners here, named in the colophon
  sessions: {
    intermediate: ['Intermediate session 9 (Receivers)'],
    full: ['Full session 14 (The superhet)']
  },
  circuitBased: true,
  standfirst: 'Move a control and the page recalculates. The tuned circuits are solved live, the IF transformer as two coils sharing a field; the mixer’s output is the Fourier transform of its real waveform.',
  colophonNote: 'Tuned circuits are solved by a general complex nodal analysis engine, with coupled coils as a mutual inductance, checked against hand calculations. The mixer is sampled and transformed; its curved characteristic and the levels of its other products are illustrative. Circuit symbols follow the RSGB specification.',
  circuitColumn: 480,

  /** Every circuit this page draws, with what flows in it, for the checkers. */
  allLayouts: () => {
    const out = [];
    [0.5, 1, 2].forEach(kq => out.push({ name: 'IF transformer, k Q ' + kq, layout: pairLayout(),
      netlist: pairNet(kq / 50, 50), flow: { mode: 'ac' } }));
    [[14.2e6, 50], [1.82e6, 20], [28e6, 200]].forEach(([f, q]) => out.push({ name: 'preselector ' + f,
      layout: preLayout(), netlist: preNet(f, q).netlist, flow: { mode: 'ac' } }));
    return out;
  },

  bank: {
    url: 'https://rsgb.services/public/exams/eqdb/',
    topic: '3 - Transmitters and receivers',
    note: 'The RSGB bank covers Full only; pick section 3 in its Filter by Topic list.'
  },

  intro: {
    intermediate: [
      'Most receivers made since the 1930s are superhets. It moves whatever you tune to onto one fixed frequency, the IF, and does its real filtering and most of its amplifying there.',
      'This page puts the mixer that does the moving and the tuned circuits that do the selecting on the bench. The mixer’s output is worked out from its waveform, and the IF transformer is solved as two coils sharing a magnetic field.'
    ],
    full: [
      'At Full the superhet becomes a set of sums and trade-offs: which side of the signal to put the local oscillator, where the image falls and how much the RF stage cuts it, what a high or a low IF buys, and why a receiver converts twice.',
      'Each section shows the exam’s rule with your values in it, beside the same circuit solved without the exam’s shortcuts. The IF transformer is two real coupled tuned circuits, so the under, critical and over-coupled curves are the circuit’s, with their real bandwidth.'
    ]
  },

  /*
   * Read before this page was designed. Our own summary of what each source
   * insists on; no wording from any of them appears here.
   */
  sources: {
    read: [
      'Intermediate session 9 and Full session 14 of the course (course.g0lft.org)',
      'Syllabus 2024 v1.6b, items 3I1 to 3I5, with the Intermediate and Full level lists for which sentence belongs to which level',
      'EX309 Full reference booklet: Q = fc ÷ (fu − fl); the LO and image rules are not on it',
      'Exam Secrets, receivers at Intermediate and Full'
    ],
    keyMessages: [
      { at: '3I1', level: 'intermediate', point: 'the superhet moves every signal to one fixed IF, where one good filter selects it on every band' },
      { at: '3I1', level: 'full', point: 'the double superhet: a high first IF for the image, a low second IF for adjacent channel selectivity, and one detector' },
      { at: '3I1', level: 'full', point: 'the BFO or CIO feeds the product detector, after the last IF, not a mixer' },
      { at: '3I2', level: 'intermediate', point: 'a mixer gives the sum and the difference of its inputs, and one of them is the IF' },
      { at: '3I2', level: 'full', point: 'a real mixer lets its inputs through and makes m × LO ± n × RF; one landing in the IF filter is a spurious response' },
      { at: '3I3', level: 'intermediate', point: 'tuned circuits in the RF and IF stages select the signal; at a fixed low IF the same Q gives a much narrower band' },
      { at: '3I3', level: 'intermediate', point: 'mixing ahead of a fixed IF lets one receiver cover many bands' },
      { at: '3I3', level: 'full', point: 'LO = RF ± IF, image = RF ± 2 × IF on the LO’s side; neither is on the sheet' },
      { at: '3I3', level: 'full', point: 'the image must be stopped before the mixer; a high IF puts it far away, a low IF makes narrow filters easy' },
      { at: '3I4', level: 'full', point: 'IF stages are coupled by tuned transformers; critical coupling is flat topped with steep sides, over-coupling has two humps' },
      { at: '3I4', level: 'full', point: 'turning the bias down to cut the gain distorts the IF, and the next tuned circuits remove the harmonics' },
      { at: '3I5', level: 'full', point: 'phase noise is random noise in an oscillator, worst in PLL synthesisers, quoted in dBc/Hz' },
      { at: '3I5', level: 'full', point: 'in a receiver it causes reciprocal mixing; in a transmitter it raises the noise floor a few kilohertz either side' }
    ]
  },

  controls: [
    { id: 'frf', label: 'Signal', unit: 'Hz', range: [0.5e6, 25e6], start: 7.1e6,
      desc: 'The received signal going into the mixer', snap: v => snap5k(v) },
    { id: 'flo', label: 'Local oscillator', unit: 'Hz', range: [0.2e6, 26e6], start: 16.1e6,
      desc: 'The local oscillator going into the mixer', snap: v => snap5k(v) },
    { id: 'fif', label: 'IF', unit: 'Hz', range: [0.2e6, 100e6], start: 9e6,
      desc: 'The intermediate frequency, where the IF filter sits. In a double superhet, the first IF', snap: v => snap5k(v) },
    { id: 'fsig', label: 'Signal', unit: 'Hz', range: [0.5e6, 30e6], start: 14.2e6,
      desc: 'The frequency the receiver is tuned to', snap: v => snap5k(v) },
    { id: 'qrf', label: 'Q of the RF tuned circuit', unit: '', range: [10, 300], start: 50,
      desc: 'The loaded Q of the tuned circuit ahead of the mixer', snap: v => Math.round(v) },
    { id: 'qif', label: 'Q of each tuned circuit', unit: '', range: [10, 300], start: 50,
      desc: 'The loaded Q of each tank in the IF transformer, and of the one it is compared with', snap: v => Math.round(v) },
    { id: 'k', label: 'Coupling, k', unit: '', range: [0.002, 0.2], start: 0.02,
      desc: 'The share of one coil’s field that links the other: 0 is none, 1 is all of it' }
  ],

  /** Everything the working reads. The panels solve their own circuits. */
  derive: (v) => {
    const d = Object.assign({}, v);
    d.f0 = F_IF;
    d.kq = v.k * v.qif;
    return d;
  },

  labels: (p) => p.lab || {},

  /*
   * The equations. `given` records whether the Full reference booklet (EX309)
   * prints the formula; `tag` overrides the mark at a level.
   */
  equations: {
    sumDiff: { given: false, tag: { intermediate: 'learn' }, name: 'What the mixer makes: the sum and the difference',
      eq: 'LO + RF and LO − RF',
      work: d => ['<b>' + mhzN(d.flo) + '</b> + <b>' + mhzN(d.frf) + '</b> and <b>' + mhzN(Math.max(d.flo, d.frf)) +
                  '</b> − <b>' + mhzN(Math.min(d.flo, d.frf)) + '</b>',
                  freq(d.flo + d.frf) + ' and ' + freq(Math.abs(d.flo - d.frf))] },
    loNeed: { given: false, name: 'The LO that puts the signal on the IF',
      eq: 'LO = RF + IF, or RF − IF',
      work: d => [fM(d.frf) + ' ± ' + fM(d.fif), d.frf > d.fif ? freq(d.frf + d.fif) + ' or ' + freq(d.frf - d.fif)
                  : freq(d.frf + d.fif) + ' (below, ' + freq(d.fif - d.frf) + ' with the IF the sum)'] },
    loI: { given: false, tag: { intermediate: 'learn' }, name: 'The LO for this band, with the IF the difference',
      eq: 'LO = signal + IF',
      work: d => [fM(d.fsig) + ' + <b>0.455</b>', freq(d.fsig + F_IF)] },
    bwRf: { given: true, name: 'Bandwidth of one tuned circuit at the signal',
      eq: 'bandwidth = f ÷ Q',
      work: d => [fM(d.fsig) + ' ÷ <b>' + Fm.trim(d.qif, 3) + '</b>', freq(d.fsig / d.qif, 3)] },
    bwIfI: { given: false, name: 'Bandwidth of the IF transformer, critically coupled',
      eq: 'bandwidth = √2 × IF ÷ Q',
      work: d => ['1.414 × <b>455 kHz</b> ÷ <b>' + Fm.trim(d.qif, 3) + '</b>', freq(Math.SQRT2 * F_IF / d.qif, 3)] },
    lo: { given: false, name: 'The local oscillator',
      eq: 'LO = RF ± IF',
      work: d => loWork(d) },
    img: { given: false, name: 'The image, on the LO’s side of the signal',
      eq: 'image = RF ± 2 × IF',
      work: d => imageWork(d) },
    rej: { given: false, tag: { full: 'interest' }, name: 'What one tuned circuit leaves of the image',
      eq: hue('v', 'V<sub>out</sub> ÷ V<sub>peak</sub>') + ' = 1 ÷ √(1 + Q²(f ÷ f<sub>0</sub> − f<sub>0</sub> ÷ f)²)',
      applies: d => d.device !== 'double',
      work: d => rejWork(d) },
    qFilt: { given: true, name: 'The Q a 2.4 kHz SSB filter needs at the IF',
      eq: 'Q = f<sub>C</sub> ÷ (f<sub>U</sub> − f<sub>L</sub>)',
      work: d => { const f = d.device === 'double' ? F_IF : d.fif;
        return ['<b>' + khzN(f) + ' kHz</b> ÷ <b>2.4 kHz</b>', Fm.trim(f / SSB_BW, 3)]; } },
    kq: { given: false, tag: { full: 'interest' }, name: 'How tightly the coils are coupled, against critical',
      eq: 'k × Q, critical at 1',
      work: d => ['<b>' + Fm.trim(d.k, 3) + '</b> × <b>' + Fm.trim(d.qif, 3) + '</b>',
                  Fm.trim(d.kq, 3) + (d.kq < 0.97 ? ': under-coupled' : d.kq > 1.03 ? ': over-coupled' : ': critical')] },
    bw1: { given: true, name: 'Bandwidth of one tuned circuit at the IF',
      eq: 'bandwidth = f<sub>0</sub> ÷ Q',
      work: d => ['<b>455 kHz</b> ÷ <b>' + Fm.trim(d.qif, 3) + '</b>', freq(F_IF / d.qif, 3)] },
    bw2: { given: false, tag: { full: 'interest' }, name: 'Bandwidth of the pair at critical coupling',
      eq: 'bandwidth = √2 × f<sub>0</sub> ÷ Q',
      work: d => ['1.414 × <b>455 kHz</b> ÷ <b>' + Fm.trim(d.qif, 3) + '</b>', freq(Math.SQRT2 * F_IF / d.qif, 3) +
                  (Math.abs(d.kq - 1) > 0.03 ? ', when k × Q is 1' : '')] },
    humps: { given: false, tag: { full: 'interest' }, name: 'Where the humps would sit with lossless coils',
      eq: 'f = f<sub>0</sub> ÷ √(1 ± k)',
      applies: d => d.kq > 1.03,
      work: d => ['<b>455 kHz</b> ÷ √(1 ± <b>' + Fm.trim(d.k, 3) + '</b>)',
                  Fm.trim(F_IF / Math.sqrt(1 + d.k) / 1e3, 4) + ' and ' + freq(F_IF / Math.sqrt(1 - d.k), 4)] }
  },

  /* Words this page introduces, defined where they are first used. */
  terms: {
    'superhet': 'Short for superheterodyne: a receiver that mixes every signal it tunes to onto one fixed frequency, the IF, and does most of its filtering and amplifying there.',
    'intermediate frequency': 'The fixed frequency, written IF, that a superhet moves the wanted signal to. 455 kHz, 9 MHz and 10.7 MHz are common.',
    'local oscillator': 'The oscillator inside the receiver, written LO, whose frequency the mixer combines with the signal. Tuning the receiver moves the LO.',
    'mixer': 'A stage that combines two frequencies and gives out their sum and their difference.',
    'double superhet': 'A superhet that converts twice: two mixers, two local oscillators and two IFs, then one detector.',
    'image frequency': 'The other frequency, one IF from the LO on its far side from the signal, that the mixer turns into the IF as well. Also called second channel interference.',
    'adjacent channel selectivity': 'How well a receiver rejects a station just beside the wanted one, a few kilohertz away. The IF filter decides it.',
    'product detector': 'A detector for SSB and CW that mixes the last IF with a carrier from a local oscillator to give audio.',
    'BFO': 'Beat frequency oscillator: the oscillator that feeds the product detector, so a CW signal gives an audible note. For SSB the same job is called the carrier insertion oscillator, CIO.',
    'spurious response': 'A station the receiver hears though it is tuned elsewhere, because some product of the mixer other than the wanted one lands in the IF filter.',
    'preselector': 'The tuned circuit, or circuits, ahead of the mixer, tuned to the signal. It is all there is to stop the image.',
    'IF transformer': 'A small screened can holding two coils on one former, each tuned to the IF by its own capacitor. It couples one IF stage to the next and selects as it does so.',
    'coupling coefficient': 'k: the share of one coil’s magnetic field that links the other, from 0 for none to 1 for all of it. The mutual inductance is k × √(L1 × L2).',
    'critical coupling': 'The coupling at which two identical tuned circuits give the most output with a flat top and no dip: k × Q = 1.',
    'over-coupled': 'Coupled more tightly than critical: the response splits into two humps with a dip between them, and the passband widens.',
    'under-coupled': 'Coupled more loosely than critical: a single rounded peak, and less output.',
    'phase noise': 'Random jitter in the timing of an oscillator’s cycles, which spreads some of its power into noise either side of its frequency.',
    'dBc/Hz': 'The unit of phase noise: the noise power in a 1 Hz bandwidth at a stated offset, in decibels relative to the carrier.',
    'reciprocal mixing': 'A strong station near the wanted one mixing with the local oscillator’s phase noise, so that noise lands in the IF passband.'
  },

  panels: PANELS,

  /* ---- the five items, in reading order ---- */
  items: [
    {
      code: '3I1',
      levels: ['intermediate', 'full'],
      introduces: {
        intermediate: ['superhet', 'intermediate frequency', 'local oscillator', 'mixer'],
        full: ['superhet', 'double superhet', 'image frequency', 'adjacent channel selectivity', 'product detector', 'BFO']
      },
      panel: null,
      heading: { intermediate: 'Why the superhet', full: 'The single and the double superhet' },
      lead: {
        intermediate: 'A tuned circuit gets wider as the frequency goes up. The superhet gets round that by doing its selecting at one fixed frequency.',
        full: 'Every block in a superhet has one job. A double superhet adds a second mixer so that two IFs can each do one job well.'
      },
      headline: {
        intermediate: 'Why almost every receiver uses the superhet arrangement.',
        full: 'Single and double superhet block diagrams, and the job of each block.'
      },
      workNote: {
        intermediate: 'Nothing to work out here. Intermediate session 9 of the course builds the block diagram a stage at a time; 3I3 below puts the reason for it on the bench.',
        full: 'Nothing to work out here: the exam asks for the blocks and their order. Full session 14 of the course steps through every block and the double superhet; 3I3 below solves the frequency plan of both.'
      },
      explain: {
        intermediate: [
          'A receiver has to pick one station out of many. The obvious way is a tuned circuit at the signal frequency, but its bandwidth is its frequency divided by its Q, so at 14 MHz a tuned circuit with a Q of 100 passes a band 140 kHz wide, many stations at once, and it has to be retuned, along with every other tuned circuit, each time you change frequency.',
          'The superhet does something cleverer. A mixer combines the incoming signal with a local oscillator, LO, and moves it to one fixed intermediate frequency, the IF. Tuning the receiver moves the LO, so whatever you tune to always arrives at the same IF.',
          'Everything after the mixer then works at that one frequency. The IF filter and amplifier can be built once and built well: they give most of the receiver’s selectivity and most of its gain. A detector recovers the audio and an audio amplifier drives the loudspeaker.',
          'Change band and only the LO and the tuned circuits ahead of the mixer change; the IF stages stay as they are. That is the second advantage: one receiver, many bands. The section on 3I3 below puts both advantages on the bench.'
        ],
        full: [
          'The single conversion superhet, in signal order: an RF amplifier with tuned circuits, the mixer, fed by the local oscillator, the IF filter and amplifier, the detector, and the audio amplifier. AGC takes a voltage from the detector back to the IF and RF stages. The RF stage’s tuned circuits must stop the image frequency before the mixer, which 3I3 below explains. The IF stages give most of the selectivity and most of the gain.',
          'The detector depends on the mode: a diode for AM, a discriminator for FM, and for SSB and CW a product detector, fed by a BFO, or for SSB a carrier insertion oscillator. That oscillator feeds the detector. It never feeds a mixer, which is a common wrong option.',
          'A double superhet has two mixers, two LOs and two IFs, and still one detector. The first IF is high, so that the image is far from the signal and the RF stage can stop it. The second IF is low, so that a narrow filter is easy to make: that gives adjacent channel selectivity. Receiving 14.2 MHz with an LO at 24.9 MHz gives a first IF of 10.7 MHz; a second LO at 10.245 MHz brings it down to 455 kHz.',
          'Exam diagrams letter or number the blocks, or leave one out. Learn the order rather than any one diagram: the IF stage goes between the mixer and the detector, the LO feeds a mixer, and the BFO or CIO feeds the detector.'
        ]
      }
    },

    {
      code: '3I2',
      levels: ['intermediate', 'full'],
      introduces: {
        intermediate: ['mixer'],
        full: ['spurious response']
      },
      panel: 'mixer',
      circuit: 'ideal',
      toggle: { label: 'Mixer', levels: ['full'],
                options: [['ideal', 'Ideal mixer'], ['real', 'Real mixer'], ['image', 'A station on the image']] },
      heading: { intermediate: 'The mixer: sum and difference', full: 'Everything that comes out of a mixer' },
      lead: {
        intermediate: 'Put two frequencies into a mixer and two new ones come out: their sum and their difference. Set any signal and any LO and see.',
        full: 'An ideal mixer gives the sum and the difference and nothing else. A real one gives more, and one of the extras can land on the IF.'
      },
      headline: {
        intermediate: 'Mixing two frequencies gives you their sum and difference. One of those becomes the IF.',
        full: 'What a mixer does, and the other products it makes alongside the one you wanted.'
      },
      presets: [
        { label: '7.1 MHz, LO 16.1 MHz', values: { toggle: 'ideal', frf: 7.1e6, flo: 16.1e6, fif: 9e6 },
          note: 'Course examples, with a 9 MHz IF' },
        { label: '14.2 MHz, LO 5.2 MHz', values: { toggle: 'ideal', frf: 14.2e6, flo: 5.2e6, fif: 9e6 } },
        { label: 'Real mixer, LO 8.05 MHz', levels: ['full'], values: { toggle: 'real', frf: 7.1e6, flo: 8.05e6, fif: 9e6 } },
        { label: 'A station on the image', levels: ['full'], values: { toggle: 'image', frf: 7.1e6, flo: 16.1e6, fif: 9e6 } }
      ],
      formulas: { intermediate: ['sumDiff'], full: ['sumDiff', 'loNeed'] },
      workLead: {
        intermediate: 'The two new frequencies, from the two on the controls:',
        full: 'The two main products, then the two LOs that would put this signal on the IF:'
      },
      workNote: {
        intermediate: 'Neither line is on the exam’s formula sheet: learn that a mixer gives the sum and the difference, and that one of them is the IF. To check an answer, take the difference between your LO and the signal: it should be the IF.',
        full: 'LO = RF ± IF is not on the sheet. Given the LO and the IF, the signal is LO ± IF and the other main product is the sum. The levels of the extra products depend on the mixer; the ones drawn are illustrative.'
      },
      explain: {
        intermediate: [
          'The graph is what comes out of the mixer, worked out from its waveform: the signal and the LO are sampled, multiplied together, and the result is sorted into its frequencies. The left of the panel shows the waveforms themselves.',
          'Two lines come out, at the sum of the two inputs and at their difference. The inputs themselves are gone: the dashed marks show where they were. At 7.1 MHz with the LO on 16.1 MHz, the sum is 23.2 MHz and the difference 9 MHz, which falls in the IF filter, so 9 MHz is the IF.',
          'Drag the LO and both lines move. Drag the signal and move the LO the same amount and the difference stays on the IF: that is tuning a superhet. Press the second preset: 14.2 MHz with the LO at 5.2 MHz also gives 9 MHz, the LO now below the signal.',
          'Either product could be the IF; in most receivers it is the difference. The IF filter keeps it and throws the other away.'
        ],
        full: [
          'A mixer is deliberately non-linear, and an ideal one is a multiplier: two sine waves multiplied give exactly their sum and their difference. The graph is the Fourier transform of the sampled output, so what is drawn is what the waveform on the left contains.',
          'Choose Real mixer. A real mixer is built from a device with a curved characteristic, and its output also holds some of each input, their harmonics, and products at m × LO ± n × RF for small whole numbers m and n. Press Real mixer, LO 8.05 MHz: neither main product is near 9 MHz, but 2 × 8.05 − 7.1 = 9 MHz is, and the readout names it. That is a spurious response: the receiver hears 7.1 MHz while tuned somewhere else entirely.',
          'Choose A station on the image. With the LO on 16.1 MHz, a station on 25.1 MHz is also 9 MHz from the LO, and the dashed line from it lands on exactly the same place as the wanted IF. Once both are at 9 MHz no IF filter can part them. That is the image, which 3I3 below deals with.',
          'Beyond the syllabus, and illustrative: the real mixer here is 0.05x + x² + 0.15x³, chosen to show the products clearly, not taken from any real device, so the levels of its extra lines are not to be read as typical. A balanced mixer suppresses many of them, but no mixer is free of them.'
        ]
      },
      highlight: [],
      controls: ['frf', 'flo', 'fif']
    },

    {
      code: '3I3',
      levels: ['intermediate', 'full'],
      introduces: {
        intermediate: ['IF transformer'],
        full: ['preselector']
      },
      panel: { intermediate: 'coupled', full: 'image' },
      circuit: 'above',
      toggle: { label: 'Local oscillator', levels: ['full'],
                options: [['above', 'LO above'], ['below', 'LO below'], ['double', 'Double superhet']] },
      heading: { intermediate: 'Why a fixed IF selects so well', full: 'The local oscillator, the image, and a high or low IF' },
      lead: {
        intermediate: 'The same coil and capacitor quality, used at the signal and used at a fixed 455 kHz IF, give very different bandwidths. Change band and only one of them changes.',
        full: 'Put the LO above or below the signal, choose the IF, and see where the image falls and how much the RF stage cuts it.'
      },
      headline: {
        intermediate: 'A fixed IF gives good selectivity, and mixing ahead of it lets you cover several bands.',
        full: 'Choosing a high or low IF, and why some receivers convert more than once.'
      },
      presets: [
        { label: '80 m, 3.65 MHz', levels: ['intermediate'], values: { fsig: 3.65e6, qif: 50 },
          note: 'One band after another: the IF stays at 455 kHz' },
        { label: '20 m, 14.2 MHz', levels: ['intermediate'], values: { fsig: 14.2e6, qif: 50 } },
        { label: '10 m, 28.5 MHz', levels: ['intermediate'], values: { fsig: 28.5e6, qif: 50 } },
        { label: '455 kHz IF', levels: ['full'], values: { toggle: 'above', fsig: 14.2e6, fif: 455e3, qrf: 50 },
          note: '14.2 MHz, one tuned circuit of Q 50' },
        { label: '9 MHz IF', levels: ['full'], values: { toggle: 'above', fsig: 14.2e6, fif: 9e6, qrf: 50 } },
        { label: '45 MHz IF', levels: ['full'], values: { toggle: 'above', fsig: 14.2e6, fif: 45e6, qrf: 50 } },
        { label: 'Double: 10.7 MHz, then 455 kHz', levels: ['full'], values: { toggle: 'double', fsig: 14.2e6, fif: 10.7e6, qrf: 50 } },
        { label: '3.65 MHz, 455 kHz IF', levels: ['full'], values: { toggle: 'below', fsig: 3.65e6, fif: 455e3, qrf: 50 } }
      ],
      formulas: {
        intermediate: ['loI', 'bwRf', 'bwIfI'],
        full: ['lo', 'img', 'rej', 'qFilt']
      },
      workLead: {
        intermediate: 'The LO this band needs, then the bandwidth of one tuned circuit at the signal against the IF transformer at 455 kHz:',
        full: d => d.device === 'double'
          ? 'Both LOs, both images, and the Q the second IF’s filter needs:'
          : 'The LO, the image, how much one tuned circuit leaves of it, and the Q a filter needs at this IF:'
      },
      workNote: {
        intermediate: 'Only the LO line is for learning at this level, and only as the difference rule from 3I2. The bandwidths are for interest: compare them, and note which one moves when you change band.',
        full: 'LO = RF ± IF and image = RF ± 2 × IF are not on the sheet: learn them, and that the image is on the LO’s side. Q = fc ÷ (fu − fl) is on it. The response of one tuned circuit is beyond the syllabus; the circuit is solved on the bench anyway.'
      },
      explain: {
        intermediate: [
          'The circuit is an IF transformer, the heart of an IF amplifier. Look for a coil with a capacitor across it: L1 with C1 is one tuned circuit, L2 with C2 the other, both tuned to 455 kHz, with the two coils wound close enough to share part of their magnetic field. Those tuned circuits are what select the wanted signal. R1 stands for the stage before, R2 for the stage after.',
          'The solid curve is that transformer, solved. The dashed curve is one tuned circuit of the same Q, but working at the signal frequency, as it would have to in a receiver with no IF. Both are drawn against the distance from the wanted signal.',
          'Press the band presets. At 3.65 MHz the tuned circuit at the signal is already 73 kHz wide; at 28.5 MHz it is 570 kHz wide and hardly selects at all. The IF transformer does not move: 455 kHz is 455 kHz on every band, so its bandwidth stays at about 13 kHz. That is why a fixed IF gives good selectivity.',
          'And it is why mixing ahead of the IF gives several bands. From band to band only the LO and the tuned circuits ahead of the mixer change; the last readout gives the LO. Drag along the graph to read what each curve does to a station that far away.',
          'A real IF strip has more than this: two or three such transformers, and often a ceramic or crystal filter as well, which is how it gets down to the 2.4 kHz an SSB signal needs.'
        ],
        full: [
          'For a given signal and IF there are two places for the LO: LO = RF + IF, above the signal, or LO = RF − IF, below it. Both give the IF as the difference. Choose LO above and LO below and watch the LO mark move.',
          'Either way there is a second frequency one IF from the LO, on its far side from the signal: the image. The mixer turns it into the IF just as well, so it must be stopped before the mixer, by the preselector, the tuned circuits of the RF stage. The image is always on the LO’s side of the signal and 2 × IF from it: image = RF + 2 × IF with the LO above, RF − 2 × IF below.',
          'Press the three IF presets. With one tuned circuit of Q 50 at 14.2 MHz, a 455 kHz IF puts the image at 15.11 MHz, cut by only 16 dB. A 9 MHz IF puts it at 32.2 MHz, cut by 39 dB, and 45 MHz at 104.2 MHz, 51 dB. A high IF moves the image far away; a low IF leaves it close.',
          'The last readout is the other side of the trade. A 2.4 kHz SSB filter needs a Q of IF ÷ 2.4 kHz: about 190 at 455 kHz, easy with LC or ceramic filters, but 3750 at 9 MHz, which takes a crystal filter. A low IF makes good adjacent channel selectivity easy, a high one makes image rejection easy.',
          'Choose Double superhet to have both. The first IF, 10.7 MHz in the preset, puts image 1 at 35.6 MHz, cut by 40 dB. But the second mixer has an image of its own, 2 × 455 kHz from the signal, at 15.11 MHz, which the RF stage cuts by only 16 dB. The first IF filter has to remove it, at 9.79 MHz in the first IF. Every step down must leave the next image outside the filter before it.',
          'Which side for the LO? A medium wave set tuning 600 to 1600 kHz with a 460 kHz IF needs 1060 to 2060 kHz above, a range of under 2 to 1, against 140 to 1140 kHz below, more than 8 to 1, which a tuning capacitor cannot cover. And with the LO below, 7 MHz with a 455 kHz IF has its image at 6.09 MHz, in a broadcast band full of strong stations.'
        ]
      },
      highlight: { intermediate: ['C1', 'TX', 'C2'], full: ['L1', 'C1'] },
      controls: { intermediate: ['fsig', 'qif'], full: ['fsig', 'fif', 'qrf'] }
    },

    {
      code: '3I4',
      levels: ['full'],
      introduces: {
        full: ['IF transformer', 'coupling coefficient', 'critical coupling', 'over-coupled', 'under-coupled']
      },
      panel: 'coupled',
      circuit: 'pair',
      heading: { full: 'Two tuned circuits, coupled' },
      lead: {
        full: 'Two identical tuned circuits share part of a magnetic field. How much they share decides the shape of the response: one peak, a flat top, or two humps.'
      },
      headline: {
        full: 'The IF amplifier and IF transformer, and what happens when you couple two tuned circuits.'
      },
      presets: [
        { label: 'Under-coupled, k × Q = 0.5', values: { k: 0.01, qif: 50 }, note: 'Q 50 in each tuned circuit' },
        { label: 'Critical, k × Q = 1', values: { k: 0.02, qif: 50 } },
        { label: 'Over-coupled, k × Q = 2', values: { k: 0.04, qif: 50 } }
      ],
      formulas: { full: ['kq', 'bw1', 'bw2', 'humps'] },
      workLead: {
        full: 'How tight the coupling is, then the bandwidth of one tuned circuit and of the pair:'
      },
      workNote: {
        full: 'None of these is on the sheet, and the syllabus asks you to recognise the curves rather than calculate them: flat topped with steep sides is critical, the double hump is over-coupled. The bandwidth of one tuned circuit comes from Q = fc ÷ (fu − fl), which is. The hump rule holds for lossless coils; the solved humps sit a little closer in.'
      },
      explain: {
        full: [
          'IF stages are coupled by tuned transformers rather than plain capacitors, so every stage adds selectivity, and the turns can match the transistor to the next stage. Each IF transformer sits in a screened can, with a ferrite core turned to tune it; the screen stops one stage’s field reaching another, which could make a high gain IF strip oscillate.',
          'Here is one, solved: L1 and C1 tuned to 455 kHz, L2 and C2 likewise, each loaded to the Q on the slider by R1 and R2. The coupling coefficient k says how much of one coil’s field links the other; the mutual inductance between them is k × √(L1 × L2). The response is drawn against the most any coupling can give the next stage, so 0 dB is all there is.',
          'Press the three presets. Under-coupled, k × Q = 0.5: one rounded peak, 1.9 dB down. Critical, k × Q = 1: the most output, a flat top with no dip, and sides steeper than one tuned circuit, drawn dashed. Over-coupled, k × Q = 2: two humps at full height either side of a dip, and a wider passband. Drag k between them and watch one shape turn into the next.',
          'At critical coupling the pair is about √2 times as wide as one tuned circuit, 12.9 kHz at Q 50 against 9.1 kHz, yet far steeper outside it. Read the humps: the lossless rule f₀ ÷ √(1 ± k) puts them at 446.2 and 464.4 kHz when k is 0.04; the real, loaded circuit puts them at 447.4 and 463.1 kHz.',
          'The gain of an IF stage is set by the DC bias of its transistor. The AGC voltage, or a manual gain control, turns the bias down to turn the gain down, and that moves the transistor onto the curved part of its characteristic, so the IF waveform is distorted. The distortion is harmonics of the IF, 910 kHz and 1365 kHz here, far outside the passband. The last readout is what the IF transformer after the stage leaves of them: at critical coupling and Q 50, 75 dB and 89 dB down. One tuned circuit of Q 50 on its own, the course’s figure, cuts them by about 37 and 43 dB; the transformer’s two tuned circuits roughly double that. The tuned circuits remove the distortion.',
          'Beyond the syllabus: k × Q = 1 for critical coupling holds for two identical circuits. Most broadcast IF transformers run close to critical; wider passbands, for FM, use some over-coupling.'
        ]
      },
      highlight: [],
      controls: ['k', 'qif']
    },

    {
      code: '3I5',
      levels: ['full'],
      introduces: {
        full: ['phase noise', 'dBc/Hz', 'reciprocal mixing']
      },
      panel: null,
      heading: { full: 'Phase noise' },
      lead: {
        full: 'No oscillator gives one perfectly pure frequency. The little noise its parts make spreads some of its power either side, and that matters in receivers and transmitters alike.'
      },
      headline: {
        full: 'Phase noise, where it comes from, and why it is quoted in dBc/Hz.'
      },
      workNote: {
        full: 'Nothing to solve here, and no formula to learn: recall where phase noise comes from, what it does, and that it is measured in dBc/Hz. Full session 14 of the course shows the noise skirts of three kinds of oscillator and reciprocal mixing at work.'
      },
      explain: {
        full: [
          'Every part in an oscillator, its transistor and its resistors among them, makes a little random noise. That noise nudges the timing, the phase, of each cycle, so the output is not one pure frequency: some of its power is spread into noise either side of it, falling away with distance. That is phase noise.',
          'It is quoted in dBc/Hz at a stated offset: the noise power in a bandwidth of 1 Hz, so many decibels below the carrier, that far from it. More negative is cleaner, and 20 dB more negative is a hundredth of the noise power. Beyond the syllabus: in a 2.4 kHz passband there are 2400 of those hertz, so the noise in it is about 34 dB more than the figure per hertz.',
          'PLL synthesisers are the usual source. Their VCO is a wide range oscillator of modest Q, and outside the loop’s bandwidth its noise is not corrected. A crystal oscillator, with its very high Q, is the cleanest; a free running LC VFO sits in between.',
          'In a receiver, phase noise on the LO causes reciprocal mixing. A strong station a few kilohertz from the wanted one mixes with the LO’s noise, and the result lands in the IF passband as noise. The IF filter cannot help, because the noise is already at the IF, so a weak signal is buried beside a strong, clean one.',
          'In a transmitter, the oscillator’s noise goes out with the signal, raising the noise floor a few kilohertz either side of it, where other stations hear it. It is not drift, and it is not harmonics.'
        ]
      }
    }
  ],

  /*
   * Our own explanation of each answer, keyed by the bank's reference number.
   * The question, its options and the marked answer are the RSGB's and ship
   * unadapted. Everything here is ours. A seed sets the bench to the
   * question's own values where they fit the controls.
   */
  answers: {
    '2025-Full3621': {
      why: 'The IF stage takes the mixer’s output and passes it on to the detector, so it goes between the mixer and the detector. Whichever point lies there in the diagram is the answer; the key gives point 2. The diagram is not reproduced on this page.',
      source: { from: ['3I1'] }
    },
    '2025-Full3623': {
      why: 'An SSB signal has no carrier, and the product detector needs one put back before it can give audio. The oscillator that feeds the detector, the stage just before the audio amplifier, is the carrier insertion oscillator. A sideband filter belongs in the IF, before the detector, and the demodulator is the detector itself. The diagram is not reproduced on this page.',
      source: { from: ['3I1'] }
    },
    '2025-Full3816': {
      why: 'Each IF does one job. The high first IF puts the image far from the signal, where the RF stage can reject it. The low second IF makes a narrow filter easy to build, which gives adjacent channel selectivity. Two IFs do not add amplification as such, and the other way round would get neither job done.',
      working: ['first IF 10.7 MHz: image at 14.2 + 2 × 10.7 = 35.6 MHz, far from the signal',
                'second IF 455 kHz: a 2.4 kHz filter needs Q = 455 ÷ 2.4, about 190',
                'so the first IF provides image rejection and the second adjacent channel selectivity'],
      source: { eq: ['img', 'qFilt'], from: ['3I1', '3I3'] },
      seed: { item: '3I3', toggle: 'double', fsig: 14.2e6, fif: 10.7e6, qrf: 50 },
      seedNote: 'A double superhet receiving 14.2 MHz: 10.7 MHz first, then 455 kHz. Read how far each image is from the signal.'
    },
    '2025-Full3944': {
      why: 'The BFO supplies the carrier a CW signal needs to make an audible note, and it does that at the demodulator, the product detector, after the last IF. The second mixer is fed by the second local oscillator; the BFO is a different oscillator with a different job.',
      source: { from: ['3I1'] }
    },
    '2025-Full505': {
      why: 'A double superhet converts twice, so it has two mixers. However many IFs it has, there is one detector at the end, and for SSB that is a product detector. A ratio detector is for FM.',
      source: { from: ['3I1'] }
    },
    '2025-Full3425': {
      why: 'The LO must sit one IF away from the signal: LO = RF ± IF. Take the difference between each option and the signal frequency in the diagram; the one that gives the IF shown is the answer, and the key gives 68.4 MHz. An option equal to the signal itself is never right. The diagram is not reproduced on this page.',
      source: { eq: ['lo'], from: ['3I3'] }
    },
    '2025-Full3628': {
      why: 'The wording and the key do not quite agree. Taken literally, a receiver tuned to 1.3555 MHz with its LO on 1.820 MHz would have its other LO at 1.3555 − 0.4645 = 0.891 MHz, which is not offered. The keyed answer, 2.285 MHz, comes from the numbers of question 3686: 1.820 MHz received with the LO on 1.3555 MHz. So work it that way, with 1.3555 MHz as the LO. The IF is the difference, 0.4645 MHz, and the other possible LO is the same distance on the far side of the signal. The diagram is not reproduced on this page.',
      working: ['IF = 1.820 − 1.3555 = 0.4645 MHz',
                'the other LO is one IF above the signal: 1.820 + 0.4645',
                '= 2.2845 MHz, so 2.285 MHz'],
      source: { eq: ['lo'], from: ['3I3'] },
      seed: { item: '3I3', toggle: 'above', fsig: 1.82e6, fif: 465e3, qrf: 50 },
      seedNote: 'The bench holds 1.82 MHz with a 465 kHz IF, to the nearest 5 kHz, and the LO above at 2.285 MHz. Press LO below: 1.355 MHz.'
    },
    '2025-Full3686': {
      why: 'The IF is the difference between the signal and the LO. The other LO that gives the same IF is that far on the other side of the signal: here above it, since the given LO is below.',
      working: ['IF = 1.820 − 1.355 = 0.465 MHz',
                'the other LO is one IF above the signal: 1.820 + 0.465',
                '= 2.285 MHz'],
      source: { eq: ['lo'], from: ['3I3'] },
      seed: { item: '3I3', toggle: 'above', fsig: 1.82e6, fif: 465e3, qrf: 50 },
      seedNote: 'The bench receives 1.82 MHz with a 465 kHz IF and the LO above, at 2.285 MHz. Press LO below and it moves to 1.355 MHz.'
    },
    '2025-Full515': {
      why: 'The mixer takes the signal from the RF amplifier and the local oscillator and combines them to make the IF, their difference or their sum. It does not demodulate anything: that is the detector’s job, further on.',
      source: { eq: ['sumDiff'], from: ['3I2'] },
      seed: { toggle: 'ideal', frf: 7.1e6, flo: 16.1e6, fif: 9e6 },
      seedNote: 'A 7.1 MHz signal and a 16.1 MHz LO go in; 23.2 MHz and 9 MHz come out, and 9 MHz is the IF.'
    },
    '2025-Full516': {
      why: 'The two principal outputs are the difference and the sum. The IF of 470 kHz is the difference, so the signal is 2 MHz ± 470 kHz. Those two, 1530 kHz and 2470 kHz, are both offered, but they are possible inputs, not outputs. Of them only 1530 kHz gives a sum among the options: 1530 + 2000 = 3530 kHz. The other signal, 2470 kHz, would give a sum of 4470 kHz, not offered, so the question takes the signal below the LO.',
      working: ['IF = LO − RF, so RF = 2000 − 470 = 1530 kHz',
                'the other main product is the sum: 2000 + 1530',
                '= 3530 kHz'],
      source: { eq: ['sumDiff'], from: ['3I2'] },
      seed: { toggle: 'ideal', frf: 1.53e6, flo: 2e6, fif: 470e3 },
      seedNote: 'The mixer on the bench has 1.53 MHz and a 2 MHz LO: the difference sits in the 470 kHz IF filter, and the sum at 3.53 MHz.'
    },
    '2025-Full517': {
      why: 'The LO is one IF from the signal, above or below. Above, it runs 1060 to 2060 kHz, under 2 to 1; below, 140 to 1140 kHz, more than 8 to 1. Frequency goes as one over the square root of the capacitance, so 2 to 1 needs a capacitance swing of about 4 to 1, which a tuning capacitor gives, while 8 to 1 would need about 66 to 1, which it cannot. So the LO goes above.',
      working: ['LO above: 600 + 460 = 1060 kHz, 1600 + 460 = 2060 kHz',
                '2060 ÷ 1060 = 1.94; below it would be 140 to 1140 kHz, 8.1 to 1',
                'so 1060 to 2060 kHz'],
      source: { eq: ['lo'], from: ['3I3'] },
      seed: { item: '3I3', toggle: 'above', fsig: 0.6e6, fif: 460e3, qrf: 50 },
      seedNote: 'The bench is at the bottom of the band, 600 kHz, with a 460 kHz IF and the LO above at 1060 kHz. Drag the signal up to 1.6 MHz.'
    },
    '2025-Full512': {
      why: 'With the LO at 1.465 MHz above a 1 MHz signal, the IF is 465 kHz. The other LO for the same IF is 465 kHz below the signal.',
      working: ['IF = 1.465 − 1.000 = 0.465 MHz',
                'the other LO is one IF below the signal: 1.000 − 0.465',
                '= 0.535 MHz, 535 kHz'],
      source: { eq: ['lo'], from: ['3I3'] },
      seed: { item: '3I3', toggle: 'below', fsig: 1e6, fif: 465e3, qrf: 50 },
      seedNote: 'The bench receives 1 MHz with a 465 kHz IF and the LO below, at 535 kHz. Press LO above: 1.465 MHz.'
    },
    '2025-Full513': {
      why: 'The LO can be one IF above the signal or one IF below it, and either gives a 460 kHz difference.',
      working: ['LO = RF ± IF = 1850 ± 460 kHz',
                '1850 − 460 = 1390 kHz; 1850 + 460 = 2310 kHz',
                '1390 kHz or 2310 kHz'],
      source: { eq: ['lo'], from: ['3I3'] },
      seed: { item: '3I3', toggle: 'below', fsig: 1.85e6, fif: 460e3, qrf: 50 },
      seedNote: 'The bench is on 1.85 MHz with a 460 kHz IF, the LO below at 1.39 MHz. Press LO above for 2.31 MHz.'
    },
    '2025-Full518': {
      why: 'The image is 2 × IF from the signal, on the LO’s side. The key takes the LO above, at 23 MHz, which puts the image at 32 MHz. With the LO below, at 5 MHz, the image would be 4 MHz, which is not offered. 9 MHz is the IF, and 5 and 23 MHz are the two LOs, not images.',
      working: ['LO above: 14 + 9 = 23 MHz',
                'image = 14 + 2 × 9',
                '= 32 MHz'],
      source: { eq: ['lo', 'img'], from: ['3I3'] },
      seed: { item: '3I3', toggle: 'above', fsig: 14e6, fif: 9e6, qrf: 50 },
      seedNote: 'The bench is on 14 MHz with a 9 MHz IF and the LO above. Read how much one tuned circuit of Q 50 cuts the image at 32 MHz.'
    },
    '2025-Full520': {
      why: 'Second channel interference is the image. It lies 2 × IF from the signal on the LO’s side. Of the options, 6100 kHz fits, with the LO below the signal; with the LO above, the image would be near 7910 kHz.',
      working: ['LO below: 7000 − 455 = 6545 kHz',
                'image = 7000 − 2 × 455 = 6090 kHz',
                'about 6100 kHz'],
      source: { eq: ['lo', 'img'], from: ['3I3'] },
      seed: { item: '3I3', toggle: 'below', fsig: 7e6, fif: 455e3, qrf: 50 },
      seedNote: 'The bench receives 7 MHz with a 455 kHz IF and the LO below. The image, at 6.09 MHz, is cut by only 23 dB.'
    },
    '2025-Full524': {
      why: 'At a low IF a narrow filter needs only a modest Q, so a filter a few kilohertz wide is easy to make, and that is good adjacent channel selectivity. A low IF does the opposite for the image, which ends up close to the signal; it has nothing to do with LO drift.',
      working: ['a 2.4 kHz filter at 455 kHz needs Q = 455 ÷ 2.4, about 190',
                'at 10.7 MHz it needs Q = 10700 ÷ 2.4, about 4460',
                'so at a low IF good adjacent channel selectivity is easily achieved'],
      source: { eq: ['qFilt'], from: ['3I3'] },
      seed: { item: '3I3', toggle: 'above', fsig: 14.2e6, fif: 455e3, qrf: 50 },
      seedNote: 'A 455 kHz IF: read the Q its filter needs, and then the image, cut by only 16 dB.'
    },
    '2025-Full531': {
      why: 'The image is set by the first IF and the adjacent channel selectivity by the last. So the first IF is made high, for the image, and the second low, for a narrow filter. A double superhet.',
      working: ['high first IF, 10.7 MHz: the image is 21.4 MHz from the signal',
                'low second IF, 455 kHz: a 2.4 kHz filter needs a Q of only about 190',
                'a high intermediate frequency followed by a low one'],
      source: { eq: ['img', 'qFilt'], from: ['3I3'] },
      seed: { item: '3I3', toggle: 'double', fsig: 14.2e6, fif: 10.7e6, qrf: 50 },
      seedNote: 'The double superhet on the bench: image 1 far away and cut by 40 dB, then a 455 kHz second IF.'
    },
    '2025-Full3629': {
      why: 'The critically coupled curve has a flat top with steep sides and no dip. Two humps with a dip between them is over-coupled; a lower, rounded single peak is under-coupled. The key gives curve 2 as the flat-topped one. The diagram is not reproduced on this page.',
      source: { eq: ['kq'], from: ['3I4'] },
      seed: { k: 0.02, qif: 50 },
      seedNote: 'The bench is at critical coupling. Drag k up and down to see the other shapes.'
    },
    '2025-Full532': {
      why: 'Critical coupling is two tuned circuits, both tuned to the IF, coupled just tightly enough to give the most output with a flat top: steep sides and no dip. Tighter and the top splits into two humps. A screening can stops coupling to other parts; it does not set this one.',
      source: { eq: ['kq'], from: ['3I4'] },
      seed: { k: 0.02, qif: 50 },
      seedNote: 'Critical coupling, k × Q = 1. Compare the dashed single tuned circuit: rounder top, gentler sides.'
    },
    '2025-Full534': {
      why: 'The IF stages work at one fixed frequency, so their filters and tuned circuits can be made narrow and steep once, for every band. That is where a superhet gets most of its selectivity. The mixer moves the signal; the detector and audio stages come after the selecting is done.',
      source: { from: ['3I4', '3I3'] },
      seed: { k: 0.02, qif: 50 },
      seedNote: 'One IF transformer, critically coupled: about 13 kHz wide at Q 50, and every stage adds more.'
    },
    '2025-Full535': {
      why: 'Changing the bias moves the transistor onto the curved part of its characteristic, so the IF waveform is distorted. The distortion is harmonics of the IF, far outside the passband, and the IF tuned circuits after the stage reject them.',
      working: ['distortion of the IF is harmonics: 2 × 455 = 910 kHz, 3 × 455 = 1365 kHz',
                'one IF transformer, critically coupled at Q 50, cuts them by 75 dB and 89 dB',
                'removed by the IF tuned circuits'],
      source: { from: ['3I4'] },
      seed: { k: 0.02, qif: 50 },
      seedNote: 'Read the last readout: what this IF transformer leaves of the second and third harmonics of the IF.'
    },
    '2025-Full536': {
      why: 'AGC is a DC voltage made from the signal level at the detector. It shifts the DC bias of the IF transistors, and their gain follows. It does not touch the coupling or the tuning, which would change the selectivity, and it is DC, not RF.',
      source: { from: ['3I4'] }
    },
    '2025-Full537': {
      why: 'IF stages are coupled by tuned transformers, so each one adds selectivity and matches one transistor to the next. A plain coupling capacitor would add no selectivity at all.',
      source: { from: ['3I4'] },
      seed: { k: 0.02, qif: 50 },
      seedNote: 'The tuned transformer between two IF stages, critically coupled.'
    },
    '2025-Full7641': {
      why: 'Phase noise is worst in a PLL synthesiser. Its VCO is a wide range oscillator of modest Q, and outside the loop bandwidth nothing corrects its noise. A crystal oscillator, with its very high Q, is the cleanest, and an LC oscillator sits between the two. An RC oscillator has a lower Q still and is noisy too, but it is an audio oscillator, not a radio’s LO; the exam’s answer is the PLL.',
      source: { from: ['3I5'] }
    },
    '2025-Full7643': {
      why: 'The oscillator’s phase noise is spread a few kilohertz either side of its frequency, and in a transmitter it goes out with the signal, so the noise floor rises within a few kilohertz of the transmission. It is not drift, it does not touch the sideband filter, and it does not make harmonics.',
      source: { from: ['3I5'] }
    },
    '2025-Full7693': {
      why: 'Phase noise is the noise power in a 1 Hz bandwidth relative to the carrier: dBc/Hz, at a stated offset. dBc alone leaves out the bandwidth, and dBi is aerial gain.',
      source: { from: ['3I5'] }
    },
    '2025-Full7694': {
      why: 'Phase noise belongs to oscillators: the random noise of their parts disturbs the timing of each cycle. An amplifier can add noise, but phase noise is the oscillator’s.',
      source: { from: ['3I5'] }
    },
    '2025-Full7797': {
      why: 'Severe phase noise on the transmitter’s oscillator goes out with the signal and raises the noise floor several kilohertz either side of it, where it can bury other stations. Reciprocal mixing is the receiver’s problem, not the transmitter’s.',
      source: { from: ['3I5'] }
    }
  },

  outro: {
    intermediate: [
      'Three things to take from this page. A mixer gives the sum and the difference of its two inputs, and one of them is the IF. A fixed IF selects well on every band, because its tuned circuits never move. And changing band changes only the LO and the tuned circuits ahead of the mixer.',
      'The tuned circuits in an IF amplifier are the coils with capacitors across them, inside the IF transformers. The course session on receivers goes through the whole chain.'
    ],
    full: [
      'Two rules to learn, neither on the sheet: LO = RF ± IF, and image = RF ± 2 × IF, on the LO’s side. Only the RF stage can stop the image, so a high IF rejects it and a low IF makes narrow filters easy, and the double superhet uses both.',
      'Critical coupling is flat topped with steep sides; over-coupling splits into two humps. The bench shows the real bandwidth and the real humps, which sit a little inside the lossless rule. Phase noise is measured in dBc/Hz, and it hurts both ways: reciprocal mixing on receive, noise either side on transmit.'
    ]
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = BENCH;
if (typeof window !== 'undefined') window.BENCH = BENCH;
