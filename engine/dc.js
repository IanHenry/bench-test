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
              conductionAngle, classOf, classPerformance, collectorWave };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.DC = API;
