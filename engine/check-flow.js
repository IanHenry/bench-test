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
 * Run: node check-flow.js ../content/2I.js
 */
const path = require('path');

function checkLayout(entry, MNA) {
  const { name, layout, netlist } = entry;
  const problems = [];
  if (!netlist) return [`${name}: no netlist declared, so nothing can be checked`];

  let solved, known = new Set();
  // a DC series loop carries one current the whole way round, so every part
  // drawn in it is alive by construction and only has to name a real part
  if (netlist === 'series') {
    for (const el of (layout.elements || [])) known.add(el.name);
  } else try {
    const ckt = MNA.parseNetlist(netlist);
    solved = MNA.solveAt(ckt, 1000);
    for (const el of ckt.elements) {
      try {
        const I = MNA.currentThrough(solved, el.name);
        if (MNA.abs(I) > 0) known.add(el.name);
      } catch (e) { /* not every element reports a current */ }
    }
  } catch (e) {
    return [`${name}: netlist will not solve: ${e.message}`];
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
    if (el.type === 'V' || el.type === 'Q') continue;   // sources and devices
    resolve(`${el.name}`, el.flow === undefined ? el.name : el.flow);
  }
  for (const w of (layout.wires || [])) {
    resolve(`wire ${w[0]},${w[1]} to ${w[2]},${w[3]}`, w[4]);
  }
  return problems;
}

function main() {
  const target = process.argv[2];
  if (!target) {
    console.error('usage: node check-flow.js <content file>');
    process.exit(2);
  }

  const MNA = require('./mna.js');
  global.window = {
    Fmt: require('./format.js'), MNA: MNA,
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

main();
