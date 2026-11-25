/*
 * fixtures/line.js - a transmitter feeding a load through a length of feeder,
 * drawn with the TL symbol, coax and twin, for test-flow.js and both
 * checkers. The feeder is cut into sections in the netlist, and the drawing
 * names each section's current, so the charge shows the standing wave.
 * Not a page: build.py only builds content/.
 *
 * Run: node check-layouts.js fixtures/line.js
 *      node check-flow.js fixtures/line.js
 */

const SECTIONS = 6;

function lineNet(z0, load) {
  let net = 'V1 s 0 1\nRS s n0 ' + z0 + '\n';
  for (let k = 1; k <= SECTIONS; k++) {
    net += 'T' + k + ' n' + (k - 1) + ' 0 n' + k + ' 0 ' + z0 + ' len=2 vf=0.67 db=4 at=10M\n';
  }
  return net + 'RL n' + SECTIONS + ' 0 ' + load;
}

function lineLayout(twin) {
  const along = [];
  for (let k = 1; k <= SECTIONS; k++) along.push('T' + k);
  return {
    w: 310, h: 120,
    elements: [
      { name: 'V1', type: 'V', at: [30, 60], rot: 90, label: 'TX' },
      { name: 'RS', type: 'R', at: [80, 30], label: 'source' },
      { name: 'FL', type: 'TL', at: [190, 30], len: 120, label: 'feeder', twin: !!twin,
        flow: ['T1', 'RL'], along: along },
      { name: 'RL', type: 'R', at: [290, 60], rot: 90, label: 'load' }
    ],
    wires: [[30, 30, 50, 30, 'RS'], [110, 30, 130, 30, 'RS'],
            [130, 46, 130, 90, 'T1'], [130, 90, 30, 90, 'T1'],
            [250, 30, 290, 30, 'RL'],
            [290, 90, 250, 90, 'RL'], [250, 90, 250, 46, 'RL']],
    grounds: [[30, 90]]
  };
}

const BENCH = {
  lineNet, lineLayout, SECTIONS,
  allLayouts: () => [
    { name: 'coax, mismatched', layout: lineLayout(false), netlist: lineNet(50, 100),
      flow: { mode: 'ac' } },
    { name: 'twin, matched', layout: lineLayout(true), netlist: lineNet(450, 450),
      flow: { mode: 'ac' } }
  ]
};

if (typeof module !== 'undefined' && module.exports) module.exports = BENCH;
