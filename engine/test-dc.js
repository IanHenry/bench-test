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

/* ---- 5. a divider biased stage in each of its states ---- */
console.log('\ndivider bias');
{
  // the default stage: active, and the textbook figures
  const a = D.dividerBias(12, 47e3, 7.5e3, 4700, 1000, 200);
  is('the default stage is active', a.state, 'active');
  near('base current through the Thevenin divider', a.ib, 5.0698e-6, 1e-3);
  near('collector current is beta times it', a.ic, 200 * a.ib, 1e-12);
  near('collector to emitter voltage', a.vce, 12 - a.ic * 4700 - a.ie * 1000, 1e-12);

  // the setting that once showed 6.65 mA and a collector at -20.7 V
  const s = D.dividerBias(12, 78e3, 22e3, 4700, 220, 200);
  is('too much base drive saturates it', s.state, 'saturated');
  near('the collector sits at saturation above the emitter', s.vce, 0.2, 1e-12);
  const cap = s.ic <= (12 - 0.2) / (4700 + 220) + 1e-12;
  cap ? pass++ : fail++;
  console.log(`  ${cap ? 'ok  ' : 'FAIL'} ${'and never passes more than the resistors allow'.padEnd(50)} got ${(s.ic * 1e3).toFixed(3)} mA`);
  const forced = s.ic < 200 * s.ib;
  forced ? pass++ : fail++;
  console.log(`  ${forced ? 'ok  ' : 'FAIL'} ${'saturated, it passes less than beta times'.padEnd(50)} got ${(s.ic / s.ib).toFixed(1)}`);
  // Kirchhoff round the collector loop and at the emitter
  near('supply = drop on RC + VCE + drop on RE', s.ic * 4700 + s.vce + s.ie * 220, 12, 1e-9);
  near('base current = what the divider delivers',
       s.ib, (s.vth - 0.6 - s.ve) / s.rth, 1e-9);

  // no stage anywhere on the controls can push the collector negative
  let worst = Infinity;
  for (const r1 of [10e3, 47e3, 470e3]) for (const r2 of [1e3, 22e3, 100e3])
    for (const rc of [220, 4700, 22e3]) for (const re of [10, 1000, 4700])
      for (const vcc of [5, 12, 24]) {
        worst = Math.min(worst, D.dividerBias(vcc, r1, r2, rc, re, 400).vce);
      }
  near('collector voltage never below saturation', worst, 0.2, 1e-9);

  // the base right at the point of conduction is the class B bias point
  const b = D.dividerBias(12, 190e3, 10e3, 2200, 1000, 200);
  is('a base at 0.6 V is just cut off', b.state, 'cut off');
  near('with no headroom at all', b.vb - 0.6, 0, 1e-12);
}

/* ---- 6. field effect transistors ---- */
console.log('\nFETs');
{
  near('no current at pinch off', D.jfetCurrent(-3, 10, 8e-3, -3), 0, 1e-12);
  near('IDSS with the gate at the source', D.jfetCurrent(0, 10, 8e-3, -3), 8e-3, 1e-12);
  near('square law in between', D.jfetCurrent(-1.5, 10, 8e-3, -3), 2e-3, 1e-12);
  near('the ohmic and pinched off regions meet at the knee',
       D.jfetCurrent(-1, 2 - 1e-9, 8e-3, -3), D.jfetCurrent(-1, 2, 8e-3, -3), 1e-6);

  // the exam's circuit, with figures that give its 4.5 V source and 14 V drain
  const f = D.fetDividerBias(18, 101.75e3, 22e3, 1556, 1751, 8e-3, -3);
  near('gate from the divider, untouched by any gate current', f.vg, 3.2, 1e-3);
  near('the source settles at 4.5 V', f.vs, 4.5, 2e-3);
  near('so the gate is 1.3 V below it', f.vgs, -1.3, 5e-3);
  near('drain at 14 V', f.vd, 14, 2e-3);
  is('and the device is amplifying', f.region, 'pinched off');
  // lower the gate and the drain current falls (question 3582)
  const lower = D.fetDividerBias(18, 150e3, 22e3, 1556, 1751, 8e-3, -3);
  const falls = lower.id < f.id;
  falls ? pass++ : fail++;
  console.log(`  ${falls ? 'ok  ' : 'FAIL'} ${'a lower gate passes less drain current'.padEnd(50)} got ${(lower.id * 1e3).toFixed(3)} mA`);

  // dual gate: with gate 2 well up, gate 1 alone sets the current, which is
  // the single device self biased through its source resistor
  const single = D.fetDividerBias(12, 1e9, 1e-9, 1000, 1000, 10e-3, -2);
  const high = D.dualGateBias({ vcc: 12, vg1: 0, vg2: 4, rd: 1000, rs: 1000, idss: 10e-3, vp: -2 });
  near('gate 2 high: the single device current', high.id, single.id, 1e-3);
  is('and the upper half is out of the way', high.throttled, false);
  const low = D.dualGateBias({ vcc: 12, vg1: 0, vg2: 0, rd: 1000, rs: 1000, idss: 10e-3, vp: -2 });
  const throttles = low.id < high.id * 0.9 && low.throttled;
  throttles ? pass++ : fail++;
  console.log(`  ${throttles ? 'ok  ' : 'FAIL'} ${'gate 2 low throttles the current'.padEnd(50)} got ${(low.id * 1e3).toFixed(3)} mA`);
  const off = D.dualGateBias({ vcc: 12, vg1: 0, vg2: -3, rd: 1000, rs: 1000, idss: 10e-3, vp: -2 });
  near('gate 2 far enough down turns it off', off.id, 0, 1e-6);
}

/* ---- 7. what survives clipping ---- */
console.log('\nclipping');
{
  near('a small signal is untouched', D.fundamentalGain(0.1, 1, 1), 1, 1e-6);
  near('clipped at the operating point on one side keeps half',
       D.fundamentalGain(1, 0, 10), 0.5, 1e-4);
  // hard clipping both sides tends to a square wave, 4/pi times the limit
  near('hard symmetrical clipping', D.fundamentalGain(1000, 1, 1), 4 / Math.PI / 1000, 2e-3);
  let prev = 2, falling = true;
  for (const d of [0.1, 0.5, 1, 2, 4, 8]) {
    const g = D.fundamentalGain(d, 1, 3);
    if (g > prev + 1e-12) falling = false;
    prev = g;
  }
  is('more drive never gives more gain', falling, true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
