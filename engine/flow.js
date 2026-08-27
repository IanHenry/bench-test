/*
 * flow.js - animated charge movement over a schematic.
 *
 * Dots on the wires so you can see where the current goes. Showing current as
 * moving charge is a long standing convention in circuit teaching tools; this
 * is written from our own solver and no other implementation was consulted.
 *
 * We solve a phasor rather than stepping a time domain simulation, so the
 * instantaneous current in any branch is just
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
 */

const SPACING = 17;      // gap between dots, in layout units
const MAX_SWING = 15;    // largest excursion drawn, in layout units

function magOf(c) { return c ? Math.hypot(c.re, c.im) : 0; }
function argOf(c) { return c ? Math.atan2(c.im, c.re) : 0; }

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

/**
 * flow = {
 *   phase,                  // wt, advanced by the caller
 *   currents: { name: {re,im} },
 *   iMax,                   // largest |I| in the circuit, for scaling
 *   colour
 * }
 * A wire carries the current of whichever element the layout names in its
 * fifth slot: [x1, y1, x2, y2, 'R1']. Positive runs from the first point to
 * the second, so a wire on the return leg names the element and is drawn
 * with its endpoints in the direction the current actually flows.
 */
function draw(ctx, layout, flow, span) {
  if (!flow || !flow.iMax) return;
  const swing = name => {
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
    const shown = Math.pow(m, 0.32);
    // integrating cos gives sin, so the charge lags the current by 90 degrees
    return { off: MAX_SWING * shown * Math.sin(flow.phase + argOf(I)),
             intensity: Math.max(0.18, Math.min(1, shown)) };
  };

  for (const el of layout.elements) {
    if (el.type === 'V') continue;          // the source body is not a wire run
    // a coupling capacitor is a short to the signal and so is absent from the
    // netlist, but it still carries a current, named here by el.flow
    const s = swing(el.flow || el.name);
    if (!s) continue;
    const [x1, y1, x2, y2] = endpoints(el, span);
    dotsAlong(ctx, x1, y1, x2, y2, s.off, s.intensity, flow.colour);
  }

  for (const w of (layout.wires || [])) {
    if (w.length < 5) continue;
    const s = swing(w[4]);
    if (!s) continue;
    dotsAlong(ctx, w[0], w[1], w[2], w[3], s.off, s.intensity, flow.colour);
  }
}

const API = { draw, magOf, argOf, SPACING, MAX_SWING };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.Flow = API;
