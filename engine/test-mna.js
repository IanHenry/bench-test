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

/* ---- transmission lines, each checkable by hand ---- */
console.log('\ntransmission line (T element)');
{
  const f = 14e6, vf = 0.67;
  const lambda = 3e8 * vf / f;                 // wavelength in the line, 14.357 m
  const zin = (c, src) => {
    const s = M.solveAt(c, f);
    return M.div(M.nodeV(s, 'in'), M.currentThrough(s, src));
  };

  // 1. A matched line: whatever its length, the source sees Z0, and the
  // voltage at the far end has the same size as at the near end.
  const matched = M.parseNetlist(`
    V1 s 0 1
    RS s in 50
    T1 in 0 out 0 50 len=23.7 vf=0.67
    RL out 0 50
  `);
  const zm = zin(matched, 'T1');
  near('matched line: source sees 50 + j0, real part', zm.re, 50, 1e-9);
  near('matched line: imaginary part', zm.im, 0, 1e-9);
  const sm = M.solveAt(matched, f);
  near('matched line: |V| at the load = |V| at the input = 0.5',
       M.abs(M.nodeV(sm, 'out')), 0.5, 1e-9);

  // 2. A quarter wave of 75 ohm line on a 100 ohm load: 75^2 / 100 = 56.25.
  const q = M.parseNetlist(`
    V1 in 0 1
    T1 in 0 out 0 75 len=${lambda / 4} vf=0.67
    RL out 0 100
  `);
  const zq = zin(q, 'T1');
  near('lambda/4 of 75 ohm on 100 ohm: Zin = 75^2/100 = 56.25', zq.re, 56.25, 1e-9);
  near('and it is purely resistive', zq.im, 0, 1e-9);

  // 3. A half wave repeats its load, reactance and all: 30 - j40 ohm, made
  // from 30 ohm and the capacitor whose reactance is 40 ohm at 14 MHz.
  const cap = 1 / (2 * Math.PI * f * 40);
  const h = M.parseNetlist(`
    V1 in 0 1
    T1 in 0 out 0 50 len=${lambda / 2} vf=0.67
    RL out m 30
    CL m 0 ${cap}
  `);
  const zh = zin(h, 'T1');
  near('lambda/2 repeats the load: R = 30', zh.re, 30, 1e-8);
  near('lambda/2 repeats the load: X = -40', zh.im, -40, 1e-8);

  // 4. An open quarter wave stub across a matched line is a short at its
  // own frequency, so nothing reaches the load. Shorted, it is an open
  // circuit and makes no difference: the load gets its 0.5 V.
  const stub = end => M.parseNetlist(`
    V1 s 0 1
    RS s n 50
    TS n 0 e 0 50 len=${lambda / 4} vf=0.67
    ${end === 'short' ? 'RX e 0 1n' : ''}
    RL n 0 50
  `);
  near('open lambda/4 stub shorts the line: V at the load = 0',
       M.abs(M.nodeV(M.solveAt(stub('open'), f), 'n')), 0, 1e-9);
  near('shorted lambda/4 stub does nothing: V = 0.5',
       M.abs(M.nodeV(M.solveAt(stub('short'), f), 'n')), 0.5, 1e-7);

  // 5. Feeder loss flatters. A 100 ohm load on 50 ohm line reflects a third
  // of the voltage: return loss 20 log 3 = 9.542 dB, SWR 2. Through 3 dB of
  // feeder the reflection comes back 6 dB down: 15.542 dB at the
  // transmitter, and SWR (1 + r) / (1 - r) with r = (1/3) 10^(-6/20).
  const lossy = M.parseNetlist(`
    V1 s 0 1
    RS s in 50
    T1 in 0 out 0 50 len=37 vf=0.67 db=${3 / 37 * 100}
    RL out 0 100
  `);
  const zl = zin(lossy, 'T1');
  const gIn = M.div(M.sub(zl, M.cx(50)), M.add(zl, M.cx(50)));
  near('return loss at the TX = 9.542 + 2 x 3 dB', -20 * Math.log10(M.abs(gIn)),
       20 * Math.log10(3) + 6, 1e-9);
  const r = Math.pow(10, -6 / 20) / 3;
  near('SWR at the TX = (1 + r)/(1 - r), r = |G| e^(-2 alpha l)',
       (1 + M.abs(gIn)) / (1 - M.abs(gIn)), (1 + r) / (1 - r), 1e-9);
  // and on the same feeder matched, 3 dB is very nearly half: 10^(-0.3)
  const ml = M.solveAt(M.parseNetlist(`
    V1 s 0 1
    RS s in 50
    T1 in 0 out 0 50 len=37 vf=0.67 db=${3 / 37 * 100}
    RL out 0 50
  `), f);
  near('matched, 3 dB of feeder: P(load) / P(in) = 0.5012',
       (M.abs(M.nodeV(ml, 'out')) ** 2) / (M.abs(M.nodeV(ml, 'in')) ** 2), Math.pow(10, -0.3), 1e-9);

  // 6. A line cut into ten sections and solved node by node agrees with
  // the line equations evaluated from port 1, which is how a page draws the
  // standing wave along it.
  const secs = 10, L = 23.7;
  let net = 'V1 s 0 1\nRS s n0 50\n';
  for (let k = 0; k < secs; k++) {
    net += `T${k + 1} n${k} 0 n${k + 1} 0 50 len=${L / secs} vf=0.67 db=4 at=10M\n`;
  }
  net += `RL n${secs} m 20\nLL m 0 1u\n`;
  const cut = M.solveAt(M.parseNetlist(net), f);
  const whole = M.solveAt(M.parseNetlist(
    `V1 s 0 1\nRS s n0 50\nT1 n0 0 n1 0 50 len=${L} vf=0.67 db=4 at=10M\nRL n1 m 20\nLL m 0 1u`), f);
  let worst = 0;
  for (const k of [3, 7, 10]) {
    const a = M.nodeV(cut, 'n' + k), b = M.lineAt(whole, 'T1', L * k / secs).v;
    worst = Math.max(worst, M.abs(M.sub(a, b)) / M.abs(b));
  }
  near('ten sections agree with one line, along its length', worst, 0, 1e-9);
  near('current into section 8 = I(z) from the line equations',
       M.abs(M.currentThrough(cut, 'T8')), M.abs(M.lineAt(whole, 'T1', L * 7 / secs).i), 1e-9);
  const ports = M.linePorts(whole, 'T1');
  near('current out of port 2 = current in the load',
       M.abs(M.sub(ports.i2, M.currentThrough(whole, 'RL'))), 0, 1e-9);

  // 7. Loss scales with the square root of frequency: 4 dB per 100 m at
  // 10 MHz is 8 dB at 40 MHz. At 0 Hz the line is a plain connection.
  const el = M.parseNetlist('T1 a 0 b 0 50 len=1 db=4 at=10M\nR1 a 0 1\nR2 b 0 1').elements[0];
  near('dB per metre at 40 MHz = 2 x that at 10 MHz', M.lineDbPerMetre(el, 40e6), 0.08, 1e-12);
  const dc = M.solveAt(M.parseNetlist('V1 in 0 2\nT1 in 0 out 0 50 len=30 db=4 at=10M\nRL out 0 10'), 0);
  near('at DC the line passes the voltage straight through', M.abs(M.nodeV(dc, 'out')), 2, 1e-12);

  // 8. Against the textbook input impedance of a lossy line,
  // Zin = Z0 (ZL + Z0 tanh gl) / (Z0 + ZL tanh gl), at forty mixed settings:
  // any Z0, length, VF, loss, frequency and complex load.
  const tanh = z => M.div(M.sinh(z), M.cosh(z));
  let seed = 11, worstZ = 0;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let k = 0; k < 40; k++) {
    const z0 = [50, 75, 300, 450][k % 4], fk = 1e6 + rnd() * 400e6, l = 0.1 + rnd() * 60;
    const vfk = 0.5 + rnd() * 0.5, dbk = rnd() * 20, rk = 1 + rnd() * 500, xk = (rnd() - 0.5) * 800;
    const part = xk > 0 ? `LL m 0 ${xk / (2 * Math.PI * fk)}` : `CL m 0 ${1 / (2 * Math.PI * fk * -xk)}`;
    const s = M.solveAt(M.parseNetlist(
      `V1 in 0 1\nT1 in 0 out 0 ${z0} len=${l} vf=${vfk} db=${dbk}\nRL out m ${rk}\n${part}`), fk);
    const ze = M.div(M.nodeV(s, 'in'), M.currentThrough(s, 'T1'));
    const t = tanh(M.cx(dbk / 100 / M.NEPER_DB * l, 2 * Math.PI * fk / (3e8 * vfk) * l));
    const zlk = M.cx(rk, xk), Z = M.cx(z0);
    const zf = M.mul(Z, M.div(M.add(zlk, M.mul(Z, t)), M.add(Z, M.mul(zlk, t))));
    worstZ = Math.max(worstZ, M.abs(M.sub(ze, zf)) / M.abs(zf));
  }
  near('forty lossy lines agree with Z0 (ZL + Z0 tanh gl) / (Z0 + ZL tanh gl)', worstZ, 0, 1e-9);

  // 9. A lossy open quarter wave is not a perfect short: Zin = Z0 tanh(alpha l),
  // which is what sets the depth of a stub's notch.
  const al = 5 / 100 / M.NEPER_DB * lambda / 4;
  const so = M.solveAt(M.parseNetlist(`V1 in 0 1\nT1 in 0 e 0 75 len=${lambda / 4} vf=0.67 db=5`), f);
  near('lossy open lambda/4: Zin = 75 tanh(alpha l)',
       M.div(M.nodeV(so, 'in'), M.currentThrough(so, 'T1')).re, 75 * Math.tanh(al), 1e-9);

  // 10. A line is reciprocal: a current driven in at either end gives the
  // same voltage at the other.
  const recip = (drive, read) => M.nodeV(M.solveAt(M.parseNetlist(
    `I1 0 ${drive} 1\nRA a 0 50\nT1 a 0 b 0 75 len=7.7 vf=0.8 db=3 at=10M\nRL b 0 33`), f), read);
  near('reciprocal: V(b) for 1 A into a = V(a) for 1 A into b',
       M.abs(M.sub(recip('a', 'b'), recip('b', 'a'))), 0, 1e-9);

  // 11. Twin feeder: a load floating off earth, joined to earth only through
  // a megohm, sees the same line as an earthed one.
  const twin = float => {
    const s = M.solveAt(M.parseNetlist(`V1 in 0 1\nT1 in 0 out ${float ? 'r' : '0'} 450 len=13.3 vf=0.91 db=1.2\n` +
      `RL out ${float ? 'r' : '0'} 120${float ? '\nRG r 0 1M' : ''}`), f);
    return M.div(M.nodeV(s, 'in'), M.currentThrough(s, 'T1'));
  };
  near('a balanced load off earth sees the same line', M.abs(M.sub(twin(true), twin(false))) / M.abs(twin(false)), 0, 1e-9);
}

/* ---- coupled inductors: the K element ---- */
console.log('\ncoupled inductors (K element)');
{
  const f = 1e6;
  const ratio = (k, load) => {
    const s = M.solveAt(M.parseNetlist(
      `V1 in 0 1\nL1 in 0 1m\nL2 out 0 4m\nK1 L1 L2 ${k}\nRL out 0 ${load}`), f);
    return M.abs(M.nodeV(s, 'out'));
  };
  // 1. Unloaded, the secondary voltage is the mutual flux: V2 / V1 = M / L1 = k sqrt(L2 / L1).
  near('open secondary, k 0.3: V2/V1 = k sqrt(L2/L1) = 0.6', ratio(0.3, '1e15'), 0.6, 1e-9);
  // 2. Perfect coupling is an ideal transformer: sqrt(L2/L1) = 2, whatever the load.
  near('k = 1, 50 ohm load: V2/V1 = sqrt(L2/L1) = 2', ratio(1, 50), 2, 1e-9);
  near('k = 1, 5 ohm load: still 2', ratio(1, 5), 2, 1e-9);
  // and approaching it: V2/V1 = 2k / |1 + j w L2 (1 - k^2) / RL|
  const kk = 0.999999, w = 2 * Math.PI * f, lk = w * 4e-3 * (1 - kk * kk) / 50;
  near('k = 0.999999 into 50 ohms, the leakage term', ratio(kk, 50), 2 * kk / Math.hypot(1, lk), 1e-9);
  near('k = 0.999999 is within 1e-5 of the ideal 2', ratio(kk, 50), 2, 1e-5);

  // 3. In series, aiding and opposing: L1 + L2 +- 2M, with M = 0.5 sqrt(10u x 40u) = 10 uH.
  const series = flip => {
    const s = M.solveAt(M.parseNetlist(
      `V1 in 0 1\nL1 in m 10u\nL2 ${flip ? '0 m' : 'm 0'} 40u\nK1 L1 L2 0.5`), f);
    return 1 / (w * M.abs(M.currentThrough(s, 'V1')));
  };
  near('series aiding: 10u + 40u + 2 x 10u = 70 uH', series(false) * 1e6, 70, 1e-9);
  near('series opposing: 10u + 40u - 2 x 10u = 30 uH', series(true) * 1e6, 30, 1e-9);

  // 4. Two identical lossless tanks: the modes are f0 / sqrt(1 + k) and f0 / sqrt(1 - k),
  // the windings in phase (L(1 + k) with C) and in antiphase (L(1 - k) with C).
  const L = 100e-6, f0 = 455e3, C = 1 / ((2 * Math.PI * f0) ** 2 * L), k = 0.04;
  const tanks = M.parseNetlist(`I1 0 p 1\nC1 p 0 ${C}\nL1 p 0 ${L}\nL2 q 0 ${L}\nK1 L1 L2 ${k}\n` +
                               `C2 q 0 ${C}\nRA p 0 1e12\nRB q 0 1e12`);
  const peakNear = (fa, fb) => {
    let best = fa, top = 0;
    for (let i = 0; i <= 20000; i++) {
      const fx = fa + (fb - fa) * i / 20000, v = M.abs(M.nodeV(M.solveAt(tanks, fx), 'q'));
      if (v > top) { top = v; best = fx; }
    }
    return best;
  };
  near('lossless: lower mode at f0/sqrt(1 + k)', peakNear(440e3, 455e3), f0 / Math.sqrt(1 + k), 1e-5);
  near('lossless: upper mode at f0/sqrt(1 - k)', peakNear(455e3, 470e3), f0 / Math.sqrt(1 - k), 1e-5);

  // 5. The IF transformer: each tank loaded to Q, fed from a source whose own
  // resistance is the primary's load. The most it can give the secondary is
  // V1/2, as from any matched source. k Q = 1 is critical: one flat peak at
  // that level, and a bandwidth sqrt 2 times one tuned circuit's.
  const Q = 100, R = Q * 2 * Math.PI * f0 * L;
  const pair = kx => M.parseNetlist(`V1 s 0 1\nRS s p ${R}\nC1 p 0 ${C}\nL1 p 0 ${L}\nL2 q 0 ${L}\n` +
                                    `K1 L1 L2 ${kx}\nC2 q 0 ${C}\nR2 q 0 ${R}`);
  const curve = kx => {
    const ck = pair(kx), pts = [];
    for (let i = 0; i <= 6000; i++) {
      const fx = f0 * (0.97 + 0.06 * i / 6000);
      pts.push({ f: fx, v: M.abs(M.nodeV(M.solveAt(ck, fx), 'q')) });
    }
    return pts;
  };
  const humps = pts => pts.filter((q, i) => i > 0 && i < pts.length - 1 && q.v > pts[i - 1].v && q.v >= pts[i + 1].v);
  const crit = curve(1 / Q), top = Math.max(...crit.map(q => q.v));
  // exactly at k Q = 1 the top is flat: the exact circuit leaves a dip of a
  // few parts in a billion, where the narrowband theory has none
  const ch = humps(crit), dipC = ch.length < 2 ? 0 : 20 * Math.log10(ch[0].v /
    Math.min(...crit.filter(q => q.f > ch[0].f && q.f < ch[ch.length - 1].f).map(q => q.v)));
  near('critical: flat top, any dip under 0.001 dB', dipC < 0.001 ? 0 : dipC, 0, 1e-12);
  near('critical: the peak is V1/2, the most there is', top, 0.5, 1e-3);
  const above = crit.filter(q => q.v >= top / Math.SQRT2);
  near('critical: bandwidth = sqrt 2 x f0/Q', above[above.length - 1].f - above[0].f, Math.SQRT2 * f0 / Q, 2e-2);
  // loose (k Q = 0.5): one peak, 2kQ / (1 + (kQ)^2) = 0.8 of the most
  const loose = curve(0.5 / Q);
  near('under-coupled: one peak', humps(loose).length, 1);
  near('under-coupled: peak 0.8 of critical', Math.max(...loose.map(q => q.v)) / 0.5, 0.8, 1e-2);
  // tight (k Q = 2): two humps at full height, and a dip to 0.8 between them
  const tight = curve(2 / Q), th = humps(tight);
  near('over-coupled: two humps', th.length, 2);
  near('over-coupled: humps reach V1/2', Math.min(th[0].v, th[1].v) / 0.5, 1, 1e-2);
  const mid = M.abs(M.nodeV(M.solveAt(pair(2 / Q), f0 * (th[0].f + th[1].f) / (2 * f0)), 'q'));
  near('over-coupled: dip at the centre 0.8 of critical', mid / 0.5, 0.8, 1e-2);

  // 6. Kirchhoff at the primary: the source current is the capacitor's plus the winding's.
  const sk = M.solveAt(pair(1 / Q), f0);
  near('KCL at the primary: I(RS) = I(C1) + I(L1)',
       M.abs(M.sub(M.currentThrough(sk, 'RS'), M.add(M.currentThrough(sk, 'C1'), M.currentThrough(sk, 'L1')))), 0, 1e-12);

  // 7. A lossless pair stores energy but uses none: the power into one winding
  // comes out of the other, so the power into the primary is the power in the load.
  const lossless = M.solveAt(M.parseNetlist(
    'V1 s 0 1\nRS s p 120\nL1 p 0 3.3u\nL2 0 q 47u\nK1 L1 L2 0.62\nRL q 0 220'), 7.3e6);
  const pw = (s, el, node) => { const v = M.nodeV(s, node), i = M.currentThrough(s, el); return M.mul(v, M.cx(i.re, -i.im)).re; };
  const pIn = pw(lossless, 'L1', 'p');
  near('power into the windings = power in the load', pIn, M.abs(M.nodeV(lossless, 'q')) ** 2 / 220, 1e-9);
  near('and the two windings together absorb none',
       pIn + M.mul(M.sub(M.cx(0), M.nodeV(lossless, 'q')), (i => M.cx(i.re, -i.im))(M.currentThrough(lossless, 'L2'))).re, 0, 1e-12);

  // 8. Reciprocal: 1 A into either side gives the same voltage at the other.
  const recip = (drive, read) => M.nodeV(M.solveAt(M.parseNetlist(
    `I1 0 ${drive} 1\nC1 p 0 220p\nL1 p 0 1m\nRA p 0 3k\nL2 q 0 4m\nK1 L1 L2 0.37\nC2 q 0 47p\nRB q 0 8.2k`), 230e3), read);
  near('reciprocal: Z21 = Z12', M.abs(M.sub(recip('p', 'q'), recip('q', 'p'))), 0, 1e-9);

  // 9. k = 0 is two inductors that do not know about each other.
  const zero = withK => M.nodeV(M.solveAt(M.parseNetlist(
    `V1 s 0 1\nRS s p 1k\nC1 p 0 1n\nL1 p 0 120u\nL2 q 0 120u\nC2 q 0 1n\nR2 q 0 1k` + (withK ? '\nK1 L1 L2 0' : '')), 450e3), 'p');
  near('k = 0 gives the uncoupled answer', M.abs(M.sub(zero(true), zero(false))), 0, 1e-12);

  // 10. At DC a coupled winding is a short and couples nothing.
  const dc = M.solveAt(M.parseNetlist('V1 in 0 1\nR1 in a 10\nL1 a 0 1m\nL2 b 0 1m\nK1 L1 L2 0.5\nR2 b 0 10'), 0);
  near('DC: the primary carries 1 V / 10 ohms', M.currentThrough(dc, 'L1').re, 0.1, 1e-12);
  near('DC: nothing on the secondary', M.abs(M.nodeV(dc, 'b')), 0, 1e-12);

  // 11. The branch stamp against a different method: plain nodal analysis
  // with the inverse of the inductance matrix [[L, M], [M, L]], which exists
  // for k < 1. The IF pair of the superhet page, across k, Q and frequency.
  {
    const L0 = 100e-6, F0 = 455e3, C0 = 1 / ((2 * Math.PI * F0) ** 2 * L0);
    const byInverse = (k, q, f) => {
      const w = 2 * Math.PI * f, r = q * 2 * Math.PI * F0 * L0, m = k * L0, det = L0 * L0 - m * m;
      const jw = M.cx(0, w);
      const y11 = M.add(M.cx(1 / r, w * C0), M.div(M.cx(L0 / det), jw));
      const y12 = M.div(M.cx(-m / det), jw);
      const den = M.sub(M.mul(y11, y11), M.mul(y12, y12));
      return M.abs(M.div(M.mul(M.cx(-1 / r), y12), den));
    };
    const byStamp = (k, q, f) => {
      const r = q * 2 * Math.PI * F0 * L0;
      return M.abs(M.nodeV(M.solveAt(M.parseNetlist(`V1 s 0 1\nRS s p ${r}\nC1 p 0 ${C0}\nL1 p 0 ${L0}\n` +
        `L2 q 0 ${L0}\nK1 L1 L2 ${k}\nC2 q 0 ${C0}\nR2 q 0 ${r}`), f), 'q'));
    };
    let worst = 0;
    for (const k of [0.005, 0.02, 0.04, 0.2, 0.7]) for (const q of [20, 50, 200])
      for (const f of [300e3, 440e3, 455e3, 470e3, 910e3, 1365e3]) {
        const a = byStamp(k, q, f), b = byInverse(k, q, f);
        worst = Math.max(worst, Math.abs(a - b) / b);
      }
    near('branch stamp = inverse-inductance nodal solve, worst relative error', worst, 0, 1e-9);
    // the figures the page quotes: humps at k 0.04, Q 50, and the harmonics at critical
    const db = (k, f) => 20 * Math.log10(byStamp(k, 50, f) / 0.5);
    const peak = (a, b) => { let best = a; for (let f = a; f <= b; f += 1) if (db(0.04, f) > db(0.04, best)) best = f; return best; };
    near('k 0.04, Q 50: lower hump 447.4 kHz', peak(440e3, 455e3) / 1e3, 447.4, 2e-4);
    near('k 0.04, Q 50: upper hump 463.1 kHz', peak(455e3, 470e3) / 1e3, 463.1, 2e-4);
    near('critical, Q 50: 2 x IF is 75 dB down', db(0.02, 2 * F0), -75.0, 1e-3);
    near('critical, Q 50: 3 x IF is 88.5 dB down', db(0.02, 3 * F0), -88.5, 1e-3);
  }
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
