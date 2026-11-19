/*
 * content/3F.js - RF power amplifiers.
 *
 * The last stage of a transmitter, followed from the bookkeeping of its power
 * at Intermediate to what happens when it is driven too hard at Full.
 *
 * Nothing on the intermodulation panel is a drawing of the expected answer.
 * Two tones are put through an amplifier curve and the output is transformed:
 * every line on the spectrum, and every figure about it, is a coefficient of
 * that transform. The output network and the low-pass filter after the
 * amplifier are solved by nodal analysis, so what they remove, and what they
 * cannot, is the circuit's answer rather than an assumption.
 *
 * The amplifier curve is a model, chosen because it behaves the way the
 * syllabus says an amplifier behaves: a straight line at low drive with a
 * mostly cubic bend (and a little fifth power, for the fifth order
 * products), so that the third order products rise three decibels for each
 * decibel of drive until the peaks reach the ceiling, and then a hard ceiling
 * the output cannot pass. A little even order bend is added, as a single
 * ended stage has, so the second harmonic is there too. The figures are
 * illustrative; the relationships are the physics.
 */

const Fm = window.Fmt;
const MX = window.MNA;
const DX = window.DSP;
const NBSP = String.fromCharCode(160);

/* ---------------- the amplifier ---------------- */

// lopsidedness of the curve: a single ended stage squashes one half of the
// cycle more than the other, which is what makes even harmonics
const PA_EVEN = 0.06;

/*
 * Output against input. A bend of x - 0.4 x^3 + 0.04 x^5, whose slope,
 * (1 - x^2)(1 - 0.2 x^2), falls to zero exactly at x = 1; it stays flat
 * beyond it: that is the ceiling, set by the supply. The small fifth power
 * term makes fifth order products below the ceiling, as a real amplifier
 * does, without moving the cubic bend that sets the third order ones.
 * Small signal gain is one, so the straight line it bends away from is y = x.
 */
const PA_FIFTH = 0.04;
const PA_THIRD = (1 + 5 * PA_FIFTH) / 3;      // so the slope is zero at x = 1
const PA_TOP = 1 - PA_THIRD + PA_FIFTH;
function paCurve(x) {
  const c = x >= 1 ? PA_TOP : x <= -1 ? -PA_TOP
    : x - PA_THIRD * x * x * x + PA_FIFTH * x * x * x * x * x;
  return c + PA_EVEN * c * c;
}

/* The amplitude of each harmonic when one tone of amplitude A goes in. */
function oneToneCoefs(A) {
  const N = 256;
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let k = 0; k < N; k++) re[k] = paCurve(A * Math.cos(2 * Math.PI * k / N));
  DX.fft(re, im);
  return h => 2 * Math.hypot(re[h], im[h]) / N;
}

/*
 * Two equal tones of amplitude A each. The output repeats in both phases, so
 * it is sampled on a grid of the two phases and transformed in both
 * directions: the coefficient at (m, n) is the size of the product at
 * m f1 + n f2. Sixty four points a side is far more than the orders shown
 * need; the check against 128 agrees to a thousandth of a decibel.
 */
function twoToneCoefs(A) {
  const N = 64;
  const re = new Float64Array(N * N), im = new Float64Array(N * N);
  for (let i = 0; i < N; i++) {
    const a = A * Math.cos(2 * Math.PI * i / N);
    for (let j = 0; j < N; j++) re[i * N + j] = paCurve(a + A * Math.cos(2 * Math.PI * j / N));
  }
  const r = new Float64Array(N), q = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) { r[j] = re[i * N + j]; q[j] = im[i * N + j]; }
    DX.fft(r, q);
    for (let j = 0; j < N; j++) { re[i * N + j] = r[j]; im[i * N + j] = q[j]; }
  }
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) { r[i] = re[i * N + j]; q[i] = im[i * N + j]; }
    DX.fft(r, q);
    for (let i = 0; i < N; i++) { re[i * N + j] = r[i]; im[i * N + j] = q[i]; }
  }
  return (m, n) => {
    const i = ((m % N) + N) % N, j = ((n % N) + N) % N;
    return 2 * Math.hypot(re[i * N + j], im[i * N + j]) / (N * N);
  };
}

const dB20 = x => 20 * Math.log10(Math.max(1e-15, x));

/*
 * The drive scale. 0 dB is where the peaks of the signal reach the point at
 * which a single tone has lost 1 dB of gain: the usual working limit of a
 * linear amplifier, and here the amplifier's rated output. With two tones
 * the peaks are where the two add, so each tone gets half that amplitude.
 */
const U1 = (() => {
  let lo = 0.05, hi = 1;
  const g = A => oneToneCoefs(A)(1) / A;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (dB20(g(mid)) > -1) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
})();
const RATED_TONE = twoToneCoefs(U1 / 2)(1, 0);

/* The two tone result at a drive in dB: levels and the coefficients. */
const twoMemo = new Map();
function twoTone(driveDb) {
  const k = driveDb.toFixed(4);
  if (twoMemo.has(k)) return twoMemo.get(k);
  const c = twoToneCoefs(U1 / 2 * Math.pow(10, driveDb / 20));
  const tone = c(1, 0);
  const out = {
    c: c,
    tone: dB20(tone / RATED_TONE),          // each tone, against its rated level
    rel: (m, n) => dB20(c(m, n) / tone),    // any product, against each tone
    im3: dB20(c(2, -1) / tone),
    im5: dB20(c(3, -2) / tone),
    im7: dB20(c(4, -3) / tone)
  };
  if (twoMemo.size > 400) twoMemo.clear();
  twoMemo.set(k, out);
  return out;
}

/* The same peak, as one tone: harmonics against the fundamental. */
function oneTone(driveDb) {
  const c = oneToneCoefs(U1 * Math.pow(10, driveDb / 20));
  return { c: c, rel: h => dB20(c(h) / c(1)) };
}

/*
 * The envelope, for the ALC panel: the RF amplitude out for an envelope of
 * u, where u = 1 is the rated peak drive. Tabulated once.
 */
const ENV_TABLE = (() => {
  const t = [];
  for (let i = 0; i <= 600; i++) t.push(oneToneCoefs(U1 * i / 100)(1));
  return t;
})();
function envOut(u) {
  const x = Math.max(0, Math.min(5.999, u)) * 100, i = Math.floor(x), f = x - i;
  return (ENV_TABLE[i] * (1 - f) + ENV_TABLE[i + 1] * f) / ENV_TABLE[100];
}

/* ---------------- frequencies ---------------- */

// The two tone test: an SSB transmitter on 14.100 MHz, upper sideband, fed
// two audio tones, so each appears that far above the dial.
const DIAL = 14.1e6;
const CHANNEL = [300, 2700];          // the audio a voice SSB signal occupies

/** 14101000 -> "14.101 MHz": at least three decimals, more only if needed. */
function mhz(f) {
  let s = (f / 1e6).toFixed(6).replace(/0+$/, '');
  const dot = s.indexOf('.');
  while (s.length - dot - 1 < 3) s += '0';
  return s + NBSP + 'MHz';
}
/*
 * The second of two traces of one quantity is drawn in the same colour,
 * dashed, rather than faded: a faded colour falls below 4.5:1 against the
 * panel, and faded lines that overlap pile up until they look solid.
 */
const DASH = [6, 4];
/* A level drawn dashed, as short traces, so it reads apart from a solid trace
   of the same quantity in the same colour. */
function dashedLevel(x0, x1, y, colour, width, n) {
  const out = [], step = (x1 - x0) / n;
  for (let k = 0; k < n; k++) {
    const a = x0 + k * step;
    out.push({ pts: [{ x: a, y: y }, { x: a + step * 0.6, y: y }], colour: colour, axis: 'left', width: width });
  }
  return out;
}
/* The legend swatch for a dashed line. */
function dashSwatch(colour) {
  return 'repeating-linear-gradient(90deg,' + colour + ' 0 4px,transparent 4px 6px)';
}

/* A round top for a power axis, so its four divisions read cleanly. */
function niceMax(v) {
  const step = v / 4, p = Math.pow(10, Math.floor(Math.log10(step)));
  const k = [1, 1.25, 1.5, 2, 2.5, 3, 5, 10].find(m => m * p >= step);
  return 4 * k * p;
}
const sdb = x => (x < 0 ? '&minus;' : '+') + Math.abs(x).toFixed(1) + NBSP + 'dB';
const neg = x => (x < -0.05 ? '&minus;' : '') + Math.abs(x).toFixed(1) + NBSP + 'dB';

/* ---------------- networks ---------------- */

const Z_LOAD = 50;                    // the aerial the PA is built for
const PI_Q = 3;                       // loaded Q of the output network

/*
 * A pi network matching r1 at its input to r2 at its output, at f0, for a
 * loaded Q of q on the higher resistance side. Two L networks back to back
 * through a lower virtual resistance; the standard result, re-derived here.
 */
function piDesign(f0, r1, r2, q) {
  const rh = Math.max(r1, r2), rl = Math.min(r1, r2);
  const rv = rh / (q * q + 1);
  const ql = Math.sqrt(Math.max(0, rl / rv - 1));
  const w = 2 * Math.PI * f0;
  const xh = rh / q, xlo = ql > 0 ? rl / ql : Infinity, xl = rv * (q + ql);
  const x1 = r1 >= r2 ? xh : xlo, x2 = r1 >= r2 ? xlo : xh;
  return { f0, r1, r2, q, rv, ql, x1, x2, xl, C1: 1 / (w * x1), L: xl / w, C2: 1 / (w * x2) };
}

/* The pi network on its own, fed from the transistor's load resistance. */
function piNetlist(p, vs) {
  return 'V1 s 0 ' + (vs || 1) + '\nRS s a ' + Fm.sci(p.r1) +
    '\nC1 a 0 ' + Fm.sci(p.C1) + '\nL1 a b ' + Fm.sci(p.L) +
    '\nC2 b 0 ' + Fm.sci(p.C2) + '\nRL b 0 ' + p.r2;
}

/* Power into the load as a share of what the source can give, in dB. */
function piResponse(ckt, p, f) {
  const s = MX.solveAt(ckt, f);
  const v = MX.abs(MX.nodeV(s, 'b'));
  return { db: 10 * Math.log10(Math.max(1e-30, (v * v / p.r2) / (1 / (4 * p.r1)))),
           zin: MX.div(MX.nodeV(s, 'a'), MX.currentThrough(s, 'RS')) };
}

/*
 * The 14 MHz transmitter on the intermodulation panel: the same kind of pi
 * network, then a five element low-pass filter (0.1 dB Chebyshev, cut-off
 * 17 MHz, 50 ohms), solved together. The pi network's output capacitor and
 * the filter's first one sit side by side at the same node, so they add.
 */
const TX_PI = piDesign(DIAL, 12.5, Z_LOAD, PI_Q);
const TX_LPF = (() => {
  const w = 2 * Math.PI * 17e6, g = [1.1468, 1.3712, 1.9750, 1.3712, 1.1468];
  return { C1: g[0] / (w * 50), L2: g[1] * 50 / w, C3: g[2] / (w * 50),
           L4: g[3] * 50 / w, C5: g[4] / (w * 50) };
})();
const TX_CKT = MX.parseNetlist(
  'V1 s 0 1\nRS s a 12.5\nC1 a 0 ' + Fm.sci(TX_PI.C1) + '\nL1 a b ' + Fm.sci(TX_PI.L) +
  '\nC2 b 0 ' + Fm.sci(TX_PI.C2 + TX_LPF.C1) + '\nL2 b c ' + Fm.sci(TX_LPF.L2) +
  '\nC3 c 0 ' + Fm.sci(TX_LPF.C3) + '\nL4 c d ' + Fm.sci(TX_LPF.L4) +
  '\nC5 d 0 ' + Fm.sci(TX_LPF.C5) + '\nRL d 0 50');
const filtMemo = new Map();
function filterDb(f) {
  const k = Math.round(f);
  if (filtMemo.has(k)) return filtMemo.get(k);
  const s = MX.solveAt(TX_CKT, f);
  const v = MX.abs(MX.nodeV(s, 'd'));
  const out = 10 * Math.log10(Math.max(1e-30, (v * v / 50) / (1 / (4 * 12.5))));
  if (filtMemo.size > 4000) filtMemo.clear();
  filtMemo.set(k, out);
  return out;
}

/* ---------------- envelopes ---------------- */

const ENV_T = 3.4, ENV_N = 2000;      // seconds shown, and samples across them

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/*
 * A voice: syllables of different lengths and loudness with gaps between,
 * each rising and falling, with the quick flutter of the voice on top. A
 * fixed seed, so it is the same sentence every time. Peak normalised to one.
 */
const SPEECH = (() => {
  const r = rng(7), syl = [];
  let t = 0.05;
  while (t < ENV_T) {
    const d = 0.12 + 0.16 * r();
    syl.push({ t0: t, d: d, a: 0.35 + 0.65 * r(), f: 9 + 15 * r() });
    t += d + 0.03 + 0.12 * r() + (r() < 0.15 ? 0.25 : 0);
  }
  const e = new Float64Array(ENV_N);
  for (let i = 0; i < ENV_N; i++) {
    const tt = i * ENV_T / ENV_N;
    let v = 0;
    for (const s of syl) {
      if (tt < s.t0 || tt > s.t0 + s.d) continue;
      const w = Math.sin(Math.PI * (tt - s.t0) / s.d);
      v = Math.max(v, s.a * Math.pow(w, 1.5) * (0.6 + 0.4 * Math.abs(Math.sin(2 * Math.PI * s.f * tt))));
    }
    e[i] = v;
  }
  let mx = 0;
  for (const v of e) mx = Math.max(mx, v);
  return e.map(v => v / mx);
})();

/* CQ CQ in Morse at 24 words a minute, keyed with 5 ms edges. */
const CW = (() => {
  const code = { C: '-.-.', Q: '--.-' }, units = [];
  for (const w of ['CQ', 'CQ']) {
    [...w].forEach((ch, ci) => {
      [...code[ch]].forEach((el, ei) => {
        for (let k = 0; k < (el === '-' ? 3 : 1); k++) units.push(1);
        if (ei < code[ch].length - 1) units.push(0);
      });
      if (ci < w.length - 1) units.push(0, 0, 0);
    });
    for (let k = 0; k < 7; k++) units.push(0);
  }
  const dot = ENV_T / units.length, edge = 0.005, e = new Float64Array(ENV_N);
  for (let i = 0; i < ENV_N; i++) {
    const tt = i * ENV_T / ENV_N, k = Math.min(units.length - 1, Math.floor(tt / dot));
    if (!units[k]) continue;
    // how far into the mark, and how far from its end
    let a = k, b = k;
    while (a > 0 && units[a - 1]) a--;
    while (b < units.length - 1 && units[b + 1]) b++;
    const d = Math.min(tt - a * dot, (b + 1) * dot - tt);
    e[i] = d >= edge ? 1 : 0.5 - 0.5 * Math.cos(Math.PI * d / edge);
  }
  return e;
})();

const MODES = {
  ssb: 'SSB speech', cw: 'CW', fm: 'FM', rtty: 'RTTY'
};

/* The envelope of each mode, as amplitude against time, peak one. */
function envelopeOf(mode, procDb) {
  if (mode === 'cw') return CW;
  if (mode === 'fm' || mode === 'rtty') return new Float64Array(ENV_N).fill(1);
  // the processor: lift everything by procDb and hold the peaks where they
  // were. The loud parts stay put; the quiet ones come up to meet them.
  const g = Math.pow(10, (procDb || 0) / 20);
  return SPEECH.map(v => Math.min(1, g * v));
}

/* Average of the envelope power as a share of its peak. */
function shareOf(env) {
  let s = 0, m = 0;
  for (const v of env) { s += v * v; m = Math.max(m, v * v); }
  return m ? s / env.length / m : 0;
}

/*
 * The ALC loop, run over the speech. The detector watches the output; when
 * it goes past the set level it cuts the drive quickly, and it lets the drive
 * back slowly once the peaks fall, as a real ALC does. Run twice so the loop
 * starts the window already settled.
 *
 * mode on      the radio's own ALC holds its output at the power control
 * mode off     no ALC: whatever the audio asks for goes straight in
 * mode ext     the radio drives an external PA, whose ALC lead tells the
 *              radio to back off when the PA would pass its rating
 * mode extoff  the same, with the ALC lead left unplugged
 */
const RIG_RATED = 100, EXT_RATED = 400, EXT_DRIVE = 40;
/*
 * The peak the audio asks for, in watts: the output kept in step with the
 * audio from the rated point. The audio control is defined so that 0 dB
 * gives the rated output, so 6 dB more asks for four times it, and with the
 * external PA its rated output for its rated drive scales the same way.
 */
const askedPeak = (ext, audioDb) => RIG_RATED * (ext ? EXT_RATED / EXT_DRIVE : 1) *
  Math.pow(10, audioDb / 10);
function alcRun(mode, audioDb, setW) {
  const a = Math.pow(10, audioDb / 20), dt = ENV_T / ENV_N;
  const ext = mode === 'ext' || mode === 'extoff';
  const out = [], asked = [], rigOut = [];
  let g = 1, gMin = 1, peakU = 0, peakOut = 0, peakRig = 0, peakAsked = 0, peakExtU = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < ENV_N; i++) {
      const stage = gain => {
        const u = gain * a * SPEECH[i];
        const pr = RIG_RATED * Math.pow(envOut(u), 2);
        const ue = ext ? Math.sqrt(pr / EXT_DRIVE) : 0;
        return { u, pr, ue, p: ext ? EXT_RATED * Math.pow(envOut(ue), 2) : pr };
      };
      // what the detector compares: the radio's own output against the power
      // control, and with the lead in, the external PA against its rating
      const over = s => mode === 'off' ? 0
        : Math.max(s.pr / setW, mode === 'ext' ? s.p / EXT_RATED : 0);
      let s = stage(mode === 'off' ? 1 : g);
      if (over(s) > 1) {
        // the attack: fast enough to catch a syllable as it rises. Near its
        // peak the PA is not quite linear, so a few goes settle it
        for (let k = 0; k < 4 && over(s) > 1; k++) {
          g *= Math.pow(over(s), -0.5);
          s = stage(g);
        }
      } else if (mode !== 'off') {
        // the decay: the drive comes back slowly between syllables
        g = Math.min(1, g + (1 - g) * dt / 0.4);
      }
      const { u, pr, ue, p } = s;
      if (pass === 1) {
        out.push(p); rigOut.push(pr);
        const lin = askedPeak(ext, audioDb) * SPEECH[i] * SPEECH[i];
        asked.push(lin);
        gMin = Math.min(gMin, mode === 'off' ? 1 : g);
        peakU = Math.max(peakU, u); peakExtU = Math.max(peakExtU, ue);
        peakOut = Math.max(peakOut, p); peakRig = Math.max(peakRig, pr);
        peakAsked = Math.max(peakAsked, lin);
      }
    }
  }
  // how hard the stage that matters is driven at the peaks, in dB of drive
  const peakDrive = dB20(ext ? peakExtU : peakU);
  return { out, asked, rigOut, cut: -dB20(gMin), peakOut, peakRig, peakAsked,
           peakDrive, im3: twoTone(Math.max(-30, peakDrive)).im3, ext };
}

/* ---------------- drawing helpers ---------------- */

function canvasOf(cv) {
  const dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth, H = cv.clientHeight;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  const c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, W, H);
  return { c, W, H };
}

/* A spectrum line for each product, each its own trace so none are joined. */
function stems(list, floor, colour, width, dash) {
  return list.filter(s => s.db > floor).map(s => ({
    pts: [{ x: s.f, y: floor }, { x: s.f, y: s.db }], colour: colour, axis: 'left', width: width,
    dash: dash }));
}

function box(c, x, y, w, h, stroke, fill, lw) {
  c.beginPath(); c.rect(x, y, w, h);
  c.fillStyle = fill; c.fill();
  c.strokeStyle = stroke; c.lineWidth = lw || 1.5; c.stroke();
}
function arrow(c, x1, y1, x2, y2, colour, lw) {
  c.strokeStyle = colour; c.fillStyle = colour; c.lineWidth = lw || 1.6;
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
  const a = Math.atan2(y2 - y1, x2 - x1), s = 7;
  c.beginPath(); c.moveTo(x2, y2);
  c.lineTo(x2 - s * Math.cos(a - 0.4), y2 - s * Math.sin(a - 0.4));
  c.lineTo(x2 - s * Math.cos(a + 0.4), y2 - s * Math.sin(a + 0.4));
  c.closePath(); c.fill();
}

/*
 * The whole PA stage is too wide for the slot beside the graph, and at the
 * size of that slot its labels would be too small to read. So when it is
 * shown, it is drawn across the full width of the item instead: the panel
 * points the page's schematic at the wide canvas and hides the narrow one.
 * Every other view puts it back. (A shared option for this would be better;
 * it is noted with the page.)
 */
function wideSchematic(p, on) {
  if (!p._schemLeft) p._schemLeft = p.schem;
  const left = p._schemLeft, stage = p.sec.querySelector('.stage');
  p.schem = on ? p.graph : left;
  if (!on) p.graph.style.height = '';
  if (left && left.parentElement) left.parentElement.hidden = !!on;
  if (stage && on) stage.classList.add('wide');
}

/*
 * Circuit size. The shared drawing is scaled to fit its canvas, and a canvas
 * of the template's height draws these circuits with a resistor about 32 by
 * 13 pixels and labels below 15 pixels. So the circuit column is widened
 * (circuitColumn, below), and each circuit canvas is made tall enough for the
 * drawing to reach SCHEM_SCALE where its width allows: the resistor body,
 * 28 by 10 units, then comes out about 50 by 18 pixels and the labels about
 * 23.
 */
const SCHEM_SCALE = 1.8;
/* Size a canvas for a layout; returns the height given, in pixels. */
function fitSchem(cv, lay) {
  const cw = cv.clientWidth || 380;
  const s = Math.min(SCHEM_SCALE, (cw - 32) / lay.w);
  const h = Math.max(230, Math.round(s * lay.h + 32));
  cv.style.height = h + 'px';
  return h;
}
/* Circuit and graph side by side: the graph is given the circuit's height. */
function matchGraph(p, h) {
  const side = typeof window !== 'undefined' && window.matchMedia &&
    window.matchMedia('(min-width:820px)').matches;
  p.graph.style.height = side ? h + 'px' : '';
}
/* A view that draws a graph, not a circuit, in the left slot. */
function plainSlots(p) {
  if (p.schem) p.schem.style.height = '';
  p.graph.style.height = '';
}

/* ---------------- circuits ---------------- */

/*
 * Foundation: the transmitter, drawn as a source with the 50 ohms it is built
 * for inside it, and an aerial whose resistance can be anything.
 */
const TX_WATTS = 25;
const TX_VOC = 2 * Math.sqrt(TX_WATTS * Z_LOAD);  // open circuit volts for 25 W into 50 ohms
function matchLayout() {
  return {
    w: 205, h: 120,
    elements: [
      { name: 'V1', type: 'V', at: [30, 40], label: 'radio' },
      { name: 'RS', type: 'R', at: [90, 40], label: 'its 50 Ω' },
      { name: 'RL', type: 'R', at: [150, 70], rot: 90, label: 'aerial' }
    ],
    wires: [[0, 100, 0, 40, 'RS'], [120, 40, 150, 40, 'RS']],
    grounds: [[0, 100], [150, 100]]
  };
}
const matchNetlist = r => 'V1 in 0 ' + Fm.sci(TX_VOC) + '\nRS in a 50\nRL a 0 ' + Fm.sci(r);

/*
 * Full: the pi network, fed by the transistor drawn as a source with the
 * resistance it needs to see inside it, as the netlist has it (RS), the way
 * the Foundation drawing shows the radio and its 50 ohms.
 */
function piLayout(rpa) {
  return {
    w: 282, h: 120,
    elements: [
      { name: 'V1', type: 'V', at: [30, 35], label: 'transistor' },
      { name: 'RS', type: 'R', at: [100, 35], label: 'its ' + Fm.eng(rpa, 'Ω', 3) },
      { name: 'C1', type: 'C', at: [130, 65], rot: 90, label: 'C1' },
      { name: 'L1', type: 'L', at: [160, 35], label: 'L' },
      { name: 'C2', type: 'C', at: [190, 65], rot: 90, label: 'C2' },
      { name: 'RL', type: 'R', at: [235, 65], rot: 90, label: 'load' }
    ],
    wires: [[0, 95, 0, 35, 'RS'], [60, 35, 70, 35, 'RS'], [190, 35, 235, 35, 'RL']],
    grounds: [[0, 95], [130, 95], [190, 95], [235, 95]]
  };
}

/*
 * Full: the whole stage. Input transformer, bias resistor and diode, the
 * transistor, the RF choke that is its collector load, the DC block, the pi
 * network and the load. With no drive only direct current flows, and that is
 * what the dots show: the bias current down through the resistor, most of it
 * through the diode and a little into the base by way of the transformer's
 * winding, and the transistor's standing current down through the choke.
 */
const ST_VCC = 13.8, ST_VD = 0.65, ST_RB = 220, ST_IC = 0.2, ST_BETA = 50;
const ST = (() => {
  const irb = (ST_VCC - ST_VD) / ST_RB, ib = ST_IC / ST_BETA;
  return { IRB: irb, IB: ib, ID: irb - ib, IC: ST_IC, IS: ST_IC + irb };
})();
function stageLayout(narrow) {
  const lay = {
    w: 550, h: 170,
    elements: [
      { name: 'T1', type: 'T', at: [110, 90], label: 'input', humps: [6, 3],
        flow: ['-', 'IB'] },
      { name: 'D1', type: 'D', at: [170, 60], rot: 90, label: 'bias diode', flow: 'ID' },
      { name: 'RB', type: 'R', at: [200, 30], rot: 180, label: 'bias R', flow: 'IRB' },
      { name: 'Q1', type: 'Q', at: [280, 120], label: ' ' },
      { name: 'LC', type: 'L', at: [292, 30], rot: 90, label: 'RF choke', flow: 'IC' },
      { name: 'CB', type: 'C', at: [360, 88], label: 'DC block', flow: '-' },
      { name: 'C1', type: 'C', at: [390, 118], rot: 90, label: 'C1', labelAt: 'left', flow: '-' },
      { name: 'L1', type: 'L', at: [420, 88], label: 'L', flow: '-' },
      { name: 'C2', type: 'C', at: [450, 118], rot: 90, label: 'C2', labelAt: 'left', flow: '-' },
      { name: 'RL', type: 'R', at: [490, 118], rot: 90, label: 'load', flow: '-' }
    ],
    wires: [
      [40, 60, 90, 60, '-'],
      [130, 30, 130, 60, 'IB'], [170, 30, 130, 30, 'IB'],
      [230, 0, 230, 30, 'IRB'],
      [330, 0, 292, 0, 'IS'], [292, 0, 230, 0, 'IRB'],
      [292, 60, 292, 88, 'IC'],
      [130, 120, 250, 120, 'IB'],
      [292, 88, 330, 88, '-'], [450, 88, 490, 88, '-']
    ],
    grounds: [[90, 120], [170, 90], [292, 152], [390, 148], [450, 148], [490, 148]],
    terminals: [{ at: [40, 60], label: 'in', align: 'right' },
                { at: [330, 0], label: '+13.8 V' }]
  };
  if (!narrow) return lay;
  /*
   * On a phone the row is too long to read, so the output network folds
   * underneath: down from the collector, through the DC block, and back
   * leftwards through the pi network to the load.
   */
  const keep = ['T1', 'D1', 'RB', 'Q1', 'LC'];
  lay.w = 350; lay.h = 295;
  lay.elements = lay.elements.filter(e => keep.includes(e.name)).concat([
    { name: 'CB', type: 'C', at: [310, 220], rot: 180, label: 'DC block', flow: '-' },
    { name: 'C1', type: 'C', at: [280, 250], rot: 90, label: 'C1', flow: '-' },
    { name: 'L1', type: 'L', at: [250, 220], rot: 180, label: 'L', flow: '-' },
    { name: 'C2', type: 'C', at: [220, 250], rot: 90, label: 'C2', flow: '-' },
    { name: 'RL', type: 'R', at: [180, 250], rot: 90, label: 'load', labelAt: 'left', flow: '-' }
  ]);
  lay.wires = lay.wires.filter(w => !(w[0] === 292 && w[1] === 88) && w[0] !== 450 && w[0] !== 330)
    .concat([[300, 0, 292, 0, 'IS'], [292, 88, 340, 88, '-'], [340, 88, 340, 220, '-'],
             [220, 220, 180, 220, '-']]);
  lay.terminals = [lay.terminals[0], { at: [300, 0], label: '+13.8 V' }];
  lay.grounds = [[90, 120], [170, 90], [292, 152], [280, 280], [220, 280], [180, 280]];
  return lay;
}

/*
 * Intermediate: where the DC input comes from. A supply, an ammeter in its
 * lead, and the transistor drawing current through its choke. The RF leaves
 * through the capacitor, which passes no direct current, so the dots, which
 * show the direct current, stop at the transistor.
 */
function dcLayout() {
  return {
    w: 212, h: 168,
    elements: [
      { name: 'B1', type: 'B', at: [15, 55], rot: 90, label: 'supply' },
      { name: 'RM', type: 'M', at: [55, 25], meter: 'A', label: ' ', flow: 'IC' },
      { name: 'LC', type: 'L', at: [115, 55], rot: 90, label: 'choke', flow: 'IC' },
      { name: 'Q1', type: 'Q', at: [103, 117], label: ' ' },
      { name: 'CO', type: 'C', at: [175, 85], label: ' ', flow: '-' },
      { name: 'RL', type: 'R', at: [205, 115], rot: 90, label: 'aerial', labelAt: 'left', flow: '-' }
    ],
    wires: [[15, 25, 25, 25, 'IC'], [85, 25, 115, 25, 'IC'], [115, 85, 145, 85, '-'],
            [45, 117, 73, 117, 'IB']],
    grounds: [[15, 85], [115, 149], [205, 145]],
    terminals: [{ at: [45, 117], label: 'drive', align: 'right' }]
  };
}

const PA_GAIN = 20;                   // the Foundation chain's PA, a power gain

const BENCH = {
  group: '3F',
  title: 'RF power amplifiers',
  pageTitle: 'Power Amplifier Bench',
  levels: ['foundation', 'intermediate', 'full'],
  sessions: {
    foundation: ['Foundation session 5 (Transmitters and receivers)'],
    intermediate: ['Intermediate session 8 (Transmitters)'],
    full: ['Full session 13 (Power amplifiers)']
  },
  circuitBased: true,
  // The spectrum is taken at Full only, so only Full says so.
  standfirst: {
    foundation: 'Move a control and the page recalculates. Circuits are solved live, from the parts drawn.',
    intermediate: 'Move a control and the page recalculates. Circuits are solved live, from the parts drawn.',
    full: 'Move a control and the page recalculates. Circuits are solved live, and the amplifier’s output is found by passing the signal through its curve and taking its spectrum.'
  },
  // The intermodulation clause is about Full only.
  colophonNote: level => 'Circuits are solved by a general complex nodal analysis engine' +
    (level === 'full' ? '; the intermodulation products are the Fourier transform of two tones put through a model amplifier curve, whose figures are illustrative.' : '.') +
    ' Circuit symbols follow the RSGB specification.',
  circuitColumn: 420,

  /** Every circuit this page draws, with what flows in it, for the checkers. */
  allLayouts: () => {
    const pi = piDesign(14.1e6, 12.5, Z_LOAD, PI_Q);
    return [
      { name: 'transmitter and aerial', layout: matchLayout(), netlist: matchNetlist(150),
        flow: { mode: 'ac' } },
      { name: 'pi network', layout: piLayout(12.5), netlist: piNetlist(pi), flow: { mode: 'ac' } },
      { name: 'whole PA stage, standing current', layout: stageLayout(false),
        flow: { mode: 'dc', currents: Object.assign({}, ST) } },
      { name: 'whole PA stage, folded for a phone', layout: stageLayout(true),
        flow: { mode: 'dc', currents: Object.assign({}, ST) } },
      { name: 'supply into the PA', layout: dcLayout(),
        flow: { mode: 'dc', currents: { IC: 12, IB: 0.3 } } }
    ];
  },

  bank: {
    url: 'https://rsgb.services/public/exams/eqdb/',
    topic: '3F - RF power amplifiers',
    note: 'Full level only. Choose the topic from the Filter by Topic list.'
  },

  intro: {
    foundation: [
      'Every stage of a transmitter before the last one works at low power. The power amplifier, the PA, is the stage that lifts the finished signal to the level that goes to the aerial.',
      'It also expects to be connected to the right aerial. This page shows both: what the PA does, and what happens when the aerial does not suit it.'
    ],
    intermediate: [
      'A power amplifier does not make power from nothing. It takes direct current from the supply and turns some of it into radio frequency power. The rest becomes heat.',
      'How much of the supply comes out as RF is the efficiency, and the exam asks you to work with it. Move the controls and watch the three amounts stay in balance.'
    ],
    full: [
      'A power amplifier is meant to give out a larger copy of what goes in, and nothing else. Driven too hard it stops being a faithful copy, and some of the new frequencies it makes land beside the signal, where no filter can remove them.',
      'The page follows the signal through the stage: what distortion makes, what the output network removes and what it cannot, how the mode decides how hard the PA works, and what the automatic level control is there to prevent.'
    ]
  },

  /*
   * Read before this bench was designed. Our own summary of what each source
   * insists on; no wording from any of them appears here or in the bench.
   */
  sources: {
    read: [
      'Foundation, Intermediate and Full course sessions on transmitters and power amplifiers (course.g0lft.org)',
      'Exam Secrets, transmitters and power amplifiers at Full',
      'EX309 Full reference booklet (Feb 2026): formula sheet, and the licence definition of peak envelope power',
      'Ofcom licence OFW611, Table A (Foundation power limits) and the definition of PEP',
      'Syllabus 2024 v1.6b, items 3F1 to 3F5'
    ],
    keyMessages: [
      { at: '3F1', level: 'foundation',
        point: 'the PA is the last stage, raising the modulated signal to the power sent to the aerial' },
      { at: '3F1', level: 'foundation',
        point: 'use the least power that does the job, within the licence limit' },
      { at: '3F1', level: 'intermediate',
        point: 'efficiency is RF out as a share of DC in, and the remainder is heat' },
      { at: '3F1', level: 'intermediate',
        point: 'RF out = DC in times efficiency, with DC in = volts times amps' },
      { at: '3F2', level: 'full',
        point: 'a linear amplifier gives a scaled copy: output against input is a straight line' },
      { at: '3F2', level: 'full',
        point: 'SSB, AM and data with varying amplitude need a linear amplifier; CW, FM and FSK can use class C' },
      { at: '3F2', level: 'full',
        point: 'distorting one tone makes harmonics; two tones make harmonics and intermodulation products' },
      { at: '3F2', level: 'full',
        point: 'third order products at 2f1 - f2 and 2f2 - f1 sit beside the signal, inside any filter passband' },
      { at: '3F2', level: 'full',
        point: 'the cure for intermodulation is less drive; the output filter removes only the harmonics' },
      { at: '3F3', level: 'foundation',
        point: 'the PA needs a correctly matched load, normally 50 ohms' },
      { at: '3F3', level: 'foundation',
        point: 'the wrong aerial, or none, sends power back and can damage the transmitter' },
      { at: '3F3', level: 'full',
        point: 'input circuit, bias, collector load, output filter and matching each have a job' },
      { at: '3F3', level: 'full',
        point: 'a load far from 50 ohms upsets the match the transistor relies on, and can damage it' },
      { at: '3F3', level: 'full',
        point: 'the pi network matches the transistor to 50 ohms and is a low-pass filter' },
      { at: '3F4', level: 'full',
        point: 'most licence power limits are PEP; the heat in the PA follows the average power' },
      { at: '3F4', level: 'full',
        point: 'FM and RTTY run at full power all the time; speech on SSB is peaky' },
      { at: '3F4', level: 'full',
        point: 'speech processing raises the average power with the peaks unchanged, so the PA runs hotter' },
      { at: '3F5', level: 'full',
        point: 'ALC feeds back from the output to cut the drive, so the PA is not overdriven' },
      { at: '3F5', level: 'full',
        point: 'an external PA sends its ALC voltage back to the transceiver; the power control sets the level' }
    ]
  },

  controls: [
    { id: 'drv', label: 'Drive', unit: 'W', range: [0.05, 1.25], start: 0.5,
      desc: 'The power the stages before the PA hand it, set by the radio’s power control' },
    { id: 'vdc', label: 'Supply', unit: 'V', range: [10, 50], start: 13.8,
      desc: 'The DC supply voltage to the PA' },
    { id: 'idc', label: 'Current', unit: 'A', range: [1, 25], start: 12,
      desc: 'The current the PA draws from the supply, read on the ammeter' },
    { id: 'eff', label: 'Efficiency', unit: '%', range: [10, 90], start: 60, integer: true, linear: true,
      desc: 'The share of the DC input that comes out as RF' },
    { id: 'drive', label: 'Drive, dB', unit: '', range: [-20, 10], start: -3, integer: true, linear: true,
      desc: 'How hard the PA is driven. 0 dB puts the peaks at its rated output' },
    { id: 'a1', label: 'Tone 1', unit: 'Hz', range: [300, 1400], start: 1000, integer: true, linear: true,
      desc: 'The lower audio tone; it goes out that far above the 14.100 MHz dial' },
    { id: 'a2', label: 'Tone 2', unit: 'Hz', range: [1600, 3000], start: 2000, integer: true, linear: true,
      desc: 'The upper audio tone' },
    { id: 'rant', label: 'Aerial', unit: 'Ω', range: [5, 500], start: 50,
      desc: 'The resistance the aerial presents. The transmitter is built for 50 Ω' },
    { id: 'rpa', label: 'Transistor load', unit: 'Ω', range: [6, 45], start: 12.5,
      desc: 'The resistance the transistor needs to see to give its power' },
    { id: 'fpi', label: 'Band', unit: 'Hz', range: [1.8e6, 30e6], start: 14.1e6,
      desc: 'The frequency the output network is built for' },
    { id: 'pep', label: 'PEP', unit: 'W', range: [10, 400], start: 100, integer: true, linear: true,
      desc: 'The peak envelope power every mode is set to reach' },
    { id: 'proc', label: 'Processing, dB', unit: '', range: [0, 15], start: 0, integer: true, linear: true,
      desc: 'How far the speech processor lifts the quiet parts. SSB only' },
    { id: 'audio', label: 'Audio, dB', unit: '', range: [-12, 12], start: 6, integer: true, linear: true,
      desc: 'Microphone gain. 0 dB is the level that reaches the rated output' },
    { id: 'setp', label: 'Power control', unit: 'W', range: [5, 100], start: 100, integer: true, linear: true,
      desc: 'The RF power control: the peak level the ALC holds' }
  ],

  derive: (v) => {
    const d = {};
    // The sliders show three significant figures, so the figures worked with
    // are rounded to the same three: the working then quotes what the slider
    // says, rather than 14.95 V beside a slider reading 14.9 V.
    const s3 = x => Number(x.toPrecision(3));
    // 3F1
    d.drv = s3(v.drv); d.pout = PA_GAIN * d.drv;
    d.vdc = s3(v.vdc); d.idc = s3(v.idc); d.eff = v.eff;
    d.pdc = d.vdc * d.idc; d.prf = d.pdc * v.eff / 100; d.heat = d.pdc - d.prf;
    // 3F2
    d.drive = v.drive; d.a1 = v.a1; d.a2 = v.a2;
    d.f1 = DIAL + v.a1; d.f2 = DIAL + v.a2; d.df = d.f2 - d.f1;
    d.im3lo = 2 * d.f1 - d.f2; d.im3hi = 2 * d.f2 - d.f1;
    d.im5lo = 3 * d.f1 - 2 * d.f2; d.im5hi = 3 * d.f2 - 2 * d.f1;
    const now = twoTone(v.drive), less = twoTone(v.drive - 1);
    d.toneDb = now.tone; d.im3 = now.im3; d.im5 = now.im5;
    d.riseTone = now.tone - less.tone;
    d.riseIm3 = (now.im3 + now.tone) - (less.im3 + less.tone);
    const one = oneTone(v.drive);
    d.h2 = one.rel(2); d.h3 = one.rel(3);
    d.h2f = d.h2 + filterDb(2 * d.f1) - filterDb(d.f1);
    d.h3f = d.h3 + filterDb(3 * d.f1) - filterDb(d.f1);
    d.im3loss = filterDb(d.im3hi) - filterDb(d.f1);
    // 3F3
    d.rant = s3(v.rant);
    d.pAerial = TX_VOC * TX_VOC * d.rant / Math.pow(Z_LOAD + d.rant, 2);
    d.pBack = TX_WATTS - d.pAerial;
    d.gamma = (d.rant - Z_LOAD) / (d.rant + Z_LOAD);
    d.rpa = s3(v.rpa); d.fpi = s3(v.fpi);
    d.pi = piDesign(d.fpi, d.rpa, Z_LOAD, PI_Q);
    const ck = MX.parseNetlist(piNetlist(d.pi));
    d.piLoss = [1, 2, 3].map(k => piResponse(ck, d.pi, k * d.fpi).db);
    // 3F4
    d.pep = v.pep; d.proc = v.proc;
    d.share = {};
    for (const m of Object.keys(MODES)) d.share[m] = shareOf(envelopeOf(m, m === 'ssb' ? v.proc : 0));
    d.shareRaw = shareOf(envelopeOf('ssb', 0));
    // 3F5
    d.audio = v.audio; d.setp = v.setp;
    // nothing here resonates; the charge animation takes its frequency from
    // each panel instead
    d.f0 = 0;
    return d;
  },

  /*
   * The equations. `given` records whether the Full reference booklet
   * (EX309, Feb 2026) prints the formula; `tag` overrides the mark at a
   * level: Intermediate's booklet (EX308) prints P = V x I and not the
   * efficiency, and Foundation has no formula sheet at all.
   */
  equations: {
    pdc: { given: true, tag: { intermediate: 'given' }, name: 'DC input power',
           eq: 'P = V &times; I',
           work: d => ['<b>' + Fm.eng(d.vdc, 'V', 4) + '</b> &times; <b>' + Fm.eng(d.idc, 'A', 4) + '</b>',
                       Fm.eng(d.pdc, 'W', 4)] },
    effy: { given: false, tag: { intermediate: 'learn' }, name: 'Efficiency',
            eq: 'efficiency = RF out / DC in &times; 100%',
            work: d => ['<b>' + Fm.eng(d.prf, 'W', 4) + '</b> / <b>' + Fm.eng(d.pdc, 'W', 4) + '</b> &times; 100%',
                        Fm.trim(d.eff, 3) + NBSP + '%'] },
    rfout: { given: false, tag: { intermediate: 'learn' }, name: 'RF output from the DC input',
             eq: 'RF out = DC in &times; efficiency',
             work: d => ['<b>' + Fm.eng(d.pdc, 'W', 4) + '</b> &times; <b>' + (d.eff / 100).toFixed(2) + '</b>',
                         Fm.eng(d.prf, 'W', 4)] },
    heat: { given: false, tag: { intermediate: 'learn' }, name: 'Heat in the PA',
            eq: 'heat = DC in &minus; RF out',
            work: d => ['<b>' + Fm.eng(d.pdc, 'W', 4) + '</b> &minus; <b>' + Fm.eng(d.prf, 'W', 4) + '</b>',
                        Fm.eng(d.heat, 'W', 4)] },
    im3: { given: false, name: 'Third order products',
           eq: '2f<sub>1</sub> &minus; f<sub>2</sub> and 2f<sub>2</sub> &minus; f<sub>1</sub>',
           work: d => ['2 &times; <b>' + mhz(d.f1) + '</b> &minus; <b>' + mhz(d.f2) + '</b>, and 2 &times; <b>' +
                       mhz(d.f2) + '</b> &minus; <b>' + mhz(d.f1) + '</b>',
                       mhz(d.im3lo) + ' and ' + mhz(d.im3hi)] },
    harm: { given: false, name: 'Harmonics of one tone', eq: 'n &times; f',
            work: d => ['2 &times; <b>' + mhz(d.f1) + '</b>, 3 &times; <b>' + mhz(d.f1) + '</b>',
                        mhz(2 * d.f1) + ' and ' + mhz(3 * d.f1)] },
    order: { given: false, tag: { full: 'interest' }, name: 'Any product, and its order',
             eq: 'm f<sub>1</sub> + n f<sub>2</sub>, of order |m| + |n|',
             work: d => ['3 &times; <b>' + mhz(d.f1) + '</b> &minus; 2 &times; <b>' + mhz(d.f2) + '</b>, order 3 + 2',
                         mhz(d.im5lo) + ', fifth order'] },
    slope: { given: false, tag: { full: 'interest' }, name: 'How fast the third order grows',
             eq: 'until the peaks are clipped, 3 dB more for each 1 dB more drive',
             work: d => ['over the last 1 dB of drive: products up <b>' + d.riseIm3.toFixed(2) +
                         NBSP + 'dB</b>, tones up <b>' + d.riseTone.toFixed(2) + NBSP + 'dB</b>',
                         d.riseIm3.toFixed(2) + NBSP + 'dB per dB of drive'] },
    xc1: { given: true, name: 'Reactance of C1 at the design frequency', eq: 'X<sub>C</sub> = 1 / 2&pi;fC',
           work: d => ['1 / (2&pi; &times; <b>' + Fm.eng(d.fpi, 'Hz', 4) + '</b> &times; <b>' + Fm.eng(d.pi.C1, 'F', 4) + '</b>)',
                       Fm.eng(d.pi.x1, 'Ω', 4)] },
    xl: { given: true, name: 'Reactance of L', eq: 'X<sub>L</sub> = 2&pi;fL',
          work: d => ['2&pi; &times; <b>' + Fm.eng(d.fpi, 'Hz', 4) + '</b> &times; <b>' + Fm.eng(d.pi.L, 'H', 4) + '</b>',
                      Fm.eng(d.pi.xl, 'Ω', 4)] },
    xc2: { given: true, name: 'Reactance of C2', eq: 'X<sub>C</sub> = 1 / 2&pi;fC',
           work: d => ['1 / (2&pi; &times; <b>' + Fm.eng(d.fpi, 'Hz', 4) + '</b> &times; <b>' + Fm.eng(d.pi.C2, 'F', 4) + '</b>)',
                       Fm.eng(d.pi.x2, 'Ω', 4)] },
    loss: { given: true, name: 'What the network does to the 2nd harmonic',
            eq: 'Gain (loss) = 10 log<sub>10</sub>(P<sub>out</sub> / P<sub>in</sub>) dB',
            work: d => ['10 log<sub>10</sub>(<b>' + Math.pow(10, d.piLoss[1] / 10).toPrecision(3) + '</b>), the share of the power reaching the load at <b>' +
                        Fm.eng(2 * d.fpi, 'Hz', 4) + '</b>',
                        neg(d.piLoss[1])] },
    /*
     * The booklet prints the power ratio once, as Gain (loss) = 10 log10 of
     * P out over P in. These three are that formula with two powers put in,
     * so each is shown in the printed form, and its working says which power
     * is which.
     */
    par: { given: true, name: 'Peak to average ratio',
           eq: 'Gain (loss) = 10 log<sub>10</sub>(P<sub>out</sub> / P<sub>in</sub>) dB',
           work: d => {
             const s = d.share[d.device] || d.share.ssb;
             return ['10 log<sub>10</sub>(<b>' + Fm.eng(d.pep, 'W', 3) + '</b> PEP / <b>' +
                     Fm.eng(d.pep * s, 'W', 3) + '</b> average)',
                     (10 * Math.log10(1 / s)).toFixed(1) + NBSP + 'dB'];
           } },
    lift: { given: true, name: 'What the processor adds to the average',
            eq: 'Gain (loss) = 10 log<sub>10</sub>(P<sub>out</sub> / P<sub>in</sub>) dB',
            work: d => ['10 log<sub>10</sub>(<b>' + Fm.eng(d.pep * d.share.ssb, 'W', 3) + '</b> processed / <b>' +
                        Fm.eng(d.pep * d.shareRaw, 'W', 3) + '</b> plain)',
                        '+' + (10 * Math.log10(d.share.ssb / d.shareRaw)).toFixed(1) + NBSP + 'dB'] },
    alc: { given: true, name: 'How far the ALC cuts the drive, if the PA were perfectly linear',
           eq: 'Gain (loss) = 10 log<sub>10</sub>(P<sub>out</sub> / P<sub>in</sub>) dB',
           work: d => {
             // with the lead in, the external PA's ALC acts: no more than its
             // rating, or what the radio's power control lets through. With
             // no lead, only the radio's own ALC acts, at its power control
             // with the ALC disconnected nothing acts, and the only limit is the
             // PA's own rating, which it enforces by flattening the peaks
             const lead = d.device === 'ext', none = d.device === 'off';
             const asked = askedPeak(lead, d.audio);
             const through = EXT_RATED * Math.pow(envOut(Math.sqrt(d.setp / EXT_DRIVE)), 2);
             const allowed = none ? RIG_RATED : lead ? Math.min(EXT_RATED, through) : d.setp;
             const g = 10 * Math.log10(allowed / asked);
             return ['10 log<sub>10</sub>(<b>' + Fm.eng(allowed, 'W', 3) + '</b> ' +
                     (none ? 'rated' : 'allowed') + ' / <b>' + Fm.eng(asked, 'W', 3) + '</b> asked for)',
                     g < -0.05
                       ? '&minus;' + (-g).toFixed(1) + NBSP + 'dB' + (none
                         ? ' too much; with the ALC disconnected nothing takes it off, so the PA flattens the peaks'
                         : ', so the drive comes down ' + (-g).toFixed(1) + NBSP + 'dB')
                       : (none ? 'nothing too much: the audio asks for no more than the PA’s rating'
                               : 'nothing to cut: the audio asks for no more than is allowed')];
           } }
  },

  /* Words this bench introduces, defined where they are first used. */
  terms: {
    'power amplifier': 'The last stage of a transmitter, which raises the finished signal to the power sent to the aerial. Usually shortened to PA.',
    'drive': 'The signal fed into an amplifier, and how much of it there is.',
    'efficiency': 'The share of the DC power taken from the supply that comes out as RF power. The rest is turned into heat.',
    'linear': 'Giving out a larger copy of the input and nothing else. Plotted, output against input is a straight line.',
    'harmonic': 'A whole number multiple of a frequency: 28.2 MHz is the second harmonic of 14.1 MHz.',
    'intermodulation': 'New frequencies made when two or more signals pass through something that is not linear, at sums and differences of whole multiples of them.',
    'two tone test': 'Feeding an SSB transmitter two steady audio tones, so it sends two RF signals, and looking at what else comes out.',
    'compression': 'The amplifier running short of output, so the gain falls as the drive rises.',
    'splatter': 'Unwanted signal either side of a transmission, heard by stations on neighbouring frequencies.',
    'matched': 'Presenting the load the transmitter is built for, normally 50 Ω, so that all its power is taken.',
    'reflected power': 'Power the aerial does not accept, which travels back down the feeder to the transmitter.',
    'pi network': 'A capacitor to ground, a coil in series and a second capacitor to ground, shaped like the letter π. It matches one resistance to another and is a low-pass filter.',
    'RF choke': 'A coil that passes direct current and blocks radio frequency current.',
    'bias': 'A small standing voltage on the base that sets how the transistor conducts with no signal.',
    'PEP': 'Peak envelope power: the average power over one RF cycle at the highest point of the modulation. Most licence power limits are given as PEP.',
    'average power': 'The power averaged over the whole transmission, gaps and quiet parts included. The heat in the PA follows it.',
    'speech processor': 'A circuit that lifts the quieter parts of speech while holding the peaks where they were.',
    'ALC': 'Automatic level control: a loop that measures the PA’s output and cuts the drive when it would pass the set level.',
    'RF power control': 'The front panel control that sets the level the ALC holds, and so the power sent.'
  },

  /* ---- panels ---- */
  panels: {

    /*
     * Foundation: the transmitter as a chain of blocks, with the power at
     * each point. The PA is the one that makes the big step.
     */
    chain(ctx) {
      const { p, d, t, ro } = ctx;
      // too narrow for five blocks in a row: stand them in a column instead,
      // on a taller canvas
      const narrow = p.graph.parentElement.clientWidth < 640;
      p.graph.style.height = narrow ? '430px' : '';
      const { c, W, H } = canvasOf(p.graph);
      const blocks = [
        { label: 'Modulator', sub: 'makes the signal' },
        { label: 'Driver', sub: 'a little power' },
        { label: 'PA', sub: 'lifts the power', hot: true },
        { label: 'Filter', sub: 'cleans it up' },
        { label: 'Aerial', sub: 'sends it' }
      ];
      // the power on each link: milliwatts, then the drive, then the output
      const links = [[0.005, 'milliwatts'], [d.drv, Fm.eng(d.drv, 'W', 3)],
                     [d.pout, Fm.eng(d.pout, 'W', 3)], [d.pout, Fm.eng(d.pout, 'W', 3)]];
      if (narrow) {
        const bw = Math.min(150, W * 0.4), bh = 40, gap = 42, x = 10;
        const top = Math.round((H - (5 * bh + 4 * gap)) / 2);
        blocks.forEach((bk, i) => {
          const y = top + i * (bh + gap);
          box(c, x, y, bw, bh, bk.hot ? t.ink : t.wire, t.surface, bk.hot ? 2.4 : 1.5);
          c.fillStyle = t.ink; c.font = '600 16px ' + t.font;
          c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText(bk.label, x + bw / 2, y + bh / 2);
          c.fillStyle = t.soft; c.font = '15px ' + t.font; c.textAlign = 'left';
          c.fillText(bk.sub, x + bw + 14, y + bh / 2);
          if (i < links.length) {
            const [pw, txt] = links[i];
            const lw = Math.max(1.5, Math.min(9, 1.5 + 2.2 * Math.log10(pw / 0.005)));
            const ax = x + bw / 2, y1 = y + bh + 3, y2 = y + bh + gap - 3, head = 6 + lw;
            c.strokeStyle = t.p; c.fillStyle = t.p; c.lineWidth = lw;
            c.beginPath(); c.moveTo(ax, y1); c.lineTo(ax, y2 - head + 1); c.stroke();
            c.beginPath(); c.moveTo(ax, y2);
            c.lineTo(ax - head * 0.65, y2 - head); c.lineTo(ax + head * 0.65, y2 - head);
            c.closePath(); c.fill();
            c.font = (i ? '600 15px ' + t.mono : '15px ' + t.font);
            c.fillStyle = t.p;
            c.fillText(txt, ax + 16, (y1 + y2) / 2);
          }
        });
      }
      const pad = 6, gap = Math.max(34, Math.min(90, W * 0.08));
      const bw = (W - 2 * pad - gap * (blocks.length - 1)) / blocks.length;
      const bh = 48, by = Math.round(H / 2 - bh / 2 - 6);
      if (!narrow) blocks.forEach((b, i) => {
        const x = pad + i * (bw + gap), mid = x + bw / 2;
        box(c, x, by, bw, bh, b.hot ? t.ink : t.wire, t.surface, b.hot ? 2.4 : 1.5);
        c.fillStyle = t.ink;
        c.font = '600 16px ' + t.font;
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(b.label, mid, by + bh / 2);
        c.fillStyle = t.soft;
        c.font = '15px ' + t.font;
        c.textBaseline = 'top';
        c.fillText(b.sub, mid, by + bh + 10);
        if (i < links.length) {
          // the arrow thickens with the power it carries, on a log scale
          const [pw, txt] = links[i];
          const lw = Math.max(1.5, Math.min(9, 1.5 + 2.2 * Math.log10(pw / 0.005)));
          const x1 = x + bw + 3, x2 = x + bw + gap - 3, y = by + bh / 2;
          c.strokeStyle = t.p; c.fillStyle = t.p; c.lineWidth = lw;
          const head = 6 + lw;
          c.beginPath(); c.moveTo(x1, y); c.lineTo(x2 - head + 1, y); c.stroke();
          c.beginPath(); c.moveTo(x2, y);
          c.lineTo(x2 - head, y - head * 0.65); c.lineTo(x2 - head, y + head * 0.65);
          c.closePath(); c.fill();
          c.font = (i ? '600 15px ' + t.mono : '15px ' + t.font);
          c.fillStyle = t.p;
          c.textBaseline = 'bottom';
          c.fillText(txt, (x1 + x2) / 2, by - 12);
        }
      });
      p.legend.innerHTML = ctx.swatch(t.p, 'Power, the thicker the more');
      p.readouts.innerHTML = ro([
        ['Drive into the PA', Fm.eng(d.drv, 'W', 3)],
        ['The PA multiplies it by', String(PA_GAIN)],
        ['Out to the aerial', Fm.eng(d.pout, 'W', 3), true],
        ['Foundation limit', '25' + NBSP + 'W on most bands']
      ]);
      return {};
    },

    /*
     * Intermediate: the DC supply into the PA on the left, with its direct
     * current moving; the three powers on the right, as bars that balance.
     */
    efficiency(ctx) {
      const { p, d, t, ro } = ctx;
      matchGraph(p, fitSchem(p.schem, dcLayout()));
      const { c, W, H } = canvasOf(p.graph);
      const rows = [
        { label: 'DC in', v: d.pdc, x0: 0 },
        { label: 'RF out', v: d.prf, x0: 0 },
        { label: 'Heat', v: d.heat, x0: d.prf }
      ];
      const rh = 40, gapY = 24, lx = 92, rx = W - 96;
      const top = Math.max(26, Math.round((H - 3 * rh - 2 * gapY) / 2));
      const scale = (rx - lx) / Math.max(1e-9, d.pdc);
      rows.forEach((r, i) => {
        const y = top + i * (rh + gapY);
        c.fillStyle = t.ink; c.font = '600 16px ' + t.font;
        c.textAlign = 'right'; c.textBaseline = 'middle';
        c.fillText(r.label, lx - 12, y + rh / 2);
        // RF and heat sit end to end under DC in, so the balance is visible.
        // The heat is power too, so the same red, hatched rather than solid
        const bx = lx + r.x0 * scale, bwid = r.v * scale;
        if (i === 2) {
          c.save();
          c.beginPath(); c.rect(bx, y, bwid, rh); c.clip();
          c.strokeStyle = t.p; c.lineWidth = 2;
          for (let k = -rh; k < bwid + rh; k += 8) {
            c.beginPath(); c.moveTo(bx + k, y + rh); c.lineTo(bx + k + rh, y); c.stroke();
          }
          c.restore();
          c.strokeStyle = t.p; c.lineWidth = 2;
          c.strokeRect(bx + 1, y + 1, Math.max(0, bwid - 2), rh - 2);
        } else {
          c.fillStyle = t.p;
          c.fillRect(bx, y, bwid, rh);
        }
        c.fillStyle = t.ink; c.font = '600 15px ' + t.mono; c.textAlign = 'left';
        c.fillText(Fm.eng(r.v, 'W', 4), Math.min(rx + 8, lx + (r.x0 + r.v) * scale + 8), y + rh / 2);
      });
      // a guide down from the end of the DC bar, to show the sum lands on it
      c.strokeStyle = t.mark; c.setLineDash([3, 3]); c.lineWidth = 1;
      c.beginPath(); c.moveTo(rx, top); c.lineTo(rx, top + 3 * rh + 2 * gapY); c.stroke();
      c.setLineDash([]);
      p.legend.innerHTML = ctx.swatch(t.p, 'Power: DC in, RF out, and the heat hatched; the RF and the heat make the DC in');
      p.readouts.innerHTML = ro([
        ['DC in', Fm.eng(d.pdc, 'W', 4)],
        ['Efficiency', Fm.trim(d.eff, 3) + NBSP + '%'],
        ['RF out', Fm.eng(d.prf, 'W', 4), true],
        ['Heat', Fm.eng(d.heat, 'W', 4)]
      ]);
      p.lab = { B1: Fm.eng(d.vdc, 'V', 3), RM: '' };
      return { layout: dcLayout(),
               flow: { mode: 'dc', currents: { IC: d.idc, IB: d.idc / 40 }, compress: true,
                       note: 'direct current from the supply, ' + Fm.eng(d.idc, 'A', 3) +
                             ' on the meter; the RF leaves through the capacitor' } };
    },

    /*
     * Full 3F2: two tones (or one) through the amplifier curve, and the
     * spectrum of what comes out, before and after the output filter.
     */
    imd(ctx) {
      const { p, d, t, Plot, swatch, ro } = ctx;
      plainSlots(p);
      const view = p.topology;
      const floor = -100;
      const tt = twoTone(d.drive);

      /* left: the curve, or how the products grow with drive */
      if (view === 'one') {
        const pk = U1 * Math.pow(10, d.drive / 20);
        const xs = 1.6, curve = [], ideal = [];
        for (let i = 0; i <= 200; i++) {
          const x = -xs + 2 * xs * i / 200;
          curve.push({ x: x, y: paCurve(x) });
          if (Math.abs(x) <= 0.8) ideal.push({ x: x, y: x });
        }
        Plot.draw(p.schem, {
          xRange: [-xs, xs], xFmt: x => Fm.trim(x, 2), tokens: t,
          left: { min: -0.8, max: 0.8, fmt: y => Fm.trim(y, 2) },
          traces: [{ pts: ideal, colour: t.v, axis: 'left', width: 1.6, dash: DASH },
                   { pts: curve, colour: t.v, axis: 'left', width: 2.4 }],
          bands: [{ from: -pk, to: pk, colour: t.mark }],
          marks: [{ x: -pk, colour: t.mark }, { x: pk, colour: t.mark }],
          cursor: null
        });
        if (p.schemNote) p.schemNote.textContent = 'output against input voltage: the dashed line is perfectly linear, the shading is the swing';
      } else {
        if (!BENCH._sweep) {
          const s = [];
          for (let k = -30; k <= 10.001; k += 0.5) {
            const r = twoTone(k);
            s.push({ x: k, tone: r.tone, im3: r.tone + r.im3 });
          }
          BENCH._sweep = s;
        }
        // ten decibels a division across, thirty up, so the slopes of one and
        // three are easy to read; anything below the floor is left off rather
        // than drawn along it
        const s = BENCH._sweep, lo = s[0], bot = -90, top = 30;
        const above = pts => pts.filter(q => q.y >= bot && q.y <= top);
        const sdbTick = v => (v < 0 ? '−' : '') + Math.abs(Math.round(v)) + NBSP + 'dB';
        Plot.draw(p.schem, {
          xRange: [-30, 10], xFmt: sdbTick, tokens: t,
          left: { min: bot, max: top, fmt: sdbTick },
          traces: [
            { pts: above(s.map(q => ({ x: q.x, y: lo.tone + (q.x - lo.x) }))), colour: t.mark, axis: 'left', width: 1 },
            { pts: above(s.map(q => ({ x: q.x, y: lo.im3 + 3 * (q.x - lo.x) }))), colour: t.mark, axis: 'left', width: 1 },
            { pts: s.map(q => ({ x: q.x, y: q.tone })), colour: t.p, axis: 'left', width: 2.4 },
            { pts: above(s.map(q => ({ x: q.x, y: q.im3 }))), colour: t.p, axis: 'left', width: 2.4, dash: DASH }
          ],
          cursor: { x: d.drive, colour: t.mark, dot: { y: tt.tone + tt.im3, axis: 'left' } }
        });
        if (p.schemNote) p.schemNote.textContent = 'output power against drive, both in dB: tones solid red, third order dashed red, thin grey lines the slopes of 1 and 3';
      }

      /* right: the spectrum */
      let list = [], xr, fmt, bands = [];
      // on a phone the frequency labels drop their unit, which the legend
      // gives instead, so the first one clears the bottom of the dB axis
      const narrowG = p.graph.clientWidth < 600;
      const mhzNote = narrowG ? '<span>Frequency in MHz</span>' : '';
      const mhzFmt = narrowG ? (x => Fm.trim(x / 1e6, 3)) : (x => Fm.trim(x / 1e6, 3) + ' MHz');
      if (view === 'one') {
        const one = oneTone(d.drive);
        for (let h = 1; h <= 4; h++) {
          const f = h * d.f1;
          list.push({ f: f, db: one.rel(h), after: one.rel(h) + filterDb(f) - filterDb(d.f1) });
        }
        xr = [0, 60e6]; fmt = mhzFmt;
      } else if (view === 'wide') {
        for (let zone = 1; zone <= 3; zone++) {
          for (let m = -5; m <= 8; m++) {
            const n = zone - m;
            if (Math.abs(n) > 8) continue;
            const f = m * d.f1 + n * d.f2, db = tt.rel(m, n);
            if (db < floor) continue;
            list.push({ f: f, db: db, after: db + filterDb(f) - filterDb(d.f1) });
          }
        }
        xr = [0, 50e6]; fmt = mhzFmt;
      } else {
        for (let m = -4; m <= 5; m++) {
          const n = 1 - m, f = m * d.f1 + n * d.f2, db = tt.rel(m, n);
          if (db < floor) continue;
          list.push({ f: f, db: db, after: db + filterDb(f) - filterDb(d.f1) });
        }
        xr = [d.f1 - 4.5 * d.df, d.f2 + 4.5 * d.df];
        fmt = narrowG ? (x => (x / 1e6).toFixed(4)) : (x => (x / 1e6).toFixed(4) + ' MHz');
        bands = [{ from: DIAL + CHANNEL[0], to: DIAL + CHANNEL[1], colour: t.mark }];
      }
      const filt = [];
      if (view !== 'two') {
        for (let i = 0; i <= 300; i++) {
          const f = Math.max(1e5, xr[0] + (xr[1] - xr[0]) * i / 300);
          filt.push({ x: f, y: Math.max(floor, filterDb(f) - filterDb(d.f1)) });
        }
      }
      const traces = [];
      if (filt.length) traces.push({ pts: filt, colour: t.mark, axis: 'left', width: 1.4 });
      // before the filter dashed and thin, after it solid and thicker on top: where
      // the filter takes nothing the solid stem covers the dashed one, and where
      // it takes a lot only the dashed stem rises above it
      if (view !== 'two') traces.push(...stems(list.map(s => ({ f: s.f, db: s.db })), floor, t.p, 1.6, [4, 3]));
      traces.push(...stems(list.map(s => ({ f: s.f, db: s.after })), floor, t.p, view === 'two' ? 2 : 3));
      Plot.draw(p.graph, {
        xRange: xr, xFmt: fmt, tokens: t,
        left: { min: floor, max: 0, fmt: y => Math.round(y) + ' dB' },
        traces: traces, bands: bands, cursor: null
      });

      if (view === 'two') {
        p.legend.innerHTML = swatch(t.p, 'Output, dB below each tone') +
          swatch(t.mark, 'The SSB channel, 300 Hz to 2.7 kHz above the dial') + mhzNote;
        p.readouts.innerHTML = ro([
          ['Tones', mhz(d.f1) + ', ' + mhz(d.f2)],
          ['Third order at', mhz(d.im3lo) + ', ' + mhz(d.im3hi)],
          ['Third order, below each tone', neg(d.im3), true],
          ['Over the last 1 dB of drive', 'tones ' + sdb(d.riseTone) + ', third order ' + sdb(d.riseIm3)]
        ]);
      } else if (view === 'one') {
        p.legend.innerHTML = swatch(dashSwatch(t.p), 'Out of the PA, dashed') + swatch(t.p, 'After the filter') +
          swatch(t.mark, 'Filter loss, same scale') + mhzNote;
        p.readouts.innerHTML = ro([
          ['Tone', mhz(d.f1)],
          ['2nd harmonic, before &rarr; after the filter', neg(d.h2) + ' &rarr; ' + neg(d.h2f)],
          ['3rd harmonic, before &rarr; after the filter', neg(d.h3) + ' &rarr; ' + neg(d.h3f), true],
          ['Gain lost to the bend', Math.max(0, -dB20(oneTone(d.drive).c(1) / (U1 * Math.pow(10, d.drive / 20)))).toFixed(1) + NBSP + 'dB']
        ]);
      } else {
        p.legend.innerHTML = swatch(dashSwatch(t.p), 'Out of the PA, dashed') + swatch(t.p, 'After the filter') +
          swatch(t.mark, 'Filter loss, same scale') + mhzNote;
        const near = list.filter(s => Math.abs(s.f - DIAL) < 1e6 && Math.abs(s.f - d.f1) > 1 && Math.abs(s.f - d.f2) > 1);
        const worstFar = Math.max(...list.filter(s => s.f > 20e6).map(s => s.after));
        p.readouts.innerHTML = ro([
          ['Beside the signal, third order', neg(d.im3) + ', filter takes ' + Math.abs(d.im3loss).toFixed(1) + NBSP + 'dB', true],
          ['Products near 14 MHz', String(near.length)],
          ['Near 28 MHz, worst before', neg(Math.max(...list.filter(s => s.f > 20e6 && s.f < 35e6).map(s => s.db)))],
          ['Above 20 MHz, worst after', neg(worstFar)]
        ]);
      }
      return {};
    },

    /*
     * Foundation 3F3: the transmitter and its aerial. Power that the aerial
     * does not take goes back towards the transmitter.
     */
    match(ctx) {
      const { p, d, t, Plot, swatch, ro } = ctx;
      wideSchematic(p, false);
      matchGraph(p, fitSchem(p.schem, matchLayout()));
      const lo = Math.log10(5), hi = Math.log10(500), del = [], back = [];
      for (let i = 0; i <= 240; i++) {
        const r = Math.pow(10, lo + (hi - lo) * i / 240);
        const pa = TX_VOC * TX_VOC * r / Math.pow(Z_LOAD + r, 2);
        del.push({ x: Math.log10(r), y: pa }); back.push({ x: Math.log10(r), y: TX_WATTS - pa });
      }
      Plot.draw(p.graph, {
        xRange: [lo, hi], xFmt: x => Fm.eng(Math.pow(10, x), 'Ω', 2), tokens: t,
        left: { max: 28, fmt: y => Math.round(y) + ' W' },
        traces: [{ pts: back, colour: t.p, axis: 'left', width: 2, dash: DASH },
                 { pts: del, colour: t.p, fill: t.pFill, axis: 'left', width: 2.4 }],
        marks: [{ x: Math.log10(50), colour: t.mark }],
        cursor: { x: Math.log10(d.rant), colour: t.mark, dot: { y: d.pAerial, axis: 'left' },
                  label: Fm.eng(d.rant, 'Ω', 3) }
      });
      p.legend.innerHTML = swatch(t.p, 'Power the aerial takes') +
        swatch(dashSwatch(t.p), 'Power sent back, dashed') + swatch(t.mark, '50 Ω, matched');
      const off = Math.abs(d.gamma);
      p.readouts.innerHTML = ro([
        ['Aerial', Fm.eng(d.rant, 'Ω', 3)],
        ['Power to the aerial', Fm.eng(d.pAerial, 'W', 3), true],
        ['Power sent back', Fm.eng(Math.max(0, d.pBack), 'W', 3)],
        ['Verdict', off < 0.02 ? 'matched' : off < 0.2 ? 'close enough' : off < 0.5 ? 'poor match' : 'badly wrong: risk of damage']
      ]);
      p.lab = { RL: Fm.eng(d.rant, 'Ω', 3) };
      p.fAnim = 14.1e6;
      return { layout: matchLayout(), circuit: MX.parseNetlist(matchNetlist(d.rant)) };
    },

    /*
     * Full 3F3: the pi network swept, or the whole stage with its standing
     * current.
     */
    pa(ctx) {
      const { p, d, t, Plot, swatch, ro } = ctx;
      if (p.topology === 'stage') {
        wideSchematic(p, true);
        p.legend.innerHTML = swatch(t.i, 'Direct current, no drive: bias and the standing current') +
          '<span>The RF path, from in to load, carries nothing until there is drive</span>';
        p.readouts.innerHTML = ro([
          ['Base held at', Fm.eng(ST_VD, 'V', 3)],
          ['Through the bias resistor', Fm.eng(ST.IRB, 'A', 3)],
          ['Standing collector current', Fm.eng(ST.IC, 'A', 3), true],
          ['Class at rest', 'AB: only just conducting']
        ]);
        p.lab = {};
        const narrow = p.graph.parentElement.clientWidth < 640;
        fitSchem(p.graph, stageLayout(narrow));
        return { layout: stageLayout(narrow),
                 flow: { mode: 'dc', currents: Object.assign({}, ST), compress: true, note: false } };
      }
      wideSchematic(p, false);
      matchGraph(p, fitSchem(p.schem, piLayout(d.rpa)));
      const pi = d.pi, ck = MX.parseNetlist(piNetlist(pi));
      const lo = Math.log10(pi.f0 / 4), hi = Math.log10(pi.f0 * 4.5), pts = [];
      for (let i = 0; i <= 260; i++) {
        const f = Math.pow(10, lo + (hi - lo) * i / 260);
        pts.push({ x: Math.log10(f), y: Math.min(0, Math.max(-60, piResponse(ck, pi, f).db)) });
      }
      const fc = p.cursor === null ? pi.f0 : Math.pow(10, lo + (hi - lo) * p.cursor);
      const atC = piResponse(ck, pi, fc);
      Plot.draw(p.graph, {
        xRange: [lo, hi], xFmt: x => Fm.eng(Math.pow(10, x), 'Hz', 2), tokens: t,
        left: { min: -60, max: 0, fmt: y => Math.round(y) + ' dB' },
        traces: [{ pts: pts, colour: t.p, axis: 'left', width: 2.4 }],
        marks: [1, 2, 3].map(k => ({ x: Math.log10(k * pi.f0), colour: t.mark })),
        cursor: { x: Math.log10(fc), colour: t.mark, dot: { y: Math.max(-60, atC.db), axis: 'left' },
                  label: Fm.eng(fc, 'Hz', 3) }
      });
      p.legend.innerHTML = swatch(t.p, 'Power reaching the load, against frequency') +
        swatch(t.mark, 'Design frequency, 2nd and 3rd harmonics');
      const z = atC.zin;
      const zs = Fm.eng(z.re, 'Ω', 3) + (Math.abs(z.im) < 0.01 * Math.abs(z.re) ? '' :
        (z.im < 0 ? ' &minus; j' : ' + j') + Fm.eng(Math.abs(z.im), 'Ω', 3));
      p.readouts.innerHTML = ro([
        ['C1, L, C2', Fm.eng(pi.C1, 'F', 3) + ', ' + Fm.eng(pi.L, 'H', 3) + ', ' + Fm.eng(pi.C2, 'F', 3)],
        ['2nd harmonic', neg(d.piLoss[1])],
        ['3rd harmonic', neg(d.piLoss[2]), true],
        ['Transistor sees, at ' + Fm.eng(fc, 'Hz', 3), zs]
      ]);
      p.lab = { RL: '50 Ω' };
      p.fAnim = fc;
      return { layout: piLayout(d.rpa), circuit: ck };
    },

    /*
     * Full 3F4: the envelope power of each mode against time, with its peak
     * and its average, and the two side by side as bars.
     */
    pep(ctx) {
      const { p, d, t, Plot, swatch, ro } = ctx;
      plainSlots(p);
      const mode = p.topology, env = envelopeOf(mode, mode === 'ssb' ? d.proc : 0);
      const share = d.share[mode], avg = d.pep * share;
      const pts = [];
      for (let i = 0; i < ENV_N; i += 2) pts.push({ x: i * ENV_T / ENV_N, y: d.pep * env[i] * env[i] });
      Plot.draw(p.graph, {
        xRange: [0, ENV_T], xFmt: x => Fm.trim(x, 2) + ' s', tokens: t,
        left: { max: niceMax(d.pep * 1.08), fmt: y => Fm.eng(y, 'W', 3) },
        traces: [{ pts: pts, colour: t.p, fill: t.pFill, axis: 'left', width: 1.4 },
                 ...dashedLevel(0, ENV_T, avg, t.p, 2.4, 60)],
        cursor: null
      });
      p.legend.innerHTML = swatch(t.p, 'Envelope power; its highest point is the PEP') +
        swatch(dashSwatch(t.p), 'Average power, dashed');

      // left: the two figures as bars
      const { c, W, H } = canvasOf(p.schem);
      const base = H - 46, top = 34, bw = Math.min(70, W * 0.24);
      const bars = [['PEP', d.pep, 1], ['Average', avg, 0.55]];
      bars.forEach(([name, v, alpha], i) => {
        const x = W * (i === 0 ? 0.3 : 0.7) - bw / 2, h = (base - top) * v / d.pep;
        c.globalAlpha = alpha; c.fillStyle = t.p;
        c.fillRect(x, base - h, bw, h); c.globalAlpha = 1;
        c.fillStyle = t.ink; c.textAlign = 'center';
        c.font = '600 15px ' + t.mono; c.textBaseline = 'bottom';
        c.fillText(Fm.eng(v, 'W', 3), x + bw / 2, base - h - 6);
        c.font = '600 16px ' + t.font; c.textBaseline = 'top';
        c.fillText(name, x + bw / 2, base + 10);
      });
      c.strokeStyle = t.wire; c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(12, base); c.lineTo(W - 12, base); c.stroke();
      if (p.schemNote) p.schemNote.textContent = 'the heat in the PA follows the average';

      const rows = [
        ['PEP', Fm.eng(d.pep, 'W', 3)],
        ['Average', Fm.eng(avg, 'W', 3), true],
        ['Peak to average', (10 * Math.log10(1 / share)).toFixed(1) + NBSP + 'dB'],
        ['Average as a share of PEP', Math.round(100 * share) + NBSP + '%']
      ];
      p.readouts.innerHTML = ro(rows);
      return {};
    },

    /*
     * Full 3F5: the ALC loop drawn as blocks on the left, and on the right
     * the output against time, with the level the ALC is holding.
     */
    alc(ctx) {
      const { p, d, t, Plot, swatch, ro } = ctx;
      plainSlots(p);
      const mode = p.topology, ext = mode === 'ext' || mode === 'extoff';
      const r = alcRun(mode, d.audio, d.setp);
      // the line drawn is what holds the peaks: the external PA's rating, the
      // power control the ALC holds to, or with no ALC only the PA's rating
      const limit = ext ? EXT_RATED : mode === 'off' ? RIG_RATED : d.setp;
      const ymax = niceMax(Math.max(limit, r.peakOut, 10) * 1.08);
      const pts = [];
      for (let i = 0; i < ENV_N; i += 2) pts.push({ x: i * ENV_T / ENV_N, y: r.out[i] });
      // the asked-for line is left off where it runs above the graph, leaving
      // through the top edge, rather than drawn flat along it: flat tops are
      // what clipping looks like, and that is not what this line shows
      const cross = (a, b) => ({ x: a.x + (b.x - a.x) * (ymax - a.y) / (b.y - a.y), y: ymax });
      const askRuns = [];
      let run = null, prev = null;
      for (let i = 0; i < ENV_N; i += 2) {
        const q = { x: i * ENV_T / ENV_N, y: r.asked[i] };
        if (q.y <= ymax) {
          if (!run) { run = []; askRuns.push(run); if (prev) run.push(cross(prev, q)); }
          run.push(q);
        } else if (run) { run.push(cross(prev, q)); run = null; }
        prev = q;
      }
      Plot.draw(p.graph, {
        xRange: [0, ENV_T], xFmt: x => Fm.trim(x, 2) + ' s', tokens: t,
        left: { max: ymax, fmt: y => Fm.eng(y, 'W', 3) },
        traces: [{ pts: pts, colour: t.p, fill: t.pFill, axis: 'left', width: 1.6 },
                 ...askRuns.map(a => ({ pts: a, colour: t.p, axis: 'left', width: 1.4, dash: DASH })),
                 { pts: [{ x: 0, y: limit }, { x: ENV_T, y: limit }], colour: t.mark, axis: 'left', width: 1.6 }],
        cursor: null
      });
      p.legend.innerHTML = swatch(t.p, ext ? 'External PA output' : 'PA output') +
        swatch(dashSwatch(t.p), 'What the audio asks for, scaled from the rated point, dashed') +
        swatch(t.mark, ext ? 'External PA rating, ' + EXT_RATED + ' W'
                           : mode === 'off' ? 'PA rating, ' + RIG_RATED + ' W' : 'Power control setting');

      /* left: the loop */
      const { c, W, H } = canvasOf(p.schem);
      const on = mode === 'on' || mode === 'ext';
      const bh = 40, y1 = 30, y2 = 128;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      const blk = (x, y, w, label, hot) => {
        box(c, x, y, w, bh, hot ? t.ink : t.wire, t.surface, hot ? 2.2 : 1.5);
        c.fillStyle = t.ink; c.font = '600 15px ' + t.font;
        c.fillText(label, x + w / 2, y + bh / 2);
      };
      const g = 12, bw = (W - 2 * 6 - 2 * g) / 3;
      const xs = [6, 6 + bw + g, 6 + 2 * (bw + g)];
      if (!ext) {
        blk(xs[0], y1, bw, 'Audio');
        blk(xs[1], y1, bw, 'Driver');
        blk(xs[2], y1, bw, 'PA', true);
        blk(xs[2], y2, bw, 'Detector');
      } else {
        blk(xs[0], y1, bw * 2 + g, 'Transceiver');
        blk(xs[2], y1, bw, 'Ext PA', true);
        blk(xs[2], y2, bw, 'Detector');
      }
      if (!ext) arrow(c, xs[0] + bw, y1 + bh / 2, xs[1] - 1, y1 + bh / 2, t.wire);
      arrow(c, xs[1] + bw, y1 + bh / 2, xs[2] - 1, y1 + bh / 2, t.wire);
      // output sample down to the detector
      arrow(c, xs[2] + bw / 2, y1 + bh, xs[2] + bw / 2, y2 - 1, t.wire);
      // the ALC line back to the driver, or to the transceiver's ALC input
      const backX = ext ? xs[0] + bw : xs[1] + bw / 2;
      c.setLineDash(on ? [] : [5, 5]);
      c.strokeStyle = on ? t.v : t.faint; c.lineWidth = 2;
      c.beginPath(); c.moveTo(xs[2], y2 + bh / 2); c.lineTo(backX, y2 + bh / 2); c.stroke();
      c.setLineDash([]);
      if (on) arrow(c, backX, y2 + bh / 2, backX, y1 + bh + 1, t.v, 2);
      else {
        c.strokeStyle = t.faint; c.setLineDash([5, 5]);
        c.beginPath(); c.moveTo(backX, y2 + bh / 2); c.lineTo(backX, y1 + bh + 2); c.stroke();
        c.setLineDash([]);
      }
      // the line is the ALC voltage, so voltage blue; its tag is a cut in
      // decibels, not a voltage, so it is written in ink
      c.fillStyle = on ? t.ink : t.faint; c.font = '600 15px ' + t.font;
      c.textAlign = 'left'; c.textBaseline = 'top';
      const tag = on ? (ext ? 'ALC lead' : 'ALC') + (r.cut > 0.05 ? ', −' + r.cut.toFixed(1) + NBSP + 'dB' : ', idle')
                     : (ext ? 'no ALC lead' : 'ALC disconnected');
      // under the line it names, clear of the detector at its right-hand end
      const tw = c.measureText(tag).width;
      const tx = Math.max(6, Math.min((backX + xs[2]) / 2 - tw / 2, xs[2] - 6 - tw));
      c.fillText(tag, tx, y2 + bh / 2 + 8);
      if (p.schemNote) p.schemNote.textContent = {
        on: 'the detector measures the output and turns the drive down',
        off: 'nothing turns the drive down: the PA flattens the peaks',
        ext: 'the external PA measures its output and tells the radio',
        extoff: 'the PA cannot tell the radio: only the radio’s own ALC acts'
      }[mode];

      // clean only if the products are low and the peaks stay within the
      // rating: past it the PA flattens them, which is splatter whatever
      // this model's curve makes of it
      const ok = r.im3 < -28 && r.peakOut <= (ext ? EXT_RATED : RIG_RATED) * 1.02;
      // past its rating the figure depends on where the model's curve tops
      // out, which a real amplifier does not share
      const model = (w, rated) => Fm.eng(w, 'W', 3) + (w > rated * 1.05 ? ' (illustrative model)' : '');
      p.readouts.innerHTML = ro(ext ? [
        ['Transceiver peaks', model(r.peakRig, RIG_RATED)],
        ['External PA peaks', model(r.peakOut, EXT_RATED), true],
        [mode === 'ext' ? 'ALC cutting the drive by' : 'Radio’s own ALC cutting by',
         r.cut > 0.05 ? r.cut.toFixed(1) + NBSP + 'dB' : 'nothing'],
        ['Third order at the peaks', neg(r.im3) + (ok ? ', clean' : ', splatter')]
      ] : [
        ['Peaks out', model(r.peakOut, RIG_RATED), true],
        ['Asked for, scaled from the rated point', Fm.eng(r.peakAsked, 'W', 3)],
        ['ALC cutting the drive by', mode === 'off' ? 'disconnected' : r.cut > 0.05 ? r.cut.toFixed(1) + NBSP + 'dB' : 'nothing'],
        ['Third order at the peaks', neg(r.im3) + (ok ? ', clean' : ', splatter')]
      ]);
      return {};
    }
  },

  labels: (p) => p.lab || {},

  /* ---- the five items, in reading order ---- */
  items: [
    {
      code: '3F1',
      levels: ['foundation', 'intermediate'],
      introduces: {
        foundation: ['power amplifier', 'drive'],
        intermediate: ['efficiency']
      },
      panel: { foundation: 'chain', intermediate: 'efficiency' },
      noSchematic: { foundation: true },
      heading: {
        foundation: 'The last stage before the aerial',
        intermediate: 'Power in, power out, and the heat between'
      },
      lead: {
        foundation: 'Follow the signal from the modulator to the aerial and watch where the power goes up.',
        intermediate: 'Set the supply and the current, then the efficiency, and watch the RF and the heat share out the DC.'
      },
      headline: {
        foundation: 'The power amplifier lifts the signal to the level you transmit.',
        intermediate: 'Efficiency, and working out the RF you get out from the DC you put in.'
      },
      formulas: {
        intermediate: ['pdc', 'rfout', 'heat', 'effy']
      },
      workLead: {
        intermediate: 'First the DC power going in, from the meter readings. Then the share of it that comes out as RF, and what is left over as heat.'
      },
      workNote: {
        foundation: 'No arithmetic at this level. What matters is where the PA sits and what it does: it is the last stage, and it is the one that makes the big step in power.',
        intermediate: 'The booklet you have in the exam prints P = V × I. It does not print the efficiency, so learn it in both directions: RF out from DC in, and efficiency from the two powers.'
      },
      explain: {
        foundation: [
          'A transmitter builds its signal at low power. The modulator puts the speech or Morse onto the radio frequency signal, and a driver stage raises it to about a watt or less.',
          'The power amplifier, the PA, is the last stage before the aerial. It takes that small signal and lifts it to the full output power, without changing what the signal carries. Drag the drive and watch the output follow it.',
          'The Foundation licence allows up to 25 W on most bands, measured at the peaks of the signal. Use only the power a contact needs: a weaker signal causes less interference to everyone else.',
          'At Intermediate the same stage is looked at as a bookkeeping exercise: how much of the supply power it turns into radio frequency power, and where the rest goes.'
        ],
        intermediate: [
          'The ammeter in the supply lead and the supply voltage give the DC power going in: volts times amps. That is all the power the PA has to work with.',
          'Some of it comes out as RF power. The share that does is the efficiency, written as a percentage. Whatever does not come out as RF becomes heat in the transistor, which is why a PA needs a heatsink.',
          'So RF out is the DC in times the efficiency, and the heat is the difference. Drag the efficiency and watch the two lower bars trade places while their total stays exactly the length of the top one.',
          'Efficiency depends on the kind of amplifier. An amplifier built for SSB might manage about half; one that switches hard, such as the class C stages met with semiconductors, does better.'
        ]
      },
      highlight: { intermediate: ['RM', 'Q1'] },
      controls: { foundation: ['drv'], intermediate: ['vdc', 'idc', 'eff'] }
    },

    {
      code: '3F2',
      levels: ['full'],
      introduces: {
        full: ['linear', 'harmonic', 'intermodulation', 'two tone test', 'compression', 'splatter']
      },
      panel: 'imd',
      circuit: 'two',
      toggle: { label: 'View', levels: ['full'],
                options: [['one', 'One tone'], ['two', 'Two tones, close in'], ['wide', 'Two tones, wide']] },
      heading: { full: 'Linearity, harmonics and intermodulation' },
      lead: {
        full: 'Put two tones in, turn the drive up a decibel at a time, and watch what else comes out and where it lands.'
      },
      headline: {
        full: 'Which modes need a linear amplifier, and how distortion makes harmonics and intermodulation.'
      },
      formulas: { full: ['im3', 'harm', 'order', 'slope'] },
      workLead: {
        full: 'Where the new frequencies land, worked from the tones on the controls: the third order pair beside the signal, the harmonics far away, and the general rule both come from.'
      },
      workNote: {
        full: 'The booklet prints none of these. Learn 2f1 − f2 and 2f2 − f1 in particular: double one frequency, take away the other, both ways round. The last line shows the 3 dB per dB rule at work. This model keeps to it until its peaks reach the ceiling, about 4 dB above rated drive, and then falls away from it; a real amplifier wanders from it sooner, around the point where its gain starts to fall.'
      },
      explain: {
        full: [
          'A linear amplifier gives out a larger copy of what goes in and nothing else. Plot its output against its input and you get a straight line. Choose One tone: the dashed line is that ideal, and the blue curve is this amplifier, straight in the middle and bending flat at the ends, where it runs out of supply.',
          'Push the drive up and the shaded swing reaches the bend. The peaks are squashed, and a wave that repeats at f but is no longer a pure sine contains harmonics at 2f, 3f and so on. A curve that bends both ends alike makes the odd ones; a lopsided one, like this single transistor stage, adds even ones too.',
          'Now two tones, the two tone test of an SSB transmitter: two audio tones into the microphone socket send out two RF signals 1 kHz apart. Through a curve that is not straight they make new frequencies at every m f1 + n f2. Those with m + n = 1 land right beside the signal, and the third order pair, 2f1 − f2 and 2f2 − f1, is the strongest. That is intermodulation.',
          'Look at the left graph. Below the bend the tones rise 1 dB for each dB of drive and the third order products rise 3 dB, so they gain on the signal 2 dB at a time. Once the amplifier goes into compression the tones rise less and less while the products climb on, until the peaks are clipped flat. The lines either side of the channel are splatter, heard by everyone on the neighbouring frequencies.',
          'Choose Two tones, wide. The output network and low-pass filter take the harmonics near 28 and 42 MHz down by about 48 dB and 76 dB. The third order products are inside their passband with the signal itself, and the filter takes almost nothing off them. Only less drive cures them.',
          'This is why SSB, AM and data modes whose amplitude varies need a linear amplifier, class A, class AB, or class B in push-pull: the information is in the envelope, and bending it spreads the signal. CW, FM and frequency shift keyed data such as RTTY have a constant amplitude while the transmitter is on, so a non-linear class C amplifier, the most efficient, does them no harm, provided a good filter removes its harmonics.',
          'The amplifier circuit itself, the transistor and the network on its output, is drawn in the next section, together with how the class C and push-pull forms differ from it.'
        ]
      },
      controls: ['drive', 'a1', 'a2']
    },

    {
      code: '3F3',
      levels: ['foundation', 'full'],
      introduces: {
        foundation: ['matched', 'reflected power'],
        full: ['pi network', 'RF choke', 'bias']
      },
      panel: { foundation: 'match', full: 'pa' },
      circuit: 'pi',
      toggle: { label: 'Show', levels: ['full'],
                options: [['pi', 'Output network'], ['stage', 'The whole stage']] },
      heading: {
        foundation: 'The right aerial, and the wrong one',
        full: 'The parts of a PA, and the output network'
      },
      lead: {
        foundation: 'The transmitter is built for one load. Drag the aerial away from it and watch what the aerial takes.',
        full: 'Every part of the stage has a job. Start with the network on the output, which does two at once.'
      },
      headline: {
        foundation: 'The power amplifier needs a matched load. The wrong aerial can damage it.',
        full: 'The parts of a PA stage, and what each one contributes.'
      },
      formulas: { full: ['xc1', 'xl', 'xc2', 'loss'] },
      workLead: {
        full: d => d.device === 'stage'
          ? 'The output network is part of the stage drawn above. Its parts, at the band set on the controls:'
          : 'The three reactances at the design frequency, then what the network does to the second harmonic.'
      },
      workNote: {
        foundation: 'No arithmetic at this level. The point is the shape of the graph: the aerial takes all 25 W only at 50 Ω, and the further it is from 50 Ω the more comes back.',
        full: 'The reactance formulas and the decibel formula are printed in the booklet. How the network’s values are chosen is beyond the syllabus, so the values here are worked out for you; what the exam asks is what the network does.'
      },
      explain: {
        foundation: [
          'A transmitter is built to work into one particular load, normally 50 Ω. The feeder is 50 Ω as well, and an aerial built for 50 Ω feeder presents close to it. Then the load is matched, and the aerial takes all the power.',
          'Drag the aerial resistance away from 50 Ω, either way. The aerial takes less, and the rest is reflected power: it travels back down the feeder to the transmitter, where its transistors have to cope with it as well as their own heat.',
          'A badly wrong aerial, or no aerial at all, can damage the transmitter. Many modern radios cut their power to protect themselves, but that is no reason to rely on it. Never transmit without an aerial or a dummy load connected.',
          'At Full the same need is met inside the transmitter, by the network that sits between the transistor and the aerial socket.'
        ],
        full: [
          'Choose The whole stage. The input transformer is the input circuit: it matches the 50 Ω of the driver down to the low impedance of the transistor’s base. The bias resistor and diode hold the base at about 0.65 V, so the transistor is only just conducting at rest. That bias makes it class AB, linear enough for SSB; with no bias it would be class C.',
          'The RF choke is the collector load. It feeds direct current from the supply to the collector and blocks the radio frequency current from going back into the supply, so the RF goes on through the DC block to the output network. The dots show the direct current with no drive.',
          'The syllabus asks you to recognise simple PA circuits, and this is one: a single transistor in class AB. Take the bias away, returning the base to the emitter through an RF choke, and the same stage becomes class C: it conducts only on the tips of the drive, and a tuned circuit on the collector turns the pulses back into a sine wave. Push-pull uses two transistors fed in antiphase from a centre tapped input transformer, each amplifying one half of the cycle, with their outputs joined again in a centre tapped output transformer. With no bias that is class B; a little bias, class AB, smooths the handover between the two. The even harmonics largely cancel, which makes push-pull class AB the usual linear amplifier for SSB.',
          'The output network is a pi network, and it does two jobs. First, matching: the transistor gives its power into a resistance much lower than 50 Ω, 12.5 Ω where the Transistor load slider starts, and the network makes the 50 Ω load look like that resistance at the design frequency. Choose Output network and drag across the graph: away from the design frequency the transistor no longer sees what it needs, which is why the network is switched or retuned for each band.',
          'That match holds only for the load the network was built for. Connect an aerial far from 50 Ω and the transistor no longer sees the resistance it needs: with a higher load the voltage on its collector rises, with a lower one the current through it rises, and either can take it past its ratings and damage it. This is the Foundation rule seen from inside: the transmitter must work into a correctly matched load, normally 50 Ω, and the wrong aerial can damage it.',
          'Second, filtering: its capacitors go to ground and its coil is in series, so it is a low-pass filter. Read the losses at the second and third harmonics. At 12.5 Ω, about 20 dB and 32 dB help, but are not enough on their own, which is why transmitters follow it with a separate low-pass filter.'
        ]
      },
      highlight: { full: ['C1', 'L1', 'C2'] },
      controls: { foundation: ['rant'], full: ['rpa', 'fpi'] }
    },

    {
      code: '3F4',
      levels: ['full'],
      introduces: {
        full: ['PEP', 'average power', 'speech processor']
      },
      panel: 'pep',
      circuit: 'ssb',
      toggle: { label: 'Mode', levels: ['full'],
                options: [['ssb', 'SSB speech'], ['cw', 'CW'], ['fm', 'FM'], ['rtty', 'RTTY']] },
      heading: { full: 'Peak and average power, by mode' },
      lead: {
        full: 'Every mode here peaks at the same power. Watch how differently they spend the time in between.'
      },
      headline: {
        full: 'How mode and speech processing change the rating your PA needs, through peak to average power.'
      },
      formulas: { full: ['par', 'lift'] },
      workLead: {
        full: 'The peak to average ratio of the mode selected, then what the speech processor has done to the average on SSB.'
      },
      workNote: {
        full: 'Both use the booklet’s power ratio formula, 10 log of one power over another. Most licence power limits are peak envelope power, but the heat a PA has to get rid of follows the average, so the same PEP can be easy or hard work depending on the mode.'
      },
      explain: {
        full: [
          'The licence defines peak envelope power as the average power over one RF cycle at the highest point of the modulation, and most of its power limits are given as PEP. The heat in the PA, though, follows the average power over the whole transmission.',
          'Speech is peaky. On SSB the output is nothing in the gaps and full power only on the loudest syllables, so the average here is about a tenth of the PEP: a peak to average ratio of about 10 dB, and real speech is often peakier still.',
          'Choose CW: full power while the key is down, nothing in the spaces, so the average is about half. Choose FM or RTTY: the amplitude never changes, so the average is the PEP, all the time you transmit. Those are the hardest work for a PA. AM with a steady tone at full modulation sits between, its average 37.5% of its PEP.',
          'Back on SSB, turn up the processing. A speech processor lifts the quieter parts while holding the peaks where they were, so the PEP does not move and the average rises: louder at the far end, and a hotter PA. Overdone, it distorts.',
          'So a transmitter that runs comfortably on SSB speech at 100 W PEP may need turning down for a long FM, RTTY or data transmission at the same peak. Check what its maker rates it for in each mode.'
        ]
      },
      controls: ['pep', 'proc']
    },

    {
      code: '3F5',
      levels: ['full'],
      introduces: {
        full: ['ALC', 'RF power control']
      },
      panel: 'alc',
      circuit: 'on',
      toggle: { label: 'ALC', levels: ['full'],
                options: [['on', 'Connected'], ['off', 'Disconnected'],
                          ['ext', 'External PA, lead in'], ['extoff', 'External PA, no lead']] },
      heading: { full: 'Automatic level control, and the power knob' },
      lead: {
        full: 'Turn the audio up past what the PA can take, then see what the ALC does about it, and what happens without one.'
      },
      headline: {
        full: 'Automatic level control and the manual power knob, and what each is protecting.'
      },
      formulas: { full: ['alc'] },
      workLead: {
        full: 'How far the drive has to come down for the loudest peak to sit at the allowed level, worked for a perfectly linear amplifier: P<sub>out</sub> is the peak allowed, P<sub>in</sub> the peak the audio asks for. A result of &minus;6 dB means the drive is cut by 6 dB.'
      },
      workNote: {
        full: d => {
          // what "asked for" means, and why it can sit below the output
          const asked = 'The audio’s ask is scaled from the rated point, where the amplifier has already lost 1' + NBSP +
            'dB of gain, so at low audio the output can come out a little above it. ';
          if (d.device === 'off') return 'With the ALC disconnected nothing limits the drive; the line is the PA’s rated ' +
            RIG_RATED + NBSP + 'W. ' + asked;
          const loop = 'Under the graph is the loop’s own cut, measured as it runs. ';
          if (d.device === 'ext') return 'Here the allowed level is the external PA’s rating, or what the transceiver’s power control lets through if that is less. ' +
            loop + 'The two can differ by up to 2' + NBSP + 'dB, because the transceiver and the PA both lose gain near their ratings. ' + asked;
          return (d.device === 'extoff'
            ? 'With no lead, only the transceiver’s own ALC acts, so the allowed level is its power control setting; the external PA gets whatever that gives it. '
            : 'Here the allowed level is the power control setting. ') + loop +
            'With the transceiver at its full 100' + NBSP + 'W the two agree; below that they differ by up to 1' + NBSP + 'dB, because an amplifier has lost 1' + NBSP + 'dB of gain at its rated output and gets it back as it is turned down. ' + asked;
        }
      },
      explain: {
        full: [
          'ALC is a feedback loop. A detector measures the PA’s output, and when it would go past the set level it sends a control voltage back to an earlier stage, here the driver, to turn its gain down. However loud the operator, the peaks are held at the set level and the PA is not overdriven.',
          'The RF power control sets that level. Drag it down and the peaks come down with it. Use the least power the contact needs.',
          'Choose Disconnected with the audio still high. Now the PA itself flattens the peaks, and the output shows it: the tops of the syllables cut off flat. Flattened peaks are a bent curve, and a bent curve makes intermodulation, so the third order figure under the graph climbs into splatter.',
          'ALC limits the transmitted power, and nothing else. It does not hold received signals steady, which is AGC in the receiver; it does not shut down for a poor SWR, which a separate protection circuit does; and it does not tune an aerial matching unit. It is quick but not instant, so set the audio sensibly as well: most radios mark a zone on the ALC meter to keep within.',
          'An external PA has an ALC lead too. Choose External PA, lead in: the PA measures its own output and sends a control voltage back along the lead to the transceiver’s ALC input, telling it to reduce its drive. Unplug the lead and a transceiver turned up to 100 W overdrives a PA that needs only 40 W: its peaks run past its rating and flatten, and the third order products rise into splatter. Better still, set the transceiver’s power control to the least the PA needs for full output.'
        ]
      },
      controls: ['audio', 'setp']
    }
  ],

  /*
   * Our own explanation of each answer. The question, its options and the
   * marked answer are the RSGB's and ship unadapted; the reasoning is ours.
   */
  answers: {
    '2025-Full398': {
      why: 'SSB carries its information in its amplitude, so the amplifier has to give a faithful, larger copy of it. A non-linear one makes harmonics of what goes in, and intermodulation that widens the signal. Option B is wrong: a linear amplifier is less efficient than class C, not more.',
      source: { from: ['3F2'] },
      seed: { toggle: 'one', drive: -10 },
      seedNote: 'Set the bench to a gentle drive on one tone: the output is nearly a copy and the harmonics are low. Then drive it harder.'
    },
    '2025-Full399': {
      why: 'A class C amplifier conducts for less than half of each cycle, so its output is badly distorted. That does no harm to a signal whose amplitude stays constant while it is on, which is true of FM and of CW, but it ruins SSB and AM, whose information is in the amplitude.',
      source: { from: ['3F2'] }
    },
    '2025-Full717': {
      why: 'Non-linearity makes two kinds of new frequency. Harmonics land far from the signal, where the low pass filter removes them. Intermodulation products land right beside it, inside the filter’s passband, so the filter cannot touch them, and they spread the signal over the neighbouring frequencies.',
      working: ['third order products at 2f1 &minus; f2 and 2f2 &minus; f1: for tones 1 kHz apart, 1 kHz either side',
                'the filter takes 0.0 dB off those, and about 48 dB off the harmonics near 28 MHz',
                'so what is left on air is a broad transmission causing adjacent band interference'],
      source: { eq: ['im3'], from: ['3F2'] },
      seed: { toggle: 'wide', drive: 6 },
      seedNote: 'Set the bench to an overdriven PA and the wide view. Compare what the filter does to the harmonics with what it does beside the signal.'
    },
    '2025-Full7785': {
      why: 'A curve that is not straight distorts each tone on its own, which makes harmonics, and mixes the two together, which makes intermodulation products. Both appear. Every new frequency is a whole number combination m f1 + n f2. Nothing makes a sub-harmonic such as f/2.',
      working: ['harmonics: 2 &times; f1, 3 &times; f1 and the same for f2',
                'intermodulation: m &times; f1 + n &times; f2, such as 2 &times; f1 &minus; f2',
                'so both harmonics and intermodulation products'],
      source: { eq: ['harm', 'order'], from: ['3F2'] },
      seed: { toggle: 'wide', drive: 3 },
      seedNote: 'The wide view shows the two tones, their intermodulation beside them, and the harmonic groups near 28 and 42 MHz.'
    },
    '2025-Full7787': {
      why: 'The new signal is a third order intermodulation product, made inside the amplifier because it is being driven into its bend. A filter on either side cannot remove it, because it is inside the 14 MHz band with the wanted signal. Reducing the drive moves the amplifier back towards the straight part of its curve, and once it is below the point where the peaks clip, the products fall 3 dB for every 1 dB less drive.',
      working: ['2f2 &minus; f1 = 2 &times; 14.102 &minus; 14.101',
                '= 14.103 MHz, a third order product, inside any 14 MHz filter',
                'so reduce the drive: a small attenuator on the input to the RF amplifier'],
      source: { eq: ['im3', 'slope'], from: ['3F2'] },
      seed: { toggle: 'two', a1: 1000, a2: 2000, drive: 6 },
      seedNote: 'Set the bench to tones at 14.101 and 14.102 MHz with too much drive. Then turn the drive down and watch the products at 14.100 and 14.103 MHz fall away faster than the tones.'
    },
    '2025-Full7788': {
      why: 'The same lines go in and come out, but the output has new, smaller lines spread evenly either side. Even spacing at the spacing of the input lines is the mark of intermodulation, made inside the amplifier by driving it too hard.',
      working: ['input: five lines; output: the same five plus smaller ones either side',
                'the new lines continue the spacing outwards: m f1 + n f2 with m + n = 1',
                'intermodulation products are being generated in the power amplifier'],
      source: { eq: ['order'], from: ['3F2'] },
      seed: { toggle: 'two', drive: 8 },
      seedNote: 'Set the bench to an overdriven PA close in. Two tones stand in for the five, and the new lines appear either side in the same way.'
    },
    '2025-Full402': {
      why: 'Its capacitors go to ground and its coil is in series, so the pi network is a low pass filter as well as a matching network. It passes the wanted frequency and takes the harmonics down.',
      working: ['at the design frequency the loss is 0 dB',
                'at the 2nd harmonic &minus;19.7 dB, at the 3rd &minus;31.5 dB',
                'so it helps to suppress harmonics'],
      source: { eq: ['loss'], from: ['3F3'] },
      seed: { toggle: 'pi', rpa: 12.5, fpi: 14.1e6 },
      seedNote: 'Read the losses at the second and third harmonics on the output network.'
    },
    '2025-Full403': {
      why: 'Capacitors from each end to ground and a coil in series between them: low frequencies pass along the coil, and high ones are shunted to ground by the capacitors. That is a low pass filter.',
      working: ['shunt C, series L, shunt C',
                'loss rises with frequency: 0 dB at the design frequency, about 20 dB at twice it',
                'so it is a low pass filter'],
      source: { eq: ['xc1', 'xl'], from: ['3F3'] },
      seed: { toggle: 'pi', rpa: 12.5, fpi: 14.1e6 },
      seedNote: 'Set the bench to the output network and look at the shape of the response: flat below the design frequency, falling above it.'
    },
    '2025-Full405': {
      why: 'The transistor needs to see a low resistance to give its power, and the aerial is 50 Ω. The output circuit transforms one into the other, and because it is a low pass network it filters the harmonics at the same time.',
      working: ['the transistor needs 12.5 &Omega;, the load is 50 &Omega;',
                'at the design frequency the network makes 50 &Omega; look like 12.5 &Omega;',
                'so filtering and impedance matching'],
      source: { from: ['3F3'] },
      seed: { toggle: 'pi', rpa: 12.5, fpi: 14.1e6 },
      seedNote: 'Drag across the response and read what the transistor sees: 12.5 Ω at the design frequency, something else away from it.'
    },
    '2025-Full408': {
      why: 'FM has a constant amplitude, so for the whole of the transmission it runs at its PEP: the average equals the peak. SSB speech and CW spend much of their time below it. (Slow scan TV sent through an SSB transmitter is a steady tone too and also runs near its peak, but the answer marked is FM, the mode whose amplitude never varies at all.)',
      working: ['SSB speech: average about 10% of PEP',
                'CW: about 50% of PEP, from the gaps between the elements',
                'frequency modulation: 100% of PEP, the greatest average'],
      source: { eq: ['par'], from: ['3F4'] },
      seed: { toggle: 'fm', pep: 100, proc: 0 },
      seedNote: 'Set the bench to FM: the average line sits on top of the peak.'
    },
    '2025-Full409': {
      why: 'The processor lifts the quieter parts of the speech while the peaks stay where they were. The average rises, and so does the heat in the PA.',
      working: ['plain speech: average about 10% of PEP',
                'processed by 10 dB: average about 41% of PEP',
                'an increase in average power'],
      source: { eq: ['lift'], from: ['3F4'] },
      seed: { toggle: 'ssb', proc: 10 },
      seedNote: 'Set the bench to SSB with the processor on, then drag it back to 0 dB and watch the average fall.'
    },
    '2025-Full410': {
      why: 'RTTY is frequency shift keying: the amplitude is constant, so the transmitter sits at its peak power the whole time it sends. Speech peaking at 100 W averages a small fraction of that, so the same peak on RTTY means several times the average power, and several times the heat.',
      working: ['SSB speech peaking at 100 W: average about 10 W',
                'RTTY peaking at 100 W: average 100 W, about 10 times as much',
                'so it will run considerably hotter than before'],
      source: { eq: ['par'], from: ['3F4'] },
      seed: { toggle: 'rtty', pep: 100, proc: 0 },
      seedNote: 'Set the bench to RTTY at 100 W, then switch to SSB speech and compare the averages.'
    },
    '2025-Full411': {
      why: 'Maximum compression lifts the average power a long way while the peaks, the PEP, stay the same. The PA has to get rid of heat in proportion to the average, so it runs considerably hotter.',
      working: ['plain speech: average about 10% of PEP',
                'processed by 15 dB: average about 48% of PEP',
                'about 4.6 times the average, so considerably hotter than before'],
      source: { eq: ['lift'], from: ['3F4'] },
      seed: { toggle: 'ssb', proc: 15 },
      seedNote: 'Set the bench to SSB with the processor at maximum, and compare the average with the processor at 0 dB.'
    },
    '2025-Full412': {
      why: 'Processing lifts the quiet parts of speech and holds the peaks, so the average signal rises while the peak does not. It does not reduce harmonics; clipping the audio makes more of them.',
      working: ['peak: unchanged at the PEP',
                'average with 10 dB of processing: about 3.9 times the plain average',
                'so it will increase the average signal strength'],
      source: { eq: ['lift'], from: ['3F4'] },
      seed: { toggle: 'ssb', proc: 10 },
      seedNote: 'Set the bench to SSB with the processor on and watch the gaps between the peaks fill in.'
    },
    '2025-Full3280': {
      why: 'ALC measures the output and turns the drive down when the PA would be pushed past the set level, so it is there to stop the PA being overdriven. Modulation depth, poor SWR and received audio are all handled by other circuits.',
      source: { from: ['3F5'] },
      seed: { toggle: 'on', audio: 9, setp: 100 },
      seedNote: 'Set the bench to too much audio with the ALC connected, then disconnect it and watch the peaks flatten.'
    },
    '2025-Full697': {
      why: 'The ALC loop cuts the drive whenever the output would go past the set level, which keeps the PA from being overdriven into distortion. It does not limit modulation depth, act on received audio, or respond to SWR.',
      source: { from: ['3F5'] },
      seed: { toggle: 'off', audio: 9, setp: 100 },
      seedNote: 'This shows the PA overdriven with no ALC. Connect the ALC and watch the peaks come back under control.'
    },
    '2025-Full413': {
      why: 'The loop holds the output peaks at the set level, so it limits the output power. The power control sets that level.',
      working: ['audio set 6 dB above the level that gives 100 W',
                'power control at 100 W: the ALC brings the drive down by 6.0 dB and the peaks sit at 100 W',
                'so the ALC limits the output power'],
      source: { eq: ['alc'], from: ['3F5'] },
      seed: { toggle: 'on', audio: 6, setp: 100 },
      seedNote: 'Set the bench to audio 6 dB too high with the power control at 100 W, then move the power control and watch the peaks follow it.'
    },
    '2025-Full415': {
      why: 'The external PA is the one that knows whether it is being overdriven, so it measures its own output and sends a control voltage back along the ALC lead to the transceiver, which reduces its drive. The signal goes from the PA to the transceiver, not the other way.',
      source: { from: ['3F5'] },
      seed: { toggle: 'ext', audio: 6, setp: 100 },
      seedNote: 'Set the bench to a transceiver at 100 W driving a PA that needs 40 W, with the ALC lead in. Then unplug the lead.'
    }
  },

  outro: {
    foundation: [
      'The PA is the last stage, and it lifts the signal to the power the aerial receives. And it needs the load it was built for: 50 Ω, matched, or the power comes back.'
    ],
    intermediate: [
      'Everything a PA puts out comes from its supply, and everything it does not put out as RF it turns into heat. RF out is the DC in times the efficiency; the efficiency is not on your formula sheet.'
    ],
    full: [
      'Drive is the thread through all of it. Past the bend the PA makes harmonics, which a filter can remove, and intermodulation beside the signal, which no filter can. The ALC is there to keep the drive below the bend, and the right amount of drive is the least that gives full output.',
      'How hard a PA works depends on its average power, not its PEP, and the mode and the speech processor set the average.'
    ]
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = BENCH;
if (typeof window !== 'undefined') window.BENCH = BENCH;
