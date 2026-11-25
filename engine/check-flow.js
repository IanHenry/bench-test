/*
 * check-flow.js - verify that every drawn conductor says what it carries.
 *
 * check-layouts.js proves a circuit is joined up. This proves it is alive.
 * A leg drawn with no moving charge reads as a fault in the circuit rather
 * than as a fact about it, and the reader cannot tell which we meant.
 *
 * So every element and every wire must resolve to a current the netlist
 * actually solves for. A part that genuinely carries no signal current is
 * declared with '-', which is a claim we have to mean: bypassed, shorted or
 * open. Leaving a leg unannotated is not an option, because that is how the
 * dead ones kept getting through.
 *
 * Each entry from BENCH.allLayouts() is { name, layout, netlist } and may add
 * flow, the same object a panel returns to the page:
 *   no flow, or flow { mode: 'ac' }   the netlist is solved at 1 kHz
 *   flow { mode: 'dc' }               the netlist is solved at 0 Hz, so a
 *                                     capacitor carries nothing and must be '-'
 *   flow { mode: 'dc', currents: {} } the panel's own steady currents, in amperes
 *   flow { mode: 'time', currents: t => ({}), duration }
 *                                     sampled across the duration; a branch is
 *                                     alive if it carries current at any sample
 * An entry that declares flow is also checked for balance: at every junction
 * the current drawn arriving must equal the current drawn leaving. A
 * transformer names a current per winding, flow: ['primary', 'secondary'],
 * and a switch drawn open must not carry anything.
 *
 * Run: node check-flow.js ../content/2I.js
 */
const path = require('path');
const Schematic = require('./schematic.js');

/*
 * The currents an entry's flow resolves to, as a function of a sample index,
 * so that a time series can be looked at at several moments and a steady
 * circuit at one. Each sample is { name: current }, the current a number for
 * DC and a time series and a phasor for AC.
 *
 *   netlist only, or flow mode 'ac'  solved at 1 kHz, as the page does
 *   flow mode 'dc' with a netlist    solved at 0 Hz, so a capacitor is dead
 *   flow with currents               the panel's own currents: an object for
 *                                    'ac' or 'dc', a function of time for 'time'
 */
const TIME_SAMPLES = 24;

function samplesOf(entry, MNA) {
  const flow = entry.flow || {};
  const mode = flow.mode || 'ac';
  if (flow.currents !== undefined) {
    if (mode === 'time') {
      if (typeof flow.currents !== 'function') {
        throw new Error("a 'time' flow needs currents as a function of time");
      }
      if (!(flow.duration > 0)) throw new Error("a 'time' flow needs a duration");
      const out = [];
      for (let k = 0; k < TIME_SAMPLES; k++) {
        out.push(flow.currents(flow.duration * (k + 0.5) / TIME_SAMPLES) || {});
      }
      return { mode, samples: out };
    }
    return { mode, samples: [flow.currents] };
  }
  if (mode === 'time') throw new Error("a 'time' flow needs currents as a function of time");
  const ckt = MNA.parseNetlist(entry.netlist);
  const solved = MNA.solveAt(ckt, mode === 'dc' ? 0 : 1000);
  const cur = {};
  for (const el of ckt.elements) {
    try {
      const I = MNA.currentThrough(solved, el.name);
      cur[el.name] = mode === 'dc' ? I.re : I;
    } catch (e) { /* not every element reports a current */ }
  }
  return { mode, samples: [cur] };
}

const sizeOf = I => typeof I === 'number' ? Math.abs(I) : (I ? Math.hypot(I.re, I.im) : 0);

function checkLayout(entry, MNA) {
  const { name, layout, netlist, flow } = entry;
  const problems = [];
  if (!netlist && !(flow && flow.currents !== undefined)) {
    return [`${name}: no netlist or currents declared, so nothing can be checked`];
  }

  let known = new Set(), samples = null;
  // a DC series loop carries one current the whole way round, so every part
  // drawn in it is alive by construction and only has to name a real part
  if (netlist === 'series' && !(flow && flow.currents !== undefined)) {
    for (const el of (layout.elements || [])) known.add(el.name);
  } else try {
    samples = samplesOf(entry, MNA).samples;
    for (const cur of samples) {
      for (const n of Object.keys(cur)) if (sizeOf(cur[n]) > 0) known.add(n);
    }
  } catch (e) {
    return [`${name}: ${netlist && !(flow && flow.currents) ? 'netlist will not solve' : 'currents will not evaluate'}: ${e.message}`];
  }

  const resolve = (who, ref) => {
    if (ref === '-') return;                       // declared dead, deliberately
    if (ref === undefined || ref === null || ref === '') {
      problems.push(`${name}: ${who} does not say what it carries`);
      return;
    }
    if (!known.has(ref)) {
      problems.push(`${name}: ${who} carries '${ref}', which the netlist does ` +
                    `not solve for (it has ${[...known].sort().join(', ')})`);
    }
  };

  for (const el of (layout.elements || [])) {
    if (el.type === 'V' || el.type === 'B' || el.type === 'Q' || el.type === 'U') continue;   // sources and devices
    if (el.type === 'T' && el.tap) {
      // a tapped secondary: each half carries its own current
      if (!Array.isArray(el.flow) || el.flow.length !== 3) {
        problems.push(`${name}: tapped transformer ${el.name} must name the current in its ` +
                      `primary and in each half of its secondary, as flow: ['primary', 'top', 'bottom']`);
        continue;
      }
      resolve(`${el.name} primary`, el.flow[0]);
      resolve(`${el.name} secondary, top half`, el.flow[1]);
      resolve(`${el.name} secondary, bottom half`, el.flow[2]);
      continue;
    }
    if (el.type === 'T') {
      // a transformer has two windings, and each carries its own current
      if (!Array.isArray(el.flow) || el.flow.length !== 2) {
        problems.push(`${name}: transformer ${el.name} must name the current in each ` +
                      `winding, as flow: ['primary', 'secondary']`);
        continue;
      }
      resolve(`${el.name} primary`, el.flow[0]);
      resolve(`${el.name} secondary`, el.flow[1]);
      continue;
    }
    if (el.type === 'TL') {
      // a feeder is a two port: the current into one end and out of the
      // other differ, and each section it is drawn in carries its own
      if (!Array.isArray(el.flow) || el.flow.length !== 2) {
        problems.push(`${name}: feeder ${el.name} must name the current into its ` +
                      `left end and out of its right end, as flow: ['in', 'out']`);
        continue;
      }
      resolve(`${el.name} input`, el.flow[0]);
      resolve(`${el.name} output`, el.flow[1]);
      (el.along || []).forEach((n, k) => resolve(`${el.name} section ${k + 1}`, n));
      continue;
    }
    if (el.type === 'S' && el.open) {
      // an open switch is dead by definition; naming a live current for it
      // says the drawing and the circuit disagree about whether it is open
      const ref = el.flow;
      if (ref && ref !== '-' && known.has(ref)) {
        problems.push(`${name}: switch ${el.name} is drawn open but carries '${ref}'`);
      }
      continue;
    }
    resolve(`${el.name}`, el.flow === undefined ? el.name : el.flow);
  }
  for (const w of (layout.wires || [])) {
    resolve(`wire ${w[0]},${w[1]} to ${w[2]},${w[3]}`, w[4]);
  }

  // A layout that declares its flow also has to balance: at every junction
  // the charge drawn arriving must equal the charge drawn leaving, which is
  // what catches a wire written the wrong way round. Points where a source,
  // a transistor, a ground or a terminal lands are left out, because current
  // enters or leaves the drawing there through something with no dots.
  if (flow && samples && !problems.length) problems.push(...balance(name, layout, samples));
  return problems;
}

function balance(name, layout, samples) {
  const skip = new Set();
  const key = (x, y) => Math.round(x) + ',' + Math.round(y);
  for (const el of (layout.elements || [])) {
    if (el.type === 'V' || el.type === 'B' || el.type === 'Q' || el.type === 'U') {
      for (const [x, y] of Schematic.pins(el)) skip.add(key(x, y));
    }
  }
  for (const [x, y] of (layout.grounds || [])) skip.add(key(x, y));
  for (const t of (layout.terminals || [])) skip.add(key(t.at[0], t.at[1]));

  const runs = [];
  for (const el of (layout.elements || [])) runs.push(...Schematic.runs(el));
  for (const w of (layout.wires || [])) runs.push(w);

  const problems = [];
  samples.forEach((cur, k) => {
    const re = {}, im = {};
    let big = 0;
    const add = (pt, I, sign) => {
      if (I === undefined) return;
      const r = typeof I === 'number' ? I : I.re, j = typeof I === 'number' ? 0 : I.im;
      re[pt] = (re[pt] || 0) + sign * r;
      im[pt] = (im[pt] || 0) + sign * j;
      big = Math.max(big, Math.hypot(r, j));
    };
    for (const [x1, y1, x2, y2, n] of runs) {
      if (!n || n === '-') continue;
      add(key(x1, y1), cur[n], -1);     // leaves the first point
      add(key(x2, y2), cur[n], +1);     // arrives at the second
    }
    for (const pt of Object.keys(re)) {
      if (skip.has(pt)) continue;
      if (Math.hypot(re[pt], im[pt]) > 1e-6 * big + 1e-15) {
        problems.push(`${name}: at ${pt} the current drawn arriving does not equal ` +
                      `the current leaving` + (samples.length > 1 ? ` (sample ${k + 1})` : '') +
                      `: a wire written the wrong way round, or a branch named for the wrong current`);
      }
    }
  });
  return [...new Set(problems)];
}

function main() {
  const target = process.argv[2];
  if (!target) {
    console.error('usage: node check-flow.js <content file>');
    process.exit(2);
  }

  const MNA = require('./mna.js');
  global.window = {
    Fmt: require('./format.js'), MNA: MNA, Tran: require('./tran.js'),
    DSP: require('./dsp.js'), DC: require('./dc.js'),
    Plot: require('./plot.js'), Schematic: require('./schematic.js')
  };

  const BENCH = require(path.resolve(target));
  if (typeof BENCH.allLayouts !== 'function') {
    console.log('no layouts declared, nothing to check');
    return;
  }

  let problems = [], n = 0;
  for (const entry of BENCH.allLayouts()) {
    n++;
    problems = problems.concat(checkLayout(entry, MNA));
  }

  if (problems.length) {
    problems.forEach(p => console.log('  ' + p));
    console.log(`${n} layouts, ${problems.length} legs with nothing flowing`);
    process.exit(1);
  }
  console.log(`${n} layouts, every conductor accounted for`);
}

// run as a command, or required by the tests for its checks
if (require.main === module) main();
else module.exports = { checkLayout, balance };
