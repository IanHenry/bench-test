/*
 * mna.js - complex-domain modified nodal analysis for small linear circuits.
 *
 * No dependencies; runs unchanged in Node and in the browser. The point of
 * this file is that every linear circuit in the RSGB syllabus - potential
 * dividers, CR and LR filters, series and parallel resonance, matching
 * networks - is the same calculation. Write the netlist, sweep the frequency,
 * read the answer. There is no per-circuit maths anywhere above this layer.
 *
 * Netlist syntax (one element per line, '*', ';' or '#' starts a comment):
 *
 *     V1 in 0  1        ; source, 1 V, node 'in' positive w.r.t. ground
 *     R1 in a  5        ; 5 ohms between 'in' and 'a'
 *     G1 c e b e 0.19   ; current from c to e of 0.19 times the voltage b to e
 *     L1 a  b  10u      ; 10 microhenries
 *     C1 b  0  100p     ; 100 picofarads
 *
 * A G element is a voltage controlled current source, and it is what lets a
 * transistor be solved here at all. Its small signal model is a resistance
 * from base to emitter plus a current from collector to emitter proportional
 * to the voltage across that resistance, which is exactly one G and one R.
 *
 * Node '0' (or 'gnd') is ground. Value suffixes are p n u m k M G, and
 * unlike SPICE they are CASE SENSITIVE: 'm' is milli and 'M' is mega, which
 * is what a radio amateur expects when typing 7M1 rather than 7MEG.
 */

/* ---------- complex arithmetic ---------- */

const cx  = (re, im = 0) => ({ re, im });
const add = (a, b) => cx(a.re + b.re, a.im + b.im);
const sub = (a, b) => cx(a.re - b.re, a.im - b.im);
const mul = (a, b) => cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const div = (a, b) => {
  const d = b.re * b.re + b.im * b.im;
  return cx((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
};
const abs = a => Math.hypot(a.re, a.im);
const arg = a => Math.atan2(a.im, a.re);

/* ---------- netlist ---------- */

const SI = { p: 1e-12, n: 1e-9, u: 1e-6, '\u00b5': 1e-6, m: 1e-3, k: 1e3, K: 1e3, M: 1e6, G: 1e9 };

function parseValue(s) {
  const m = /^([-+]?(?:[0-9]*\.)?[0-9]+(?:[eE][-+]?[0-9]+)?)\s*([pnu\u00b5mkKMG])?/.exec(String(s).trim());
  if (!m) throw new Error('cannot parse value: ' + s);
  return parseFloat(m[1]) * (m[2] ? SI[m[2]] : 1);
}

function parseNetlist(text) {
  const elements = [];
  const nodeNames = [];
  const nodeIndex = new Map();

  const nodeOf = name => {
    if (name === '0' || name.toLowerCase() === 'gnd') return -1;
    if (!nodeIndex.has(name)) { nodeIndex.set(name, nodeNames.length); nodeNames.push(name); }
    return nodeIndex.get(name);
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/[*;#].*$/, '').trim();
    if (!line) continue;
    const tok = line.split(/\s+/);
    if (tok.length < 4) throw new Error('need "name nodeA nodeB value": ' + line);
    const name = tok[0];
    const type = name[0].toUpperCase();
    if (!'RLCVIG'.includes(type)) throw new Error('unknown element type in: ' + name);
    if (type === 'G') {
      // name out+ out- ctrl+ ctrl- gm
      if (tok.length < 6) throw new Error('a G element needs four nodes and a gain: ' + line);
      elements.push({ name, type, a: nodeOf(tok[1]), b: nodeOf(tok[2]),
                      ca: nodeOf(tok[3]), cb: nodeOf(tok[4]), value: parseValue(tok[5]) });
    } else {
      elements.push({ name, type, a: nodeOf(tok[1]), b: nodeOf(tok[2]),
                      value: parseValue(tok[3]) });
    }
  }

  const sources = elements.filter(e => e.type === 'V');
  sources.forEach((e, k) => { e.row = nodeNames.length + k; });
  return { elements, nodeNames, nSources: sources.length };
}

/* ---------- admittance of a two-terminal element ---------- */

function admittance(el, w) {
  switch (el.type) {
    case 'R': return cx(1 / el.value, 0);
    case 'C': return cx(0, w * el.value);
    // At w = 0 an inductor is a short; clamp to a large finite admittance so
    // the matrix stays solvable rather than blowing up at DC.
    case 'L': return w === 0 ? cx(1e12, 0) : cx(0, -1 / (w * el.value));
    default:  return null;
  }
}

/* ---------- solve at one frequency ---------- */

function solveAt(circuit, freqHz) {
  const { elements, nodeNames, nSources } = circuit;
  const n = nodeNames.length;
  const N = n + nSources;
  const w = 2 * Math.PI * freqHz;

  const A = Array.from({ length: N }, () => Array.from({ length: N }, () => cx(0, 0)));
  const z = Array.from({ length: N }, () => cx(0, 0));

  const stampY = (a, b, y) => {
    if (a >= 0) A[a][a] = add(A[a][a], y);
    if (b >= 0) A[b][b] = add(A[b][b], y);
    if (a >= 0 && b >= 0) {
      A[a][b] = sub(A[a][b], y);
      A[b][a] = sub(A[b][a], y);
    }
  };

  for (const el of elements) {
    if (el.type === 'V') {
      const k = el.row;
      if (el.a >= 0) { A[el.a][k] = add(A[el.a][k], cx(1)); A[k][el.a] = add(A[k][el.a], cx(1)); }
      if (el.b >= 0) { A[el.b][k] = sub(A[el.b][k], cx(1)); A[k][el.b] = sub(A[k][el.b], cx(1)); }
      z[k] = cx(el.value, 0);
    } else if (el.type === 'G') {
      // current of gm.(V(ca) - V(cb)) leaves node a and arrives at node b
      const g = cx(el.value, 0);
      if (el.a >= 0 && el.ca >= 0) A[el.a][el.ca] = add(A[el.a][el.ca], g);
      if (el.a >= 0 && el.cb >= 0) A[el.a][el.cb] = sub(A[el.a][el.cb], g);
      if (el.b >= 0 && el.ca >= 0) A[el.b][el.ca] = sub(A[el.b][el.ca], g);
      if (el.b >= 0 && el.cb >= 0) A[el.b][el.cb] = add(A[el.b][el.cb], g);
    } else if (el.type === 'I') {
      // SPICE convention: positive current flows from a, through the source, to b.
      if (el.a >= 0) z[el.a] = sub(z[el.a], cx(el.value, 0));
      if (el.b >= 0) z[el.b] = add(z[el.b], cx(el.value, 0));
    } else {
      stampY(el.a, el.b, admittance(el, w));
    }
  }

  const x = gaussianSolve(A, z);

  const v = {};
  nodeNames.forEach((name, i) => { v[name] = x[i]; });
  v['0'] = cx(0, 0);
  return { f: freqHz, w, v, x, circuit };
}

function gaussianSolve(A, z) {
  const n = z.length;
  for (let i = 0; i < n; i++) A[i] = A[i].concat([z[i]]);

  for (let col = 0; col < n; col++) {
    let piv = col, best = abs(A[col][col]);
    for (let r = col + 1; r < n; r++) {
      const m = abs(A[r][col]);
      if (m > best) { best = m; piv = r; }
    }
    if (best < 1e-300) throw new Error('singular matrix at column ' + col + ' (floating node?)');
    if (piv !== col) { const t = A[piv]; A[piv] = A[col]; A[col] = t; }

    for (let r = col + 1; r < n; r++) {
      const f = div(A[r][col], A[col][col]);
      if (f.re === 0 && f.im === 0) continue;
      for (let c = col; c <= n; c++) A[r][c] = sub(A[r][c], mul(f, A[col][c]));
    }
  }

  const x = new Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let s = A[r][n];
    for (let c = r + 1; c < n; c++) s = sub(s, mul(A[r][c], x[c]));
    x[r] = div(s, A[r][r]);
  }
  return x;
}

/* ---------- reading answers out of a solution ---------- */

const byName = (circuit, name) => {
  const el = circuit.elements.find(e => e.name.toLowerCase() === name.toLowerCase());
  if (!el) throw new Error('no element named ' + name);
  return el;
};

const nodeV = (sol, name) => sol.v[name] ?? cx(0, 0);

/** Voltage across an element, a-terminal relative to b-terminal. */
function voltageAcross(sol, name) {
  const el = byName(sol.circuit, name);
  const va = el.a >= 0 ? sol.x[el.a] : cx(0, 0);
  const vb = el.b >= 0 ? sol.x[el.b] : cx(0, 0);
  return sub(va, vb);
}

/** Current through a passive element, flowing from its a-terminal to its b-terminal. */
function currentThrough(sol, name) {
  const el = byName(sol.circuit, name);
  if (el.type === 'V') return sol.x[el.row];
  if (el.type === 'I') return cx(el.value, 0);
  if (el.type === 'G') {
    const va = el.ca >= 0 ? sol.x[el.ca] : cx(0, 0);
    const vb = el.cb >= 0 ? sol.x[el.cb] : cx(0, 0);
    return mul(sub(va, vb), cx(el.value, 0));
  }
  return mul(voltageAcross(sol, name), admittance(el, sol.w));
}

/** Frequency sweep. Returns an array of solutions. */
function sweep(circuit, fStart, fStop, points = 400, log = true) {
  const out = [];
  for (let i = 0; i < points; i++) {
    const t = points === 1 ? 0 : i / (points - 1);
    const f = log
      ? fStart * Math.pow(fStop / fStart, t)
      : fStart + (fStop - fStart) * t;
    out.push(solveAt(circuit, f));
  }
  return out;
}

const API = { cx, add, sub, mul, div, abs, arg, parseValue, parseNetlist,
              admittance, solveAt, sweep, voltageAcross, currentThrough, nodeV };

if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.MNA = API;
