/*
 * content/2I.js - Semiconductor devices.
 *
 * The flagship of the technical syllabus. Amplifier classes are usually shown
 * as three fixed pictures and a table of efficiencies. They are not three
 * things: they are one control, moved. Bias the device high and it conducts
 * for the whole cycle. Lower the bias and it starts switching off for part of
 * it, the efficiency climbs, and the harmonics arrive to pay for it.
 *
 * Nothing here quotes 50% or 78.5%. Those numbers are computed from the
 * Fourier coefficients of the truncated sine the device actually passes, so
 * the display derives what a textbook tabulates.
 */

const DC = window.DC;
const DSPI = window.DSP;
const FI = window.Fmt;
const MI = window.MNA;
// only the starting point now; the supply is a control, because worked
// designs are commonly built around a 10V rail and a reader ought to be able
// to follow one through on the bench
const VCC = 12;
const VBE = 0.6;              // the base to emitter drop of a conducting silicon junction

/*
 * The operating point, worked out the way the exam works it out: the divider
 * sets the base voltage, subtract the junction drop to get the emitter
 * voltage, and the emitter resistor turns that into the current.
 */
function bias(v) {
  const vb = (v.vcc || VCC) * v.r2 / (v.r1 + v.r2);
  const ve = Math.max(0, vb - VBE);
  const ie = ve / v.re;
  const ic = ie * v.beta / (v.beta + 1);
  const vce = (v.vcc || VCC) - ic * (v.rc + v.re);
  return { vb: vb, ve: ve, ic: ic, ib: ic / v.beta, vce: vce,
           conducting: vb > VBE };
}

/*
 * Each configuration as a netlist the solver can handle. The transistor is a
 * resistance from base to emitter plus a current from collector to emitter
 * proportional to the voltage across it, which is the standard small signal
 * model and needs exactly one R and one G.
 *
 * The bias resistors are in the netlist too. To a signal the supply rail is
 * ground, so both of them sit across the input, and leaving them out would
 * flatter the input impedance badly.
 */
// Big enough that its reactance where we solve is small beside the emitter
// resistor it bypasses. Drawn, and in the circuit, so that the reader can see
// where the signal current actually goes instead of having to assume it.
const BYPASS = 470e-6;

// The collector current is not quite independent of collector voltage, and
// that slope is the transistor's own output resistance. Leaving it out made
// every configuration show the collector resistor as its output impedance,
// which hides the one difference between them that matters.
const EARLY = 100;

function configCircuit(kind, d) {
  const re = 0.026 / Math.max(1e-6, d.ic);         // the emitter's own resistance
  const rpi = Math.max(1, d.beta * re);
  const gm = 1 / re;
  const ro = EARLY / Math.max(1e-6, d.ic);        // and its own output resistance
  const F = window.Fmt;
  const R1 = F.sci(d.r1), R2 = F.sci(d.r2), RC = F.sci(d.rc), RE = F.sci(d.re);
  const nl = {
    // RC is written rail to collector: on a positive half cycle the load
    // feeds current into the collector node, and writing it the other way
    // round reported the collector current 180 degrees out.
    ce: `V1 in 0 1\nRS in b 50\nR1 b 0 ${R1}\nR2 b 0 ${R2}\nRpi b e ${F.sci(rpi)}\nG1 c e b e ${F.sci(gm)}\nRO c e ${F.sci(ro)}\nRE e 0 ${RE}\nCE1 e 0 ${F.sci(BYPASS)}\nRC 0 c ${RC}`,
    cc: `V1 in 0 1\nRS in b 50\nR1 b 0 ${R1}\nR2 b 0 ${R2}\nRpi b e ${F.sci(rpi)}\nG1 0 e b e ${F.sci(gm)}\nRO 0 e ${F.sci(ro)}\nRE e 0 ${RE}`,
    cb: `V1 in 0 1\nRS in e 50\nR1 b 0 ${R1}\nR2 b 0 ${R2}\nCB b 0 ${F.sci(BYPASS)}\nRpi b e ${F.sci(rpi)}\nG1 c e b e ${F.sci(gm)}\nRO c e ${F.sci(ro)}\nRE e 0 ${RE}\nRC 0 c ${RC}`
  }[kind];
  return {
    netlist: nl,
    inNode: kind === 'cb' ? 'e' : 'b',
    outNode: kind === 'cc' ? 'e' : 'c',
    load: kind === 'cc' ? 'RE' : 'RC',
    re: re, rpi: rpi, gm: gm, ro: ro,
    // what the bias network adds to the input, and what the collector load
    // adds to the output. Dropping those lines leaves the transistor alone.
    biasParts: kind === 'cb' ? ['R1', 'R2', 'RE'] : ['R1', 'R2']
  };
}

/* Measured off the solved circuit, not quoted. */
function measure(kind, d) {
  const M = window.MNA;
  const spec = configCircuit(kind, d);
  const ckt = M.parseNetlist(spec.netlist);
  const s = M.solveAt(ckt, 1000);

  const vin = M.abs(M.nodeV(s, spec.inNode));
  const vout = M.nodeV(s, spec.outNode);
  const iin = M.abs(M.currentThrough(s, 'RS'));
  const iout = M.abs(M.currentThrough(s, spec.load));

  // output impedance: kill the input and drive the output with a volt
  const drop = (netlist, names) => netlist.split('\n')
    .filter(l => !names.includes(l.split(' ')[0])).join('\n');
  const zoutOf = (netlist) => {
    const killed = netlist.replace(/^V1 in 0 1/, 'V1 in 0 0') +
                   '\nVT ' + spec.outNode + ' 0 1';
    const sO = M.solveAt(M.parseNetlist(killed), 1000);
    return 1 / Math.max(1e-12, M.abs(M.currentThrough(sO, 'VT')));
  };
  const zinOf = (netlist) => {
    const si = M.solveAt(M.parseNetlist(netlist), 1000);
    return M.abs(M.nodeV(si, spec.inNode)) /
           Math.max(1e-15, M.abs(M.currentThrough(si, 'RS')));
  };
  const zout = zoutOf(spec.netlist);

  // The resistances of the transistor itself are one thing and the loaded
  // figures another: circuit values modify them. Take the bias network off
  // and the load off the output, and what is left is the transistor's own.
  const zinDevice = zinOf(drop(spec.netlist, spec.biasParts));
  const zoutDevice = zoutOf(drop(spec.netlist, [spec.load]));

  const meta = {
    ce: { name: 'Common emitter',
          uses: 'The general purpose amplifier, wherever you want gain from a single device.',
          issue: 'It inverts, and the bias resistors sit across its input and drag the input impedance down.' },
    cc: { name: 'Emitter follower',
          uses: 'Driving a demanding load, or buffering a high impedance source so the next stage does not load it.',
          issue: 'No voltage gain at all. It cannot make a signal larger, only stronger.' },
    cb: { name: 'Common base',
          uses: 'VHF and above, where it stays stable at frequencies that would have a common emitter stage oscillating.',
          issue: 'A very low input impedance, so it loads whatever is driving it.' }
  }[kind];

  return Object.assign({
    circuit: ckt, spec: spec,
    zin: vin / Math.max(1e-15, iin),
    zout: zout,
    zinDevice: zinDevice,
    zoutDevice: zoutDevice,
    av: M.abs(vout) / Math.max(1e-15, vin),
    ai: iout / Math.max(1e-15, iin),
    // against the input node, not against the source, so that the small shift
    // through the coupling network does not leak into the figure
    phase: Math.round(Math.abs(((M.arg(vout) - M.arg(M.nodeV(s, spec.inNode))) *
      180 / Math.PI + 540) % 360 - 180))
  }, meta);
}

/*
 * The circuits as they are really built: a divider on the base, a collector
 * load, an emitter resistor, and a coupling capacitor at each end so that
 * whatever is connected outside cannot disturb the bias inside.
 *
 * Transistor centred at (180, 140), so base (150, 140), collector (192, 108),
 * emitter (192, 172). Every component terminal lands on a wire end or another
 * terminal; the layout checker enforces that, which is how the gaps in the
 * first version of these were found.
 */
function configLayout(kind) {
  const Q = { name: 'Q1', type: 'Q', at: [180, 140], label: '' };
  const supply = { at: [156, 12], label: '+V' };
  const W = 320, H = 268;

  // R1 from the rail to the base node, R2 from there to ground
  const R1 = { name: 'R1', type: 'R', at: [120, 48], rot: 270, label: 'R1', labelAt: 'left' };
  const R2 = { name: 'R2', type: 'R', at: [120, 170], rot: 90, label: 'R2', labelAt: 'left' };
  const RE = { name: 'RE', type: 'R', at: [192, 202], rot: 90, label: 'RE' };
  const RC = { name: 'RC', type: 'R', at: [192, 48], rot: 90, label: 'RC' };

  const rail = [120, 18, 192, 18, 'R1'];
  // nothing is connected to the output, so no signal current leaves through
  // C2 and the gain figures are the open circuit ones
  const openOutput = y => [[192, y, 220, y, '-'], [280, y, 292, y, '-']];
  const dividerWires = [
    [120, 78, 120, 140, 'R1'],          // R1 down to the base node
    [120, 140, 150, 140, 'Rpi'],        // into the base, at base current
    [120, 200, 120, 250, 'R2'],         // R2 down to the ground rail
    [120, 250, 192, 250, 'R2']
  ];

  if (kind === 'cc') {
    // emitter follower: collector to the rail, output from the emitter
    return {
      w: W, h: H,
      elements: [Q, R1, R2, RE,
        { name: 'C1', type: 'C', at: [90, 140], label: 'C1', flow: 'RS' },
        { name: 'C2', type: 'C', at: [250, 172], label: 'C2', flow: '-' }],
      wires: [rail].concat(dividerWires, openOutput(172), [
        [192, 18, 192, 108, 'G1'],
        [192, 232, 192, 250, 'RE']]),
      grounds: [[156, 250]],
      terminals: [{ at: [60, 140], label: 'in', align: 'right' },
                  { at: [292, 172], label: 'out' }, supply]
    };
  }

  if (kind === 'cb') {
    // common base: driven at the emitter, base held at signal ground by CB
    return {
      w: W, h: H,
      elements: [Q, R1, R2, RC, RE,
        { name: 'CB', type: 'C', at: [90, 170], rot: 90, label: 'CB', labelAt: 'left' },
        { name: 'C2', type: 'C', at: [250, 108], label: 'C2', flow: '-' }],
      wires: [rail].concat(dividerWires, openOutput(108), [
        [120, 140, 90, 140, 'CB'],      // the bypass sits across R2
        [90, 200, 120, 200, 'CB'],
        [192, 78, 192, 108, 'RC'],
        [60, 190, 192, 190, 'RS'],      // in, up to the emitter
        [192, 190, 192, 172, 'RS'],
        [192, 232, 192, 250, 'RE']]),
      grounds: [[156, 250]],
      terminals: [{ at: [60, 190], label: 'in', align: 'right' },
                  { at: [292, 108], label: 'out' }, supply]
    };
  }

  // common emitter: the standard stage
  return {
    w: W, h: H,
    elements: [Q, R1, R2, RC, RE,
      { name: 'C1', type: 'C', at: [90, 140], label: 'C1', flow: 'RS' },
      { name: 'C2', type: 'C', at: [250, 108], label: 'C2', flow: '-' },
      // the emitter bypass. Until this was drawn the sums assumed a part that
      // was not on the page, and showed a gain the circuit as drawn could not
      // produce.
      { name: 'CE1', type: 'C', at: [244, 202], rot: 90, label: 'CE' }],
    wires: [rail].concat(dividerWires, openOutput(108), [
      [192, 78, 192, 108, 'RC'],
      [192, 172, 244, 172, 'CE1'],
      [244, 232, 244, 250, 'CE1'],
      [244, 250, 192, 250, 'CE1'],
      [192, 232, 192, 250, 'RE']]),
    grounds: [[156, 250]],
    terminals: [{ at: [60, 140], label: 'in', align: 'right' },
                { at: [292, 108], label: 'out' }, supply]
  };
}

/*
 * Where a diode actually sits when it is fed through a resistor.
 *
 * The supply has to divide between the resistor and the diode, and the diode
 * takes whatever voltage corresponds to the current flowing. There is no
 * closed form for that, so bisect on the current until the two agree. This is
 * the calculation behind every "what current flows in this diode" question.
 */
/*
 * A Zener as it is actually wired: fed from the supply through a series
 * resistor, reverse biased, holding its rated voltage. The slope resistance
 * is what stops it being a perfect reference, so the held voltage creeps up
 * a little as the current through it rises.
 */
const ZENER_SLOPE = 5;

function zenerOperating(vsupply, r, vz) {
  if (vsupply <= vz) return { i: 0, vd: vsupply, vr: 0, p: 0 };
  const i = (vsupply - vz) / (r + ZENER_SLOPE);
  const v = vz + i * ZENER_SLOPE;
  return { i: i, vd: v, vr: i * r, p: v * i };
}

function diodeOperating(vsupply, r, opts) {
  let lo = 0, hi = vsupply / r;
  for (let k = 0; k < 60; k++) {
    const i = (lo + hi) / 2;
    const vd = window.DC.diodeVoltage(i, opts);
    if (vd + i * r < vsupply) lo = i; else hi = i;
  }
  const i = (lo + hi) / 2;
  return { i: i, vd: window.DC.diodeVoltage(i, opts), vr: i * r };
}

/* The diode in the circuit the questions describe: supply, resistor, diode. */
/*
 * The varicap as it is actually used: a coil with the diode across it, fed
 * with a control voltage through a resistor big enough not to damp the tuned
 * circuit. Reverse bias widens the depletion layer, the capacitance falls,
 * and the resonant frequency rises.
 */
const VARICAP_C0 = 62e-12;    // capacitance with no reverse voltage on it
const VARICAP_VJ = 0.7;       // the junction voltage it scales against
const VARICAP_L = 4.7e-6;     // the coil we tune, held fixed so one thing moves

function varicapC(vr) {
  return VARICAP_C0 / Math.sqrt(1 + Math.max(0, vr) / VARICAP_VJ);
}

function varicapF(vr) {
  return 1 / (2 * Math.PI * Math.sqrt(VARICAP_L * varicapC(vr)));
}

function varicapNetlist(c) {
  const F = window.Fmt;
  return 'V1 in 0 1\nR1 in a 47000\nL1 a 0 ' + F.sci(VARICAP_L) +
         '\nC1 a 0 ' + F.sci(c);
}

function varicapLayout(c) {
  return {
    w: 280, h: 200,
    elements: [
      { name: 'V1', type: 'V', at: [30, 100], rot: 90, label: 'control' },
      { name: 'R1', type: 'R', at: [90, 70], label: 'R' },
      { name: 'L1', type: 'L', at: [170, 100], rot: 90, label: 'L' },
      { name: 'D1', type: 'DV', at: [240, 100], rot: 90, label: 'varicap',
        labelAt: 'left', flow: 'C1' }
    ],
    wires: [[30, 70, 60, 70, 'R1'], [120, 70, 170, 70, 'L1'],
            [170, 70, 240, 70, 'C1'], [240, 130, 170, 130, 'C1'],
            [170, 130, 30, 130, 'L1']],
    grounds: [[100, 130]]
  };
}

function diodeLayout(zener) {
  return {
    w: 250, h: 200,
    elements: [
      { name: 'V1', type: 'V', at: [30, 100], rot: 90, label: 'supply' },
      { name: 'RC', type: 'R', at: [110, 70], label: 'R' },
      { name: 'D1', type: zener ? 'DZ' : 'D', at: [190, 100], rot: 90,
        label: zener ? 'Zener' : 'D' }
    ],
    wires: [[30, 70, 80, 70, 'RC'], [140, 70, 190, 70, 'RC'],
            [190, 130, 30, 130, 'RC']],
    grounds: [[110, 130]]
  };
}


const BENCH = {
  group: '2I',
  title: 'Semiconductor devices',
  pageTitle: 'Semiconductor Bench',
  levels: ['intermediate', 'full'],
  circuitBased: true,

  /** Every circuit this bench draws, for the layout checker. */
  allLayouts: () => {
    // the checkers need the circuit as well as the drawing, so that every
    // conductor can be traced back to a current something actually solves for
    const start = {};
    BENCH.controls.forEach(c => { start[c.id] = c.start; });
    const d = BENCH.derive(start);
    return [
      { name: 'common emitter', layout: configLayout('ce'),
        netlist: configCircuit('ce', d).netlist },
      { name: 'emitter follower', layout: configLayout('cc'),
        netlist: configCircuit('cc', d).netlist },
      { name: 'common base', layout: configLayout('cb'),
        netlist: configCircuit('cb', d).netlist },
      { name: 'diode', layout: diodeLayout(false), netlist: 'series' },
      { name: 'zener', layout: diodeLayout(true), netlist: 'series' },
      { name: 'varicap', layout: varicapLayout(60e-12), netlist: varicapNetlist(60e-12) }
    ];
  },
  bank: {
    url: 'https://rsgb.services/public/exams/eqdb/',
    topic: '2I - Semiconductor devices',
    note: 'Full level only. Choose the topic from the Filter by Topic list.'
  },

  intro: {
    intermediate: [
      'A diode lets current one way. A transistor lets a small current control a large one. Almost everything else in a radio is built out of those two facts.',
      'The controls along the top are the parts of one circuit, drawn beside every panel below so you can always see what they refer to. R1 and R2 divide the supply down to set the base voltage, RE turns that into a current, RC turns the current back into an output voltage, and beta is the transistor itself. On the first panel only R matters, because a diode has no base to bias.',
      'Move them and watch the operating point travel, because where a device sits before the signal arrives decides what it does to the signal when it turns up.'
    ],
    full: [
      'Where you bias a device is the single most consequential decision you make about it. Sit it halfway up and it reproduces the signal faithfully and wastes half the supply doing so. Sit it lower and it starts switching off for part of every cycle, which is more efficient and less faithful.',
      'That trade is what amplifier classes are. They are not four different circuits, they are one bias setting moved, and this bench lets you move it and watch A become AB, then B, then C.',
      'The controls along the top are the parts of that circuit, and it is drawn beside every panel: R1 and R2 set the base voltage between them, RE fixes the current, RC turns it back into voltage, and beta is the device.'
    ]
  },


  /*
   * Read before this bench was designed. Our own summary of what each source
   * insists on; no wording from any of them appears here or in the bench.
   */
  sources: {
    read: [
      'Foundation licence manual, semiconductors',
      'Intermediate licence manual, transistors in circuits',
      'Exam Secrets, transistors and amplifiers at Foundation, Intermediate and Full',
      'Syllabus 2019 per-level specifications, items 2I1 to 2I6'
    ],
    keyMessages: [
      { at: '2I1', level: 'intermediate',
        point: 'a junction conducts one way once the barrier is overcome, at about 0.6 V' },
      { at: '2I1', level: 'intermediate',
        point: 'the drop across a conducting diode must be subtracted before Ohm law on the resistor' },
      { at: '2I1', level: 'full',
        point: 'a Zener is used reverse biased and holds its voltage past the knee' },
      { at: '2I2', level: 'intermediate',
        point: 'a reverse biased junction is a capacitor whose value the voltage sets' },
      { at: '2I3', level: 'intermediate',
        point: 'a small base current controls a much larger collector current, and beta is the ratio' },
      { at: '2I3', level: 'intermediate',
        point: 'push it far enough and the collector current is limited only by the load: a switch' },
      { at: '2I3', level: 'intermediate',
        point: 'coupling capacitors keep whatever is connected outside from disturbing the bias' },
      { at: '2I3', level: 'full',
        point: 'the operating point wants the middle of the range so the signal has room both ways' },
      { at: '2I4', level: 'intermediate',
        point: 'the collector should sit at half the supply for the largest undistorted swing' },
      { at: '2I4', level: 'full',
        point: 'common emitter inverts and gives both gains; follower gives current only; common base voltage only' },
      { at: '2I4', level: 'full',
        point: 'class is a choice of bias, and the conduction angle follows from it' },
      { at: '2I4', level: 'full',
        point: 'class A is the most faithful and least efficient, and produces fewest harmonics' },
      { at: '2I4', level: 'full',
        point: 'class C draws nothing until driven, is highly non-linear, and needs a tuned load' },
      { at: '2I4', level: 'full',
        point: 'amplitude carrying modes need linearity; CW and FM do not' },
      { at: '2I5', level: 'intermediate',
        point: 'an amplifier feeding part of its output back keeps a tuned circuit ringing' },
      { at: '2I5', level: 'full',
        point: 'gain must cover the loss and the phase round the loop must come back to zero' },
      { at: '2I6', level: 'intermediate',
        point: 'an integrated circuit sells you a function rather than a device' }
    ]
  },

  controls: [
    { id: 'vcc', label: 'Supply', unit: 'V', range: [5, 24], start: 12, linear: true,
      desc: 'The rail the stage runs from. Worked designs often use 10 V' },
    { id: 'r1', label: 'R1', unit: 'Ω', range: [10e3, 470e3], start: 200e3,
      desc: 'Upper bias resistor, from the supply to the base' },
    { id: 'r2', label: 'R2', unit: 'Ω', range: [1e3, 100e3], start: 33e3,
      desc: 'Lower bias resistor, base to ground. With R1 it sets the base voltage' },
    { id: 'rc', label: 'RC', unit: 'Ω', range: [220, 22000], start: 4700,
      desc: 'Collector load. Turns collector current into output voltage' },
    { id: 're', label: 'RE', unit: 'Ω', range: [10, 4700], start: 1000,
      desc: 'Emitter resistor. Sets the current, and steadies it against temperature' },
    { id: 'beta', label: 'beta', unit: '', range: [20, 400], start: 200,
      desc: 'Current gain of the transistor, collector current over base current' },
    { id: 'drive', label: 'Drive', unit: 'V', range: [0.001, 0.5], start: 0.01,
      desc: 'Peak of the signal arriving at the base, in volts' }
  ],

  derive: (v) => {
    const b = bias(v);
    const ll = DC.loadLine(v.vcc || VCC, v.rc + v.re);
    // How far the base sits above the point it starts conducting, measured in
    // volts, against the peak of the drive. That ratio is what decides how
    // much of each cycle the device is switched on for.
    const headroom = b.vb - VBE;
    const theta = DC.conductionAngle(headroom, v.drive);
    const perf = DC.classPerformance(theta);
    return {
      vcc: v.vcc || VCC, r1: v.r1, r2: v.r2, rc: v.rc, re: v.re,
      beta: v.beta, drive: v.drive,
      vb: b.vb, ve: b.ve, ic: b.ic, icq: b.ic, ib: b.ib, vce: b.vce, vceq: b.vce,
      conducting: b.conducting, headroom: headroom,
      iMax: ll.iMax,
      theta: theta, thetaDeg: theta * 180 / Math.PI,
      cls: DC.classOf(theta),
      eff: perf.efficiency, a0: perf.a0, a1: perf.a1,
      f0: 0
    };
  },

  equations: {
    load: { given: false, name: 'The load line',
            eq: 'I<sub>C</sub> = (V<sub>CC</sub> &minus; V<sub>CE</sub>) / R<sub>C</sub>',
            work: d => ['(<b>' + d.vcc + ' V</b> &minus; 0) / <b>' + FI.eng(d.rc, 'Ω', 3) + '</b> at one end',
                        FI.eng(d.iMax, 'A', 3) + ' with the collector at zero'] },
    mid:  { given: false, name: 'Collector resistor for a mid point bias',
            eq: 'R<sub>C</sub> = (V<sub>CC</sub> / 2) / I<sub>C</sub>',
            work: d => ['(<b>' + d.vcc + ' V</b> / 2) / <b>' + FI.eng(d.icq, 'A', 3) + '</b>',
                        FI.eng(d.icq > 0 ? (d.vcc / 2) / d.icq : 0, 'Ω', 4)] },
    divider: { given: true, name: 'The bias divider',
               eq: 'V<sub>B</sub> = V<sub>CC</sub> &times; R2 / (R1 + R2)',
               work: d => ['<b>' + d.vcc + ' V</b> &times; <b>' + FI.eng(d.r2, 'Ω', 3) +
                           '</b> / (<b>' + FI.eng(d.r1, 'Ω', 3) + '</b> + <b>' +
                           FI.eng(d.r2, 'Ω', 3) + '</b>)',
                           FI.trim(d.vb, 3) + ' V at the base'] },
    emitter: { given: false, name: 'What the emitter resistor sets',
               eq: 'I<sub>E</sub> = (V<sub>B</sub> &minus; 0.6) / R<sub>E</sub>',
               work: d => ['(<b>' + FI.trim(d.vb, 3) + ' V</b> &minus; 0.6 V) / <b>' +
                           FI.eng(d.re, 'Ω', 3) + '</b>',
                           FI.eng(d.ic, 'A', 3)] },
    zpower: { given: true, name: 'Power the Zener has to get rid of',
              eq: 'P = V<sub>Z</sub> &times; I',
              work: d => {
                const vz = 5.1, i = Math.max(0, (d.vcc - vz) / (d.rc + 5));
                return ['<b>' + vz + ' V</b> &times; <b>' + FI.eng(i, 'A', 3) + '</b>',
                        FI.eng(vz * i, 'W', 3) + ' turned into heat in the diode'];
              } },
    zseries: { given: true, name: 'The resistor that sets the Zener current',
               eq: 'R = (V<sub>supply</sub> &minus; V<sub>Z</sub>) / I',
               work: d => {
                 const vz = 5.1, i = Math.max(1e-9, (d.vcc - vz) / (d.rc + 5));
                 return ['(<b>' + d.vcc + ' V</b> &minus; <b>' + vz + ' V</b>) / <b>' +
                         FI.eng(i, 'A', 3) + '</b>',
                         FI.eng((d.vcc - vz) / i, 'Ω', 3)];
               } },
    beta: { given: true, name: 'Current gain', eq: 'I<sub>C</sub> = &beta; &times; I<sub>B</sub>',
            work: d => ['<b>' + FI.trim(d.beta, 3) + '</b> &times; <b>' + FI.eng(d.ib, 'A', 3) + '</b>',
                        FI.eng(d.icq, 'A', 3)] },
    theta: { given: false, name: 'How much of the cycle it conducts for',
             eq: '&theta; = 360&deg; for A, 180&deg; for B, less for C',
             work: d => ['at this bias and drive',
                         FI.trim(d.thetaDeg, 4) + '&deg;, which is class ' + d.cls] },
    eff:  { given: false, name: 'Efficiency',
            eq: '&eta; = RF power out / DC power in',
            work: d => ['from the shape of the current pulse',
                        FI.trim(d.eff * 100, 3) + '%'] },
    diss: { given: false, name: 'What the transistor has to get rid of',
            eq: 'P = V<sub>CE</sub> &times; I<sub>C</sub>',
            work: d => ['<b>' + FI.trim(d.vceq, 3) + ' V</b> &times; <b>' + FI.eng(d.icq, 'A', 3) + '</b>',
                        FI.eng(Math.max(0, d.vceq) * d.icq, 'W', 3)] }
  },

  terms: {
    'forward bias': 'A voltage applied the way round that lets a diode conduct.',
    'reverse bias': 'A voltage applied the other way round, which a diode blocks until its breakdown point.',
    'depletion layer': 'The region either side of a diode junction with no free charge in it. Forward bias shrinks it and lets current through.',
    'Zener diode': 'A diode built to break down at a chosen reverse voltage and hold there, which makes it useful as a voltage reference.',
    'bias': 'The steady voltages and currents applied to a device to put it where you want it before any signal arrives.',
    'operating point': 'Where a device sits on its load line with no signal applied. Also called the quiescent point.',
    'load line': 'The straight line of every collector voltage and current the load resistor allows. The operating point is somewhere on it.',
    'saturation': 'The state where a transistor is passing as much current as the load permits and the collector can fall no further.',
    'cut off': 'The state where a transistor passes no current at all.',
    'conduction angle': 'How much of each input cycle the device is actually conducting for, measured in degrees.',
    'class A': 'Biased so the device conducts for the whole cycle. Most faithful, least efficient, at best 50%.',
    'class B': 'Biased at cut off, so it conducts for half the cycle. At best 78.5% efficient, but one device alone distorts badly.',
    'class AB': 'Biased between A and B, conducting for more than half the cycle but less than all of it. The usual compromise for SSB.',
    'class C': 'Biased below cut off, conducting for well under half the cycle. Efficient, and only usable where a tuned circuit can restore the waveform.',
    'feedback': 'Returning part of the output to the input. Enough of it, in the right phase, and an amplifier becomes an oscillator.'
  },

  panels: {
    /*
     * What the base current does to the collector current, across the whole
     * range. In the middle the collector follows at beta times the base, which
     * is amplification. Push far enough and it flattens against the most the
     * circuit can supply, which is saturation, and at the other end it is off
     * altogether. Amplifier and switch are the same curve at different places.
     */
    transfer(ctx) {
      const { p, d, t, Plot, swatch, ro, Fmt } = ctx;
      const { eng, trim } = Fmt;

      const iMax = (d.vcc - 0.2) / (d.rc + d.re);      // most the circuit can pass
      const ibFull = iMax / d.beta;                    // base current that gets there
      const ibMax = Math.max(ibFull * 1.6, d.ib * 2.2);

      const pts = [], ideal = [];
      for (let i = 0; i <= 400; i++) {
        const ib = ibMax * i / 400;
        pts.push({ x: ib, y: Math.min(d.beta * ib, iMax) });
        ideal.push({ x: ib, y: d.beta * ib });
      }
      const spec = {
        xRange: [0, ibMax], xFmt: x => eng(x, 'A', 2), tokens: t,
        left: { max: iMax * 1.15, fmt: y => eng(y, 'A', 2) },
        traces: [{ pts: ideal, colour: t.faint, axis: 'left', width: 1.2 },
                 { pts: pts, colour: t.trace, fill: t.fill, axis: 'left', width: 2.4 }],
        marks: [{ x: ibFull, colour: t.marker }],
        cursor: { x: Math.min(d.ib, ibMax), colour: t.phase,
                  dot: { y: Math.min(d.beta * d.ib, iMax), axis: 'left' },
                  label: 'where it is biased' }
      };
      Plot.draw(p.graph, spec);
      p.legend.innerHTML = swatch(t.trace, 'Collector current') +
        swatch(t.faint, 'What beta alone would give') +
        swatch(t.marker, 'Saturated beyond here') +
        swatch(t.phase, 'The operating point');

      const state = d.ib <= 0 ? 'cut off, no current at all'
        : (d.beta * d.ib >= iMax ? 'saturated, a closed switch'
                                 : 'amplifying, on the straight part');
      p.readouts.innerHTML = ro([
        ['Base current', eng(d.ib, 'A', 3)],
        ['Collector current', eng(d.ic, 'A', 3)],
        ['That is beta times', trim(d.beta, 3) + ' larger'],
        ['State', state, d.beta * d.ib >= iMax]
      ]);
      if (p.schemNote) p.schemNote.textContent = 'the stage the controls are setting up';
      p.fAnim = 1000;
      const ck = configCircuit('ce', d);
      return { layout: configLayout('ce'), circuit: MI.parseNetlist(ck.netlist) };
    },

    /*
     * 2I4 at Full covers two things: the three configurations and the classes.
     * The toggle picks which one you are looking at; the prose walks through
     * the configurations first and then the classes.
     */
    amp(ctx) {
      if (ctx.p.topology === 'classes') return BENCH.panels.classes(ctx);
      const { p, d, t, Plot, swatch, ro, Fmt } = ctx;
      const { eng, trim } = Fmt;
      const cfg = measure(p.topology, d);

      /*
        * Both traces in real volts, on their own axes: input on the right,
        * output on the left. Normalising them both to fit made the axis
        * meaningless and hid the gain, which is the one thing worth seeing.
        */
      const vin = d.drive;
      const vout = vin * cfg.av;
      // How far the output can actually swing before it runs into the supply
      // at one end or saturation at the other. A small signal model does not
      // know about either, so it will cheerfully report 39 V from a 12 V rail.
      const limit = p.topology === 'cc'
        ? Math.max(0.05, Math.min(d.ve, d.vcc - d.ve))
        : Math.max(0.05, Math.min(Math.max(0, d.vce - 0.2), d.vcc - d.vce));
      const clipped = vout > limit;
      const span = Math.min(vout, limit);
      const inPts = [], outPts = [];
      for (let i = 0; i <= 400; i++) {
        const cyc = 2 * i / 400;
        const sn = Math.sin(2 * Math.PI * cyc);
        inPts.push({ x: cyc, y: vin * sn });
        const raw = vout * sn * (cfg.phase ? -1 : 1);
        outPts.push({ x: cyc, y: Math.max(-limit, Math.min(limit, raw)) });
      }
      // and the same two signals as currents, which is where the difference
      // between these three configurations really shows
      const iin = vin / Math.max(1e-9, cfg.zin);
      const iout = iin * cfg.ai;
      const inI = [], outI = [];
      for (let i = 0; i <= 400; i++) {
        const cyc = 2 * i / 400;
        const sn = Math.sin(2 * Math.PI * cyc);
        inI.push({ x: cyc, y: iin * sn });
        // base and collector current rise and fall together. It is the
        // collector voltage that inverts, because more current means more
        // drop across the load.
        outI.push({ x: cyc, y: iout * sn });
      }

      /*
        * Each trace on its own axis, the way a scope gives each channel its
        * own volts per division. Sharing one axis buried the input: at a gain
        * of nearly two hundred it was a flat line on the zero, so the
        * inversion had nothing to be seen against.
        */
      const vOutSpan = Math.max(span, 1e-9) * 1.2;
      const vInSpan = Math.max(vin, 1e-9) * 1.2;
      Plot.draw(p.graph, {
        xRange: [0, 2], xFmt: x => trim(x, 2) + ' cyc', tokens: t,
        band: [0, 0.46], hideX: true,
        left: { min: -vOutSpan, max: vOutSpan, fmt: y => eng(y, 'V', 2) },
        right: { min: -vInSpan, max: vInSpan, fmt: y => eng(y, 'V', 2) },
        traces: [{ pts: outPts, colour: t.trace, axis: 'left', width: 2.6 },
                 { pts: inPts, colour: t.phase, axis: 'right', width: 1.3 }],
        cursor: null
      });
      const iOutSpan = Math.max(iout, 1e-12) * 1.2;
      const iInSpan = Math.max(iin, 1e-12) * 1.2;
      Plot.draw(p.graph, {
        xRange: [0, 2], xFmt: x => trim(x, 2) + ' cyc', tokens: t,
        band: [0.54, 1], append: true,
        left: { min: -iOutSpan, max: iOutSpan, fmt: y => eng(y, 'A', 2) },
        right: { min: -iInSpan, max: iInSpan, fmt: y => eng(y, 'A', 2) },
        traces: [{ pts: outI, colour: t.trace, axis: 'left', width: 2.6 },
                 { pts: inI, colour: t.phase, axis: 'right', width: 1.3 }],
        cursor: null
      });
      const sameV = Math.abs(cfg.av - 1) < 0.15;
      const sameI = Math.abs(cfg.ai - 1) < 0.15;
      // name the scale on each channel, so that two traces the same height on
      // screen are read as the gain figure they are and not as the same size
      p.legend.innerHTML =
        swatch(t.phase, 'In, right scale: \u00b1' + eng(vin, 'V', 2) +
               ' and \u00b1' + eng(iin, 'A', 2)) +
        swatch(t.trace, 'Out, left scale: \u00b1' + eng(span, 'V', 2) +
               ' and \u00b1' + eng(iout, 'A', 2)) +
        '<span>upper: volts &nbsp; lower: amps &nbsp; each trace on its own scale</span>' +
        (cfg.phase > 90 ? swatch(t.marker, 'Output inverted, it falls as the input rises') : '') +
        (sameV ? '<span>the two voltage traces sit on each other: gain of one</span>' : '') +
        (sameI ? '<span>the two current traces sit on each other: gain of one</span>' : '');

      p.readouts.innerHTML = ro([
        ['Input impedance of the stage', eng(cfg.zin, 'Ω', 3), p.topology === 'cb'],
        ['of the transistor alone', eng(cfg.zinDevice, 'Ω', 3)],
        ['Output impedance of the stage', eng(cfg.zout, 'Ω', 3), p.topology === 'cc'],
        ['of the transistor alone', eng(cfg.zoutDevice, 'Ω', 3)],
        ['Voltage gain', cfg.av < 1.5 ? trim(cfg.av, 3) : '×' + trim(cfg.av, 3)],
        ['Current gain', trim(cfg.ai, 3)],
        ['Phase change', cfg.phase + '°, ' +
          (cfg.phase > 90 ? 'inverted' : 'in phase'), cfg.phase > 90],
        ['Signal current in', eng(iin, 'A', 3)],
        ['Signal current out', eng(iout, 'A', 3)],
        ['Output swing', eng(vout, 'V', 3) + ' wanted, ' + eng(limit, 'V', 3) +
         ' available' + (clipped ? ', so it flattens' : ''), clipped]
      ]);
      p.fAnim = 1000;
      return { layout: configLayout(p.topology), circuit: cfg.circuit };
    },

    /** Diode curve, with the operating point where the cursor is. */
    diode(ctx) {
      const { p, d, t, level, Plot, swatch, ro, Fmt } = ctx;
      const { eng, trim } = Fmt;
      const zener = level === 'full' ? 5.1 : null;
      const pts = [];
      const vLo = zener ? -7 : -1, vHi = 0.9;
      for (let i = 0; i <= 500; i++) {
        const v = vLo + (vHi - vLo) * i / 500;
        const i_ = DC.diodeCurrent(v, zener ? { zener: zener } : {});
        pts.push({ x: v, y: Math.max(-0.03, Math.min(0.03, i_)) });
      }
      // where it really sits when fed from the supply through R
      // reverse biased for the Zener, forward biased for the plain diode
      const op = zener ? zenerOperating(d.vcc, d.rc, zener)
                       : diodeOperating(d.vcc, d.rc, {});
      const sits = zener ? -op.vd : op.vd;
      const fc = p.cursor === null ? sits : vLo + (vHi - vLo) * p.cursor;
      const ic = DC.diodeCurrent(fc, zener ? { zener: zener } : {});
      const spec = {
        xRange: [vLo, vHi], xFmt: v => trim(v, 2) + ' V', tokens: t,
        left: { min: -0.03, max: 0.03, fmt: y => eng(y, 'A', 2) },
        traces: [{ pts: pts, colour: t.trace, axis: 'left', width: 2.2 }],
        marks: zener ? [{ x: -zener, colour: t.marker }] : [],
        cursor: { x: fc, colour: t.marker, label: trim(fc, 3) + ' V' }
      };
      Plot.draw(p.graph, spec);
      p.legend.innerHTML = swatch(t.trace, 'Current through the diode') +
        swatch(t.marker, zener ? 'Breakdown, ' + zener + ' V' : 'Where the circuit puts it');
      if (p.schemNote) {
        p.schemNote.textContent = zener
          ? 'R here is the RC slider. It sets the current through the Zener, ' +
            'and the Zener holds its voltage whatever that current is.'
          : 'R here is the RC slider. It is the only control that changes ' +
            'anything on this panel: it sets the current, and the diode then ' +
            'takes whatever voltage goes with it.';
      }
      p.readouts.innerHTML = ro(zener ? [
        ['Supply', trim(d.vcc, 3) + ' V'],
        ['Across the resistor', trim(op.vr, 3) + ' V'],
        ['Held across the Zener', trim(op.vd, 3) + ' V', true],
        ['Current through both', eng(op.i, 'A', 3)],
        ['Power in the Zener', eng(op.p, 'W', 3) +
          (op.p > 0.4 ? ', more than a 400 mW diode will take' : ', within a 400 mW diode'),
         op.p > 0.4],
        ['At the cursor', trim(fc, 3) + ' V, ' +
          eng(Math.max(-0.03, Math.min(0.03, ic)), 'A', 2)]
      ] : [
        ['Supply', trim(d.vcc, 3) + ' V'],
        ['Across the resistor', trim(op.vr, 3) + ' V'],
        ['Across the diode', trim(op.vd, 3) + ' V'],
        ['Current through both', eng(op.i, 'A', 3), true],
        ['At the cursor', trim(fc, 3) + ' V, ' +
          eng(Math.max(-0.03, Math.min(0.03, ic)), 'A', 2)]
      ]);
      return { layout: diodeLayout(zener) };
    },

    /**
     * The varicap. One curve for what the control voltage does to the
     * capacitance, and one for what that does to the frequency, because the
     * capacitance on its own does not tell anyone why the device matters.
     */
    varicap(ctx) {
      const { p, t, Plot, swatch, ro, Fmt } = ctx;
      const { eng, trim } = Fmt;
      // a real varicap is swept well into the tens of volts, which is
      // where most of the capacitance change happens
      const vLo = 0, vHi = 40;
      const vr = vLo + (vHi - vLo) * (p.cursor === null || p.cursor === undefined
        ? 0.15 : p.cursor);
      const cap = [], freq = [];
      for (let i = 0; i <= 240; i++) {
        const v = vLo + (vHi - vLo) * i / 240;
        cap.push({ x: v, y: varicapC(v) * 1e12 });
        freq.push({ x: v, y: varicapF(v) / 1e6 });
      }
      const common = {
        xRange: [vLo, vHi], xFmt: v => trim(v, 2) + ' V', tokens: t,
        cursor: { x: vr, colour: t.marker, label: trim(vr, 3) + ' V' }
      };
      const capMax = varicapC(vLo) * 1e12;
      const fMax = varicapF(vHi) / 1e6;
      Plot.draw(p.graph, Object.assign({
        band: [0, 0.5],
        left: { min: 0, max: capMax * 1.1, fmt: y => trim(y, 3) + ' pF' },
        traces: [{ pts: cap, colour: t.trace, axis: 'left', width: 2.2 }]
      }, common));
      Plot.draw(p.graph, Object.assign({
        band: [0.5, 1], append: true,
        left: { min: 0, max: fMax * 1.1, fmt: y => trim(y, 3) + ' MHz' },
        traces: [{ pts: freq, colour: t.trace2 || t.marker, axis: 'left', width: 2.2 }]
      }, common));

      p.legend.innerHTML =
        swatch(t.trace, 'Capacitance of the diode') +
        swatch(t.trace2 || t.trace, 'What it tunes a 4.7 uH coil to') +
        swatch(t.marker, 'The control voltage, drag it');
      if (p.schemNote) {
        p.schemNote.textContent = 'R is large enough to feed the control ' +
          'voltage in without damping the tuned circuit. Drag the marker to ' +
          'change the control voltage.';
      }
      p.readouts.innerHTML = ro([
        ['Control voltage', trim(vr, 3) + ' V'],
        ['Capacitance', eng(varicapC(vr), 'F', 3), true],
        ['With no bias at all', eng(VARICAP_C0, 'F', 3)],
        ['Coil', eng(VARICAP_L, 'H', 2) + ', fixed'],
        ['Resonant frequency', eng(varicapF(vr), 'Hz', 4)],
        ['Range over the whole sweep', eng(varicapF(vLo), 'Hz', 3) + ' to ' +
          eng(varicapF(vHi), 'Hz', 3)]
      ]);
      // the charge moves at the frequency this setting actually tunes to, so
      // winding the control voltage up visibly speeds the circuit up
      p.fAnim = varicapF(vr);
      return { layout: varicapLayout(varicapC(vr)),
               circuit: window.MNA.parseNetlist(varicapNetlist(varicapC(vr))) };
    },

    /** The load line, with the operating point on it. */
    loadline(ctx) {
      const { p, d, t, Plot, swatch, ro, Fmt } = ctx;
      const { eng, trim } = Fmt;
      const line = [{ x: 0, y: d.iMax }, { x: d.vcc, y: 0 }];

      // One curve per base current, the way these are conventionally drawn.
      // current is nearly flat against collector voltage, rising a little
      // because the device is not a perfect current source, and collapsing
      // near zero volts where the transistor runs out of room.
      const curve = (ib) => {
        const pts = [];
        for (let i = 0; i <= 160; i++) {
          const v = d.vcc * i / 160;
          const flat = d.beta * ib * (1 + v / 100) / (1 + Math.max(0, d.vceq) / 100);
          pts.push({ x: v, y: flat * (1 - Math.exp(-v / 0.08)) });
        }
        return pts;
      };
      // round base currents that bracket the one the bias actually produces
      const nice = (v) => {
        const e = Math.pow(10, Math.floor(Math.log10(Math.max(1e-12, v))));
        const m = v / e;
        return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * e;
      };
      const step = nice(d.ib / 2);
      const family = [1, 2, 3, 4].map(k => k * step);

      const traces = family.map(ib => ({
        pts: curve(ib), colour: t.rule || t.muted || t.phase, axis: 'left', width: 1.1
      }));
      // the curve the bias has actually landed on, and the load across them
      traces.push({ pts: curve(d.ib), colour: t.trace, axis: 'left', width: 2 });
      traces.push({ pts: line, colour: t.phase, axis: 'left', width: 2 });

      const top = Math.max(d.iMax, d.beta * family[family.length - 1]) * 1.1;
      Plot.draw(p.graph, {
        xRange: [0, d.vcc], xFmt: v => trim(v, 3) + ' V', tokens: t,
        left: { max: top, fmt: y => eng(y, 'A', 2) },
        traces: traces,
        marks: [{ x: d.vcc / 2, colour: t.marker }],
        labels: family.map(ib => ({
          x: d.vcc * 0.97, y: d.beta * ib * (1 + d.vcc * 0.97 / 100) /
            (1 + Math.max(0, d.vceq) / 100),
          axis: 'left', text: eng(ib, 'A', 2), colour: t.rule || t.muted
        })),
        cursor: { x: Math.max(0, d.vceq), colour: t.trace,
                  dot: { y: d.icq, axis: 'left' }, label: 'operating point' }
      });

      p.legend.innerHTML =
        swatch(t.rule || t.muted || t.phase, 'One curve per base current') +
        swatch(t.trace, 'The curve this bias sits on') +
        swatch(t.phase, 'Every point the collector load allows') +
        swatch(t.marker, 'Half the supply');

      const clipping = d.vceq < 1 || d.vceq > d.vcc - 1;
      // the usual rule: the divider has to carry well more than the base
      // takes, or the bias moves when the base current does
      const dividerI = d.vcc / (d.r1 + d.r2);
      const ratio = dividerI / Math.max(1e-12, d.ib);
      p.readouts.innerHTML = ro([
        ['Collector current', eng(d.icq, 'A', 3)],
        ['Collector voltage', trim(Math.max(0, d.vceq), 3) + ' V',
         Math.abs(d.vceq - d.vcc / 2) > d.vcc * 0.12],
        ['Base current needed', eng(d.ib, 'A', 3)],
        ['Current down the divider', eng(dividerI, 'A', 3)],
        ['Divider against base current', trim(ratio, 2) + ' times' +
          (ratio < 5 ? ', too close to hold the bias steady' : ', enough to hold the bias'),
         ratio < 5],
        ['Headroom', clipping ? 'will clip' : 'room both ways', clipping],
        ['Power in the transistor', (() => {
          const pw = Math.max(0.2, d.vceq) * d.icq;
          return eng(pw, 'W', 3) + (pw > 0.3 ? ', beyond a small signal device'
                                             : ', a small signal device copes');
        })(), Math.max(0.2, d.vceq) * d.icq > 0.3]
      ]);
      if (p.schemNote) p.schemNote.textContent = 'the stage this line belongs to';
      p.fAnim = 1000;
      return { layout: configLayout('ce'),
               circuit: MI.parseNetlist(configCircuit('ce', d).netlist) };
    },

    /*
     * The flagship. Bias sets the conduction angle, the conduction angle sets
     * the class and the efficiency, and the harmonics appear as the price.
     */
    classes(ctx) {
      const { p, d, t, Plot, swatch, ro, Fmt } = ctx;
      const { eng, trim } = Fmt;

      // the current pulse the device passes, over two cycles
      const N = 1024;
      // headroom and drive are both in volts, so the pulse comes out in volts
      const wave = DC.collectorWave(d.headroom, d.drive, N);
      const peak = Math.max(1e-6, d.headroom + d.drive);
      const pts = [];
      for (let i = 0; i < N * 2; i++) pts.push({ x: i / N, y: wave[i % N] / peak });
      const drivePts = [];
      for (let i = 0; i < N * 2; i++) {
        drivePts.push({ x: i / N, y: (d.headroom + d.drive * Math.sin(2 * Math.PI * i / N)) / peak });
      }
      if (p.schem) {
        Plot.draw(p.schem, {
          xRange: [0, 2], xFmt: x => trim(x, 2) + ' cyc', tokens: t,
          left: { min: -1.1, max: 1.15, fmt: y => trim(y * peak, 2) + ' V' },
          traces: [{ pts: drivePts, colour: t.phase, axis: 'left', width: 1.4 },
                   { pts: pts, colour: t.trace, fill: t.fill, axis: 'left', width: 2 }],
          cursor: null
        });
      }
      if (p.schemNote) p.schemNote.textContent = 'drive in, collector current out';

      // and what that pulse contains
      const rep = new Float64Array(8192);
      for (let i = 0; i < 8192; i++) rep[i] = wave[(i * 16) % N];
      const sp = DSPI.spectrum(rep, N, { floor: -70 });
      const fpts = [];
      for (let i = 1; i < sp.bins && sp.freq[i] <= 6; i++) {
        fpts.push({ x: sp.freq[i], y: sp.db[i] + 70 });
      }
      Plot.draw(p.graph, {
        xRange: [0, 6], xFmt: x => trim(x, 2) + 'f', tokens: t,
        left: { max: 75, fmt: y => Math.round(y - 70) + ' dB' },
        traces: [{ pts: fpts, colour: t.trace, fill: t.fill, axis: 'left', width: 1.4 }],
        marks: [1, 2, 3, 4, 5].map(k => ({ x: k, colour: t.marker })),
        cursor: null
      });
      p.legend.innerHTML = swatch(t.trace, 'What the collector current contains') +
        swatch(t.marker, 'Fundamental and its harmonics');

      p.readouts.innerHTML = ro([
        ['Conducts for', trim(d.thetaDeg, 4) + '°'],
        ['Which is class', d.cls, true],
        ['Efficiency', trim(d.eff * 100, 3) + '%'],
        ['Needs a tuned load?', d.cls === 'C' ? 'yes, essential' : (d.cls === 'B' ? 'yes, or push pull' : 'no'),
         d.cls === 'C']
      ]);
      return {};
    },

    /** Feedback around a stage, and the two conditions for oscillation. */
    oscillator(ctx) {
      const { p, d, t, Plot, swatch, ro, Fmt } = ctx;
      const { trim, eng } = Fmt;

      // A Colpitts. The coil and the two capacitors in series set the
      // frequency; the junction between the capacitors is the tap the emitter
      // drives, so their ratio sets how much of the tuned circuit's swing
      // comes back to the base.
      const L = 4.7e-6, C1 = 4700e-12, C2 = 470e-12, Q = 100;
      const cs = C1 * C2 / (C1 + C2);
      const f0 = 1 / (2 * Math.PI * Math.sqrt(L * cs));
      const fraction = C1 / (C1 + C2);

      // what the tuned circuit looks like at resonance, and what the stage can
      // make across it. Rd = L / CR is the same figure the tuned circuit bench
      // arrives at, and the coil's loss resistance comes from its Q.
      const rCoil = 2 * Math.PI * f0 * L / Q;
      const rd = L / (cs * rCoil);
      const gm = Math.max(1e-9, d.ic) / 0.026;
      const available = gm * rd;
      const needed = 1 / fraction;
      const willRun = available >= needed;

      const pts = [];
      for (let i = 0; i <= 400; i++) {
        const cyc = i / 40;
        // above one it grows until the stage runs out of room, below it decays
        const per = Math.pow(available / needed, 1 / 6);
        const amp = Math.min(1, 0.05 * Math.pow(per, cyc));
        pts.push({ x: cyc, y: amp * Math.sin(2 * Math.PI * cyc) });
      }
      Plot.draw(p.graph, {
        xRange: [0, 10], xFmt: x => trim(x, 2) + ' cyc', tokens: t,
        left: { min: -1.15, max: 1.15, fmt: y => trim(y, 2) },
        traces: [{ pts: pts, colour: t.trace, axis: 'left', width: 1.8 }],
        cursor: null
      });
      p.legend.innerHTML = swatch(t.trace, willRun
        ? 'Building until the stage runs out of room'
        : 'Dying away, the loop cannot replace what is lost');
      p.readouts.innerHTML = ro([
        ['Frequency of the tuned circuit', eng(f0, 'Hz', 4), true],
        ['Coil, and the two in series', eng(L, 'H', 2) + ' with ' + eng(cs, 'F', 3)],
        ['Fed back to the base', trim(fraction * 100, 3) + '% of the swing'],
        ['So the loop needs a gain of', trim(needed, 3)],
        ['The stage can manage', trim(available, 3) +
          ' into the tuned circuit'],
        ['Will it start', willRun ? 'yes, and it will settle where the stage clips'
                                  : 'no, the loop loses more than it makes', !willRun],
        ['The other condition', 'the feedback has to arrive in phase, 0\u00b0 round the loop']
      ]);
      if (p.schemNote) {
        p.schemNote.textContent = 'The transistor runs as an emitter ' +
          'follower here, with the tuned circuit and the two capacitors ' +
          'around it.';
      }
      p.fAnim = 1000;
      return { layout: configLayout('cc') };
    }
  },

  items: [
    {
      code: '2I1',
      levels: ['intermediate', 'full'],
      panel: 'diode',
      introduces: {
        intermediate: ['forward bias', 'reverse bias', 'depletion layer'],
        full: ['Zener diode']
      },
      heading: { intermediate: 'The diode, and which way it lets current through',
                 full: 'The Zener diode and its reverse characteristic' },
      lead: { intermediate: 'Start with the simplest device there is, because the transistor is two of these back to back.',
              full: 'Run the same diode backwards far enough and something useful happens.' },
      headline: {
        intermediate: 'A diode conducts one way only, once you give it enough forward voltage to start.',
        full: 'A Zener diode conducts backwards once you pass its rated voltage, and holds there.'
      },
      formulas: { intermediate: [], full: ['zseries', 'zpower'] },
      workNote: {
        intermediate: 'No formula here. What matters is the shape of the curve: nothing much happens until about 0.6 V, and then the current climbs very steeply indeed. Drag the cursor across it.',
        full: 'Watch the left hand side of the curve. Nothing flows until the applied voltage passes the rated figure, and then current rises almost vertically while the voltage across the diode barely moves. That is what makes it useful as a reference.'
      },
      explain: {
        intermediate: [
          'A junction between two kinds of silicon has a region either side of it swept clear of free charge, called the depletion layer. It acts as a barrier.',
          'Apply a voltage the right way round and the barrier shrinks until, at about 0.6 V for silicon, current flows freely. That is forward bias. Apply it the other way and the barrier grows, and almost nothing gets through.',
          'That is the whole of rectification: a device that passes one half of an alternating waveform and blocks the other.'
        ],
        full: [
          'Push the reverse voltage far enough and the barrier gives way. In an ordinary diode that is a failure. In a Zener it is the intended behaviour, and it happens at a voltage chosen when the diode is made.',
          'Past that knee the current rises steeply while the voltage across the diode stays put. Feed it through a resistor and you have a fixed voltage that holds regardless of what the supply is doing.',
          'Note which way round it goes into the circuit. A Zener used as a reference is reverse biased, which catches people out.'
        ]
      }
    },

    {
      code: '2I3',
      levels: ['intermediate', 'full'],
      panel: 'transfer',
      introduces: {
        intermediate: ['bias', 'operating point', 'load line', 'saturation', 'cut off'],
        full: []
      },
      heading: { intermediate: 'A small current controlling a large one',
                 full: 'Biasing, and how far the device can be pushed' },
      lead: { intermediate: 'A transistor is a tap. A little current into the base lets a lot through the collector, and the ratio between them is fixed.',
              full: 'Biasing is not a detail of the circuit, it is the decision that determines everything else about it.' },
      headline: {
        intermediate: 'A small base current steers a much larger collector current. That is where the gain comes from.',
        full: 'Biasing bipolar transistors and FETs so they sit where you want them.'
      },
      formulas: { intermediate: ['divider', 'emitter', 'beta'],
                  full: ['divider', 'emitter', 'beta', 'diss'] },
      workLead: {
        intermediate: 'Gain first, then the line the load resistor draws across every possibility.',
        full: 'Gain, the load line, and what the device has to dissipate while it sits there.'
      },
      workNote: {
        intermediate: 'Beta is the one relationship in this section the exam hands you in the booklet. Everything else about the stage follows from it and from Ohm\\u2019s law across the collector resistor.',
        full: 'Note the dissipation figure. It is largest when the collector sits near the middle of the line, which is where a stage has to sit if it is to reproduce a signal faithfully. That is the reason such a stage runs hot even with no signal going through it.'
      },
      explain: {
        intermediate: [
          'Feed a current into the base and a much larger one flows in the collector. Beta, sometimes written hFE, is how much larger, and it is simply the collector current divided by the base current.',
          'The curve shows what that means across the whole range. Over most of it the collector current follows the base current in a straight line at beta times the size, and a small wiggle at the base comes out as a large wiggle at the collector. That is amplification, and the marked point is where the bias has put it.',
          'The two capacitors at the ends are there to keep the outside world out of it. Whatever is connected to the input or the output has its own resistances and voltages, and if it were joined straight on it would pull the divider about and undo the biasing. The capacitors pass the signal and block the steady voltages, so the bias inside stays where it was set.',
          'Keep increasing the base current and the line stops rising. The collector current can never exceed what the supply and the resistors allow, so it flattens off. There the transistor is saturated and behaving like a closed switch. Take the base current away entirely and it is cut off, an open one.',
          'Amplifier and switch are not two different devices. They are the same curve used in different places: the straight middle for amplifying, the two flat ends for switching.'
        ],
        full: [
          'For a signal to swing both ways without running out of room, the operating point wants to sit on the straight part with space either side of it. That is what the exam means by biasing the collector midway between the supply and zero.',
          'Change R1 or R2 and watch the marked point travel along the curve. Push it too far up and it runs into the flat top, where more base current buys no more collector current and the top of the waveform is shaved off. Take it too far down and the bottom of the waveform is cut off instead.',
          'FETs work by a different mechanism, controlled by voltage on a gate rather than current into a base, but the same reasoning applies: pick a point on the load line and make sure the signal has room either side of it.'
        ]
      }
    },

    {
      code: '2I4',
      // A conventional divider bias design, worked the way any textbook
      // works it: choose the collector current, drop about half the rail
      // across the load, put a volt or so on the emitter, and run the divider
      // at ten times the base current so that variation in gain between
      // devices does not move the bias.
      presets: [{
        label: 'A worked design: 10 V, 1 mA',
        note: 'half the rail across the load, and the divider at ten times the base current',
        values: { vcc: 10, r1: 79e3, r2: 21e3, rc: 4000, re: 1500, beta: 100 }
      }],
      levels: ['intermediate', 'full'],
      panel: { intermediate: 'loadline', full: 'amp' },
      toggle: {
        label: 'View',
        levels: ['full'],
        options: [['ce', 'Common emitter'], ['cc', 'Emitter follower'],
                  ['cb', 'Common base'], ['classes', 'Classes A to C']]
      },
      circuit: 'ce',
      introduces: {
        intermediate: [],
        full: ['conduction angle', 'class A', 'class AB', 'class B', 'class C']
      },
      heading: { intermediate: 'The common emitter amplifier',
                 full: 'Three configurations, and the classes they can be biased into' },
      lead: { intermediate: 'Now put a signal into the stage you have just biased.',
              full: 'Two separate questions about one transistor: which way round it is wired, and where it is biased.' },
      headline: {
        intermediate: 'The common emitter amplifier, and picking the collector resistor to set the operating point.',
        full: 'Comparing amplifier configurations, and the characteristics of classes A, AB, B and C.'
      },
      formulas: { intermediate: ['beta', 'mid'], full: ['theta', 'eff'] },
      workLead: {
        intermediate: 'Work out the current you want, then the resistor that puts the collector halfway.',
        full: 'The conduction angle first, because the class and the efficiency both follow from it.'
      },
      workNote: {
        intermediate: 'This is the standard exam calculation. Choose the collector current, then pick the resistor that drops half the supply across itself at that current.',
        full: 'Neither figure is quoted from a table. The efficiency is worked out from the shape of the current pulse the device actually passes, which is why it lands on 50% for class A and 78.5% for class B without either being written down.'
      },
      explain: {
        intermediate: [
          'With the stage biased, a small change at the base produces a large change in collector current, and the collector resistor turns that into a large change in voltage. That is voltage gain.',
          'The collector voltage moves the opposite way to the base voltage, because more collector current means more drop across the resistor. A common emitter stage inverts.',
          'Different arrangements trade differently. An emitter follower gives no voltage gain but a high input and low output impedance, which is what you want for driving a load. A common base stage gives voltage gain with low input impedance.'
        ],
        full: [
          'There are three ways to wire one transistor as an amplifier, and the difference is simply which terminal the signal goes in at and which it comes out of. Switch between the first three views and watch all five figures move.',
          'Common emitter is the general purpose one: in at the base, out at the collector. It gives both voltage gain and current gain, and it inverts, because more base current means more drop across the collector resistor. Its input and output impedances are middling, which makes it awkward to match at high frequencies.',
          'The emitter follower takes its output from the emitter instead. Voltage gain is just under one, so it makes nothing larger, but the input impedance is high and the output impedance is low, which is exactly what you want for driving something demanding without loading whatever is feeding you.',
          'Common base drives the emitter and takes the output from the collector. Current gain is about one, voltage gain is high, and the input impedance is very low indeed. It stays stable at VHF and above, where a common emitter stage will happily oscillate instead of amplifying.',
          'Now switch to the classes view, because the second half of this item is a different question about the same transistor: not how it is wired, but where it is biased.',
          'Drag the bias control slowly downwards and watch the readouts. At the top the device conducts for the whole 360 degrees: that is class A, faithful and at best 50% efficient, because it draws the same current whether a signal is present or not.',
          'Class A is therefore the one least likely to produce harmonics of the input, because every part of the waveform is amplified alike. That is what the exam means by lowest distortion.',
          'Keep going and it starts switching off for part of the cycle. Somewhere below halfway you are in class AB, the usual compromise for SSB. At cut off exactly it conducts for 180 degrees, which is class B and tops out at 78.5%. Two devices in push pull, each taking one half of the waveform, is the class B arrangement, and it needs a smooth handover from one to the other.',
          'Below that is class C. Take the bias low enough and there is no collector current at all until a signal arrives, so it draws nothing when idle. It relies on a strong drive to turn it on, which also makes it insensitive to the exact drive level, and thoroughly non-linear.',
          'The spectrum shows what that costs: the output is full of harmonics. A tuned circuit in the collector rings at the fundamental and ignores the rest, which is the only reason class C is usable at all. It follows that class C suits modes carrying no information in their amplitude, which means CW and FM. Anything relying on amplitude, AM and SSB above all, needs a linear stage. Many data modes change level at each symbol and need linearity too.'
        ]
      }
    },

    {
      code: '2I5',
      levels: ['intermediate', 'full'],
      panel: 'oscillator',
      introduces: { intermediate: ['feedback'], full: [] },
      heading: { intermediate: 'Making an amplifier into an oscillator',
                 full: 'The two conditions for oscillation' },
      lead: { intermediate: 'An amplifier that listens to its own output stops needing an input.',
              full: 'Two things have to be true at once, and both are examinable.' },
      headline: {
        intermediate: 'How a transistor keeps a tuned circuit ringing, and where crystals beat variable oscillators.',
        full: 'The feedback an oscillator needs to keep itself going.'
      },
      formulas: { intermediate: [], full: [] },
      workNote: {
        intermediate: 'A tuned circuit rings when you hit it, and then dies away as its resistance turns the energy into heat. An oscillator is simply an amplifier topping it up on every cycle to replace exactly what was lost.',
        full: 'The gain must at least make up what the feedback network loses, and the signal must come back in phase. Fall short on either and it will not start. The drive control here stands in for the loss round the loop.'
      },
      explain: {
        intermediate: [
          'Take the output of an amplifier, feed a little of it back to the input, and if what returns is in step with what is already there it reinforces it. Do that around a tuned circuit and the result oscillates at the frequency the tuned circuit favours.',
          'The tuned circuit decides the frequency. A variable one lets you move about the band; a crystal is far more stable but sits where it was ground.',
          'That is the trade in a nutshell. A VFO tunes and drifts, a crystal holds and does not tune.'
        ],
        full: [
          'Two conditions, both necessary. The gain round the whole loop must be at least unity, meaning the amplifier makes up everything the feedback network throws away. And the phase round the whole loop must come back to zero, so the returning signal reinforces rather than cancels.',
          'Wind the drive control down, which here stands for a lossier feedback path, and watch the oscillation die out because the amplifier can no longer keep up. Wind it up and it builds.',
          'The neatest way to hold the phase condition is this: either both stages shift by nothing, or both shift by 180 degrees. A common emitter stage inverts, so its feedback network must invert as well to bring the total back to zero. An emitter follower does not invert, so its network must not either.'
        ]
      }
    },

    {
      code: '2I2',
      levels: ['intermediate'],
      panel: 'varicap',
      introduces: { intermediate: [] },
      heading: { intermediate: 'The varicap, a capacitor you can steer' },
      lead: { intermediate: 'One more diode, useful for what it does when it is not conducting at all.' },
      headline: { intermediate: 'A varicap works as a capacitor whose value you set with the reverse voltage.' },
      formulas: { intermediate: [] },
      workNote: {
        intermediate: 'A reverse biased junction has an insulating layer with a conductor either side of it, which is the description of a capacitor. Increase the reverse voltage and the layer widens, so the capacitance falls.'
      },
      explain: {
        intermediate: [
          'Reverse bias a diode and the depletion layer widens. That layer is an insulator with conducting silicon either side, which is exactly what a capacitor is made of.',
          'Widen the layer and the capacitance falls, so the applied voltage sets the value. Put one across a tuned circuit and you can move its resonant frequency with a control voltage instead of a moving vane.',
          'That is how a modern VFO tunes, and how a frequency modulator works: apply the audio to the varicap and the oscillator frequency follows it.'
        ]
      }
    },

    {
      code: '2I6',
      levels: ['intermediate'],
      panel: null,
      introduces: { intermediate: [] },
      heading: { intermediate: 'Integrated circuits' },
      lead: { intermediate: 'Finally, what happens when you stop building these one at a time.' },
      headline: { intermediate: 'An integrated circuit packs many devices onto one chip and gives you a whole function.' },
      formulas: { intermediate: [] },
      explain: {
        intermediate: [
          'Everything so far has been a single device. An integrated circuit puts many of them on one piece of silicon and packages the result as a component in its own right.',
          'You buy a function rather than a device: an amplifier, a voltage regulator, a mixer, a whole receiver. What is inside is someone else\\u2019s problem.',
          'That is why a modern radio has so few visible parts. Most of what used to be a board of transistors is now inside a package with a dozen legs.'
        ]
      }
    }
  ],


  /*
   * Our own explanation of each answer. The question, its options and the
   * marked answer are the RSGB's and ship unadapted; the reasoning is ours.
   */
  answers: {
    '2025-Full300': {
      why: 'A Zener is used the other way round from an ordinary diode. It is meant to break down, and it does so once the reverse voltage across it passes the figure it was made for. Forward biased it behaves like any other diode, which is not what it is there for.',
      source: { from: ['2I1'] },
      seedNote: 'Drag the cursor into the left hand side of the curve and watch where the current appears.'
    },
    '2025-Full3418': {
      why: 'Look for the curve that does nothing in either direction until it reaches a knee, and has that knee on the reverse side as well as the usual forward one. An ordinary diode has only the forward knee.',
      source: { from: ['2I1'] }
    },
    '2025-Full3577': {
      why: 'The clue is the sharp knee on the reverse side, past which the current climbs steeply while the voltage barely moves. A transistor characteristic is a family of curves rather than a single line, and an ordinary diode does not conduct in reverse at all.',
      source: { from: ['2I1'] }
    },
    '2025-Full3983': {
      why: 'This is a zener holding a supply steady, with a load across it. The zener fixes the voltage, so work out what the series resistor delivers and what the load takes, and the diode carries whatever is left. Forgetting the load gives the current in the series resistor instead, which is one of the wrong answers.',
      working: ['the zener holds the output at 3.6 V',
                'through the series 1 k&Omega;: (12 V &minus; 3.6 V) / 1 k&Omega; = 8.4 mA',
                'through the 1 k&Omega; load: 3.6 V / 1 k&Omega; = 3.6 mA',
                'the diode takes the difference: 8.4 mA &minus; 3.6 mA = 4.8 mA'],
      source: { from: ['2I1'] }
    },
    '2025-Full319': {
      why: 'A FET is controlled by voltage on its gate, and the current it controls flows from drain to source. Pinch off is the gate voltage at which that drain to source current stops. The gate itself draws essentially no current, which rules out the options about gate current.',
      source: { from: ['2I3'] }
    },
    '2025-Full3582': {
      why: 'Lower the gate potential on an n channel device and you pinch the channel further, so less current flows from drain to source. The gate draws no appreciable current either way.',
      source: { from: ['2I3'] }
    },
    '2025-Full3585': {
      why: 'A depletion mode n channel FET conducts with no bias at all, and is turned down by taking the gate below the source. Biasing one as an amplifier therefore puts the gate below the source, and the diagram marks the source voltage. No resistor values are given, so the answer is settled by which option sits below it.',
      working: ['the diagram marks the source at 4.5 V',
                'an n channel depletion FET is biased with the gate below its source',
                'of the options only 3.2 V is below 4.5 V',
                'which puts V<sub>GS</sub> at 3.2 V &minus; 4.5 V = &minus;1.3 V'],
      source: { from: ['2I3'] }
    },
    '2025-Full679': {
      why: 'The diagram gives the emitter voltage, and the base has to sit about 0.6 V above it. R1 and R2 divide the supply down to that, so what the answer really turns on is the ratio of the two resistors rather than any one value.',
      working: ['base = emitter + 0.6 V = 1.5 V + 0.6 V = 2.1 V',
                'the divider gives base = supply &times; R2 / (R1 + R2)',
                'on a rail of about 9.5 V that needs R2 / (R1 + R2) = 2.1 / 9.5 = 0.22',
                'with R2 = 22 k&Omega; that puts R1 at 78 k&Omega;'],
      source: { eq: ['divider', 'beta'], from: ['2I3'] },
      seed: { r1: 78e3, r2: 22e3, rc: 910, re: 470 },
      seedNote: 'The bench is set to this divider. Read the base voltage it produces, then check where the collector ends up.'
    },
    '2025-Full321': {
      why: 'Common emitter. The collector resistor turns a large collector current change into a large voltage change, so the gain is well above one, and the collector moves the opposite way to the base, so the output is inverted.',
      source: { from: ['2I4'] },
      seedNote: 'Both facts come from the same thing: more base current means more drop across the collector resistor, so the collector goes down as the base goes up.'
    },
    '2025-Full322': {
      why: 'This one is an emitter follower. The output follows the input closely, so there is no inversion, and it cannot exceed it, so the voltage gain is a little under one. What it does give you is current gain and a much lower output impedance.',
      source: { from: ['2I4'] }
    },
    '2025-Full323': {
      why: 'Common base. The same current passes through emitter and collector, so the current gain is about one, but the collector load turns it into a much larger voltage swing, so the voltage gain is high.',
      source: { from: ['2I4'] }
    },
    '2025-Full324': {
      why: 'Class A conducts for the whole cycle, so the device never switches off and never has to be pieced back together. That is what makes it the most faithful, and it is also why it is the least efficient.',
      working: ['conduction angle = 360&deg;, the whole cycle',
                'efficiency at best = 50%',
                'nothing of the waveform is missing, and half the supply is heat',
                'lowest distortion of the four, which is Class A'],
      source: { eq: ['theta', 'eff'], from: ['2I4'] },
      seed: { r1: 78e3, r2: 22e3, re: 220, drive: 0.05 },
      seedNote: 'Set the bench to class A and look at the spectrum: almost nothing but the fundamental.'
    },
    '2025-Full325': {
      why: 'Amplifying only one half of the waveform means conducting for half the cycle, which is 180 degrees, and that is class B. Class A takes the whole cycle, class AB rather more than half, class C rather less.',
      working: ['half the waveform means half the cycle',
                '360&deg; / 2 = 180&deg;',
                'which is class B, at best 78.5% efficient'],
      source: { eq: ['theta'], from: ['2I4'] },
      seed: { r1: 200e3, r2: 12e3, re: 220, drive: 0.3 },
      seedNote: 'The bench is set to the cut off point. Read the conduction angle and the class.'
    },
    '2025-Full3404': {
      why: 'Class C conducts for so little of the cycle that what comes out is a series of pulses rather than a waveform, so a tuned load is needed to ring at the fundamental and put the sine wave back. Its supply current is lower rather than higher, because it draws nothing at all until a signal arrives. Its distortion is worse rather than better. And push pull, where each device takes half the waveform, is a class B arrangement rather than a class C one.',
      source: { eq: ['theta', 'eff'], from: ['2I4'] },
      seed: { r1: 400e3, r2: 10e3, re: 220, drive: 0.5 },
      seedNote: 'Set the bench to class C and look at the harmonics on the right. That is what the tuned load has to remove.'
    },
    '2025-Full7635': {
      why: 'Oscillation builds only if each trip round the loop returns at least as much as it started with. Gain has to exceed the losses, not match half of them or fall short.',
      source: { from: ['2I5'] },
      seed: { re: 4700, vcc: 5 },
      seedNote: 'The panel shows the gain the loop needs beside the gain the stage can manage. This setting cuts the standing current right down, and the gain available falls with it while the figure it has to beat stays where it is.'
    },
    '2025-Full7738': {
      why: 'The comparison is with the loss in the feedback network, not with the transistor\u2019s beta. Beta describes the device; what matters is whether the whole loop breaks even.',
      source: { from: ['2I5'] }
    },
    '2025-Full7739': {
      why: 'Same condition stated again: the amplifier has to make up slightly more than the feedback network throws away. Slightly, because far more than that drives the stage into clipping and the output distorts.',
      source: { from: ['2I5'] }
    },
    '2025-Full7764': {
      why: 'Two conditions have to hold together. Enough gain to cover the losses, and the returning signal in phase with what is already at the input. Either one alone is not enough.',
      source: { from: ['2I5'] }
    },
    '2025-Full7765': {
      why: 'If the feedback network loses more than the amplifier can replace, each trip round the loop is smaller than the last and the oscillation dies out. It will not start at all.',
      source: { from: ['2I5'] },
      seed: { re: 4700, vcc: 5 },
      seedNote: 'Compare the two figures on the oscillator panel. The trace builds while the stage can manage more than the loop needs, and decays when it cannot.'
    },
    '2025-Full7766': {
      why: 'An emitter follower does not invert, so the signal arrives back at the input already in phase. The feedback network therefore has to add nothing. A common emitter stage inverts, and its network has to supply the other 180 degrees.',
      source: { from: ['2I5'] }
    }
  },

  outro: {
    intermediate: [
      'A diode passes current one way. A transistor lets a small current steer a large one. Bias decides where the device sits before the signal arrives, and feedback turns an amplifier into an oscillator.',
      'That is the whole toolkit. Everything in the transmitter and receiver sections is built from these parts arranged differently.'
    ],
    full: [
      'The through line here is bias. It sets the operating point, the operating point sets the conduction angle, and the conduction angle sets both the class and the efficiency.',
      'It also sets what you have to do about the consequences. Class A needs no help and wastes half the supply. Class C is efficient and unusable without a tuned circuit to put the waveform back together. Everything between is a judgement about which of those matters more for the mode you are running.'
    ]
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = BENCH;
if (typeof window !== 'undefined') window.BENCH = BENCH;
