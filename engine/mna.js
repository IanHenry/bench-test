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
 *
 * A T element is a length of transmission line, a feeder, between two ports:
 *
 *     T1 a b c d 50 len=20 vf=0.67 db=3.5 at=14M
 *
 * Port 1 is a (inner) to b (screen), port 2 is c to d. 50 is the
 * characteristic impedance Z0 in ohms, len the physical length in metres, vf
 * the velocity factor (1 if left out), db the loss in dB per 100 m at the
 * frequency `at`. Conductor loss dominates in coax at HF and VHF, so the loss
 * is scaled with the square root of frequency; with no `at` it is the same at
 * every frequency. currentThrough gives the current flowing into port 1 at a.
 *
 * The line is stamped with two extra unknowns, the currents into each port,
 * and two rows from its ABCD (chain) parameters:
 *
 *     V1 = A V2 + B I2',  I1 = C V2 + D I2'     (I2' leaves port 2)
 *     A = D = cosh(gamma l),  B = Z0 sinh(gamma l),  C = sinh(gamma l) / Z0
 *
 * where gamma = alpha + j beta. These stay finite at every length, so a
 * lossless half wave line, whose admittance matrix does not exist, still
 * solves. Waves travel at vf times 3 x 10^8 m/s, the figure on the formula
 * sheet, so the bench agrees with the working a candidate does by hand.
 *
 * A K element couples two inductors, the way an IF transformer's windings
 * share one field:
 *
 *     L1 p 0 100u
 *     L2 q 0 100u
 *     K1 L1 L2 0.02     ; coupling coefficient k, from 0 to 1
 *
 * The mutual inductance is M = k sqrt(L1 L2). The dot of each winding is at
 * its first node, so a current into p and a current into q make fields that
 * add. A coupled inductor is stamped as a branch, with its current as an
 * extra unknown and the row
 *
 *     V(a) - V(b) - jwL I - jwM I' = 0       (I' the other winding's current)
 *
 * rather than as an admittance, because the admittance form needs the
 * inverse of the inductance matrix, which does not exist at k = 1. So a
 * perfectly coupled pair still solves, and at DC each winding is a short.
 * currentThrough gives a coupled inductor's branch current, a to b.
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
    if (!'RLCVIGTK'.includes(type)) throw new Error('unknown element type in: ' + name);
    if (type === 'K') {
      // name inductor inductor k: the inductors are found once every line is read
      const k = parseValue(tok[3]);
      if (!(k >= 0 && k <= 1)) throw new Error('a coupling k must be from 0 to 1: ' + line);
      elements.push({ name, type, l1: tok[1], l2: tok[2], value: k, a: -1, b: -1 });
    } else if (type === 'T') {
      // name p1+ p1- p2+ p2- Z0 len=.. [vf=..] [db=..] [at=..]
      if (tok.length < 7) throw new Error('a line needs four nodes, Z0 and len=: ' + line);
      const opt = {};
      for (const kv of tok.slice(6)) {
        const m = /^([a-z]+)=(.+)$/i.exec(kv);
        if (!m) throw new Error('expected key=value, got ' + kv + ' in: ' + line);
        opt[m[1].toLowerCase()] = parseValue(m[2]);
      }
      if (!(opt.len >= 0)) throw new Error('a line needs len= in metres: ' + line);
      elements.push({ name, type, a: nodeOf(tok[1]), b: nodeOf(tok[2]),
                      c: nodeOf(tok[3]), d: nodeOf(tok[4]), value: parseValue(tok[5]),
                      len: opt.len, vf: opt.vf || 1, db: opt.db || 0, at: opt.at || 0 });
    } else if (type === 'G') {
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
  // each line adds two unknowns, the currents into its two ports
  const lines = elements.filter(e => e.type === 'T');
  lines.forEach((e, k) => {
    e.row = nodeNames.length + sources.length + 2 * k;
    e.row2 = e.row + 1;
  });
  // each coupled inductor adds one unknown, its own current
  const inductor = nm => {
    const el = elements.find(e => e.name.toLowerCase() === String(nm).toLowerCase());
    if (!el || el.type !== 'L') throw new Error('a K element couples two inductors; no inductor named ' + nm);
    return el;
  };
  const coupled = [];
  for (const kel of elements.filter(e => e.type === 'K')) {
    const p = inductor(kel.l1), q = inductor(kel.l2);
    if (p === q) throw new Error(kel.name + ' couples ' + p.name + ' to itself');
    kel.p = p; kel.q = q;
    kel.m = kel.value * Math.sqrt(p.value * q.value);
    for (const el of [p, q]) if (coupled.indexOf(el) < 0) coupled.push(el);
  }
  coupled.forEach((e, k) => { e.row = nodeNames.length + sources.length + 2 * lines.length + k; });
  return { elements, nodeNames, nSources: sources.length, nLines: lines.length, nCoupled: coupled.length };
}

/* ---------- transmission lines ---------- */

const C_LIGHT = 3e8;               // m/s, the formula sheet's figure
const NEPER_DB = 20 / Math.LN10;   // 8.686 dB to the neper

const cosh = z => cx(Math.cosh(z.re) * Math.cos(z.im), Math.sinh(z.re) * Math.sin(z.im));
const sinh = z => cx(Math.sinh(z.re) * Math.cos(z.im), Math.cosh(z.re) * Math.sin(z.im));

/** Loss of a line in dB per metre at a frequency. */
function lineDbPerMetre(el, freqHz) {
  const per = (el.db || 0) / 100;
  return el.at ? per * Math.sqrt(Math.max(0, freqHz) / el.at) : per;
}

/** The propagation constant alpha + j beta, per metre, at a frequency. */
function lineGamma(el, freqHz) {
  return cx(lineDbPerMetre(el, freqHz) / NEPER_DB,
            2 * Math.PI * freqHz / (C_LIGHT * (el.vf || 1)));
}

/** A, B, C, D of a line element (or of `len` metres of it) at a frequency. */
function lineABCD(el, freqHz, len) {
  const g = lineGamma(el, freqHz), l = len === undefined ? el.len : len;
  const gl = cx(g.re * l, g.im * l);
  const ch = cosh(gl), sh = sinh(gl), z0 = el.value;
  return { A: ch, B: mul(sh, cx(z0)), C: div(sh, cx(z0)), D: ch };
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
  const N = n + nSources + 2 * (circuit.nLines || 0) + (circuit.nCoupled || 0);
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
    } else if (el.type === 'T') {
      // unknowns: I1 into port 1 at a (out at b), I2 into port 2 at c (out at d)
      const r1 = el.row, r2 = el.row2;
      const { A: a, B: bb, C: cc, D: dd } = lineABCD(el, freqHz);
      const put = (r, c, v) => { if (r >= 0 && c >= 0) A[r][c] = add(A[r][c], v); };
      const one = cx(1), neg = v => cx(-v.re, -v.im);
      put(el.a, r1, one); put(el.b, r1, neg(one));
      put(el.c, r2, one); put(el.d, r2, neg(one));
      // V1 - A V2 + B I2 = 0, with I2 into port 2 the negative of I2'
      put(r1, el.a, one); put(r1, el.b, neg(one));
      put(r1, el.c, neg(a)); put(r1, el.d, a);
      put(r1, r2, bb);
      // I1 - C V2 + D I2 = 0
      put(r2, r1, one);
      put(r2, el.c, neg(cc)); put(r2, el.d, cc);
      put(r2, r2, dd);
    } else if (el.type === 'L' && el.row !== undefined) {
      // a coupled inductor: its current leaves a and arrives at b, and
      // V(a) - V(b) - jwL I, less the mutual terms stamped by its K, is zero
      const k = el.row;
      if (el.a >= 0) { A[el.a][k] = add(A[el.a][k], cx(1)); A[k][el.a] = add(A[k][el.a], cx(1)); }
      if (el.b >= 0) { A[el.b][k] = sub(A[el.b][k], cx(1)); A[k][el.b] = sub(A[k][el.b], cx(1)); }
      A[k][k] = sub(A[k][k], cx(0, w * el.value));
    } else if (el.type === 'K') {
      const jwm = cx(0, w * el.m), r1 = el.p.row, r2 = el.q.row;
      A[r1][r2] = sub(A[r1][r2], jwm);
      A[r2][r1] = sub(A[r2][r1], jwm);
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
  if (el.type === 'T') return sol.x[el.row];
  if (el.type === 'L' && el.row !== undefined) return sol.x[el.row];
  if (el.type === 'K') return cx(0, 0);          // a coupling carries no current of its own
  if (el.type === 'I') return cx(el.value, 0);
  if (el.type === 'G') {
    const va = el.ca >= 0 ? sol.x[el.ca] : cx(0, 0);
    const vb = el.cb >= 0 ? sol.x[el.cb] : cx(0, 0);
    return mul(sub(va, vb), cx(el.value, 0));
  }
  return mul(voltageAcross(sol, name), admittance(el, sol.w));
}

/**
 * Both ends of a line: the voltage across each port and the current into
 * port 1 and out of port 2 (into whatever port 2 feeds), all as solved.
 */
function linePorts(sol, name) {
  const el = byName(sol.circuit, name);
  if (el.type !== 'T') throw new Error(name + ' is not a line');
  const at = k => (k >= 0 ? sol.x[k] : cx(0, 0));
  const i2 = sol.x[el.row2];
  return { v1: sub(at(el.a), at(el.b)), i1: sol.x[el.row],
           v2: sub(at(el.c), at(el.d)), i2: cx(-i2.re, -i2.im) };
}

/**
 * Voltage and current at a distance z metres from port 1 of a solved line,
 * from the line equations and the solved values at port 1:
 *     V(z) = V1 cosh(gamma z) - I1 Z0 sinh(gamma z)
 *     I(z) = I1 cosh(gamma z) - (V1 / Z0) sinh(gamma z)
 * The tests check this against a line cut into sections and solved node by
 * node, so the standing wave a page draws is the circuit's.
 */
function lineAt(sol, name, z) {
  const el = byName(sol.circuit, name);
  const { v1, i1 } = linePorts(sol, name);
  const g = lineGamma(el, sol.f);
  const gz = cx(g.re * z, g.im * z), ch = cosh(gz), sh = sinh(gz), z0 = cx(el.value);
  return { v: sub(mul(v1, ch), mul(mul(i1, z0), sh)),
           i: sub(mul(i1, ch), mul(div(v1, z0), sh)) };
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
              admittance, solveAt, sweep, voltageAcross, currentThrough, nodeV,
              lineGamma, lineABCD, lineDbPerMetre, linePorts, lineAt, cosh, sinh,
              C_LIGHT, NEPER_DB };

if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.MNA = API;
