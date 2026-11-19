/*
 * fixtures/new-modes.js - layouts that use the switch, meter, neon and
 * transformer symbols and the 'dc' and 'time' charge modes, for
 * test-flow.js and both checkers. Not a page: build.py only builds content/.
 *
 * Run: node check-layouts.js fixtures/new-modes.js
 *      node check-flow.js fixtures/new-modes.js
 */

/* A supply, a switch, R1, then a meter and R2 in one leg and R3 in the other. */
function divider(open) {
  const lay = {
    w: 300, h: 210,
    elements: [
      { name: 'V1', type: 'B', at: [30, 100], rot: 90, label: 'supply' },
      { name: 'S1', type: 'S', at: [90, 40], label: 'S1', open: open, flow: open ? undefined : 'R1' },
      { name: 'R1', type: 'R', at: [150, 40], label: 'R1' },
      { name: 'RM', type: 'M', at: [210, 70], rot: 90, meter: 'mA', label: 'meter' },
      { name: 'R2', type: 'R', at: [210, 130], rot: 90, label: 'R2' },
      { name: 'R3', type: 'R', at: [270, 100], rot: 90, label: 'R3' }
    ],
    wires: [
      [30, 70, 30, 40, 'R1'], [30, 40, 60, 40, 'R1'],
      [180, 40, 210, 40, 'R1'], [210, 40, 270, 40, 'R3'],
      [270, 40, 270, 70, 'R3'],
      [270, 130, 270, 160, 'R3'], [270, 160, 210, 160, 'R3'],
      [210, 160, 30, 160, 'R1'], [30, 160, 30, 130, 'R1']
    ]
  };
  // open, nothing flows anywhere, and the layout has to say so
  if (open) {
    lay.wires.forEach(w => { w[4] = '-'; });
    lay.elements.forEach(e => { if (e.type !== 'B' && e.type !== 'S') e.flow = '-'; });
  }
  return lay;
}
const DIVIDER_NET = 'V1 a 0 12\nR1 a b 1000\nRM b c 0.001\nR2 c 0 2000\nR3 b 0 2000';

/* A capacitor charging through R, with a neon across it that has not struck. */
function rc() {
  return {
    w: 300, h: 200,
    elements: [
      { name: 'V1', type: 'B', at: [30, 100], rot: 90, label: 'supply' },
      { name: 'R1', type: 'R', at: [110, 70], label: 'R' },
      { name: 'C1', type: 'C', at: [190, 100], rot: 90, label: 'C', flow: 'R1' },
      { name: 'N1', type: 'N', at: [260, 100], rot: 90, label: 'neon', flow: '-' }
    ],
    wires: [[30, 70, 80, 70, 'R1'], [140, 70, 190, 70, 'R1'], [190, 70, 260, 70, '-'],
            [190, 130, 30, 130, 'R1'], [260, 130, 190, 130, '-']]
  };
}
const TAU = 1e-3;
const RC_CURRENT = t => ({ R1: t < 5 * TAU ? 0.012 * Math.exp(-t / TAU)
                                           : -0.012 * Math.exp(-(t - 5 * TAU) / TAU) });

/* A transformer feeding a load through a switch. */
function transformer(open) {
  const s = open ? '-' : 'IS';
  return {
    w: 300, h: 200,
    elements: [
      { name: 'V1', type: 'V', at: [30, 100], rot: 90, label: 'mains' },
      { name: 'T1', type: 'T', at: [140, 100], label: 'T1', humps: [6, 3], dots: true,
        flow: ['IP', s], flowReversed: [false, true] },
      { name: 'S1', type: 'S', at: [210, 70], label: 'S1', open: open, flow: open ? undefined : 'IS' },
      { name: 'RL', type: 'R', at: [270, 100], rot: 90, label: 'load', flow: s }
    ],
    wires: [[30, 70, 120, 70, 'IP'], [120, 130, 30, 130, 'IP'],
            [160, 70, 180, 70, s], [240, 70, 270, 70, s], [270, 130, 160, 130, s]]
  };
}

const BENCH = {
  divider, rc, transformer, DIVIDER_NET, RC_CURRENT, TAU,
  allLayouts: () => [
    { name: 'divider, solved at 0 Hz', layout: divider(false), netlist: DIVIDER_NET,
      flow: { mode: 'dc' } },
    { name: 'divider, switch open', layout: divider(true),
      flow: { mode: 'dc', currents: { R1: 0, R3: 0 } } },
    { name: 'CR charge and discharge', layout: rc(),
      flow: { mode: 'time', duration: 10 * TAU, currents: RC_CURRENT } },
    { name: 'transformer on load', layout: transformer(false),
      flow: { mode: 'ac', currents: { IP: { re: 0.1, im: 0 }, IS: { re: 0.5, im: 0 } } } },
    { name: 'transformer off load', layout: transformer(true),
      flow: { mode: 'ac', currents: { IP: { re: 0.01, im: -0.01 } } } }
  ]
};

if (typeof module !== 'undefined' && module.exports) module.exports = BENCH;
