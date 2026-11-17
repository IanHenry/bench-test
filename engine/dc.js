/*
 * dc.js - operating points, load lines and conduction angle.
 *
 * The third engine. mna.js answers what a linear circuit does at a frequency,
 * dsp.js answers what a signal contains. This one answers where a device sits
 * before any signal arrives, and what happens to a signal once the device
 * stops being linear.
 *
 * That second half is what makes amplifier classes work. A class of operation
 * is nothing more than a choice of where to bias the device, and everything
 * else follows from the fraction of the cycle it conducts for. Rather than
 * quoting the textbook efficiencies, they are derived here from the Fourier
 * coefficients of the truncated sine the transistor actually passes, so the
 * numbers on the screen come out of the model instead of a table.
 */

/* ---------- diode ---------- */

/** Shockley diode current for an applied voltage. */
function diodeCurrent(v, opts) {
  opts = opts || {};
  const Is = opts.Is || 1e-14;        // saturation current
  const nVt = (opts.n || 1.0) * 0.02585;
  const Iz = opts.zener;              // reverse breakdown voltage, if any
  if (Iz && v < -Iz) {
    // past the knee a Zener holds its voltage, so current rises steeply
    return -(Math.exp((-v - Iz) / 0.02) - 1) * 1e-6;
  }
  return Is * (Math.exp(v / nVt) - 1);
}

/** Forward voltage for a wanted current, found by bisection on the curve. */
function diodeVoltage(i, opts) {
  let lo = 0, hi = 2;
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    if (diodeCurrent(mid, opts) < i) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/* ---------- load line ---------- */

/**
 * Where a device sits on its load line.
 *
 * The load line is simply Ohm's law for the collector resistor: every volt
 * dropped across it is a milliamp or so through the transistor. Its two ends
 * are the supply voltage with no current, and the supply divided by the
 * resistor with no voltage left over.
 */
function loadLine(vcc, rl) {
  return { vMax: vcc, iMax: vcc / rl, at: v => (vcc - v) / rl };
}

/**
 * Operating point of a common emitter stage from its base current and gain.
 * Clipped at both ends: a transistor cannot pass more than the load allows,
 * nor push the collector below saturation.
 */
function operatingPoint(vcc, rl, ib, beta, vsat) {
  vsat = vsat === undefined ? 0.2 : vsat;
  const wanted = beta * ib;
  const iMax = (vcc - vsat) / rl;
  const ic = Math.min(wanted, iMax);
  return {
    ic: ic, vce: Math.max(vsat, vcc - ic * rl),
    saturated: wanted >= iMax,
    dissipation: ic * Math.max(vsat, vcc - ic * rl)
  };
}

/**
 * A bipolar stage biased by a divider, with collector and emitter resistors,
 * solved in whichever of its three states it is actually in.
 *
 * The divider is replaced by what the base sees: vth behind R1 and R2 in
 * parallel. In the active region the base current flows through that and
 * through the emitter resistor, scaled up by beta + 1. If the collector
 * current that implies would pull the collector below saturation, the
 * transistor is not in the active region at all: it is saturated, the
 * collector sits at vsat above the emitter, and the currents are set by the
 * resistors instead of by beta. Solving that state properly is what keeps the
 * collector voltage from going negative and the collector current from
 * exceeding what the resistors allow, (vcc - vsat) / (rc + re).
 *
 * The same sums serve a PNP stage drawn upside down, with every voltage
 * measured down from the rail instead of up from ground.
 */
function dividerBias(vcc, r1, r2, rc, re, beta, opts) {
  opts = opts || {};
  const vbe = opts.vbe === undefined ? 0.6 : opts.vbe;
  const vsat = opts.vsat === undefined ? 0.2 : opts.vsat;
  const vth = vcc * r2 / (r1 + r2), rth = r1 * r2 / (r1 + r2);
  const icMax = (vcc - vsat) / (rc + re);
  const out = { vth: vth, rth: rth, icMax: icMax };

  const ibActive = (vth - vbe) / (rth + (beta + 1) * re);
  if (!(ibActive > 0)) {
    return Object.assign(out, { state: 'cut off', ib: 0, ic: 0, ie: 0,
      vb: vth, ve: 0, vc: vcc, vce: vcc });
  }
  let ib = ibActive, ic = beta * ib, ie = ic + ib;
  let ve = ie * re, vc = vcc - ic * rc;
  if (vc - ve >= vsat) {
    return Object.assign(out, { state: 'active', ib: ib, ic: ic, ie: ie,
      vb: ve + vbe, ve: ve, vc: vc, vce: vc - ve });
  }
  // Saturated: three unknowns, ve, ib and ic, from
  //   ib = (vth - vbe - ve) / rth,  ic = (vcc - vsat - ve) / rc,  ve = (ib + ic) re
  ve = re * ((vth - vbe) / rth + (vcc - vsat) / rc) / (1 + re / rth + re / rc);
  ib = Math.max(0, (vth - vbe - ve) / rth);
  ic = Math.max(0, (vcc - vsat - ve) / rc);
  ie = ib + ic;
  return Object.assign(out, { state: 'saturated', ib: ib, ic: ic, ie: ie,
    vb: ve + vbe, ve: ve, vc: ve + vsat, vce: vsat });
}

/* ---------- field effect transistors ---------- */

/**
 * Drain current of an n channel depletion device (a JFET, or one half of a
 * dual gate MOSFET). vp is the pinch off voltage, negative. Below it nothing
 * flows. With enough drain voltage the channel is pinched off at the drain end
 * and the current follows the square law, which is where it amplifies. With
 * too little it is ohmic, a resistor the gate voltage sets.
 */
function jfetCurrent(vgs, vds, idss, vp) {
  if (vgs <= vp || vds <= 0) return 0;
  const u = 1 - vgs / vp;                    // 0 at pinch off, 1 at vgs = 0
  const knee = vgs - vp;                     // drain voltage where it pinches off
  if (vds >= knee) return idss * u * u;
  const x = vds / -vp;
  return idss * (2 * u * x - x * x);
}

/** The drain to source voltage a device needs to pass id at this gate voltage. */
function fetVdsFor(id, vgs, idss, vp) {
  if (id <= 0) return 0;
  const sat = jfetCurrent(vgs, 1e9, idss, vp);
  if (id >= sat) return Infinity;
  let lo = 0, hi = vgs - vp;
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    if (jfetCurrent(vgs, mid, idss, vp) < id) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * A JFET stage biased the way the exam draws it: a divider on the gate, a
 * resistor in the source, a load in the drain. The gate draws no current, so
 * the divider gives exactly vcc R2 / (R1 + R2) however large R1 and R2 are.
 * The current then settles where the device curve and the source resistor
 * agree: vgs = vg - id rs.
 */
function fetDividerBias(vcc, r1, r2, rd, rs, idss, vp) {
  const vg = vcc * r2 / (r1 + r2);
  let lo = 0, hi = vcc / (rd + rs);
  for (let k = 0; k < 80; k++) {
    const id = (lo + hi) / 2;
    const vs = id * rs, vd = vcc - id * rd;
    if (id > jfetCurrent(vg - vs, vd - vs, idss, vp)) hi = id; else lo = id;
  }
  const id = (lo + hi) / 2, vs = id * rs, vd = vcc - id * rd;
  const vgs = vg - vs, vds = vd - vs;
  const region = vgs <= vp || id < 1e-9 ? 'cut off'
    : (vds >= vgs - vp ? 'pinched off' : 'ohmic');
  return { vg: vg, vs: vs, vd: vd, vgs: vgs, vds: vds, id: id, region: region };
}

/**
 * A dual gate MOSFET is two depletion devices in series inside one package:
 * gate 1 controls the lower one, gate 2 the upper, and they share one current.
 * Gate 2 is held at a steady voltage. While it is high enough, the upper half
 * stays out of the way and gate 1 alone decides the current. Lower it and the
 * upper half starts to throttle the lower one, the current and the gain fall,
 * which is how automatic gain control is applied to such a stage.
 *
 * o: { vcc, vg1, vg2, rd, rs, idss, vp, vs } where vs, if given, holds the
 * source at a fixed voltage, as a bypass capacitor does to a signal.
 */
function dualGateBias(o) {
  const vg1 = o.vg1 || 0;
  const tooMuch = id => {
    const vs = o.vs === undefined ? id * o.rs : o.vs;
    const d1 = fetVdsFor(id, vg1 - vs, o.idss, o.vp);
    if (!isFinite(d1)) return true;
    const vx = vs + d1, vd = o.vcc - id * o.rd;
    if (vd <= vx) return true;
    return id > jfetCurrent(o.vg2 - vx, vd - vx, o.idss, o.vp);
  };
  let lo = 0, hi = o.vcc / (o.rd + (o.vs === undefined ? o.rs : 0));
  for (let k = 0; k < 80; k++) {
    const mid = (lo + hi) / 2;
    if (tooMuch(mid)) hi = mid; else lo = mid;
  }
  const id = lo;
  const vs = o.vs === undefined ? id * o.rs : o.vs;
  const d1 = fetVdsFor(id, vg1 - vs, o.idss, o.vp);
  const vx = vs + (isFinite(d1) ? d1 : 0);
  // the lower half is ohmic when the upper one has left it too little voltage
  const throttled = id > 1e-9 && (vx - vs) < (vg1 - vs - o.vp) - 1e-6;
  return { id: id, vs: vs, vx: vx, vd: o.vcc - id * o.rd,
           vg1s: vg1 - vs, vg2s: o.vg2 - vs, throttled: throttled };
}

/* ---------- large signals ---------- */

/**
 * How much of a sine survives at its own frequency once it is clipped.
 *
 * A device swinging about its operating point runs out of room at some point
 * below (it cuts off) and some point above (it saturates). lo and hi are those
 * distances from the operating point. Clip a sine of peak `drive` there and
 * take the fundamental of what is left: this returns that fundamental as a
 * fraction of the drive. It is 1 while nothing is clipped, it falls as the
 * drive grows, and it is what stops an oscillator's amplitude growing for ever.
 */
function fundamentalGain(drive, lo, hi, n) {
  if (!(drive > 0)) return 1;
  if (lo <= 0 && hi <= 0) return 0;
  n = n || 720;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const ph = 2 * Math.PI * (i + 0.5) / n;
    const v = Math.max(-Math.max(0, lo), Math.min(Math.max(0, hi), drive * Math.sin(ph)));
    s += v * Math.sin(ph);
  }
  return (2 * s / n) / drive;
}

/* ---------- conduction angle and amplifier class ---------- */

/**
 * Fraction of a cycle a device conducts for, given where it is biased.
 *
 * bias runs 0 to 1 across the device's usable range: 0.5 sits halfway up,
 * which conducts for the whole cycle, and 0 sits at cut off, which conducts
 * for half of it. drive is the peak of the input relative to that range.
 */
function conductionAngle(bias, drive) {
  if (drive <= 0) return 0;
  const s = -bias / drive;                // sine value at which it cuts off
  if (s <= -1) return 2 * Math.PI;        // never cuts off, class A
  if (s >= 1) return 0;                   // never turns on
  return Math.PI - 2 * Math.asin(s);
}

/** The name the syllabus gives to a conduction angle. */
function classOf(theta) {
  const deg = theta * 180 / Math.PI;
  if (deg >= 359.5) return 'A';
  if (deg > 181) return 'AB';
  if (deg >= 179) return 'B';
  if (deg > 0) return 'C';
  return 'off';
}

/**
 * Fourier coefficients of the truncated sine a biased device passes.
 *
 * a0 is the DC the supply has to provide, a1 the fundamental delivered to the
 * tuned load. Efficiency is the ratio of the power in a1 to the power drawn
 * as a0, which is where 50% for class A and 78.5% for class B come from
 * without either being written down anywhere.
 */
function classPerformance(theta) {
  if (theta <= 0) return { a0: 0, a1: 0, efficiency: 0 };
  const h = theta / 2;
  // standard results for a cosine pulse of half angle h
  const a0 = (Math.sin(h) - h * Math.cos(h)) / (Math.PI * (1 - Math.cos(h)));
  const a1 = (h - Math.sin(h) * Math.cos(h)) / (Math.PI * (1 - Math.cos(h)));
  const efficiency = a0 > 0 ? 0.5 * a1 / a0 : 0;
  return { a0: a0, a1: a1, efficiency: Math.min(1, efficiency) };
}

/** One cycle of collector current for a given bias and drive. */
function collectorWave(bias, drive, n) {
  n = n || 512;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const v = (bias - 0.5) + drive * Math.sin(2 * Math.PI * i / n);
    out[i] = Math.max(0, v + 0.5);      // the device cannot pass negative current
  }
  return out;
}

const API = { diodeCurrent, diodeVoltage, loadLine, operatingPoint,
              dividerBias, jfetCurrent, fetVdsFor, fetDividerBias, dualGateBias,
              fundamentalGain,
              conductionAngle, classOf, classPerformance, collectorWave };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.DC = API;
