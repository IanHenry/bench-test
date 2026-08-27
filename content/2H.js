/*
 * content/2H.js - Tuned circuits and resonance.
 *
 * One bench per lettered syllabus group, written to be read start to finish
 * rather than dipped into like a checklist. Each section opens by picking up
 * where the last one left off. The item code sits quietly above the heading
 * so a candidate can find what they need, but it is not what leads.
 *
 * Levels are a facet within the bench. 2H has no Foundation content: the
 * syllabus does not teach tuned circuits until Intermediate.
 *
 * Headlines come from content/descriptions.json and are our own wording. The
 * RSGB owns the learning objectives, so nothing here is copied from them.
 *
 * The fifth entry on a wire names the element whose current flows along it,
 * in the direction the wire is written. That is what the charge animation
 * follows.
 */

// The solver is a global; panels get it through their context, but these
// file level helpers reach for it directly.
const M = window.MNA;
// the equation blocks below format numbers directly, so pull these in here
const { eng, trim, sci } = window.Fmt;

function probeAt(spec, f) {
  const sol = M.solveAt(spec.circuit, f);
  const I = M.currentThrough(sol, 'R1');
  const out = { mag: M.abs(I), ph: M.arg(I) * 180 / Math.PI };
  try { out.vl = M.abs(M.voltageAcross(sol, 'L1')); } catch (e) { out.vl = 0; }
  return out;
}

const usesBigR = p =>
  p.item.panel === 'filter' && (p.topology === 'lowpass' || p.topology === 'highpass');

const BENCH = {
  group: '2H',
  title: 'Tuned circuits and resonance',
  pageTitle: 'Tuned Circuits Bench',
  levels: ['intermediate', 'full'],
  circuitBased: true,

  /** Every circuit this bench draws, for the layout checker. */
  allLayouts: () => {
    const v = { R: '5.477', L: '14.14u', C: '141.4p', R2: '548' };
    // the netlist goes with the drawing, so that the checkers can trace every
    // conductor back to a current something actually solves for
    return Object.keys(BENCH.circuits).map(k => {
      const c = BENCH.circuits[k](v);
      return { name: k, layout: c.layout, netlist: c.netlist };
    });
  },
  bank: {
    url: 'https://rsgb.services/public/exams/eqdb/',
    topic: '2H - Tuned Circuits and resonance',
    note: 'Full level only. Choose the topic from the Filter by Topic list.'
  },

  intro: {
    intermediate: [
      'A coil and a capacitor do opposite things to an alternating current. One fights it harder as the frequency rises, the other lets it through more easily. Put the two together and there is one frequency where those opposites are exactly equal.',
      'Everything on this page comes from that single fact. Move any control and watch what happens, but watch the equations underneath as well. The numbers inside them change with the sliders, and seeing which term moved is the part that sticks.'
    ],
    full: [
      'A coil and a capacitor do opposite things to an alternating current, and at one frequency those opposites cancel exactly. Everything here follows from that.',
      'Each section shows the equation the exam expects with your values substituted into it. Some of those formulas are printed in the reference booklet you are given in the exam and some are not. They are marked, because knowing which is which is worth as much as knowing the formula.'
    ]
  },


  /** Everything the panels and the working blocks read, from R, L and C. */
  derive: (v) => {
    const { R, L, C } = v;
    const f0 = 1 / (2 * Math.PI * Math.sqrt(L * C));
    const Q = (1 / R) * Math.sqrt(L / C);
    const Z0 = Math.sqrt(L / C);
    const k = Math.sqrt(1 + 1 / (4 * Q * Q));
    return { R, L, C, f0, Q, Z0, BW: f0 / Q,
             fLo: f0 * (k - 1 / (2 * Q)), fHi: f0 * (k + 1 / (2 * Q)) };
  },

  labels: (p, d, v) => ({
    RS: '10 kΩ',
    R1: window.Fmt.eng(usesBigR(p) ? v.R * 100 : d.R, 'Ω', 3),
    L1: window.Fmt.eng(d.L, 'H', 3),
    C1: window.Fmt.eng(d.C, 'F', 3)
  }),

  animRef: 3.5594e6,


  /*
   * Read before this bench was designed. Our own summary of what each source
   * insists on; no wording from any of them appears here or in the bench.
   */
  sources: {
    read: [
      'Intermediate licence manual, tuned circuits',
      'Exam Secrets, technical basics at Foundation, Intermediate and Full',
      'Syllabus 2019 per-level specifications, items 2H1 to 2H5'
    ],
    keyMessages: [
      { at: '2H1', level: 'intermediate',
        point: 'the two reactances move opposite ways with frequency and cross once' },
      { at: '2H1', level: 'intermediate',
        point: 'the cancellation is a matter of timing: the two voltages are half a cycle apart' },
      { at: '2H1', level: 'full',
        point: 'only the product LC decides the frequency, so L and C can trade off' },
      { at: '2H2', level: 'intermediate',
        point: 'series gives minimum impedance, parallel maximum, from the same two parts' },
      { at: '2H2', level: 'intermediate',
        point: 'in parallel the branch currents nearly cancel in the supply arm' },
      { at: '2H2', level: 'full',
        point: 'a crystal has both a series and a parallel resonance, from its holder capacitance' },
      { at: '2H3', level: 'intermediate',
        point: 'energy changes hands between the two stores, and the rate is the frequency' },
      { at: '2H3', level: 'intermediate',
        point: 'the formula is deliberately not required at this level' },
      { at: '2H4', level: 'intermediate',
        point: 'bandwidth is measured between the half power points, at 0.707 of the peak' },
      { at: '2H4', level: 'intermediate',
        point: 'R alone sets the sharpness, and at RF it is worse than DC because of skin effect' },
      { at: '2H4', level: 'full',
        point: 'Q magnifies voltage in a series circuit and current in a parallel one' },
      { at: '2H5', level: 'intermediate',
        point: 'four filter shapes, and the cut-off is the same half power point' },
      { at: '2H5', level: 'full',
        point: 'dynamic resistance is purely resistive and means something only at resonance' }
    ]
  },

  controls: [
    { id: 'R', label: 'R', unit: 'Ω', range: [0.5, 60], start: 5.477,
      desc: 'Loss in the circuit, mostly the resistance of the coil. Sets Q' },
    { id: 'L', label: 'L', unit: 'H', range: [1e-6, 200e-6], start: 14.14e-6,
      desc: 'Inductance. With C it sets the resonant frequency' },
    { id: 'C', label: 'C', unit: 'F', range: [10e-12, 2000e-12], start: 141.4e-12,
      desc: 'Capacitance. With L it sets the resonant frequency' }
  ],

  /* ---- circuit topologies: netlist and drawing, kept together ---- */
  circuits: {
    series: (v) => ({
      netlist: `V1 in 0 1\nR1 in a ${v.R}\nL1 a b ${v.L}\nC1 b 0 ${v.C}`,
      probe: { kind: 'current', of: 'R1' },
      z: { mode: 'series', i: 'R1' },
      layout: {
        w: 260, h: 220,
        elements: [
          { name: 'V1', type: 'V', at: [30, 100], rot: 90, label: '1 V' },
          { name: 'R1', type: 'R', at: [90, 70], label: 'R' },
          { name: 'L1', type: 'L', at: [150, 70], label: 'L' },
          { name: 'C1', type: 'C', at: [210, 100], rot: 90, label: 'C' }
        ],
        wires: [[30, 70, 60, 70, 'R1'], [180, 70, 210, 70, 'C1'],
                [210, 130, 30, 130, 'C1']],
        grounds: [[120, 130]]
      }
    }),

    parallel: (v) => ({
      netlist: `V1 in 0 1\nRS in t 10k\nR1 t m ${v.R}\nL1 m 0 ${v.L}\nC1 t 0 ${v.C}`,
      probe: { kind: 'node', of: 't' },
      z: { mode: 'tank', v: 't', i: 'RS' },
      layout: {
        w: 260, h: 220,
        elements: [
          { name: 'V1', type: 'V', at: [30, 100], rot: 90, label: '1 V' },
          { name: 'RS', type: 'R', at: [90, 70], label: 'source' },
          { name: 'R1', type: 'R', at: [160, 100], rot: 90, label: 'R loss', labelAt: 'left' },
          { name: 'L1', type: 'L', at: [160, 160], rot: 90, label: 'L', labelAt: 'left' },
          { name: 'C1', type: 'C', at: [215, 100], rot: 90, label: 'C' }
        ],
        // The rail is split at the tank so each half carries its own current.
        // Between L and C only the circulating current flows, which is the
        // whole point of the parallel connection and is visible in the dots.
        wires: [[30, 70, 60, 70, 'RS'], [120, 70, 160, 70, 'RS'],
                [160, 70, 215, 70, 'C1'], [215, 130, 215, 190, 'C1'],
                [215, 190, 160, 190, 'C1'], [160, 190, 30, 190, 'RS'],
                [30, 190, 30, 130, 'RS']],
        grounds: [[95, 190]]
      }
    }),

    lowpass: (v) => ({
      netlist: `V1 in 0 1\nR1 in out ${v.R2}\nC1 out 0 ${v.C}`,
      probe: { kind: 'node', of: 'out' },
      layout: {
        w: 260, h: 220,
        elements: [
          { name: 'V1', type: 'V', at: [30, 100], rot: 90, label: '1 V' },
          { name: 'R1', type: 'R', at: [90, 70], label: 'R' },
          { name: 'C1', type: 'C', at: [180, 100], rot: 90, label: 'C' }
        ],
        wires: [[30, 70, 60, 70, 'R1'], [120, 70, 180, 70, 'R1'],
                [180, 70, 225, 70, '-'], [180, 130, 30, 130, 'C1']],
        grounds: [[105, 130]],
        terminals: [{ at: [225, 70], label: 'out' }]
      }
    }),

    highpass: (v) => ({
      netlist: `V1 in 0 1\nC1 in out ${v.C}\nR1 out 0 ${v.R2}`,
      probe: { kind: 'node', of: 'out' },
      layout: {
        w: 260, h: 220,
        elements: [
          { name: 'V1', type: 'V', at: [30, 100], rot: 90, label: '1 V' },
          { name: 'C1', type: 'C', at: [90, 70], label: 'C' },
          { name: 'R1', type: 'R', at: [180, 100], rot: 90, label: 'R' }
        ],
        wires: [[30, 70, 60, 70, 'C1'], [120, 70, 180, 70, 'R1'],
                [180, 70, 225, 70, '-'], [180, 130, 30, 130, 'R1']],
        grounds: [[105, 130]],
        terminals: [{ at: [225, 70], label: 'out' }]
      }
    }),

    bandpass: (v) => ({
      netlist: `V1 in 0 1\nL1 in m ${v.L}\nC1 m out ${v.C}\nR1 out 0 ${v.R}`,
      probe: { kind: 'node', of: 'out' },
      layout: {
        w: 260, h: 220,
        elements: [
          { name: 'V1', type: 'V', at: [30, 100], rot: 90, label: '1 V' },
          { name: 'L1', type: 'L', at: [90, 70], label: 'L' },
          { name: 'C1', type: 'C', at: [150, 70], label: 'C' },
          { name: 'R1', type: 'R', at: [180, 100], rot: 90, label: 'R' }
        ],
        wires: [[30, 70, 60, 70, 'L1'], [180, 70, 225, 70, '-'],
                [180, 130, 30, 130, 'R1']],
        grounds: [[105, 130]],
        terminals: [{ at: [225, 70], label: 'out' }]
      }
    }),

    notch: (v) => ({
      netlist: `V1 in 0 1\nR1 in out ${v.R}\nL1 out m ${v.L}\nC1 m 0 ${v.C}`,
      probe: { kind: 'node', of: 'out' },
      layout: {
        w: 260, h: 220,
        elements: [
          { name: 'V1', type: 'V', at: [30, 130], rot: 90, label: '1 V' },
          { name: 'R1', type: 'R', at: [90, 70], label: 'R' },
          { name: 'L1', type: 'L', at: [180, 100], rot: 90, label: 'L' },
          { name: 'C1', type: 'C', at: [180, 160], rot: 90, label: 'C' }
        ],
        wires: [[30, 100, 30, 70, 'R1'], [30, 70, 60, 70, 'R1'],
                [120, 70, 180, 70, 'R1'], [180, 70, 225, 70, '-'],
                [180, 190, 30, 190, 'C1'], [30, 190, 30, 160, 'C1']],
        grounds: [[105, 190]],
        terminals: [{ at: [225, 70], label: 'out' }]
      }
    })
  },



  /*
   * The equations this bench uses. `given` records whether the Full
   * reference booklet hands the candidate the formula in the exam.
   */
  equations: {
    XL: { given: true, name: 'Reactance of the inductor', eq: 'X<sub>L</sub> = 2&pi;fL',
          work: d => ['2&pi; &times; <b>' + eng(d.f0, 'Hz', 4) + '</b> &times; <b>' + eng(d.L, 'H', 3) + '</b>',
                      eng(2 * Math.PI * d.f0 * d.L, 'Ω', 4)] },
    XC: { given: true, name: 'Reactance of the capacitor', eq: 'X<sub>C</sub> = 1 / 2&pi;fC',
          work: d => ['1 / (2&pi; &times; <b>' + eng(d.f0, 'Hz', 4) + '</b> &times; <b>' + eng(d.C, 'F', 3) + '</b>)',
                      eng(1 / (2 * Math.PI * d.f0 * d.C), 'Ω', 4)] },
    f0: { given: false, name: 'Resonant frequency', eq: 'f<sub>0</sub> = 1 / 2&pi;<span class="rad">&radic;</span>(LC)',
          work: d => ['1 / 2&pi;<span class="rad">&radic;</span>(<b>' + eng(d.L, 'H', 3) + '</b> &times; <b>' + eng(d.C, 'F', 3) + '</b>)',
                      eng(d.f0, 'Hz', 5)] },
    Lfor: { given: false, name: 'Rearranged for L', eq: 'L = 1 / (2&pi;f<sub>0</sub>)&sup2;C',
          work: d => ['1 / (2&pi; &times; <b>' + eng(d.f0, 'Hz', 4) + '</b>)&sup2; &times; <b>' + eng(d.C, 'F', 3) + '</b>',
                      eng(1 / (Math.pow(2 * Math.PI * d.f0, 2) * d.C), 'H', 4)] },
    Cfor: { given: false, name: 'Rearranged for C', eq: 'C = 1 / (2&pi;f<sub>0</sub>)&sup2;L',
          work: d => ['1 / (2&pi; &times; <b>' + eng(d.f0, 'Hz', 4) + '</b>)&sup2; &times; <b>' + eng(d.L, 'H', 3) + '</b>',
                      eng(1 / (Math.pow(2 * Math.PI * d.f0, 2) * d.L), 'F', 4)] },
    Q: { given: true, name: 'Q factor', eq: 'Q = f<sub>C</sub> / (f<sub>U</sub> &minus; f<sub>L</sub>)',
          work: d => ['<b>' + eng(d.f0, 'Hz', 5) + '</b> / (<b>' + eng(d.fHi, 'Hz', 5) + '</b> &minus; <b>' + eng(d.fLo, 'Hz', 5) + '</b>)',
                      trim(d.Q, 4)] },
    Qlc: { given: false, name: 'Q from the components', eq: 'Q = (1/R)<span class="rad">&radic;</span>(L/C)',
          work: d => ['(1 / <b>' + eng(d.R, 'Ω', 3) + '</b>)<span class="rad">&radic;</span>(<b>' + eng(d.L, 'H', 3) + '</b> / <b>' + eng(d.C, 'F', 3) + '</b>)',
                      trim(d.Q, 4)] },
    Il: { given: false, name: 'Circulating current in a parallel circuit',
          eq: 'I<sub>circ</sub> = Q &times; I<sub>supply</sub>',
          work: d => ['<b>' + trim(d.Q, 4) + '</b> &times; the current fed in',
                      trim(d.Q, 4) + ' times whatever you supply'] },
    Vl: { given: false, name: 'Voltage across the inductor', eq: 'V<sub>L</sub> = Q &times; V<sub>s</sub>',
          work: d => ['<b>' + trim(d.Q, 4) + '</b> &times; <b>1 V</b>', eng(d.Q, 'V', 4)] },
    Zs: { given: false, name: 'Impedance of the series circuit', eq: 'Z = <span class="rad">&radic;</span>(R&sup2; + (X<sub>L</sub> &minus; X<sub>C</sub>)&sup2;)',
          work: d => ['at f<sub>0</sub> the reactances cancel, leaving <b>' + eng(d.R, 'Ω', 3) + '</b>',
                      eng(d.R, 'Ω', 4)] },
    Rd: { given: false, name: 'Dynamic resistance', eq: 'R<sub>D</sub> = L / CR',
          work: d => ['<b>' + eng(d.L, 'H', 3) + '</b> / (<b>' + eng(d.C, 'F', 3) + '</b> &times; <b>' + eng(d.R, 'Ω', 3) + '</b>)',
                      eng(d.L / (d.C * d.R), 'Ω', 4)] },
    fcr: { given: false, name: 'Cut-off of a CR filter', eq: 'f = 1 / 2&pi;RC',
          work: d => ['1 / (2&pi; &times; <b>' + eng(d.Rf, 'Ω', 3) + '</b> &times; <b>' + eng(d.C, 'F', 3) + '</b>)',
                      eng(1 / (2 * Math.PI * d.Rf * d.C), 'Hz', 5)] },
    fL: { given: false, name: 'Half power points', eq: 'f<sub>L</sub>, f<sub>U</sub> where the current is 0.707 of its peak',
          work: d => ['bandwidth = <b>' + eng(d.fHi, 'Hz', 5) + '</b> &minus; <b>' + eng(d.fLo, 'Hz', 5) + '</b>',
                      eng(d.BW, 'Hz', 4)] }
  },


  /* Words this bench introduces, defined where they are first used. */
  terms: {
    'reactance': 'How hard a coil or a capacitor pushes back against an alternating current, measured in ohms like resistance but changing with frequency.',
    'resonance': 'The one frequency at which the reactance of the coil and of the capacitor are equal, so they cancel each other.',
    'tuned circuit': 'A coil and a capacitor connected together, which together favour one frequency over all others.',
    'impedance': 'The total opposition a circuit offers to an alternating current, combining resistance and reactance.',
    'circulating current': 'The current that flows round and round between the coil and the capacitor of a parallel tuned circuit without being drawn from the source.',
    'bandwidth': 'The width of the band of frequencies a tuned circuit accepts, measured between the half power points.',
    'half power point': 'A frequency either side of resonance where the current has fallen to 0.707 of its peak, which is half the power.',
    'Q': 'The centre frequency divided by the bandwidth. It says how sharp the circuit is, and it is also how many times the voltage inside it exceeds the voltage applied.',
    'selectivity': 'How well a circuit picks out one frequency and rejects its neighbours.',
    'dynamic resistance': 'The purely resistive impedance a parallel tuned circuit presents at resonance, once the loss in the coil is allowed for. Also called dynamic impedance.',
    'skin effect': 'The tendency of radio frequency current to travel near the surface of a conductor rather than through all of it, which makes the resistance higher than it is at DC.'
  },

  /* ---- how each panel draws itself ---- */
  panels: {

    reactance(ctx) {
      const { p, d, t, level, values, M, Plot, build, sweep, swatch, ro, Fmt } = ctx;
      const { eng, trim, sci } = Fmt;
      const spec = build('series');
      const fa = d.f0 / 3, fb = d.f0 * 3;
      const n = 320, XL = [], XC = [];
      for (let i = 0; i < n; i++) {
        const f = fa + (fb - fa) * i / (n - 1), w = 2 * Math.PI * f;
        XL.push({ x: f, y: w * d.L });
        XC.push({ x: f, y: Math.min(1 / (w * d.C), d.Z0 * 4) });
      }
      Plot.draw(p.graph, {
        xRange: [fa, fb], xFmt: v => eng(v, 'Hz', 3), tokens: t,
        left: { max: d.Z0 * 3, fmt: v => eng(v, 'Ω', 2) },
        traces: [{ pts: XL, colour: t.trace, axis: 'left' },
                 { pts: XC, colour: t.phase, axis: 'left' }],
        marks: [{ x: d.f0, colour: t.marker }],
        cursor: { x: d.f0, colour: t.marker, label: 'f₀ ' + eng(d.f0, 'Hz', 4) }
      });
      p.legend.innerHTML = swatch(t.trace, 'Reactance of L') + swatch(t.phase, 'Reactance of C') +
                           swatch(t.marker, 'They cross here');
      p.readouts.innerHTML = ro([
        ['Crossing at', eng(d.f0, 'Hz', 5), true],
        ['Reactance there', eng(d.Z0, 'Ω', 4)],
        ['X of L', 'rises with f'],
        ['X of C', 'falls with f']
      ]);
      return spec;
    },

    impedance(ctx) {
      const { p, d, t, level, values, M, Plot, build, sweep, swatch, ro, Fmt } = ctx;
      const { eng, trim, sci } = Fmt;
      const spec = build(p.topology);
      const wide = p.topology === 'parallel';
      const a = Math.max(d.f0 - d.BW * 6, d.f0 * 0.05), b = d.f0 + d.BW * 6;
      const pts = sweep(spec, a, b, 320).map(s => {
        const i = M.abs(M.currentThrough(s.sol, spec.z.i));
        const y = spec.z.mode === 'tank'
          ? M.abs(M.nodeV(s.sol, spec.z.v)) / Math.max(1e-18, i)
          : 1 / Math.max(1e-18, i);
        return { x: s.f, y };
      });
      const peak = Math.max(...pts.map(q => q.y));
      p.legend.innerHTML = swatch(t.trace, wide ? 'Impedance of the tank' : 'Impedance of the loop');
      Plot.draw(p.graph, {
        xRange: [a, b], xFmt: v => eng(v, 'Hz', 4), tokens: t,
        left: { max: peak * 1.1, fmt: v => eng(v, 'Ω', 2) },
        traces: [{ pts, colour: t.trace, fill: t.fill, axis: 'left' }],
        marks: [{ x: d.f0, colour: t.marker }],
        cursor: { x: d.f0, colour: t.marker, label: 'f₀' }
      });
      const at0 = pts.reduce((m, q) => Math.abs(q.x - d.f0) < Math.abs(m.x - d.f0) ? q : m, pts[0]);
      p.readouts.innerHTML = ro([
        ['Connection', wide ? 'Parallel' : 'Series'],
        ['Z at resonance', eng(at0.y, 'Ω', 4), true],
        ['Behaviour', wide ? 'maximum' : 'minimum'],
        ['Resonance', eng(d.f0, 'Hz', 5)]
      ]);
      return spec;
    },

    energy(ctx) {
      const { p, d, t, level, values, M, Plot, build, sweep, swatch, ro, Fmt } = ctx;
      const { eng, trim, sci } = Fmt;
      const spec = build('parallel');
      // natural response of the parallel LCR, integrated directly
      const steps = 900, T = 6 / d.f0, dt = T / steps;
      const eC = [], eL = [], eT = [];
      let v = 1, iL = 0;
      for (let i = 0; i < steps; i++) {
        const tt = i * dt;
        eC.push({ x: tt, y: 0.5 * d.C * v * v });
        eL.push({ x: tt, y: 0.5 * d.L * iL * iL });
        eT.push({ x: tt, y: 0.5 * d.C * v * v + 0.5 * d.L * iL * iL });
        // symplectic update: advance the current first, then use the new
        // value for the voltage. Plain Euler slowly adds energy to an
        // oscillator, which would be an embarrassing thing for this panel to do.
        iL += (v / d.L) * dt;
        v += ((-iL - v / (d.Z0 * d.Q)) / d.C) * dt;
      }
      const peak = 0.5 * d.C;
      Plot.draw(p.graph, {
        xRange: [0, T], xFmt: x => eng(x, 's', 2), tokens: t,
        left: { max: peak * 1.15, fmt: y => eng(y, 'J', 2) },
        traces: [
          { pts: eT, colour: t.faint, width: 1.2, axis: 'left' },
          { pts: eC, colour: t.trace, fill: t.fill, axis: 'left' },
          { pts: eL, colour: t.phase, axis: 'left' }
        ],
        cursor: null
      });
      p.legend.innerHTML = swatch(t.trace, 'Energy in C') + swatch(t.phase, 'Energy in L') +
                           swatch(t.faint, 'Total');
      p.readouts.innerHTML = ro([
        ['Swaps per second', eng(d.f0, 'Hz', 5), true],
        ['Peak energy', eng(peak, 'J', 3)],
        ['Lost through', eng(d.R, 'Ω', 3)],
        ['Cycles shown', '6']
      ]);
      return spec;
    },

    resonance(ctx) {
      const { p, d, t, level, values, M, Plot, build, sweep, swatch, ro, Fmt } = ctx;
      const { eng, trim, sci } = Fmt;
      const spec = build('series');
      const span = Math.min(Math.max(8 * d.BW, d.f0 * 0.02), d.f0 * 1.9);
      const fa = Math.max(d.f0 - span / 2, d.f0 * 0.02), fb = d.f0 + span / 2;
      const s = sweep(spec, fa, fb, 400);
      const peak = Math.max(...s.map(q => q.mag));
      const fc = p.cursor === null ? d.f0 : fa + (fb - fa) * p.cursor;
      const at = probeAt(spec, fc);
      const at0 = probeAt(spec, d.f0);
      Plot.draw(p.graph, {
        xRange: [fa, fb], xFmt: v => eng(v, 'Hz', 4), tokens: t,
        left: { max: peak * 1.08, fmt: v => eng(v, 'A', 3) },
        right: { min: -90, max: 90, fmt: v => Math.round(v) + '°' },
        traces: [
          { pts: s.map(q => ({ x: q.f, y: q.ph * 180 / Math.PI })), colour: t.phase, axis: 'right', width: 1.6 },
          { pts: s.map(q => ({ x: q.f, y: q.mag })), colour: t.trace, fill: t.fill, axis: 'left' }
        ],
        bands: [{ from: d.fLo, to: d.fHi, colour: t.marker }],
        marks: [{ x: d.fLo, colour: t.marker }, { x: d.fHi, colour: t.marker }],
        cursor: { x: fc, colour: t.marker, dot: { y: at.mag, axis: 'left' },
                  label: p.cursor === null ? 'f₀' : eng(fc, 'Hz', 4) }
      });
      p.legend.innerHTML = swatch(t.trace, 'Current') + swatch(t.phase, 'Phase') +
                           swatch(t.marker, 'Half power points');
      const rows = [
        ['Resonance f₀', eng(d.f0, 'Hz', 5)],
        ['Q factor', trim(d.Q, 4)],
        ['Bandwidth', eng(d.BW, 'Hz', 4)]
      ];
      if (level === 'full') rows.push(['V across L at f₀', eng(at0.vl, 'V', 4), true]);
      else rows.push(['Selectivity', 'f₀ / BW = ' + trim(d.Q, 3)]);
      p.readouts.innerHTML = ro(rows);
      return spec;
    },

    filter(ctx) {
      const { p, d, t, level, values, M, Plot, build, sweep, swatch, ro, Fmt } = ctx;
      const { eng, trim, sci } = Fmt;
      const spec = build(p.topology, { R2: values.R * 100 });
      // declared after isCR below
      const isCR = p.topology === 'lowpass' || p.topology === 'highpass';
      const Rf = values.R * 100;
      const fRef = isCR ? 1 / (2 * Math.PI * Rf * d.C) : d.f0;
      const fa = fRef / 12, fb = fRef * 12;
      const n = 340, pts = [];
      for (let i = 0; i < n; i++) {
        const f = fa * Math.pow(fb / fa, i / (n - 1));
        const sol = M.solveAt(spec.circuit, f);
        const db = Math.max(-60, 20 * Math.log10(Math.max(1e-9, M.abs(M.nodeV(sol, 'out')))));
        pts.push({ x: Math.log10(f), y: db });
      }
      Plot.draw(p.graph, {
        xRange: [Math.log10(fa), Math.log10(fb)],
        xFmt: v => eng(Math.pow(10, v), 'Hz', 3), tokens: t,
        left: { max: 66, fmt: v => Math.round(v - 60) + ' dB' },
        traces: [{ pts: pts.map(q => ({ x: q.x, y: q.y + 60 })), colour: t.trace, fill: t.fill, axis: 'left' }],
        marks: [{ x: Math.log10(fRef), colour: t.marker }],
        cursor: { x: Math.log10(fRef), colour: t.marker,
                  label: (isCR ? 'cut-off ' : 'f₀ ') + eng(fRef, 'Hz', 4) }
      });
      const name = { lowpass: 'Low pass', highpass: 'High pass',
                     bandpass: 'Band pass', notch: 'Notch' }[p.topology];
      p.legend.innerHTML = swatch(t.trace, 'Output relative to input') +
                           swatch(t.marker, isCR ? 'Cut-off' : 'Centre frequency');
      p.readouts.innerHTML = ro([
        ['Filter', name],
        [isCR ? 'Cut-off' : 'Centre', eng(fRef, 'Hz', 5), true],
        ['Resistor', eng(isCR ? Rf : values.R, 'Ω', 3)],
        ['Shape set by', isCR ? 'R and C' : 'Q = ' + trim(d.Q, 3)]
      ]);
      return spec;
    }
  },

  /* ---- the five items, in reading order ---- */
  items: [
    {
      code: '2H1',
      levels: ['intermediate', 'full'],
      introduces: {
        intermediate: ['reactance', 'resonance', 'tuned circuit'],
        full: []
      },
      panel: 'reactance',
      circuit: 'series',
      heading: { intermediate: 'Reactance, and where the two curves cross',
                 full: 'Calculating the resonant frequency' },
      lead: {
        intermediate: 'Start with what each component does on its own, because the rest of this page follows from the one point where they meet.',
        full: 'Start with the crossing point, then put a number on it.'
      },
      headline: {
        intermediate: 'An inductor and capacitor together make a tuned circuit. At one frequency their reactances match.',
        full: 'Finding the resonant frequency, or the L or C you need to land on one.'
      },
      formulas: {
        intermediate: ['XL', 'XC'],
        full: ['XL', 'XC', 'f0', 'Lfor', 'Cfor']
      },
      workLead: {
        intermediate: 'Take each component on its own first, then compare the two.',
        full: 'Each line follows from the one above it: the two reactances, the frequency where they are equal, then that same result rearranged for whichever value the question leaves out.'
      },
      workNote: {
        intermediate: 'Both of these are printed in the booklet you get in the exam. Set them equal to one another and you have found resonance, which is what this level asks for.',
        full: 'The booklet gives you the two reactance formulas. It does not give you the resonant frequency, so that one has to be committed to memory, along with both of its rearrangements.'
      },
      explain: {
        intermediate: [
          'Inductive reactance climbs as the frequency rises. Capacitive reactance falls. Plot them on the same axes and they cross exactly once.',
          'That crossing is resonance, and the reason they cancel is a matter of timing. The voltage across a capacitor lags the current by a quarter of a cycle, and the voltage across an inductor leads it by a quarter. The two are therefore half a cycle apart, so they subtract rather than add, and where their sizes are equal as well the pair cancels completely.',
          'Drag L or C and watch the crossing slide along. Make either one larger and it moves down in frequency.'
        ],
        full: [
          'Setting 2&pi;fL equal to 1/(2&pi;fC) and solving for f gives the formula above. Watch the two values inside the square root as you move the sliders.',
          'Only the product LC appears in it. Halve C and double L and the answer does not move, which is worth trying before you believe it.',
          'The exam asks this in all three directions, so both rearrangements are worked out above using whatever you have set.'
        ]
      },
      highlight: ['L1', 'C1']
    },

    {
      code: '2H2',
      levels: ['intermediate', 'full'],
      introduces: {
        intermediate: ['impedance', 'circulating current'],
        full: []
      },
      panel: 'impedance',
      circuit: 'series',
      toggle: { label: 'Connection', options: [['series', 'Series'], ['parallel', 'Parallel']] },
      heading: { intermediate: 'Series and parallel resonance compared',
                 full: 'The crystal as a tuned circuit' },
      lead: {
        intermediate: 'The reactances cancel whichever way you wire them. What happens next depends entirely on whether they sit in line or side by side.',
        full: 'Nature gets there first. A slice of quartz behaves like both connections at once.'
      },
      headline: {
        intermediate: 'At resonance a series circuit shows low impedance and a parallel one shows high impedance.',
        full: 'A crystal behaves like a tuned circuit, with a series and a parallel resonance close together.'
      },
      formulas: {
        intermediate: ['XL', 'XC', 'Zs'],
        full: ['Zs']
      },
      workLead: {
        intermediate: 'The two reactances first, then what is left once they cancel.',
        full: 'Whichever way it is wired, the cancellation is the same. What differs is what remains.'
      },
      workNote: {
        intermediate: 'Switch the circuit to parallel and the same cancellation gives the opposite result. In series the impedance falls to R. In parallel the two branches carry equal and opposite currents that circulate between them rather than being drawn from the source, so little arrives from outside and the impedance looks high.',
        full: 'A crystal carries a further capacitance across the whole thing, from its holder and its electrodes. That is what gives it a second resonance a few kilohertz above the first.'
      },
      explain: {
        intermediate: [
          'Switch between the two connections and watch the curve turn inside out. Watch the charge as well: in parallel the dots between the coil and the capacitor keep moving while very few arrive from the source.',
          'That circulating current is the whole difference. The same voltage sits across both branches, and their currents are half a cycle apart, so in the supply arm they very nearly cancel. With perfect components they would cancel exactly and nothing at all would be drawn from the source, which is another way of saying the impedance would be infinite.',
          'Real coils have resistance, so the two currents do not quite match and a little is drawn after all. That is why a parallel tuned circuit shows a high impedance rather than an infinite one, and why the loss in the coil decides how high.',
          'These are the two response curves the syllabus asks you to identify. The shape alone tells you which connection you are looking at.'
        ],
        full: [
          'A quartz crystal is a tuned circuit that happens to be made of rock. Its equivalent circuit is a series L, C and R, with another capacitance across the lot.',
          'So it has two resonances a few kilohertz apart. At the series one its impedance dips. At the parallel one just above, it peaks.',
          'Crystals are ground for one or the other. Put a series crystal in a circuit expecting parallel operation and it will not sit on its marked frequency.'
        ]
      },
      highlight: ['L1', 'C1']
    },

    {
      code: '2H3',
      levels: ['intermediate'],
      panel: 'energy',
      circuit: 'parallel',
      heading: { intermediate: 'Energy exchange between the coil and the capacitor' },
      lead: {
        intermediate: 'That circulating current is easier to picture if you stop thinking about frequency for a moment and follow the energy instead.'
      },
      headline: {
        intermediate: 'Energy swaps back and forth between capacitor and coil. Larger values give a lower frequency.'
      },
      formulas: { intermediate: [] },
      workNote: {
        intermediate: 'There is no working to show here, and that is deliberate. The syllabus states that the resonant frequency formula is not required at this level. What it does ask for is the direction: increase L or C and the frequency comes down.'
      },
      explain: {
        intermediate: [
          'Charge the capacitor and let it go. It pushes current into the coil, which builds a magnetic field around it. When the capacitor is empty the field collapses, drives the current onward, and charges the capacitor the other way round.',
          'The two stores take turns. The total would stay put for ever if the resistance were not quietly turning some of it into heat on every pass, which is the slow decline on the trace.',
          'The number of times a second it changes hands is the resonant frequency. Increase L or C and each exchange takes longer, so that number comes down.'
        ]
      },
      highlight: ['L1', 'C1']
    },

    {
      code: '2H4',
      levels: ['intermediate', 'full'],
      introduces: {
        intermediate: ['bandwidth', 'Q', 'selectivity'],
        full: ['half power point', 'skin effect']
      },
      panel: 'resonance',
      circuit: 'series',
      heading: { intermediate: 'Bandwidth, selectivity and Q',
                 full: 'Q as a magnification factor' },
      lead: {
        intermediate: 'A tuned circuit does not pick out one frequency and refuse all others. It accepts a band, and the width of that band is what makes it useful.',
        full: 'The sharpness has a second consequence, and it is the one that catches people out.'
      },
      headline: {
        intermediate: 'Selectivity, and how the bandwidth compares with the frequency at the centre of it.',
        full: 'Q as magnification. The voltages inside a tuned circuit can dwarf the one you put in.'
      },
      formulas: {
        intermediate: ['fL', 'Q'],
        full: ['Q', 'Qlc', 'Vl', 'Il']
      },
      workLead: {
        intermediate: 'Find the two half power frequencies first. Q falls out of the gap between them.',
        full: 'Q first, then the same Q from the components, then what that magnification does to the voltage inside the circuit.'
      },
      workNote: {
        intermediate: 'Q is given to you in the exam in exactly this form: the centre frequency divided by the bandwidth. Drag R and watch the two half power frequencies move apart while the centre stays exactly where it was.',
        full: 'The two forms of Q agree, which is a useful check. The first is the one printed in the booklet. The second shows why R alone controls the sharpness, because it is the only term that plays no part in the resonant frequency.'
      },
      explain: {
        intermediate: [
          'The band is measured between the half power points, where the current has fallen to 0.707 of its peak. Divide the centre frequency by that width and you have Q.',
          'Drag R and watch the shaded band widen and narrow while the peak stays put. Of the three components, R is the only one that changes the sharpness.',
          'It is worth knowing where that R comes from. Mostly it is the resistance of the coil, and at radio frequencies it is higher than a meter would tell you, because the current crowds towards the surface of the wire instead of using the whole thickness. That is the skin effect, and it gets worse as the frequency rises.',
          'A higher Q means a more selective circuit, and that is what lets a receiver separate one station from its neighbour.'
        ],
        full: [
          'Q is measured between the half power points, the two frequencies either side of resonance where the current has fallen to 0.707 of its peak. The centre frequency divided by the gap between them is Q, and both figures can be read straight off a response curve.',
          'Q is also a magnification factor, and this is where it stops being an abstraction. One volt goes in. Look at the voltage across the inductor.',
          'The same voltage appears across the capacitor, in antiphase. The two cancel exactly, which is precisely why the impedance of the whole circuit collapses to R.',
          'The same multiplication happens to current, but in a parallel tuned circuit rather than a series one. There the current circulating between the coil and the capacitor is Q times the current drawn from the source. Feed 100 microamps into a circuit with a Q of 80 and about 8 milliamps is going round inside it.',
          'That is why tuned circuits in a transmitter need components rated far above the supply voltage and the supply current. An antenna matching unit passing high power is the everyday case: the current going round inside it is many times the current arriving from the transmitter, which is why its components are so much larger than the power alone would suggest.'
        ]
      },
      highlight: { intermediate: ['R1'], full: ['L1', 'C1'] }
    },

    {
      code: '2H5',
      levels: ['intermediate', 'full'],
      introduces: {
        intermediate: [],
        full: ['dynamic resistance']
      },
      panel: 'filter',
      circuit: 'lowpass',
      toggle: {
        label: 'Filter',
        options: [['lowpass', 'Low pass'], ['highpass', 'High pass'],
                  ['bandpass', 'Band pass'], ['notch', 'Notch']]
      },
      heading: { intermediate: 'Low pass, high pass, band pass and notch',
                 full: 'Dynamic resistance at resonance' },
      lead: {
        intermediate: 'Everything so far has been one circuit looked at from different angles. Put the same parts to work and you have the four filters the exam asks you to recognise.',
        full: 'One number decides how deep a notch you can actually cut, and it is not one of the three on the sliders.'
      },
      headline: {
        intermediate: 'Low pass, high pass, band pass and notch filters, and the shape each response takes.',
        full: 'Dynamic resistance, and what it means at resonance.'
      },
      formulas: {
        intermediate: ['fcr'],
        full: ['Rd']
      },
      workNote: {
        intermediate: 'That cut-off formula applies to the two CR filters. The band pass and the notch are tuned circuits, so their centre is the resonant frequency you already have, and R sets how narrow they are.',
        full: 'A real coil has resistance, so a parallel tuned circuit is never a true open circuit. What is left at resonance is this purely resistive value. A lower loss coil gives a higher dynamic resistance, a deeper notch and a narrower pass band.'
      },
      explain: {
        intermediate: [
          'Switch between the four and watch the circuit and the curve change together. The cut-off is marked where the output has fallen to 0.707 of the input, the same half power point as before.',
          'The band pass and the notch are the two connections from earlier, put to work. A series LC in the signal path lets a band through. A series LC to ground swallows one.',
          'Watch the charge on the notch. At the centre frequency almost all of it goes to ground through the coil and capacitor instead of reaching the output.'
        ],
        full: [
          'The dynamic resistance, sometimes called the dynamic impedance, is what a parallel tuned circuit really looks like at resonance once you allow for the resistance in the coil. It is purely resistive, which is the whole point of the name, and it only means anything at that one frequency. Move away from resonance and the impedance turns reactive again, so there is no dynamic resistance to speak of.',
          'It depends on the ratio of L to C as well as on the loss, so two circuits resonating on the same frequency can present very different values.',
          'This is the number that decides how deep a notch you can cut, and it is why a low loss coil matters as much in a filter as anywhere else.'
        ]
      },
      highlight: []
    }
  ],


  /*
   * Our own explanation of each answer, keyed by the bank's reference number.
   * The question, its options and the marked answer are the RSGB's and ship
   * unadapted. Everything here is ours.
   *
   * `seed` sets the bench to the values in the question, where they fall
   * inside the range of the sliders. Four of the eleven do. The rest are
   * asked in words rather than numbers, so there is nothing to set.
   */
  answers: {
    '2025-Full129': {
      why: 'A trap is a tuned circuit, so it has to resonate on the frequency you want it to reject. You know f and L, so rearrange the resonance formula for C.',
      working: ['C = 1 / (2&pi;f)&sup2;L',
                '= 1 / (2&pi; &times; 14 MHz)&sup2; &times; 2 &micro;H',
                '= 64.6 pF, so 64 pF is the nearest offered'],
      source: { eq: ['Cfor'], from: ['2H1'] },
      seed: { L: 2e-6, C: 64e-12 },
      seedNote: 'Set the bench to 2 &micro;H and 64 pF and read the resonant frequency.'
    },
    '2025-Full130': {
      why: 'Frequency falls as capacitance rises, so the lowest frequency comes from the largest capacitance in the range. Use 50 pF, not 5 pF.',
      working: ['f = 1 / 2&pi;&radic;(LC)',
                '= 1 / 2&pi;&radic;(5 &micro;H &times; 50 pF)',
                '= 10.1 MHz'],
      source: { eq: ['f0'], from: ['2H1'],
                note: 'The largest capacitance gives the lowest frequency.' },
      seed: { L: 5e-6, C: 50e-12 },
      seedNote: 'Set the bench to 5 &micro;H and 50 pF, then drag C down to 5 pF to see the other end of the range.'
    },
    '2025-Full132': {
      why: 'Resonance depends on the product of L and C, and the product is under a square root on the bottom of the fraction, so making either one larger brings the frequency down. The other three options all decrease something, and decreasing either L or C sends the frequency up instead.',
      source: { eq: ['f0'], from: ['2H1'],
                note: 'Only the product LC appears, so it makes no difference which of the two you change.' },
      seedNote: 'The values in this question sit outside the sliders, but drag L and C in opposite directions and watch the frequency stay put.'
    },
    '2025-Full144': {
      source: { from: ['2H2'] },
      why: 'A crystal has a series L, C and R for the mechanical resonance, plus a further capacitance across it from the holder and electrodes. That second capacitance is what gives it a parallel resonance a few kilohertz above the series one.'
    },
    '2025-Full147': {
      source: { from: ['2H2'] },
      why: 'Only the crystal has two resonances of its own. The others are single components with no tuned circuit inside them.'
    },
    '2025-Full3573': {
      source: { from: ['2H2'] },
      why: 'Series L, C and R with a capacitance across the whole group is the standard equivalent circuit for a crystal. The extra capacitor across it is the giveaway, because a plain series resonant circuit does not have one.'
    },
    '2025-Full134': {
      why: 'The curve is marked with everything needed: where it is centred, and how wide it is between the two points where the response has fallen to 0.707 of the peak. Q is the first divided by the second, so both figures have to be in the same units before dividing.',
      working: ['Q = f<sub>C</sub> / (f<sub>U</sub> &minus; f<sub>L</sub>)',
                'the curve is centred on 10 MHz and is 200 kHz wide at 0.707 of the peak',
                '= 10 MHz / 200 kHz = 10,000 kHz / 200 kHz',
                '= 50'],
      source: { eq: ['Q'], from: ['2H4'] },
      seed: { R: 6.283, L: 14.14e-6, C: 141.4e-12 },
      seedNote: 'The bench is set to a Q of about 50 so you can compare the shape with the one in the question.'
    },
    '2025-Full150': {
      why: 'At resonance the voltage across the coil and across the capacitor is Q times the applied voltage, and in a parallel circuit the current circulating between them is Q times the current drawn from the source. Both can be far larger than anything you put in, so the components have to be rated for it.',
      source: { eq: ['Vl', 'Il'], from: ['2H4'] },
      seedNote: 'Wind R down on the bench and watch the voltage across the inductor climb.'
    },
    '2025-Full691': {
      why: 'In a parallel tuned circuit the circulating current is Q times the current supplied. Multiply, do not divide.',
      working: ['circulating current = Q &times; supply current',
                '= 80 &times; 100 &micro;A',
                '= 8 mA'],
      source: { eq: ['Il'], from: ['2H4', '2H2'] },
      seed: { R: 3.927, L: 5e-6, C: 50.66e-12 },
      seedNote: 'Set the bench to a Q of 80 resonating at 10 MHz, which is the circuit this question describes.'
    },
    '2025-Full138': {
      source: { eq: ['Rd'], from: ['2H5'] },
      why: 'Dynamic resistance is what is left of a parallel tuned circuit at resonance once the loss in the coil is accounted for. Away from resonance the impedance is reactive rather than resistive, so the idea only applies at the one frequency.'
    },
    '2025-Full139': {
      source: { eq: ['Rd'], from: ['2H5'] },
      why: 'It describes the purely resistive impedance a parallel tuned circuit shows at resonance. A series circuit at resonance simply shows its own R, which needs no special name.'
    }
  },

  outro: {
    intermediate: [
      'All five of those came from one fact: at a single frequency the coil and the capacitor cancel. Everything else was a consequence, whether that was the shape of a curve, the direction the charge moved, or which filter you ended up with.',
      'It is also why the same handful of parts turn up all over a radio. Once you can see what a tuned circuit does, an oscillator, an IF stage and an antenna trap stop looking like separate topics.'
    ],
    full: [
      'All five came from one fact: at a single frequency the reactances cancel. What changes between them is what you do with that.',
      'Two things are worth carrying forward. The resonant frequency formula is not in the reference booklet, so it has to be remembered. And the voltage inside a tuned circuit can be many times the voltage you put in, which is a component rating problem long before it is an exam question.'
    ]
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = BENCH;
if (typeof window !== 'undefined') window.BENCH = BENCH;
