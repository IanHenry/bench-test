/*
 * dsp.js - sampling, quantisation and the Fourier transform.
 *
 * The second engine. Where mna.js answers "what does this circuit do at this
 * frequency", this one answers "what does this signal look like once it has
 * been sampled, and what is in it". Between them they cover most of the
 * technical syllabus: 2F digital signals, 2I amplifier classes, and the whole
 * of section 3 from modulation through mixing to demodulation.
 *
 * Nothing here is approximate for the sake of the display. The alias really
 * is computed by sampling the signal and transforming the result, so what
 * appears on the screen is what an ADC would actually produce.
 */

/* ---------- Fourier transform ---------- */

/**
 * In place radix-2 FFT. re and im are Float64Array of the same length, which
 * must be a power of two. Decimation in time, with the usual bit reversal
 * first so the butterflies can run in order.
 */
function fft(re, im) {
  const n = re.length;
  if (n <= 1) return;
  if (n & (n - 1)) throw new Error('fft length must be a power of two, got ' + n);

  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k], ai = im[i + k];
        const br = re[i + k + len / 2], bi = im[i + k + len / 2];
        const tr = br * cr - bi * ci, ti = br * ci + bi * cr;
        re[i + k] = ar + tr; im[i + k] = ai + ti;
        re[i + k + len / 2] = ar - tr; im[i + k + len / 2] = ai - ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

/** Hann window, which keeps a single tone from smearing across the display. */
function hann(n) {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1));
  return w;
}

/**
 * Magnitude spectrum of a real signal, in dB relative to full scale.
 * Returns { freq: Float64Array, db: Float64Array } over 0 .. fs/2.
 */
function spectrum(samples, fs, opts) {
  opts = opts || {};
  let n = 1;
  while (n * 2 <= samples.length) n *= 2;          // largest power of two that fits
  const re = new Float64Array(n), im = new Float64Array(n);
  const w = opts.window === false ? null : hann(n);
  let coherentGain = 0;
  for (let i = 0; i < n; i++) {
    const g = w ? w[i] : 1;
    re[i] = samples[i] * g;
    coherentGain += g;
  }
  coherentGain /= n;
  fft(re, im);

  const half = n / 2;
  const freq = new Float64Array(half), db = new Float64Array(half);
  const floor = opts.floor === undefined ? -120 : opts.floor;
  for (let k = 0; k < half; k++) {
    // single sided, scaled so a full scale sine reads 0 dB
    const mag = 2 * Math.hypot(re[k], im[k]) / (n * coherentGain);
    freq[k] = k * fs / n;
    db[k] = Math.max(floor, 20 * Math.log10(Math.max(1e-12, mag)));
  }
  return { freq, db, bins: half, binWidth: fs / n };
}

/* ---------- sampling ---------- */

/**
 * Where a tone actually appears once sampled at fs.
 *
 * Fold f into 0 .. fs/2. Below the Nyquist frequency the answer is f itself.
 * Above it, the tone comes back somewhere else entirely, and that somewhere
 * is what the syllabus calls a false image.
 */
function aliasOf(f, fs) {
  const folded = Math.abs(((f % fs) + fs) % fs);
  return folded > fs / 2 ? fs - folded : folded;
}

/** True when a tone will be reported at the wrong frequency. */
const isAliased = (f, fs) => f > fs / 2;

/** n samples of a sine at f, sampled at fs. */
function sampleSine(f, fs, n, phase) {
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.sin(2 * Math.PI * f * i / fs + (phase || 0));
  return out;
}

/**
 * Round to the nearest of 2^bits levels over -1 .. +1.
 * The residue is the quantisation error the syllabus asks about, and it sets
 * the noise floor you can see on the spectrum.
 */
function quantise(x, bits) {
  const levels = Math.pow(2, bits);
  const step = 2 / levels;
  const out = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) {
    out[i] = Math.max(-1, Math.min(1, Math.round(x[i] / step) * step));
  }
  return out;
}

/** Size of one quantisation step over a full scale of -1 .. +1. */
const quantStep = bits => 2 / Math.pow(2, bits);

/**
 * Best case signal to noise for an ideal converter, 6.02n + 1.76 dB.
 * Worth showing because it says plainly what another bit buys you.
 */
const idealSNR = bits => 6.02 * bits + 1.76;

const API = { fft, hann, spectrum, aliasOf, isAliased, sampleSine,
              quantise, quantStep, idealSNR };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.DSP = API;
