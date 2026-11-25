/*
 * fixtures/psu.js - layouts using the power supply symbols: a tapped
 * transformer, a three terminal regulator box and a mirrored transistor,
 * with time series currents from the transient solver, for test-flow.js and
 * both checkers. Not a page: build.py only builds content/.
 *
 * Run: node check-layouts.js fixtures/psu.js
 *      node check-flow.js fixtures/psu.js
 */
const Tran = (typeof window !== 'undefined' && window.Tran) || require('../tran.js');

/* A centre-tap rectifier: each half of the winding feeds its own diode. */
function centreTap() {
  return {
    w: 300, h: 200, labelPx: 15,
    elements: [
      { name: 'TX', type: 'T', at: [80, 100], tap: true, flow: ['IP', 'D1', 'D2'], flowReversed: [false, true, false] },
      { name: 'D1', type: 'D', at: [160, 40] },
      { name: 'D2', type: 'D', at: [160, 160] },
      { name: 'RL', type: 'R', at: [240, 100], rot: 90 }
    ],
    wires: [[30, 70, 60, 70, 'IP'], [60, 130, 30, 130, 'IP'],
            [100, 70, 100, 40, 'D1'], [100, 40, 130, 40, 'D1'], [190, 40, 240, 40, 'D1'], [240, 40, 240, 70, 'RL'],
            [100, 130, 100, 160, 'D2'], [100, 160, 130, 160, 'D2'], [190, 160, 270, 160, 'D2'],
            [270, 160, 270, 40, 'D2'], [270, 40, 240, 40, 'D2'],
            [240, 130, 120, 130, 'RL'], [120, 130, 120, 100, 'RL'], [120, 100, 100, 100, 'RL']],
    terminals: [{ at: [30, 70], label: 'L', align: 'right' }, { at: [30, 130], label: 'N', align: 'right' }]
  };
}
const CT_NET = 'VA s1 0 0\nVB s2 0 0\nRA s1 a 0.3\nRB s2 b 0.3\nD1 a p\nD2 b p\nRL p 0 100';

/* The diode currents, each half's leakage drawn as nothing, and the rest from them. */
function centreTapCurrents() {
  const s = t => 17 * Math.sin(2 * Math.PI * 50 * t);
  const r = Tran.run(Tran.parse(CT_NET), { dt: 5e-5, tStop: 0.02, sources: { VA: s, VB: t => -s(t) } });
  const on = v => v > 2e-3 ? v : 0;
  return t => {
    const d1 = on(Tran.at(r, r.i.D1, t)), d2 = on(Tran.at(r, r.i.D2, t));
    return { D1: d1, D2: d2, RL: d1 + d2, IP: (d1 - d2) * 12 / 230 };
  };
}

/* A regulator box feeding a load, with its small common current. */
function regulator() {
  return {
    w: 260, h: 140,
    elements: [
      { name: 'U1', type: 'U', at: [120, 50], text: '7812' },
      { name: 'RL', type: 'R', at: [200, 80], rot: 90 }
    ],
    wires: [[40, 50, 90, 50, 'IN'], [150, 50, 200, 50, 'RL'], [120, 80, 120, 110, 'UG'],
            [200, 110, 120, 110, 'RL'], [120, 110, 40, 110, 'IN']],
    terminals: [{ at: [40, 50], label: 'in', align: 'right' }, { at: [40, 110], label: '0 V', align: 'right' }]
  };
}

function allLayouts() {
  return [
    { name: 'centre tap', layout: centreTap(),
      flow: { mode: 'time', duration: 0.02, hideStill: true, currents: centreTapCurrents() } },
    { name: 'regulator box', layout: regulator(),
      flow: { mode: 'dc', currents: { IN: 1.005, RL: 1, UG: 0.005 } } }
  ];
}

const API = { centreTap, centreTapCurrents, regulator, allLayouts, CT_NET };
if (typeof module !== 'undefined' && module.exports) module.exports = Object.assign(API, { allLayouts });
