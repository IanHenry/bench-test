/*
 * test-tran.js - check the time-step solver against answers worked by hand.
 * Run: node test-tran.js
 */
const T = require('./tran.js');

let pass = 0, fail = 0;
function near(label, got, want, tol, abs) {
  const err = abs ? Math.abs(got - want) : Math.abs(got - want) / Math.max(1e-30, Math.abs(want));
  const ok = err <= tol;
  (ok ? pass++ : fail++);
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(58)} got ${got.toPrecision(7)}  want ${want.toPrecision(7)}`);
}
function is(label, cond, detail) {
  (cond ? pass++ : fail++);
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}${detail ? '  (' + detail + ')' : ''}`);
}
const last = a => a[a.length - 1];
const maxOf = a => a.reduce((m, v) => Math.max(m, v), -Infinity);
const VT = T.VT;

/* ---- 1. RC charging: v = V(1 - e^(-t/RC)) ---- */
console.log('\nRC charge, 10 V through 1 kOhm into 1 uF (tau 1 ms)');
for (const method of ['be', 'trap']) {
  const c = T.parse('V1 s 0 10\nR1 s p 1k\nC1 p 0 1u');
  const r = T.run(c, { dt: 1e-6, tStop: 1e-3, method });
  near(`${method}: v(tau) = 10(1 - 1/e) = 6.3212 V`, last(r.v.p), 10 * (1 - Math.exp(-1)), method === 'be' ? 1e-3 : 1e-5);
  const r5 = T.run(c, { dt: 1e-5, tStop: 5e-3, method });
  near(`${method}: v(5 tau) = 10(1 - e^-5) = 9.9326 V`, last(r5.v.p), 10 * (1 - Math.exp(-5)), method === 'be' ? 1e-3 : 1e-5);
  near(`${method}: current at 5 tau = 10 mA x e^-5`, last(r5.i.C1), 0.01 * Math.exp(-5), method === 'be' ? 0.05 : 1e-3);
}
{
  // a capacitor that starts charged discharges from its starting voltage
  const c = T.parse('C1 p 0 1u ic=5\nR1 p 0 1k');
  const r = T.run(c, { dt: 1e-6, tStop: 1e-3, method: 'trap' });
  near('trap: 5 V on 1 uF into 1 kOhm, v(tau) = 5/e', last(r.v.p), 5 * Math.exp(-1), 1e-5);
}

/* ---- 2. LR: i = (V/R)(1 - e^(-tR/L)) ---- */
console.log('\nLR, 1 V into 10 Ohm and 10 mH (tau 1 ms)');
for (const method of ['be', 'trap']) {
  const c = T.parse('V1 s 0 1\nR1 s p 10\nL1 p 0 10m');
  const r = T.run(c, { dt: 1e-6, tStop: 1e-3, method });
  near(`${method}: i(tau) = 0.1(1 - 1/e) A`, last(r.i.L1), 0.1 * (1 - Math.exp(-1)), method === 'be' ? 1e-3 : 1e-5);
}

/* ---- 3. the diode itself ---- */
console.log('\ndiode, the default rectifier');
{
  const { is: Is, n, rs } = T.DIODE;
  const vd = i => n * VT * Math.log(i / Is + 1) + i * rs;
  near('0.1 A: about 0.7 V', vd(0.1), 0.70, 0.01);
  near('1 A: about 0.8 V', vd(1), 0.80, 0.05);
  // 5 V through 1 kOhm: bisect I = (5 - Vd(I)) / 1000 by hand, against the solver
  let lo = 0, hi = 5e-3;
  for (let k = 0; k < 80; k++) { const m = (lo + hi) / 2; if (m * 1000 + vd(m) < 5) lo = m; else hi = m; }
  const c = T.parse('V1 s 0 5\nR1 s a 1k\nD1 a 0');
  const r = T.run(c, { dt: 1e-6, tStop: 3e-6 });
  near('5 V, 1 kOhm, diode: current, against the equation solved by hand', last(r.i.D1), lo, 1e-5);
  near('and the diode drops about 0.6 V at 4.4 mA', last(r.v.a), vd(lo), 1e-4);
  const back = T.parse('V1 s 0 -5\nR1 s a 1k\nD1 a 0');
  const rb = T.run(back, { dt: 1e-6, tStop: 3e-6 });
  near('reverse biased, it passes only its leakage (5 V at 1 MOhm)', last(rb.i.D1), -5e-6, 0.01);
}

/* ---- 4. half-wave rectifier, resistive load: peak = Vpk - Vd ---- */
const F = 50, P = 1 / F;
const sine = (vpk, f, sign) => t => (sign || 1) * vpk * Math.sin(2 * Math.PI * (f || F) * t);
console.log('\nhalf-wave rectifier, 17 V peak into 1 kOhm, no capacitor');
{
  const vpk = 17;
  const c = T.parse('VS s 0 0\nD1 s p\nRL p 0 1k');
  const r = T.run(c, { dt: P / 2000, tStop: P, sources: { VS: sine(vpk) } });
  // at the peak: I = Vout / 1000 and Vout = 17 - Vd(I), solved by bisection
  const { is: Is, n, rs } = T.DIODE;
  const vd = i => n * VT * Math.log(i / Is + 1) + i * rs;
  let lo = 0, hi = 0.02;
  for (let k = 0; k < 80; k++) { const m = (lo + hi) / 2; if (m * 1000 + vd(m) < vpk) lo = m; else hi = m; }
  near('peak output = Vpk - Vd, solved by hand', maxOf(r.v.p), lo * 1000, 1e-4);
  near('which is about Vpk - 0.7 V', maxOf(r.v.p), vpk - 0.7, 0.1, true);
  // only the diode's leakage, 17 V across its megohm, reaches the 1 kOhm load
  near('pulsed DC: nothing in the other half but 17 mV of leakage', T.at(r, r.v.p, 0.75 * P), -0.017, 1e-3, true);
  near('PIV with no capacitor = Vpk', maxOf(T.across(r, 'p', 's')), vpk, 0.001);
}

/* ---- 5. ripple: about I / (f C), 50 Hz half wave, 100 Hz full wave ---- */
console.log('\nripple with a reservoir, 12 V RMS, 0.3 Ohm winding, 22 mF, 0.5 A steady load');
const vrms = 12, vpk = vrms * Math.SQRT2, C = 22e-3, IL = 0.5;
const half = 'VS s 0 0\nRW s a 0.3\nD1 a p\nC1 p 0 22m\nIL p 0 ' + IL;
const bridge = 'VS x y 0\nRW x a 0.3\nD1 a p\nD2 y p\nD3 0 a\nD4 0 y\nC1 p 0 22m\nIL p 0 ' + IL;
// the time from each peak of a waveform to the trough after it, averaged:
// while the voltage falls, the load is fed by the reservoir alone, near enough
function fallTime(r, v) {
  const sum = [];
  let peak = null;
  for (let k = 1; k < v.length - 1; k++) {
    if (v[k] >= v[k - 1] && v[k] > v[k + 1]) peak = r.t[k];
    if (v[k] < v[k - 1] && v[k] <= v[k + 1] && peak !== null) { sum.push(r.t[k] - peak); peak = null; }
  }
  return sum.reduce((a, b) => a + b, 0) / sum.length;
}
function minimaPerCycle(r, series) {
  let n = 0;
  for (let k = 1; k < series.length - 1; k++) if (series[k] < series[k - 1] && series[k] <= series[k + 1]) n++;
  return n / ((r.t[r.t.length - 1] - r.t[0]) / P);
}
{
  const r = T.settle(T.parse(half), { period: P, sources: { VS: sine(vpk) }, keep: 4 });
  const s = T.stats(r, r.v.p), est = IL / (F * C);
  is('half wave settles', r.settled, r.cyclesRun + ' cycles');
  // while the diode is off the load's 0.5 A comes from C alone, so the fall is I t_off / C
  near('half wave: ripple = I x t_fall / C, t_fall read off the waveform', s.pp, IL * fallTime(r, r.v.p) / C, 0.03);
  is('which is under I/(fC) = 0.4545 V, since the diode conducts for part of the cycle',
     s.pp < est && s.pp > 0.6 * est, s.pp.toFixed(3) + ' V');
  near('half wave: one trough a cycle, so ripple at 50 Hz', minimaPerCycle(r, r.v.p) * F, 50, 0.01);
  const pivH = maxOf(T.across(r, 'p', 'a'));
  near('half wave: PIV with a reservoir about 2 x Vpk = 33.9 V', pivH, 2 * vpk, 0.08);
  // at the negative peak the winding gives -Vpk and C still holds its charge
  near('and exactly Vpk + the reservoir voltage at the negative peak', pivH, vpk + T.at(r, r.v.p, 0.75 * P), 0.002);
  const rt = T.settle(T.parse(half), { period: P, sources: { VS: sine(vpk) }, keep: 4, method: 'trap' });
  near('trapezoidal agrees on the ripple', T.stats(rt, rt.v.p).pp, s.pp, 0.03);
}
{
  const r = T.settle(T.parse(bridge), { period: P, sources: { VS: sine(vpk) }, keep: 4 });
  const s = T.stats(r, r.v.p), est = IL / (2 * F * C);
  near('bridge: ripple = I x t_fall / C, t_fall read off the waveform', s.pp, IL * fallTime(r, r.v.p) / C, 0.03);
  is('under I/(2fC) = 0.2273 V', s.pp < est && s.pp > 0.6 * est, s.pp.toFixed(3) + ' V');
  near('bridge: two troughs a cycle, so ripple at 100 Hz', minimaPerCycle(r, r.v.p) * F, 100, 0.01);
  near('bridge: output peak = Vpk - 2 diode drops - I Rw', s.max, vpk - 2 * 0.85 - 0.3 * 3, 0.03);
  const piv = maxOf(T.across(r, 'p', 'a'));
  near('bridge: PIV per diode about Vpk = 16.97 V', piv, vpk, 0.12);
  // at the negative peak D3 conducts, so D1 has the output plus one diode drop across it
  const out = T.at(r, r.v.p, 0.75 * P), a = T.at(r, r.v.a, 0.75 * P);
  near('and exactly the output plus the drop in D3 at the negative peak', piv, out - a, 0.002);
  is('one diode drop: between 0.6 and 1.1 V', -a > 0.6 && -a < 1.1, (-a).toFixed(2) + ' V');
  // Kirchhoff at the output node at every recorded moment
  let worst = 0;
  for (let k = 0; k < r.t.length; k++) {
    worst = Math.max(worst, Math.abs(r.i.D1[k] + r.i.D2[k] - r.i.C1[k] - r.i.IL[k]));
  }
  near('current law at the output node, every sample', worst, 0, 1e-6, true);
  // one pair or the other conducts, never both
  let both = 0;
  for (let k = 0; k < r.t.length; k++) if (r.i.D1[k] > 1e-3 && r.i.D2[k] > 1e-3) both++;
  is('D1 and D2 never conduct together', both === 0);
}
{
  const ct = 'VA s1 0 0\nVB s2 0 0\nRA s1 a 0.3\nRB s2 b 0.3\nD1 a p\nD2 b p\nC1 p 0 22m\nIL p 0 ' + IL;
  const r = T.settle(T.parse(ct), { period: P, sources: { VA: sine(vpk), VB: sine(vpk, F, -1) }, keep: 2 });
  near('centre tap: PIV about 2 x Vpk of each half', maxOf(T.across(r, 'p', 'a')), 2 * vpk, 0.08);
  near('centre tap: ripple at 100 Hz', minimaPerCycle(r, r.v.p) * F, 100, 0.01);
}

/* ---- 6. switch-on surge into an empty reservoir ---- */
console.log('\nswitch-on, 12 V RMS bridge into an empty 10 mF reservoir and 15 Ohm');
{
  const c = T.parse('VS x y 0\nRW x a 0.3\nD1 a p\nD2 y p\nD3 0 a\nD4 0 y\nC1 p 0 10m\nRL p 0 15');
  const r = T.run(c, { dt: P / 400, tStop: 10 * P, sources: { VS: sine(vpk) } });
  const firstHalf = Array.from(r.i.D1).filter((v, k) => r.t[k] < P / 2);
  const lastCycle = Array.from(r.i.D1).filter((v, k) => r.t[k] > 9 * P);
  is('the first pulse is far taller than the steady ones',
     maxOf(firstHalf) > 3 * maxOf(lastCycle), maxOf(firstHalf).toFixed(1) + ' A against ' + maxOf(lastCycle).toFixed(1) + ' A');
  // the first pulse charges C from nothing through 0.3 Ohm and two diodes:
  // no more than Vpk / Rw can flow
  is('and no more than Vpk / Rw = 57 A', maxOf(firstHalf) < vpk / 0.3);
}

/* ---- 7. Zener and pass transistor ---- */
console.log('\nZener 6.8 V (10 mA at 6.8 V, 5 Ohm slope there)');
{
  const c = T.parse('V1 s 0 20\nR1 s k 1k\nZ1 0 k 6.8');
  const r = T.run(c, { dt: 1e-6, tStop: 3e-6 });
  const i = -last(r.i.Z1), v = last(r.v.k);
  near('held near 6.8 V from 20 V', v, 6.8, 0.01);
  near('voltage as the model says: 6.8 + nz Vt ln(I / 10 mA)', v, 6.8 + T.ZENER.nz * VT * Math.log(i / 0.01), 1e-4);
  near('current = (20 - Vz) / 1 kOhm', i, (20 - v) / 1000, 1e-3);
  const r2 = T.run(T.parse('V1 s 0 30\nR1 s k 1k\nZ1 0 k 6.8'), { dt: 1e-6, tStop: 3e-6 });
  near('from 30 V it rises only a little (under 0.1 V)', last(r2.v.k) - v, 0.05, 0.05, true);
  const r3 = T.run(T.parse('V1 s 0 5\nR1 s k 1k\nZ1 0 k 6.8'), { dt: 1e-6, tStop: 3e-6 });
  near('below its voltage it passes almost nothing: 5 V across', last(r3.v.k), 5, 0.01);
}
console.log('\nZener and series pass transistor, 20 V in, 15 V Zener, 15 Ohm load');
{
  const c = T.parse('V1 in 0 20\nR1 in b 100\nZ1 0 b 15\nQ1 in b out is=1p bf=100\nRL out 0 15');
  const r = T.run(c, { dt: 1e-6, tStop: 3e-6 });
  const vb = last(r.v.b), vo = last(r.v.out), ic = last(r.i.Q1);
  near('output about Vz - 0.7 = 14.3 V', vo, 14.3, 0.1, true);
  near('exactly Vb - Vbe, Vbe = Vt ln(Ic / Is)', vo, vb - VT * Math.log(ic / 1e-12 + 1), 1e-3, true);
  near('the transistor carries the load current: Ic + Ib = Vout / RL', last(r.i['Q1.e']), vo / 15, 1e-6);
  near('base current = Ic / beta', last(r.i['Q1.b']), ic / 100, 0.01);
  const r2 = T.run(T.parse('V1 in 0 25\nR1 in b 100\nZ1 0 b 15\nQ1 in b out is=1p bf=100\nRL out 0 15'),
                   { dt: 1e-6, tStop: 3e-6 });
  near('5 V more in moves the output under 0.05 V', last(r2.v.out) - vo, 0, 0.05, true);
}
console.log('\nerror amplifier: (Vz + Vbe2)(R1 + R2) / R2');
{
  const net = vin => `V1 in 0 ${vin}\nR3 in b 150\nQ1 in b out is=1p bf=100\nQ2 b m z is=1e-14 bf=300\n` +
                     'R4 in z 1k\nZ1 0 z 6.8\nR1 out m 1k\nR2 m 0 1k\nRL out 0 15';
  const r = T.run(T.parse(net(20)), { dt: 1e-6, tStop: 3e-6 });
  const vbe2 = last(r.v.m) - last(r.v.z);
  near('two 1 kOhm and a 6.8 V Zener: about (6.8 + 0.7) x 2 = 15 V', last(r.v.out), 15, 0.02);
  near('exactly (Vz + Vbe2) x (R1 + R2) / R2, plus the base current through R1', last(r.v.out),
       (last(r.v.z) + vbe2) * 2 + last(r.i['Q2.b']) * 1e3, 1e-3);
  const r2 = T.run(T.parse(net(24)), { dt: 1e-6, tStop: 3e-6 });
  near('4 V more in moves the output under 0.25 V', last(r2.v.out) - last(r.v.out), 0, 0.25, true);
}

/* ---- 8. dropout: the regulator cannot make what its input does not have ---- */
console.log('\ndropout');
{
  const c = T.parse('V1 in 0 14\nR1 in b 100\nZ1 0 b 15\nQ1 in b out is=1p bf=100\nRL out 0 15');
  const r = T.run(c, { dt: 1e-6, tStop: 3e-6 });
  is('14 V in, 15 V Zener: the output falls below 14.3 V', last(r.v.out) < 13.5, last(r.v.out).toFixed(2) + ' V');
}

/* ---- 9. step size, conditioning and true steady state ---- */
console.log('\nstep size, conditioning, and settle() reaching the true steady state');
{
  // the page steps 400 times a cycle by backward Euler; ten times finer by
  // the trapezoidal rule is the reference
  const net = 'VS x y 0\nRW x a 0.3\nD1 a p\nD2 y p\nD3 0 a\nD4 0 y\nC1 p 0 4.7m\nRL p 0 15';
  const go = (method, n) => T.stats(...(r => [r, r.v.p])(T.settle(T.parse(net),
    { period: P, stepsPerCycle: n, sources: { VS: sine(vpk) }, method, cycles: 200, tol: 1e-6 })));
  const coarse = go('be', 400), fine = go('trap', 4000);
  near('bridge, 4.7 mF, 15 Ohm: ripple at 400 steps a cycle within 1% of trap at 4000', coarse.pp, fine.pp, 0.01);
  near('and the peak within 0.1%', coarse.max, fine.max, 0.001);
}
{
  // a big reservoir and a fine step put C / h at thousands of siemens beside
  // a winding that only GMIN holds while all four diodes are off: rounding
  // once stopped Newton converging there
  const net = 'VS x y 0\nRW x a 0.3\nD1 a p\nD2 y p\nD3 0 a\nD4 0 y\nC1 p 0 22m\nRL p 0 2.2';
  let ok = true, pp = [];
  for (const [method, n] of [['be', 400], ['be', 4000], ['trap', 4000]]) {
    try {
      const r = T.settle(T.parse(net), { period: P, stepsPerCycle: n, sources: { VS: sine(vpk) }, method, cycles: 200, tol: 1e-5 });
      pp.push(T.stats(r, r.v.p).pp);
    } catch (e) { ok = false; }
  }
  is('22 mF, 2.2 Ohm: converges at 4000 steps a cycle, both methods', ok);
  if (ok) near('and the ripple agrees with 400 steps within 1%', pp[0], pp[2], 0.01);
}
{
  // 22 mF on 1 kOhm closes in on its steady charge by under 1% a cycle; the
  // reference runs without extrapolation until the change is 0.1 microvolt
  const net = 'VS x y 0\nRW x a 0.3\nD1 a p\nD2 y p\nD3 0 a\nD4 0 y\nC1 p 0 22m\nRL p 0 1k';
  const o = { period: P, sources: { VS: sine(3 * Math.SQRT2) }, tol: 2e-4, cycles: 80 };
  const quick = T.settle(T.parse(net), o);
  const slow = T.settle(T.parse(net), Object.assign({}, o, { extrapolate: false, tol: 1e-7, cycles: 3000 }));
  is('3 V RMS bridge, 22 mF, 1 kOhm, from empty: settles within 80 cycles', quick.settled, quick.cyclesRun + ' cycles');
  near('to the same mean as running on for ' + slow.cyclesRun + ' cycles (within 2 mV)',
       T.stats(quick, quick.v.p).mean, T.stats(slow, slow.v.p).mean, 2e-3, true);
  // the switch mode output stage: 22 mF topped up at 100 kHz, 5 A
  const sq = t => { const ph = (t * 1e5) % 1, e = 0.01;
    const pulse = (x, a, z) => x < a || x > z ? 0 : Math.min(1, (x - a) / e, (z - x) / e);
    return 15.5 * (pulse(ph, 0, 0.25) - pulse(ph, 0.5, 0.75)); };
  const sw = 'VS x y 0\nRW x a 0.05\nD1 a p\nD2 y p\nD3 0 a\nD4 0 y\nC1 p 0 22m ic=13.55\nRL p 0 2.76';
  const os = { period: 1e-5, stepsPerCycle: 200, sources: { VS: sq }, tol: 2e-4, cycles: 80 };
  const qs = T.settle(T.parse(sw), os);
  const ss = T.settle(T.parse(sw), Object.assign({}, os, { extrapolate: false, tol: 1e-8, cycles: 8000 }));
  is('22 mF at 100 kHz, 5 A: settles within 80 cycles', qs.settled, qs.cyclesRun + ' cycles');
  near('to the mean of ' + ss.cyclesRun + ' cycles run out (within 2 mV)', T.stats(qs, qs.v.p).mean, T.stats(ss, ss.v.p).mean, 2e-3, true);
  near('and its ripple, about I t / C = 0.55 mV, within 5%', T.stats(qs, qs.v.p).pp, T.stats(ss, ss.v.p).pp, 0.05);
}
{
  // the figures the 2J page quotes: 20 V RMS half wave with a reservoir
  const r = T.settle(T.parse('VS s 0 0\nRW s a 0.3\nD1 a p\nC1 p 0 4.7m\nRL p 0 1k'),
                     { period: P, sources: { VS: sine(20 * Math.SQRT2) }, cycles: 80, tol: 2e-4 });
  const piv = maxOf(T.across(r, 'p', 'a'));
  is('20 V RMS, half wave, 4.7 mF, 1 kOhm: PIV between 54.5 and 56.6 V, the rule less a drop or so',
     piv > 54.5 && piv < 2 * 20 * Math.SQRT2, piv.toFixed(2) + ' V');
  const rb = T.settle(T.parse('VS x y 0\nRW x a 0.3\nD1 a p\nD2 y p\nD3 0 a\nD4 0 y\nC1 p 0 4.7m\nRL p 0 1k'),
                      { period: P, sources: { VS: sine(20 * Math.SQRT2) }, cycles: 80, tol: 2e-4 });
  const pivB = maxOf(T.across(rb, 'p', 'a'));
  is('the same as a bridge: PIV about the peak less one drop (0.5 to 1.1 V under 28.3 V)',
     20 * Math.SQRT2 - pivB > 0.5 && 20 * Math.SQRT2 - pivB < 1.1, pivB.toFixed(2) + ' V');
}

{
  // the 2J stabilisers on a 16 V bridge and 4.7 mF, 1 A: the error amplifier
  // with its supply smoothed lets through less ripple than the Zener alone
  const front = ['VS x y 0', 'RW x a 0.3', 'D1 a in', 'D2 y in', 'D3 0 a', 'D4 0 y', 'C1 in 0 4.7m ic=20.9'];
  const go = parts => { const r = T.settle(T.parse(front.concat(parts).join('\n')),
    { period: P, sources: { VS: sine(16 * Math.SQRT2) }, cycles: 120, tol: 2e-4 }); return T.stats(r, r.v.out); };
  const z = go(['RZ in b 100', 'Z1 0 b 15', 'Q1 in b out is=1p bf=100', 'RL out 0 14.3']);
  const fb = go(['R5 in f 15', 'C3 f 0 2200u ic=20.1', 'R3 f b 47', 'Q1 in b out is=1p bf=100', 'Q2 b m z is=7e-14 bf=300',
                 'Z1 0 z 6.8 izt=40m', 'R1 out m 330', 'R2 m 0 330', 'RL out 0 15']);
  near('error amplifier: output within 0.1 V of (6.8 + 0.7) x 2 = 15 V', fb.mean, 15, 0.1, true);
  is('and under a third of the Zener circuit\'s output ripple', fb.pp < z.pp / 3,
     (fb.pp * 1e3).toFixed(1) + ' mV against ' + (z.pp * 1e3).toFixed(1) + ' mV');
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
