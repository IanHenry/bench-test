/*
 * content/2I.js - Semiconductor devices.
 *
 * The flagship of the technical syllabus. Amplifier classes are usually shown
 * as three fixed pictures and a table of efficiencies. They are not three
 * things: they are one control, moved. Bias the device high and it conducts
 * for the whole cycle. Lower the bias and it starts switching off for part of
 * it, the efficiency climbs, and the harmonics arrive to pay for it.
 *
 * Nothing here quotes 50% or 78.5%. Those numbers are computed from the
 * Fourier coefficients of the truncated sine the device actually passes, so
 * the display derives what a textbook tabulates.
 */

const DC = window.DC;
const DSPI = window.DSP;
const FI = window.Fmt;
const MI = window.MNA;
// only the starting point now; the supply is a control, because worked
// designs are commonly built around a 10V rail and a reader ought to be able
// to follow one through on the bench
const VCC = 12;
const VBE = 0.6;              // the base to emitter drop of a conducting silicon junction

/*
 * The operating point. The exam's quick method takes the base voltage from
 * the divider as if nothing drew on it (vth below); that is only true when
 * the divider carries ten or more times the base current. The point itself
 * is worked properly: the divider seen from the base is vth behind R1 and R2
 * in parallel, and the base current flows through that as well as through
 * the emitter resistor, scaled up by beta + 1. Push the base hard enough and
 * the stage saturates; dc.js solves that state rather than letting beta carry
 * the collector current past what the resistors can pass.
 */
const VSAT = 0.2;             // collector to emitter of a saturated transistor
function bias(v) {
  const b = DC.dividerBias(v.vcc || VCC, v.r1, v.r2, v.rc, v.re, v.beta,
                           { vbe: VBE, vsat: VSAT });
  b.conducting = b.state !== 'cut off';
  return b;
}

/*
 * The field effect devices on the 2I3 panel. Typical small signal figures,
 * held fixed so that the controls only move the circuit around them. The
 * dual gate MOSFET is modelled as what it is inside, two depletion devices in
 * series sharing one channel current.
 */
const FET_IDSS = 8e-3, FET_VP = -3;
const DG_IDSS = 10e-3, DG_VP = -2;
const DG_RG = 1e6;            // gate 1 returned to ground through this

// The 2I3 device toggle reaches the working as d.device. Anywhere it is not
// set, the stage is the NPN the controls describe.
function bipolar(d) {
  return !d.device || d.device === 'npn' || d.device === 'pnp';
}

function fetPoint(v) {
  return DC.fetDividerBias(v.vcc || VCC, v.r1, v.r2, v.rc, v.re, FET_IDSS, FET_VP);
}
function dualGatePoint(v, vg1, vsFixed) {
  const vcc = v.vcc || VCC;
  return DC.dualGateBias({ vcc: vcc, vg1: vg1 || 0, vg2: vcc * v.r2 / (v.r1 + v.r2),
                           rd: v.rc, rs: v.re, idss: DG_IDSS, vp: DG_VP, vs: vsFixed });
}

/*
 * Symbols the shared schematic engine does not draw: a PNP transistor, an n
 * channel JFET and a dual gate MOSFET. Each is laid out as a three terminal
 * device (type 'Q', so both circuit checkers treat its pins exactly as they
 * treat the NPN's) with a `kind` that says what to draw. The gate, the upper
 * lead and the lower lead sit where the NPN's base, collector and emitter do.
 * Gate 2 of the dual gate device leaves from the top left and lands on a
 * junction the layout makes with two wires, so the checker still proves it is
 * joined.
 */
const DEVICE = {
  pnp(ctx) {
    ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-4, -13); ctx.lineTo(-4, 13); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-30, 0); ctx.lineTo(-4, 0); ctx.stroke();
    // emitter on top, its arrow pointing in towards the base: that is PNP
    ctx.beginPath(); ctx.moveTo(-4, -8); ctx.lineTo(12, -20); ctx.lineTo(12, -32); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-4, 8); ctx.lineTo(12, 20); ctx.lineTo(12, 32); ctx.stroke();
    const dx = 16, dy = -12, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
    const ax = 0.5, ay = -11;        // tip near the bar, pointing back along the lead
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax + ux * 7 - uy * 3.4, ay + uy * 7 + ux * 3.4);
    ctx.lineTo(ax + ux * 7 + uy * 3.4, ay + uy * 7 - ux * 3.4);
    ctx.closePath(); ctx.fillStyle = ctx.strokeStyle; ctx.fill();
  },
  njfet(ctx) {
    ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(4, -15); ctx.lineTo(4, 15); ctx.stroke();       // channel
    ctx.beginPath(); ctx.moveTo(4, -10); ctx.lineTo(12, -10); ctx.lineTo(12, -32); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(4, 10); ctx.lineTo(12, 10); ctx.lineTo(12, 32); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-30, 0); ctx.lineTo(4, 0); ctx.stroke();        // gate
    // n channel: the gate arrow points in, towards the channel
    ctx.beginPath(); ctx.moveTo(3, 0); ctx.lineTo(-5, -3.6); ctx.lineTo(-5, 3.6);
    ctx.closePath(); ctx.fillStyle = ctx.strokeStyle; ctx.fill();
  },
  dgmos(ctx, u) {
    ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(6, -16); ctx.lineTo(6, 16); ctx.stroke();       // channel, solid: depletion
    ctx.beginPath(); ctx.moveTo(6, -12); ctx.lineTo(12, -12); ctx.lineTo(12, -32); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(6, 12); ctx.lineTo(12, 12); ctx.lineTo(12, 32); ctx.stroke();
    // substrate tied to the source, arrow in for n channel
    ctx.beginPath(); ctx.moveTo(12, 12); ctx.lineTo(12, 0); ctx.lineTo(8, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(6.5, 0); ctx.lineTo(11, -2.8); ctx.lineTo(11, 2.8);
    ctx.closePath(); ctx.fillStyle = ctx.strokeStyle; ctx.fill();
    // two insulated gates: gate 1 beside the source end, gate 2 beside the drain
    ctx.beginPath(); ctx.moveTo(1, 3); ctx.lineTo(1, 15); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(1, -15); ctx.lineTo(1, -3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-30, 0); ctx.lineTo(-10, 0); ctx.lineTo(-10, 9); ctx.lineTo(1, 9); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(1, -9); ctx.lineTo(-14, -9); ctx.lineTo(-14, -40); ctx.stroke();
    // labels clear of every lead: G1 below its lead, G2 left of its own, at
    // 15 px on screen whatever the drawing's scale (u is layout units per px)
    ctx.font = '600 ' + (LABEL_PX * (u || 1)) + 'px ' + (ctx._labelFont || 'sans-serif');
    ctx.fillStyle = ctx._labelInk || ctx.strokeStyle;
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText('G1', -24, 12);
    ctx.textBaseline = 'middle';
    ctx.fillText('G2', -19, -28);
  }
};
const LABEL_PX = 15;          // nothing on a circuit smaller than this, as on a plot
// where gate 2 of a dual gate device leaves its symbol, relative to its centre
const DG_G2 = [-14, -40];

/*
 * Colours. Every line is the colour of the quantity it shows (README,
 * "Colours"): a current orange, a voltage blue, a capacitance purple, the
 * resistor's own line dark, a cursor or mark neutral. Two lines of one
 * quantity are told apart by dashing the second or tinting a family, never
 * by a new hue. A dashed trace here is the same points broken into short
 * runs, about 8 px on and 5 px off at whatever width the graph is drawn
 * (written before the plot engine took `dash`; it draws the same thing).
 */
function dashTrace(tr, canvas, xRange) {
  const [a, b] = xRange;
  const px = Math.max(120, ((canvas && canvas.clientWidth) || 600) - 150);
  const per = (b - a) * 13 / px;
  const runs = [];
  let run = null;
  for (const q of tr.pts) {
    const ph = ((q.x - a) / per) % 1;
    if (ph < 8 / 13) {
      if (!run) { run = Object.assign({}, tr, { pts: [], fill: null }); runs.push(run); }
      run.pts.push(q);
    } else {
      run = null;
    }
  }
  return runs;
}
// a legend swatch drawn dashed, for a dashed trace or a dashed mark
const dashed = c => 'repeating-linear-gradient(90deg,' + c + ' 0 4px,transparent 4px 7px)';
// the same hue, lighter, for a family of curves behind the one that matters
function tint(c, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(c || '').trim());
  if (!m) return c;
  const n = parseInt(m[1], 16);
  return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}

/*
 * Circuit size and labels. The template's 230 px canvas drew these circuits
 * at about three quarters scale, and the engine's 13 px labels with them, so
 * they came out between 9 and 13 px. Each panel now makes its circuit canvas
 * tall enough to draw at SCHEM_SCALE where the column is wide enough (the
 * column is widened by circuitColumn below), and the labels are drawn here at
 * 15 px on screen whatever the scale, in place of the engine's.
 */
const SCHEM_SCALE = 1.4;
function sizeStage(p, layout, twoPlots) {
  const cv = p.schem;
  if (!cv || !layout || !cv.style) return;
  const cw = cv.clientWidth || 300;
  const s = Math.min(SCHEM_SCALE, (cw - 32) / layout.w);
  const h = Math.max(230, Math.round(s * layout.h + 32));
  cv.style.height = h + 'px';
  // side by side, the graph is given the circuit's height; stacked on a
  // narrow screen, a graph of two plots is given room for both scales
  const side = typeof window !== 'undefined' && window.matchMedia &&
    window.matchMedia('(min-width:820px)').matches;
  if (p.graph && p.graph.style) {
    p.graph.style.height = side ? Math.max(h, twoPlots ? 360 : 0) + 'px' : (twoPlots ? '380px' : '');
  }
}

if (typeof window !== 'undefined' && window.Schematic && window.Schematic.draw &&
    !window.Schematic.draw.withDevices) {
  const plainDraw = window.Schematic.draw;
  const withDevices = function (canvas, layout, opts) {
    opts = opts || {};
    const special = (layout.elements || []).filter(e => e.kind && DEVICE[e.kind]);
    // the engine draws everything but the special devices, with no labels
    const rest = Object.assign({}, layout, {
      elements: layout.elements.filter(e => special.indexOf(e) < 0)
        .map(e => Object.assign({}, e, { label: ' ' })),
      terminals: (layout.terminals || []).map(x => Object.assign({}, x, { label: '' }))
    });
    plainDraw(canvas, rest, Object.assign({}, opts, { labels: {} }));
    // the engine leaves its context scaled into layout units, so the devices
    // land exactly where their pins were laid out
    const ctx = canvas.getContext('2d');
    const t = opts.tokens || {};
    const k = Math.min((canvas.clientWidth - 32) / layout.w, (canvas.clientHeight - 32) / layout.h);
    const u = 1 / Math.max(1e-6, k);             // layout units per screen pixel
    const px = LABEL_PX * u;
    const font = t.font || 'sans-serif';
    for (const el of special) {
      ctx.save();
      ctx.translate(el.at[0], el.at[1]);
      ctx.strokeStyle = t.wire || '#444';
      ctx.lineWidth = 1.6;
      ctx._labelFont = font; ctx._labelInk = t.ink;
      DEVICE[el.kind](ctx, u);
      ctx.restore();
    }
    // every label upright, where the engine would have put it
    for (const el of layout.elements) {
      const text = el.label === undefined ? el.name : el.label;
      if (!text || !String(text).trim()) continue;
      const hot = opts.highlight && opts.highlight.has(el.name);
      const own = el.type === 'R' ? t.r : el.type === 'L' ? t.l
                : (el.type === 'C' || el.type === 'CP') ? t.c : t.ink;
      ctx.fillStyle = hot ? (own || '#111') : (t.ink || '#111');
      ctx.font = (hot ? '700 ' : '600 ') + px + 'px ' + font;
      const [x, y] = el.at;
      if (el.type === 'Q') {
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(text, x + 26, y);
        continue;
      }
      const vertical = (el.rot || 0) % 180 !== 0;
      if (vertical) {
        const off = (el.type === 'M' || el.type === 'N') ? 24 : 20;
        const left = el.labelAt === 'left';
        ctx.textAlign = left ? 'right' : 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(text, x + (left ? -off : off), y);
      } else if (el.labelAt === 'below') {
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(text, x, y + 16);
      } else {
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText(text, x, y - 20);
      }
    }
    for (const term of (layout.terminals || [])) {
      ctx.fillStyle = t.soft || '#666';
      ctx.font = '600 ' + px + 'px ' + font;
      ctx.textAlign = term.align || 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(term.label, term.at[0] + (term.align === 'right' ? -8 : 8), term.at[1]);
    }
  };
  withDevices.withDevices = true;
  window.Schematic.draw = withDevices;
}

/*
 * Each configuration as a netlist the solver can handle. The transistor is a
 * resistance from base to emitter plus a current from collector to emitter
 * proportional to the voltage across it, which is the standard small signal
 * model and needs exactly one R and one G.
 *
 * The bias resistors are in the netlist too. To a signal the supply rail is
 * ground, so both of them sit across the input, and leaving them out would
 * flatter the input impedance badly.
 */
// Big enough that its reactance where we solve is small beside the emitter
// resistor it bypasses. Drawn, and in the circuit, so that the reader can see
// where the signal current actually goes instead of having to assume it.
const BYPASS = 470e-6;

// The collector current is not quite independent of collector voltage, and
// that slope is the transistor's own output resistance. Leaving it out made
// every configuration show the collector resistor as its output impedance,
// which hides the one difference between them that matters.
const EARLY = 100;

function configCircuit(kind, d) {
  const re = 0.026 / Math.max(1e-6, d.ic);         // the emitter's own resistance
  const rpi = Math.max(1, d.beta * re);
  const gm = 1 / re;
  const ro = EARLY / Math.max(1e-6, d.ic);        // and its own output resistance
  const F = window.Fmt;
  const R1 = F.sci(d.r1), R2 = F.sci(d.r2), RC = F.sci(d.rc), RE = F.sci(d.re);
  const nl = {
    // RC is written rail to collector: on a positive half cycle the load
    // feeds current into the collector node, and writing it the other way
    // round reported the collector current 180 degrees out.
    ce: `V1 in 0 1\nRS in b 50\nR1 b 0 ${R1}\nR2 b 0 ${R2}\nRpi b e ${F.sci(rpi)}\nG1 c e b e ${F.sci(gm)}\nRO c e ${F.sci(ro)}\nRE e 0 ${RE}\nCE1 e 0 ${F.sci(BYPASS)}\nRC 0 c ${RC}`,
    cc: `V1 in 0 1\nRS in b 50\nR1 b 0 ${R1}\nR2 b 0 ${R2}\nRpi b e ${F.sci(rpi)}\nG1 0 e b e ${F.sci(gm)}\nRO 0 e ${F.sci(ro)}\nRE e 0 ${RE}`,
    cb: `V1 in 0 1\nRS in e 50\nR1 b 0 ${R1}\nR2 b 0 ${R2}\nCB b 0 ${F.sci(BYPASS)}\nRpi b e ${F.sci(rpi)}\nG1 c e b e ${F.sci(gm)}\nRO c e ${F.sci(ro)}\nRE e 0 ${RE}\nRC 0 c ${RC}`
  }[kind];
  return {
    netlist: nl,
    inNode: kind === 'cb' ? 'e' : 'b',
    outNode: kind === 'cc' ? 'e' : 'c',
    load: kind === 'cc' ? 'RE' : 'RC',
    re: re, rpi: rpi, gm: gm, ro: ro,
    // what the bias network adds to the input, and what the collector load
    // adds to the output. Dropping those lines leaves the transistor alone.
    biasParts: kind === 'cb' ? ['R1', 'R2', 'RE'] : ['R1', 'R2']
  };
}

/* Measured off the solved circuit, not quoted. */
function measure(kind, d) {
  const M = window.MNA;
  const spec = configCircuit(kind, d);
  const ckt = M.parseNetlist(spec.netlist);
  const s = M.solveAt(ckt, 1000);

  const vin = M.abs(M.nodeV(s, spec.inNode));
  const vout = M.nodeV(s, spec.outNode);
  const iin = M.abs(M.currentThrough(s, 'RS'));
  const iout = M.abs(M.currentThrough(s, spec.load));

  // output impedance: kill the input and drive the output with a volt
  const drop = (netlist, names) => netlist.split('\n')
    .filter(l => !names.includes(l.split(' ')[0])).join('\n');
  const zoutOf = (netlist) => {
    const killed = netlist.replace(/^V1 in 0 1/, 'V1 in 0 0') +
                   '\nVT ' + spec.outNode + ' 0 1';
    const sO = M.solveAt(M.parseNetlist(killed), 1000);
    return 1 / Math.max(1e-12, M.abs(M.currentThrough(sO, 'VT')));
  };
  const zinOf = (netlist) => {
    const si = M.solveAt(M.parseNetlist(netlist), 1000);
    return M.abs(M.nodeV(si, spec.inNode)) /
           Math.max(1e-15, M.abs(M.currentThrough(si, 'RS')));
  };
  const zout = zoutOf(spec.netlist);

  // The resistances of the transistor itself are one thing and the loaded
  // figures another: circuit values modify them. Take the bias network off
  // and the load off the output, and what is left is the transistor's own.
  const zinDevice = zinOf(drop(spec.netlist, spec.biasParts));
  const zoutDevice = zoutOf(drop(spec.netlist, [spec.load]));

  const meta = {
    ce: { name: 'Common emitter',
          uses: 'The general purpose amplifier, wherever you want gain from a single device.',
          issue: 'It inverts, and the bias resistors sit across its input and drag the input impedance down.' },
    cc: { name: 'Emitter follower',
          uses: 'Driving a demanding load, or buffering a high impedance source so the next stage does not load it.',
          issue: 'No voltage gain at all. It cannot make a signal larger, only stronger.' },
    cb: { name: 'Common base',
          uses: 'VHF and above, where it stays stable at frequencies that would have a common emitter stage oscillating.',
          issue: 'A very low input impedance, so it loads whatever is driving it.' }
  }[kind];

  return Object.assign({
    circuit: ckt, spec: spec,
    zin: vin / Math.max(1e-15, iin),
    zout: zout,
    zinDevice: zinDevice,
    zoutDevice: zoutDevice,
    av: M.abs(vout) / Math.max(1e-15, vin),
    ai: iout / Math.max(1e-15, iin),
    // against the input node, not against the source, so that the small shift
    // through the coupling network does not leak into the figure
    phase: Math.round(Math.abs(((M.arg(vout) - M.arg(M.nodeV(s, spec.inNode))) *
      180 / Math.PI + 540) % 360 - 180))
  }, meta);
}

/*
 * The circuits as they are really built: a divider on the base, a collector
 * load, an emitter resistor, and a coupling capacitor at each end so that
 * whatever is connected outside cannot disturb the bias inside.
 *
 * Transistor centred at (180, 140), so base (150, 140), collector (192, 108),
 * emitter (192, 172). Every component terminal lands on a wire end or another
 * terminal; the layout checker enforces that, which is how the gaps in the
 * first version of these were found.
 */
function configLayout(kind) {
  const Q = { name: 'Q1', type: 'Q', at: [180, 140], label: '' };
  const supply = { at: [156, 12], label: '+V' };
  const W = 320, H = 268;

  // R1 from the rail to the base node, R2 from there to ground
  const R1 = { name: 'R1', type: 'R', at: [120, 48], rot: 270, label: 'R1', labelAt: 'left' };
  const R2 = { name: 'R2', type: 'R', at: [120, 170], rot: 90, label: 'R2', labelAt: 'left' };
  const RE = { name: 'RE', type: 'R', at: [192, 202], rot: 90, label: 'RE' };
  const RC = { name: 'RC', type: 'R', at: [192, 48], rot: 90, label: 'RC' };

  const rail = [120, 18, 192, 18, 'R1'];
  // nothing is connected to the output, so no signal current leaves through
  // C2 and the gain figures are the open circuit ones
  const openOutput = y => [[192, y, 220, y, '-'], [280, y, 292, y, '-']];
  const dividerWires = [
    [120, 78, 120, 140, 'R1'],          // R1 down to the base node
    [120, 140, 150, 140, 'Rpi'],        // into the base, at base current
    [120, 200, 120, 250, 'R2'],         // R2 down to the ground rail
    [120, 250, 192, 250, 'R2']
  ];

  if (kind === 'cc') {
    // emitter follower: collector to the rail, output from the emitter
    return {
      w: W, h: H,
      elements: [Q, R1, R2, RE,
        { name: 'C1', type: 'C', at: [90, 140], label: 'C1', flow: 'RS' },
        { name: 'C2', type: 'C', at: [250, 172], label: 'C2', flow: '-' }],
      wires: [rail].concat(dividerWires, openOutput(172), [
        [192, 18, 192, 108, 'G1'],
        [192, 232, 192, 250, 'RE']]),
      grounds: [[156, 250]],
      terminals: [{ at: [60, 140], label: 'in', align: 'right' },
                  { at: [292, 172], label: 'out' }, supply]
    };
  }

  if (kind === 'cb') {
    // common base: driven at the emitter, base held at signal ground by CB
    return {
      w: W, h: H,
      elements: [Q, R1, R2, RC, RE,
        { name: 'CB', type: 'C', at: [90, 170], rot: 90, label: 'CB', labelAt: 'left' },
        { name: 'C2', type: 'C', at: [250, 108], label: 'C2', flow: '-' }],
      wires: [rail].concat(dividerWires, openOutput(108), [
        [120, 140, 90, 140, 'CB'],      // the bypass sits across R2
        [90, 200, 120, 200, 'CB'],
        [192, 78, 192, 108, 'RC'],
        [60, 190, 192, 190, 'RS'],      // in, up to the emitter
        [192, 190, 192, 172, 'RS'],
        [192, 232, 192, 250, 'RE']]),
      grounds: [[156, 250]],
      terminals: [{ at: [60, 190], label: 'in', align: 'right' },
                  { at: [292, 108], label: 'out' }, supply]
    };
  }

  // common emitter: the standard stage
  return {
    w: W, h: H,
    elements: [Q, R1, R2, RC, RE,
      { name: 'C1', type: 'C', at: [90, 140], label: 'C1', flow: 'RS' },
      { name: 'C2', type: 'C', at: [250, 108], label: 'C2', flow: '-' },
      // the emitter bypass. Until this was drawn the sums assumed a part that
      // was not on the page, and showed a gain the circuit as drawn could not
      // produce.
      { name: 'CE1', type: 'C', at: [244, 202], rot: 90, label: 'CE' }],
    wires: [rail].concat(dividerWires, openOutput(108), [
      [192, 78, 192, 108, 'RC'],
      [192, 172, 244, 172, 'CE1'],
      [244, 232, 244, 250, 'CE1'],
      [244, 250, 192, 250, 'CE1'],
      [192, 232, 192, 250, 'RE']]),
    grounds: [[156, 250]],
    terminals: [{ at: [60, 140], label: 'in', align: 'right' },
                { at: [292, 108], label: 'out' }, supply]
  };
}

/*
 * 2I3 at Full: biasing the other devices. Each is drawn the way it is
 * normally built, and the sliders keep their meaning: R1 and R2 are the
 * divider the device takes its bias from, RC the load, RE the resistor in the
 * emitter or source.
 */

/*
 * PNP: the NPN stage turned upside down. The emitter resistor goes to the
 * positive rail and the load to ground, and the divider puts the base a fixed
 * fraction of the supply below the rail. Measured down from the rail every
 * figure is the NPN's, which is the point: same sums, opposite polarity.
 * In the small signal circuit the rail is ground, so the netlist is the
 * common emitter one; each part is written so that a to b runs the way the
 * signal current flows on the drawing.
 */
function pnpNetlist(d) {
  const F = window.Fmt;
  const ic = Math.max(1e-9, d.ic), gm = ic / 0.026;
  return 'V1 in 0 1\nRS in b 50\nR1 b 0 ' + F.sci(d.r1) + '\nR2 b 0 ' + F.sci(d.r2) +
    '\nRpi b e ' + F.sci(Math.max(1, d.beta / gm)) + '\nG1 c e b e ' + F.sci(gm) +
    '\nRO c e ' + F.sci(EARLY / ic) + '\nRE e 0 ' + F.sci(d.re) +
    '\nCE1 e 0 ' + F.sci(BYPASS) + '\nRC 0 c ' + F.sci(d.rc);
}
function pnpLayout() {
  return {
    w: 320, h: 262,
    elements: [
      { name: 'Q1', type: 'Q', kind: 'pnp', at: [180, 140], label: '' },
      // R2 now runs from the rail: the voltage across it is the one the
      // emitter sits below the rail by, plus a junction drop
      { name: 'R2', type: 'R', at: [120, 48], rot: 270, label: 'R2', labelAt: 'left' },
      { name: 'R1', type: 'R', at: [120, 170], rot: 90, label: 'R1', labelAt: 'left' },
      { name: 'RE', type: 'R', at: [192, 48], rot: 270, label: 'RE' },
      { name: 'CE1', type: 'C', at: [244, 48], rot: 270, label: 'CE' },
      { name: 'RC', type: 'R', at: [192, 202], rot: 270, label: 'RC' },
      { name: 'C1', type: 'C', at: [90, 140], label: 'C1', flow: 'RS' },
      { name: 'C2', type: 'C', at: [250, 172], label: 'C2', flow: '-' }
    ],
    wires: [
      [120, 18, 192, 18, 'RE'], [192, 18, 244, 18, 'CE1'],
      [120, 140, 120, 78, 'R2'],
      [120, 140, 150, 140, 'Rpi'],
      [192, 108, 192, 92, 'G1'], [192, 92, 192, 78, 'RE'],
      [192, 92, 244, 92, 'CE1'], [244, 92, 244, 78, 'CE1'],
      [192, 172, 220, 172, '-'], [280, 172, 292, 172, '-']
    ],
    grounds: [[120, 200], [192, 232]],
    terminals: [{ at: [60, 140], label: 'in', align: 'right' },
                { at: [292, 172], label: 'out' }, { at: [156, 10], label: '+V' }]
  };
}

/* Transconductance from the device law itself, so it is right in every region. */
function fetGm(vgs, vds, idss, vp) {
  const h = 1e-4;
  return Math.max(0, (DC.jfetCurrent(vgs + h, vds, idss, vp) -
                      DC.jfetCurrent(vgs - h, vds, idss, vp)) / (2 * h));
}

/*
 * JFET: the exam's common source stage, divider on the gate, source resistor
 * bypassed, load in the drain. Laid out on the common emitter frame, with the
 * gate lead declared dead: a gate draws no current, signal or steady.
 */
function jfetNetlist(d) {
  const F = window.Fmt, f = d.fet;
  const gm = Math.max(1e-9, fetGm(f.vgs, f.vds, FET_IDSS, FET_VP));
  return 'V1 in 0 1\nRS in b 50\nR1 b 0 ' + F.sci(d.r1) + '\nR2 b 0 ' + F.sci(d.r2) +
    '\nG1 c e b e ' + F.sci(gm) + '\nRO c e ' + F.sci(EARLY / Math.max(1e-6, f.id)) +
    '\nRE e 0 ' + F.sci(d.re) + '\nCE1 e 0 ' + F.sci(BYPASS) + '\nRC 0 c ' + F.sci(d.rc);
}
function jfetLayout() {
  const lay = configLayout('ce');
  lay.elements = lay.elements.map(e => {
    if (e.name === 'Q1') return Object.assign({}, e, { kind: 'njfet' });
    if (e.name === 'RC') return Object.assign({}, e, { label: 'RD' });
    if (e.name === 'RE') return Object.assign({}, e, { label: 'RS' });
    if (e.name === 'CE1') return Object.assign({}, e, { label: 'CS' });
    return e;
  });
  lay.wires = lay.wires.map(w => (w[4] === 'Rpi' ? w.slice(0, 4).concat('-') : w));
  return lay;
}

/*
 * Dual gate MOSFET. Gate 1 takes the signal and is returned to ground through
 * RG, so the source resistor biases it exactly as it would a single FET.
 * Gate 2 is held a few volts up by R1 and R2 and tied to signal ground by CG,
 * so it carries no signal at all: its steady voltage sets how much of the
 * device's gain is available.
 */
function dualGateNetlist(d) {
  const F = window.Fmt, g = d.dg;
  // gain from gate 1 with the source held still by its bypass capacitor
  const h = 1e-3;
  const up = dualGatePoint(d, h, g.vs).id, dn = dualGatePoint(d, -h, g.vs).id;
  const gm = Math.max(1e-9, (up - dn) / (2 * h));
  return 'V1 in 0 1\nRIN in g 50\nRG g 0 ' + F.sci(DG_RG) +
    '\nG1 d s g s ' + F.sci(gm) + '\nRO d s ' + F.sci(EARLY / Math.max(1e-6, g.id)) +
    '\nRS s 0 ' + F.sci(d.re) + '\nCS s 0 ' + F.sci(BYPASS) + '\nRD 0 d ' + F.sci(d.rc);
}
function dualGateLayout() {
  const at = [240, 160];
  const g2 = [at[0] + DG_G2[0], at[1] + DG_G2[1]];      // (226, 120)
  return {
    w: 360, h: 262,           // room for the 'out' label past the terminal
    elements: [
      { name: 'Q1', type: 'Q', kind: 'dgmos', at: at, label: '' },
      { name: 'R1', type: 'R', at: [40, 48], rot: 270, label: 'R1', labelAt: 'left', flow: '-' },
      { name: 'R2', type: 'R', at: [40, 150], rot: 90, label: 'R2', labelAt: 'left', flow: '-' },
      { name: 'CG', type: 'C', at: [g2[0], 90], rot: 270, label: 'CG', labelAt: 'left', flow: '-' },
      { name: 'RG', type: 'R', at: [180, 190], rot: 90, label: 'RG', labelAt: 'left' },
      { name: 'C1', type: 'C', at: [150, 160], label: 'C1', flow: 'RIN' },
      { name: 'RD', type: 'R', at: [252, 48], rot: 90, label: 'RD' },
      { name: 'C2', type: 'C', at: [300, 100], label: 'C2', flow: '-' },
      { name: 'RS', type: 'R', at: [252, 222], rot: 90, label: 'RS', labelAt: 'left' },
      { name: 'CS', type: 'C', at: [300, 222], rot: 90, label: 'CS' }
    ],
    wires: [
      // gate 2's network carries no signal current: CG holds it at signal
      // ground, and an insulated gate draws nothing steady either
      [40, 18, g2[0], 18, '-'], [g2[0], 18, 252, 18, 'RD'],
      [40, 120, 40, 78, '-'],
      [g2[0], g2[1], 40, 120, '-'],
      [g2[0], 60, g2[0], 18, '-'],                    // CG to the rail, signal ground
      [180, 160, 210, 160, '-'],                      // gate 1 draws nothing
      [252, 78, 252, 100, 'RD'], [252, 100, 252, 128, 'RD'],
      [252, 100, 270, 100, '-'],
      [252, 192, 300, 192, 'CS']
    ],
    grounds: [[40, 180], [180, 220], [252, 252], [300, 252]],
    terminals: [{ at: [120, 160], label: 'in', align: 'right' },
                { at: [330, 100], label: 'out' }, { at: [150, 10], label: '+V' }]
  };
}

/*
 * 2I4 at Full: the typical circuit for each class, drawn beside the current
 * pulse. The class figures come from one device biased by the divider, whose
 * emitter resistor is left unbypassed so that its current follows the base
 * voltage above the turn on point in a straight line: exactly the truncated
 * sine dc.js takes the Fourier coefficients of. The netlists solve each
 * circuit at the fundamental, with the device delivering the fundamental of
 * its pulse, (theta - sin theta) / 2 pi of what it would at full conduction.
 */
const CLASS_F = 1e6;                       // the tuned circuits' frequency
const CLASS_LT = 10e-6;
const CLASS_CT = 1 / (Math.pow(2 * Math.PI * CLASS_F, 2) * CLASS_LT);
const CLASS_RL = 2000, PP_RL = 50, PP_RB = 10e3, PP_RD = 26, PP_GM = 0.4;

function pulseShare(theta) {
  return Math.max(1e-6, (theta - Math.sin(theta)) / (2 * Math.PI));
}

function classKind(cls) {
  return cls === 'B' ? 'B' : cls === 'AB' ? 'AB' : (cls === 'C' || cls === 'off') ? 'C' : 'A';
}

function classNetlist(kind, d) {
  const F = window.Fmt;
  if (kind === 'AB' || kind === 'B') {
    const gm = PP_GM * pulseShare(d.theta), rp = F.sci(Math.max(1, d.beta / gm));
    const top = kind === 'AB' ? 'a' : 'm', bot = kind === 'AB' ? 'n' : 'm';
    return 'V1 in 0 1\nRIN in m 50' +
      '\nRB1 0 ' + top + ' ' + F.sci(PP_RB) +
      (kind === 'AB' ? '\nRD1 a m ' + PP_RD + '\nRD2 m n ' + PP_RD : '') +
      '\nRB2 ' + bot + ' 0 ' + F.sci(PP_RB) +
      '\nRP1 ' + top + ' o ' + rp + '\nG1 0 o ' + top + ' o ' + F.sci(gm) +
      '\nRP2 o ' + bot + ' ' + rp + '\nG2 o 0 o ' + bot + ' ' + F.sci(gm) +
      '\nRLD o 0 ' + PP_RL;
  }
  const ipk = Math.max(1e-6, (Math.max(0, d.headroom) + d.drive) / d.re);
  const gm = ipk / 0.026 * pulseShare(d.theta);
  const head = 'V1 in 0 1\nRS in b 50\nR1 b 0 ' + F.sci(d.r1) + '\nR2 b 0 ' + F.sci(d.r2) +
    '\nRpi b e ' + F.sci(Math.max(1, d.beta / gm)) + '\nG1 c e b e ' + F.sci(gm) +
    '\nRO c e ' + F.sci(EARLY / Math.max(1e-6, ipk)) + '\nRE e 0 ' + F.sci(d.re);
  return kind === 'C'
    ? head + '\nLT 0 c ' + F.sci(CLASS_LT) + '\nCT 0 c ' + F.sci(CLASS_CT) + '\nRLD c 0 ' + CLASS_RL
    : head + '\nRC 0 c ' + F.sci(d.rc);
}

function classLayout(kind) {
  if (kind === 'AB' || kind === 'B') {
    const ab = kind === 'AB';
    return {
      w: 340, h: 272,         // room for the load's label
      elements: [
        // a blank label: the engine would otherwise print the name over the
        // collector lead; which device is which is in the note beneath
        { name: 'Q1', type: 'Q', at: [200, 78], label: ' ' },
        { name: 'Q2', type: 'Q', kind: 'pnp', at: [200, 198], label: '' },
        { name: 'RB1', type: 'R', at: [140, 48], rot: 90, label: 'RB1', labelAt: 'left' },
        { name: 'RB2', type: 'R', at: [140, 228], rot: 90, label: 'RB2', labelAt: 'left' },
        { name: 'C1', type: 'C', at: [100, 138], label: 'C1', flow: 'RIN' },
        { name: 'C2', type: 'C', at: [260, 138], label: 'C2', flow: 'RLD' },
        { name: 'RLD', type: 'R', at: [290, 168], rot: 90, label: 'load' }
      ].concat(ab ? [
        // labelled on the right, clear of C1's label on the left
        { name: 'D1', type: 'D', at: [140, 108], rot: 90, label: 'D1', flow: 'RD1' },
        { name: 'D2', type: 'D', at: [140, 168], rot: 90, label: 'D2', flow: 'RD2' }
      ] : []),
      wires: [
        [140, 18, 212, 18, 'G1'], [212, 18, 212, 46, 'G1'],
        [140, 78, 170, 78, 'RP1'],
        [170, 198, 140, 198, 'RP2'],
        [212, 110, 212, 138, 'G1'], [212, 138, 212, 166, 'G2'],
        [212, 230, 212, 258, 'G2'],
        [212, 138, 230, 138, 'RLD'],
        [130, 138, 140, 138, 'RIN']
      ].concat(ab ? [] : [
        // with no diodes the two bases are simply joined to the input
        [140, 78, 140, 138, 'RB1'], [140, 138, 140, 198, 'RB2']
      ]),
      grounds: [[140, 258], [212, 258], [290, 198]],
      terminals: [{ at: [70, 138], label: 'in', align: 'right' },
                  { at: [176, 10], label: '+V' }]
    };
  }
  const lay = configLayout('ce');
  // the classes are worked with the emitter resistor unbypassed, so draw it so
  lay.elements = lay.elements.filter(e => e.name !== 'CE1');
  lay.wires = lay.wires.filter(w => w[4] !== 'CE1');
  if (kind === 'C') {
    lay.w = 340;                // room for the load's label
    lay.elements = lay.elements.filter(e => e.name !== 'RC' && e.name !== 'C2').concat([
      { name: 'LT', type: 'L', at: [192, 48], rot: 90, label: 'L', labelAt: 'left' },
      { name: 'CT', type: 'C', at: [244, 48], rot: 90, label: 'C' },
      // labelled below, clear of the tank above it
      { name: 'C2', type: 'C', at: [250, 108], label: 'C2', labelAt: 'below', flow: 'RLD' },
      { name: 'RLD', type: 'R', at: [280, 138], rot: 90, label: 'load' }
    ]);
    lay.wires = lay.wires.filter(w => !(w[0] === 192 && w[1] === 78) && w[4] !== '-')
      .concat([[192, 18, 244, 18, 'CT'], [244, 78, 192, 78, 'CT'],
               [192, 78, 192, 108, 'G1'], [192, 108, 220, 108, 'RLD']]);
    lay.grounds = lay.grounds.concat([[280, 168]]);
    lay.terminals = lay.terminals.filter(t => t.label !== 'out');
  }
  return lay;
}

/*
 * The Colpitts oscillator the syllabus draws: the transistor as an emitter
 * follower, the coil from base to ground (through a blocking capacitor so it
 * does not short the bias), and two capacitors in series across it. Their
 * junction is the tap, and the emitter drives it.
 *
 * Where the loop gain comes from. A follower's voltage gain is below one, so
 * on its own it cannot make up anything. The tuned circuit can: at resonance
 * the two capacitors act as a step up transformer, and the base, at the top of
 * the coil, swings (CA + CB) / CA times as far as the tap does. With equal
 * capacitors that is twice. What the transistor supplies is current, at about
 * beta + 1 times what the base draws, and that is what replaces the energy
 * the coil's resistance and the bias resistors take out of the tank on every
 * cycle. The loop gain is the follower's gain times the step up, less those
 * losses, and it has to come to at least one.
 *
 * It is solved, not quoted. An oscillator has no input to drive, so the loop
 * is opened at the one place that does not disturb it: the voltage that
 * controls the transistor's current. A test signal there, the circuit
 * otherwise intact (the base still loads the tank through r_pi), and what
 * comes back at the base divided by what went in is the loop gain. The
 * frequency is where it comes back in phase.
 *
 * Amplitude. The transistor's current is an exponential of the voltage
 * between its base and its emitter, so a swing there of more than the 26 mV
 * thermal voltage no longer comes out in proportion. The standing current is
 * held by RE, so as the swing grows the current becomes a pulse on the peaks
 * and stops altogether on the troughs, and the part of it at the oscillating
 * frequency can never exceed twice the standing current. The standard result
 * for that (the large signal transconductance of a bipolar device whose
 * average current is fixed) is gm x 2 I1(x) / (x I0(x)), x being the
 * swing in thermal voltages and I0, I1 the modified Bessel functions. A
 * follower's base and emitter move almost together, so the base has to swing
 * a long way before that swing gets large, but when it does the follower's
 * gain falls, the loop gain with it, and the oscillation settles where it has
 * fallen to exactly one. The emitter running into the supply would limit it
 * too, the transistor saturating and clamping the swing like a limiter; that
 * is allowed for, though at the starting settings the current runs out first.
 *
 * The Drive control is the swing at the base, as it is on every other panel.
 * Below the settling amplitude the loop gain is over one and the swing grows;
 * above it, under one and it shrinks back; and if even a tiny swing sees a
 * loop gain short of one, it dies away from any amplitude.
 */
const OSC_L = 4.7e-6, OSC_CA = 1000e-12, OSC_CB = 1000e-12, OSC_Q = 100;
const OSC_CS = 100e-9;        // blocks DC from the coil, a short at RF
const OSC_CSER = OSC_CA * OSC_CB / (OSC_CA + OSC_CB);
const OSC_F0 = 1 / (2 * Math.PI * Math.sqrt(OSC_L * OSC_CSER));
const OSC_RCOIL = 2 * Math.PI * OSC_F0 * OSC_L / OSC_Q;
const VT = 0.026;             // the thermal voltage at room temperature

/* How much of the small signal transconductance survives a swing of x VT. */
function largeSignalShare(x) {
  if (!(x > 1e-4)) return 1;
  let ratio;                                   // I1(x) / I0(x)
  if (x > 30) {
    ratio = 1 - 1 / (2 * x) - 1 / (8 * x * x) - 1 / (8 * x * x * x);
  } else {
    let i0 = 0, i1 = 0, t0 = 1, t1 = x / 2;
    const q = x * x / 4;
    for (let k = 0; k < 120; k++) {
      i0 += t0; i1 += t1;
      t0 *= q / ((k + 1) * (k + 1));
      t1 *= q / ((k + 1) * (k + 2));
    }
    ratio = i1 / i0;
  }
  return 2 * ratio / x;
}

function oscNetlist(v, b, gm, vin) {
  const F = window.Fmt;
  const ic = Math.max(1e-9, b.ic);
  gm = Math.max(1e-12, gm);
  const rpi = Math.max(1, v.beta / gm), ro = EARLY / ic;
  return 'V1 bx 0 ' + F.sci(vin || 1) +
    '\nRpi b e ' + F.sci(rpi) +
    '\nG1 0 e bx e ' + F.sci(gm) +
    '\nRO 0 e ' + F.sci(ro) +
    '\nRE e 0 ' + F.sci(v.re) +
    '\nR1 b 0 ' + F.sci(v.r1) + '\nR2 b 0 ' + F.sci(v.r2) +
    '\nCA b e ' + F.sci(OSC_CA) + '\nCB e 0 ' + F.sci(OSC_CB) +
    '\nCS b t ' + F.sci(OSC_CS) + '\nL1 t m ' + F.sci(OSC_L) +
    '\nRL m 0 ' + F.sci(OSC_RCOIL);
}

/* The open loop at one transconductance: where it comes back in phase, and how big. */
function oscLoopAt(v, b, gm) {
  const M = window.MNA;
  const ckt = M.parseNetlist(oscNetlist(v, b, gm, 1));
  const at = f => M.solveAt(ckt, f);
  const ph = f => M.arg(M.nodeV(at(f), 'b'));
  let lo = OSC_F0 * 0.8, hi = OSC_F0 * 1.25;
  for (let k = 0; k < 26; k++) {
    const mid = (lo + hi) / 2;
    if (ph(mid) > 0) lo = mid; else hi = mid;
  }
  const f = (lo + hi) / 2, s = at(f);
  const vbOut = M.nodeV(s, 'b'), ve = M.nodeV(s, 'e');
  const T = M.abs(vbOut), A = M.abs(ve);
  // how sharply the phase turns is the loaded Q of the tank, which sets how
  // quickly the amplitude can change from one cycle to the next
  const df = f * 1e-4;
  const slope = Math.abs(ph(f + df) - ph(f - df)) / (2 * df);
  return { f: f, T: T, A: A, N: A > 0 ? T / A : 0,
           // what is left between base and emitter, per volt at the base
           ctl: M.abs(M.sub(M.cx(1, 0), ve)),
           qL: Math.max(1, slope * f / 2) };
}

const oscCache = {};
function oscillatorLoop(v) {
  const vcc = v.vcc || VCC;
  const key = [vcc, v.r1, v.r2, v.re, v.beta].join('|');
  let o = oscCache[key];
  if (!o) {
    // the follower's collector goes straight to the rail
    const b = DC.dividerBias(vcc, v.r1, v.r2, 0, v.re, v.beta, { vbe: VBE, vsat: VSAT });
    if (b.state !== 'active') {
      o = { state: b.state, b: b, curve: [], Tss: 0, settle: 0, gm0: 0 };
    } else {
      const gm0 = b.ic / VT;
      const room = Math.max(0, vcc - VSAT - b.ve);    // emitter's distance to the rail
      // The base cannot swing more than a junction drop above the collector,
      // which sits on the rail: there the collector junction conducts and
      // the transistor saturates. So the base swing is held below baseRoom,
      // and past it what comes back can be no larger, whatever the loop.
      const baseRoom = Math.max(1e-3, vcc + VBE - b.vb);
      const curve = [];
      // swept by the base to emitter swing, which gives the base swing directly
      for (let i = 0; i <= 32; i++) {
        const x = 0.01 * Math.pow(1e5, i / 32);
        const gm = gm0 * largeSignalShare(x);
        const s = oscLoopAt(v, b, gm);
        const vb = x * VT / Math.max(1e-9, s.ctl);
        // past the rail the transistor saturates and clamps the swing, so
        // from there on it behaves as a limiter: what comes back stops growing
        const k = DC.fundamentalGain(s.A * vb, room, room);
        // the clamp at the base, put down to the follower, which is what
        // has saturated
        const c = Math.min(1, baseRoom / Math.max(1e-12, s.T * k * vb));
        curve.push({ vb: vb, T: s.T * k * c, A: s.A * k * c, N: s.N, f: s.f, qL: s.qL, gm: gm });
      }
      const Tss = curve[0].T;
      let settle = 0;
      if (Tss > 1) {
        for (let i = 1; i < curve.length; i++) {
          if (curve[i].T < 1) {
            const p = curve[i - 1], q = curve[i];
            const u = (p.T - 1) / (p.T - q.T);
            settle = p.vb * Math.pow(q.vb / p.vb, u);
            break;
          }
        }
      }
      // settled at the clamp, rather than where the current runs out (the
      // curve is sampled, so a settling point read off it can overshoot the
      // clamp by a hair)
      const clamped = settle > 0 && settle > 0.97 * baseRoom;
      if (settle > baseRoom) settle = baseRoom;
      o = { state: 'active', b: b, curve: curve, Tss: Tss, settle: settle, gm0: gm0,
            baseRoom: baseRoom, clamped: clamped };
    }
    oscCache[key] = o;
  }
  // everything at the swing the Drive control sets
  const here = oscAtSwing(o, v.drive);
  return Object.assign({}, o, here);
}

/* The loop at a given swing at the base, read off the curve. */
function oscAtSwing(o, a) {
  const c = o.curve;
  if (!c.length) return { T: 0, A: 0, N: 0, f: OSC_F0, qL: OSC_Q, gm: 0 };
  if (!(a > c[0].vb)) return c[0];
  for (let i = 1; i < c.length; i++) {
    if (a <= c[i].vb) {
      const p = c[i - 1], q = c[i];
      const u = Math.log(a / p.vb) / Math.log(q.vb / p.vb);
      const mix = k => p[k] + u * (q[k] - p[k]);
      return { vb: a, T: mix('T'), A: mix('A'), N: mix('N'), f: mix('f'),
               qL: mix('qL'), gm: p.gm * Math.pow(q.gm / p.gm, u) };
    }
  }
  return c[c.length - 1];
}

/*
 * The Colpitts as it is drawn. Divider on the left, the coil and its blocking
 * capacitor, then CA from the base line down to the tap, CB from the tap to
 * ground, and the transistor on the right with its emitter feeding the tap.
 * Every wire on the base line is drawn in the direction its current runs on a
 * positive half cycle.
 */
function colpittsLayout() {
  return {
    w: 300, h: 262,
    elements: [
      { name: 'Q1', type: 'Q', at: [230, 120], label: ' ' },   // its name would sit on the collector lead
      { name: 'R1', type: 'R', at: [40, 48], rot: 270, label: 'R1', labelAt: 'left' },
      { name: 'R2', type: 'R', at: [40, 150], rot: 90, label: 'R2', labelAt: 'left' },
      { name: 'CS', type: 'C', at: [100, 150], rot: 90, label: 'CS', labelAt: 'left' },
      { name: 'L1', type: 'L', at: [100, 210], rot: 90, label: 'L', labelAt: 'left' },
      { name: 'CA', type: 'C', at: [150, 150], rot: 90, label: 'CA' },
      { name: 'CB', type: 'C', at: [150, 210], rot: 90, label: 'CB' },
      { name: 'RE', type: 'R', at: [242, 210], rot: 90, label: 'RE' }
    ],
    wires: [
      [40, 18, 242, 18, 'G1'],          // the rail
      [242, 18, 242, 88, 'G1'],         // into the collector
      [40, 120, 40, 78, 'R1'],
      [100, 120, 40, 120, 'R2'],        // the divider's share of the base line
      [150, 120, 100, 120, 'L1'],       // the coil's share
      [150, 120, 200, 120, 'Rpi'],      // what the base itself draws
      [242, 152, 242, 180, 'G1'],       // out of the emitter
      [242, 180, 150, 180, 'CB']        // along to the tap
    ],
    grounds: [[40, 180], [100, 240], [150, 240], [242, 240]],
    terminals: [{ at: [140, 10], label: '+V' }]
  };
}

/*
 * Where a diode actually sits when it is fed through a resistor.
 *
 * The supply has to divide between the resistor and the diode, and the diode
 * takes whatever voltage corresponds to the current flowing. There is no
 * closed form for that, so bisect on the current until the two agree. This is
 * the calculation behind every "what current flows in this diode" question.
 */
/*
 * A Zener as it is actually wired: fed from the supply through a series
 * resistor, reverse biased, holding its rated voltage. The slope resistance
 * is what stops it being a perfect reference, so the held voltage creeps up
 * a little as the current through it rises.
 */
const ZENER_SLOPE = 5;
const ZENER_V = 5.1;

function zenerOperating(vsupply, r, vz) {
  if (vsupply <= vz) return { i: 0, vd: vsupply, vr: 0, p: 0 };
  const i = (vsupply - vz) / (r + ZENER_SLOPE);
  const v = vz + i * ZENER_SLOPE;
  return { i: i, vd: v, vr: i * r, p: v * i };
}

function diodeOperating(vsupply, r, opts) {
  let lo = 0, hi = vsupply / r;
  for (let k = 0; k < 60; k++) {
    const i = (lo + hi) / 2;
    const vd = window.DC.diodeVoltage(i, opts);
    if (vd + i * r < vsupply) lo = i; else hi = i;
  }
  const i = (lo + hi) / 2;
  return { i: i, vd: window.DC.diodeVoltage(i, opts), vr: i * r };
}

/*
 * The varicap as it is actually used: a coil with the diode across it, fed
 * with a control voltage through a resistor big enough not to damp the tuned
 * circuit. Reverse bias widens the depletion layer, the capacitance falls,
 * and the resonant frequency rises. The coil is a short circuit to DC, so it
 * reaches the diode through a blocking capacitor, CB; without it the coil
 * would hold the diode at 0 V whatever the control said. CB is large beside
 * the varicap, so it barely moves the tuning, but it is in the sum.
 */
const VARICAP_C0 = 62e-12;    // capacitance with no reverse voltage on it
const VARICAP_VJ = 0.7;       // the junction voltage it scales against
const VARICAP_L = 4.7e-6;     // the coil we tune, held fixed so one thing moves
const VARICAP_CB = 100e-9;    // blocks DC from the coil, a short at RF

function varicapC(vr) {
  return VARICAP_C0 / Math.sqrt(1 + Math.max(0, vr) / VARICAP_VJ);
}

function varicapF(vr) {
  const c = varicapC(vr), cTank = c * VARICAP_CB / (c + VARICAP_CB);
  return 1 / (2 * Math.PI * Math.sqrt(VARICAP_L * cTank));
}

/*
 * The tank as a signal sees it. The control supply is steady, so it carries
 * no signal and is signal ground; R1 runs from the tank to it. What sets the
 * tank ringing is not drawn, a small current fed in at its top, so the
 * charge drawn is the current circulating between the coil and the diode.
 */
function varicapNetlist(c) {
  const F = window.Fmt;
  return 'I1 0 a 1m\nR1 a 0 47000\nCB a x ' + F.sci(VARICAP_CB) +
         '\nL1 x 0 ' + F.sci(VARICAP_L) + '\nC1 a 0 ' + F.sci(c);
}

function varicapLayout() {
  return {
    w: 290, h: 200,
    elements: [
      { name: 'V1', type: 'B', at: [30, 100], rot: 90, label: 'control' },
      // R1 is far larger than the tank's own impedance, so the little signal
      // it takes is not drawn
      { name: 'R1', type: 'R', at: [100, 40], label: 'R', flow: '-' },
      { name: 'CB', type: 'C', at: [180, 70], rot: 90, label: 'CB', labelAt: 'left' },
      { name: 'L1', type: 'L', at: [180, 130], rot: 90, label: 'L', labelAt: 'left' },
      // cathode up to the control voltage: the varicap is reverse biased
      { name: 'D1', type: 'DV', at: [250, 100], rot: 270, label: 'varicap',
        labelAt: 'left', flow: 'C1', flowReversed: true }
    ],
    wires: [[30, 40, 70, 40, '-'], [30, 70, 30, 40, '-'],
            [130, 40, 180, 40, '-'],
            [180, 40, 250, 40, 'C1'], [250, 40, 250, 70, 'C1'],
            [250, 130, 250, 160, 'C1'], [250, 160, 180, 160, 'C1'],
            [180, 160, 30, 160, '-'], [30, 160, 30, 130, '-']],
    grounds: [[110, 160]]
  };
}

/* The diode in the circuit the questions describe: supply, resistor, diode. */
function diodeLayout(zener) {
  return {
    w: 250, h: 200,
    elements: [
      { name: 'V1', type: 'B', at: [30, 100], rot: 90, label: 'supply' },
      { name: 'RC', type: 'R', at: [110, 70], label: 'R' },
      // the plain diode points down, forward biased; the Zener points up,
      // cathode to the positive side, because it is used reverse biased
      // one current round the loop; the Zener, cathode up, carries it downward
      { name: 'D1', type: zener ? 'DZ' : 'D', at: [190, 100], rot: zener ? 270 : 90,
        label: zener ? 'Zener' : 'D', flow: 'RC', flowReversed: !!zener }
    ],
    wires: [[30, 70, 80, 70, 'RC'], [140, 70, 190, 70, 'RC'],
            [190, 130, 30, 130, 'RC']],
    grounds: [[110, 130]]
  };
}


const BENCH = {
  group: '2I',
  title: 'Semiconductor devices',
  pageTitle: 'Semiconductor Bench',
  levels: ['intermediate', 'full'],
  // the course sessions that send learners here, named in the colophon
  sessions: {
    intermediate: ['Intermediate session 6 (Semiconductors)'],
    full: ['Full session 8 (Semiconductors: Zener, bias, amplifiers, classes and oscillators)',
           'Full session 12 (Transmitters 2: making the frequency)',
           'Full session 13 (Transmitters 3: power amplifiers and a clean signal)']
  },
  circuitBased: true,
  // a wider circuit column, so the circuits draw near full size (sizeStage)
  circuitColumn: 420,

  /** Every circuit this bench draws, for the layout checker. */
  allLayouts: () => {
    // the checkers need the circuit as well as the drawing, so that every
    // conductor can be traced back to a current something actually solves for
    const start = {};
    BENCH.controls.forEach(c => { start[c.id] = c.start; });
    const d = BENCH.derive(start);
    return [
      { name: 'common emitter', layout: configLayout('ce'),
        netlist: configCircuit('ce', d).netlist },
      { name: 'emitter follower', layout: configLayout('cc'),
        netlist: configCircuit('cc', d).netlist },
      { name: 'common base', layout: configLayout('cb'),
        netlist: configCircuit('cb', d).netlist },
      { name: 'PNP', layout: pnpLayout(), netlist: pnpNetlist(d) },
      { name: 'JFET', layout: jfetLayout(), netlist: jfetNetlist(d) },
      { name: 'dual gate MOSFET', layout: dualGateLayout(), netlist: dualGateNetlist(d) }
    ].concat(['A', 'AB', 'B', 'C'].map(k => {
      // each class circuit solved at a bias that puts the stage in that class
      const at = { A: d, AB: Object.assign({}, d, { theta: 1.3 * Math.PI }),
                   B: Object.assign({}, d, { theta: Math.PI }),
                   C: Object.assign({}, d, { theta: 0.6 * Math.PI, headroom: -0.2 }) }[k];
      return { name: 'class ' + k, layout: classLayout(k), netlist: classNetlist(k, at) };
    })).concat([
      { name: 'Colpitts', layout: colpittsLayout(),
        netlist: oscNetlist(d, d.osc.b, d.osc.gm || 1e-3, d.drive) },
      { name: 'diode', layout: diodeLayout(false), netlist: 'series',
        flow: { mode: 'dc', currents: { RC: diodeOperating(d.vcc, d.rc, {}).i } } },
      { name: 'zener', layout: diodeLayout(true), netlist: 'series',
        flow: { mode: 'dc', currents: { RC: zenerOperating(d.vcc, d.rc, ZENER_V).i } } },
      { name: 'varicap', layout: varicapLayout(), netlist: varicapNetlist(60e-12) }
    ]);
  },
  bank: {
    url: 'https://rsgb.services/public/exams/eqdb/',
    topic: '2I - Semiconductor devices',
    note: 'Full level only. Choose the topic from the Filter by Topic list.'
  },

  intro: {
    intermediate: [
      'A diode lets current one way. A transistor lets a small current control a large one. Almost everything else in a radio is built out of those two facts.',
      'The controls along the top are the parts of one circuit, drawn beside every panel below so you can always see what they refer to. R1 and R2 divide the supply down to set the base voltage, RE turns that into a current, RC turns the current back into an output voltage, and beta is the transistor itself. On the first panel only the supply and R matter, because a diode has no base to bias.',
      'Move them and watch the operating point travel, because where a device sits before the signal arrives decides what it does to the signal when it turns up.'
    ],
    full: [
      'Where you bias a device decides how it behaves. Sit it halfway up and it reproduces the signal faithfully, and at least half the power it draws becomes heat. Sit it lower and it starts switching off for part of every cycle, which is more efficient and less faithful.',
      'That trade is what amplifier classes are. Each class is a bias setting; the page also draws the circuit usually built for each. Move the bias and watch A become AB, then B, then C.',
      'The controls along the top are the parts of that circuit, and it is drawn beside every panel: R1 and R2 set the base voltage between them, RE fixes the current, RC turns it back into voltage, and beta is the device.'
    ]
  },


  /*
   * Read before this bench was designed. Our own summary of what each source
   * insists on; no wording from any of them appears here or in the bench.
   */
  sources: {
    read: [
      'Foundation licence manual, semiconductors',
      'Intermediate licence manual, transistors in circuits',
      'Exam Secrets, transistors and amplifiers at Foundation, Intermediate and Full',
      'Syllabus 2024 v1.6b, items 2I1 to 2I6'
    ],
    keyMessages: [
      { at: '2I1', level: 'intermediate',
        point: 'a junction conducts one way once the barrier is overcome, at about 0.6 V' },
      { at: '2I1', level: 'intermediate',
        point: 'the drop across a conducting diode must be subtracted before Ohm law on the resistor' },
      { at: '2I1', level: 'full',
        point: 'a Zener is used reverse biased and holds its voltage past the knee' },
      { at: '2I2', level: 'intermediate',
        point: 'a reverse biased junction is a capacitor whose value the voltage sets' },
      { at: '2I3', level: 'intermediate',
        point: 'a small base current controls a much larger collector current, and beta is the ratio' },
      { at: '2I3', level: 'intermediate',
        point: 'push it far enough and the collector current is limited only by the load: a switch' },
      { at: '2I3', level: 'intermediate',
        point: 'coupling capacitors keep whatever is connected outside from disturbing the bias' },
      { at: '2I3', level: 'full',
        point: 'the operating point wants the middle of the range so the signal has room both ways' },
      { at: '2I4', level: 'intermediate',
        point: 'the collector should sit at half the supply for the largest undistorted swing' },
      { at: '2I4', level: 'full',
        point: 'common emitter inverts and gives both gains; follower gives current only; common base voltage only' },
      { at: '2I4', level: 'full',
        point: 'class is a choice of bias, and the conduction angle follows from it' },
      { at: '2I4', level: 'full',
        point: 'class A is the most faithful and least efficient, and produces fewest harmonics' },
      { at: '2I4', level: 'full',
        point: 'class C draws nothing until driven, is highly non-linear, and needs a tuned load' },
      { at: '2I4', level: 'full',
        point: 'amplitude carrying modes need linearity; CW and FM do not' },
      { at: '2I5', level: 'intermediate',
        point: 'an amplifier feeding part of its output back keeps a tuned circuit ringing' },
      { at: '2I5', level: 'full',
        point: 'gain must cover the loss and the phase round the loop must come back to zero' },
      { at: '2I6', level: 'intermediate',
        point: 'an integrated circuit sells you a function rather than a device' }
    ]
  },

  controls: [
    { id: 'vcc', label: 'Supply', unit: 'V', range: [5, 24], start: 12, linear: true, integer: true,
      desc: 'The rail the stage runs from. Worked designs often use 10 V' },
    { id: 'r1', label: 'R1', unit: 'Ω', range: [10e3, 470e3], start: 47e3,
      desc: 'Upper bias resistor, from the supply to the base' },
    { id: 'r2', label: 'R2', unit: 'Ω', range: [1e3, 100e3], start: 7.5e3,
      desc: 'Lower bias resistor, base to ground. With R1 it sets the base voltage' },
    { id: 'rc', label: 'RC', unit: 'Ω', range: [220, 22000], start: 4700,
      desc: 'Collector load. Turns collector current into output voltage' },
    { id: 're', label: 'RE', unit: 'Ω', range: [10, 4700], start: 1000,
      desc: 'Emitter resistor. Sets the current, and steadies it against temperature' },
    { id: 'beta', label: 'beta', unit: '', range: [20, 400], start: 200,
      desc: 'Current gain of the transistor, collector current over base current' },
    { id: 'drive', label: 'Drive', unit: 'V', range: [0.001, 0.5], start: 0.01,
      desc: 'Peak of the signal arriving at the base, in volts' }
  ],

  derive: (v) => {
    const b = bias(v);
    const vcc = v.vcc || VCC;
    const ll = DC.loadLine(vcc, v.rc + v.re);
    // How far the base sits above the point it starts conducting, measured in
    // volts, against the peak of the drive. That ratio is what decides how
    // much of each cycle the device is switched on for.
    const headroom = b.vb - VBE;
    const theta = DC.conductionAngle(headroom, v.drive);
    const perf = DC.classPerformance(theta);
    // A saturated device is a closed switch, not an amplifier of any class.
    const saturated = b.state === 'saturated';
    return {
      vcc: vcc, r1: v.r1, r2: v.r2, rc: v.rc, re: v.re,
      beta: v.beta, drive: v.drive,
      vb: b.vb, vth: b.vth, rth: b.rth, ve: b.ve, ic: b.ic, icq: b.ic, ib: b.ib, ie: b.ie,
      vce: b.vce, vceq: b.vce, state: b.state, saturated: saturated, icSat: b.icMax,
      conducting: b.conducting, headroom: headroom,
      iMax: ll.iMax,
      theta: theta, thetaDeg: theta * 180 / Math.PI,
      cls: saturated ? 'saturated' : DC.classOf(theta),
      eff: saturated ? 0 : perf.efficiency, a0: perf.a0, a1: perf.a1,
      zener: zenerOperating(vcc, v.rc, ZENER_V),
      fet: fetPoint(v),
      dg: dualGatePoint(v),
      osc: oscillatorLoop(v),
      f0: 0
    };
  },

  equations: {
    load: { given: false, name: 'The load line',
            eq: 'I<sub>C</sub> = (V<sub>CC</sub> &minus; V<sub>CE</sub>) / R<sub>C</sub>',
            work: d => ['(<b>' + d.vcc + ' V</b> &minus; 0) / <b>' + FI.eng(d.rc, 'Ω', 3) + '</b> at one end',
                        FI.eng(d.iMax, 'A', 3) + ' with the collector at zero'] },
    mid:  { given: false, name: 'Collector resistor for a mid point bias',
            eq: 'R<sub>C</sub> = (V<sub>CC</sub> / 2) / I<sub>C</sub>',
            work: d => ['(<b>' + d.vcc + ' V</b> / 2) / <b>' + FI.eng(d.icq, 'A', 3) + '</b>',
                        FI.eng(d.icq > 0 ? (d.vcc / 2) / d.icq : 0, 'Ω', 4)] },
    divider: { given: true, name: 'The bias divider',
               eq: 'V<sub>B</sub> = V<sub>CC</sub> &times; R2 / (R1 + R2)',
               work: d => ['<b>' + d.vcc + ' V</b> &times; <b>' + FI.eng(d.r2, 'Ω', 3) +
                           '</b> / (<b>' + FI.eng(d.r1, 'Ω', 3) + '</b> + <b>' +
                           FI.eng(d.r2, 'Ω', 3) + '</b>)',
                           FI.trim(d.vth, 3) + ({
                             pnp: ' V: how far the base sits below the rail, if the divider is stiff',
                             jfet: ' V at the gate, exactly, because the gate draws no current',
                             dualgate: ' V on gate 2, exactly, because the gate draws no current'
                           }[d.device] || ' V at the base, if the divider is stiff')] },
    emitter: { given: false, name: 'What the emitter resistor sets',
               applies: d => bipolar(d),
               eq: 'I<sub>E</sub> = (V<sub>B</sub> &minus; 0.6) / R<sub>E</sub>',
               work: d => ['(<b>' + FI.trim(d.vth, 3) + ' V</b> &minus; 0.6 V) / <b>' +
                           FI.eng(d.re, 'Ω', 3) + '</b>',
                           'about ' + FI.eng(Math.max(0, d.vth - 0.6) / d.re, 'A', 3) +
                           ' (the base current pulls it to ' + FI.eng(d.ic + d.ib, 'A', 3) + ')'] },
    // The booklet prints P = IV and V = IR. The Zener sums are those two
    // applied, so they are marked given, and they use the voltage the
    // readouts show: the rated 5.1 V plus what the slope resistance adds.
    // Neither applies until the Zener conducts, so until then the rows are
    // left out and the readouts say why.
    zpower: { given: true, name: 'Power the Zener has to get rid of',
              eq: 'P = IV, with V the voltage across the Zener',
              applies: d => d.zener.i > 0,
              work: d => {
                const z = d.zener;
                return ['<b>' + FI.eng(z.i, 'A', 3) + '</b> &times; <b>' + FI.trim(z.vd, 3) + ' V</b>',
                        FI.eng(z.p, 'W', 3) + ' turned into heat in the diode'];
              } },
    zseries: { given: true, name: 'The resistor that sets the Zener current',
               eq: 'V = IR, so R = (V<sub>supply</sub> &minus; V<sub>Z</sub>) / I',
               applies: d => d.zener.i > 0,
               work: d => {
                 const z = d.zener;
                 return ['(<b>' + FI.trim(d.vcc, 3) + ' V</b> &minus; <b>' + FI.trim(z.vd, 3) +
                         ' V</b>) / <b>' + FI.eng(z.i, 'A', 3) + '</b>',
                         FI.eng((d.vcc - z.vd) / z.i, 'Ω', 3)];
               } },
    // printed on both the Intermediate and the Full formula sheets
    beta: { given: true, tag: { intermediate: 'given' }, name: 'Current gain', eq: 'I<sub>C</sub> = &beta; &times; I<sub>B</sub>',
            applies: d => bipolar(d),
            work: d => d.saturated
              ? ['<b>' + FI.trim(d.beta, 3) + '</b> &times; <b>' + FI.eng(d.ib, 'A', 3) + '</b> would be ' +
                 FI.eng(d.beta * d.ib, 'A', 3),
                 FI.eng(d.icq, 'A', 3) + ' is all the resistors allow: saturated, so beta no longer applies']
              : ['<b>' + FI.trim(d.beta, 3) + '</b> &times; <b>' + FI.eng(d.ib, 'A', 3) + '</b>',
                 FI.eng(d.icq, 'A', 3)] },
    vgs:  { given: false, name: 'Gate to source voltage of the FET',
            applies: d => d.device === 'jfet',
            eq: 'V<sub>GS</sub> = V<sub>G</sub> &minus; V<sub>S</sub>',
            work: d => ['<b>' + FI.trim(d.fet.vg, 3) + ' V</b> &minus; <b>' + FI.trim(d.fet.vs, 3) + ' V</b>',
                        FI.trimText(d.fet.vgs, 3) + ' V' + (d.fet.vgs < 0
                          ? ', the gate below the source, as a depletion FET needs'
                          : ', the gate above the source: too far for a JFET')] },
    theta: { given: false, name: 'How much of the cycle it conducts for',
             eq: '&theta; = 360&deg; for A, between 180&deg; and 360&deg; for AB, 180&deg; for B, under 180&deg; for C',
             work: d => d.saturated
               ? ['at this bias', 'none of these: the transistor is saturated, a closed switch']
               : (d.cls === 'off'
                 ? ['at this bias and drive', '0&deg;: the drive never reaches turn on, so no class at all']
                 : ['at this bias and drive',
                    FI.trim(d.thetaDeg, 4) + '&deg;, which is class ' + d.cls]) },
    eff:  { given: false, name: 'The most efficient it can be at that angle',
            eq: '&eta;<sub>max</sub> = RF power out / DC power in, at full swing',
            work: d => d.saturated
              ? ['saturated', 'no figure: nothing is being amplified']
              : d.cls === 'off'
              ? ['the drive never reaches turn on', 'none: no current flows']
              : ['from the shape of the current pulse, with the collector swinging the whole supply',
                 'at best ' + FI.trim(d.eff * 100, 3) + '%'] },
    diss: { given: true, name: 'What the transistor has to get rid of',
            applies: d => bipolar(d),
            eq: 'P = IV, here P = V<sub>CE</sub> &times; I<sub>C</sub>',
            work: d => ['<b>' + FI.trim(d.vceq, 3) + ' V</b> &times; <b>' + FI.eng(d.icq, 'A', 3) + '</b>',
                        FI.eng(d.vceq * d.icq, 'W', 3)] },
    loop: { given: false, name: 'Gain round the oscillator loop',
            eq: 'loop gain &ge; 1, where here loop gain = follower gain &times; step up of the tap',
            work: d => {
              const o = d.osc;
              if (o.state === 'cut off') return ['the transistor is cut off', '0: no gain at all'];
              return ['<b>' + FI.trim(o.A, 3) + '</b> &times; <b>' + FI.trim(o.N, 3) + '</b>',
                      FI.trim(o.T, 3) + (o.T >= 1 ? ', at least one: the swing grows'
                                                  : ', short of one: the swing shrinks')];
            } }
  },

  terms: {
    'forward bias': 'A voltage applied the way round that lets a diode conduct.',
    'reverse bias': 'A voltage applied the other way round, which a diode blocks until its breakdown point.',
    'depletion layer': 'The region either side of a diode junction with no free charge in it. Forward bias shrinks it and lets current through.',
    'Zener diode': 'A diode built to break down at a chosen reverse voltage and hold there, which makes it useful as a voltage reference.',
    'bias': 'The steady voltages and currents applied to a device to put it where you want it before any signal arrives.',
    'operating point': 'Where a device sits on its load line with no signal applied. Also called the quiescent point.',
    'load line': 'The straight line of every collector voltage and current the load resistor allows. The operating point is somewhere on it.',
    'saturation': 'The state where a transistor is passing as much current as the load permits and the collector can fall no further.',
    'cut off': 'The state where a transistor passes no current at all.',
    'conduction angle': 'How much of each input cycle the device is actually conducting for, measured in degrees.',
    'class A': 'Biased so the device conducts for the whole cycle. Most faithful, least efficient, at best 50%.',
    'class B': 'Biased at cut off, so it conducts for half the cycle. At best 78.5% efficient, but one device alone distorts badly.',
    'class AB': 'Biased between A and B, conducting for more than half the cycle but less than all of it. The usual compromise for SSB.',
    'class C': 'Biased below cut off, conducting for well under half the cycle. Efficient, and only usable where a tuned circuit can restore the waveform.',
    'pinch off': 'The gate voltage at which a FET\u2019s channel is squeezed shut and drain current stops. For an n channel depletion device it is a few volts below the source.',
    'dual gate MOSFET': 'A field effect transistor with two insulated gates on one channel. Gate 1 takes the signal; the steady voltage on gate 2 sets how much gain is available.',
    'crossover distortion': 'The kink a push pull stage puts in the waveform where one device hands over to the other, if neither is conducting at that moment.',
    'feedback': 'Returning part of the output to the input. Enough of it, in the right phase, and an amplifier becomes an oscillator.'
  },

  panels: {
    /*
     * What the base current does to the collector current, across the whole
     * range. In the middle the collector follows at beta times the base, which
     * is amplification. Push far enough and it flattens against the most the
     * circuit can supply, which is saturation, and at the other end it is off
     * altogether. Amplifier and switch are the same curve at different places.
     */
    transfer(ctx) {
      const { p, d, t, level, Plot, swatch, ro, Fmt } = ctx;
      const { eng, trimText: trim } = Fmt;
      // the device toggle is a Full level control; below Full it is always NPN
      const dev = level === 'full' ? (p.topology || 'npn') : 'npn';
      if (dev === 'jfet') return BENCH.panels.fetBias(ctx);
      if (dev === 'dualgate') return BENCH.panels.dualGateBias(ctx);
      sizeStage(p, dev === 'pnp' ? pnpLayout() : configLayout('ce'));

      const iMax = d.icSat;                           // most the circuit can pass
      const ibFull = iMax / d.beta;                    // base current that gets there
      const ibMax = Math.max(ibFull * 1.6, d.ib * 1.3);

      const pts = [], ideal = [];
      for (let i = 0; i <= 400; i++) {
        const ib = ibMax * i / 400;
        pts.push({ x: ib, y: Math.min(d.beta * ib, iMax) });
        ideal.push({ x: ib, y: d.beta * ib });
      }
      // both lines are collector current: the one beta alone would give is
      // the same orange, dashed and thin, under the one the circuit allows
      const spec = {
        xRange: [0, ibMax], xFmt: x => eng(x, 'A', 2), tokens: t,
        left: { max: iMax * 1.15, fmt: y => eng(y, 'A', 2) },
        traces: dashTrace({ pts: ideal.filter(q => q.y <= iMax * 1.15), colour: t.i,
                            axis: 'left', width: 1.4 },
                          p.graph, [0, ibMax])
          .concat([{ pts: pts, colour: t.i, fill: t.iFill, axis: 'left', width: 2.4 }]),
        marks: [{ x: ibFull, colour: t.mark }],
        cursor: { x: Math.min(d.ib, ibMax), colour: t.mark,
                  dot: { y: d.ic, axis: 'left' },
                  label: 'where it is biased' }
      };
      Plot.draw(p.graph, spec);
      p.legend.innerHTML = swatch(t.i, 'Collector current') +
        swatch(dashed(t.i), 'What beta alone would give') +
        swatch(dashed(t.mark), 'Saturated beyond here') +
        swatch(t.mark, 'The operating point');

      const state = d.state === 'cut off' ? 'cut off, no current at all'
        : (d.saturated ? 'saturated, a closed switch' : 'amplifying, on the straight part');
      const pnp = dev === 'pnp';
      // a PNP's voltages are the NPN's measured down from the rail
      const at = v => trim(pnp ? d.vcc - v : v, 3) + ' V';
      p.readouts.innerHTML = ro([
        ['Base current', eng(d.ib, 'A', 3)],
        ['Collector current', eng(d.ic, 'A', 3)],
        ['Against the base current', d.ib > 0 ? trim(d.ic / d.ib, 3) + ' times' +
          (d.saturated ? ', less than beta: it has run out of room' : ', which is beta') : 'no base current'],
        ['Base, emitter, collector', at(d.vb) + ', ' + at(d.ve) + ', ' +
          at(d.vce + d.ve) + (pnp ? ' above ground' : '')],
        ['Collector to emitter', trim(d.vce, 3) + ' V' + (pnp ? ', the collector the lower' : '')],
        ['State', state, d.saturated]
      ]);
      if (p.schemNote) {
        p.schemNote.textContent = pnp
          ? 'A PNP is the same stage upside down: the emitter goes to the rail, ' +
            'the load to ground, and the base sits R2/(R1 + R2) of the supply below the rail.'
          : 'the stage the controls are setting up';
      }
      p.fAnim = 1000;
      if (pnp) return { layout: pnpLayout(), circuit: MI.parseNetlist(pnpNetlist(d)) };
      const ck = configCircuit('ce', d);
      return { layout: configLayout('ce'), circuit: MI.parseNetlist(ck.netlist) };
    },

    /*
     * The JFET, worked the way it is drawn graphically: the device's own
     * curve of drain current against gate voltage, and the line the source
     * resistor imposes, vgs = vg - id rs. Where they cross is where it sits,
     * provided the drain has voltage to spare. When it has not (the ohmic
     * region, as at the starting values) the device passes less than that
     * curve says, so the curve it really sits on, the same device with only
     * the drain to source voltage it actually has, is drawn dashed.
     */
    fetBias(ctx) {
      const { p, d, t, Plot, swatch, ro, Fmt } = ctx;
      const { eng, trimText: trim } = Fmt;
      sizeStage(p, jfetLayout());
      const f = d.fet;
      const ohmic = f.region === 'ohmic';
      const curve = [], line = [], short = [];
      const xLo = FET_VP - 0.5, xHi = 0.6;
      for (let i = 0; i <= 300; i++) {
        const vgs = xLo + (xHi - xLo) * i / 300;
        curve.push({ x: vgs, y: DC.jfetCurrent(vgs, 1e9, FET_IDSS, FET_VP) });
        if (ohmic) short.push({ x: vgs, y: DC.jfetCurrent(vgs, f.vds, FET_IDSS, FET_VP) });
        // the source resistor's line: id = (vg - vgs) / rs
        line.push({ x: vgs, y: (f.vg - vgs) / d.re });
      }
      const top = FET_IDSS * 1.5;
      Plot.draw(p.graph, {
        xRange: [xLo, xHi], xFmt: x => trim(x, 2) + ' V', tokens: t,
        left: { min: 0, max: top, fmt: y => eng(y, 'A', 2) },
        traces: [{ pts: curve, colour: t.i, fill: t.iFill, axis: 'left', width: 2.4 }]
          .concat(ohmic ? dashTrace({ pts: short, colour: t.i, axis: 'left', width: 1.8 },
                                    p.graph, [xLo, xHi]) : [])
          .concat([{ pts: line.filter(q => q.y >= 0 && q.y <= top), colour: t.r, axis: 'left', width: 1.8 }]),
        marks: [{ x: FET_VP, colour: t.mark }, { x: 0, colour: t.faint }],
        cursor: { x: Math.max(xLo, Math.min(xHi, f.vgs)), colour: t.mark,
                  dot: { y: f.id, axis: 'left' }, label: 'where it sits' }
      });
      p.legend.innerHTML = swatch(t.i, 'Drain current against gate to source voltage, drain voltage to spare') +
        (ohmic ? swatch(dashed(t.i), 'The same, with only the ' + trim(f.vds, 2) +
                        ' V from drain to source it has') : '') +
        swatch(t.r, 'What the source resistor allows') +
        swatch(dashed(t.mark), 'Pinch off, ' + trim(FET_VP, 2) + ' V') +
        swatch(dashed(t.faint), '0 V: gate at the source voltage') +
        swatch(t.mark, 'Where it sits');
      const region = f.vgs > 0
        ? 'gate above the source: a real JFET’s gate junction would conduct, so this is no way to bias one'
        : { 'cut off': 'pinched right off, no current',
            'pinched off': 'amplifying: the drain current follows the gate',
            'ohmic': 'ohmic: RD drops so much that only ' + trim(f.vds, 2) +
                     ' V is left from drain to source, so it sits below the full curve, ' +
                     'on the dashed one, like a saturated transistor' }[f.region];
      p.readouts.innerHTML = ro([
        ['Gate, from the divider', trim(f.vg, 3) + ' V, and no gate current pulls it down'],
        ['Source', trim(f.vs, 3) + ' V'],
        ['Gate to source', trim(f.vgs, 3) + ' V', true],
        ['Drain current', eng(f.id, 'A', 3)],
        ['Drain', trim(f.vd, 3) + ' V'],
        ['State', region, f.region !== 'pinched off' || f.vgs > 0]
      ]);
      if (p.schemNote) {
        p.schemNote.textContent = 'RC is the drain resistor RD here and RE the source ' +
          'resistor RS. Beta does nothing: a FET has no base current.';
      }
      p.fAnim = 1000;
      return { layout: jfetLayout(), circuit: MI.parseNetlist(jfetNetlist(d)) };
    },

    /*
     * The dual gate MOSFET. Gate 2's steady voltage is the control here, so
     * the graph is the drain current against it, with the operating point.
     */
    dualGateBias(ctx) {
      const { p, d, t, Plot, swatch, ro, Fmt } = ctx;
      const { eng, trimText: trim } = Fmt;
      sizeStage(p, dualGateLayout());
      const g = d.dg, vg2 = d.vcc * d.r2 / (d.r1 + d.r2);
      const hi = Math.max(4, Math.min(d.vcc, vg2 * 1.5));
      const pts = [];
      for (let i = 0; i <= 120; i++) {
        const v = -2.5 + (hi + 2.5) * i / 120;
        // the same stage with gate 2 moved, everything else as set
        pts.push({ x: v, y: DC.dualGateBias({ vcc: d.vcc, vg1: 0, vg2: v, rd: d.rc, rs: d.re,
                                              idss: DG_IDSS, vp: DG_VP }).id });
      }
      const top = Math.max(1e-6, ...pts.map(q => q.y)) * 1.25;
      Plot.draw(p.graph, {
        xRange: [-2.5, hi], xFmt: x => trim(x, 2) + ' V', tokens: t,
        left: { min: 0, max: top, fmt: y => eng(y, 'A', 2) },
        traces: [{ pts: pts, colour: t.i, fill: t.iFill, axis: 'left', width: 2.4 }],
        marks: [{ x: 0, colour: t.faint }],
        cursor: { x: vg2, colour: t.mark, dot: { y: g.id, axis: 'left' },
                  label: 'gate 2 here' }
      });
      p.legend.innerHTML = swatch(t.i, 'Drain current against the voltage on gate 2') +
        swatch(dashed(t.faint), '0 V on gate 2') +
        swatch(t.mark, 'Where R1 and R2 hold gate 2');
      // gain from gate 1 with the source bypassed, against its most
      const gmOf = vg2v => {
        const vs = DC.dualGateBias({ vcc: d.vcc, vg1: 0, vg2: vg2v, rd: d.rc, rs: d.re,
                                     idss: DG_IDSS, vp: DG_VP }).vs;
        const at = x => DC.dualGateBias({ vcc: d.vcc, vg1: x, vg2: vg2v, rd: d.rc, rs: d.re,
                                          idss: DG_IDSS, vp: DG_VP, vs: vs }).id;
        return (at(1e-3) - at(-1e-3)) / 2e-3;
      };
      const gmHere = gmOf(vg2), gmFull = gmOf(Math.max(vg2, 6));
      // Gate 2 is limiting if raising it would give more gain. A low gate 2
      // holds the middle of the channel low and leaves the lower half short
      // of voltage, in its ohmic region, which can cost gain long before it
      // costs much current. If raising it would not help, and the lower half
      // is still short of voltage, it is the drain resistor that has starved
      // the device.
      const gate2Limits = gmHere < 0.97 * gmFull;
      p.readouts.innerHTML = ro([
        ['Gate 2, from R1 and R2', trim(vg2, 3) + ' V'],
        ['Gate 1', '0 V, returned to ground through RG'],
        ['Source', trim(g.vs, 3) + ' V, so gate 1 sits ' + trim(Math.abs(g.vg1s), 3) + ' V ' +
          (g.vg1s <= 0 ? 'below' : 'above') + ' the source'],
        ['Drain current', eng(g.id, 'A', 3)],
        ['Gain from gate 1', trim(100 * gmHere / Math.max(1e-12, gmFull), 3) +
          '% of what this stage can give', gate2Limits],
        ['Gate 2 is', g.id < 1e-7 ? 'low enough to turn the device off'
          : (gate2Limits ? 'low enough to throttle: the lower half is left short of voltage, and the gain falls'
            : (g.throttled ? 'out of the way, but RD drops so much that the device is short of voltage'
                           : 'high enough to stay out of the way')), true]
      ]);
      if (p.schemNote) {
        p.schemNote.textContent = 'R1 and R2 hold gate 2, and CG ties it to the rail, ' +
          'which is signal ground. RC is the drain resistor, RE the source resistor.';
      }
      p.fAnim = 1000;
      return { layout: dualGateLayout(), circuit: MI.parseNetlist(dualGateNetlist(d)) };
    },

    /*
     * 2I4 at Full covers two things: the three configurations and the classes.
     * The toggle picks which one you are looking at; the prose walks through
     * the configurations first and then the classes.
     */
    amp(ctx) {
      if (ctx.p.topology === 'classes') return BENCH.panels.classes(ctx);
      const { p, d, t, Plot, swatch, ro, Fmt } = ctx;
      const { eng, trimText: trim } = Fmt;
      sizeStage(p, configLayout(p.topology), true);
      const cfg = measure(p.topology, d);

      /*
        * Both traces in real volts, on their own axes: input on the right,
        * output on the left. Normalising them both to fit made the axis
        * meaningless and hid the gain, which is the one thing worth seeing.
        */
      const vin = d.drive;
      // A saturated or cut off transistor is a switch, closed or open, and a
      // small signal at the base does not come out at all. The small signal
      // figures would describe a stage that is not there, so say so instead.
      const notAmp = d.saturated || d.state === 'cut off';
      if (notAmp) cfg.av = 0;
      const vout = vin * cfg.av;
      // How far the output can actually swing before it runs into the supply
      // at one end or saturation at the other. A small signal model does not
      // know about either, so it will cheerfully report 39 V from a 12 V rail.
      // The collector sits VCE above the emitter, so it can fall to about
      // 0.2 V above the emitter and rise to the rail.
      const limit = p.topology === 'cc'
        ? Math.max(0.05, Math.min(d.ve, d.vcc - d.ve))
        : Math.max(0.05, Math.min(Math.max(0, d.vce - 0.2), d.vcc - d.vce - d.ve));
      const clipped = vout > limit;
      const span = Math.min(vout, limit);
      const inPts = [], outPts = [];
      for (let i = 0; i <= 400; i++) {
        const cyc = 2 * i / 400;
        const sn = Math.sin(2 * Math.PI * cyc);
        inPts.push({ x: cyc, y: vin * sn });
        const raw = vout * sn * (cfg.phase ? -1 : 1);
        outPts.push({ x: cyc, y: Math.max(-limit, Math.min(limit, raw)) });
      }
      // and the same two signals as currents, which is where the difference
      // between these three configurations really shows
      const iin = vin / Math.max(1e-9, cfg.zin);
      if (notAmp) cfg.ai = 0;
      // the output current flattens with the output voltage: it is that
      // voltage across the load, so it can be no more than the swing allows
      const iLimit = limit / (p.topology === 'cc' ? d.re : d.rc);
      const ioutWanted = iin * cfg.ai;
      const iout = Math.min(ioutWanted, iLimit);
      const inI = [], outI = [];
      for (let i = 0; i <= 400; i++) {
        const cyc = 2 * i / 400;
        const sn = Math.sin(2 * Math.PI * cyc);
        inI.push({ x: cyc, y: iin * sn });
        // base and collector current rise and fall together. It is the
        // collector voltage that inverts, because more current means more
        // drop across the load.
        outI.push({ x: cyc, y: Math.max(-iLimit, Math.min(iLimit, ioutWanted * sn)) });
      }

      /*
        * Each trace on its own axis, the way a scope gives each channel its
        * own volts per division. Sharing one axis buried the input: at a gain
        * of nearly two hundred it was a flat line on the zero, so the
        * inversion had nothing to be seen against.
        */
      const vInSpan = Math.max(vin, 1e-9) * 1.2;
      // with nothing coming out, the output shares the input's scale rather
      // than inventing one around zero
      const vOutSpan = notAmp ? vInSpan : Math.max(span, 1e-9) * 1.2;
      Plot.draw(p.graph, {
        xRange: [0, 2], xFmt: x => trim(x, 2) + ' cyc', tokens: t,
        band: [0, 0.43], hideX: true,
        left: { min: -vOutSpan, max: vOutSpan, fmt: y => eng(y, 'V', 2) },
        right: { min: -vInSpan, max: vInSpan, fmt: y => eng(y, 'V', 2) },
        // the same quantity in and out, so the same colour: the input a wide
        // translucent band underneath, the output a solid line on top, so that where
        // the two coincide (a gain of one, or two currents in step) both show
        traces: [{ pts: inPts, colour: tint(t.v, 0.45), axis: 'right', width: 7 },
                 { pts: outPts, colour: t.v, axis: 'left', width: 2.2 }],
        cursor: null
      });
      const iInSpan = Math.max(iin, 1e-12) * 1.2;
      const iOutSpan = notAmp ? iInSpan : Math.max(iout, 1e-12) * 1.2;
      Plot.draw(p.graph, {
        xRange: [0, 2], xFmt: x => trim(x, 2) + ' cyc', tokens: t,
        band: [0.57, 1], append: true,
        left: { min: -iOutSpan, max: iOutSpan, fmt: y => eng(y, 'A', 2) },
        right: { min: -iInSpan, max: iInSpan, fmt: y => eng(y, 'A', 2) },
        traces: [{ pts: inI, colour: tint(t.i, 0.45), axis: 'right', width: 7 },
                 { pts: outI, colour: t.i, axis: 'left', width: 2.2 }],
        cursor: null
      });
      const sameV = Math.abs(cfg.av - 1) < 0.15;
      const sameI = Math.abs(cfg.ai - 1) < 0.15;
      // name the scale on each channel, so that two traces the same height on
      // screen are read as the gain figure they are and not as the same size
      // Not amplifying, there is no output and no scale worth naming.
      p.legend.innerHTML = notAmp
        ? swatch(tint(t.v, 0.45), 'Voltage in: ±' + eng(vin, 'V', 2)) +
          swatch(t.v, 'Voltage out: none') +
          '<span>upper: volts &nbsp; lower: amps &nbsp; nothing comes out: the transistor is ' +
          (d.saturated ? 'saturated' : 'cut off') + '</span>'
        : swatch(tint(t.v, 0.45), 'Voltage in, right scale: ±' + eng(vin, 'V', 2)) +
          swatch(t.v, 'Voltage out, left scale: ±' + eng(span, 'V', 2)) +
          swatch(tint(t.i, 0.45), 'Current in, right scale: ±' + eng(iin, 'A', 2)) +
          swatch(t.i, 'Current out, left scale: ±' + eng(iout, 'A', 2)) +
          '<span>upper: volts &nbsp; lower: amps &nbsp; wide band in, line out, each on its own scale</span>' +
          (cfg.phase > 90 ? '<span>output voltage inverted: it falls as the input rises</span>' : '') +
          (sameV ? '<span>the two voltage traces sit on each other: gain of one</span>' : '') +
          (sameI ? '<span>the two current traces sit on each other: gain of one</span>' : '');

      if (notAmp) {
        p.readouts.innerHTML = ro([
          ['State', d.saturated
            ? 'saturated: the bias has turned it hard on, a closed switch'
            : 'cut off: the base is below the 0.6 V it needs, an open switch', true],
          ['Voltage gain', 'none: the signal does not get through'],
          ['Current gain', 'none'],
          ['To amplify', d.saturated ? 'lower the base: raise R1 or lower R2, or raise RE'
                                     : 'raise the base: lower R1 or raise R2']
        ]);
        // no signal current moves, so none is drawn
        if (p.schemNote) p.schemNote.textContent = 'no signal gets through, so nothing moves';
        return { layout: configLayout(p.topology) };
      }
      // what the transistor does with current, before the bias divider takes
      // its share of the input: beta for common emitter, beta + 1 for the
      // follower, just under one for common base
      const device = { ce: ['beta', d.beta], cc: ['beta + 1', d.beta + 1],
                       cb: ['beta / (beta + 1)', d.beta / (d.beta + 1)] }[p.topology];
      p.readouts.innerHTML = ro([
        ['Input impedance of the stage', eng(cfg.zin, 'Ω', 3), p.topology === 'cb'],
        ['of the transistor alone', eng(cfg.zinDevice, 'Ω', 3)],
        ['Output impedance of the stage', eng(cfg.zout, 'Ω', 3), p.topology === 'cc'],
        ['of the transistor alone', eng(cfg.zoutDevice, 'Ω', 3)],
        ['Voltage gain', cfg.av < 1.5 ? trim(cfg.av, 3) : '×' + trim(cfg.av, 3)],
        ['Current gain of the stage', trim(cfg.ai, 3) +
          (p.topology === 'cc' ? ', after R1 and R2 take most of the input current' : '')],
        ['of the transistor alone', trim(device[1], 3) + ', ' + device[0]],
        ['Phase change', cfg.phase + '°, ' +
          (cfg.phase > 90 ? 'inverted' : 'in phase'), cfg.phase > 90],
        ['Signal current in', eng(iin, 'A', 3)],
        ['Signal current out', eng(iout, 'A', 3) + (ioutWanted > iLimit
          ? ', all the swing allows: ' + eng(ioutWanted, 'A', 3) + ' wanted' : '')],
        ['Output swing', eng(vout, 'V', 3) + ' wanted, ' + eng(limit, 'V', 3) +
         ' available' + (clipped ? ', so it flattens' : ''), clipped]
      ]);
      p.fAnim = 1000;
      return { layout: configLayout(p.topology), circuit: cfg.circuit };
    },

    /** Diode curve, with the operating point where the cursor is. */
    diode(ctx) {
      const { p, d, t, level, Plot, swatch, ro, Fmt } = ctx;
      const { eng, trimText: trim } = Fmt;
      const zener = level === 'full' ? 5.1 : null;
      sizeStage(p, diodeLayout(zener));
      // where it really sits when fed from the supply through R
      // reverse biased for the Zener, forward biased for the plain diode
      const op = zener ? zenerOperating(d.vcc, d.rc, zener)
                       : diodeOperating(d.vcc, d.rc, {});
      // the axis reaches past the current the circuit sets, whatever it is
      const top = Math.max(0.03, Math.ceil(op.i * 1.2 / 0.01) * 0.01);
      const pts = [];
      const vLo = zener ? -7 : -1, vHi = 0.9;
      // Past the knee the Zener is drawn with the same 5 Ω slope the
      // operating point uses, so the dot sits on the curve it is drawn on.
      const current = v => zener && v < -zener ? -(-v - zener) / ZENER_SLOPE
                                                : DC.diodeCurrent(v, {});
      for (let i = 0; i <= 500; i++) {
        const v = vLo + (vHi - vLo) * i / 500;
        const i_ = current(v);
        pts.push({ x: v, y: Math.max(-top, Math.min(top, i_)) });
      }
      const sits = zener ? -op.vd : op.vd;
      const fc = p.cursor === null ? sits : vLo + (vHi - vLo) * p.cursor;
      const ic = current(fc);
      const spec = {
        xRange: [vLo, vHi], xFmt: v => trim(v, 2) + ' V', tokens: t,
        left: { min: -top, max: top, fmt: y => eng(y, 'A', 2) },
        traces: [{ pts: pts, colour: t.i, axis: 'left', width: 2.2 }],
        marks: zener ? [{ x: -zener, colour: t.mark }] : [],
        cursor: { x: fc, colour: t.mark, label: trim(fc, 3) + ' V' }
      };
      Plot.draw(p.graph, spec);
      p.legend.innerHTML = swatch(t.i, 'Current through the diode') +
        (zener ? swatch(dashed(t.mark), 'Breakdown, ' + zener + ' V') : '') +
        swatch(t.mark, 'The cursor: where the circuit puts it, or drag it');
      const note = zener
          ? (op.i > 0
            ? 'R here is the RC slider. It sets the current through the Zener, ' +
              'and the Zener holds close to its rated 5.1 V: the little it rises ' +
              'with more current is its slope resistance, 5 Ω here.'
            : 'R here is the RC slider. The supply is below 5.1 V, so the Zener ' +
              'is not conducting and the whole supply sits across it.')
          : 'R here is the RC slider. With the supply, it is all that changes ' +
            'anything on this panel: together they set the current, and the ' +
            'diode takes whatever voltage goes with it.';
      if (p.schemNote) p.schemNote.textContent = note;
      p.readouts.innerHTML = ro(zener ? [
        ['Supply', trim(d.vcc, 3) + ' V'],
        ['Across the resistor', trim(op.vr, 3) + ' V'],
        [op.i > 0 ? 'Held across the Zener' : 'Across the Zener, not conducting', trim(op.vd, 3) + ' V', true],
        ['Current through both', eng(op.i, 'A', 3)],
        ['Power in the Zener', eng(op.p, 'W', 3) +
          (op.p > 0.4 ? ', more than a 400 mW diode will take' : ', within a 400 mW diode'),
         op.p > 0.4],
        ['At the cursor', trim(fc, 3) + ' V, ' + eng(ic, 'A', 3)]
      ] : [
        ['Supply', trim(d.vcc, 3) + ' V'],
        ['Across the resistor', trim(op.vr, 3) + ' V'],
        ['Across the diode', trim(op.vd, 3) + ' V'],
        ['Current through both', eng(op.i, 'A', 3), true],
        ['At the cursor', trim(fc, 3) + ' V, ' + eng(ic, 'A', 3)]
      ]);
      // one steady current round the loop, the one the readouts give
      return { layout: diodeLayout(zener),
               flow: { mode: 'dc', currents: { RC: op.i }, note: note } };
    },

    /**
     * The varicap. One curve for what the control voltage does to the
     * capacitance, and one for what that does to the frequency, because the
     * capacitance on its own does not tell anyone why the device matters.
     */
    varicap(ctx) {
      const { p, t, Plot, swatch, ro, Fmt } = ctx;
      const { eng, trimText: trim } = Fmt;
      sizeStage(p, varicapLayout(), true);
      // a real varicap is swept well into the tens of volts, which is
      // where most of the capacitance change happens
      const vLo = 0, vHi = 40;
      const vr = vLo + (vHi - vLo) * (p.cursor === null || p.cursor === undefined
        ? 0.15 : p.cursor);
      const cap = [], freq = [];
      for (let i = 0; i <= 240; i++) {
        const v = vLo + (vHi - vLo) * i / 240;
        cap.push({ x: v, y: varicapC(v) * 1e12 });
        freq.push({ x: v, y: varicapF(v) / 1e6 });
      }
      const common = {
        xRange: [vLo, vHi], xFmt: v => trim(v, 2) + ' V', tokens: t,
        cursor: { x: vr, colour: t.mark, label: trim(vr, 3) + ' V' }
      };
      const capMax = varicapC(vLo) * 1e12;
      const fMax = varicapF(vHi) / 1e6;
      Plot.draw(p.graph, Object.assign({
        band: [0, 0.43], hideX: true,
        left: { min: 0, max: capMax * 1.1, fmt: y => trim(y, 3) + ' pF' },
        traces: [{ pts: cap, colour: t.c, axis: 'left', width: 2.2 }]
      }, common));
      // frequency has no colour of its own in the scheme, so it is drawn in ink
      Plot.draw(p.graph, Object.assign({
        band: [0.57, 1], append: true,
        left: { min: 0, max: fMax * 1.1, fmt: y => trim(y, 3) + ' MHz' },
        traces: [{ pts: freq, colour: t.ink, axis: 'left', width: 2.2 }]
      }, common));

      p.legend.innerHTML =
        swatch(t.c, 'Capacitance of the diode') +
        swatch(t.ink, 'What it tunes a 4.7&nbsp;µH coil to') +
        swatch(t.mark, 'The control voltage, drag it');
      if (p.schemNote) {
        p.schemNote.textContent = 'R is large enough to feed the control ' +
          'voltage in without damping the tuned circuit, and CB stops the coil ' +
          'shorting it to ground. Drag the marker to change the control voltage.';
      }
      p.readouts.innerHTML = ro([
        ['Control voltage', trim(vr, 3) + ' V'],
        ['Capacitance', eng(varicapC(vr), 'F', 3), true],
        ['With no bias at all', eng(VARICAP_C0, 'F', 3)],
        ['Coil', eng(VARICAP_L, 'H', 2) + ', fixed'],
        ['Resonant frequency', eng(varicapF(vr), 'Hz', 4)],
        ['Range over the whole sweep', eng(varicapF(vLo), 'Hz', 3) + ' to ' +
          eng(varicapF(vHi), 'Hz', 3)]
      ]);
      // the charge moves at the frequency this setting actually tunes to, so
      // winding the control voltage up visibly speeds the circuit up
      p.fAnim = varicapF(vr);
      return { layout: varicapLayout(),
               circuit: window.MNA.parseNetlist(varicapNetlist(varicapC(vr))) };
    },

    /** The load line, with the operating point on it. */
    loadline(ctx) {
      const { p, d, t, Plot, swatch, ro, Fmt } = ctx;
      const { eng, trimText: trim } = Fmt;
      sizeStage(p, configLayout('ce'));
      const line = [{ x: 0, y: d.iMax }, { x: d.vcc, y: 0 }];

      // One curve per base current, the way these are conventionally drawn.
      // current is nearly flat against collector voltage, rising a little
      // because the device is not a perfect current source, and collapsing
      // near zero volts where the transistor runs out of room.
      const curve = (ib) => {
        const pts = [];
        for (let i = 0; i <= 160; i++) {
          const v = d.vcc * i / 160;
          const flat = d.beta * ib * (1 + v / 100) / (1 + Math.max(0, d.vceq) / 100);
          pts.push({ x: v, y: flat * (1 - Math.exp(-v / 0.08)) });
        }
        return pts;
      };
      // round base currents that bracket the one the bias actually produces
      const nice = (v) => {
        const e = Math.pow(10, Math.floor(Math.log10(Math.max(1e-12, v))));
        const m = v / e;
        return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * e;
      };
      const step = nice(d.ib / 2);
      const family = [1, 2, 3, 4].map(k => k * step);

      // every curve is collector current: the family a paler orange behind
      const family_i = tint(t.i, 0.45);
      const traces = family.map(ib => ({
        pts: curve(ib), colour: family_i, axis: 'left', width: 1.2
      }));
      // the curve the bias has actually landed on, and the load across them,
      // which is the collector resistor's own line
      traces.push({ pts: curve(d.ib), colour: t.i, axis: 'left', width: 2.2 });
      traces.push({ pts: line, colour: t.r, axis: 'left', width: 2 });

      const top = Math.max(d.iMax, d.beta * family[family.length - 1]) * 1.1;
      Plot.draw(p.graph, {
        xRange: [0, d.vcc], xFmt: v => trim(v, 3) + ' V', tokens: t,
        left: { max: top, fmt: y => eng(y, 'A', 2) },
        traces: traces,
        marks: [{ x: d.vcc / 2, colour: t.mark }],
        // each curve named by its base current, written in current's ink. A
        // name the bias curve would run through is left off: that curve is
        // all but the bias curve, and the base current is in the readouts.
        labels: family.map(ib => {
          const at = k => d.beta * k * (1 + d.vcc * 0.97 / 100) /
            (1 + Math.max(0, d.vceq) / 100);
          const tall = top * 20 / Math.max(60, p.graph.clientHeight - 52);
          const gap = at(d.ib) - at(ib);
          return gap > -2 * top / 100 && gap < tall ? null
            : { x: d.vcc * 0.97, y: at(ib), axis: 'left', text: eng(ib, 'A', 2), colour: t.iInk };
        }).filter(Boolean),
        cursor: { x: Math.max(0, d.vceq), colour: t.mark,
                  dot: { y: d.icq, axis: 'left' }, label: 'operating point' }
      });

      p.legend.innerHTML =
        swatch(family_i, 'One curve per base current') +
        swatch(t.i, 'The curve this bias sits on') +
        swatch(t.r, 'Every point the collector load allows') +
        swatch(dashed(t.mark), 'Half the supply') +
        swatch(t.mark, 'The operating point');

      const clipping = d.vceq < 1 || d.vceq > d.vcc - 1;
      // the usual rule: the divider has to carry well more than the base
      // takes, or the bias moves when the base current does
      const dividerI = d.vcc / (d.r1 + d.r2);
      const ratio = dividerI / Math.max(1e-12, d.ib);
      p.readouts.innerHTML = ro([
        ['Collector current', eng(d.icq, 'A', 3)],
        ['Collector to emitter', trim(Math.max(0, d.vceq), 3) + ' V',
         Math.abs(d.vceq - d.vcc / 2) > d.vcc * 0.12],
        ['Base current needed', eng(d.ib, 'A', 3)],
        ['Current down the divider', eng(dividerI, 'A', 3)],
        ['Divider against base current', d.ib > 0
          ? trim(ratio, 2) + ' times' +
            (ratio < 10 ? ', under ten times: the base current pulls the bias down' : ', enough to hold the bias')
          : 'no base current: the transistor is cut off',
         d.ib > 0 && ratio < 10],
        ['Headroom', clipping ? 'will clip' : 'room both ways', clipping],
        ['Power in the transistor', (() => {
          const pw = Math.max(0.2, d.vceq) * d.icq;
          return eng(pw, 'W', 3) + (pw > 0.3 ? ', beyond a small signal device'
                                             : ', a small signal device copes');
        })(), Math.max(0.2, d.vceq) * d.icq > 0.3]
      ]);
      if (p.schemNote) p.schemNote.textContent = 'the stage this line belongs to';
      p.fAnim = 1000;
      return { layout: configLayout('ce'),
               circuit: MI.parseNetlist(configCircuit('ce', d).netlist) };
    },

    /*
     * The flagship. Bias sets the conduction angle, the conduction angle sets
     * the class and the efficiency, and the harmonics appear as the price.
     */
    classes(ctx) {
      const { p, d, t, Plot, swatch, ro, Fmt } = ctx;
      const { eng, trimText: trim } = Fmt;
      const kind = classKind(d.cls);
      // Cut off by the bias with the drive too small to reach turn on, there
      // is no class and so no typical circuit: draw the stage as it is biased.
      const off = d.cls === 'off';
      sizeStage(p, classLayout(off ? 'A' : kind), true);

      /*
       * The current pulse the device passes, over two cycles, in amperes: the
       * base voltage above turn on, across the unbypassed RE. The base voltage
       * is on its own scale on the right, the two scales in the same ratio,
       * so in class A the two traces lie together, and both zeros are on one
       * grid line, so the current is seen to stop exactly where the base
       * falls below turn on.
       */
      const N = 1024;
      const wave = DC.collectorWave(d.headroom, d.drive, N);   // volts above turn on
      const vHi = Math.max(0, d.headroom + d.drive), vLo = Math.min(0, d.headroom - d.drive);
      let grid = null;
      for (let k = 0; k <= 3; k++) {
        if (vLo < 0 && k === 0) continue;
        const step = 1.08 * Math.max(vHi / (4 - k), k ? -vLo / k : 0, 1e-9);
        if (!grid || step < grid.step) grid = { step: step, k: k };
      }
      const vMin = -grid.k * grid.step, vMax = (4 - grid.k) * grid.step;
      const zeroed = (unit, span) => y => Math.abs(y) < span * 1e-6 ? '0 ' + unit : eng(y, unit, 2);
      const pts = [], drivePts = [];
      for (let i = 0; i < N * 2; i++) {
        pts.push({ x: i / N, y: d.saturated ? d.ic : wave[i % N] / d.re });
        drivePts.push({ x: i / N, y: d.headroom + d.drive * Math.sin(2 * Math.PI * i / N) });
      }
      Plot.draw(p.graph, {
        xRange: [0, 2], xFmt: x => trim(x, 2) + ' cyc', tokens: t,
        band: [0, 0.43], hideX: true,
        left: { min: vMin / d.re, max: vMax / d.re, fmt: zeroed('A', vMax / d.re) },
        right: { min: vMin, max: vMax, fmt: zeroed('V', vMax) },
        // the current first and thicker, the drive on top: in class A the two
        // coincide, and the thin blue still shows along the orange
        traces: [{ pts: pts, colour: t.i, fill: t.iFill, fillTo: 0, axis: 'left', width: 2.6 },
                 { pts: drivePts, colour: t.v, axis: 'right', width: 1.4 }],
        cursor: null
      });

      // and what that pulse contains, against its own fundamental. The wave
      // is resampled at 64 points a cycle, so the sample rate is 64 per cycle.
      const fpts = [];
      if (!d.saturated && !off) {
        const rep = new Float64Array(8192);
        for (let i = 0; i < 8192; i++) rep[i] = wave[(i * 16) % N];
        const sp = DSPI.spectrum(rep, N / 16, { floor: -300 });
        const fund = sp.db[Math.round(1 / sp.binWidth)];
        for (let i = 1; i < sp.bins && sp.freq[i] <= 6; i++) {
          fpts.push({ x: sp.freq[i], y: Math.max(0, sp.db[i] - fund + 70) });
        }
      }
      Plot.draw(p.graph, {
        xRange: [0, 6], xFmt: x => trim(x, 2) + 'f', tokens: t,
        band: [0.57, 1], append: true,
        left: { max: 80, fmt: y => trim(Math.round(y - 70), 3) + ' dB' },
        traces: [{ pts: fpts, colour: t.i, fill: t.iFill, axis: 'left', width: 1.4 }],
        marks: [1, 2, 3, 4, 5].map(k => ({ x: k, colour: t.mark })),
        cursor: null
      });
      p.legend.innerHTML = swatch(t.v, 'Base voltage above turn on, right scale') +
        swatch(t.i, 'Current one device passes, left scale') +
        '<span>upper: two cycles &nbsp; lower: what that current contains, against its fundamental</span>' +
        swatch(dashed(t.mark), 'Fundamental and its harmonics');

      const circuitName = { A: 'one device, its collector load a resistor',
        AB: 'two devices in push pull, two diodes holding each just on',
        B: 'two devices in push pull, each taking one half',
        C: 'one device, its collector load a tuned circuit' }[kind];
      p.readouts.innerHTML = ro(d.saturated ? [
        ['Which is class', 'none: the bias has saturated the transistor', true],
        ['To get back to class A', 'lower the base: raise R1 or lower R2, or raise RE']
      ] : [
        ['Conducts for', trim(d.thetaDeg, 4) + '°'],
        ['Which is class', d.cls === 'off' ? 'none: the drive never reaches turn on' : d.cls, true],
        ['Efficiency at best', d.cls === 'off' ? 'none: no current flows'
          : trim(d.eff * 100, 3) + '%, with the output swinging the full supply'],
        ['Typical circuit, drawn', off ? 'none, as there is no class: this is the stage as biased'
          : circuitName],
        ['Needs a tuned load?', d.cls === 'off' ? 'nothing to load: no current flows'
          : d.cls === 'C' ? 'yes, essential'
          : (d.cls === 'B' || d.cls === 'AB' ? 'one device alone would; two in push pull do not' : 'no'),
         d.cls === 'C']
      ]);
      if (off) {
        if (p.schemNote) {
          p.schemNote.textContent = 'The drive never reaches turn on, so the device never ' +
            'conducts and nothing moves. With no class there is no typical circuit to draw.';
        }
        return { layout: classLayout('A') };
      }
      if (p.schemNote) {
        p.schemNote.textContent = {
          A: 'RE is left unbypassed: the current then follows the base above 0.6 V in a straight line.',
          AB: 'An NPN on top for the positive half, a PNP below for the negative. The diodes hold each base a little past turn on, so the handover is smooth.',
          B: 'An NPN on top for the positive half, a PNP below for the negative. Bases joined: each waits for 0.6 V of its own, which leaves a dead band at the crossover.',
          C: 'The tuned circuit rings at the fundamental and ignores the harmonics.'
        }[kind];
      }
      if (p.schemNote && kind !== 'A') {
        p.schemNote.textContent += ' This is the usual circuit for the class the bias has reached; the figures are worked for one device biased by R1, R2 and RE.';
      }
      p.fAnim = kind === 'A' ? 1000 : CLASS_F;
      return { layout: classLayout(kind), circuit: MI.parseNetlist(classNetlist(kind, d)) };
    },

    /** Feedback around a stage, and the two conditions for oscillation. */
    oscillator(ctx) {
      const { p, d, t, Plot, swatch, ro, Fmt } = ctx;
      const { trimText: trim, eng } = Fmt;
      const o = d.osc;
      const off = o.state !== 'active';
      // Intermediate asks for the idea and the frequency; the loop gain and
      // the phase are Full material, so only the swing is drawn there
      const full = ctx.level === 'full';
      sizeStage(p, colpittsLayout(), full);

      /*
       * How the amplitude moves from cycle to cycle. Each trip round the loop
       * multiplies it by the loop gain at that amplitude, spread over the
       * cycles the tank's loaded Q takes to respond: a gain of one leaves it
       * where it is, more grows it, less lets it decay.
       */
      const cycles = 30, perCycle = 24;
      const env = [d.drive];
      for (let n = 0; n < cycles; n++) {
        const a = env[n], here = oscAtSwing(o, a);
        // and never past the clamp: the base cannot swing beyond it at all
        env.push(off ? 0 : Math.min(o.baseRoom || Infinity,
                                    a * Math.exp(Math.PI * (here.T - 1) / here.qL)));
      }
      const pts = [];
      for (let i = 0; i <= cycles * perCycle; i++) {
        const cyc = i / perCycle, n = Math.min(cycles - 1, Math.floor(cyc)), u = cyc - n;
        const a = off ? 0 : env[n] * Math.pow(env[n + 1] / Math.max(1e-12, env[n]), u);
        pts.push({ x: cyc, y: a * Math.sin(2 * Math.PI * cyc) });
      }
      const top = Math.max(1e-6, ...env) * 1.15;
      Plot.draw(p.graph, {
        xRange: [0, cycles], xFmt: x => trim(x, 2) + ' cyc', tokens: t,
        band: full ? [0, 0.43] : [0, 1], hideX: full,
        left: { min: -top, max: top, fmt: y => eng(y, 'V', 2) },
        traces: [{ pts: pts, colour: t.v, axis: 'left', width: 1.6 }],
        cursor: null
      });
      const growing = o.T >= 1;
      const swingWords = off ? 'nothing, the transistor is not amplifying'
        : growing ? 'growing, the loop makes more than it loses'
          : (o.Tss > 1 ? 'shrinking back towards where it settles'
                       : 'dying away, the loop cannot replace what is lost');
      if (!full) {
        p.legend.innerHTML = swatch(t.v, 'Swing at the base over ' + cycles +
          ' cycles, starting from the Drive setting: ' + swingWords);
        p.readouts.innerHTML = ro(off ? [
          ['Will it start', 'no: the transistor is not biased to amplify, so nothing tops the tuned circuit up', true]
        ] : [
          ['Frequency', eng(o.f, 'Hz', 4), true],
          ['Set by', 'the coil, ' + eng(OSC_L, 'H', 2) + ', with CA and CB in series, ' + eng(OSC_CSER, 'F', 3)]
        ]);
        if (p.schemNote) {
          p.schemNote.textContent = 'The transistor tops up the tuned circuit, the coil with CA ' +
            'and CB, on every cycle. The coil and capacitors are fixed, so the frequency is too.';
        }
        p.fAnim = o.f || OSC_F0;
        if (off) return { layout: colpittsLayout() };
        return { layout: colpittsLayout(),
                 circuit: MI.parseNetlist(oscNetlist(d, o.b, o.gm, Math.max(1e-6, d.drive))) };
      }

      // and the reason: the loop gain against the size of the swing, on a
      // logarithmic scale of swing from 1 mV to 10 V at the base
      const lx0 = -3, lx1 = 1;
      const gainPts = [], unity = [];
      for (let i = 0; i <= 160; i++) {
        const lx = lx0 + (lx1 - lx0) * i / 160;
        gainPts.push({ x: lx, y: off ? 0 : oscAtSwing(o, Math.pow(10, lx)).T });
        unity.push({ x: lx, y: 1 });
      }
      const gTop = Math.max(2, Math.ceil(o.Tss * 1.15 / 0.4) * 0.4);
      const at10 = lx => Math.max(lx0, Math.min(lx1, lx));
      Plot.draw(p.graph, {
        xRange: [lx0, lx1], xFmt: x => eng(Math.pow(10, x), 'V', 1), tokens: t,
        band: [0.57, 1], append: true,
        left: { min: 0, max: gTop, fmt: y => trim(y, 2) },
        // loop gain is a plain ratio, with no colour of its own: ink, and
        // the line of one a neutral dash
        traces: dashTrace({ pts: unity, colour: t.faint, axis: 'left', width: 1.2 },
                          p.graph, [lx0, lx1])
          .concat([{ pts: gainPts, colour: t.ink, axis: 'left', width: 2.2 }]),
        marks: o.settle > 0 ? [{ x: at10(Math.log10(o.settle)), colour: t.mark }] : [],
        cursor: { x: at10(Math.log10(d.drive)), colour: t.mark,
                  dot: { y: o.T, axis: 'left' }, label: 'Drive' }
      });
      p.legend.innerHTML = swatch(t.v, 'Swing at the base over ' + cycles +
        ' cycles, starting from the Drive setting: ' + swingWords) +
        swatch(t.ink, 'Loop gain against the swing at the base, 1 mV to 10 V') +
        swatch(dashed(t.faint), 'A loop gain of one') +
        (o.settle > 0 ? swatch(dashed(t.mark), 'Where it settles') : '') +
        swatch(t.mark, 'The Drive setting') +
        '<span>upper: the swing, cycle by cycle &nbsp; lower: why it grows or shrinks</span>';

      p.readouts.innerHTML = ro(off ? [
        ['Will it start', o.state === 'cut off'
          ? 'no: the transistor is cut off, so there is no gain at all'
          : 'no: the bias has saturated the transistor, hard on, so there is no gain', true]
      ] : [
        ['Frequency, where the loop comes back in phase', eng(o.f, 'Hz', 4)],
        ['Coil, and CA and CB in series', eng(OSC_L, 'H', 2) + ' with ' + eng(OSC_CSER, 'F', 3)],
        ['Emitter follower voltage gain', trim(o.A, 3) + ', under one as a follower always is'],
        ['Tap back up to the base', '×' + trim(o.N, 3) + ', against (CA + CB) / CA = 2 with no losses'],
        ['So the follower needs at least', trim(1 / Math.max(1e-9, o.N), 3)],
        ['Loop gain at this swing', trim(o.T, 3) + (growing ? ', at least one: it grows' : ', under one: it shrinks'), true],
        ['Loop gain for a tiny swing', trim(o.Tss, 3) + (o.Tss > 1 ? ', so it starts from noise' : ', so it will never start')],
        ['Settles at', o.settle > 0 ? eng(o.settle, 'V', 3) + ' peak at the base, ' +
          (o.clamped ? 'where it meets the supply: a junction drop above the rail the transistor saturates, and the loop gain falls to one'
                     : 'where the loop gain has fallen to one')
                                    : 'nothing: it dies away'],
        ['The other condition', 'the feedback has to arrive in phase, 0° round the loop']
      ]);
      if (p.schemNote) {
        p.schemNote.textContent = 'The transistor runs as an emitter follower. ' +
          'Its emitter drives the tap between CA and CB; the coil and the two ' +
          'capacitors ring together, and the top of the coil feeds the base. ' +
          'R1, R2 and RE are the sliders; the coil and capacitors are fixed.';
      }
      p.fAnim = o.f || OSC_F0;
      if (off) return { layout: colpittsLayout() };
      return { layout: colpittsLayout(),
               circuit: MI.parseNetlist(oscNetlist(d, o.b, o.gm, Math.max(1e-6, d.drive))) };
    }
  },

  items: [
    {
      code: '2I1',
      levels: ['intermediate', 'full'],
      panel: 'diode',
      introduces: {
        intermediate: ['forward bias', 'reverse bias', 'depletion layer'],
        full: ['Zener diode']
      },
      heading: { intermediate: 'The diode, and which way it lets current through',
                 full: 'The Zener diode and its reverse characteristic' },
      lead: { intermediate: 'Start with the simplest device there is, because the transistor is two of these back to back.',
              full: 'Run the same diode backwards far enough and something useful happens.' },
      headline: {
        intermediate: 'A diode conducts one way only, once you give it enough forward voltage to start.',
        full: 'A Zener diode conducts backwards once you pass its rated voltage, and holds there.'
      },
      formulas: { intermediate: [], full: ['zseries', 'zpower'] },
      workNote: {
        intermediate: 'No formula here. What matters is the shape of the curve: nothing much happens until about 0.6 V, and then the current climbs very steeply indeed. Drag the cursor across it.',
        full: 'Watch the left hand side of the curve. Nothing flows until the applied voltage passes the rated figure, and then current rises almost vertically while the voltage across the diode barely moves. That is what makes it useful as a reference.'
      },
      explain: {
        intermediate: [
          'A junction between two kinds of silicon has a region either side of it swept clear of free charge, called the depletion layer. It acts as a barrier.',
          'Apply a voltage the right way round and the barrier shrinks until, at about 0.6 V for silicon, current flows freely. That is forward bias. Apply it the other way and the barrier grows, and almost nothing gets through.',
          'That is the whole of rectification: a device that passes one half of an alternating waveform and blocks the other.'
        ],
        full: [
          'Push the reverse voltage far enough and the barrier gives way. In an ordinary diode that is a failure. In a Zener it is the intended behaviour, and it happens at a voltage chosen when the diode is made.',
          'Past that knee the current rises steeply while the voltage across the diode stays put. Feed it through a resistor and you have a fixed voltage that holds regardless of what the supply is doing.',
          'Note which way round it goes into the circuit. A Zener used as a reference is reverse biased, which catches people out.'
        ]
      }
    },

    {
      code: '2I3',
      levels: ['intermediate', 'full'],
      panel: 'transfer',
      // the Full syllabus asks for PNP and FET biasing too, dual gate included
      toggle: {
        label: 'Device',
        levels: ['full'],
        options: [['npn', 'NPN'], ['pnp', 'PNP'], ['jfet', 'FET'], ['dualgate', 'Dual gate MOSFET']]
      },
      circuit: 'npn',
      introduces: {
        intermediate: ['bias', 'operating point', 'load line', 'saturation', 'cut off'],
        full: ['pinch off', 'dual gate MOSFET']
      },
      heading: { intermediate: 'A small current controlling a large one',
                 full: 'Biasing, and how far the device can be pushed' },
      lead: { intermediate: 'A transistor is a tap. A little current into the base lets a lot through the collector, and the ratio between them is fixed.',
              full: 'The bias sets what the device does with any signal.' },
      headline: {
        intermediate: 'A small base current steers a much larger collector current. That is where the gain comes from.',
        full: 'Biasing bipolar transistors and FETs so they sit where you want them.'
      },
      formulas: { intermediate: ['beta'],
                  full: ['divider', 'emitter', 'beta', 'diss', 'vgs'] },
      workLead: {
        intermediate: 'One relationship: the current gain.',
        // the rows follow the device chosen above, and so do these words
        full: d => ({
          jfet: 'The divider sets the gate, and the source resistor then sets how far the source sits above it.',
          dualgate: 'One row: the divider that holds gate 2. What that voltage does to the current is on the curve.'
        }[d.device] || 'The divider, the current it sets, and what the device has to dissipate while it sits there.')
      },
      workNote: {
        intermediate: 'Beta is simply the collector current divided by the base current. How R1 and R2 set the operating point is shown on the curve; working it out is not needed at this level.',
        full: d => ({
          jfet: 'Note the sign. A depletion FET conducts with its gate at the source voltage, so it is biased with the gate below the source, and the source resistor is what puts it there.',
          dualgate: 'Gate 2 draws no current, so the divider gives exactly its unloaded voltage. Lower it and the drain current, and the gain with it, falls.'
        }[d.device] || 'Note the dissipation figure. It is largest when the collector sits near the middle of the line, which is where a stage has to sit if it is to reproduce a signal faithfully. That is the reason such a stage runs hot even with no signal going through it.')
      },
      explain: {
        intermediate: [
          'Feed a current into the base and a much larger one flows in the collector. Beta, sometimes written hFE, is how much larger, and it is simply the collector current divided by the base current.',
          'The curve shows what that means across the whole range. Over most of it the collector current follows the base current in a straight line at beta times the size, and a small wiggle at the base comes out as a large wiggle at the collector. That is amplification, and the marked point is where the bias has put it.',
          'The two capacitors at the ends are there to keep the outside world out of it. Whatever is connected to the input or the output has its own resistances and voltages, and if it were joined straight on it would pull the divider about and undo the biasing. The capacitors pass the signal and block the steady voltages, so the bias inside stays where it was set.',
          'Keep increasing the base current and the line stops rising. The collector current can never exceed what the supply and the resistors allow, so it flattens off. There the transistor is saturated and behaving like a closed switch. Take the base current away entirely and it is cut off, an open one.',
          'An amplifier uses the straight middle of the curve; a switch uses its two flat ends.'
        ],
        full: [
          'For a signal to swing both ways without running out of room, the operating point wants to sit on the straight part with space either side of it. That is what the exam means by biasing the collector midway between the supply and zero.',
          'Change R1 or R2 and watch the marked point travel along the curve. Push it too far up and it runs into the flat top, where more base current buys no more collector current and the top of the waveform is shaved off. Take it too far down and the bottom of the waveform is cut off instead.',
          'Push the base far enough and the stage saturates: the collector has fallen as far as it can, to about 0.2 V above the emitter, and the collector current is whatever the supply and the two resistors allow. Beta stops describing it. Look at the base current against the collector current in that state and the ratio has fallen well below beta.',
          'A PNP transistor is biased the same way with every polarity turned round. Pick PNP above: the emitter resistor now goes to the positive rail and the load to ground, and the divider sets the base a fixed fraction of the supply below the rail. Measured down from the rail, every figure is the NPN’s. Its emitter arrow points in, and conventional current flows in at the emitter and out of the collector.',
          'A FET is controlled by the voltage on its gate rather than by a current, and the gate draws essentially none. Pick FET above: this is the common source stage the exam draws, with the divider on the gate and a resistor in the source. Because nothing flows into the gate, the divider gives exactly its unloaded voltage however large R1 and R2 are.',
          'An n channel depletion FET conducts with its gate at the source voltage, and taking the gate more negative than the source pinches the channel down until, at the pinch off voltage, no drain current flows at all. So it is biased with the gate below the source. The source resistor arranges that: drain current lifts the source, and the current settles where the device curve meets the line the resistor imposes. Lower the gate and the drain current falls.',
          'A dual gate MOSFET has two insulated gates on one channel, in effect two devices in series. Gate 1 takes the signal and is biased like a single FET. Gate 2 is held at a steady few volts by its own divider and tied to signal ground by a capacitor. Pick it above and lower gate 2 with R1 and R2: while it is high it stays out of the way, and below about half a volt, with the controls as they start, it begins throttling the current and the gain with it. That is how automatic gain control is applied to such a stage, and why the device is popular in RF amplifiers and mixers.'
        ]
      }
    },

    {
      code: '2I4',
      levels: ['intermediate', 'full'],
      // A conventional divider bias design, worked the way any textbook
      // works it: choose the collector current, drop about half the rail
      // across the load, put a volt or so on the emitter, and run the divider
      // at about ten times the base current so that variation in gain between
      // devices does not move the bias. With these values the bench, which
      // does not assume the divider is stiff, gives 1.04 mA, 4.9 V across
      // the 4.7 k load and a volt on the emitter.
      presets: [{
        levels: ['full'],
        label: 'A worked design: 10 V, about 1 mA',
        note: 'about half the rail across the load, a volt on the emitter, and the divider at about ten times the base current',
        values: { vcc: 10, r1: 82e3, r2: 18e3, rc: 4700, re: 1000, beta: 100, drive: 0.01 }
      }],
      panel: { intermediate: 'loadline', full: 'amp' },
      toggle: {
        label: 'View',
        levels: ['full'],
        options: [['ce', 'Common emitter'], ['cc', 'Emitter follower'],
                  ['cb', 'Common base'], ['classes', 'Classes A to C']]
      },
      circuit: 'ce',
      introduces: {
        intermediate: [],
        full: ['conduction angle', 'class A', 'class AB', 'class B', 'class C', 'crossover distortion']
      },
      heading: { intermediate: 'The common emitter amplifier',
                 full: 'Three configurations, and the classes they can be biased into' },
      lead: { intermediate: 'Now see where the stage you have just biased sits on its load line.',
              full: 'Two separate questions about one transistor: which way round it is wired, and where it is biased.' },
      headline: {
        intermediate: 'Recognising the common emitter amplifier, and why it has to be biased.',
        full: 'Comparing amplifier configurations, and the characteristics of classes A, AB, B and C.'
      },
      formulas: { intermediate: [], full: ['theta', 'eff'] },
      workLead: {
        intermediate: 'Work out the current you want, then the resistor that puts the collector halfway.',
        full: 'The conduction angle first, because the class and the efficiency both follow from it.'
      },
      workNote: {
        intermediate: 'No calculation at this level: recognise the circuit, and know that a transistor has to be biased, given the right steady voltages and currents, before it will amplify. Choosing the resistors is Full level.',
        full: 'Neither figure is quoted from a table. The efficiency is worked out from the shape of the current pulse the device actually passes, which is why it lands on 50% for class A and 78.5% for class B without either being written down. It is the most the class can reach, with the output swinging the whole supply; a real stage driven less hard does worse. The conduction angle, unlike that best efficiency, depends on the drive.'
      },
      explain: {
        intermediate: [
          'With the stage biased, a small change at the base produces a large change in collector current, and the collector resistor turns that into a large change in voltage. That is voltage gain.',
          'The collector voltage moves the opposite way to the base voltage, because more collector current means more drop across the resistor. A common emitter stage inverts.',
          'The bias is what makes this work. R1 and R2 give the base its steady voltage, so the transistor sits part way up its curve with room to swing both ways. Without it, half of every waveform would be cut off.'
        ],
        full: [
          'There are three ways to wire one transistor as an amplifier, and the difference is simply which terminal the signal goes in at and which it comes out of. Switch between the first three views and watch the input and output impedance, the two gains and the phase change move.',
          'Common emitter is the general purpose one: in at the base, out at the collector. It gives both voltage gain and current gain, and it inverts, because more base current means more drop across the collector resistor. Its input and output impedances are moderate; at high frequencies the collector to base capacitance carries some of the output back to the input, and that limits it. The common source stage is its FET equivalent and behaves the same way; it is drawn on the 2I3 panel above, with FET picked.',
          'The emitter follower takes its output from the emitter instead. Voltage gain is just under one, so it makes nothing larger, but the input impedance is high and the output impedance is low, which is exactly what you want for driving something demanding without loading whatever is feeding you.',
          'Its current gain is the one to read carefully. The transistor itself passes beta + 1 times its base current out of the emitter, and that is the figure the questions mean. The stage figure is far lower, because R1 and R2 sit across the input and take most of the input current before the base sees it. The two readouts show both.',
          'Common base drives the emitter and takes the output from the collector. Current gain is about one, voltage gain is high, and the input impedance is very low indeed. It stays stable at VHF and above, where a common emitter stage will happily oscillate instead of amplifying.',
          'Now switch to the classes view, because the second half of this item is a different question about the same transistor: not how it is wired, but where it is biased.',
          'Turn Drive up to about 0.3 V first, so the drive is wide enough to show every class. Then lower the base voltage step by step, by raising R1 or lowering R2, and watch the readouts and the circuit beside them. With the base well up the device conducts for the whole 360 degrees: that is class A, faithful and at best 50% efficient, because it draws the same current whether a signal is present or not. The typical class A circuit is the single stage with a resistor for its load.',
          'Class A is therefore the one least likely to produce harmonics of the input, because every part of the waveform is amplified alike. That is what the exam means by lowest distortion.',
          'Keep going and it starts switching off for part of the cycle. Once the troughs of the drive dip below turn on, it is class AB, the usual compromise for SSB. At cut off exactly, with the base held right at the point of conduction, it conducts for 180 degrees, which is class B and tops out at 78.5%. One device then only reproduces half the waveform, so the typical circuit is two devices in push pull, an NPN for the positive half and a PNP for the negative. Join their bases and each waits for its own 0.6 V, which leaves a dead band, crossover distortion, where neither conducts. The class AB circuit adds two diodes between the bases to hold each device just on, so the handover is smooth.',
          'Below that is class C. Take the bias low enough and there is no collector current at all until a signal arrives, so it draws nothing when idle. It relies on a strong drive to turn it on, and its output depends heavily on that drive: more drive widens and heightens every pulse. It is thoroughly non-linear.',
          'The spectrum shows what that costs: the output is full of harmonics. A tuned circuit in the collector rings at the fundamental and ignores the rest, which is the only reason class C is usable at all, and it is what the typical class C circuit shows in place of the load resistor. It follows that class C suits modes carrying no information in their amplitude, which means CW and FM. Anything relying on amplitude, AM and SSB above all, needs a linear stage. Many data modes change level at each symbol and need linearity too.'
        ]
      }
    },

    {
      code: '2I5',
      levels: ['intermediate', 'full'],
      panel: 'oscillator',
      introduces: { intermediate: ['feedback'], full: [] },
      heading: { intermediate: 'Making an amplifier into an oscillator',
                 full: 'The two conditions for oscillation' },
      lead: { intermediate: 'An amplifier that listens to its own output stops needing an input.',
              full: 'Two things have to be true at once, and both are examinable.' },
      headline: {
        intermediate: 'How a transistor keeps a tuned circuit ringing, and where crystals beat variable oscillators.',
        full: 'The feedback an oscillator needs to keep itself going.'
      },
      formulas: { intermediate: [], full: ['loop'] },
      workNote: {
        intermediate: 'A tuned circuit rings when you hit it, and then dies away as its resistance turns the energy into heat. An oscillator is simply an amplifier topping it up on every cycle to replace exactly what was lost.',
        full: 'The gain must at least make up what the feedback network loses, and the signal must come back in phase. Fall short on either and it will not start. The Drive control sets the size of the swing at the base. The lower plot shows what that does: a small swing sees the full gain, and a large one drives the transistor to cut off on the troughs, so less comes back and the gain round the loop falls.'
      },
      explain: {
        intermediate: [
          'Take the output of an amplifier, feed a little of it back to the input, and if what returns is in step with what is already there it reinforces it. Do that around a tuned circuit and the result oscillates at the frequency the tuned circuit favours.',
          'The tuned circuit decides the frequency. A variable one lets you move about the band; a crystal is far more stable but sits where it was ground.',
          'So a VFO tunes but drifts; a crystal holds but cannot tune.'
        ],
        full: [
          'Two conditions, both necessary. The gain round the whole loop must be at least unity, meaning the amplifier makes up everything the feedback network throws away. And the phase round the whole loop must come back to zero, so the returning signal reinforces rather than cancels.',
          'This is a Colpitts oscillator, the one the exam draws, with the transistor as an emitter follower. A follower\u2019s voltage gain is always a little under one, so the voltage gain has to come from somewhere else: from the tuned circuit. Its two capacitors in series act as a step up transformer. The emitter drives the tap between them, and the top of the coil, which feeds the base, swings (CA + CB) / CA times as far, twice here. The loss is the energy the coil\u2019s resistance and the bias resistors take out of the tank each cycle; the transistor replaces it by supplying current, beta + 1 times what its base draws.',
          'So the loop gain is the follower\u2019s gain times what the tap gives back, and it has to reach one. Starve the transistor of current, with a low supply and a large RE, and its gain falls until the loop is short of one: the trace dies away and it will never start. That is what the questions mean by the losses exceeding the gain.',
          'The amplitude looks after itself. A small swing sees the full gain and grows. As it grows the transistor starts cutting off on the troughs, less of the fundamental comes out, and the loop gain falls. It settles where the loop gain is exactly one, marked on the lower plot. With the controls as they start that is about 2 V at the base, above the top of the Drive control, so across Drive’s range the loop gain hardly moves: the transistor is still working in proportion. Take the stage closer to the edge, with less supply or a larger RE, and the settling point comes down into range. Then wind Drive up past it and the loop gain drops below one and the swing shrinks back; wind it down and it grows again.',
          'The neatest way to hold the phase condition is this: the amplifier and the network each shift 0°, or each 180°. A common emitter stage inverts, so its feedback network must invert as well to bring the total back to zero. An emitter follower does not invert, so its network must not either.'
        ]
      }
    },

    {
      code: '2I2',
      levels: ['intermediate'],
      panel: 'varicap',
      introduces: { intermediate: [] },
      heading: { intermediate: 'The varicap, a capacitor you can steer' },
      lead: { intermediate: 'One more diode, useful for what it does when it is not conducting at all.' },
      headline: { intermediate: 'A varicap works as a capacitor whose value you set with the reverse voltage.' },
      formulas: { intermediate: [] },
      workNote: {
        intermediate: 'A reverse biased junction has an insulating layer with a conductor either side of it, which is the description of a capacitor. Increase the reverse voltage and the layer widens, so the capacitance falls.'
      },
      explain: {
        intermediate: [
          'Reverse bias a diode and the depletion layer widens. That layer is an insulator with conducting silicon either side, which is exactly what a capacitor is made of.',
          'Widen the layer and the capacitance falls, so the applied voltage sets the value. Put one across a tuned circuit and you can move its resonant frequency with a control voltage instead of a moving vane.',
          'That is how a modern VFO tunes, and how a frequency modulator works: apply the audio to the varicap and the oscillator frequency follows it.'
        ]
      }
    },

    {
      code: '2I6',
      levels: ['intermediate'],
      panel: null,
      introduces: { intermediate: [] },
      heading: { intermediate: 'Integrated circuits' },
      lead: { intermediate: 'Finally, what happens when you stop building these one at a time.' },
      headline: { intermediate: 'An integrated circuit packs many devices onto one chip and gives you a whole function.' },
      formulas: { intermediate: [] },
      explain: {
        intermediate: [
          'Everything so far has been a single device. An integrated circuit puts many of them on one piece of silicon and packages the result as a component in its own right.',
          'You buy a function rather than a device: an amplifier, a voltage regulator, a mixer, a whole receiver. What is inside is someone else’s problem.',
          'That is why a modern radio has so few visible parts. Most of what used to be a board of transistors is now inside a package with a dozen legs.'
        ]
      }
    }
  ],


  /*
   * Our own explanation of each answer. The question, its options and the
   * marked answer are the RSGB's and ship unadapted; the reasoning is ours.
   */
  answers: {
    '2025-Full300': {
      why: 'A Zener is used the other way round from an ordinary diode. It is meant to break down, and it does so once the reverse voltage across it passes the figure it was made for. Forward biased it behaves like any other diode, which is not what it is there for.',
      source: { from: ['2I1'] },
      seedNote: 'Drag the cursor into the left hand side of the curve and watch where the current appears.'
    },
    '2025-Full3418': {
      why: 'Look for the curve that does nothing in either direction until it reaches a knee, and has that knee on the reverse side as well as the usual forward one. An ordinary diode has only the forward knee.',
      source: { from: ['2I1'] }
    },
    '2025-Full3577': {
      why: 'The clue is the sharp knee on the reverse side, past which the current climbs steeply while the voltage barely moves. A transistor characteristic is a family of curves rather than a single line, and an ordinary diode does not conduct in reverse at all.',
      source: { from: ['2I1'] }
    },
    '2025-Full3983': {
      why: 'This is a zener holding a supply steady, with a load across it. The zener fixes the voltage, so work out what the series resistor delivers and what the load takes, and the diode carries whatever is left. Forgetting the load gives the current in the series resistor instead, which is one of the wrong answers.',
      working: ['the zener holds the output at 3.6 V',
                'through the series 1 k&Omega;: (12 V &minus; 3.6 V) / 1 k&Omega; = 8.4 mA',
                'through the 1 k&Omega; load: 3.6 V / 1 k&Omega; = 3.6 mA',
                'the diode takes the difference: 8.4 mA &minus; 3.6 mA = 4.8 mA'],
      source: { from: ['2I1'] }
    },
    '2025-Full319': {
      why: 'A FET is controlled by voltage on its gate, and the current it controls flows from drain to source. Pinch off is the gate voltage at which that drain to source current stops. The gate itself draws essentially no current, which rules out the options about gate current.',
      source: { from: ['2I3'] }
    },
    '2025-Full3582': {
      why: 'Lower the gate potential on an n channel device and you pinch the channel further, so less current flows from drain to source. The gate draws no appreciable current either way.',
      source: { from: ['2I3'] }
    },
    '2025-Full3585': {
      why: 'A depletion mode n channel FET conducts with no bias at all, and is turned down by taking the gate below the source. Biasing one as an amplifier therefore puts the gate below the source, and the diagram marks the source voltage. No resistor values are given, so the answer is settled by which option sits below it.',
      working: ['the diagram marks the source at 4.5 V',
                'an n channel depletion FET is biased with the gate below its source',
                'of the options only 3.2 V is below 4.5 V',
                'which puts V<sub>GS</sub> at 3.2 V &minus; 4.5 V = &minus;1.3 V'],
      source: { eq: ['vgs'], from: ['2I3'] },
      // figures chosen to land on the diagram's 18 V rail, 4.5 V source and
      // 14 V drain; the question gives no resistor values
      seed: { vcc: 18, r1: 101.8e3, r2: 22e3, rc: 1556, re: 1751, beta: 200, drive: 0.01,
              toggle: 'jfet', item: '2I3' },
      seedNote: 'This sets the FET stage on the 2I3 panel: it puts the source at 4.5 V and the drain at 14 V on an 18 V rail, as the diagram does, and the gate comes out near 3.2 V.'
    },
    '2025-Full679': {
      why: 'The diagram gives the emitter voltage, and the base has to sit about 0.6 V above it. R1 and R2 divide the supply down to that, so what the answer really turns on is the ratio of the two resistors rather than any one value.',
      working: ['base = emitter + 0.6 V = 1.5 V + 0.6 V = 2.1 V',
                'the divider gives base = supply &times; R2 / (R1 + R2), and the diagram&rsquo;s supply is 10 V',
                'so R1 = R2 &times; (10 V &minus; 2.1 V) / 2.1 V = 22 k&Omega; &times; 7.9 / 2.1 = 82.8 k&Omega;',
                'the nearest of the four options is 78 k&Omega;'],
      source: { eq: ['divider', 'emitter'], from: ['2I3'] },
      seed: { vcc: 10, r1: 78e3, r2: 22e3, rc: 3900, re: 1200, beta: 200, drive: 0.01 },
      seedNote: 'The bench is set to this divider on the diagram&rsquo;s 10 V rail. With 78 k the divider alone gives 2.2 V; the base current pulls the base down a little, and the emitter lands at the 1.5 V the diagram marks. The diagram gives no collector or emitter resistor values; those chosen here put the collector near mid rail.'
    },
    '2025-Full321': {
      why: 'Common emitter. The collector resistor turns a large collector current change into a large voltage change, so the gain is well above one, and the collector moves the opposite way to the base, so the output is inverted.',
      source: { from: ['2I4'] },
      seedNote: 'Both facts come from the same thing: more base current means more drop across the collector resistor, so the collector goes down as the base goes up.'
    },
    '2025-Full322': {
      why: 'This one is an emitter follower. The output follows the input closely, so there is no inversion, and it cannot exceed it, so the voltage gain is a little under one. What it does give you is current gain and a much lower output impedance.',
      source: { from: ['2I4'] }
    },
    '2025-Full323': {
      why: 'Common base. The same current passes through emitter and collector, so the current gain is about one, but the collector load turns it into a much larger voltage swing, so the voltage gain is high.',
      source: { from: ['2I4'] }
    },
    '2025-Full324': {
      why: 'Class A conducts for the whole cycle, so the device never switches off and never has to be pieced back together. That is what makes it the most faithful, and it is also why it is the least efficient.',
      working: ['conduction angle = 360&deg;, the whole cycle',
                'efficiency at best = 50%',
                'nothing of the waveform is missing, and at least half the DC power drawn becomes heat',
                'lowest distortion of the four, which is Class A'],
      source: { eq: ['theta', 'eff'], from: ['2I4'] },
      seed: { vcc: 12, r1: 78e3, r2: 22e3, rc: 2200, re: 1000, beta: 200, drive: 0.01,
              toggle: 'classes' },
      seedNote: 'This sets a stage biased well into class A, about half the supply between its collector and emitter, and shows the 2I4 Classes A to C view. Look at the spectrum: nothing but the fundamental.'
    },
    '2025-Full325': {
      why: 'Amplifying only one half of the waveform means conducting for half the cycle, which is 180 degrees, and that is class B. Class A takes the whole cycle, class AB rather more than half, class C rather less.',
      working: ['half the waveform means half the cycle',
                '360&deg; / 2 = 180&deg;',
                'which is class B, at best 78.5% efficient'],
      source: { eq: ['theta'], from: ['2I4'] },
      seed: { vcc: 12, r1: 190e3, r2: 10e3, rc: 2200, re: 1000, beta: 200, drive: 0.3,
              toggle: 'classes' },
      seedNote: 'The divider puts the base at exactly 0.6 V, the cut off point. In the Classes A to C view, shown now, the device conducts for 180\u00b0, only while the signal is positive: class B.'
    },
    '2025-Full3404': {
      why: 'Class C conducts for so little of the cycle that what comes out is a series of pulses rather than a waveform, so a tuned load is needed to ring at the fundamental and put the sine wave back. Its supply current is lower rather than higher, because it draws nothing at all until a signal arrives. Its distortion is worse rather than better. And push pull, where each device takes half the waveform, is a class B arrangement rather than a class C one.',
      source: { eq: ['theta', 'eff'], from: ['2I4'] },
      seed: { vcc: 12, r1: 400e3, r2: 10e3, rc: 2200, re: 1000, beta: 200, drive: 0.5,
              toggle: 'classes' },
      seedNote: 'This biases the base below cut off and shows the Classes A to C view. Look at the harmonics in the lower plot and the tuned circuit drawn in the collector: that is what removes them.'
    },
    '2025-Full7635': {
      why: 'Oscillation builds only if each trip round the loop returns at least as much as it started with. Gain has to exceed the losses, not match half of them or fall short.',
      source: { from: ['2I5'] },
      seed: { vcc: 5, r1: 47e3, r2: 7.5e3, rc: 4700, re: 4700, beta: 200, drive: 0.01 },
      seedNote: 'This setting starves the transistor of current. The follower\u2019s gain falls, the tap cannot make up the difference, and the loop gain drops below one: the trace dies away.'
    },
    '2025-Full7738': {
      why: 'The comparison is with the loss in the feedback network, not with the transistor\u2019s beta. Beta describes the device; what matters is whether the whole loop breaks even.',
      source: { from: ['2I5'] }
    },
    '2025-Full7739': {
      why: 'Same condition stated again: the amplifier has to make up slightly more than the feedback network throws away. Slightly, because far more than that drives the stage into clipping and the output distorts.',
      source: { from: ['2I5'] },
      seed: { vcc: 8, r1: 47e3, r2: 7.5e3, rc: 4700, re: 4700, beta: 200, drive: 0.01 },
      seedNote: 'This runs the oscillator with only a little gain to spare: about 1.5 round the loop for a tiny swing, and it settles at about 0.3 V at the base. Move Drive either side of that and watch the loop gain cross one, the swing growing below it and shrinking back above it.'
    },
    '2025-Full7764': {
      why: 'Two conditions have to hold together. Enough gain to cover the losses, and the returning signal in phase with what is already at the input. Either one alone is not enough.',
      source: { from: ['2I5'] }
    },
    '2025-Full7765': {
      why: 'If the feedback network loses more than the amplifier can replace, each trip round the loop is smaller than the last and the oscillation dies out. It will not start at all.',
      source: { from: ['2I5'] },
      seed: { vcc: 5, r1: 47e3, r2: 7.5e3, rc: 4700, re: 4700, beta: 200, drive: 0.01 },
      seedNote: 'Compare the follower gain with the least it needs on the oscillator panel. Here it falls short, the loop gain is under one, and the trace decays. Put RE back to 1 k and the supply to 12 V and it builds.'
    },
    '2025-Full7766': {
      why: 'An emitter follower does not invert, so the signal arrives back at the input already in phase. The feedback network therefore has to add nothing. A common emitter stage inverts, and its network has to supply the other 180 degrees.',
      source: { from: ['2I5'] }
    }
  },

  outro: {
    intermediate: [
      'A diode passes current one way. A transistor lets a small current steer a large one. Bias decides where the device sits before the signal arrives, and feedback turns an amplifier into an oscillator.',
      'The transmitter and receiver sections use these same parts.'
    ],
    full: [
      'The through line here is bias. It sets the operating point, the operating point sets the conduction angle, and the conduction angle sets both the class and the efficiency.',
      'It also sets what you have to do about the consequences. Class A needs no help, and at least half the power it draws becomes heat. Class C is efficient and unusable without a tuned circuit to put the waveform back together. Everything between is a judgement about which of those matters more for the mode you are running.'
    ]
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = BENCH;
if (typeof window !== 'undefined') window.BENCH = BENCH;
