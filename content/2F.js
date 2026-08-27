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

/** One block of samples, plus the smooth signal they were taken from. */
function capture(v, n) {
  const fs = v.fs, f = v.fsig;
  const N = n || 2048;
  const raw = DSP.sampleSine(f, fs, N);
  return { raw: raw, quant: DSP.quantise(raw, Math.round(v.bits)), fs: fs, f: f, N: N };
}


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
  bank: {
    url: 'https://rsgb.services/public/exams/eqdb/',
    topic: '2F - Digital signals',
    note: 'Full level only. Choose the topic from the Filter by Topic list.'
  },

  intro: {
    foundation: [
      'A radio signal in the air changes smoothly. A computer cannot hold a smooth thing, only a list of numbers, so before the signal can be processed it has to be measured over and over again and written down.',
      'That is all sampling is. Move the controls and watch what the measurements look like compared with the signal they came from.'
    ],
    intermediate: [
      'Sampling turns a smooth signal into a list of numbers. Two things decide how good that list is: how often you measure, and how finely you can write each measurement down.',
      'Both are on the controls. Watch the error between the original and the reconstruction as you change them, and watch what it does to the noise floor on the spectrum.'
    ],
    full: [
      'Sampling is straightforward until the signal contains something above half the sample rate. Then the converter reports a frequency that was never there, and nothing downstream can tell the difference.',
      'That is the whole reason an anti-alias filter exists, and it is easier to believe once you have seen it happen. Push the signal frequency past the Nyquist line and watch where the tone comes back.'
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
      'Syllabus 2019 per-level specifications, items 2F1 and 2F2'
    ],
    keyMessages: [
      { at: '2F1', level: 'foundation',
        point: 'analogue changes smoothly, digital is a stream of separate measurements' },
      { at: '2F1', level: 'foundation',
        point: 'faster measuring follows the shape more closely' },
      { at: '2F1', level: 'intermediate',
        point: 'bit depth, also called resolution, sets how finely each measurement is kept' },
      { at: '2F1', level: 'intermediate',
        point: 'the rounding is a form of distortion and shows as a noise floor' },
      { at: '2F1', level: 'intermediate',
        point: 'rate and depth are the two figures of merit, and both cost money and processing' },
      { at: '2F1', level: 'full',
        point: 'sample at a little over twice the highest frequency present, not twice the bandwidth' },
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
    { id: 'bits', label: 'Bit depth', unit: '', range: [2, 16], start: 8, integer: true,
      desc: 'Binary digits per measurement. Also called resolution' }
  ],

  derive: (v) => {
    const bits = Math.round(v.bits);
    const nyquist = v.fs / 2;
    return {
      fsig: v.fsig, fs: v.fs, bits: bits, nyquist: nyquist,
      alias: DSP.aliasOf(v.fsig, v.fs),
      aliased: DSP.isAliased(v.fsig, v.fs),
      step: DSP.quantStep(bits),
      levels: Math.pow(2, bits),
      snr: DSP.idealSNR(bits),
      // f0 is what the charge animation would use; there is no circuit here
      f0: 0
    };
  },

  /*
   * None of these appear in the reference booklet, so all four are marked as
   * something to know rather than something you will be handed.
   */
  equations: {
    step: { given: false, name: 'Size of one step',
            eq: 'step = full scale / 2<sup>bits</sup>',
            work: d => ['2 / 2<sup><b>' + d.bits + '</b></sup> = 2 / <b>' +
                        d.levels.toLocaleString('en-GB') + '</b> levels',
                        F.trim(d.step, 4) + ' of full scale'] },
    snr: { given: false, name: 'Best case signal to noise',
           eq: 'SNR = 6.02n + 1.76 dB',
           work: d => ['6.02 &times; <b>' + d.bits + '</b> + 1.76',
                       F.trim(d.snr, 4) + ' dB'] },
    rule: { given: false, name: 'Choosing a sample rate',
            eq: 'rate &ge; 2 &times; highest frequency present',
            work: d => ['for a signal reaching <b>' + F.eng(d.fsig, 'Hz', 4) + '</b>',
                        'at least ' + F.eng(2 * d.fsig, 'Hz', 4)] },
    nyq: { given: false, name: 'The Nyquist limit',
           eq: 'f<sub>N</sub> = sample rate / 2',
           work: d => ['<b>' + F.eng(d.fs, 'Hz', 4) + '</b> / 2', F.eng(d.nyquist, 'Hz', 4)] },
    reflect: { given: false, name: 'The alias as a reflection',
               eq: 'as far below f<sub>N</sub> as the tone is above it',
               work: d => d.aliased
                 ? ['<b>' + F.eng(d.fsig, 'Hz', 4) + '</b> is ' +
                    F.eng(Math.abs(d.fsig - d.nyquist), 'Hz', 3) + ' above the line',
                    'so it returns the same distance below, at ' + F.eng(d.alias, 'Hz', 4)]
                 : ['<b>' + F.eng(d.fsig, 'Hz', 4) + '</b> is below the line already',
                    'nothing to reflect'] },
    alias: { given: false, name: 'Where a tone above the limit comes back',
             eq: 'f<sub>alias</sub> = sample rate &minus; f',
             work: d => d.aliased
               ? ['<b>' + F.eng(d.fs, 'Hz', 4) + '</b> &minus; <b>' + F.eng(d.fsig, 'Hz', 4) + '</b>',
                  F.eng(d.alias, 'Hz', 4)]
               : ['<b>' + F.eng(d.fsig, 'Hz', 4) + '</b> is below the limit, so it stays put',
                  F.eng(d.alias, 'Hz', 4)] },
    bins: { given: false, name: 'What the transform gives you',
            eq: 'spacing = sample rate / number of samples',
            work: d => ['<b>' + F.eng(d.fs, 'Hz', 4) + '</b> / <b>4096</b> samples',
                        F.eng(d.fs / 4096, 'Hz', 3) + ' per point'] }
  },


  /*
   * Words this bench introduces. A term is defined in the section that first
   * uses it, and the build fails if prose uses one before then.
   */
  terms: {
    'analogue': 'A signal that varies smoothly, taking any value in between, the way a voice or a radio wave does.',
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
     * way in, numbers in the middle, smooth again on the way out. None of the
     * controls apply here, and the caption says so rather than leaving the
     * reader wondering which slider does nothing.
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
        { label: 'Aerial', sub: 'a smooth signal', kind: 'wave' },
        { label: 'ADC', sub: 'measures it, over and over', kind: 'box' },
        { label: 'Software', sub: 'does the work, on numbers', kind: 'box' },
        { label: 'DAC', sub: 'turns numbers back into a voltage', kind: 'box' },
        { label: 'Speaker', sub: 'a smooth signal again', kind: 'wave' }
      ];
      const pad = 14, gap = 16;
      const bw = (W - pad * 2 - gap * (stages.length - 1)) / stages.length;
      const by = H / 2 - 34, bh = 46;

      c.font = '600 12.5px "Saira Semi Condensed", sans-serif';
      c.textAlign = 'center';
      stages.forEach((s, i) => {
        const x = pad + i * (bw + gap);
        const mid = x + bw / 2;
        const digital = i >= 1 && i <= 3;
        c.strokeStyle = digital ? t.trace : t.phase;
        c.fillStyle = t.surface;
        c.lineWidth = digital ? 2 : 1.5;
        c.beginPath();
        c.rect(x, by, bw, bh);
        c.fill(); c.stroke();

        c.fillStyle = t.ink;
        c.textBaseline = 'middle';
        c.fillText(s.label, mid, by + bh / 2);

        c.fillStyle = t.faint;
        c.font = '11px "Saira Semi Condensed", sans-serif';
        c.textBaseline = 'top';
        wrapText(c, s.sub, mid, by + bh + 8, bw + gap - 4, 13);
        c.font = '600 12.5px "Saira Semi Condensed", sans-serif';

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
      c.font = '11px "IBM Plex Mono", monospace';
      c.textBaseline = 'bottom';
      const midGap = i => pad + i * (bw + gap) + bw + gap / 2;
      c.fillText('~~~~', midGap(0), by - 6);
      c.fillText('4 7 6 3', midGap(2), by - 6);
      c.fillText('~~~~', midGap(3), by - 6);

      p.legend.innerHTML = ctx.swatch(t.phase, 'Smooth, analogue') +
        ctx.swatch(t.trace, 'Numbers, digital');
      p.readouts.innerHTML = ro([
        ['In at this end', 'a smooth signal'],
        ['In the middle', 'a stream of numbers'],
        ['Out at that end', 'a smooth signal'],
        ['Controls above', 'apply to the panel before this one']
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

      const f = 1000, fs = 48000, N = 4096;
      const sig = new Float64Array(N);
      for (let i = 0; i < N; i++) {
        let v = 0;
        for (let h = 0; h < 3; h++) {
          if (mix[h]) v += mix[h] * Math.sin(2 * Math.PI * f * (h + 1) * i / fs);
        }
        sig[i] = v / (mix[0] + mix[1] + mix[2]);
      }

      // time domain, in the left pane
      const span = 2 / f, pts = [];
      for (let i = 0; i < Math.floor(span * fs); i++) pts.push({ x: i / fs, y: sig[i] });
      const tspec = {
        xRange: [0, span], xFmt: x => eng(x, 's', 2), tokens: t,
        left: { min: -1.15, max: 1.15, fmt: y => trim(y, 2) },
        traces: [{ pts: pts, colour: t.trace, axis: 'left', width: 2 }],
        cursor: null
      };
      if (p.schem) Plot.draw(p.schem, tspec);
      if (p.schemNote) p.schemNote.textContent = 'the same signal, plotted against time';

      // frequency domain, in the right pane
      const sp = DSP.spectrum(sig, fs, { floor: -80 });
      const fpts = [];
      for (let i = 1; i < sp.bins && sp.freq[i] < f * 5; i++) {
        fpts.push({ x: sp.freq[i], y: sp.db[i] + 80 });
      }
      Plot.draw(p.graph, {
        xRange: [0, f * 5], xFmt: x => eng(x, 'Hz', 3), tokens: t,
        left: { max: 85, fmt: y => Math.round(y - 80) + ' dB' },
        traces: [{ pts: fpts, colour: t.phase, fill: t.fill, axis: 'left', width: 1.5 }],
        marks: [{ x: f, colour: t.marker }, { x: 2 * f, colour: t.marker },
                { x: 3 * f, colour: t.marker }],
        cursor: null
      });
      p.legend.innerHTML = swatch(t.trace, 'Against time') +
        swatch(t.phase, 'Against frequency') + swatch(t.marker, 'Fundamental and harmonics');

      const present = ['fundamental'];
      if (mix[1]) present.push('2nd');
      if (mix[2]) present.push('3rd');
      p.readouts.innerHTML = ro([
        ['Fundamental', eng(f, 'Hz', 3)],
        ['Present', present.join(' + ')],
        ['Lines on the spectrum', String(present.length), present.length > 1],
        ['Repeats at', eng(f, 'Hz', 3)]
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
      for (let k = 0; k <= nS; k++) {
        const tt = k / d.fs;
        const raw = Math.sin(2 * Math.PI * d.fsig * tt);
        const q = level === 'foundation' ? raw
          : Math.max(-1, Math.min(1, Math.round(raw / d.step) * d.step));
        dots.push({ x: tt, y: q });
        stair.push({ x: tt, y: q });
        stair.push({ x: Math.min(span, (k + 1) / d.fs), y: q });
      }

      const traces = [{ pts: smooth, colour: t.phase, axis: 'left', width: 1.6 }];
      if (level !== 'foundation') {
        traces.push({ pts: stair, colour: t.trace, axis: 'left', width: 2.2 });
      }
      traces.push({ pts: dots, colour: t.marker, axis: 'left', width: 0, dots: true });

      const spec = {
        xRange: [0, span], xFmt: x => eng(x, 's', 2), tokens: t,
        left: { min: -1.25, max: 1.25, fmt: y => trim(y, 2) },
        traces: traces.filter(tr => tr.width !== 0),
        cursor: null
      };
      Plot.draw(p.graph, spec);
      // the measurements sit on top, drawn as marks rather than joined up
      drawDots(p.graph, spec, dots, t.marker);

      p.legend.innerHTML = swatch(t.phase, 'The real signal') +
        (level === 'foundation' ? '' : swatch(t.trace, 'What the converter holds')) +
        swatch(t.marker, 'Each measurement');

      const rows = [
        ['Signal', eng(d.fsig, 'Hz', 4)],
        ['Measurements a second', eng(d.fs, 'Hz', 4)],
        ['Samples per cycle', trim(d.fs / d.fsig, 3)]
      ];
      if (level === 'foundation') {
        // exactly two samples a cycle is the boundary, not a comfortable pass:
        // land on the zero crossings and you record nothing at all
        const per = d.fs / d.fsig;
        rows.push(['Enough?', per > 2.05 ? 'yes' : (per >= 2 ? 'only just' : 'too few'),
                   per < 2.05]);
      } else {
        rows.push(['Levels available', d.levels.toLocaleString('en-GB')]);
      }
      p.readouts.innerHTML = ro(rows);
      return {};
    },

    /** Time and frequency together, with the Nyquist line and the alias. */
    spectrum(ctx) {
      const { p, d, t, level, values, Plot, swatch, ro, Fmt } = ctx;
      const { eng, trim } = Fmt;

      const cap = capture(values, 4096);
      const sp = DSP.spectrum(level === 'foundation' ? cap.raw : cap.quant, d.fs, { floor: -110 });
      const pts = [];
      for (let i = 1; i < sp.bins; i++) pts.push({ x: sp.freq[i], y: sp.db[i] + 110 });

      const marks = [{ x: d.nyquist, colour: t.marker }];
      Plot.draw(p.graph, {
        xRange: [0, d.fs / 2], xFmt: x => eng(x, 'Hz', 3), tokens: t,
        left: { max: 115, fmt: y => Math.round(y - 110) + ' dB' },
        traces: [{ pts: pts, colour: t.trace, fill: t.fill, axis: 'left', width: 1.4 }],
        marks: marks,
        cursor: { x: d.alias, colour: t.phase,
                  label: (d.aliased ? 'alias at ' : 'tone at ') + eng(d.alias, 'Hz', 4) }
      });
      p.legend.innerHTML = swatch(t.trace, 'What the converter reports') +
        swatch(t.phase, d.aliased ? 'Where the tone came back' : 'The tone') +
        swatch(t.marker, 'Nyquist, half the sample rate');

      p.readouts.innerHTML = ro([
        ['Tone put in', eng(d.fsig, 'Hz', 4)],
        ['Nyquist limit', eng(d.nyquist, 'Hz', 4)],
        ['Comes back at', eng(d.alias, 'Hz', 4), d.aliased],
        [d.aliased ? 'Verdict' : 'Noise floor',
         d.aliased ? 'wrong frequency' : eng(d.snr, 'dB', 3), d.aliased]
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
        intermediate: ['quantisation', 'bit depth'],
        full: ['Nyquist', 'Nyquist rate', 'aliasing', 'anti-alias filter', 'spectrum']
      },
      panel: { foundation: 'sampling', intermediate: 'sampling', full: 'spectrum' },
      noSchematic: true,
      heading: {
        foundation: 'Measuring a signal over and over',
        intermediate: 'How often, and how finely',
        full: 'Sampling too slowly, and the tone that was never there'
      },
      lead: {
        foundation: 'Start by watching the measurements being taken.',
        intermediate: 'Two controls decide how close the copy is. Change one at a time.',
        full: 'Everything is fine until the signal goes above half the sample rate. Then it stops being fine in a way that cannot be undone.'
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
        full: 'The first line says where the limit is. The second says where a tone above it will reappear.'
      },
      workNote: {
        foundation: 'No arithmetic at this level. What matters is the picture: the smooth line is the signal, the dots are the measurements.',
        intermediate: 'Every extra bit halves the step and buys about 6 dB. Drag the bit depth down to 3 or 4 and the staircase becomes obvious.',
        full: 'Note what the second line does not depend on: nothing about the signal itself survives. Once a tone has folded back there is no way to tell it from a real one at that frequency, which is why the filter has to come before the converter and not after it.'
      },
      explain: {
        foundation: [
          'The smooth line is the signal arriving at the radio. The dots are the moments when the converter measures it and writes the answer down.',
          'Speed the measurements up and the dots crowd together, so the list of numbers describes the signal more closely. Slow them down and the dots grow far apart, and you start to lose the shape between them.',
          'That is the whole idea. An analogue signal is smooth and continuous. A digital one is a list of measurements taken at a steady rate, sometimes called a number stream.'
        ],
        intermediate: [
          'The orange staircase is what the converter actually holds. It can only store one of a fixed set of levels, so each measurement is rounded to the nearest one and the difference is thrown away.',
          'Drag the bit depth down and the steps get coarse. That rounding error is quantisation error, and it is a form of distortion: what comes out is not quite the shape that went in. On a spectrum it shows as an added noise floor, and you will meet both words for it.',
          'Now drag the sample rate. More samples a second follows the shape more closely. The two controls improve different things, which is why a converter is specified by both. Pushing either one up costs money, and it costs processing as well: more samples a second, with more digits in each, is more arithmetic for whatever has to handle the result. A real design settles on enough of each rather than the most of either.',
          'Bit depth also goes by the name resolution, and you will meet both words. They mean the same thing: how finely each measurement can be recorded.'
        ],
        full: [
          'Turn the limit round and it becomes a design rule: sample at a little over twice the highest frequency you intend to capture. Note highest, not bandwidth. A signal running from 20 Hz to 14 kHz needs more than 28k samples a second, because what matters is the 14 kHz, not the roughly 14 kHz of width between the two.',
          'Two similar names are worth keeping apart. The Nyquist frequency is half a given sample rate, and it is the line on the display. The Nyquist rate is the minimum sample rate for a given signal, twice its highest frequency. One is a property of the converter, the other of the signal.',
          'Push the signal past the Nyquist line and watch the spectrum. The tone does not disappear and it does not stay put: it folds back and appears somewhere below the line instead.',
          'A 5 kHz tone sampled at 8 kHz comes back at 3 kHz. Nothing downstream can tell that apart from a real 3 kHz tone, because by then they are the same list of numbers.',
          'There is a neater way to see where it lands. The tone reflects about the Nyquist line: it comes back as far below the line as it started above it. 5 kHz is 1 kHz above the 4 kHz line, so it returns 1 kHz below, at 3 kHz. Subtracting from the sample rate gives the same answer, but the reflection is the one that stays with you.',
          'This is why an anti-alias filter goes in front of the converter. Once the folding has happened it cannot be undone, so the only cure is to stop it arriving.',
          'In practice you sample comfortably faster than twice, not exactly twice. A real filter does not stop dead at its cut-off, it rolls off over a range, so a little of what lies above still gets through. Leaving headroom between the highest wanted frequency and the Nyquist line gives the filter room to do its work.'
        ]
      }
    },

    {
      code: '2F2',
      levels: ['foundation', 'full'],
      toggle: {
        label: 'Signal',
        levels: ['full'],
        options: [['fundamental', 'Sine alone'], ['second', 'Plus 2nd'],
                  ['third', 'Plus 3rd'], ['both', 'Plus both']]
      },
      introduces: {
        foundation: ['ADC', 'DAC'],
        full: ['Fourier transform', 'time domain', 'frequency domain', 'harmonic']
      },
      panel: { foundation: 'chain', full: 'composite' },
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
        foundation: 'The device that takes the measurements is an analogue to digital converter, an ADC. On its own it only produces numbers, so something with computing power has to follow it to turn those numbers back into sound.',
        full: 'The display is a real transform of the samples, not a drawing. Every point on it was calculated from the block of numbers the converter produced.'
      },
      explain: {
        foundation: [
          'Follow the path across the panel. A smooth signal arrives from the aerial. The analogue to digital converter, almost always shortened to ADC, measures it over and over and hands on a stream of numbers. That is the doorway between the aerial and the software.',
          'An ADC on its own does nothing useful. It produces a stream of numbers, and something with computing power has to follow it to do the filtering, demodulating and everything else a receiver needs.',
          'At the far end the process runs backwards. A digital to analogue converter, a DAC, turns the numbers back into a smoothly changing voltage you can feed to a loudspeaker. Between the two, the signal spends its whole life as numbers.',
          'There are two reasons for going to all this trouble. Anything done in software can be changed by updating the software, which is not true of a circuit built from parts. And numbers survive noise: if you know the signal can only be one of a set of values, you can still tell which one it was meant to be even when it arrives untidy.',
          'That is what makes a software defined radio different. The work that used to be done by tuned circuits and detectors is done by arithmetic instead.'
        ],
        full: [
          'A signal can be described two ways: as a value changing over time, or as a set of frequencies with a size each. Both describe the same thing.',
          'A pure sine wave is a single line on the frequency display. Anything that is not a pure sine has more lines, and if the extra ones sit at whole multiples of the first they are called harmonics. A sine with a harmonic added still repeats at the lower of the two frequencies, but the shape is no longer a clean sine, which is how you spot it in the time domain.',
          'The Fourier transform is the arithmetic that gets you from one to the other. Give it a block of samples taken over time and it returns how much of each frequency was in them.',
          'The two displays above are one signal. Add a harmonic and watch both change together: a new line appears on the right, and the shape on the left stops being a clean sine while still repeating at the same rate.',
          'That is how you tell them apart by eye. The repetition rate follows the fundamental, so the wave still repeats at the lower frequency, but the shape is no longer a plain sine. It is also what the waterfall on an SDR is doing, over and over, many times a second.'
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
      why: 'The rule is twice the highest frequency present, not twice the bandwidth and not twice the lowest. The highest here is 14 kHz, so anything from 28k samples a second upwards will do, and 30k is the lowest offered that clears it.',
      working: ['minimum rate = 2 &times; highest frequency',
                '= 2 &times; 14 kHz',
                '= 28k samples/s, so 30k is the lowest that works'],
      source: { eq: ['rule'], from: ['2F1'] },
      seed: { fsig: 14000, fs: 30000 },
      seedNote: 'Set the bench to a 14 kHz tone sampled at 30k and watch it stay where it should. Drag the rate below 28k and it starts to fold.'
    },
    '2025-Full6019': {
      why: 'Once a frequency above the limit has been sampled it has already folded down, and it now looks exactly like a real signal at the lower frequency. Nothing after the converter can separate them. The filter has to remove it before it is ever measured.',
      source: { eq: ['alias'], from: ['2F1'] },
      seedNote: 'Push the signal above the Nyquist line on the bench. Notice there is no way to tell the folded tone from a genuine one at that frequency.'
    },
    '2025-Full7395': {
      why: 'Aliasing is caused by frequencies arriving that are higher than half the sample rate. Option B has it backwards, and option D describes oversampling, which is the safe direction.',
      working: ['a tone folds when f &gt; sample rate / 2',
                '12 kHz is above the 8 kHz limit of a 16k rate',
                'so it returns at 16 kHz &minus; 12 kHz = 4 kHz',
                'that is higher analogue frequencies arriving than the converter can accept'],
      source: { eq: ['nyq', 'alias'], from: ['2F1'] },
      seed: { fsig: 12000, fs: 16000 },
      seedNote: 'A 12 kHz tone sampled at 16k folds back to 4 kHz. Set the bench to it and read the spectrum.'
    },
    '2025-Full7645': {
      why: 'Sampling at 80M samples a second puts the folding point at 40 MHz, so anything still getting through above that comes back inside the wanted range. That rules out two of the four. Of the two left, the better one is whichever keeps the most spectrum while still being well down by 40 MHz, because a filter that closes too early throws away band you could have used.',
      source: { eq: ['nyq'], from: ['2F1'] },
      working: ['folding point = 80M samples/s / 2 = 40 MHz',
                'responses 3 and 4 are still at full output at 40 MHz, so both fold back',
                'response 1 is well clear by 40 MHz but gives up everything above 20 MHz',
                'response 2 is around 60 dB down by 40 MHz and still passes to 30 MHz']
    },
    '2025-Full7401': {
      why: 'The transform takes a block of samples and reports how much of each frequency was in them, which is what puts the signals in frequency order. Option A describes a transformer, option C a data demodulator and option D the quadrature mixing that produces I and Q.',
      source: { from: ['2F2'] },
      seedNote: 'The lower display on this bench is a real transform of the samples above it.'
    },
    '2025-Full7686': {
      source: { from: ['2F2'] },
      why: 'A spectrum shows how much of each frequency is present and says nothing about where in its cycle each one starts. Two waveforms can therefore look quite different and still give the same spectrum, which is why this question has two right answers rather than one.',
      working: ['the two peaks sit at about 1.5 MHz and 4.5 MHz',
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
      'Two ideas, then. Sampling is measuring a signal over and over at a steady rate, and an ADC is the part that does it. Everything a software radio does afterwards works on those numbers.'
    ],
    intermediate: [
      'Sample rate and bit depth are separate controls solving separate problems. Rate decides how much of the shape you keep. Depth decides how finely each measurement is recorded, and every bit is worth about 6 dB.'
    ],
    full: [
      'The Nyquist limit is not a guideline. Below it sampling loses nothing that matters; above it the converter reports a frequency that was never present, and no amount of processing afterwards can separate it from a real one.',
      'That is the whole argument for the anti-alias filter, and it is why it belongs in front of the converter rather than anywhere else in the chain.'
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
