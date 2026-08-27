/*
 * test-dc.js - operating points and amplifier classes against known results.
 * Run: node test-dc.js
 */
const D = require('./dc.js');

let pass = 0, fail = 0;
function near(label, got, want, tol) {
  tol = tol === undefined ? 1e-6 : tol;
  const ok = Math.abs(got - want) <= tol * Math.max(1, Math.abs(want));
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(50)} got ${Number(got).toPrecision(7)}  want ${Number(want).toPrecision(7)}`);
}
function is(label, got, want) {
  const ok = got === want;
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(50)} got ${got}  want ${want}`);
}

/* ---- 1. the diode ---- */
console.log('\ndiode');
{
  near('no current with nothing applied', D.diodeCurrent(0), 0, 1e-12);
  const v = D.diodeVoltage(1e-3);
  const ok = v > 0.4 && v < 0.9;
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${'1 mA needs a sensible forward voltage'.padEnd(50)} got ${v.toFixed(3)} V`);
  near('round trip through the curve', D.diodeCurrent(D.diodeVoltage(5e-3)), 5e-3, 1e-3);
  const r = D.diodeCurrent(-3, { zener: 5.1 });
  near('below its rated voltage a Zener holds off', r, 0, 1e-9);
}

/* ---- 2. load line and operating point ---- */
console.log('\nload line');
{
  const ll = D.loadLine(12, 1200);
  near('one end is the supply', ll.vMax, 12);
  near('the other is supply over load', ll.iMax, 0.01);
  near('halfway along', ll.at(6), 0.005);

  // the classic exam question: pick the collector current that puts the
  // collector midway between the supply and zero
  const q = D.operatingPoint(12, 1200, 5e-6 / 1, 1000);
  near('5 uA of base at a gain of 1000 gives 5 mA', q.ic, 0.005, 1e-9);
  near('which lands the collector at half the supply', q.vce, 6, 1e-9);
  is('and it is not saturated', q.saturated, false);

  const hard = D.operatingPoint(12, 1200, 50e-6, 1000);
  is('far too much base current saturates it', hard.saturated, true);
  near('and the collector cannot fall below saturation', hard.vce, 0.2, 1e-9);
}

/* ---- 3. amplifier classes, the part that matters ---- */
console.log('\nconduction angle and class');
{
  near('biased mid range, it conducts the whole cycle',
       D.conductionAngle(0.5, 0.4) * 180 / Math.PI, 360, 1e-9);
  near('biased at cut off, it conducts half',
       D.conductionAngle(0.0, 0.4) * 180 / Math.PI, 180, 1e-6);
  is('and those are the classes', D.classOf(D.conductionAngle(0.5, 0.4)), 'A');
  is('class B at the cut off point', D.classOf(D.conductionAngle(0.0, 0.4)), 'B');
  is('below cut off is class C', D.classOf(D.conductionAngle(-0.2, 0.4)), 'C');
  is('part way up is class AB', D.classOf(D.conductionAngle(0.25, 0.4)), 'AB');

  // efficiency is derived from the Fourier coefficients, not looked up, so
  // these are the textbook figures arrived at independently
  const a = D.classPerformance(2 * Math.PI);
  near('class A tops out at 50%', a.efficiency * 100, 50, 2e-3);
  const b = D.classPerformance(Math.PI);
  near('class B tops out at 78.5%', b.efficiency * 100, 78.54, 1e-3);
  const c = D.classPerformance(Math.PI / 2);
  const cOk = c.efficiency > 0.9 && c.efficiency < 1;
  cOk ? pass++ : fail++;
  console.log(`  ${cOk ? 'ok  ' : 'FAIL'} ${'class C beats both'.padEnd(50)} got ${(c.efficiency * 100).toFixed(1)}%`);

  // efficiency must rise as the conduction angle falls
  let prev = 0, monotonic = true;
  for (let deg = 360; deg >= 40; deg -= 20) {
    const e = D.classPerformance(deg * Math.PI / 180).efficiency;
    if (e < prev - 1e-9) monotonic = false;
    prev = e;
  }
  is('narrower conduction is always more efficient', monotonic, true);
}

/* ---- 4. the waveform the device passes ---- */
console.log('\ncollector waveform');
{
  // the angle and the waveform are two descriptions of the same thing and
  // must agree, which is how the error in the angle formula showed up
  for (const [bias, drive] of [[0.5, 0.4], [0.25, 0.4], [0, 0.4], [-0.25, 0.4]]) {
    const w = D.collectorWave(bias, drive, 3600);
    let on = 0;
    for (const v of w) if (v > 1e-12) on++;
    near(`waveform agrees with the angle at bias ${bias}`,
         360 * on / 3600, D.conductionAngle(bias, drive) * 180 / Math.PI, 3e-3);
  }

  const full = D.collectorWave(0.5, 0.4, 720);
  let zeros = 0;
  for (const v of full) if (v <= 0) zeros++;
  is('class A never cuts off', zeros, 0);

  const halfWave = D.collectorWave(0.0, 0.4, 720);
  let off = 0;
  for (const v of halfWave) if (v <= 1e-12) off++;
  near('class B is off for half the cycle', off / 720, 0.5, 0.02);

  const classC = D.collectorWave(-0.25, 0.4, 720);
  let onC = 0;
  for (const v of classC) if (v > 1e-12) onC++;
  const lessThanHalf = onC / 720 < 0.5;
  lessThanHalf ? pass++ : fail++;
  console.log(`  ${lessThanHalf ? 'ok  ' : 'FAIL'} ${'class C is on for less than half'.padEnd(50)} got ${(100 * onC / 720).toFixed(1)}%`);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
