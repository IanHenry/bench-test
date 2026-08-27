/*
 * check-layouts.js - verify that every drawn circuit is actually joined up.
 *
 * A schematic with a dangling lead looks almost right, which is worse than
 * looking wrong: the reader takes it as read. This walks every layout a bench
 * declares, works out where each component terminal and each wire end lands,
 * and reports any point where only one conductor arrives.
 *
 * A single conductor is allowed at exactly two kinds of place: a ground
 * symbol, and a labelled terminal such as an input or an output. Everywhere
 * else, a lone end is a gap.
 *
 * Run: node check-layouts.js ../content/2I.js
 */
const path = require('path');

const SPAN = 60;

// three terminals, and they do not sit along an axis like the passives do
const TRANSISTOR_PINS = [[-30, 0], [12, -32], [12, 32]];

function pinsOf(el) {
  if (el.type === 'Q') {
    return TRANSISTOR_PINS.map(([dx, dy]) => [el.at[0] + dx, el.at[1] + dy]);
  }
  const rad = (el.rot || 0) * Math.PI / 180;
  const dx = Math.round(Math.cos(rad) * SPAN / 2);
  const dy = Math.round(Math.sin(rad) * SPAN / 2);
  return [[el.at[0] - dx, el.at[1] - dy], [el.at[0] + dx, el.at[1] + dy]];
}

const key = (x, y) => x + ',' + y;

function checkLayout(name, layout) {
  const count = {}, why = {};
  const add = (x, y, what) => {
    const k = key(x, y);
    count[k] = (count[k] || 0) + 1;
    (why[k] = why[k] || []).push(what);
  };

  for (const w of (layout.wires || [])) {
    if (w[0] === w[2] && w[1] === w[3]) {
      return [`${name}: zero length wire at ${w[0]},${w[1]}`];
    }
    add(w[0], w[1], 'wire');
    add(w[2], w[3], 'wire');
  }
  for (const el of (layout.elements || [])) {
    for (const [x, y] of pinsOf(el)) add(x, y, el.name);
  }

  const free = new Set();
  for (const [x, y] of (layout.grounds || [])) free.add(key(x, y));
  for (const t of (layout.terminals || [])) free.add(key(t.at[0], t.at[1]));

  const problems = [];
  for (const k of Object.keys(count)) {
    if (count[k] >= 2 || free.has(k)) continue;
    problems.push(`${name}: nothing joins ${why[k].join(' and ')} at ${k}`);
  }
  return problems;
}

function main() {
  const target = process.argv[2];
  if (!target) {
    console.error('usage: node check-layouts.js <content file>');
    process.exit(2);
  }

  // the content files expect the browser globals the engine installs
  global.window = {
    Fmt: require('./format.js'),
    MNA: require('./mna.js'),
    DSP: require('./dsp.js'),
    DC: require('./dc.js'),
    Plot: require('./plot.js'),
    Schematic: require('./schematic.js')
  };

  const BENCH = require(path.resolve(target));
  if (typeof BENCH.allLayouts !== 'function') {
    console.log('no layouts declared, nothing to check');
    return;
  }

  let problems = [];
  const layouts = BENCH.allLayouts();
  for (const { name, layout } of layouts) {
    problems = problems.concat(checkLayout(name, layout));
  }

  if (problems.length) {
    problems.forEach(p => console.log('  ' + p));
    console.log(`${layouts.length} layouts, ${problems.length} gaps`);
    process.exit(1);
  }
  console.log(`${layouts.length} layouts, all joined up`);
}

main();
