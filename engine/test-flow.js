/*
 * test-flow.js - symbols, terminal positions, the three charge modes and the
 * circuit checkers' handling of them.
 * Run: node test-flow.js
 */
const S = require('./schematic.js');
const F = require('./flow.js');
const MNA = require('./mna.js');
global.window = { Fmt: require('./format.js'), MNA: MNA, Schematic: S, Flow: F };
const { checkLayout: joined } = require('./check-layouts.js');
const { checkLayout: alive } = require('./check-flow.js');
const FX = require('./fixtures/new-modes.js');

let pass = 0, fail = 0;
function near(label, got, want, tol) {
  tol = tol === undefined ? 1e-6 : tol;
  const ok = Math.abs(got - want) <= tol * Math.max(1, Math.abs(want));
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(56)} got ${Number(got).toPrecision(7)}  want ${Number(want).toPrecision(7)}`);
}
function is(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(56)} got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`);
}
const has = (list, text) => list.some(p => p.indexOf(text) >= 0);

/* A canvas context that records where dots land, and nothing else. */
function recorder() {
  const dots = [];
  const noop = () => {};
  return {
    dots, beginPath: noop, fill: noop, stroke: noop, moveTo: noop, lineTo: noop,
    arc: (x, y) => dots.push([x, y]), set fillStyle(v) {}, set globalAlpha(v) {}
  };
}
/* Where the first dot sits along a horizontal run from x = 0, for a flow. */
function firstDot(flow, name) {
  const ctx = recorder();
  F.draw(ctx, { elements: [], wires: [[0, 0, 200, 0, name || 'W']] },
         Object.assign({ colour: '#000' }, flow), 60);
  return ctx.dots.length ? ctx.dots[0][0] : null;
}

/* ---- 1. terminals ---- */
console.log('\nterminals');
{
  is('a resistor across the page', S.pins({ type: 'R', at: [100, 50] }), [[70, 50], [130, 50]]);
  is('a resistor at rot 90 runs top to bottom', S.pins({ type: 'R', at: [100, 50], rot: 90 }),
     [[100, 20], [100, 80]]);
  is('a transistor keeps its three pins', S.pins({ type: 'Q', at: [100, 100] }),
     [[70, 100], [112, 68], [112, 132]]);
  is('a transformer: primary left, secondary right', S.pins({ type: 'T', at: [100, 100] }),
     [[80, 70], [80, 130], [120, 70], [120, 130]]);
  is('a transformer turned to rot 90', S.pins({ type: 'T', at: [100, 100], rot: 90 }),
     [[130, 80], [70, 80], [130, 120], [70, 120]]);
  is('switch, neon and meter are two terminal parts',
     ['S', 'N', 'M'].map(t => S.pins({ type: t, at: [0, 0] })),
     [[[-30, 0], [30, 0]], [[-30, 0], [30, 0]], [[-30, 0], [30, 0]]]);
}

/* ---- 2. which way the charge runs ---- */
console.log('\ncharge runs');
{
  is('a diode at rot 90 conducts from anode at the top to cathode below',
     S.runs({ type: 'D', name: 'D1', at: [0, 0], rot: 90 }), [[0, -30, 0, 30, 'D1']]);
  // a Zener at rot 270 has its anode at the bottom; reverse biased, its
  // current runs down from the cathode, so flowReversed draws it that way
  is('flowReversed: a reverse biased Zener at rot 270 carries current down',
     S.runs({ type: 'DZ', name: 'D1', at: [0, 0], rot: 270, flowReversed: true }),
     [[0, -30, 0, 30, 'D1']]);
  is('an open switch carries nothing', S.runs({ type: 'S', name: 'S1', at: [0, 0], open: true }), []);
  is('a closed switch carries the current it names',
     S.runs({ type: 'S', name: 'S1', at: [0, 0], flow: 'R1' }), [[-30, 0, 30, 0, 'R1']]);
  is('sources and transistors have no runs',
     ['V', 'B', 'Q'].map(t => S.runs({ type: t, name: 'X', at: [0, 0] }).length), [0, 0, 0]);
  is('a transformer has a run per winding, secondary turned round',
     S.runs({ type: 'T', at: [100, 100], flow: ['IP', 'IS'], flowReversed: [false, true] }),
     [[80, 70, 80, 130, 'IP'], [120, 130, 120, 70, 'IS']]);
  const m = S.runs({ type: 'M', name: 'RM', at: [0, 0] }, true);
  is('drawn charge stops at the edge of a meter', m.map(r => r.slice(0, 4)),
     [[-30, 0, -16, 0], [16, 0, 30, 0]]);
  is('but the checkers see one run end to end', S.runs({ type: 'M', name: 'RM', at: [0, 0] }),
     [[-30, 0, 30, 0, 'RM']]);
  // charge arrives at one plate and leaves the other; none crosses the gap
  is('drawn charge stops at the plates of a capacitor',
     S.runs({ type: 'C', name: 'C1', at: [0, 0], rot: 90 }, true).map(r => r.slice(0, 4)),
     [[0, -30, 0, -8], [0, 8, 0, 30]]);
  is('and of a polarised one',
     S.runs({ type: 'CP', name: 'C1', at: [0, 0] }, true).map(r => r.slice(0, 4)),
     [[-30, 0, -11, 0], [11, 0, 30, 0]]);
  is('a lamp is a two terminal part, its charge stopping at the glass',
     S.runs({ type: 'LP', name: 'R1', at: [0, 0] }, true).map(r => r.slice(0, 4)),
     [[-30, 0, -10, 0], [10, 0, 30, 0]]);
}

/* ---- 3. AC is unchanged ---- */
console.log('\nac');
{
  const flow = { phase: 1.1, iMax: 2, currents: { W: { re: 2, im: 0 } } };
  const off = F.MAX_SWING * Math.sin(1.1);
  const want = ((off % F.SPACING) + F.SPACING) % F.SPACING;
  near('largest current swings MAX_SWING sin(phase)', firstDot(flow), want, 1e-9);
  is('no current, no dots', firstDot({ phase: 0, iMax: 1, currents: {} }), null);
}

/* ---- 4. steady drift ---- */
console.log('\ndc');
{
  const at = (I, time) => firstDot({ mode: 'dc', time, iMax: 1, currents: { W: I } });
  near('at rest at the start', at(1, 0), 0, 1e-9);
  near('largest current drifts DRIFT units a second', at(1, 0.25), (F.DRIFT * 0.25) % F.SPACING, 1e-9);
  near('half the current, half the distance', at(0.5, 0.25), (F.DRIFT * 0.125) % F.SPACING, 1e-9);
  near('negative current drifts the other way', at(-1, 0.25),
       F.SPACING - (F.DRIFT * 0.25) % F.SPACING, 1e-9);
  near('a phasor is read for its real part', at({ re: 1, im: 5 }, 0.25),
       (F.DRIFT * 0.25) % F.SPACING, 1e-9);
  const comp = firstDot({ mode: 'dc', time: 0.25, iMax: 1, compress: true, currents: { W: 0.1 } });
  near('compress keeps a small current moving', comp,
       (F.DRIFT * Math.pow(0.1, 0.32) * 0.25) % F.SPACING, 1e-9);
}

/* ---- 5. time series ---- */
console.log('\ntime');
{
  const tm = F.timeOf({ time: 7, loop: 6, duration: 10 });
  near('one pass done after a loop', tm.passes, 1);
  near('circuit time inside the second pass', tm.tau, 10 / 6);
  near('charge from a steady 2 A over 3 s', F.chargeTo(t => ({ W: 2 }), 3).W, 6, 1e-9);
  const tau = 1e-3, I0 = 0.012;
  near('charge in five time constants is I0 tau (1 - e^-5)',
       F.chargeTo(t => ({ W: I0 * Math.exp(-t / tau) }), 5 * tau).W,
       I0 * tau * (1 - Math.exp(-5)), 1e-4);
  // the switch-over is a step, which the trapezium rule smooths a little
  is('a full charge and discharge moves next to no net charge',
     Math.abs(F.chargeTo(FX.RC_CURRENT, 10 * FX.TAU).R1) < 0.03 * 0.012 * FX.TAU, true);
  const exact = { mode: 'time', duration: 10 * FX.TAU, loop: 6, iMax: 0.012, currents: FX.RC_CURRENT,
                  charge: t => ({ W: 0.012 * FX.TAU * (1 - Math.exp(-t / FX.TAU)) }) };
  near('a closed form charge is used when given',
       firstDot(Object.assign({ time: 3 }, exact)),
       (F.DRIFT * 6 / (10 * FX.TAU * 0.012) * 0.012 * FX.TAU * (1 - Math.exp(-5))) % F.SPACING, 1e-9);
  near('the peak is the current at the switch', F.peakOf(FX.RC_CURRENT, 10 * FX.TAU), 0.012, 1e-9);
  // charge only: each pass carries its charge into the next, so no jump
  const fn = t => ({ W: I0 * Math.exp(-t / tau) });
  const flow = { mode: 'time', duration: 5 * tau, loop: 6, iMax: I0, currents: fn };
  const before = firstDot(Object.assign({ time: 6 - 1e-6 }, flow));
  const after = firstDot(Object.assign({ time: 6 + 1e-6 }, flow));
  near('passes join without a jump', after - before, 0, 1e-3);
  // the dots slow to a halt as the capacitor fills
  const early = firstDot(Object.assign({ time: 0.2 }, flow)) - firstDot(Object.assign({ time: 0.1 }, flow));
  const late = firstDot(Object.assign({ time: 5.9 }, flow)) - firstDot(Object.assign({ time: 5.8 }, flow));
  is('they move fast at the switch and creep at the end', Math.abs(early) > 20 * Math.abs(late), true);
  // 0.1 to 0.2 s on screen is 0.083 to 0.167 time constants: mean current e^-0.125 of the peak
  near('and drift at DRIFT times the current', early / 0.1,
       F.DRIFT * (Math.exp(-1 / 12) - Math.exp(-1 / 6)) * 12, 0.01);
}

/* ---- 6. the checkers on the new symbols and modes ---- */
console.log('\ncheckers');
{
  const all = FX.allLayouts();
  is('every fixture layout is joined up', all.map(e => joined(e.name, e.layout)).flat(), []);
  is('every fixture conductor is accounted for, and balances',
     all.map(e => alive(e, MNA)).flat(), []);

  // a wire written the wrong way round
  const bad = FX.divider(false);
  const w = bad.wires.find(x => x[0] === 210 && x[2] === 270);
  [w[0], w[1], w[2], w[3]] = [w[2], w[3], w[0], w[1]];
  is('a wire written backwards fails the balance',
     has(alive({ name: 'x', layout: bad, netlist: FX.DIVIDER_NET, flow: { mode: 'dc' } }, MNA),
         'does not equal'), true);

  // at 0 Hz a capacitor carries nothing, so it must be declared dead
  const rcNet = 'V1 a 0 12\nR1 a b 1000\nC1 b 0 1u';
  const lay = FX.rc();
  lay.elements.find(e => e.name === 'C1').flow = undefined;
  is('dc mode: a capacitor drawn alive is caught',
     has(alive({ name: 'x', layout: lay, netlist: rcNet, flow: { mode: 'dc' } }, MNA), "C1 carries 'C1'"), true);

  // an open switch that names a live current
  const sw = FX.divider(false);
  sw.elements.find(e => e.name === 'S1').open = true;
  is('a switch drawn open but carrying current is caught',
     has(alive({ name: 'x', layout: sw, netlist: FX.DIVIDER_NET, flow: { mode: 'dc' } }, MNA),
         'drawn open'), true);

  // a transformer that does not name its winding currents
  const tf = FX.transformer(false);
  tf.elements.find(e => e.name === 'T1').flow = 'IP';
  is('a transformer must name a current per winding',
     has(alive({ name: 'x', layout: tf, flow: { mode: 'ac', currents: { IP: 1, IS: 1 } } }, MNA),
         'each winding'), true);

  // a time series needs a function and a duration
  is('a time flow with no duration is refused',
     has(alive({ name: 'x', layout: FX.rc(), flow: { mode: 'time', currents: FX.RC_CURRENT } }, MNA),
         'duration'), true);

  // a transformer's pins are where the layout checker looks for them
  const loose = FX.transformer(false);
  loose.wires = loose.wires.filter(x => !(x[0] === 160 && x[1] === 70));
  is('a transformer lead left loose is caught', has(joined('x', loose), 'nothing joins'), true);
}

/* ---- 7. a feeder, drawn with the TL symbol ---- */
console.log('\nfeeder');
{
  const LX = require('./fixtures/line.js');
  const lay = LX.lineLayout(false), tl = lay.elements.find(e => e.type === 'TL');
  is('a feeder has four pins: inner and screen at each end', S.pins(tl),
     [[130, 30], [130, 46], [250, 30], [250, 46]]);
  is('to the checkers it is a two port, in at the left and out at the right',
     S.runs(tl).map(r => r[4]), ['T1', 'RL']);
  const drawn = S.runs(tl, true);
  is('drawn, the inner and the screen wall each carry every section',
     drawn.filter(r => /^T\d$/.test(r[4]) && r[1] === r[3] && (r[1] === 30 || r[1] === 37)).length,
     2 * LX.SECTIONS);
  is('and the screen leads carry the current at each end',
     drawn.filter(r => r[1] !== r[3] || r[1] === 46).map(r => r[4]), ['RL', 'RL', 'T1', 'T1']);
  is('the screen current runs back under the inner, right to left',
     drawn.filter(r => r[4] === 'T6').map(r => Math.sign(r[2] - r[0])), [1, -1]);
  const all = LX.allLayouts();
  is('both feeder fixtures are joined up', all.map(e => joined(e.name, e.layout)).flat(), []);
  is('every section is alive, and the ends balance', all.map(e => alive(e, MNA)).flat(), []);
  const bad = LX.lineLayout(false);
  bad.elements.find(e => e.type === 'TL').flow = 'T1';
  is('a feeder must name the current at each end',
     has(alive({ name: 'x', layout: bad, netlist: LX.lineNet(50, 100) }, MNA), 'left end'), true);
  // on a mismatched lossless line the current is not the same along it: the
  // sections carry a standing wave, which is what the dots are drawn from
  const sol = MNA.solveAt(MNA.parseNetlist(LX.lineNet(50, 100).replace(/ db=4 at=10M/g, '')), 14e6);
  const mags = [1, 2, 3, 4, 5, 6].map(k => MNA.abs(MNA.currentThrough(sol, 'T' + k)));
  is('a mismatched feeder carries different currents section by section',
     Math.max(...mags) / Math.min(...mags) > 1.3, true);
}

/* ---- 8. the power supply symbols, and charge that stops when a diode does ---- */
console.log('\npower supply symbols');
{
  is('a tapped transformer has a fifth pin, the middle of its secondary',
     S.pins({ type: 'T', tap: true, at: [100, 100] }), [[80, 70], [80, 130], [120, 70], [120, 130], [120, 100]]);
  is('and each half of the secondary carries its own current',
     S.runs({ type: 'T', tap: true, at: [100, 100], flow: ['IP', 'D1', 'D2'], flowReversed: [false, true, false] }),
     [[80, 70, 80, 130, 'IP'], [120, 100, 120, 70, 'D1'], [120, 100, 120, 130, 'D2']]);
  is('a mirrored transistor has its base on the right',
     S.pins({ type: 'Q', mirror: true, at: [100, 100] }), [[130, 100], [88, 68], [88, 132]]);
  is('a regulator box: in, out, common', S.pins({ type: 'U', at: [100, 100] }),
     [[70, 100], [130, 100], [100, 130]]);
  is('and, like a transistor, no drawn charge of its own', S.runs({ type: 'U', at: [100, 100] }), []);
  const tapped = { elements: [{ name: 'TX', type: 'T', tap: true, at: [100, 100], flow: ['IP', 'D1'] }], wires: [] };
  is('a tapped transformer must name three currents',
     has(alive({ name: 'x', layout: tapped, flow: { mode: 'dc', currents: { IP: 1, D1: 1 } } }, MNA), 'each half'), true);
  // a time series in which W carries nothing for the second half of the pass
  const pulse = t => ({ W: t < 0.5 ? 1 : 0 });
  const at = (time, hide) => firstDot({ mode: 'time', duration: 1, loop: 1, iMax: 1, currents: pulse,
                                        time, hideStill: hide });
  is('without hideStill, a branch that has stopped still shows its dots', at(0.75, false) !== null, true);
  is('with hideStill, it shows none while it carries nothing', at(0.75, true), null);
  is('and shows them again while it conducts', at(0.25, true) !== null, true);
  const PX = require('./fixtures/psu.js');
  const all = PX.allLayouts();
  is('the power supply fixtures are joined up', all.map(e => joined(e.name, e.layout)).flat(), []);
  is('and every conductor, solved in time, is accounted for and balances',
     all.map(e => alive(e, MNA)).flat(), []);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
