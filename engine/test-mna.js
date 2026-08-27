/*
 * test-mna.js - check the engine against closed-form textbook answers.
 * Run: node test-mna.js
 */
const M = require('./mna.js');

let pass = 0, fail = 0;
function near(label, got, want, tolRel = 1e-6) {
  const ok = Math.abs(got - want) <= tolRel * Math.max(1, Math.abs(want));
  (ok ? pass++ : fail++);
  const mark = ok ? 'ok  ' : 'FAIL';
  console.log(`  ${mark} ${label.padEnd(46)} got ${got.toPrecision(10)}  want ${want.toPrecision(10)}`);
}

/* ---- 1. resistive divider: pure sanity, no reactance ---- */
console.log('\nresistive divider (10k over 10k, 10 V in)');
{
  const c = M.parseNetlist(`
    V1 in 0  10
    R1 in mid 10k
    R2 mid 0  10k
  `);
  const s = M.solveAt(c, 1000);
  near('V(mid)', M.abs(M.nodeV(s, 'mid')), 5);
  near('I through R1 (mA)', M.abs(M.currentThrough(s, 'R1')) * 1e3, 0.5);
}

/* ---- 2. series LCR: the one we care about ---- */
const R = 5, L = 10e-6, Cap = 100e-12, Vs = 1;
const f0 = 1 / (2 * Math.PI * Math.sqrt(L * Cap));
const Q  = (1 / R) * Math.sqrt(L / Cap);
const BW = f0 / Q;

console.log(`\nseries LCR  R=${R}ohm L=${L * 1e6}uH C=${Cap * 1e12}pF`);
console.log(`  closed form: f0=${(f0 / 1e6).toFixed(6)} MHz  Q=${Q.toFixed(4)}  BW=${(BW / 1e3).toFixed(4)} kHz`);
{
  const c = M.parseNetlist(`
    V1 in 0  1
    R1 in a  5
    L1 a  b  10u
    C1 b  0  100p
  `);
  const s = M.solveAt(c, f0);

  near('|Z| at f0  = R', Vs / M.abs(M.currentThrough(s, 'R1')), R);
  near('|I| at f0  = Vs/R', M.abs(M.currentThrough(s, 'R1')), Vs / R);
  near('phase of I at f0 = 0 deg', M.arg(M.currentThrough(s, 'R1')) * 180 / Math.PI, 0, 1e-6);
  near('|V(L1)| at f0 = Q.Vs', M.abs(M.voltageAcross(s, 'L1')), Q * Vs);
  near('|V(C1)| at f0 = Q.Vs', M.abs(M.voltageAcross(s, 'C1')), Q * Vs);

  // V across L and C are equal and opposite at resonance - they cancel exactly,
  // which is *why* the impedance collapses to R.
  const vl = M.voltageAcross(s, 'L1'), vc = M.voltageAcross(s, 'C1');
  near('|V(L1) + V(C1)| at f0 = 0', M.abs(M.add(vl, vc)), 0, 1e-9);

  // Half-power points: f0 * ( sqrt(1 + 1/(4Q^2)) -+ 1/(2Q) )
  const k = Math.sqrt(1 + 1 / (4 * Q * Q));
  const fLo = f0 * (k - 1 / (2 * Q)), fHi = f0 * (k + 1 / (2 * Q));
  for (const [nm, fx] of [['lower -3 dB', fLo], ['upper -3 dB', fHi]]) {
    const sx = M.solveAt(c, fx);
    const ratio = M.abs(M.currentThrough(sx, 'R1')) / (Vs / R);
    near(`|I| at ${nm} point / Ipeak = 1/sqrt(2)`, ratio, Math.SQRT1_2, 1e-9);
  }
  near('fHi - fLo = BW = f0/Q', fHi - fLo, BW, 1e-9);

  // Find the peak numerically from a sweep and check it lands on f0.
  const sw = M.sweep(c, f0 / 4, f0 * 4, 20001, true);
  let best = sw[0], bestI = 0;
  for (const p of sw) {
    const i = M.abs(M.currentThrough(p, 'R1'));
    if (i > bestI) { bestI = i; best = p; }
  }
  near('swept peak frequency = f0', best.f, f0, 5e-4);
}

/* ---- 3. parallel tank: impedance should PEAK, current should DIP ---- */
console.log('\nparallel LC tank fed through a resistor (dual of the above)');
{
  const c = M.parseNetlist(`
    V1 in 0  1
    R1 in t  5
    L1 t  0  10u
    C1 t  0  100p
  `);
  const s = M.solveAt(c, f0);
  // At resonance the tank is an open circuit, so all of Vs appears across it
  // and essentially no current flows.
  near('|V(tank)| at f0 = Vs', M.abs(M.nodeV(s, 't')), Vs, 1e-9);
  near('|I| at f0 = 0', M.abs(M.currentThrough(s, 'R1')), 0, 1e-9);
}

/* ---- 4. CR low-pass: -3 dB at f = 1/(2.pi.R.C) ---- */
console.log('\nCR low-pass filter (1k, 159.155nF)');
{
  const Rf = 1000, Cf = 1 / (2 * Math.PI * 1000 * 1000); // fc = 1 kHz
  const c = M.parseNetlist(`
    V1 in 0   1
    R1 in out ${Rf}
    C1 out 0  ${Cf}
  `);
  const fc = 1 / (2 * Math.PI * Rf * Cf);
  const s = M.solveAt(c, fc);
  near('|Vout/Vin| at fc = 1/sqrt(2)', M.abs(M.nodeV(s, 'out')), Math.SQRT1_2);
  near('phase at fc = -45 deg', M.arg(M.nodeV(s, 'out')) * 180 / Math.PI, -45);
  // One decade up is NOT -20 dB: it is -10.log10(1 + 100) = -20.043 dB.
  // -20 dB/decade is the asymptote, which the response only reaches well
  // beyond cutoff. This is exactly the sort of textbook shorthand a live
  // curve exposes and a static Bode sketch hides.
  const dec = M.solveAt(c, fc * 10);
  near('one decade up = -10.log10(101) dB', 20 * Math.log10(M.abs(M.nodeV(dec, 'out'))), -10 * Math.log10(101));
  const d2 = M.solveAt(c, fc * 100), d3 = M.solveAt(c, fc * 1000);
  const slope = 20 * Math.log10(M.abs(M.nodeV(d3, 'out'))) - 20 * Math.log10(M.abs(M.nodeV(d2, 'out')));
  near('asymptotic slope far out (dB/decade)', slope, -20, 1e-4);
}

/* ---- 5. the transistor, as a controlled source ---- */
console.log('\nvoltage controlled current source');
{
  // A hybrid pi small signal model: r-pi from base to emitter, and a current
  // from collector to emitter of gm times the voltage across it. With the
  // emitter grounded this is a common emitter stage, and its gain should come
  // out as gm times the collector load, with the phase showing inversion.
  const gm = 0.192, rpi = 1040, rc = 1200;
  const c = M.parseNetlist(`
    V1 in 0    1
    RS in b    50
    Rpi b 0    ${rpi}
    G1 c 0 b 0 ${gm}
    RC c 0     ${rc}
  `);
  const s = M.solveAt(c, 1000);
  const vb = M.abs(M.nodeV(s, 'b'));
  const vc = M.nodeV(s, 'c');
  near('the base sees a divider against r-pi', vb, rpi / (rpi + 50), 1e-9);
  near('gain is gm times the collector load', M.abs(vc) / vb, gm * rc, 1e-9);
  near('and the output is inverted', Math.abs(M.arg(vc)) * 180 / Math.PI, 180, 1e-6);
  near('the controlled current is gm times Vbe',
       M.abs(M.currentThrough(s, 'G1')), gm * vb, 1e-9);

  // Emitter follower: collector at AC ground, output at the emitter. Gain
  // just under one, and no inversion.
  const f = M.parseNetlist(`
    V1 in 0    1
    RS in b    50
    Rpi b e    ${rpi}
    G1 0 e b e ${gm}
    RE e 0     300
  `);
  const sf = M.solveAt(f, 1000);
  const ve = M.abs(M.nodeV(sf, 'e'));
  const under = ve < 1 && ve > 0.9;
  under ? pass++ : fail++;
  console.log(`  ${under ? 'ok  ' : 'FAIL'} ${'a follower gives just under unity gain'.padEnd(46)} got ${ve.toPrecision(6)}`);
  near('and does not invert', Math.abs(M.arg(M.nodeV(sf, 'e'))) * 180 / Math.PI, 0, 1e-6);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
