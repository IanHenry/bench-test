/*
 * content/2F.js - Digital signals.
 *
 * The first bench to reach Foundation. It draws no circuit: what matters here
 * is the signal, so the stage is given over to the waveform and its spectrum.
 *
 * Everything shown is computed by actually sampling and transforming, not by
 * drawing the expected shape. The alias on the Full panel is measured off the
 * spectrum of the sampled signal, so it is what a converter would really do.
 */

const DSP = window.DSP;
const F = window.Fmt;

/** One block of samples of the tone, unrounded: the Full panel is about rate, not depth. */
function capture(v, n) {
  const fs = v.fs, f = v.fsig;
  const N = n || 2048;
  return { raw: DSP.sampleSine(f, fs, N), fs: fs, f: f, N: N };
}


/*
 * Colours. Every signal on this page is a voltage, so every trace is the
 * course's voltage blue. Where two voltages share a plot, the copy the
 * converter holds is a paler, wider band of the same blue behind the real
 * signal, not a new hue. Samples, the Nyquist line and the marks are neutral.
 * The digital stages of the chain hold numbers, not a quantity, so they are
 * drawn in ink.
 */

/** A see-through version of a #rrggbb colour; anything else is returned as is. */
function tint(colour, alpha) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(colour).trim());
  if (!m) return colour;
  return 'rgba(' + parseInt(m[1], 16) + ',' + parseInt(m[2], 16) + ',' +
    parseInt(m[3], 16) + ',' + alpha + ')';
}

/** True when the panels are dark, read from the six digit --surface. */
function isDark(t) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(t.surface).trim());
  return !!m && (parseInt(m[1], 16) + parseInt(m[2], 16) + parseInt(m[3], 16)) < 3 * 128;
}

/** Legend keys the plain bar cannot show: a dot, a dashed line, a wide band. */
const key = {
  dot: (c, label) => '<span><i style="width:8px;height:8px;border-radius:50%;background:' + c +
    '"></i><span class="sw-l">' + label + '</span></span>',
  dashed: (c, label) => '<span><i style="height:2px;border-radius:0;background:repeating-linear-gradient(90deg,' +
    c + ' 0 3px,transparent 3px 6px)"></i><span class="sw-l">' + label + '</span></span>',
  band: (c, label) => '<span><i style="height:6px;background:' + c +
    '"></i><span class="sw-l">' + label + '</span></span>'
};

/** Wrap a caption to the width of its block. */
function wrapText(c, text, cx, y, maxW, lh) {
  const words = String(text).split(' ');
  let line = '', ly = y;
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (c.measureText(test).width > maxW && line) {
      c.fillText(line, cx, ly); ly += lh; line = w;
    } else line = test;
  }
  if (line) c.fillText(line, cx, ly);
}

const BENCH = {
  group: '2F',
  title: 'Digital signals',
  pageTitle: 'Sampling Bench',
  levels: ['foundation', 'intermediate', 'full'],
  // the course sessions that send learners here, named in the colophon
  sessions: {
    foundation: ['Foundation session 4 (Waves, frequency and modulation)'],
    intermediate: ['Intermediate session 4 (AC, reactance and phase)'],
    full: ['Full session 10 (Sampling, Fourier, SDR and transceivers)']
  },
  // there is no circuit on this page, so the generic words would be untrue
  standfirst: 'Move a control and watch what happens. Every waveform and spectrum is calculated live from samples of the signal, so nothing here is a drawing of an answer.',
  colophonNote: 'Every waveform and spectrum is calculated from samples of the signal, and every spectrum by a Fourier transform written for this bench.',
  bank: {
    url: 'https://rsgb.services/public/exams/eqdb/',
    topic: '2F - Digital signals',
    note: 'Full level only. Choose the topic from the Filter by Topic list.'
  },

  intro: {
    foundation: [
      'A radio signal in the air changes smoothly. A computer cannot hold a smooth thing, only a list of numbers, so before the signal can be processed it has to be measured over and over again and written down.',
      'Measuring a signal over and over like this is called sampling. Move the controls and watch what the measurements look like compared with the signal they came from.'
    ],
    intermediate: [
      'Sampling turns a smooth signal into a list of numbers. Two things decide how good that list is: how often you measure, and how finely you can write each measurement down.',
      'Both are on the controls. Watch the gap between the smooth original and the staircase the converter holds as you change them.'
    ],
    full: [
      'Sampling is straightforward until the signal contains something above half the sample rate. Then the converter reports a frequency that was never there, and nothing downstream can tell the difference.',
      'An anti-alias filter is there to stop that, and the need for one is easier to believe once you have seen it happen. Push the signal frequency past the Nyquist line and watch where the tone comes back.'
    ]
  },

  /** Sample rate, signal frequency and bit depth, in audio-sized numbers. */

  /*
   * Read before this bench was designed. Our own summary of what each source
   * insists on; no wording from any of them appears here or in the bench.
   */
  sources: {
    read: [
      'Foundation licence manual, digital signals and the converter',
      'Intermediate licence manual, software defined radio and data conversion',
      'Exam Secrets, digital signals at Foundation, Intermediate and Full',
      'Syllabus 2024 v1.6b, items 2F1 and 2F2'
    ],
    keyMessages: [
      { at: '2F1', level: 'foundation',
        point: 'analogue changes continually in amplitude, frequency or both; digital is a stream of separate measurements' },
      { at: '2F1', level: 'foundation',
        point: 'faster measuring follows the shape more closely' },
      { at: '2F1', level: 'intermediate',
        point: 'bit depth, also called resolution, sets how finely each measurement is kept' },
      { at: '2F1', level: 'intermediate',
        point: 'the rounding is a form of distortion and shows as a noise floor' },
      { at: '2F1', level: 'intermediate',
        point: 'rate and depth are the two figures of merit, and both cost money and processing' },
      { at: '2F1', level: 'intermediate',
        point: 'sample faster than twice the highest frequency: twice it is the Nyquist rate, the minimum' },
      { at: '2F1', level: 'full',
        point: 'sample at more than twice the highest frequency present, not twice the bandwidth' },
      { at: '2F1', level: 'full',
        point: 'a tone above the limit reflects back below it and cannot afterwards be told apart' },
      { at: '2F1', level: 'full',
        point: 'the anti-alias filter must come before the converter, and needs headroom for its slope' },
      { at: '2F2', level: 'foundation',
        point: 'the ADC takes the measurements and something with computing power must follow it' },
      { at: '2F2', level: 'foundation',
        point: 'a DAC completes the round trip back to a smooth voltage' },
      { at: '2F2', level: 'full',
        point: 'the Fourier transform moves between the time and frequency views of one signal' },
      { at: '2F2', level: 'full',
        point: 'harmonics sit at whole multiples, and a signal carrying them still repeats at the fundamental' }
    ]
  },

  controls: [
    { id: 'fsig', label: 'Signal', unit: 'Hz', range: [100, 20000], start: 1000,
      desc: 'The frequency of the tone arriving at the converter' },
    { id: 'fs', label: 'Sample rate', unit: 'Hz', range: [2000, 48000], start: 8000,
      desc: 'How many measurements the converter takes each second' },
    { id: 'bits', label: 'Bit depth', unit: '', range: [2, 16], start: 8, integer: true, linear: true,
      desc: 'Binary digits per measurement. Also called resolution' }
  ],

  derive: (v) => {
    const bits = Math.round(v.bits);
    const nyquist = v.fs / 2;
    return {
      fsig: v.fsig, fs: v.fs, bits: bits, nyquist: nyquist,
      alias: DSP.aliasOf(v.fsig, v.fs),
      aliased: DSP.isAliased(v.fsig, v.fs),
      // a tone exactly on the line is not moved, but two samples a cycle is
      // not enough to capture it: the rule is more than twice
      onLine: Math.abs(v.fsig - nyquist) < 1e-9 * v.fs,
      // whole sample rates the tone is above zero, and what is left after
      // taking them away; above the sample rate the simple rule needs this
      wraps: Math.floor(v.fsig / v.fs),
      rem: v.fsig - Math.floor(v.fsig / v.fs) * v.fs,
      // what is left lands exactly on the line, as 12 kHz does at 8 kHz
      remOnLine: Math.abs(v.fsig - Math.floor(v.fsig / v.fs) * v.fs - nyquist) < 1e-9 * v.fs,
      step: DSP.quantStep(bits),
      levels: Math.pow(2, bits),
      snr: DSP.idealSNR(bits),
      // f0 is what the charge animation would use; there is no circuit here
      f0: 0
    };
  },

  /*
   * The Full booklet (EX309) prints none of these, so at Full each is either
   * one to learn or, where the Full syllabus does not examine it, for
   * interest. Below Full the template marks every formula for interest.
   */
  equations: {
    step: { given: false, name: 'Size of one step',
            eq: 'step = full scale / 2<sup>bits</sup>',
            // full scale runs from -1 to +1, so the step as a fraction of it
            // is half the step the quantiser uses on that range
            work: d => ['full scale / 2<sup><b>' + d.bits + '</b></sup> = full scale / <b>' +
                        d.levels.toLocaleString('en-GB') + '</b> levels',
                        F.trim(d.step / 2, 4) + ' of full scale'] },
    snr: { given: false, name: 'Best case signal to noise',
           eq: 'SNR = 6.02n + 1.76 dB',
           work: d => ['6.02 &times; <b>' + d.bits + '</b> + 1.76',
                       F.trim(d.snr, 4) + ' dB'] },
    rule: { given: false, name: 'Choosing a sample rate',
            eq: 'rate &gt; 2 &times; highest frequency present',
            work: d => ['2 &times; <b>' + F.eng(d.fsig, 'Hz', 4) + '</b>',
                        'more than ' + F.eng(2 * d.fsig, 'Hz', 4)] },
    nyq: { given: false, name: 'The Nyquist limit',
           eq: 'f<sub>N</sub> = sample rate / 2',
           work: d => ['<b>' + F.eng(d.fs, 'Hz', 4) + '</b> / 2', F.eng(d.nyquist, 'Hz', 4)] },
    // These two rows are arithmetic only. Whether a tone moves at all, and
    // why, is said in words in the note under the working, so no prose sits
    // after an equals sign.
    reflect: { given: false, name: 'The alias as a reflection',
               eq: 'as far below f<sub>N</sub> as the tone is above it',
               applies: d => d.aliased,
               work: d => {
                 const N = F.eng(d.nyquist, 'Hz', 4), out = F.eng(d.alias, 'Hz', 4);
                 const f = '<b>' + F.eng(d.fsig, 'Hz', 4) + '</b>';
                 const r = '<b>' + F.eng(d.fs, 'Hz', 4) + '</b>';
                 if (d.wraps === 0) return [N + ' &minus; (' + f + ' &minus; ' + N + ')', out];
                 // beyond the sample rate it folds more than once; taking off
                 // whole sample rates leaves the same samples, so do that first
                 const less = f + ' &minus; ' + (d.wraps > 1 ? d.wraps + ' &times; ' : '') + r;
                 return d.rem > d.nyquist && !d.remOnLine
                   ? [N + ' &minus; ((' + less + ') &minus; ' + N + ')', out]
                   : [less, out];
               } },
    alias: { given: false, name: 'Where a tone above the limit comes back',
             eq: 'f<sub>alias</sub> = sample rate &minus; f, for f between f<sub>N</sub> and the sample rate',
             // past the sample rate, once whole sample rates are off, what is
             // left may already be below the line; then there is nothing to
             // subtract it from and the row above has the answer
             applies: d => d.aliased && (d.wraps === 0 || (d.rem > d.nyquist && !d.remOnLine)),
             work: d => {
               const f = '<b>' + F.eng(d.fsig, 'Hz', 4) + '</b>', r = '<b>' + F.eng(d.fs, 'Hz', 4) + '</b>';
               if (d.wraps === 0) return [r + ' &minus; ' + f, F.eng(d.alias, 'Hz', 4)];
               return [r + ' &minus; (' + f + ' &minus; ' + (d.wraps > 1 ? d.wraps + ' &times; ' : '') + r + ')',
                       F.eng(d.alias, 'Hz', 4)];
             } },
    // FFT resolution is not in the Full syllabus, which asks only what a
    // Fourier transform does
    bins: { given: false, tag: { full: 'interest' }, name: 'What the transform gives you',
            eq: 'spacing = sample rate / number of samples',
            // below 1 Hz, "488 mHz" reads too easily as megahertz
            work: d => ['<b>' + F.eng(d.fs, 'Hz', 4) + '</b> / <b>4096</b> samples',
                        (d.fs / 4096 < 1 ? F.trim(d.fs / 4096, 3) + '\u00a0Hz' : F.eng(d.fs / 4096, 'Hz', 3)) +
                        ' per point'] }
  },


  /*
   * Words this bench introduces. A term is defined in the section that first
   * uses it, and the build fails if prose uses one before then.
   */
  terms: {
    'analogue': 'A signal that changes continually in size (amplitude), frequency or both, taking any value in between, as a voice or a radio wave does.',
    'digital': 'A signal stored as a list of separate numbers rather than a smooth curve.',
    'sample': 'One measurement of a signal, taken at a particular instant.',
    'sample rate': 'How many measurements are taken each second.',
    'quantisation': 'Rounding each measurement to the nearest value the converter is able to store. What is thrown away is a form of distortion, and shows on a spectrum as an added noise floor.',
    'bit depth': 'How many binary digits are used for each measurement, which decides how many different levels it can be rounded to. Also called resolution.',
    'DAC': 'Digital to analogue converter. The reverse of an ADC: it turns a stream of numbers back into a smoothly changing voltage.',
    'Nyquist rate': 'The minimum sample rate for a given signal, which is twice its highest frequency. Not the same as the Nyquist frequency, which is half a given sample rate.',
    'Nyquist': 'Half the sample rate. Any frequency above this line cannot be recorded correctly.',
    'aliasing': 'What happens to a frequency above the Nyquist line: it is reported as a different, lower frequency that was never present.',
    'anti-alias filter': 'A filter placed before the converter to remove anything above the Nyquist line, so it never gets the chance to fold.',
    'ADC': 'Analogue to digital converter, the device that takes the measurements.',
    'Fourier transform': 'The arithmetic that takes a block of samples measured over time and reports how much of each frequency was in them.',
    'spectrum': 'A display of how much signal is present at each frequency.',
    'harmonic': 'A frequency that is a whole number multiple of another. A signal that is not a pure sine wave contains them.',
    'time domain': 'Looking at a signal as a value changing over time.',
    'frequency domain': 'Looking at the same signal as a set of frequencies, each with a size.'
  },

  /* ---- panels ---- */
  panels: {
    /*
     * The signal path, drawn as the blocks it passes through. Smooth on the
     * way in, numbers in the middle, smooth again on the way out. No control
     * applies here, so the item lists none and no slider sits above it.
     */
    chain(ctx) {
      const { p, t, ro } = ctx;
      const cv = p.graph;
      const dpr = window.devicePixelRatio || 1;
      const W = cv.clientWidth, H = cv.clientHeight;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      const c = cv.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, W, H);

      const stages = [
        { label: 'Aerial', sub: 'smooth', kind: 'wave' },
        { label: 'ADC', sub: 'measures', kind: 'box' },
        { label: 'Software', sub: 'works on numbers', kind: 'box' },
        { label: 'DAC', sub: 'back to a voltage', kind: 'box' },
        { label: 'Speaker', sub: 'smooth again', kind: 'wave' }
      ];
      // on a phone the blocks take the room the margins gave up, so the
      // longest name, Software, keeps clear of its box
      const pad = W < 600 ? 6 : 14, gap = W < 600 ? 14 : 16;
      const bw = (W - pad * 2 - gap * (stages.length - 1)) / stages.length;
      const by = H / 2 - 34, bh = 46;

      // nothing on the canvas under 15 px, the house minimum
      const labelFont = '600 15px "Saira Semi Condensed", sans-serif';
      const capFont = '15px "Saira Semi Condensed", sans-serif';
      c.font = labelFont;
      c.textAlign = 'center';
      stages.forEach((s, i) => {
        const x = pad + i * (bw + gap);
        const mid = x + bw / 2;
        const digital = i >= 1 && i <= 3;
        c.strokeStyle = digital ? t.ink : t.v;
        c.fillStyle = t.surface;
        c.lineWidth = digital ? 2 : 1.5;
        c.beginPath();
        c.rect(x, by, bw, bh);
        c.fill(); c.stroke();

        c.fillStyle = t.ink;
        c.textBaseline = 'middle';
        c.fillText(s.label, mid, by + bh / 2);

        c.fillStyle = t.faint;
        c.font = capFont;
        c.textBaseline = 'top';
        wrapText(c, s.sub, mid, by + bh + 8, bw + gap - 4, 18);
        c.font = labelFont;

        if (i < stages.length - 1) {
          const ax = x + bw + 2, ay = by + bh / 2;
          c.strokeStyle = t.wire; c.lineWidth = 1.4;
          c.beginPath(); c.moveTo(ax, ay); c.lineTo(ax + gap - 4, ay); c.stroke();
          c.fillStyle = t.wire;
          c.beginPath();
          c.moveTo(ax + gap - 4, ay); c.lineTo(ax + gap - 9, ay - 3.5);
          c.lineTo(ax + gap - 9, ay + 3.5); c.closePath(); c.fill();
        }
      });

      // what is travelling between the blocks: a wave, then numbers, then a wave
      c.fillStyle = t.soft;
      c.font = '15px "IBM Plex Mono", monospace';
      c.textBaseline = 'bottom';
      const midGap = i => pad + i * (bw + gap) + bw + gap / 2;
      c.fillText('~~~~', midGap(0), by - 6);
      c.fillText('4 7 6 3', midGap(2), by - 6);
      c.fillText('~~~~', midGap(3), by - 6);

      p.legend.innerHTML = ctx.swatch(t.v, 'Smooth, analogue: a voltage') +
        ctx.swatch(t.ink, 'Numbers, digital');
      p.readouts.innerHTML = ro([
        ['In at this end', 'a smooth signal'],
        ['In the middle', 'a stream of numbers'],
        ['Out at that end', 'a smooth signal']
      ]);
      return {};
    },

    /*
     * Left pane: the waveform as it changes over time. Right pane: the same
     * signal transformed. Both are computed from one array of samples, so
     * adding a harmonic really does change both at once.
     */
    composite(ctx) {
      const { p, d, t, Plot, swatch, ro, Fmt } = ctx;
      const { eng, trim } = Fmt;

      const mix = {
        fundamental: [1, 0, 0],
        second:      [1, 0.5, 0],
        third:       [1, 0, 0.33],
        both:        [1, 0.5, 0.33]
      }[p.topology] || [1, 0, 0];

      // The converter's own settings: the tone on the Signal control, sampled
      // at the Sample rate control. The samples are not rounded, so only the
      // harmonics show on the spectrum.
      const f = d.fsig, fs = d.fs, N = 4096;
      const total = mix[0] + mix[1] + mix[2];
      const at = tt => {
        let v = 0;
        for (let h = 0; h < 3; h++) {
          if (mix[h]) v += mix[h] * Math.sin(2 * Math.PI * f * (h + 1) * tt);
        }
        return v / total;
      };
      const sig = new Float64Array(N);
      for (let i = 0; i < N; i++) sig[i] = at(i / fs);

      // time domain, in the left pane: the signal, and the samples taken of it
      const span = 2 / f, pts = [], dots = [];
      for (let i = 0; i <= 600; i++) pts.push({ x: span * i / 600, y: at(span * i / 600) });
      for (let k = 0; k / fs <= span; k++) dots.push({ x: k / fs, y: sig[k] });
      // the left pane is narrow, so time is counted in cycles of the signal:
      // five short labels that never collide, at any frequency
      const tspec = {
        xRange: [0, span], xFmt: x => trim(x * f, 2), tokens: t,
        left: { min: -1.2, max: 1.2, fmt: y => trim(y, 2) },
        traces: [{ pts: pts, colour: t.v, axis: 'left', width: 2 }],
        cursor: null
      };
      if (p.schem) {
        Plot.draw(p.schem, tspec);
        drawDots(p.schem, tspec, dots, t.mark);
      }
      if (p.schemNote) p.schemNote.textContent = 'time, in cycles of the signal';

      // frequency domain, in the right pane, from those samples
      // a floor of -100 dB and a top of +20 puts the five ticks on round
      // figures: +20, -10, -40, -70, -100
      const sp = DSP.spectrum(sig, fs, { floor: -100 });
      const fpts = [];
      for (let i = 1; i < sp.bins; i++) fpts.push({ x: sp.freq[i], y: sp.db[i] + 100 });

      // where each part of the signal lands once sampled: a harmonic above
      // half the sample rate folds back exactly as a single tone does
      const parts = [];
      ['fundamental', '2nd', '3rd'].forEach((name, h) => {
        if (mix[h]) parts.push({ name, f: f * (h + 1), at: DSP.aliasOf(f * (h + 1), fs),
                                 folded: DSP.isAliased(f * (h + 1), fs) });
      });
      Plot.draw(p.graph, {
        xRange: [0, fs / 2], xFmt: x => eng(x, 'Hz', 3), tokens: t,
        left: { max: 120, fmt: y => Math.round(y - 100) + ' dB' },
        traces: [{ pts: fpts, colour: t.v, fill: t.vFill, axis: 'left', width: 1.5 }],
        marks: parts.map(q => ({ x: q.at, colour: t.mark })),
        cursor: null
      });
      p.legend.innerHTML = swatch(t.v, 'The signal, in time and in frequency') +
        key.dot(t.mark, 'Samples') +
        key.dashed(t.mark, 'Where each part lands');

      // lines closer together than the transform can separate count as one
      const lines = [];
      parts.forEach(q => { if (!lines.some(x => Math.abs(x - q.at) < 2 * sp.binWidth)) lines.push(q.at); });
      const atDC = lines.some(x => x < 2 * sp.binWidth);
      const visible = lines.length - (atDC ? 1 : 0);
      const lineText = !atDC ? String(visible)
        : visible ? visible + ', plus one at 0 Hz' : 'none: everything lands at 0 Hz';
      const folded = parts.filter(q => q.folded);
      const names = xs => xs.length > 1
        ? xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1] : xs[0];
      p.readouts.innerHTML = ro([
        ['Present', parts.map(q => q.name).join(' + ')],
        ['They land at', parts.map(q => eng(q.at, 'Hz', 3)).join(', ')],
        ['Lines on the spectrum', lineText, parts.length > 1],
        folded.length
          ? ['Folded back, above ' + eng(fs / 2, 'Hz', 3), names(folded.map(q => q.name)), true]
          : ['Signal repeats at', eng(f, 'Hz', 4)]
      ]);
      return {};
    },

    /** The smooth signal, the samples taken from it, and the staircase. */
    sampling(ctx) {
      const { p, d, t, level, values, Plot, swatch, ro, Fmt } = ctx;
      const { eng, trim } = Fmt;

      // show a fixed number of cycles of the signal so the shape stays readable
      const cycles = 3;
      const span = cycles / d.fsig;
      const smooth = [], dots = [], stair = [];
      for (let i = 0; i <= 600; i++) {
        const tt = span * i / 600;
        smooth.push({ x: tt, y: Math.sin(2 * Math.PI * d.fsig * tt) });
      }
      const nS = Math.max(2, Math.floor(span * d.fs));
      const raw = DSP.sampleSine(d.fsig, d.fs, nS + 1);
      // the same rounding as the converter model: exactly 2^bits levels
      const held = level === 'foundation' ? raw : DSP.quantise(raw, d.bits);
      for (let k = 0; k <= nS; k++) {
        const tt = k / d.fs;
        const q = held[k];
        dots.push({ x: tt, y: q });
        stair.push({ x: tt, y: q });
        stair.push({ x: Math.min(span, (k + 1) / d.fs), y: q });
      }

      // the held copy is wider and paler, and drawn first, so the real signal
      // still shows where the two coincide
      const band = tint(t.v, isDark(t) ? 0.5 : 0.38);
      const traces = [];
      if (level !== 'foundation') {
        traces.push({ pts: stair, colour: band, axis: 'left', width: 5 });
      }
      traces.push({ pts: smooth, colour: t.v, axis: 'left', width: 1.6 });

      const spec = {
        xRange: [0, span], xFmt: x => eng(x, 's', 3), tokens: t,
        left: { min: -1.2, max: 1.2, fmt: y => trim(y, 2) },
        traces: traces,
        cursor: null
      };
      Plot.draw(p.graph, spec);
      // the measurements sit on top, drawn as marks rather than joined up
      drawDots(p.graph, spec, dots, t.mark);

      p.legend.innerHTML = swatch(t.v, 'The real signal') +
        (level === 'foundation' ? '' : key.band(band, 'What the converter holds')) +
        key.dot(t.mark, 'Each measurement');

      const rows = [
        ['Signal', eng(d.fsig, 'Hz', 4)],
        ['Measurements a second', eng(d.fs, 'Hz', 4)],
        ['Samples per cycle', trim(d.fs / d.fsig, 3)]
      ];
      if (level === 'foundation') {
        // how fast is fast enough is the Intermediate rule, so Foundation is
        // only told how far apart the measurements are
        rows.push(['Time between measurements', eng(1 / d.fs, 's', 3)]);
      } else {
        rows.push(['Levels available', d.levels.toLocaleString('en-GB')]);
        if (level === 'intermediate') {
          rows.push(['Nyquist rate, twice the signal', eng(2 * d.fsig, 'Hz', 4)]);
          rows.push(['Sampling above it?', d.fs > 2 * d.fsig ? 'yes' : 'no: too slow', d.fs <= 2 * d.fsig]);
        }
      }
      p.readouts.innerHTML = ro(rows);
      return {};
    },

    /** Time and frequency together, with the Nyquist line and the alias. */
    spectrum(ctx) {
      const { p, d, t, level, values, Plot, swatch, ro, Fmt } = ctx;
      const { eng, trim } = Fmt;

      const cap = capture(values, 4096);
      // unrounded samples: bit depth is not on the Full syllabus, and rounding
      // would add spurs this panel does not explain
      const sp = DSP.spectrum(cap.raw, d.fs, { floor: -100 });
      const pts = [];
      for (let i = 1; i < sp.bins; i++) pts.push({ x: sp.freq[i], y: sp.db[i] + 100 });

      const marks = [{ x: d.nyquist, colour: t.mark }];
      Plot.draw(p.graph, {
        xRange: [0, d.fs / 2], xFmt: x => eng(x, 'Hz', 3), tokens: t,
        left: { max: 120, fmt: y => Math.round(y - 100) + ' dB' },
        traces: [{ pts: pts, colour: t.v, fill: t.vFill, axis: 'left', width: 1.4 }],
        marks: marks,
        cursor: { x: d.alias, colour: t.mark,
                  label: (d.aliased ? 'alias at ' : 'tone at ') + eng(d.alias, 'Hz', 4) }
      });
      p.legend.innerHTML = swatch(t.v, 'What the converter reports') +
        swatch(t.mark, d.aliased ? 'Where the tone came back' : 'The tone') +
        key.dashed(t.mark, 'Nyquist, half the sample rate');

      // the fourth figure is the verdict, or the room left for the filter
      const last = d.onLine ? ['Verdict', 'on the line: not enough', true]
        : d.aliased ? ['Verdict', 'wrong frequency', true]
        : ['Room below the line', eng(d.nyquist - d.fsig, 'Hz', 4)];
      p.readouts.innerHTML = ro([
        ['Tone put in', eng(d.fsig, 'Hz', 4)],
        ['Nyquist limit', eng(d.nyquist, 'Hz', 4)],
        ['Appears at', eng(d.alias, 'Hz', 4), d.aliased],
        last
      ]);
      return {};
    }
  },

  /* ---- items ---- */
  items: [
    {
      code: '2F1',
      levels: ['foundation', 'intermediate', 'full'],
      introduces: {
        foundation: ['analogue', 'digital', 'sample', 'sample rate'],
        intermediate: ['quantisation', 'bit depth', 'Nyquist rate'],
        full: ['Nyquist', 'Nyquist rate', 'aliasing', 'anti-alias filter', 'spectrum']
      },
      panel: { foundation: 'sampling', intermediate: 'sampling', full: 'spectrum' },
      // bit depth is Intermediate only: it does nothing on the Foundation
      // panel, and the Full syllabus does not ask about it
      controls: { foundation: ['fsig', 'fs'], intermediate: ['fsig', 'fs', 'bits'], full: ['fsig', 'fs'] },
      noSchematic: true,
      heading: {
        foundation: 'Measuring a signal over and over',
        intermediate: 'How often, and how finely',
        full: 'Sampling too slowly, and the tone that was never there'
      },
      lead: {
        foundation: 'Start by watching the measurements being taken.',
        intermediate: 'Two controls decide how close the copy is. Change one at a time.',
        full: 'Keep the signal below half the sample rate and it is recorded correctly. Push it above and the error cannot be undone.'
      },
      headline: {
        foundation: 'An analogue signal changes smoothly. A digital one is a stream of samples.',
        intermediate: 'More bits and faster sampling give you a closer copy of the original.',
        full: 'Sample too slowly and a signal turns up at the wrong frequency entirely.'
      },
      formulas: {
        intermediate: ['step', 'snr'],
        full: ['rule', 'nyq', 'alias', 'reflect']
      },
      workLead: {
        intermediate: 'The bit depth sets the size of the smallest step the converter can record, and that step sets how much noise it adds.',
        // the rows for a tone above the limit appear only when there is one
        full: d => !d.aliased
          ? 'The two lines give the rule for choosing a rate and the limit it sets. Push the tone above the limit and more lines appear, working out where it reappears.'
          : (d.wraps === 0 || (d.rem > d.nyquist && !d.remOnLine))
            ? 'The first two lines give the rule for choosing a rate and the limit it sets. The last two say where a tone above the limit reappears, worked two ways.'
            : 'The first two lines give the rule for choosing a rate and the limit it sets. The last says where a tone above the limit reappears.'
      },
      workNote: {
        foundation: 'No arithmetic at this level. What matters is the picture: the smooth line is the signal, the dots are the measurements.',
        intermediate: 'Every extra bit halves the step and buys about 6 dB. Drag the bit depth down to 3 or 4 and the staircase becomes obvious.',
        // where this tone lands, in words, then the point that holds for all
        full: d => {
          const e = x => F.eng(x, 'Hz', 4);
          const f = e(d.fsig), N = e(d.nyquist), a = e(d.alias);
          let here;
          if (d.onLine) {
            here = f + ' sits exactly on the ' + N + ' line, so it does not move. But two samples a cycle is not enough: the rate must be more than twice the signal.';
          } else if (!d.aliased) {
            here = f + ' is below the ' + N + ' line already, so it is recorded where it is and there is nothing to reflect.';
          } else if (d.wraps === 0) {
            here = f + ' is ' + e(d.fsig - d.nyquist) + ' above the ' + N + ' line, so it comes back the same distance below, at ' + a + '.';
          } else {
            const count = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][d.wraps] || String(d.wraps);
            const off = f + ' is past the ' + e(d.fs) + ' sample rate itself, so take off ' + count +
              (d.wraps > 1 ? ' whole sample rates' : ' whole sample rate') +
              ' first, which leaves exactly the same samples: ' + e(d.rem) + ', ';
            here = d.remOnLine
              ? off + 'which lands exactly on the line. It shows at ' + a + ', but two samples a cycle does not capture it properly.'
              : d.rem > d.nyquist
                ? off + 'which is ' + e(d.rem - d.nyquist) + ' above the line, so it comes back the same distance below, at ' + a + '.'
                : off + 'which is below the line, so that is where it appears.';
          }
          return here + ' Once a tone has folded back, nothing in the samples shows that it was ever higher: it is indistinguishable from a real tone at the lower frequency. So the filter has to come before the converter, not after it.';
        }
      },
      explain: {
        foundation: [
          'The smooth line is the signal arriving at the radio. The dots are the moments when the converter measures it and writes the answer down.',
          'Speed the measurements up and the dots crowd together, so the list of numbers describes the signal more closely. Slow them down and the dots grow far apart, and you start to lose the shape between them.',
          'An analogue signal changes continually, in size, frequency or both. A digital one is a list of measurements taken at a steady rate, sometimes called a number stream.'
        ],
        intermediate: [
          'The pale blue staircase is what the converter actually holds. It can only store one of a fixed set of levels, so each measurement is rounded to the nearest one and the difference is thrown away.',
          'Drag the bit depth down and the steps get coarse. That rounding error is quantisation error, and it is a form of distortion: what comes out is not quite the shape that went in. On a spectrum it shows as an added noise floor.',
          'Now drag the sample rate. More samples a second follows the shape more closely. The two controls improve different things, which is why a converter is specified by both. Pushing either one up costs money, and it costs processing as well: more samples a second, with more digits in each, is more arithmetic for whatever has to handle the result. A real design settles on enough of each rather than the most of either.',
          'Bit depth also goes by the name resolution, and you will meet both words. They mean the same thing: how finely each measurement can be recorded.',
          'There is a floor under the sample rate. It has to be more than twice the highest frequency in the signal, and twice that frequency is called the Nyquist rate: the minimum. Drag the sample rate down until it is less than twice the signal, and the measurements stop following its shape.'
        ],
        full: [
          'To choose a sample rate, take the highest frequency you want to capture and sample at more than twice it. It is the highest frequency that counts, not the bandwidth: a signal from 10 kHz to 14 kHz is only 4 kHz wide, but still needs more than 28,000 samples a second.',
          'Two similar names are worth keeping apart. The Nyquist frequency is half a given sample rate, and it is the line on the display. The Nyquist rate is the minimum sample rate for a given signal, twice its highest frequency. One is a property of the converter, the other of the signal.',
          'Push the signal past the Nyquist line and watch the spectrum. The tone does not disappear and it does not stay put: it folds back and appears somewhere below the line instead.',
          'A 5 kHz tone sampled at 8 kHz comes back at 3 kHz. Nothing downstream can tell that apart from a real 3 kHz tone, because by then they are the same list of numbers.',
          'There is a neater way to see where it lands. The tone reflects about the Nyquist line: it comes back as far below the line as it started above it. 5 kHz is 1 kHz above the 4 kHz line, so it returns 1 kHz below, at 3 kHz. Subtracting from the sample rate gives the same answer, but the reflection is the one that stays with you. Both work only while the tone is below the sample rate itself. Push it further and it folds more than once: take off whole sample rates first, which leaves exactly the same samples, then reflect what is left if it is still above the line. The working above does this whenever you go that far.',
          'This is why an anti-alias filter goes in front of the converter. Once the folding has happened it cannot be undone, so the only cure is to stop it arriving.',
          'In practice you sample comfortably faster than twice, not exactly twice. A real filter does not stop dead at its cut-off, it rolls off over a range, so a little of what lies above still gets through. Leaving headroom between the highest wanted frequency and the Nyquist line gives the filter room to do its work.'
        ]
      }
    },

    {
      code: '2F2',
      levels: ['foundation', 'full'],
      toggle: {
        label: 'Harmonics',
        levels: ['full'],
        options: [['fundamental', 'Sine alone'], ['second', 'Plus 2nd'],
                  ['third', 'Plus 3rd'], ['both', 'Plus both']]
      },
      introduces: {
        foundation: ['ADC', 'DAC'],
        full: ['Fourier transform', 'time domain', 'frequency domain', 'harmonic']
      },
      panel: { foundation: 'chain', full: 'composite' },
      // no control changes the Foundation chain; bit depth plays no part in
      // the transform, whose samples are not rounded
      controls: { full: ['fsig', 'fs'] },
      noSchematic: { foundation: true },
      circuit: 'fundamental',
      heading: {
        foundation: 'The converter, and what comes after it',
        full: 'Seeing the same signal as frequencies'
      },
      lead: {
        foundation: 'The part doing the measuring has a name, and so does the thing that has to follow it.',
        full: 'The same list of numbers can be looked at two ways, and one transform gets you between them.'
      },
      headline: {
        foundation: 'What an analogue to digital converter does, and why you need something to process the result.',
        full: 'The Fourier transform, which turns a signal in time into a picture of its frequencies.'
      },
      formulas: { full: ['bins'] },
      workNote: {
        foundation: 'No arithmetic at this level. Learn the two names: ADC, analogue to digital converter; DAC, digital to analogue converter.',
        full: 'The display is a real transform, not a drawing. Every point on it was calculated from a block of 4096 samples of the signal, taken at the sample rate set above, with the fundamental at the Signal setting. The spacing between points is for interest only: the exam asks what the transform does, not how finely it does it.'
      },
      explain: {
        foundation: [
          'Follow the path across the panel. A smooth signal arrives from the aerial. The analogue to digital converter, almost always shortened to ADC, measures it over and over and hands on a stream of numbers. That is the doorway between the aerial and the software.',
          'An ADC only produces numbers. Something with computing power has to follow it to do the filtering, demodulating and everything else a receiver needs.',
          'At the far end the process runs backwards. A digital to analogue converter, a DAC, turns the numbers back into a smoothly changing voltage you can feed to a loudspeaker. Between the two, the signal spends its whole life as numbers.',
          'There are two reasons for going to all this trouble. Anything done in software can be changed by updating the software, which is not true of a circuit built from parts. And numbers survive noise: if you know the signal can only be one of a set of values, you can still tell which one it was meant to be even when it arrives untidy.',
          'That is what makes a software defined radio different. The work that used to be done by tuned circuits and detectors is done by arithmetic instead.'
        ],
        full: [
          'A signal can be described two ways: as a value changing over time, or as a set of frequencies with a size each. Both describe the same thing.',
          'A pure sine wave is a single line on the frequency display. Anything that is not a pure sine has more lines, and if the extra ones sit at whole multiples of the first they are called harmonics. A sine with a harmonic added still repeats at the lower of the two frequencies, but the shape is no longer a clean sine, which is how you spot it in the time domain.',
          'The Fourier transform is the arithmetic that gets you from one to the other. Give it a block of samples taken over time and it returns how much of each frequency was in them.',
          'The two displays above are one signal. Add a harmonic and watch both change together: a new line appears on the right, and the shape on the left stops being a clean sine while still repeating at the same rate.',
          'The waterfall on an SDR is this transform, repeated many times a second.',
          'The transform can only report what is in the samples, so the rule from the section before still applies. Raise the signal or lower the sample rate until a harmonic passes half the sample rate, and its line folds back below the edge of the display and no longer sits at its whole multiple of the fundamental.'
        ]
      }
    }
  ],


  /*
   * Our own explanation of each answer. The question, its options and the
   * marked answer are the RSGB's and ship unadapted; the reasoning is ours.
   */
  answers: {
    '2025-Full6015': {
      why: 'The rule is twice the highest frequency present, not twice the bandwidth and not twice the lowest. The highest here is 14 kHz, so the rate must be more than 28k samples a second, and 30k is the lowest offered that clears it.',
      working: ['the rate must be more than 2 &times; highest frequency',
                '= 2 &times; 14 kHz',
                '= 28k samples/s, so 30k is the lowest that works'],
      source: { eq: ['rule'], from: ['2F1'] },
      seed: { fsig: 14000, fs: 30000 },
      seedNote: 'Set the bench to a 14 kHz tone sampled at 30k and watch it stay where it should. Drag the rate below 28k and it starts to fold.'
    },
    '2025-Full6019': {
      why: 'Once a frequency above the limit has been sampled it has already folded down, and it now looks exactly like a real signal at the lower frequency. Nothing after the converter can separate them. The filter has to remove it before it is ever measured.',
      source: { eq: ['alias'], from: ['2F1'] },
      seedNote: 'Push the signal above the Nyquist line on the bench. Notice there is no way to tell the folded tone from a genuine one at that frequency.'
    },
    '2025-Full7395': {
      why: 'Aliasing is caused by frequencies arriving that are higher than half the sample rate. Option B has it backwards, and option D describes oversampling, which is the safe direction.',
      working: ['a tone folds when f &gt; sample rate / 2',
                'to illustrate (the question gives no figures): 12 kHz is above the 8 kHz limit of a 16k rate',
                'so it returns at 16 kHz &minus; 12 kHz = 4 kHz',
                'so aliasing is caused by analogue frequencies higher than the converter is designed to accept'],
      source: { eq: ['nyq', 'alias'], from: ['2F1'] },
      seed: { fsig: 12000, fs: 16000 },
      seedNote: 'The question has no figures; this is an illustration. A 12 kHz tone sampled at 16k folds back to 4 kHz. Set the bench to it and read the spectrum.'
    },
    '2025-Full7645': {
      why: 'Sampling at 80M samples a second puts the folding point at 40 MHz, so anything still getting through above that comes back inside the wanted range. That rules out two of the four. Of the two left, the better one is whichever keeps the most spectrum while still being well down by 40 MHz, because a filter that closes too early throws away band you could have used.',
      source: { eq: ['nyq'], from: ['2F1'] },
      working: ['folding point = 80M samples/s / 2 = 40 MHz',
                'responses 3 and 4 are still at full output at 40 MHz, so both fold back',
                'response 1 is well clear by 40 MHz but gives up everything above 20 MHz',
                'response 2 is around 60 dB down by 40 MHz and still passes to 30 MHz']
    },
    '2025-Full7401': {
      why: 'The transform takes a block of samples and reports how much of each frequency was in them, which is what puts the signals in frequency order. Option A describes a transformer, option C a data demodulator and option D the quadrature mixing that produces I and Q.',
      source: { from: ['2F2'] },
      seedNote: 'The right-hand display in the Fourier transform section is a real transform of the samples drawn on the left of it.'
    },
    '2025-Full7686': {
      source: { from: ['2F2'] },
      why: 'A spectrum shows how much of each frequency is present and says nothing about where in its cycle each one starts. Two waveforms can therefore look quite different and still give the same spectrum, which is why the question asks for a pair of plots rather than one.',
      working: ['the two peaks sit at about 1.5 MHz and 4.5 MHz',
                '4.5 / 1.5 = 3, so it is a fundamental and its third harmonic',
                'so look for three cycles of the dotted trace to one of the dashed',
                'plots 1 and 4 both show that, and differ only in where the harmonic starts']
    },
    '2025-Full7864': {
      source: { from: ['2F2'] },
      why: 'Time in, frequency out. Options A and B describe converters rather than transforms, and there is no wavelength domain in this sense.'
    },
    '2025-Full7890': {
      source: { from: ['2F2'] },
      why: 'Follow what is drawn on the arrows rather than guessing from the block numbers. Each arrow shows the signal at that point, and the answer is the block where the picture changes from something drawn against time to something drawn against frequency.',
      working: ['into block 1: an analogue waveform against time',
                'out of block 1: a stream of pulses, so block 1 is the converter',
                'out of block 2: levels in dB against frequency in MHz',
                'turning time into frequency is a Fourier transformation']
    }
  },

  outro: {
    foundation: [
      'Sampling is measuring a signal over and over at a steady rate, and an ADC is the part that does it. Everything a software radio does afterwards works on those numbers.'
    ],
    intermediate: [
      'Sample rate and bit depth are separate controls solving separate problems. Rate decides how much of the shape you keep. Depth decides how finely each measurement is recorded, and every bit is worth about 6 dB.'
    ],
    full: [
      'Below the Nyquist limit, sampling keeps every frequency where it was. Above it, the converter reports a frequency that was never there, and nothing afterwards can separate it from a real one. So the anti-alias filter goes in front of the converter.'
    ]
  }
};

/** The measurements, drawn as marks on top of whatever the plot already has. */
function drawDots(canvas, spec, pts, colour) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = colour;
  for (const q of pts) {
    if (q.x < spec.xRange[0] || q.x > spec.xRange[1]) continue;
    ctx.beginPath();
    ctx.arc(window.Plot.xAt(canvas, spec.xRange, q.x),
            window.Plot.leftY(canvas, spec, q.y), 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

if (typeof module !== 'undefined' && module.exports) module.exports = BENCH;
if (typeof window !== 'undefined') window.BENCH = BENCH;
