/*
 * test-dsp.js - check the DSP engine against results known in closed form.
 * Run: node test-dsp.js
 */
const D = require('./dsp.js');

let pass = 0, fail = 0;
function near(label, got, want, tol) {
  tol = tol === undefined ? 1e-6 : tol;
  const ok = Math.abs(got - want) <= tol * Math.max(1, Math.abs(want));
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(52)} got ${Number(got).toPrecision(8)}  want ${Number(want).toPrecision(8)}`);
}
function atMost(label, got, limit) {
  const ok = got <= limit * (1 + 1e-12);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(52)} got ${Number(got).toPrecision(8)}  limit ${Number(limit).toPrecision(8)}`);
}
function is(label, got, want) {
  const ok = got === want;
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(52)} got ${got}  want ${want}`);
}

/* ---- 1. the transform itself ---- */
console.log('\nFFT');
{
  // a tone sitting exactly on bin 8 must appear there and nowhere else
  const n = 256, k = 8;
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = Math.cos(2 * Math.PI * k * i / n);
  D.fft(re, im);
  let peak = 0, peakBin = -1, leak = 0;
  for (let b = 0; b < n / 2; b++) {
    const m = Math.hypot(re[b], im[b]);
    if (m > peak) { peak = m; peakBin = b; }
    if (b !== k) leak = Math.max(leak, m);
  }
  is('tone on bin 8 peaks at bin 8', peakBin, k);
  near('peak magnitude is n/2', peak, n / 2, 1e-9);
  near('everything else is zero', leak, 0, 1e-9);

  // Parseval: energy is conserved by the transform
  const sig = new Float64Array(n), sim = new Float64Array(n);
  for (let i = 0; i < n; i++) sig[i] = Math.sin(i) + 0.3 * Math.cos(3.1 * i);
  let timeE = 0;
  for (let i = 0; i < n; i++) timeE += sig[i] * sig[i];
  D.fft(sig, sim);
  let freqE = 0;
  for (let i = 0; i < n; i++) freqE += sig[i] * sig[i] + sim[i] * sim[i];
  near('Parseval, energy conserved', freqE / n, timeE, 1e-9);
}

/* ---- 2. aliasing, the point of the whole bench ---- */
console.log('\naliasing');
{
  const fs = 8000;
  near('a tone below Nyquist is itself', D.aliasOf(3000, fs), 3000);
  near('exactly at Nyquist', D.aliasOf(4000, fs), 4000);
  near('5 kHz sampled at 8 k comes back at 3 k', D.aliasOf(5000, fs), 3000);
  near('7 kHz comes back at 1 k', D.aliasOf(7000, fs), 1000);
  near('8 kHz comes back at DC', D.aliasOf(8000, fs), 0, 1e-9);
  near('9 kHz comes back at 1 k', D.aliasOf(9000, fs), 1000);
  is('3 kHz is not aliased', D.isAliased(3000, fs), false);
  is('5 kHz is aliased', D.isAliased(5000, fs), true);

  // and prove it by actually sampling and transforming, rather than trusting
  // the formula that predicts it
  const n = 4096;
  const s = D.sampleSine(5000, fs, n);
  const sp = D.spectrum(s, fs);
  let best = 0, bestF = 0;
  for (let i = 1; i < sp.bins; i++) if (sp.db[i] > sp.db[best]) { best = i; }
  bestF = sp.freq[best];
  near('sampled 5 kHz tone measures 3 kHz', bestF, 3000, 2e-3);
}

/* ---- 3. quantisation ---- */
console.log('\nquantisation');
{
  near('8 bit step over full scale', D.quantStep(8), 2 / 256, 1e-12);
  near('ideal SNR of 8 bits', D.idealSNR(8), 49.92, 1e-3);
  near('one more bit is worth 6.02 dB',
       D.idealSNR(9) - D.idealSNR(8), 6.02, 1e-9);

  // the error left after quantising must never exceed half a step
  const x = D.sampleSine(1000, 48000, 2048);
  for (const bits of [4, 8, 12]) {
    const q = D.quantise(x, bits);
    let worst = 0;
    for (let i = 0; i < x.length; i++) worst = Math.max(worst, Math.abs(x[i] - q[i]));
    // half a step is the bound, not the expected value: it is only reached if
    // a sample lands exactly on a decision point, which a sine rarely does
    atMost(`${bits} bit error stays within half a step`, worst, D.quantStep(bits) / 2);
  }

  // coarser quantising must raise the noise floor, and by about the right amount
  const f = 48000 * 0.07713, fs = 48000, n = 8192;
  const measure = bits => {
    const q = D.quantise(D.sampleSine(f, fs, n), bits);
    const sp = D.spectrum(q, fs);
    let sig = -200, noise = 0, count = 0;
    for (let i = 2; i < sp.bins; i++) {
      if (Math.abs(sp.freq[i] - f) < 120) sig = Math.max(sig, sp.db[i]);
      else { noise += Math.pow(10, sp.db[i] / 10); count++; }
    }
    return sig - 10 * Math.log10(noise / count);
  };
  const snr8 = measure(8), snr12 = measure(12);
  // four extra bits should buy about 4 x 6.02 dB
  near('four more bits buys about 24 dB', snr12 - snr8, 24, 0.25);
  console.log(`       (per bin: 8 bit ${snr8.toFixed(1)} dB, 12 bit ${snr12.toFixed(1)} dB; ` +
              `a per bin figure sits above total SNR by the transform's processing gain)`);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
