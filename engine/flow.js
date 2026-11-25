/*
 * flow.js - animated charge movement over a schematic.
 *
 * Dots on the wires so you can see where the current goes. Showing current as
 * moving charge is a long standing convention in circuit teaching tools; this
 * is written from our own solver and no other implementation was consulted.
 *
 * Three modes, because three kinds of current turn up in the syllabus.
 *
 * 'ac' (the default). We solve a phasor rather than stepping a time domain
 * simulation, so the instantaneous current in any branch is just
 *
 *     i(t) = |I| cos(wt + arg I)
 *
 * and the dots move with it. That gets one thing right that a streaming
 * animation gets wrong: on AC the charge does not travel anywhere, it sloshes
 * back and forth. It also makes phase visible. In a series circuit every dot
 * moves together. In a parallel tuned circuit the L and C dots move in
 * opposite directions, which is the circulating current the syllabus talks
 * about and is hard to picture from a page.
 *
 * Positions come from integrating the current, so the excursion is
 * proportional to |I| / w and peaks a quarter cycle after the current does.
 * The scale is arbitrary and chosen to be visible: what carries meaning is
 * the relative size between branches and the relative timing.
 *
 * 'dc'. A steady current, so the charge drifts one way at a steady speed in
 * proportion to the current in its branch: currents are plain numbers in
 * amperes, and the sign says which way. Because the dots are evenly spaced
 * on every run, speed in proportion to current is what makes the charge
 * arriving at a junction equal the charge leaving it, which is Kirchhoff's
 * current law made visible. compress: true trades that for visibility when
 * branch currents span orders of magnitude.
 *
 * 'time'. The current follows a function of time, for a capacitor or an
 * inductor charging and discharging. currents is then a function of circuit
 * time in seconds returning { name: amperes }, and duration is the circuit
 * time one pass of the animation covers. Each dot's position is the charge
 * that has passed so far, the integral of that current, so the dots rush at
 * the switch and creep to a halt as the capacitor fills. Passes join without
 * a jump: each completed pass carries the charge it moved into the next.
 */

const SPACING = 17;      // gap between dots, in layout units
const MAX_SWING = 15;    // largest excursion drawn on AC, in layout units
const DRIFT = 36;        // drift speed at the largest current, layout units per second
const LOOP = 6;          // seconds on screen for one pass of a time series
const CURRENT = '#FD7E14';  // --q-i, used when a caller passes no colour
const STEPS = 240;       // integration steps for the charge in a time series

function magOf(c) { return c ? Math.hypot(c.re, c.im) : 0; }
function argOf(c) { return c ? Math.atan2(c.im, c.re) : 0; }
/** A current given either as a number or as a phasor, as a real number. */
function realOf(c) { return typeof c === 'number' ? c : (c ? c.re : 0); }

/**
 * Dots along one straight run.
 * offset shifts them along the run; intensity 0..1 sets size and opacity.
 */
function dotsAlong(ctx, x1, y1, x2, y2, offset, intensity, colour) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1 || intensity <= 0.01) return;
  const ux = dx / len, uy = dy / len;

  ctx.fillStyle = colour;
  ctx.globalAlpha = 0.35 + 0.55 * intensity;
  const r = 1.6 + 1.5 * intensity;

  // start below zero so a dot is always entering the run
  let s = ((offset % SPACING) + SPACING) % SPACING - SPACING;
  for (; s < len; s += SPACING) {
    if (s < 0) continue;
    ctx.beginPath();
    ctx.arc(x1 + ux * s, y1 + uy * s, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** Endpoints of an element, given its centre, rotation and span. */
function endpoints(el, span) {
  const rad = (el.rot || 0) * Math.PI / 180;
  const dx = Math.cos(rad) * span / 2, dy = Math.sin(rad) * span / 2;
  return [el.at[0] - dx, el.at[1] - dy, el.at[0] + dx, el.at[1] + dy];
}

/*
 * The runs an element's charge is drawn along. The schematic engine knows
 * where every symbol's terminals are, the transformer's four included, so it
 * is asked; this fallback covers the two terminal parts when it is absent.
 */
function runsOf(el, span) {
  const S = (typeof window !== 'undefined' && window.Schematic) ||
            (typeof require === 'function' ? require('./schematic.js') : null);
  if (S && S.runs) return S.runs(el, true);
  if (el.type === 'V' || el.type === 'B') return [];
  const [x1, y1, x2, y2] = endpoints(el, span);
  const name = el.flow || el.name;
  return el.flowReversed ? [[x2, y2, x1, y1, name]] : [[x1, y1, x2, y2, name]];
}

/** Compressive scaling: keeps a small current moving, and moving less. */
const squash = m => Math.pow(m, 0.32);

/*
 * Charge passed by every current in a time series, from 0 to tau, by the
 * trapezium rule. One call evaluates the function STEPS + 1 times for all
 * branches together, which is cheap enough to do every frame.
 */
function chargeTo(fn, tau) {
  const q = {};
  if (!(tau > 0)) return q;
  const h = tau / STEPS;
  let prev = fn(0) || {};
  for (let k = 1; k <= STEPS; k++) {
    const cur = fn(k * h) || {};
    for (const n of Object.keys(cur)) {
      q[n] = (q[n] || 0) + 0.5 * h * (realOf(prev[n]) + realOf(cur[n]));
    }
    prev = cur;
  }
  return q;
}

// a whole pass, worked out once per function and duration
const passCache = (typeof WeakMap !== 'undefined') ? new WeakMap() : null;
function chargePerPass(fn, duration) {
  const hit = passCache && passCache.get(fn);
  if (hit && hit.duration === duration) return hit.q;
  const q = chargeTo(fn, duration);
  if (passCache) passCache.set(fn, { duration, q });
  return q;
}

/**
 * Where a time series is, for a flow object: the circuit time tau inside the
 * current pass, how many passes are complete, and the screen seconds a pass
 * takes. The page reads tau to say what moment the dots are showing.
 */
function timeOf(flow) {
  const loop = flow.loop || LOOP;
  const time = Math.max(0, flow.time || 0);
  const passes = Math.floor(time / loop);
  return { tau: (time - passes * loop) / loop * flow.duration, passes, loop };
}

/**
 * Largest current a time series reaches over one pass, among the names
 * given (all of them when names is empty), sampled finely enough for any
 * exponential the syllabus asks about.
 */
function peakOf(fn, duration, names) {
  let peak = 0;
  for (let k = 0; k <= 400; k++) {
    const cur = fn(duration * k / 400) || {};
    for (const n of Object.keys(cur)) {
      if (names && names.size && !names.has(n)) continue;
      peak = Math.max(peak, Math.abs(realOf(cur[n])));
    }
  }
  return peak;
}

/**
 * flow = {
 *   mode,                   // 'ac' (default), 'dc' or 'time'
 *   phase,                  // ac: wt, advanced by the caller
 *   time,                   // dc and time: seconds of animation so far
 *   currents,               // ac: { name: {re,im} }; dc: { name: amperes };
 *                           // time: t => ({ name: amperes })
 *   duration, loop,         // time: circuit seconds per pass, screen seconds per pass
 *   charge,                 // time, optional: t => ({ name: coulombs }) passed since
 *                           // t = 0, exact where the integral is known
 *   iMax,                   // largest current drawn, for scaling
 *   compress,               // dc and time: scale speed compressively
 *   hideStill,              // time: a branch carrying nothing at this moment
 *                           // draws no dots, so only what conducts is seen
 *                           // (a rectifier's diodes); off by default
 *   colour
 * }
 * A wire carries the current of whichever element the layout names in its
 * fifth slot: [x1, y1, x2, y2, 'R1']. Positive runs from the first point to
 * the second, so a wire on the return leg names the element and is drawn
 * with its endpoints in the direction the current actually flows.
 */
function draw(ctx, layout, flow, span) {
  if (!flow || !flow.iMax) return;
  // moving charge is current, and current is orange everywhere (--q-i)
  if (!flow.colour) flow = Object.assign({}, flow, { colour: CURRENT });
  const mode = flow.mode || 'ac';
  let swing;

  if (mode === 'dc') {
    const time = flow.time || 0;
    swing = name => {
      const I = realOf(flow.currents[name]);
      const m = Math.abs(I) / flow.iMax;
      if (!isFinite(m) || m <= 0) return null;
      const speed = flow.compress ? squash(m) : m;
      return { off: Math.sign(I) * DRIFT * speed * time,
               intensity: Math.max(0.18, Math.min(1, squash(m))) };
    };
  } else if (mode === 'time') {
    const fn = flow.currents;
    if (typeof fn !== 'function' || !(flow.duration > 0)) return;
    const { tau, passes, loop } = timeOf(flow);
    const now = fn(tau) || {};
    // the charge passed so far: the panel's closed form when it gives one,
    // which is exact, otherwise the current integrated numerically
    const qOf = typeof flow.charge === 'function'
      ? (t => flow.charge(t) || {}) : (t => chargeTo(fn, t));
    const qNow = qOf(tau);
    const qPass = !passes ? {} : typeof flow.charge === 'function'
      ? qOf(flow.duration) : chargePerPass(fn, flow.duration);
    // layout units moved per coulomb, so that the largest current drifts at
    // DRIFT on screen; a pass of `duration` circuit seconds takes `loop` seconds
    const perCoulomb = DRIFT * loop / (flow.duration * flow.iMax);
    swing = name => {
      if (!(name in now) && !(name in qNow)) return null;
      const m = Math.abs(realOf(now[name])) / flow.iMax;
      const q = passes * (qPass[name] || 0) + (qNow[name] || 0);
      if (!isFinite(m) || (m <= 0 && !q)) return null;
      if (flow.hideStill && m <= 0) return null;
      // compress acts on the distance moved, which keeps the order of branches
      const off = flow.compress
        ? Math.sign(q) * DRIFT * loop * squash(Math.abs(q) / (flow.duration * flow.iMax))
        : q * perCoulomb;
      return { off, intensity: m > 0 ? Math.max(0.18, Math.min(1, squash(m))) : 0.18 };
    };
  } else {
    swing = name => {
      const I = flow.currents[name];
      const m = magOf(I) / flow.iMax;
      if (!isFinite(m) || m <= 0) return null;
      /*
       * Currents in one circuit can differ by four orders of magnitude: a base
       * carries microamps while its collector carries hundreds of milliamps.
       * Scaling the movement linearly against the largest makes every other
       * branch sit perfectly still, which reads as a broken animation rather
       * than as a small current. Compressing the scale keeps the ordering
       * visible, so a smaller current still moves and still moves less.
       */
      const shown = squash(m);
      // integrating cos gives sin, so the charge lags the current by 90 degrees
      return { off: MAX_SWING * shown * Math.sin(flow.phase + argOf(I)),
               intensity: Math.max(0.18, Math.min(1, shown)) };
    };
  }

  for (const el of layout.elements) {
    // A coupling capacitor is a short to the signal and so is absent from the
    // netlist, but it still carries a current, named here by el.flow. A part
    // drawn the other way round from the current it is named for, such as a
    // reverse biased diode, says so with flowReversed, and its dots run from
    // its second end to its first.
    for (const [x1, y1, x2, y2, name] of runsOf(el, span)) {
      const s = name ? swing(name) : null;
      if (!s) continue;
      dotsAlong(ctx, x1, y1, x2, y2, s.off, s.intensity, flow.colour);
    }
  }

  for (const w of (layout.wires || [])) {
    if (w.length < 5) continue;
    const s = swing(w[4]);
    if (!s) continue;
    dotsAlong(ctx, w[0], w[1], w[2], w[3], s.off, s.intensity, flow.colour);
  }
}

const API = { draw, timeOf, peakOf, chargeTo, magOf, argOf, realOf,
              SPACING, MAX_SWING, DRIFT, LOOP };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.Flow = API;
