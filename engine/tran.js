/*
 * tran.js - time-step nodal analysis for small nonlinear circuits.
 *
 * mna.js solves a linear circuit at one frequency. A rectifier is neither
 * linear nor at one frequency: a diode is off for most of each cycle and on
 * for a short burst near the peak, and what the reservoir capacitor holds
 * depends on everything that happened before. So this steps the circuit
 * through time, a small step h at a time, and at each step solves the
 * nonlinear nodal equations by Newton's method. No dependencies; it runs
 * unchanged in Node and in the browser. Written from the textbook method
 * (companion models and Newton-Raphson); no other simulator was consulted.
 *
 * Netlist syntax follows mna.js: one element per line, nodes by name, '0' or
 * 'gnd' is ground, values take the case-sensitive suffixes p n u m k M G
 * (there is no f for femto: write 1e-14).
 *
 *     R1 a b 10            resistor, ohms
 *     C1 a b 4.7m ic=12    capacitor, farads, optional starting voltage a to b
 *     L1 a b 10m ic=0      inductor, henries, optional starting current a to b
 *     V1 a b 12            voltage source, a positive; opts.sources.V1 = t => v
 *                          replaces the value with a function of time
 *     I1 a b 1m            current source, from a through the source to b
 *     D1 a k is=9.9n n=1.68 rs=30m
 *                          diode, anode a, cathode k: I = Is(e^(V/nVt) - 1)
 *                          through a series resistance rs, folded into the
 *                          diode's own tangent so it adds no node
 *     Z1 a k 6.8 izt=10m nz=1.93
 *                          Zener: a diode forward, and in reverse a current
 *                          of izt at a reverse voltage of exactly vz, rising
 *                          e-fold for every nz x Vt beyond it
 *     Q1 c b e is=1e-14 bf=100 br=1
 *                          NPN transistor, the Ebers-Moll transport model, so
 *                          it is cut off, active or saturated as the circuit
 *                          demands
 *
 * Capacitors and inductors become companion models: at each step a
 * capacitor is a conductance with a current source beside it that remembers
 * its voltage at the last step. Backward Euler (the default) is
 *
 *     i = (C / h)(v - v_prev)
 *
 * which is first order and heavily damped, so a diode switching on cannot
 * set it ringing. The trapezoidal rule ('trap') is second order:
 *
 *     i = (2C / h)(v - v_prev) - i_prev
 *
 * A diode or transistor junction is replaced, at each Newton iteration, by
 * the tangent to its exponential at the present guess: a conductance and a
 * current source. The guess for the next iteration is limited the way SPICE
 * limits it, so an exponential cannot overflow, and a small conductance
 * (GMIN) across every junction keeps a node that only diodes reach from
 * floating when they are all off.
 *
 * Currents are reported positive from a to b as written: for a diode, anode
 * to cathode; for a Zener in breakdown, negative; for a source, from a
 * through the source to b, as in mna.js. A transistor reports its collector
 * current under its own name, its base current as 'Q1.b' (into the base)
 * and its emitter current as 'Q1.e' (out of the emitter).
 */

const MNA_ = (typeof window !== 'undefined' && window.MNA) ||
             (typeof require === 'function' ? require('./mna.js') : null);
const parseValue = MNA_.parseValue;

const VT = 0.025852;       // kT/q at 300 K, volts
const GMIN = 1e-6;         // siemens across every junction: a megohm, a real rectifier's leakage
const DIODE = { is: 9.9e-9, n: 1.68, rs: 0.03 };   // about 0.7 V at 0.1 A, 0.8 V at 1 A
const ZENER = { is: 1e-12, n: 1, izt: 0.01, nz: 1.934 };   // 5 ohms slope at 10 mA
const NPN = { is: 1e-14, bf: 100, br: 1 };

/* ---------------- parsing ---------------- */

function options(tokens, defaults, line) {
  const o = Object.assign({}, defaults);
  for (const kv of tokens) {
    const m = /^([a-z]+)=(.+)$/i.exec(kv);
    if (!m) throw new Error('expected key=value, got ' + kv + ' in: ' + line);
    o[m[1].toLowerCase()] = parseValue(m[2]);
  }
  return o;
}

function parse(text) {
  const elements = [], nodeNames = [], nodeIndex = new Map();
  const nodeOf = name => {
    if (name === '0' || name.toLowerCase() === 'gnd') return -1;
    if (!nodeIndex.has(name)) { nodeIndex.set(name, nodeNames.length); nodeNames.push(name); }
    return nodeIndex.get(name);
  };
  let nBranch = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/[*;#].*$/, '').trim();
    if (!line) continue;
    const tok = line.split(/\s+/);
    const name = tok[0], type = name[0].toUpperCase();
    if (type === 'Q') {
      if (tok.length < 4) throw new Error('a transistor needs collector, base and emitter: ' + line);
      const o = options(tok.slice(4), NPN, line);
      elements.push({ name, type, c: nodeOf(tok[1]), b: nodeOf(tok[2]), e: nodeOf(tok[3]),
                      is: o.is, bf: o.bf, br: o.br, vbe: 0, vbc: 0 });
      continue;
    }
    if (type === 'D') {
      if (tok.length < 3) throw new Error('a diode needs anode and cathode: ' + line);
      const o = options(tok.slice(3), DIODE, line);
      // v is the junction's own voltage, inside the series resistance; gk and
      // ik are the tangent the last iteration used, conductance and current
      elements.push({ name, type, a: nodeOf(tok[1]), b: nodeOf(tok[2]), is: o.is, n: o.n, rs: o.rs,
                      v: 0, gk: GMIN, ik: 0 });
      continue;
    }
    if (tok.length < 4) throw new Error('need "name nodeA nodeB value": ' + line);
    if (type === 'Z') {
      const o = options(tok.slice(4), ZENER, line);
      elements.push({ name, type, a: nodeOf(tok[1]), b: nodeOf(tok[2]), vz: parseValue(tok[3]),
                      is: o.is, n: o.n, izt: o.izt, nz: o.nz, v: 0 });
      continue;
    }
    if (!'RCLVI'.includes(type)) throw new Error('unknown element type in: ' + name);
    const o = options(tok.slice(4), {}, line);
    const el = { name, type, a: nodeOf(tok[1]), b: nodeOf(tok[2]), value: parseValue(tok[3]) };
    if (type === 'C' || type === 'L') el.ic = o.ic || 0;
    if (type === 'V') el.row = nBranch++;
    elements.push(el);
  }
  const n = nodeNames.length;
  for (const el of elements) if (el.type === 'V') el.row += n;
  return { elements, nodeNames, nodeIndex, size: n + nBranch };
}

/* ---------------- junction limiting ---------------- */

// SPICE's pnjlim: keep a junction's next guess within reach of the last one
// once it is conducting, so the exponential neither overflows nor oscillates
function pnjlim(vnew, vold, vt, vcrit) {
  if (vnew > vcrit && Math.abs(vnew - vold) > 2 * vt) {
    if (vold > 0) {
      const arg = 1 + (vnew - vold) / vt;
      return arg > 0 ? vold + vt * Math.log(arg) : vcrit;
    }
    return vt * Math.log(vnew / vt);
  }
  return vnew;
}
const vcritOf = (is, vt) => vt * Math.log(vt / (Math.SQRT2 * is));

// exp that cannot overflow: beyond 80 it carries on as a straight line
function safeExp(x) {
  if (x < 80) return Math.exp(x);
  const e = Math.exp(80);
  return e * (1 + x - 80);
}

/*
 * The junction's share of the voltage v across a diode and its series
 * resistance: vj + rs Is (e^(vj / vt) - 1) = v. The left side only ever
 * rises, so a Newton step kept inside a bracket always finds it.
 */
function junction(el, v, vt) {
  if (!(el.rs > 0)) return v;
  let lo = Math.min(v, 0) - 1e-9, hi = Math.max(v, 0) + 1e-9;
  let vj = Math.min(Math.max(el.v, lo), hi);
  for (let k = 0; k < 60; k++) {
    const e = safeExp(vj / vt), f = vj + el.rs * el.is * (e - 1) - v;
    if (Math.abs(f) < 1e-12) break;
    if (f > 0) hi = vj; else lo = vj;
    let next = vj - f / (1 + el.rs * el.is * e / vt);
    if (!(next > lo && next < hi)) next = (lo + hi) / 2;
    if (Math.abs(next - vj) < 1e-13) { vj = next; break; }
    vj = next;
  }
  return vj;
}

/* ---------------- the solver ---------------- */

/** A dense linear solve with partial pivoting, in place. Returns false if singular. */
function solveDense(A, z, N, x) {
  for (let col = 0; col < N; col++) {
    let piv = col, best = Math.abs(A[col * N + col]);
    for (let r = col + 1; r < N; r++) {
      const m = Math.abs(A[r * N + col]);
      if (m > best) { best = m; piv = r; }
    }
    if (best < 1e-300) return false;
    if (piv !== col) {
      for (let c = 0; c < N; c++) { const t = A[col * N + c]; A[col * N + c] = A[piv * N + c]; A[piv * N + c] = t; }
      const t = z[col]; z[col] = z[piv]; z[piv] = t;
    }
    const d = A[col * N + col];
    for (let r = col + 1; r < N; r++) {
      const f = A[r * N + col] / d;
      if (f === 0) continue;
      for (let c = col; c < N; c++) A[r * N + c] -= f * A[col * N + c];
      z[r] -= f * z[col];
    }
  }
  for (let r = N - 1; r >= 0; r--) {
    let s = z[r];
    for (let c = r + 1; c < N; c++) s -= A[r * N + c] * x[c];
    x[r] = s / A[r * N + r];
  }
  return true;
}

/*
 * The same solve, followed by two rounds of iterative refinement: the
 * residual z - A x is worked out against the original matrix and solved for
 * a correction. Needed when the matrix is badly conditioned, as it is when a
 * big capacitor and a small step (C / h of thousands of siemens) sit beside a
 * winding that only GMIN holds while every diode is off: rounding then moves
 * the floating nodes by microvolts from one Newton iteration to the next,
 * more than the convergence test allows, and the step never converges. The
 * step falls back on this only after ten iterations, so ordinary steps pay
 * nothing for it.
 */
function refinedSolve(A, z, N, x, work) {
  const A0 = work.A0 || (work.A0 = new Float64Array(N * N));
  const A1 = work.A1 || (work.A1 = new Float64Array(N * N));
  const z0 = work.z0 || (work.z0 = new Float64Array(N));
  const r = work.r || (work.r = new Float64Array(N));
  const d = work.d || (work.d = new Float64Array(N));
  A0.set(A); z0.set(z);
  if (!solveDense(A, z, N, x)) return false;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < N; i++) {
      let s = z0[i];
      for (let j = 0; j < N; j++) s -= A0[i * N + j] * x[j];
      r[i] = s;
    }
    A1.set(A0);
    if (!solveDense(A1, r, N, d)) break;
    for (let i = 0; i < N; i++) x[i] += d[i];
  }
  return true;
}

/** The state carried from one step to the next: every unknown, and each store's history. */
function initialState(ckt) {
  // fresh: the first step has no true history of the capacitor currents, so
  // it is taken by backward Euler, which needs none, whatever the method
  const st = { x: new Float64Array(ckt.size), vc: {}, ic: {}, il: {}, vl: {}, vj: {}, fresh: true };
  for (const el of ckt.elements) {
    if (el.type === 'C') { st.vc[el.name] = el.ic; st.ic[el.name] = 0; }
    if (el.type === 'L') { st.il[el.name] = el.ic; st.vl[el.name] = 0; }
  }
  // capacitors with a starting voltage put it on their nodes for the first guess
  for (const el of ckt.elements) {
    if (el.type === 'C' && el.ic) {
      if (el.a >= 0 && el.b < 0) st.x[el.a] = el.ic;
      if (el.b >= 0 && el.a < 0) st.x[el.b] = -el.ic;
    }
  }
  return st;
}

function copyState(st) {
  return { x: Float64Array.from(st.x), vc: Object.assign({}, st.vc), ic: Object.assign({}, st.ic),
           il: Object.assign({}, st.il), vl: Object.assign({}, st.vl), vj: Object.assign({}, st.vj),
           fresh: !!st.fresh };
}

const volt = (x, i) => i >= 0 ? x[i] : 0;

/*
 * One time step of size h ending at time t, from state st. Returns the new
 * state, or null if Newton would not converge (the caller then halves h).
 */
function step(ckt, st, t, h, opts, work) {
  const N = ckt.size, A = work.A, z = work.z, x = work.x, xn = work.xn;
  const trap = opts.method === 'trap' && !st.fresh;
  const src = opts.sources || {};
  x.set(st.x);
  // the junction voltages the last iteration used, for limiting
  for (const el of ckt.elements) {
    // a diode's junction sits inside its series resistance, so its voltage is
    // carried from the last step rather than read off the nodes
    if (el.type === 'D') {
      el.vx = volt(x, el.a) - volt(x, el.b);
      if (st.vj[el.name] !== undefined) el.v = st.vj[el.name];
    }
    else if (el.type === 'Z') el.v = volt(x, el.a) - volt(x, el.b);
    else if (el.type === 'Q') { el.vbe = volt(x, el.b) - volt(x, el.e); el.vbc = volt(x, el.b) - volt(x, el.c); }
  }
  const put = (r, c, g) => { if (r >= 0 && c >= 0) A[r * N + c] += g; };
  const conduct = (a, b, g) => { put(a, a, g); put(b, b, g); put(a, b, -g); put(b, a, -g); };
  // a current i flowing from a to b through an element, as a source term
  const inject = (a, b, i) => { if (a >= 0) z[a] -= i; if (b >= 0) z[b] += i; };

  for (let it = 0; it < 120; it++) {
    A.fill(0); z.fill(0);
    for (const el of ckt.elements) {
      switch (el.type) {
        case 'R': conduct(el.a, el.b, 1 / el.value); break;
        case 'C': {
          const g = (trap ? 2 : 1) * el.value / h;
          conduct(el.a, el.b, g);
          inject(el.a, el.b, -(g * st.vc[el.name] + (trap ? st.ic[el.name] : 0)));
          break;
        }
        case 'L': {
          const g = (trap ? 0.5 : 1) * h / el.value;
          conduct(el.a, el.b, g);
          inject(el.a, el.b, st.il[el.name] + (trap ? g * st.vl[el.name] : 0));
          break;
        }
        case 'V': {
          const k = el.row, v = src[el.name] ? src[el.name](t) : el.value;
          put(el.a, k, 1); put(k, el.a, 1); put(el.b, k, -1); put(k, el.b, -1);
          z[k] = v;
          break;
        }
        case 'I': inject(el.a, el.b, src[el.name] ? src[el.name](t) : el.value); break;
        case 'D': {
          // the diode and its series resistance as one part: at the voltage
          // vx across both, find the junction's share, then the tangent of
          // the whole, di/dv = g / (1 + g rs)
          const vt = el.n * VT, vj = junction(el, el.vx, vt);
          el.v = vj;
          const e = safeExp(vj / vt), g = el.is * e / vt;
          const gk = g / (1 + g * el.rs) + GMIN, i = el.is * (e - 1) + GMIN * el.vx;
          el.gk = gk; el.ik = i - gk * el.vx;
          conduct(el.a, el.b, el.gk);
          inject(el.a, el.b, el.ik);
          break;
        }
        case 'Z': {
          const vt = el.n * VT, vtz = el.nz * VT;
          const ef = safeExp(el.v / vt), er = safeExp((-el.v - el.vz) / vtz);
          const i = el.is * (ef - 1) - el.izt * er;
          const g = el.is * ef / vt + el.izt * er / vtz + GMIN;
          conduct(el.a, el.b, g);
          inject(el.a, el.b, i - g * el.v + GMIN * el.v);
          break;
        }
        case 'Q': {
          const ebe = safeExp(el.vbe / VT), ebc = safeExp(el.vbc / VT);
          const ifw = el.is * (ebe - 1), irv = el.is * (ebc - 1);
          const gbe = el.is * ebe / VT, gbc = el.is * ebc / VT;
          const ic = ifw - irv - irv / el.br, ib = ifw / el.bf + irv / el.br;
          // ic = Icq + gmE vbe + gmC vbc, ib likewise, vbe = Vb - Ve, vbc = Vb - Vc
          const gmE = gbe, gmC = -gbc * (1 + 1 / el.br);
          const gpE = gbe / el.bf, gpC = gbc / el.br;
          const Icq = ic - gmE * el.vbe - gmC * el.vbc;
          const Ibq = ib - gpE * el.vbe - gpC * el.vbc;
          conduct(el.b, el.e, GMIN); conduct(el.b, el.c, GMIN);
          const row = (r, s, gE, gC, q) => {
            put(r, el.b, s * (gE + gC)); put(r, el.e, -s * gE); put(r, el.c, -s * gC);
            if (r >= 0) z[r] -= s * q;
          };
          row(el.c, 1, gmE, gmC, Icq);
          row(el.b, 1, gpE, gpC, Ibq);
          row(el.e, -1, gmE + gpE, gmC + gpC, Icq + Ibq);
          break;
        }
      }
    }
    if (it < 10) {
      if (!solveDense(A, z, N, xn)) return null;
    } else if (!refinedSolve(A, z, N, xn, work)) return null;
    // converged when nothing moved more than a microvolt or so
    let worst = 0;
    for (let i = 0; i < N; i++) {
      const d = Math.abs(xn[i] - x[i]);
      const tol = 1e-6 + 1e-6 * Math.abs(xn[i]);
      if (d / tol > worst) worst = d / tol;
    }
    // limit each junction's next guess
    let limited = false;
    for (const el of ckt.elements) {
      if (el.type === 'D') {
        // with no series resistance the exponential needs SPICE's limiting;
        // with some, the part is a straight line above its knee, and only a
        // jump far past the knee is reined in
        const vt = el.n * VT, want = volt(xn, el.a) - volt(xn, el.b);
        let got = want;
        if (!(el.rs > 0)) got = pnjlim(want, el.vx, vt, vcritOf(el.is, vt));
        else if (want > 0.6 && want - el.vx > 0.5) got = Math.max(el.vx, 0.6) + 0.5;
        if (got !== want) limited = true;
        el.vx = got;
      } else if (el.type === 'Z') {
        const vt = el.n * VT, vtz = el.nz * VT, want = volt(xn, el.a) - volt(xn, el.b);
        let got = want;
        if (want > 0) got = pnjlim(want, el.v, vt, vcritOf(el.is, vt));
        else if (-want > el.vz) {
          // the breakdown side: the same limiting, on the voltage past vz
          const u = pnjlim(-want - el.vz, -el.v - el.vz, vtz, vcritOf(el.izt, vtz));
          got = -u - el.vz;
        }
        if (got !== want) limited = true;
        el.v = got;
      } else if (el.type === 'Q') {
        const vc = vcritOf(el.is, VT);
        const wbe = volt(xn, el.b) - volt(xn, el.e), wbc = volt(xn, el.b) - volt(xn, el.c);
        const gbe = pnjlim(wbe, el.vbe, VT, vc), gbc = pnjlim(wbc, el.vbc, VT, vc);
        if (gbe !== wbe || gbc !== wbc) limited = true;
        el.vbe = gbe; el.vbc = gbc;
      }
    }
    x.set(xn);
    if (worst <= 1 && !limited && it > 0) return finish(ckt, st, x, h, t, opts);
  }
  return null;
}

/* The new state after a converged step, and every branch current at it. */
function finish(ckt, st, x, h, t, opts) {
  const trap = opts.method === 'trap' && !st.fresh;
  const nst = { x: Float64Array.from(x), vc: {}, ic: {}, il: {}, vl: {}, vj: {}, cur: {}, fresh: false };
  for (const el of ckt.elements) {
    const va = volt(x, el.a), vb = volt(x, el.b);
    switch (el.type) {
      case 'R': nst.cur[el.name] = (va - vb) / el.value; break;
      case 'C': {
        const v = va - vb;
        const i = trap ? 2 * el.value / h * (v - st.vc[el.name]) - st.ic[el.name]
                       : el.value / h * (v - st.vc[el.name]);
        nst.vc[el.name] = v; nst.ic[el.name] = i; nst.cur[el.name] = i;
        break;
      }
      case 'L': {
        const v = va - vb;
        const i = trap ? st.il[el.name] + h / (2 * el.value) * (v + st.vl[el.name])
                       : st.il[el.name] + h / el.value * v;
        nst.il[el.name] = i; nst.vl[el.name] = v; nst.cur[el.name] = i;
        break;
      }
      case 'V': nst.cur[el.name] = x[el.row]; break;
      case 'I': nst.cur[el.name] = (opts.sources || {})[el.name] ? opts.sources[el.name](t) : el.value; break;
      case 'D': {
        // the current the converged tangent gives, which is what the nodal
        // equations balanced; the junction voltage follows from it
        const v = va - vb, i = el.gk * v + el.ik;
        nst.cur[el.name] = i; nst.vj[el.name] = v - i * el.rs;
        break;
      }
      case 'Z': {
        const v = va - vb;
        nst.cur[el.name] = el.is * (safeExp(v / (el.n * VT)) - 1) -
                           el.izt * safeExp((-v - el.vz) / (el.nz * VT)) + GMIN * v;
        break;
      }
      case 'Q': {
        const vbe = volt(x, el.b) - volt(x, el.e), vbc = volt(x, el.b) - volt(x, el.c);
        const ifw = el.is * (safeExp(vbe / VT) - 1), irv = el.is * (safeExp(vbc / VT) - 1);
        const ic = ifw - irv - irv / el.br + GMIN * -vbc;
        const ib = ifw / el.bf + irv / el.br + GMIN * (vbe + vbc);
        nst.cur[el.name] = ic; nst.cur[el.name + '.b'] = ib; nst.cur[el.name + '.e'] = ic + ib;
        break;
      }
    }
  }
  return nst;
}

/*
 * Run the circuit from t0 to tStop in steps of dt, halving a step that will
 * not converge (down to dt / 1024). Records every `every`th step from
 * recordFrom onwards.
 *
 * opts = { dt, tStop, t0 = 0, sources: { V1: t => volts }, method: 'be' | 'trap',
 *          recordFrom = t0, every = 1, state }
 * Returns { t: Float64Array, v: { node: Float64Array }, i: { name: Float64Array },
 *           state, steps } where state continues the run.
 */
function run(ckt, opts) {
  const N = ckt.size;
  const work = { A: new Float64Array(N * N), z: new Float64Array(N),
                 x: new Float64Array(N), xn: new Float64Array(N) };
  let st = opts.state ? copyState(opts.state) : initialState(ckt);
  const t0 = opts.t0 || 0, dt = opts.dt;
  const nSteps = Math.round((opts.tStop - t0) / dt);
  const from = opts.recordFrom === undefined ? t0 : opts.recordFrom;
  const every = opts.every || 1;
  const T = [], V = {}, I = {};
  ckt.nodeNames.forEach(n => { V[n] = []; });
  let steps = 0;
  const advance = (s, t, h, depth) => {
    const next = step(ckt, s, t, h, opts, work);
    if (next) { steps++; return next; }
    if (depth > 10) throw new Error('no convergence at t = ' + t);
    const mid = advance(s, t - h / 2, h / 2, depth + 1);
    return advance(mid, t, h / 2, depth + 1);
  };
  for (let k = 1; k <= nSteps; k++) {
    const t = t0 + k * dt;
    st = advance(st, t, dt, 0);
    if (t >= from - dt * 1e-6 && (k % every === 0)) {
      T.push(t);
      ckt.nodeNames.forEach((n, i) => V[n].push(st.x[i]));
      for (const name of Object.keys(st.cur)) (I[name] = I[name] || []).push(st.cur[name]);
    }
  }
  const f64 = o => { const r = {}; for (const k of Object.keys(o)) r[k] = Float64Array.from(o[k]); return r; };
  return { t: Float64Array.from(T), v: f64(V), i: f64(I), state: st, steps };
}

/*
 * Run a circuit driven by sources of period `period` until it settles into
 * a repeating cycle, then record the last `keep` cycles. Settled means the
 * unknowns at the end of a cycle agree with those a cycle earlier to within
 * tol (volts or amperes), or `cycles` cycles have run.
 *
 * opts = { period, stepsPerCycle = 400, sources, method, cycles = 60, keep = 2,
 *          tol = 1e-4, minCycles = 2, extrapolate = true }
 * extrapolate: false turns off the jump ahead described below.
 * Returns run()'s record, with t measured from the start of the kept cycles,
 * plus cyclesRun and settled.
 */
function settle(ckt, opts) {
  const P = opts.period, dt = P / (opts.stepsPerCycle || 400);
  const maxC = opts.cycles || 60, keep = opts.keep || 2, tol = opts.tol || 1e-4;
  const caps = opts.extrapolate === false ? [] : ckt.elements.filter(el => el.type === 'C');
  let state = null, t = 0, n = 0, settled = false;
  let hist = [], rPrev = NaN, sinceJump = 99;
  while (n < maxC) {
    const r = run(ckt, Object.assign({}, opts, { dt, t0: t, tStop: t + P, state, recordFrom: Infinity }));
    n++; t += P; sinceJump++;
    if (state) {
      let worst = 0;
      for (let i = 0; i < r.state.x.length; i++) worst = Math.max(worst, Math.abs(r.state.x[i] - state.x[i]));
      if (worst < tol && n >= (opts.minCycles || 2) && sinceJump >= 2) { state = r.state; settled = true; break; }
    }
    state = r.state;
    /*
     * A big reservoir on a light load, or one topped up thousands of times a
     * second, creeps towards its steady charge by the same small fraction
     * each cycle, and could take thousands of cycles to get there; a change
     * per cycle under tol is then no proof of being there. So once three
     * cycles show the capacitor voltages closing in geometrically, by a
     * steady ratio q a cycle, jump to where that series ends, adding
     * d q / (1 - q) to each, and carry on from there. The jump is checked by
     * the cycles that follow: settled still needs two more that agree.
     */
    if (caps.length) {
      hist.push(caps.map(el => state.vc[el.name]));
      if (hist.length > 3) hist.shift();
      if (hist.length === 3) {
        let num = 0, den = 0, big = 0;
        const d2 = caps.map((el, i) => hist[2][i] - hist[1][i]);
        caps.forEach((el, i) => { const d1 = hist[1][i] - hist[0][i]; num += d2[i] * d1; den += d1 * d1; big = Math.max(big, Math.abs(d2[i])); });
        const q = den > 0 ? num / den : NaN;
        if (q > 0.5 && q < 0.9995 && Math.abs(q - rPrev) < 0.1 * (1 - q) && big > 1e-9) {
          const k = q / (1 - q);
          state = copyState(state);
          caps.forEach((el, i) => {
            const dv = d2[i] * k;
            state.vc[el.name] += dv;
            if (el.a >= 0 && el.b < 0) state.x[el.a] += dv;
            else if (el.b >= 0 && el.a < 0) state.x[el.b] -= dv;
          });
          state.fresh = true;   // the capacitor currents' history no longer applies
          hist = []; rPrev = NaN; sinceJump = 0;
        } else rPrev = q;
      }
    }
  }
  const r = run(ckt, Object.assign({}, opts, { dt, t0: t, tStop: t + keep * P, state, recordFrom: t }));
  const tt = r.t.map(x => x - t);
  return Object.assign(r, { t: tt, cyclesRun: n, settled });
}

/* ---------------- reading a record ---------------- */

/** The value of a recorded series at time t, by straight lines between samples. */
function at(rec, series, t) {
  const T = rec.t, n = T.length;
  if (!n) return 0;
  if (t <= T[0]) return series[0];
  if (t >= T[n - 1]) return series[n - 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= t) lo = m; else hi = m; }
  const f = (t - T[lo]) / (T[hi] - T[lo]);
  return series[lo] + f * (series[hi] - series[lo]);
}

/** Largest, smallest and mean of a series, the mean by the trapezium rule over time. */
function stats(rec, series) {
  let max = -Infinity, min = Infinity, area = 0;
  for (let k = 0; k < series.length; k++) {
    max = Math.max(max, series[k]); min = Math.min(min, series[k]);
    if (k) area += 0.5 * (series[k] + series[k - 1]) * (rec.t[k] - rec.t[k - 1]);
  }
  const span = rec.t[rec.t.length - 1] - rec.t[0];
  return { max, min, mean: span > 0 ? area / span : series[0], pp: max - min };
}

/** A node's voltage series ('0' is ground, all zeros). */
function node(rec, name) {
  if (name === '0' || name === 'gnd') return new Float64Array(rec.t.length);
  if (!rec.v[name]) throw new Error('no node named ' + name);
  return rec.v[name];
}

/** The voltage between two nodes, as a series. */
function across(rec, a, b) {
  const va = node(rec, a), vb = node(rec, b);
  return va.map((v, k) => v - vb[k]);
}

const API = { parse, run, settle, at, stats, node, across, VT, GMIN, DIODE, ZENER, NPN };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.Tran = API;
