/*
 * content/4A.js - Feeders, SWR and matching.
 *
 * Groups 4A (feeders), 4B (baluns), 4E (standing waves) and 4F (matching
 * units) on one page, at every level that teaches them. The antennas
 * themselves (4C, 4D) and the plugs and sockets (4G) are for another page.
 *
 * Every instrument here is a circuit solved by the nodal analysis engine,
 * with its feeders as T elements: lengths of real, lossy transmission line
 * at the frequency on the controls. Nothing is a drawing of the expected
 * answer. A feeder that is drawn is cut into equal sections in the netlist,
 * and the charge on each section moves with the current solved there, so a
 * mismatched feeder shows its standing wave in the dots. The graphs along a
 * feeder come from the line equations, evaluated from the solved voltage and
 * current at the start of each section; engine/test-mna.js checks those
 * against the node voltages of a feeder cut into sections.
 *
 * Headlines come from content/descriptions.json and are our own wording.
 */

const MN = window.MNA;
const Fm = window.Fmt;
const NBSP = String.fromCharCode(160);

const Z_TX = 50;           // what a transmitter is built to work into
const VF_COAX = 0.67;      // solid polythene coax, the syllabus figure
const C_FREE = 3e8;        // m/s, as on the formula sheet

/*
 * Colours. A quantity is always the course's colour for it (README,
 * Colours): voltage blue, current orange, power red, impedance navy,
 * resistance dark, L green, C purple. SWR and return loss are ratios of
 * voltage and of power, so SWR is drawn as a voltage and return loss and
 * feeder loss as power. Frequency, distance and every mark stay neutral.
 */
const INK = { v: '--q-v', i: '--q-i-ink', r: '--q-r', l: '--q-l', c: '--q-c', z: '--q-z', p: '--q-p' };
const hue = (k, html) => '<span style="color:var(' + INK[k] + ')">' + html + '</span>';
function tint(hex, a) {
  const m = /^#([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return 'transparent';
  const n = parseInt(m[1], 16);
  return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}
const DASH = [7, 5];
const dashSwatch = (c, label) =>
  '<span><i style="background:repeating-linear-gradient(90deg,' + c + ' 0 4px,transparent 4px 7px)"></i>' +
  '<span class="sw-l">' + label + '</span></span>';
// readout labels are set in capitals; a symbol inside one keeps its case
const sym = s => '<span style="text-transform:none">' + s + '</span>';

/* ---------------- numbers ---------------- */

const cx = MN.cx;
const gammaOf = (z, z0) => MN.div(MN.sub(z, cx(z0)), MN.add(z, cx(z0)));
const swrOf = g => { const r = Math.min(0.999999, typeof g === 'number' ? g : MN.abs(g)); return (1 + r) / (1 - r); };
const rlOf = g => { const r = typeof g === 'number' ? g : MN.abs(g); return r < 1e-9 ? Infinity : -20 * Math.log10(r); };
const loadForRl = (rl, z0) => { const g = Math.pow(10, -rl / 20); return z0 * (1 + g) / (1 - g); };
const mhz = f => Fm.trim(f / 1e6, 4) + NBSP + 'MHz';
// a value for a netlist, to twelve figures: the parts are solved as designed
const num = v => String(Number(Number(v).toPrecision(12)));
const ohms = (v, s) => Fm.eng(v, 'Ω', s || 3);
const db = (v, s) => !isFinite(v) ? 'no reflection' : Fm.trimText(v, s || 3) + NBSP + 'dB';
const swrText = s => !isFinite(s) || s > 999 ? 'very high' : Fm.trim(s, 3) + ':1';
const watts = (w, s) => Fm.eng(w, 'W', s || 3);
function zText(z, s) {
  s = s || 3;
  if (Math.abs(z.im) < 0.01 * Math.max(1, Math.abs(z.re))) return Fm.eng(z.re, 'Ω', s);
  // both parts in ohms, so 50.2 + j0.29 Ω never reads as 50.2 + j293 mΩ
  return Fm.trim(z.re, s) + (z.im < 0 ? ' − j' : ' + j') + Fm.trim(Math.abs(z.im), s) + NBSP + 'Ω';
}
// a reactance as the part that makes it at a frequency
const partFor = (x, f) => x >= 0 ? { type: 'L', value: x / (2 * Math.PI * f) }
                                 : { type: 'C', value: 1 / (2 * Math.PI * f * -x) };

/* ---------------- cables ---------------- */

/*
 * Typical figures for three feeders, for illustration: loss in dB per
 * 100 m at 10 MHz, rising with the square root of frequency, which is close
 * to how a maker's data sheet runs across HF and VHF. A data sheet gives
 * the real figures for a particular cable.
 */
const CABLES = {
  rg58:   { name: 'RG58 coax', z0: 50, vf: VF_COAX, db10: 4.6, twin: false },
  rg213:  { name: 'RG213 coax', z0: 50, vf: VF_COAX, db10: 2.0, twin: false },
  ladder: { name: '450 Ω window line', z0: 450, vf: 0.91, db10: 0.35, twin: true }
};
const dbPer100 = (cab, f) => cab.db10 * Math.sqrt(f / 10e6);

/* ---------------- drawing a circuit at a readable size ---------------- */

function canvasOf(cv) {
  const dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth, H = cv.clientHeight;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  const c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, W, H);
  return { c, W, H };
}
/*
 * The shared drawing is scaled to fit its canvas. Each circuit canvas is
 * made tall enough for its drawing to reach SCHEM_SCALE where the width
 * allows, so the part labels come out at a readable size, and the graph
 * beside it is given the same height.
 */
const SCHEM_SCALE = 1.7;
function fitSchem(cv, lay) {
  if (!cv) return 230;
  const cw = cv.clientWidth || 380;
  const s = Math.min(SCHEM_SCALE, (cw - 32) / lay.w);
  const h = Math.max(230, Math.round(s * lay.h + 32));
  cv.style.height = h + 'px';
  return h;
}
function matchGraph(p, h) {
  const side = typeof window !== 'undefined' && window.matchMedia &&
    window.matchMedia('(min-width:820px)').matches;
  p.graph.style.height = side ? Math.max(260, h) + 'px' : '280px';
}
function sizeFor(p, lay) { matchGraph(p, fitSchem(p.schem, lay)); }
// x axis labels: on a narrow graph only the ends and the middle are labelled
const xLabels = (canvas, a, b, f) => v => {
  if ((canvas.clientWidth || 500) >= 500) return f(v);
  const i = Math.round(4 * (v - a) / (b - a));
  return i % 2 ? '' : f(v);
};
const logTicks = (canvas, a, b) => xLabels(canvas, a, b, v => {
  const f = Math.pow(10, v);
  return f >= 1e9 ? Fm.trim(f / 1e9, 2) + ' GHz' : f >= 1e6 ? Fm.trim(f / 1e6, 2) + ' MHz' : Fm.trim(f / 1e3, 2) + ' kHz';
});

/* ---------------- circuits, built as a ladder ---------------- */

/*
 * Most circuits on the page are a ladder: a transmitter, then parts in
 * series along the top and parts to earth, feeders, and a load at the end.
 * ladder() writes the netlist and the drawing together from one list, so
 * they cannot disagree, and names the current on every wire, which the
 * charge animation and check-flow.js both need.
 *
 *   { k: 'src', voc, rs, label }          the transmitter and its resistance
 *   { k: 'series', name, value, label }   a part in the top rail (L or C by name)
 *   { k: 'shunt', name, value, label }    a part to earth
 *   { k: 'line', id, z0, len, vf, db, at, sections, label, twin, units }
 *   { k: 'load', parts: [{ name, value, label }], label }   to earth at the end
 *   { k: 'open' } / { k: 'short' }        the end of a feeder left open or shorted
 *
 * Every screen is earthed at both ends, which is how a coax feeder sits in
 * a station; twin feeder takes its return along its second wire instead.
 * A feeder followed by anything but a series part or the load gets a 1 mΩ
 * link after it, a wire as far as the circuit is concerned, so that the
 * current out of the feeder has a name.
 */
const YT = 30;           // the top rail
function ladder(parts, opt) {
  opt = opt || {};
  const els = [], wires = [], grounds = [], terms = [], net = [], lab = {}, lines = [];
  let node = 'n0', nk = 0, x = 0, linkN = 0;
  const fresh = () => 'n' + (++nk);
  // the current flowing right into a part, for the wire that leads to it
  const inName = q => !q ? '-' : q.k === 'series' ? q.name : q.k === 'line' ? q.id + '1'
    : q.k === 'load' ? q.parts[0].name : q.k === 'short' ? 'RX' : q.k === 'link' ? q.name : '-';
  // insert the links a feeder needs
  const list = [];
  parts.forEach((q, i) => {
    list.push(q);
    const nx = parts[i + 1];
    if (q.k === 'line' && nx && nx.k === 'shunt') list.push({ k: 'link', name: 'RK' + (++linkN) });
  });
  let bottom = YT + 60, returnTo = null;   // twin feeder's return wire
  list.forEach((q, i) => {
    const nx = list[i + 1];
    if (q.k === 'src') {
      els.push({ name: 'V1', type: 'V', at: [20, YT + 30], rot: 90, label: q.label || 'TX' });
      els.push({ name: 'RS', type: 'R', at: [50, YT], label: q.rsLabel || ohms(q.rs) });
      grounds.push([20, YT + 60]);
      net.push('V1 s 0 ' + num(q.voc), 'RS s n0 ' + num(q.rs));
      x = 80;
    } else if (q.k === 'series') {
      const n2 = fresh();
      els.push({ name: q.name, type: q.name[0], at: [x + 30, YT], label: q.label || '' });
      net.push(q.name + ' ' + node + ' ' + n2 + ' ' + num(q.value));
      lab[q.name] = q.text || '';
      node = n2; x += 60;
    } else if (q.k === 'shunt') {
      els.push({ name: q.name, type: q.name[0], at: [x, YT + 30], rot: 90, label: q.label || '' });
      grounds.push([x, YT + 60]);
      net.push(q.name + ' ' + node + ' 0 ' + num(q.value));
      lab[q.name] = q.text || '';
      wires.push([x, YT, x + 40, YT, inName(nx)]);
      x += 40;
    } else if (q.k === 'link') {
      const n2 = fresh();
      net.push(q.name + ' ' + node + ' ' + n2 + ' 1m');
      wires.push([x, YT, x + 20, YT, q.name]);
      node = n2; x += 20;
    } else if (q.k === 'line') {
      const n = q.sections || 1, L = q.units || 120, names = [];
      const tail = (q.db ? ' db=' + num(q.db) : '') + (q.at ? ' at=' + num(q.at) : '');
      for (let s = 1; s <= n; s++) {
        const n2 = fresh();
        names.push(q.id + s);
        net.push(q.id + s + ' ' + node + ' 0 ' + n2 + ' 0 ' + num(q.z0) + ' len=' + num(q.len / n) +
                 ' vf=' + q.vf + tail);
        node = n2;
      }
      els.push({ name: 'F' + q.id, type: 'TL', at: [x + L / 2, YT], len: L, twin: !!q.twin,
                 label: q.label || '', flow: [q.id + '1', inName(nx)], along: names });
      lines.push({ id: q.id, sections: n, len: q.len, z0: q.z0, x0: x, x1: x + L });
      if (q.twin) {
        // the second wire carries the return: back to the transmitter at
        // the left, and up from the load's foot at the right
        wires.push([x, YT + 16, x, YT + 60, q.id + '1'], [x, YT + 60, 20, YT + 60, q.id + '1']);
        returnTo = { x: x + L, name: inName(nx) };
      } else {
        grounds.push([x, YT + 16], [x + L, YT + 16]);
      }
      x += L;
    } else if (q.k === 'load') {
      // a part to earth just before the load has its label to its right
      const lx = x + (list[i - 1] && list[i - 1].k === 'shunt' ? 45 : 30);
      wires.push([x, YT, lx, YT, q.parts[0].name]);
      let from = node, y = YT;
      q.parts.forEach((pt, k) => {
        const to = k === q.parts.length - 1 ? '0' : fresh();
        els.push({ name: pt.name, type: pt.name[0], at: [lx, y + 30], rot: 90,
                   label: pt.label || '', labelAt: q.labelAt });
        net.push(pt.name + ' ' + from + ' ' + to + ' ' + num(pt.value));
        lab[pt.name] = pt.text || '';
        from = to; y += 60;
      });
      if (returnTo) {
        wires.push([lx, y, returnTo.x, y, q.parts[0].name], [returnTo.x, y, returnTo.x, YT + 16, q.parts[0].name]);
      } else {
        grounds.push([lx, y]);
      }
      bottom = Math.max(bottom, y);
      x = lx + 10;
    } else if (q.k === 'open') {
      terms.push({ at: [x, YT], label: q.label || 'open' });
    } else if (q.k === 'short') {
      wires.push([x, YT, x, YT + 16, 'RX']);
      net.push('RX ' + node + ' 0 1m');
    }
  });
  return {
    netlist: net.join('\n'), lines, lab,
    layout: { w: x + (opt.padRight || 72), h: bottom + 24, elements: els, wires, grounds, terminals: terms }
  };
}

/* The current into a line, and the voltage there, every few centimetres along it. */
function alongLine(sol, line, perSection) {
  const out = [];
  const seg = line.len / line.sections;
  for (let s = 1; s <= line.sections; s++) {
    for (let k = 0; k < perSection; k++) {
      const z = seg * k / perSection;
      const at = MN.lineAt(sol, line.id + s, z);
      out.push({ z: seg * (s - 1) + z, v: at.v, i: at.i });
    }
  }
  const last = MN.lineAt(sol, line.id + line.sections, seg);
  out.push({ z: line.len, v: last.v, i: last.i });
  return out;
}

/* What looks into node n0, just past the transmitter's own resistance. */
function zSeen(sol) {
  return MN.div(MN.nodeV(sol, 'n0'), MN.currentThrough(sol, 'RS'));
}
/* Forward and reflected power at the transmitter, as a meter built for zr shows them. */
function meterAt(v, i, zr) {
  const vf = MN.mul(MN.add(v, MN.mul(i, cx(zr))), cx(0.5));
  const vr = MN.mul(MN.sub(v, MN.mul(i, cx(zr))), cx(0.5));
  return { vf: MN.abs(vf), vr: MN.abs(vr), pf: MN.abs(vf) ** 2 / zr, pr: MN.abs(vr) ** 2 / zr };
}
/* A transmitter that sends `w` watts forward into its own resistance zs. */
const vocFor = (w, zs) => 2 * Math.sqrt(w * zs);

/* ---------------- matching networks ---------------- */

/*
 * Each design returns the parts in order from the transmitter to the load,
 * as reactances (series) and susceptances (to earth) at the design
 * frequency. How the values are found is beyond the syllabus; the page
 * then solves the circuit with those parts in it, so what the transmitter
 * sees is the circuit's answer rather than the design's claim.
 */
const MIN_X = 0.01, MIN_B = 1e-6;
function lNet(zl, r0) {
  const y = MN.div(cx(1), zl), G = y.re, Bl = y.im, R = zl.re, X = zl.im;
  if (G <= 1 / r0 + 1e-12) {
    // across the load first, then in series: the load's conductance is
    // raised to 1/r0's worth, and the series part cancels what is left
    const bt = Math.sqrt(Math.max(0, G / r0 - G * G));
    const xs = bt / (G * G + bt * bt);
    return { kind: 'shunt at the load', parts: [{ pos: 'series', x: xs }, { pos: 'shunt', b: bt - Bl }] };
  }
  const xt = Math.sqrt(Math.max(0, R * (r0 - R)));
  const b = xt / (R * R + xt * xt);
  return { kind: 'series at the load', parts: [{ pos: 'shunt', b: b }, { pos: 'series', x: xt - X }] };
}
// the loaded Q of a pi or T: at least 3, and enough for the ratio asked of it
const qFor = (a, b) => Math.max(3, 1.2 * Math.sqrt(Math.max(a, b) / Math.min(a, b) - 1));
function piNet(zl, r0) {
  const y = MN.div(cx(1), zl), Rp = 1 / y.re, Bl = y.im;
  const Q = qFor(r0, Rp), Rv = Math.max(r0, Rp) / (Q * Q + 1);
  const q1 = Math.sqrt(r0 / Rv - 1), q2 = Math.sqrt(Rp / Rv - 1);
  return { kind: 'pi', Q, parts: [{ pos: 'shunt', b: q1 / r0 }, { pos: 'series', x: Rv * (q1 + q2) },
                                  { pos: 'shunt', b: q2 / Rp - Bl }] };
}
function tNet(zl, r0) {
  const R = zl.re, X = zl.im;
  const Q = qFor(r0, R), Rv = Math.min(r0, R) * (1 + Q * Q);
  const x1 = -r0 * Math.sqrt(Rv / r0 - 1), x2t = -R * Math.sqrt(Rv / R - 1);
  const y1 = MN.div(cx(1), cx(r0, x1)), y2 = MN.div(cx(1), cx(R, x2t));
  return { kind: 'T', Q, parts: [{ pos: 'series', x: x1 }, { pos: 'shunt', b: -y1.im - y2.im },
                                 { pos: 'series', x: x2t - X }] };
}
/* Turn a design into ladder parts, each an L or a C named for what it is. */
function netParts(design, f, tag) {
  return design.parts.map((q, k) => {
    const x = q.pos === 'series'
      ? (Math.abs(q.x) < MIN_X ? MIN_X : q.x)
      : -1 / (Math.abs(q.b) < MIN_B ? MIN_B : q.b);
    const pt = partFor(x, f);
    const name = pt.type + tag + (k + 1);
    return { k: q.pos, name: name, value: pt.value,
             label: pt.type === 'L' ? 'L' + (k + 1) : 'C' + (k + 1),
             text: Fm.eng(pt.value, pt.type === 'L' ? 'H' : 'F', 3), x: x };
  });
}

/* ---------------- the aerial ---------------- */

/*
 * A dipole cut for 7.1 MHz, as a circuit: near its own frequency an aerial
 * behaves like a series tuned circuit, its resistance (mostly radiation,
 * 55 Ω here, about what a dipole shows at a practical height) in series
 * with an L and a C that cancel at 7.1 MHz. A Q of 12 is about right for a
 * wire dipole. Beyond the syllabus, and close only near resonance.
 */
const AER = { f0: 7.1e6, r: 55, q: 12 };
AER.l = AER.q * AER.r / (2 * Math.PI * AER.f0);
AER.c = 1 / (Math.pow(2 * Math.PI * AER.f0, 2) * AER.l);
const aerialZ = f => { const w = 2 * Math.PI * f; return cx(AER.r, w * AER.l - 1 / (w * AER.c)); };
const aerialLoad = () => ({ k: 'load', label: 'aerial', parts: [
  { name: 'LE', value: AER.l, label: 'aerial L', text: Fm.eng(AER.l, 'H', 3) },
  { name: 'CE', value: AER.c, label: 'aerial C', text: Fm.eng(AER.c, 'F', 3) },
  { name: 'RE', value: AER.r, label: 'aerial R', text: ohms(AER.r) }] });
const SYS = { watts: 25, len: 20, cable: CABLES.rg213, lo: 5e6, hi: 9e6 };
// drawn shorter beside an AMU, so the whole station still fits its column at a readable size
const sysLine = (n, short) => ({ k: 'line', id: 'T', z0: 50, len: SYS.len, vf: VF_COAX, db: SYS.cable.db10,
                                 at: 10e6, sections: n, label: short ? '20 m RG213' : '20 m of RG213', units: short ? 70 : 110 });

/*
 * The Foundation and Intermediate station: transmitter, an AMU in the shack
 * or at the aerial or none, the feeder, and the aerial, or a fault at the
 * top of the feeder. The AMU is designed for the operating frequency, as an
 * automatic one would tune itself.
 */
function systemCircuit(mode, fop, n) {
  const src = { k: 'src', voc: vocFor(SYS.watts, Z_TX), rs: Z_TX, rsLabel: 'its 50 Ω' };
  const end = mode === 'open' ? [{ k: 'open', label: 'open' }] : mode === 'short' ? [{ k: 'short' }] : [aerialLoad()];
  let mid = [sysLine(n, mode === 'tx' || mode === 'ant')];
  if (mode === 'tx') {
    const z = zSeen(MN.solveAt(MN.parseNetlist(ladder([src, sysLine(1)].concat(end)).netlist), fop));
    mid = netParts(lNet(z, Z_TX), fop, 'M').concat(mid);
  } else if (mode === 'ant') {
    mid = mid.concat(netParts(lNet(aerialZ(fop), Z_TX), fop, 'M'));
  }
  // with an AMU in it, the margin is trimmed to what the aerial's labels need
  return ladder([src].concat(mid, end), mode === 'tx' || mode === 'ant' ? { padRight: 66 } : {});
}

/* ---------------- the stub ---------------- */

/*
 * An aerial downlead, 75 Ω, with a stub of the same coax across it at a
 * T piece, open or shorted at its far end. The receiver is the 75 Ω load.
 * The downlead's own length does nothing to the stub's effect when both
 * ends are matched, so it is left out. The stub has the loss of a typical
 * 75 Ω coax, which is what stops the notch being infinitely deep.
 */
const STUB = { z0: 75, db10: 4.6 };
function stubCircuit(len, vf, end, n) {
  const names = [];
  let net = 'V1 s 0 2\nRS s j 75\nRL j 0 75\n', node = 'j';
  for (let k = 1; k <= n; k++) {
    const to = 'e' + k;
    names.push('TS' + k);
    net += 'TS' + k + ' ' + node + ' 0 ' + to + ' 0 ' + STUB.z0 + ' len=' + num(len / n) +
           ' vf=' + vf + ' db=' + STUB.db10 + ' at=10M\n';
    node = to;
  }
  if (end === 'short') net += 'RX ' + node + ' 0 1m\n';
  const layout = {
    w: 330, h: 176,
    elements: [
      { name: 'V1', type: 'V', at: [20, 60], rot: 90, label: 'aerial' },
      { name: 'RS', type: 'R', at: [50, 30], label: '75 Ω' },
      { name: 'RL', type: 'R', at: [250, 60], rot: 90, label: 'receiver' },
      { name: 'FS', type: 'TL', at: [190, 130], len: 100, label: 'stub, VF ' + Fm.trim(vf, 3),
        flow: ['TS1', end === 'short' ? 'RX' : '-'], along: names }
    ],
    wires: [[80, 30, 140, 30, 'RS'], [140, 30, 250, 30, 'RL'], [140, 30, 140, 130, 'TS1']],
    grounds: [[20, 90], [250, 90], [140, 146], [240, 146]],
    terminals: end === 'short' ? [] : [{ at: [240, 130], label: 'open' }]
  };
  if (end === 'short') layout.wires.push([240, 130, 240, 146, 'RX']);
  return { netlist: net, layout: layout };
}
const stubDb = (ck, f) => 20 * Math.log10(Math.max(1e-6, MN.abs(MN.nodeV(MN.solveAt(ck, f), 'j'))));

/* ---------------- the balun ---------------- */

/*
 * A coax fed dipole, with the outside of the braid as a third conductor.
 * The current up the inner feeds arm A. Its return comes back down the
 * inside of the screen, and at the feed point it can come from arm B or
 * from the outside of the braid, which runs down to the shack as a wire of
 * its own. Each arm is half the dipole's 73 Ω, to the space around it; the
 * outside of the braid is taken as 100 Ω, which in practice depends on the
 * feeder's length and route. The dipole is held at its resonant value
 * across the sweep, which a real one is not, so that only the balun
 * changes. Beyond the syllabus, and illustrative.
 */
const BAL = { arm: 36.5, out: 100, len: 10 };
const CHOKES = {
  none: { name: 'No balun' },
  coil: { name: 'A coil of the coax', l: 8e-6, c: 6e-12 },
  ferrite: { name: 'Ferrite rings', l: 10e-6, r: 1000 },
  sleeve: { name: 'A sleeve', z0: 100, vf: 0.95 }
};
function balunCircuit(kind, fsl, n) {
  const feed = [];
  let net = 'V1 s 0 ' + num(vocFor(100, Z_TX)) + '\nRS s n0 50\n', node = 'n0';
  for (let k = 1; k <= n; k++) {
    // the last section's far end is the feed point, P and Q, neither earthed
    feed.push('T' + k);
    net += 'T' + k + ' ' + node + ' 0 ' + (k === n ? 'p q' : 'n' + k + ' 0') + ' 50 len=' +
           num(BAL.len / n) + ' vf=' + VF_COAX + '\n';
    node = 'n' + k;
  }
  net += 'RA p 0 ' + BAL.arm + '\nRB 0 q ' + BAL.arm + '\n';
  const lay = {
    w: 320, h: 0,
    elements: [
      { name: 'V1', type: 'V', at: [20, 60], rot: 90, label: 'TX' },
      { name: 'RS', type: 'R', at: [50, 30], label: '50 Ω' },
      { name: 'FT', type: 'TL', at: [140, 30], len: 120, label: 'coax feeder', flow: ['T1', 'RA'], along: feed },
      { name: 'RA', type: 'R', at: [230, 30], label: 'arm A' },
      { name: 'RB', type: 'R', at: [230, 90], rot: 180, label: 'arm B' }
    ],
    wires: [[200, 90, 200, 46, 'RA']],
    grounds: [[20, 90], [80, 46], [260, 30], [260, 90]]
  };
  const sleeveNames = [];
  if (kind === 'none') {
    net += 'ROUT q 0 ' + BAL.out + '\n';
    lay.elements.push({ name: 'ROUT', type: 'R', at: [200, 120], rot: 90, label: 'outside of braid', labelAt: 'left' });
    lay.grounds.push([200, 150]); lay.h = 170;
  } else if (kind === 'ferrite') {
    const c = CHOKES.ferrite;
    net += 'LCH q m1 ' + num(c.l) + '\nRCH m1 m2 ' + c.r + '\nROUT m2 0 ' + BAL.out + '\n';
    lay.elements.push(
      { name: 'LCH', type: 'L', at: [200, 120], rot: 90, label: 'ferrite L', labelAt: 'left' },
      { name: 'RCH', type: 'R', at: [200, 180], rot: 90, label: 'ferrite loss', labelAt: 'left' },
      { name: 'ROUT', type: 'R', at: [200, 240], rot: 90, label: 'outside of braid', labelAt: 'left' });
    lay.grounds.push([200, 270]); lay.h = 290;
  } else if (kind === 'coil') {
    const c = CHOKES.coil;
    net += 'LCH q m1 ' + num(c.l) + '\nCCH q m1 ' + num(c.c) + '\nROUT m1 0 ' + BAL.out + '\n';
    lay.elements.push(
      { name: 'LCH', type: 'L', at: [200, 140], rot: 90, label: 'coil', labelAt: 'left' },
      { name: 'CCH', type: 'C', at: [240, 140], rot: 90, label: 'its turns' },
      { name: 'ROUT', type: 'R', at: [200, 200], rot: 90, label: 'outside of braid', labelAt: 'left' });
    lay.wires.push([200, 90, 200, 110, 'ROUT'], [200, 110, 240, 110, 'CCH'], [240, 170, 200, 170, 'CCH']);
    lay.grounds.push([200, 230]); lay.h = 250;
  } else {
    // the sleeve: a shorted line between the outside of the braid and the
    // inside of the sleeve, a quarter wave long at fsl
    const s = CHOKES.sleeve, len = C_FREE * s.vf / fsl / 4;
    let nd = 'q';
    for (let k = 1; k <= n; k++) {
      sleeveNames.push('TV' + k);
      const a = k === 1 ? 'q sv' : nd + ' 0', to = 'v' + k;
      net += 'TV' + k + ' ' + a + ' ' + to + ' 0 ' + s.z0 + ' len=' + num(len / n) + ' vf=' + s.vf +
             ' db=0.5 at=100M\n';
      nd = to;
    }
    net += 'RSH ' + nd + ' 0 1m\nROUT sv 0 ' + BAL.out + '\n';
    lay.elements.push(
      { name: 'FV', type: 'TL', at: [250, 150], len: 100, label: 'sleeve, λ/4', flow: ['TV1', 'RSH'], along: sleeveNames },
      { name: 'ROUT', type: 'R', at: [200, 196], rot: 90, label: 'outside of sleeve', labelAt: 'left' });
    lay.wires.push([200, 90, 200, 150, 'TV1'], [300, 150, 300, 166, 'RSH']);
    lay.grounds.push([200, 226]); lay.h = 246;
  }
  return { netlist: net, layout: lay };
}
/* The share of the feed current that comes back down the outside of the braid. */
function braidShare(ck, kind, f) {
  const s = MN.solveAt(ck, f);
  const feedI = MN.abs(MN.currentThrough(s, 'RA'));
  const out = MN.abs(MN.currentThrough(s, 'ROUT'));
  return { share: out / feedI, a: feedI, b: MN.abs(MN.currentThrough(s, 'RB')), out, sol: s };
}

/* ---------------- the quarter wave sections ---------------- */

/*
 * The 2 m band, 145 MHz, where stacked Yagis and their harnesses live. The
 * sections are solid polythene coax, cut to a quarter wave there, and
 * lossless: Z0 squared = Zin x Zout is a lossless result.
 */
const QW = { f0: 145e6, vf: VF_COAX };
QW.len = C_FREE / QW.f0 / 4 * QW.vf;
function quarterCircuit(view, d, n) {
  const sec = (id, z0) => ({ id, z0 });
  let net = 'V1 s 0 ' + num(vocFor(100, Z_TX)) + '\nRS s n0 50\n';
  const lineNet = (id, from, to, z0) => {
    const names = [];
    let node = from;
    for (let k = 1; k <= n; k++) {
      const nd = k === n ? to : id + 'x' + k;
      names.push(id + k);
      net += id + k + ' ' + node + ' 0 ' + nd + ' 0 ' + num(z0) + ' len=' + num(QW.len / n) + ' vf=' + QW.vf + '\n';
      node = nd;
    }
    return names;
  };
  const els = [
    { name: 'V1', type: 'V', at: [20, 60], rot: 90, label: 'TX' },
    { name: 'RS', type: 'R', at: [50, 30], label: '50 Ω' }
  ];
  const wires = [], grounds = [[20, 90]];
  const tl = (name, x, y, len, names, out, label) => {
    els.push({ name, type: 'TL', at: [x + len / 2, y], len, label, flow: [names[0], out], along: names });
    grounds.push([x, y + 16], [x + len, y + 16]);
  };
  const z0t = ohms(d.qz0, 3);
  if (view === 'one') {
    const names = lineNet('TA', 'n0', 'a', d.qz0);
    net += 'RQA a 0 ' + num(d.qr) + '\n';
    tl('FA', 80, 30, 130, names, 'RQA', 'λ/4 of ' + z0t);
    els.push({ name: 'RQA', type: 'R', at: [240, 60], rot: 90, label: 'aerial' });
    wires.push([210, 30, 240, 30, 'RQA']);
    grounds.push([240, 90]);
    return { netlist: net, layout: { w: 300, h: 110, elements: els, wires, grounds } };
  }
  const tails = view === 'two' ? ['A', 'B'] : ['A', 'B', 'C', 'D'];
  let jx = 100, w;
  if (view === 'four') {
    const names = lineNet('TF', 'n0', 'f', d.qz1);
    net += 'RJ f j 1m\n';
    tl('FF', 80, 30, 100, names, 'RJ', 'λ/4 of ' + ohms(d.qz1, 3));
    wires.push([180, 30, 200, 30, 'RJ']);
    jx = 200;
  } else {
    net += 'RJ n0 j 1m\n';
    wires.push([80, 30, 100, 30, 'RJ']);
  }
  const ys = view === 'two' ? [30, 100] : [30, 90, 150, 210];
  const tx = jx + 30, tlen = 90;
  tails.forEach((t, k) => {
    const at = k === 0 ? 'j' : 'j' + (k + 1);
    if (k > 0) {
      // the bus from the tail above: it carries this tail and all below it
      net += 'RB' + k + ' ' + (k === 1 ? 'j' : 'j' + k) + ' ' + at + ' 1m\n';
      wires.push([jx, ys[k - 1], jx, ys[k], 'RB' + k]);
    }
    const names = lineNet('T' + t, at, 'y' + t, d.qz0);
    net += 'RQ' + t + ' y' + t + ' 0 ' + num(d.qr) + '\n';
    const y = ys[k];
    wires.push([jx, y, tx, y, names[0]]);
    tl('F' + t, tx, y, tlen, names, 'RQ' + t, k === 0 ? 'λ/4 of ' + z0t : ' ');
    els.push({ name: 'RQ' + t, type: 'R', at: [tx + tlen + 30, y], label: k === 0 ? 'Yagi' : ' ' });
    grounds.push([tx + tlen + 60, y]);
  });
  w = tx + tlen + 70;
  return { netlist: net, layout: { w, h: ys[ys.length - 1] + 40, elements: els, wires, grounds } };
}

/* ---------------- toggles that change with the level ---------------- */

/*
 * An item shows one row of toggle buttons. Where the choices differ by
 * level, the item lists them all and the panel hides those this level does
 * not use, and moves the choice to one it does.
 */
function levelToggle(p, keys) {
  const btns = p.sec.querySelectorAll('.toggle button');
  btns.forEach(b => { b.hidden = keys.indexOf(b.dataset.k) < 0; });
  if (keys.indexOf(p.topology) < 0) { p.topology = keys[0]; p.cursor = null; }
  return p.topology;
}

/* A slider in an item's strip that only one choice on its toggle uses. */
function showCtrl(p, id, on) {
  const box = p.ctrls && p.ctrls.querySelector('[data-ctrl="' + id + '"]');
  if (box) box.hidden = !on;
}

/* ---------------- panels ---------------- */

const Z0_CHOICES = {
  '50': { z0: 50, vf: VF_COAX, name: '50 Ω coax' },
  '75': { z0: 75, vf: VF_COAX, name: '75 Ω coax' },
  '300': { z0: 300, vf: 0.82, twin: true, name: '300 Ω ribbon' },
  '450': { z0: 450, vf: 0.91, twin: true, name: '450 Ω window line' }
};
const STAND_F = 14.2e6;   // the frequency the loss-along-the-feeder panel works at
const niceMax = v => { const e = Math.pow(10, Math.floor(Math.log10(v))); const m = v / e;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * e; };
// a readout in amperes or volts that stays readable from milliamps to tens of volts
const amps = (a, s) => Fm.eng(a, 'A', s || 3);
const volts = (v, s) => Fm.eng(v, 'V', s || 3);

const PANELS = {

  /*
   * 4A2: a transmitter, a matched feeder and its load. The graph is the
   * loss of each cable at this length across the bands; the readouts are
   * the circuit's, solved at the frequency on the slider.
   */
  loss(ctx) {
    const { p, d, t, Plot, swatch, ro, level } = ctx;
    const key = levelToggle(p, ['rg58', 'rg213', 'ladder']), cab = CABLES[key];
    const built = ladder([
      { k: 'src', voc: vocFor(d.ptx, cab.z0), rs: cab.z0, rsLabel: 'its ' + ohms(cab.z0) },
      { k: 'line', id: 'T', z0: cab.z0, len: d.len, vf: cab.vf, db: cab.db10, at: 10e6, sections: 12,
        label: Fm.trim(d.len, 3) + ' m of ' + cab.name, twin: cab.twin, units: 150 },
      { k: 'load', label: 'aerial', parts: [{ name: 'RL', value: cab.z0, label: 'aerial', text: ohms(cab.z0) }] }]);
    sizeFor(p, built.layout);
    const ck = MN.parseNetlist(built.netlist), sol = MN.solveAt(ck, d.f);
    const iin = MN.currentThrough(sol, 'RS'), vin = MN.nodeV(sol, 'n0');
    const pin = MN.mul(vin, cx(iin.re, -iin.im)).re;
    const pout = MN.abs(MN.currentThrough(sol, 'RL')) ** 2 * cab.z0;
    const lossDb = 10 * Math.log10(pin / pout);
    const lo = Math.log10(1.8e6), hi = Math.log10(450e6);
    const curve = c => { const pts = []; for (let i = 0; i <= 120; i++) {
      const lf = lo + (hi - lo) * i / 120;
      pts.push({ x: lf, y: dbPer100(c, Math.pow(10, lf)) * d.len / 100 }); } return pts; };
    const top = niceMax(dbPer100(CABLES.rg58, 450e6) * d.len / 100 * 1.08);
    const traces = [], labels = [];
    Object.keys(CABLES).forEach(k => {
      const pts = curve(CABLES[k]), on = k === key;
      traces.push({ pts, colour: t.p, axis: 'left', width: on ? 2.8 : 1.6, dash: on ? null : DASH });
      labels.push({ x: hi - 0.02, y: pts[pts.length - 1].y, text: k === 'ladder' ? 'window line' : CABLES[k].name.replace(' coax', ''), colour: t.soft });
    });
    Plot.draw(p.graph, {
      xRange: [lo, hi], xFmt: logTicks(p.graph, lo, hi), tokens: t,
      left: { max: top, fmt: v => Fm.trim(v, 3) + ' dB' },
      traces, labels,
      cursor: { x: Math.log10(d.f), colour: t.mark, dot: { y: lossDb, axis: 'left' }, label: mhz(d.f) }
    });
    p.legend.innerHTML = swatch(t.p, 'Loss over ' + Fm.trim(d.len, 3) + ' m, this cable') +
      dashSwatch(t.p, 'the other two') + swatch(t.mark, 'Your frequency');
    const rows = [
      ['Loss in the feeder', db(lossDb), true],
      ['Power at the aerial', watts(pout)],
      level === 'foundation' ? ['A received signal loses', db(lossDb)] : ['Turned to heat', watts(pin - pout)],
      [cab.name.replace(' coax', '') + ' at ' + mhz(d.f), Fm.trim(dbPer100(cab, d.f), 3) + NBSP + 'dB/100' + NBSP + 'm']
    ];
    p.readouts.innerHTML = ro(rows);
    p.lab = Object.assign({ RL: ohms(cab.z0) }, built.lab);
    p.fAnim = d.f;
    return { layout: built.layout, circuit: ck };
  },

  /*
   * 4A3 Intermediate and 4E1: voltage and current along a feeder, from
   * the transmitter to the load, at any length and frequency.
   */
  standing(ctx) {
    const { p, d, t, Plot, swatch, ro, level, item } = ctx;
    const term = item.code === '4A3';
    const ch = term ? Z0_CHOICES[levelToggle(p, ['50', '75', '300', '450'])] : Z0_CHOICES['50'];
    const z0 = ch.z0, ptx = term || level !== 'full' ? 100 : d.ptx;
    const rl = term ? d.rt : d.rl, xl = term ? 0 : d.xl, dbm = term ? 0 : d.dbm;
    const loadParts = [{ name: 'RL', value: rl, label: 'load R', text: ohms(rl) }];
    if (Math.abs(xl) >= 0.5) {
      const pt = partFor(xl, d.f);
      loadParts.push({ name: pt.type + 'L', value: pt.value, label: 'load X',
                       text: (xl > 0 ? '+j' : '−j') + Fm.trim(Math.abs(xl), 3) + ' Ω' });
    }
    const built = ladder([
      { k: 'src', voc: vocFor(ptx, z0), rs: z0, rsLabel: 'its ' + ohms(z0) },
      { k: 'line', id: 'T', z0, len: d.len, vf: ch.vf, db: dbm * 100, sections: 16,
        label: Fm.trim(d.len, 3) + ' m, ' + ch.name, twin: ch.twin, units: 160 },
      { k: 'load', label: 'load', parts: loadParts }]);
    sizeFor(p, built.layout);
    const ck = MN.parseNetlist(built.netlist), sol = MN.solveAt(ck, d.f);
    const line = built.lines[0];
    // at least a dozen points per half wave, so a long line at UHF is drawn as
    // its true envelope and not as a false, aliased pattern
    const halfWaves = d.len / (C_FREE * ch.vf / d.f / 2);
    const pts = alongLine(sol, line, Math.min(400, Math.max(14, Math.ceil(12 * halfWaves / line.sections))));
    const vmax = Math.max(...pts.map(q => MN.abs(q.v))), imax = Math.max(...pts.map(q => MN.abs(q.i)));
    const vmin = Math.min(...pts.map(q => MN.abs(q.v)));
    const zc = p.cursor === null ? (term ? 0.35 : 1) * d.len : p.cursor * d.len;
    const seg = d.len / line.sections, sk = Math.min(line.sections, Math.floor(zc / seg) + 1);
    const here = MN.lineAt(sol, 'T' + sk, zc - seg * (sk - 1));
    Plot.draw(p.graph, {
      xRange: [0, d.len], xFmt: v => Fm.trim(v, 3) + ' m', tokens: t,
      left: { max: niceMax(vmax * 1.08), fmt: v => Fm.eng(v, 'V', 3) },
      right: { min: 0, max: niceMax(imax * 1.08), fmt: v => Fm.eng(v, 'A', 3) },
      traces: [{ pts: pts.map(q => ({ x: q.z, y: MN.abs(q.i) })), colour: t.i, axis: 'right', width: 2 },
               { pts: pts.map(q => ({ x: q.z, y: MN.abs(q.v) })), colour: t.v, fill: t.vFill, axis: 'left', width: 2.4 }],
      cursor: { x: zc, colour: t.mark, dot: { y: MN.abs(here.v), axis: 'left' },
                label: Fm.trim(zc, 3) + ' m from the TX' }
    });
    p.legend.innerHTML = swatch(t.v, 'RMS voltage, left scale') + swatch(t.i, 'RMS current, right scale') +
      '<span>Distance from the transmitter; the load is at the right</span>';
    const ports = MN.linePorts(sol, 'T' + line.sections);
    const zin = zSeen(sol), gl = gammaOf(MN.div(ports.v2, ports.i2), z0);
    if (term) {
      p.readouts.innerHTML = ro([
        ['Voltage here', volts(MN.abs(here.v))],
        ['Current here', amps(MN.abs(here.i))],
        ['V ÷ I here', ohms(MN.abs(here.v) / MN.abs(here.i)), true],
        ['Terminated in ' + sym('Z₀') + '?', Math.abs(rl - z0) < 0.01 * z0 ? 'yes' : 'no: ' + ohms(rl) + ' on ' + ohms(z0)]
      ]);
    } else if (level === 'full') {
      const m = meterAt(ports.v2, ports.i2, z0);
      p.readouts.innerHTML = ro([
        ['Forward volts at the load', volts(m.vf)],
        ['Reflected volts', volts(m.vr)],
        ['SWR there', swrText((m.vf + m.vr) / (m.vf - m.vr)), true],
        ['Return loss there', db(rlOf(m.vr / m.vf))],
        ['TX sees', zText(zin)]
      ]);
    } else {
      p.readouts.innerHTML = ro([
        ['Highest voltage', volts(vmax)],
        ['Lowest voltage', volts(vmin)],
        ['SWR at the load', swrText(swrOf(gl)), true],
        ['TX sees', zText(zin)]
      ]);
    }
    p.lab = built.lab;
    p.fAnim = d.f;
    return { layout: built.layout, circuit: ck };
  },

  /*
   * 4A3 Full: a stub across a 75 Ω downlead, open or shorted, swept across
   * frequency. Its length and its velocity factor are on the controls.
   */
  stub(ctx) {
    const { p, d, t, Plot, swatch, ro } = ctx;
    const end = levelToggle(p, ['open', 'short']);
    const drawn = stubCircuit(d.slen, d.vf, end, 10);
    sizeFor(p, drawn.layout);
    const fast = MN.parseNetlist(stubCircuit(d.slen, d.vf, end, 1).netlist);
    const f1 = d.f1;   // where the stub is a quarter wave
    const xb = niceMax(Math.max(3.3 * f1, 1.2 * Math.max(d.fwant, d.fkill))), xa = xb / 700;
    const pts = [];
    for (let i = 0; i <= 700; i++) {
      const f = xa + (xb - xa) * i / 700;
      pts.push({ x: f, y: Math.max(-40, stubDb(fast, f)) + 40 });
    }
    // the notches are narrow: make sure the sweep lands in each one
    const fc = p.cursor === null ? d.fkill : xa + (xb - xa) * p.cursor;
    const atC = stubDb(fast, fc);
    Plot.draw(p.graph, {
      xRange: [0, xb], xFmt: xLabels(p.graph, 0, xb, v => Fm.trim(v / 1e6, 3) + ' MHz'), tokens: t,
      left: { max: 40, fmt: v => Math.round(v - 40) + ' dB' },
      traces: [{ pts, colour: t.p, fill: t.pFill, axis: 'left', width: 2.2 }],
      marks: [{ x: d.fwant }, { x: d.fkill }],
      // near the foot of the graph, where only a notch's own walls run, and they are steep
      labels: [{ x: d.fwant, y: 13, text: 'wanted' }, { x: d.fkill, y: 3, text: 'unwanted' }],
      cursor: { x: fc, colour: t.mark, dot: { y: Math.max(-40, atC) + 40, axis: 'left' }, label: mhz(fc) }
    });
    p.legend.innerHTML = swatch(t.p, 'Power reaching the receiver, against no stub at all') +
      dashSwatch(t.mark, 'Wanted and unwanted signals');
    const zst = MN.div(MN.nodeV(MN.solveAt(fast, d.fkill), 'j'), MN.currentThrough(MN.solveAt(fast, d.fkill), 'TS1'));
    p.readouts.innerHTML = ro([
      [sym('λ') + '/4 at', mhz(f1)],
      ['Loss at ' + mhz(d.fkill), db(-d.atKill(end)), true],
      ['Loss at ' + mhz(d.fwant), db(-d.atWant(end))],
      ['Stub looks like, at ' + mhz(d.fkill), ohms(MN.abs(zst), 3)]
    ]);
    p.lab = { RS: '', RL: '75 Ω', FS: Fm.trim(d.slen * 100, 3) + ' cm' };
    p.fAnim = fc;
    return { layout: drawn.layout, circuit: MN.parseNetlist(drawn.netlist) };
  },

  /*
   * 4B1: how much of the return current comes back down the outside of
   * the braid, with no balun and with each kind, across the bands.
   */
  balun(ctx) {
    const { p, d, t, Plot, swatch, ro, level } = ctx;
    const keys = level === 'foundation' ? ['none', 'ferrite'] : level === 'intermediate'
      ? ['none', 'coil', 'ferrite'] : ['none', 'coil', 'ferrite', 'sleeve'];
    const kind = levelToggle(p, keys);
    showCtrl(p, 'fsl', kind === 'sleeve');
    const drawn = balunCircuit(kind, d.fsl, 6);
    sizeFor(p, drawn.layout);
    const fast = MN.parseNetlist(balunCircuit(kind, d.fsl, 1).netlist);
    const lo = Math.log10(1.8e6), hi = Math.log10(450e6), pts = [];
    for (let i = 0; i <= 240; i++) {
      const lf = lo + (hi - lo) * i / 240;
      pts.push({ x: lf, y: 100 * braidShare(fast, kind, Math.pow(10, lf)).share });
    }
    const at = braidShare(fast, kind, d.fbal);
    Plot.draw(p.graph, {
      xRange: [lo, hi], xFmt: logTicks(p.graph, lo, hi), tokens: t,
      left: { max: 40, fmt: v => Math.round(v) + '%' },
      traces: [{ pts, colour: t.i, fill: t.iFill, axis: 'left', width: 2.4 }],
      marks: kind === 'sleeve' ? [{ x: Math.log10(d.fsl) }] : [],
      cursor: { x: Math.log10(d.fbal), colour: t.mark, dot: { y: 100 * at.share, axis: 'left' }, label: mhz(d.fbal) }
    });
    p.legend.innerHTML = swatch(t.i, 'Current on the outside of the braid, as a share of the feed current') +
      (kind === 'sleeve' ? dashSwatch(t.mark, 'The sleeve is λ/4 here') : '');
    const s = at.sol;
    const zc = kind === 'none' ? null : MN.div(MN.sub(MN.nodeV(s, 'q'),
      MN.nodeV(s, kind === 'ferrite' ? 'm2' : kind === 'coil' ? 'm1' : 'sv')), MN.currentThrough(s, 'ROUT'));
    p.readouts.innerHTML = ro([
      ['Arm A', amps(at.a)],
      ['Arm B', amps(at.b)],
      ['Outside of the braid', Fm.trim(100 * at.share, 2) + NBSP + '%', true],
      ['The balun at ' + mhz(d.fbal), zc ? ohms(MN.abs(zc)) : 'none fitted']
    ]);
    p.lab = { RA: '36.5 Ω', RB: '36.5 Ω', ROUT: '100 Ω' };
    if (kind === 'ferrite') Object.assign(p.lab, { LCH: '10 µH', RCH: '1 kΩ' });
    if (kind === 'coil') Object.assign(p.lab, { LCH: '8 µH', CCH: '6 pF' });
    if (kind === 'sleeve') p.lab.FV = Fm.trim(C_FREE * 0.95 / d.fsl / 4 * 100, 3) + ' cm';
    p.fAnim = d.fbal;
    return { layout: drawn.layout, circuit: MN.parseNetlist(drawn.netlist) };
  },

  /*
   * Foundation and Intermediate: a dipole cut for 7.1 MHz on the end of
   * 20 m of RG213, with or without an AMU, or with a fault at the top.
   */
  system(ctx) {
    const { p, d, t, Plot, swatch, ro, level, item } = ctx;
    let mode = 'none';
    if (item.code === '4E2') mode = { ok: 'none', open: 'open', short: 'short' }[levelToggle(p, ['ok', 'open', 'short'])];
    if (item.code === '4F1') mode = levelToggle(p, level === 'foundation' ? ['none', 'tx'] : ['none', 'tx', 'ant']);
    const drawn = systemCircuit(mode, d.fop, 10);
    sizeFor(p, drawn.layout);
    const fast = MN.parseNetlist(systemCircuit(mode, d.fop, 1).netlist);
    const look = f => {
      const s = MN.solveAt(fast, f), pt = MN.linePorts(s, 'T1');
      return { tx: swrOf(gammaOf(zSeen(s), Z_TX)), feeder: swrOf(gammaOf(MN.div(pt.v2, pt.i2), 50)), s };
    };
    const pts = [], fpts = [];
    for (let i = 0; i <= 200; i++) {
      const f = SYS.lo + (SYS.hi - SYS.lo) * i / 200, r = look(f);
      pts.push({ x: f, y: Math.min(9, r.tx) }); fpts.push({ x: f, y: Math.min(9, r.feeder) });
    }
    const now = look(d.fop), s = now.s;
    const traces = [{ pts, colour: t.v, axis: 'left', width: 2.6 }];
    if (mode === 'tx') traces.unshift({ pts: fpts, colour: t.v, axis: 'left', width: 1.8, dash: DASH });
    if (mode === 'ant') traces.unshift({ pts: fpts, colour: t.v, axis: 'left', width: 1.8, dash: DASH });
    Plot.draw(p.graph, {
      xRange: [SYS.lo, SYS.hi], xFmt: xLabels(p.graph, SYS.lo, SYS.hi, v => Fm.trim(v / 1e6, 3) + ' MHz'), tokens: t,
      left: { min: 1, max: 9, fmt: v => Fm.trim(v, 2) + ':1' },
      traces,
      marks: [{ x: AER.f0 }],
      cursor: { x: d.fop, colour: t.mark, dot: { y: Math.min(9, now.tx), axis: 'left' }, label: mhz(d.fop) }
    });
    p.legend.innerHTML = swatch(t.v, 'SWR the transmitter sees') +
      (mode === 'tx' || mode === 'ant' ? dashSwatch(t.v, 'SWR on the feeder') : '') +
      dashSwatch(t.mark, 'The aerial is cut for 7.1 MHz');
    const m = meterAt(MN.nodeV(s, 'n0'), MN.currentThrough(s, 'RS'), Z_TX);
    const pAer = mode === 'open' || mode === 'short' ? 0 : MN.abs(MN.currentThrough(s, 'RE')) ** 2 * AER.r;
    // 4E2 is about faults; in 4E1 and 4F1 a high SWR is the aerial used off its frequency
    const cause = item.code === '4E2' ? 'fault in aerial or feeder' : 'aerial off its frequency';
    const verdict = now.tx < 1.5 ? 'good' : now.tx <= 2 ? 'acceptable' : now.tx < 3 ? 'too high: ' + cause
      : 'far too high: risk of damage';
    let rows;
    if (item.code === '4E2') {
      rows = [['Forward', watts(m.pf)], ['Reflected', watts(m.pr)], ['SWR', swrText(now.tx), true], ['Verdict', verdict]];
    } else if (item.code === '4F1') {
      rows = [['SWR the TX sees', swrText(now.tx), true], ['SWR on the feeder', swrText(now.feeder)],
              ['Power to the aerial', watts(pAer)],
              ['AMU', mode === 'none' ? 'none' : mode === 'tx' ? 'in the shack' : 'at the aerial']];
    } else {
      rows = [['Frequency', mhz(d.fop)], ['SWR the TX sees', swrText(now.tx), true],
              ['Power to the aerial', watts(pAer)], ['Verdict', verdict]];
    }
    p.readouts.innerHTML = ro(rows);
    p.lab = drawn.lab;
    p.fAnim = d.fop;
    return { layout: drawn.layout, circuit: MN.parseNetlist(drawn.netlist) };
  },

  /*
   * 4E2 Full: return loss across the band, as an antenna analyser plots
   * it, measured at the aerial and at the transmitter end of the feeder.
   */
  analyser(ctx) {
    const { p, d, t, Plot, swatch, ro } = ctx;
    const line = n => ({ k: 'line', id: 'T', z0: 50, len: d.len, vf: VF_COAX, db: d.dbm * 100, at: AER.f0,
                         sections: n, label: Fm.trim(d.len, 3) + ' m of feeder', units: 130 });
    const parts = n => [{ k: 'src', voc: vocFor(25, Z_TX), rs: Z_TX, rsLabel: 'its 50 Ω' }, line(n), aerialLoad()];
    const drawn = ladder(parts(10));
    sizeFor(p, drawn.layout);
    const fast = MN.parseNetlist(ladder(parts(1)).netlist);
    const look = f => {
      const s = MN.solveAt(fast, f), pt = MN.linePorts(s, 'T1');
      return { tx: rlOf(gammaOf(zSeen(s), Z_TX)), aer: rlOf(gammaOf(MN.div(pt.v2, pt.i2), 50)) };
    };
    const a = [], b = [];
    for (let i = 0; i <= 220; i++) {
      const f = SYS.lo + (SYS.hi - SYS.lo) * i / 220, r = look(f);
      a.push({ x: f, y: Math.min(40, r.aer) }); b.push({ x: f, y: Math.min(40, r.tx) });
    }
    const fc = p.cursor === null ? AER.f0 : SYS.lo + (SYS.hi - SYS.lo) * p.cursor, now = look(fc);
    Plot.draw(p.graph, {
      xRange: [SYS.lo, SYS.hi], xFmt: xLabels(p.graph, SYS.lo, SYS.hi, v => Fm.trim(v / 1e6, 3) + ' MHz'), tokens: t,
      left: { max: 40, fmt: v => Math.round(v) + ' dB' },
      traces: [{ pts: b, colour: t.p, axis: 'left', width: 2, dash: DASH },
               { pts: a, colour: t.p, fill: t.pFill, axis: 'left', width: 2.6 }],
      cursor: { x: fc, colour: t.mark, dot: { y: Math.min(40, now.tx), axis: 'left' }, label: mhz(fc) }
    });
    p.legend.innerHTML = swatch(t.p, 'Return loss at the aerial') + dashSwatch(t.p, 'measured at the transmitter') +
      '<span>Drag across the graph to read any frequency</span>';
    p.readouts.innerHTML = ro([
      ['At the aerial', db(now.aer) + ', SWR ' + swrText(swrOf(Math.pow(10, -now.aer / 20)))],
      ['At the transmitter', db(now.tx), true],
      ['SWR there', swrText(swrOf(Math.pow(10, -now.tx / 20)))],
      ['Feeder loss, one way', db(d.dbm * d.len * Math.sqrt(fc / AER.f0))]
    ]);
    p.lab = drawn.lab;
    p.fAnim = fc;
    return { layout: drawn.layout, circuit: MN.parseNetlist(drawn.netlist) };
  },

  /*
   * 4E3: forward and reflected power along a lossy feeder, read the way a
   * directional coupler would read them at every point.
   */
  along(ctx) {
    const { p, d, t, Plot, swatch, ro } = ctx;
    const open = d.rla < 0.05;
    const rload = open ? 0 : loadForRl(d.rla, 50);
    const built = ladder([
      { k: 'src', voc: vocFor(d.ptx, Z_TX), rs: Z_TX, rsLabel: 'its 50 Ω' },
      { k: 'line', id: 'T', z0: 50, len: d.len, vf: VF_COAX, db: d.dbm * 100, sections: 16,
        label: Fm.trim(d.len, 3) + ' m, ' + Fm.trim(d.dbm, 3) + ' dB per metre', units: 160 },
      open ? { k: 'open', label: 'open end' }
           : { k: 'load', label: 'aerial', parts: [{ name: 'RL', value: rload, label: 'aerial', text: ohms(rload) }] }]);
    sizeFor(p, built.layout);
    const ck = MN.parseNetlist(built.netlist), sol = MN.solveAt(ck, STAND_F);
    const line = built.lines[0], pts = alongLine(sol, line, 8);
    const fw = [], rv = [];
    pts.forEach(q => {
      const m = meterAt(q.v, q.i, 50);
      fw.push({ x: q.z, y: 10 * Math.log10(m.pf / d.ptx) });
      rv.push({ x: q.z, y: 10 * Math.log10(Math.max(1e-12, m.pr) / d.ptx) });
    });
    const bottom = -Math.min(60, 10 * Math.ceil((d.rla + 2 * d.dbm * d.len + 4) / 10));
    const m0 = meterAt(pts[0].v, pts[0].i, 50), m1 = meterAt(pts[pts.length - 1].v, pts[pts.length - 1].i, 50);
    const rlTx = 10 * Math.log10(m0.pf / m0.pr), rlAer = open ? 0 : 10 * Math.log10(m1.pf / m1.pr);
    Plot.draw(p.graph, {
      xRange: [0, d.len], xFmt: v => Fm.trim(v, 3) + ' m', tokens: t,
      left: { min: bottom, max: 0, fmt: v => Math.round(v) + ' dB' },
      traces: [{ pts: rv.map(q => ({ x: q.x, y: Math.max(bottom, q.y) })), colour: t.p, axis: 'left', width: 2, dash: DASH },
               { pts: fw, colour: t.p, axis: 'left', width: 2.6 }],
      labels: [{ x: d.len * 0.98, y: fw[fw.length - 1].y, text: 'forward' },
               { x: d.len * 0.98, y: Math.max(bottom, rv[rv.length - 1].y), text: 'reflected' }],
      cursor: null
    });
    p.legend.innerHTML = swatch(t.p, 'Forward power') + dashSwatch(t.p, 'Reflected power') +
      '<span>Both against the power sent, along the feeder from the transmitter</span>';
    p.readouts.innerHTML = ro([
      ['Return loss at the aerial', open ? '0 dB, open end' : db(rlAer)],
      ['Return loss at the TX', db(rlTx), true],
      ['SWR at the aerial', open ? 'infinite' : swrText(swrOf(Math.pow(10, -rlAer / 20)))],
      ['SWR at the TX', swrText(swrOf(Math.pow(10, -rlTx / 20)))],
      ['Reflected, back at the TX', watts(m0.pr)]
    ]);
    p.lab = built.lab;
    p.fAnim = STAND_F;
    return { layout: built.layout, circuit: ck };
  },

  /*
   * 4F1 Full: an L, pi or T network designed for whatever load is on the
   * controls, then solved, and swept either side of the design frequency.
   */
  tuner(ctx) {
    const { p, d, t, Plot, swatch, ro } = ctx;
    const kind = levelToggle(p, ['L', 'pi', 'T']);
    const built = tunerCircuit(kind, d);
    sizeFor(p, built.layout);
    const ck = MN.parseNetlist(built.netlist);
    const fa = d.af * 0.8, fb = d.af * 1.2, pts = [], bare = [];
    const zl = f => { const x = d.ax === 0 ? 0 : d.ax > 0 ? d.ax * f / d.af : d.ax * d.af / f; return cx(d.ar, x); };
    for (let i = 0; i <= 200; i++) {
      const f = fa + (fb - fa) * i / 200;
      pts.push({ x: f, y: Math.min(9, swrOf(gammaOf(zSeen(MN.solveAt(ck, f)), Z_TX))) });
      bare.push({ x: f, y: Math.min(9, swrOf(gammaOf(zl(f), Z_TX))) });
    }
    const fc = p.cursor === null ? d.af : fa + (fb - fa) * p.cursor;
    const zin = zSeen(MN.solveAt(ck, fc));
    // the band either side over which the SWR stays under 1.5
    const ok = pts.filter(q => q.y <= 1.5);
    Plot.draw(p.graph, {
      xRange: [fa, fb], xFmt: xLabels(p.graph, fa, fb, v => Fm.trim(v / 1e6, 4) + ' MHz'), tokens: t,
      left: { min: 1, max: 9, fmt: v => Fm.trim(v, 2) + ':1' },
      traces: [{ pts: bare, colour: t.v, axis: 'left', width: 1.8, dash: DASH },
               { pts, colour: t.v, axis: 'left', width: 2.6 }],
      bands: ok.length ? [{ from: ok[0].x, to: ok[ok.length - 1].x }] : [],
      cursor: { x: fc, colour: t.mark, dot: { y: Math.min(9, swrOf(gammaOf(zin, Z_TX))), axis: 'left' }, label: mhz(fc) }
    });
    p.legend.innerHTML = swatch(t.v, 'SWR the TX sees, through the AMU') + dashSwatch(t.v, 'SWR of the load on its own') +
      '<span>Shaded: SWR under 1.5:1</span>';
    p.readouts.innerHTML = ro([
      ['Parts', built.parts.map(q => q.label + ' ' + q.text).join(', ')],
      ['TX sees at ' + mhz(fc), zText(zin), true],
      ['Load on its own', zText(zl(fc)) + ', SWR ' + swrText(swrOf(gammaOf(zl(fc), Z_TX)))],
      ['SWR under 1.5:1', ok.length ? Fm.trim(ok[0].x / 1e6, 4) + ' to ' + Fm.trim(ok[ok.length - 1].x / 1e6, 4) + NBSP + 'MHz' : 'nowhere']
    ]);
    p.lab = built.lab;
    p.fAnim = fc;
    return { layout: built.layout, circuit: ck };
  },

  /*
   * 4F2: a quarter wave transformer, alone or in a stacking harness,
   * swept across the 2 m band and well beyond it.
   */
  quarter(ctx) {
    const { p, d, t, Plot, swatch, ro } = ctx;
    const view = levelToggle(p, ['one', 'two', 'four']);
    showCtrl(p, 'qz1', view === 'four');
    const drawn = quarterCircuit(view, d, view === 'four' ? 3 : 6);
    sizeFor(p, drawn.layout);
    const fast = MN.parseNetlist(quarterCircuit(view, d, 1).netlist);
    const n = view === 'one' ? 1 : view === 'two' ? 2 : 4;
    const fa = QW.f0 * 0.5, fb = QW.f0 * 1.5, pts = [];
    for (let i = 0; i <= 220; i++) {
      const f = fa + (fb - fa) * i / 220;
      pts.push({ x: f, y: Math.min(5, swrOf(gammaOf(zSeen(MN.solveAt(fast, f)), Z_TX))) });
    }
    const direct = swrOf(gammaOf(cx(d.qr / n), Z_TX));
    const fc = p.cursor === null ? QW.f0 : fa + (fb - fa) * p.cursor;
    const zin = zSeen(MN.solveAt(fast, fc));
    Plot.draw(p.graph, {
      xRange: [fa, fb], xFmt: xLabels(p.graph, fa, fb, v => Fm.trim(v / 1e6, 3) + ' MHz'), tokens: t,
      left: { min: 1, max: 5, fmt: v => Fm.trim(v, 2) + ':1' },
      traces: [{ pts: [{ x: fa, y: Math.min(5, direct) }, { x: fb, y: Math.min(5, direct) }], colour: t.v,
                 axis: 'left', width: 1.8, dash: DASH },
               { pts, colour: t.v, axis: 'left', width: 2.6 }],
      marks: [{ x: QW.f0 }],
      cursor: { x: fc, colour: t.mark, dot: { y: Math.min(5, swrOf(gammaOf(zin, Z_TX))), axis: 'left' }, label: mhz(fc) }
    });
    p.legend.innerHTML = swatch(t.v, 'SWR on the 50 Ω feeder') +
      dashSwatch(t.v, n === 1 ? 'the aerial connected directly' : 'the aerials joined directly') +
      dashSwatch(t.mark, 'Cut for 145 MHz');
    p.readouts.innerHTML = ro([
      ['Each ' + sym('λ') + '/4, physical', Fm.trim(QW.len * 100, 3) + NBSP + 'cm'],
      ['TX sees at ' + mhz(fc), zText(zin), true],
      ['SWR on the feeder', swrText(swrOf(gammaOf(zin, Z_TX)))],
      ['Joined directly', ohms(d.qr / n) + ', SWR ' + swrText(direct)]
    ]);
    p.lab = { RQA: ohms(d.qr) };
    p.fAnim = fc;
    return { layout: drawn.layout, circuit: MN.parseNetlist(drawn.netlist) };
  }
};

/* The tuner: transmitter, the network for this load, and the load. */
function tunerCircuit(kind, d) {
  const zl = cx(d.ar, d.ax);
  const design = kind === 'L' ? lNet(zl, Z_TX) : kind === 'pi' ? piNet(zl, Z_TX) : tNet(zl, Z_TX);
  const parts = netParts(design, d.af, 'M');
  const load = [{ name: 'RT', value: d.ar, label: 'load R', text: ohms(d.ar) }];
  if (Math.abs(d.ax) >= 0.5) {
    const pt = partFor(d.ax, d.af);
    load.push({ name: pt.type + 'T', value: pt.value, label: 'load X',
                text: (d.ax > 0 ? '+j' : '−j') + Fm.trim(Math.abs(d.ax), 3) + ' Ω' });
  }
  const built = ladder([{ k: 'src', voc: vocFor(100, Z_TX), rs: Z_TX, rsLabel: 'its 50 Ω' }]
    .concat(parts, [{ k: 'load', label: 'load', parts: load }]));
  built.parts = parts;
  built.design = design;
  return built;
}

/* The working for one part of the AMU on the controls. */
function amuWork(d, k) {
  const q = tunerCircuit(d.device, d).parts[k];
  if (!q) return ['no such part in this network', '—'];
  const where = q.k === 'series' ? 'in series' : 'to earth';
  const f = '<b>' + Fm.trim(d.af / 1e6, 4) + NBSP + 'MHz</b>';
  if (q.name[0] === 'L') {
    return [q.label + ', ' + where + ': 2π × ' + f + ' × <b>' + hue('l', q.text) + '</b>', hue('l', ohms(Math.abs(q.x)))];
  }
  return [q.label + ', ' + where + ': 1 ÷ (2π × ' + f + ' × <b>' + hue('c', q.text) + '</b>)', hue('c', ohms(Math.abs(q.x)))];
}

/* The working for the quarter wave sections, in the view on the toggle. */
function quarterWork(d, solve) {
  const view = d.device, z = v => '<b>' + hue('z', ohms(v, 4)) + '</b>';
  // a Z0 to be squared is written bare, so 75² never reads as 75 Ω²
  const sq = v => '<b>' + hue('z', Fm.trim(v, 4)) + '</b>²';
  const tail = d.qz0 * d.qz0 / d.qr;
  if (view === 'two') {
    return solve
      ? ['each tail must give 2 × 50 = 100 Ω: √(' + z(100) + ' × ' + z(d.qr) + ')', hue('z', ohms(Math.sqrt(100 * d.qr), 4))]
      : ['each tail: ' + sq(d.qz0) + ' ÷ ' + z(d.qr) + ' = ' + ohms(tail, 4) + '; two in parallel, ÷ 2',
         hue('z', ohms(tail / 2, 4))];
  }
  if (view === 'four') {
    const joint = tail / 4;
    return solve
      ? ['the joint is ' + ohms(tail, 4) + ' ÷ 4 = ' + ohms(joint, 4) + ': √(' + z(joint) + ' × ' + z(50) + ')',
         hue('z', ohms(Math.sqrt(joint * 50), 4))]
      : ['tails: ' + sq(d.qz0) + ' ÷ ' + z(d.qr) + ' = ' + ohms(tail, 4) + ', four in parallel ' + ohms(joint, 4) +
         '; then ' + sq(d.qz1) + ' ÷ ' + z(joint), hue('z', ohms(d.qz1 * d.qz1 / joint, 4))];
  }
  return solve
    ? ['√(' + z(50) + ' × ' + z(d.qr) + ')', hue('z', ohms(Math.sqrt(50 * d.qr), 4))]
    : [sq(d.qz0) + ' ÷ ' + z(d.qr), hue('z', ohms(tail, 4))];
}

/* ---------------- quick solves for the working ---------------- */

/* A transmitter, one feeder and a load, solved once: the load end and the TX end. */
function lineEnds(z0, vf, len, dbPer100, load, ptx, f) {
  const parts = [{ k: 'src', voc: vocFor(ptx, z0), rs: z0 },
    { k: 'line', id: 'T', z0, len, vf, db: dbPer100, sections: 1 }];
  if (load === null) parts.push({ k: 'open' });
  else {
    const lp = [{ name: 'RL', value: load.re }];
    if (Math.abs(load.im) >= 0.5) { const pt = partFor(load.im, f); lp.push({ name: pt.type + 'L', value: pt.value }); }
    parts.push({ k: 'load', parts: lp });
  }
  const s = MN.solveAt(MN.parseNetlist(ladder(parts).netlist), f), pt = MN.linePorts(s, 'T1');
  return { tx: meterAt(MN.nodeV(s, 'n0'), MN.currentThrough(s, 'RS'), z0), load: meterAt(pt.v2, pt.i2, z0),
           v0: MN.abs(MN.nodeV(s, 'n0')), i0: MN.abs(MN.currentThrough(s, 'RS')) };
}

const BENCH = {
  group: '4A, 4B, 4E, 4F',
  groups: ['4A', '4B', '4E', '4F'],
  title: 'Feeders, SWR and matching',
  pageTitle: 'Feeders and Matching Bench',
  levels: ['foundation', 'intermediate', 'full'],
  // the course sessions that send learners here, named in the colophon
  sessions: {
    foundation: ['Foundation session 6 (Feeders and antennas)'],
    intermediate: ['Intermediate session 10 (Feeders and antennas)'],
    full: ['Full session 16 (Feeders and matching)', 'Full session 17 (SWR and antennas)']
  },
  circuitBased: true,
  standfirst: 'Move a control and the page recalculates. Every circuit is solved live, feeders included: each is a real length of lossy line at the frequency you set.',
  colophonNote: 'Circuits are solved by a general complex nodal analysis engine, with each feeder as a transmission line whose loss rises with the square root of frequency, checked against the line equations and hand calculations. The aerial, balun and cable figures are illustrative. Circuit symbols follow the RSGB specification.',
  // the networks are wider than the default column allows at a readable size
  circuitColumn: 480,

  /** Every circuit this page draws, with what flows in it, for the checkers. */
  allLayouts: () => {
    const out = [];
    const add = (name, built) => out.push({ name, layout: built.layout, netlist: built.netlist, flow: { mode: 'ac' } });
    Object.keys(CABLES).forEach(k => {
      const c = CABLES[k];
      add('loss, ' + c.name, ladder([{ k: 'src', voc: 10, rs: c.z0 },
        { k: 'line', id: 'T', z0: c.z0, len: 20, vf: c.vf, db: c.db10, at: 10e6, sections: 12, twin: c.twin, units: 150 },
        { k: 'load', parts: [{ name: 'RL', value: c.z0 }] }]));
    });
    [[100, 0], [100, 80], [30, -60]].forEach(([r, x]) => {
      const lp = [{ name: 'RL', value: r }];
      if (x) { const pt = partFor(x, 14.2e6); lp.push({ name: pt.type + 'L', value: pt.value }); }
      add('standing, load ' + r + (x ? ' and ' + x : ''), ladder([{ k: 'src', voc: 10, rs: 50 },
        { k: 'line', id: 'T', z0: 50, len: 20, vf: VF_COAX, db: 5, sections: 16, units: 160 },
        { k: 'load', parts: lp }]));
    });
    ['open', 'short'].forEach(e => add('stub, ' + e, stubCircuit(0.347, 0.67, e, 10)));
    ['none', 'coil', 'ferrite', 'sleeve'].forEach(k => add('balun, ' + k, balunCircuit(k, 145e6, 6)));
    ['none', 'tx', 'ant', 'open', 'short'].forEach(m => add('station, ' + m, systemCircuit(m, 6.5e6, 10)));
    add('along, open end', ladder([{ k: 'src', voc: 10, rs: 50 },
      { k: 'line', id: 'T', z0: 50, len: 20, vf: VF_COAX, db: 5, sections: 16, units: 160 }, { k: 'open' }]));
    [[200, -150], [20, 60], [1000, 300]].forEach(([r, x]) => ['L', 'pi', 'T'].forEach(k =>
      add('tuner ' + k + ', ' + r + ' ' + x, tunerCircuit(k, { ar: r, ax: x, af: 3.6e6 }))));
    ['one', 'two', 'four'].forEach(v => add('quarter, ' + v,
      quarterCircuit(v, { qz0: 75, qz1: 37.5, qr: 50 }, v === 'four' ? 3 : 6)));
    return out;
  },

  bank: {
    url: 'https://rsgb.services/public/exams/eqdb/',
    topic: '4 - Feeders and antennas',
    note: 'The RSGB bank covers Full only; pick section 4 in its Filter by Topic list.'
  },

  intro: {
    foundation: [
      'Between the radio and the aerial is a feeder, and the aerial has to match it. This page puts the feeder, the aerial and the faults that spoil the match on the bench.',
      'Every circuit is solved as you move the controls, the feeder included: it loses power, it carries reflections, and the transmitter sees whatever the aerial and the feeder present to it.'
    ],
    intermediate: [
      'A feeder is more than a pair of wires. It has an impedance of its own, it loses power, and when the load does not match it, part of the signal comes back.',
      'Each instrument here is a real length of feeder at the frequency you choose. Watch the voltage and current along it, and the moving charge, which swings hardest where the current is greatest.'
    ],
    full: [
      'At Full the feeder becomes something to calculate with: its velocity factor, the SWR and return loss of what it feeds, what its loss hides, and how a quarter wave of it transforms an impedance.',
      'Each section shows the exam formula with your values in it, beside the same circuit solved without any of the exam’s shortcuts. Where the two part company, the page says so.'
    ]
  },

  /*
   * Read before this page was designed. Our own summary of what each source
   * insists on; no wording from any of them appears here.
   */
  sources: {
    read: [
      'Foundation session 6, Intermediate session 10 and Full sessions 16 and 17 of the course (course.g0lft.org)',
      'Syllabus 2024 v1.6b, items 4A1 to 4A3, 4B1, 4E1 to 4E3, 4F1 and 4F2',
      'EX309 Full reference booklet (Feb 2026): v = fλ, the SWR and return loss formulas, and Z0 squared = Zin × Zout',
      'Exam Secrets, feeders and antennas at Foundation, Intermediate and Full'
    ],
    keyMessages: [
      { at: '4A1', level: 'foundation', point: 'coax is the usual RF cable because it is screened; twin feeder is the other kind' },
      { at: '4A1', level: 'intermediate', point: 'equal and opposite currents in twin feeder make fields that cancel, until something nearby upsets the balance' },
      { at: '4A1', level: 'intermediate', point: 'a waveguide carries a signal only if its larger side is more than half a wavelength' },
      { at: '4A2', level: 'foundation', point: 'loss rises with length and frequency, and works on receive as well as transmit' },
      { at: '4A2', level: 'intermediate', point: 'power at the aerial from power and loss in dB, with 3 dB and 10 dB steps' },
      { at: '4A3', level: 'intermediate', point: 'Z0 is set by the conductors’ size and spacing, and V / I = Z0 only when correctly terminated' },
      { at: '4A3', level: 'full', point: 'physical length = electrical length × VF, with VF about 0.67 for solid polythene' },
      { at: '4A3', level: 'full', point: 'an open quarter wave stub is a short at its own frequency: a notch filter' },
      { at: '4B1', level: 'foundation', point: 'a balun is needed between coax and a dipole' },
      { at: '4B1', level: 'intermediate', point: 'choke baluns: turns of the coax, or ferrite rings' },
      { at: '4B1', level: 'full', point: 'transformer, sleeve and choke baluns; 1:1 and 4:1 transformer circuits' },
      { at: '4E1', level: 'foundation', point: 'the aerial must suit the frequency or it will not match' },
      { at: '4E1', level: 'intermediate', point: 'reflected and forward waves combine into standing waves; both suffer feeder loss' },
      { at: '4E1', level: 'full', point: 'SWR = (Vf + Vr) / (Vf − Vr); from powers, take square roots first' },
      { at: '4E2', level: 'foundation', point: 'a high SWR means a fault in the aerial or feeder, and much over 2:1 can damage the transmitter' },
      { at: '4E2', level: 'full', point: 'return loss is forward over reflected power in dB: high return loss, low SWR' },
      { at: '4E3', level: 'full', point: 'return loss at the transmitter = return loss at the aerial + 2 × feeder loss' },
      { at: '4F1', level: 'foundation', point: 'off its frequency an aerial mismatches; an AMU lets the transmitter deliver its power safely' },
      { at: '4F1', level: 'intermediate', point: 'an AMU at the transmitter leaves the SWR on the feeder unchanged' },
      { at: '4F1', level: 'full', point: 'an AMU cancels reactance and transforms resistance; T, pi and L circuits' },
      { at: '4F2', level: 'full', point: 'a quarter wave of feeder transforms impedance: Z0 squared = Zin × Zout' }
    ]
  },

  controls: [
    { id: 'ptx', label: 'Power', unit: 'W', range: [1, 400], start: 100,
      desc: 'The power the transmitter sends up the feeder' },
    { id: 'len', label: 'Feeder length', unit: 'm', range: [1, 100], start: 20,
      desc: 'The physical length of the feeder' },
    { id: 'f', label: 'Frequency', unit: 'Hz', range: [1.8e6, 450e6], start: 14.2e6,
      desc: 'The frequency the feeder is carrying' },
    { id: 'dbm', label: 'Loss, dB per metre', unit: '', range: [0, 1], start: 0.05, linear: true,
      desc: 'Feeder loss at this frequency. RG58 at 145 MHz is about 0.18' },
    { id: 'rt', label: 'Load', unit: 'Ω', range: [10, 1000], start: 50,
      desc: 'The resistance on the far end of the feeder' },
    { id: 'rl', label: 'Load R', unit: 'Ω', range: [1, 1000], start: 100,
      desc: 'The resistance of the load on the far end' },
    { id: 'xl', label: 'Load X', unit: 'Ω', range: [-500, 500], start: 0, linear: true,
      desc: 'Its reactance: positive inductive, negative capacitive' },
    { id: 'rla', label: 'Aerial return loss, dB', unit: '', range: [0, 40], start: 10, linear: true,
      desc: 'How far down the aerial’s reflection is. 0 dB is an open end' },
    { id: 'slen', label: 'Stub length', unit: 'm', range: [0.05, 20], start: 0.347,
      desc: 'The physical length of coax in the stub' },
    { id: 'vf', label: 'Velocity factor', unit: '', range: [0.5, 1], start: 0.67, linear: true,
      desc: 'Of the stub’s coax. Solid polythene is about 0.67' },
    { id: 'fwant', label: 'Wanted signal', unit: 'Hz', range: [10e6, 1e9], start: 100e6,
      desc: 'The signal the receiver should keep, marked on the graph' },
    { id: 'fkill', label: 'Unwanted signal', unit: 'Hz', range: [10e6, 1e9], start: 145e6,
      desc: 'The signal the stub should remove, marked on the graph' },
    { id: 'fbal', label: 'Frequency', unit: 'Hz', range: [1.8e6, 450e6], start: 14.2e6,
      desc: 'The frequency the dipole is being used on' },
    { id: 'fsl', label: 'Sleeve cut for', unit: 'Hz', range: [10e6, 450e6], start: 145e6,
      desc: 'The frequency at which the sleeve is a quarter wave' },
    { id: 'fop', label: 'Frequency', unit: 'Hz', range: [5e6, 9e6], start: 7.1e6, linear: true,
      desc: 'The frequency you are transmitting on. The aerial is cut for 7.1 MHz' },
    { id: 'ar', label: 'Load R', unit: 'Ω', range: [5, 2000], start: 200,
      desc: 'The resistance the AMU has to match' },
    { id: 'ax', label: 'Load X', unit: 'Ω', range: [-1000, 1000], start: -150, linear: true,
      desc: 'Its reactance: positive inductive, negative capacitive' },
    { id: 'af', label: 'Frequency', unit: 'Hz', range: [1.8e6, 30e6], start: 3.6e6,
      desc: 'The frequency the AMU is set for' },
    { id: 'qz0', label: 'Section Z0', unit: 'Ω', range: [10, 300], start: 75,
      desc: 'The characteristic impedance of each quarter wave section or tail' },
    { id: 'qz1', label: 'Matching section Z0', unit: 'Ω', range: [10, 300], start: 37.5,
      desc: 'The last section, used only by the four Yagi harness' },
    { id: 'qr', label: 'Each aerial', unit: 'Ω', range: [10, 1000], start: 100,
      desc: 'The feed impedance of the aerial, or of each Yagi' }
  ],

  /** Everything the working reads. The panels solve their own circuits. */
  derive: (v) => {
    const d = Object.assign({}, v);
    d.f0 = 0;      // nothing here resonates; each panel says what frequency its charge moves at
    // the stub, and where it is a quarter wave
    d.f1 = v.vf * C_FREE / (4 * v.slen);
    const stubAt = {};
    const stubCk = end => stubAt[end] || (stubAt[end] = MN.parseNetlist(stubCircuit(v.slen, v.vf, end, 1).netlist));
    d.atKill = end => stubDb(stubCk(end), v.fkill);
    d.atWant = end => stubDb(stubCk(end), v.fwant);
    // 4E1 at the load end, at the power on the controls and at 100 W
    const ld = cx(v.rl, v.xl);
    d.st = lineEnds(50, VF_COAX, v.len, v.dbm * 100, ld, v.ptx, v.f);
    d.st100 = lineEnds(50, VF_COAX, v.len, v.dbm * 100, ld, 100, v.f);
    // 4E2 at the frequency the aerial is cut for
    d.an = lineEnds(50, VF_COAX, v.len, v.dbm * 100, aerialZ(AER.f0), 25, AER.f0);
    d.feedLoss = v.dbm * v.len;
    return d;
  },

  labels: (p) => p.lab || {},

  /*
   * The equations. `given` records whether the Full reference booklet (EX309,
   * Feb 2026) prints the formula; `tag` overrides the mark at a level, where
   * the Intermediate booklet (EX308) prints it or the syllabus asks for it.
   */
  equations: {
    lossLen: { given: false, name: 'Loss over this length',
      eq: 'loss = dB per 100 m × length ÷ 100',
      work: d => { const c = CABLES[d.device] || CABLES.rg58, per = dbPer100(c, d.f);
        return ['<b>' + Fm.trim(per, 3) + NBSP + 'dB</b> × <b>' + Fm.trim(d.len, 3) + NBSP + 'm</b> ÷ 100',
                hue('p', Fm.trim(per * d.len / 100, 3) + NBSP + 'dB')]; } },
    pAnt: { given: true, tag: { intermediate: 'learn' }, name: 'Power reaching the aerial',
      eq: hue('p', 'P<sub>aerial</sub>') + ' = ' + hue('p', 'P<sub>TX</sub>') + ' ÷ 10<sup>loss ÷ 10</sup>',
      work: d => { const c = CABLES[d.device] || CABLES.rg58, L = dbPer100(c, d.f) * d.len / 100;
        return ['<b>' + hue('p', watts(d.ptx)) + '</b> ÷ 10<sup>' + Fm.trim(L, 3) + ' ÷ 10</sup> = <b>' +
                hue('p', watts(d.ptx)) + '</b> ÷ ' + Fm.trim(Math.pow(10, L / 10), 3),
                hue('p', watts(d.ptx / Math.pow(10, L / 10)))]; } },
    z0vi: { given: true, tag: { intermediate: 'given' }, name: 'Characteristic impedance, from V and I at the transmitter',
      eq: hue('z', 'Z<sub>0</sub>') + ' = ' + hue('v', 'V') + ' ÷ ' + hue('i', 'I') + ', when correctly terminated',
      work: d => { const c = Z0_CHOICES[d.device] || Z0_CHOICES['50'];
        const e = lineEnds(c.z0, c.vf, d.len, 0, cx(d.rt, 0), 100, d.f);
        return ['<b>' + hue('v', volts(e.v0)) + '</b> ÷ <b>' + hue('i', amps(e.i0)) + '</b>',
                hue('z', ohms(e.v0 / e.i0)) + (Math.abs(d.rt - c.z0) < 0.01 * c.z0 ? ', which is ' + hue('z', 'Z<sub>0</sub>')
                  : ', not ' + hue('z', 'Z<sub>0</sub>') + ': the load is not ' + ohms(c.z0))]; } },
    lam: { given: true, name: 'Wavelength in free space',
      eq: 'λ = 300 ÷ f, with f in MHz and λ in metres',
      work: d => ['300 ÷ <b>' + Fm.trim(d.fkill / 1e6, 4) + '</b>', Fm.trim(300e6 / d.fkill, 4) + NBSP + 'm'] },
    phys: { given: false, name: 'A quarter wave of this coax, cut for the unwanted signal',
      eq: 'physical = λ/4 × VF',
      work: d => ['<b>' + Fm.trim(300e6 / d.fkill, 4) + NBSP + 'm</b> ÷ 4 × <b>' + Fm.trim(d.vf, 3) + '</b>',
                  Fm.trim(300e6 / d.fkill / 4 * d.vf * 100, 3) + NBSP + 'cm'] },
    elec: { given: false, name: 'Electrical length of the stub on the controls',
      eq: 'electrical = physical ÷ VF',
      work: d => ['<b>' + Fm.trim(d.slen * 100, 4) + NBSP + 'cm</b> ÷ <b>' + Fm.trim(d.vf, 3) + '</b>',
                  Fm.trim(d.slen / d.vf * 100, 4) + NBSP + 'cm'] },
    fq: { given: false, name: 'The frequency at which that is a quarter wave',
      eq: 'f = 300 ÷ (4 × electrical length), in MHz and metres',
      work: d => ['300 ÷ (4 × <b>' + Fm.trim(d.slen / d.vf, 4) + NBSP + 'm</b>)', mhz(d.f1)] },
    sleeve: { given: false, name: 'Length of the sleeve',
      eq: 'λ/4 × VF, the gap’s VF 0.95 here',
      work: d => ['300 ÷ <b>' + Fm.trim(d.fsl / 1e6, 4) + '</b> ÷ 4 × <b>0.95</b>',
                  Fm.trim(300e6 / d.fsl / 4 * 0.95 * 100, 3) + NBSP + 'cm'] },
    swrMM: { given: false, name: 'SWR from the standing wave, at the load end',
      eq: 'SWR = ' + hue('v', 'V<sub>max</sub>') + ' ÷ ' + hue('v', 'V<sub>min</sub>'),
      work: d => { const m = d.st100.load;
        return ['<b>' + hue('v', volts(m.vf + m.vr)) + '</b> ÷ <b>' + hue('v', volts(m.vf - m.vr)) + '</b>',
                swrText((m.vf + m.vr) / (m.vf - m.vr))]; } },
    swrV: { given: true, name: 'SWR from forward and reflected voltage, at the load',
      eq: 'SWR = (' + hue('v', 'V<sub>f</sub>') + ' + ' + hue('v', 'V<sub>r</sub>') + ') ÷ (' +
          hue('v', 'V<sub>f</sub>') + ' − ' + hue('v', 'V<sub>r</sub>') + ')',
      work: d => { const m = d.st.load;
        return ['(<b>' + hue('v', volts(m.vf)) + '</b> + <b>' + hue('v', volts(m.vr)) + '</b>) ÷ (<b>' +
                hue('v', volts(m.vf)) + '</b> − <b>' + hue('v', volts(m.vr)) + '</b>)',
                swrText((m.vf + m.vr) / (m.vf - m.vr))]; } },
    swrP: { given: false, name: 'The same from a power meter: square roots first',
      eq: hue('v', 'V<sub>r</sub>') + ' ÷ ' + hue('v', 'V<sub>f</sub>') + ' = √(' + hue('p', 'P<sub>r</sub>') +
          ' ÷ ' + hue('p', 'P<sub>f</sub>') + ')',
      work: d => { const m = d.st.load;
        return ['√(<b>' + hue('p', watts(m.pr)) + '</b> ÷ <b>' + hue('p', watts(m.pf)) + '</b>)',
                Fm.trim(Math.sqrt(m.pr / m.pf), 3) + ', so SWR = ' + swrText(swrOf(Math.sqrt(m.pr / m.pf)))]; } },
    rl: { given: true, name: 'Return loss of the aerial at 7.1 MHz',
      eq: 'Return loss = 10 log<sub>10</sub>(' + hue('p', 'P<sub>f</sub>') + ' ÷ ' + hue('p', 'P<sub>r</sub>') + ') dB',
      work: d => { const m = d.an.load;
        return ['10 log<sub>10</sub>(<b>' + hue('p', watts(m.pf)) + '</b> ÷ <b>' + hue('p', watts(m.pr)) + '</b>)',
                db(10 * Math.log10(m.pf / m.pr))]; } },
    rlTx: { given: false, name: 'Return loss at the transmitter',
      eq: 'RL at the TX = RL at the aerial + 2 × feeder loss',
      work: d => { const aer = d.device === 'analyser' ? 10 * Math.log10(d.an.load.pf / d.an.load.pr) : d.rla;
        return ['<b>' + Fm.trim(aer, 4) + NBSP + 'dB</b> + 2 × <b>' + Fm.trim(d.feedLoss, 4) + NBSP + 'dB</b>',
                db(aer + 2 * d.feedLoss, 4)]; } },
    lossTot: { given: false, name: 'Feeder loss, one way',
      eq: 'loss = dB per metre × length',
      work: d => ['<b>' + Fm.trim(d.dbm, 4) + NBSP + 'dB</b> × <b>' + Fm.trim(d.len, 4) + NBSP + 'm</b>',
                  db(d.feedLoss, 4)] },
    xamu1: { given: true, name: 'Reactance of the first part, at the design frequency',
      eq: 'X<sub>L</sub> = 2πfL, X<sub>C</sub> = 1 ÷ 2πfC',
      applies: d => ['L', 'pi', 'T'].indexOf(d.device) >= 0,
      work: d => amuWork(d, 0) },
    xamu2: { given: true, name: 'Reactance of the second part',
      eq: 'X<sub>L</sub> = 2πfL, X<sub>C</sub> = 1 ÷ 2πfC',
      applies: d => ['L', 'pi', 'T'].indexOf(d.device) >= 0,
      work: d => amuWork(d, 1) },
    xamu3: { given: true, name: 'Reactance of the third part',
      eq: 'X<sub>L</sub> = 2πfL, X<sub>C</sub> = 1 ÷ 2πfC',
      applies: d => d.device === 'pi' || d.device === 'T',
      work: d => amuWork(d, 2) },
    q4: { given: true, name: 'What the transmitter sees through the sections',
      eq: hue('z', 'Z<sub>0</sub>') + '² = ' + hue('z', 'Z<sub>in</sub>') + ' × ' + hue('z', 'Z<sub>out</sub>') +
          ', so ' + hue('z', 'Z<sub>in</sub>') + ' = ' + hue('z', 'Z<sub>0</sub>') + '² ÷ ' + hue('z', 'Z<sub>out</sub>'),
      work: d => quarterWork(d, false) },
    q4z: { given: false, name: 'The Z0 that would give exactly 50 Ω',
      eq: hue('z', 'Z<sub>0</sub>') + ' = √(' + hue('z', 'Z<sub>in</sub>') + ' × ' + hue('z', 'Z<sub>out</sub>') + ')',
      work: d => quarterWork(d, true) }
  },

  /* Words this page introduces, defined where they are first used. */
  terms: {
    'feeder': 'The cable that carries radio frequency signals between the radio and the aerial.',
    'coax': 'Coaxial cable: a centre conductor inside a tube of braid, the screen, with insulation between them.',
    'twin feeder': 'Two parallel wires held a fixed distance apart by spacers or a ribbon of plastic. Window line and ladder line are kinds of it.',
    'balanced': 'Carrying equal and opposite signals on two conductors, neither of them earthed. Twin feeder and a dipole are balanced.',
    'unbalanced': 'Carrying the signal on one conductor against an earthed one. Coax is unbalanced: its screen is earthed.',
    'waveguide': 'A hollow metal tube that carries microwave signals inside it, with no centre conductor.',
    'feeder loss': 'The share of the power a feeder turns into heat instead of delivering, usually given in decibels.',
    'decibel': 'Ten times the logarithm of a ratio of powers, written dB. 3 dB is a ratio of two, 10 dB of ten.',
    'characteristic impedance': 'The ratio of voltage to current in a feeder that is correctly terminated, written Z₀. The size and spacing of the conductors set it; the length does not.',
    'correctly terminated': 'Connected to a resistive load equal to the feeder’s own characteristic impedance.',
    'velocity factor': 'The speed of radio waves in a feeder divided by their speed in free space. Always less than 1, and about 0.67 for solid polythene coax.',
    'electrical length': 'The length of a feeder as the wave sees it: in wavelengths inside the feeder, or as the free-space length the wave would cover in the same time.',
    'stub': 'A short length of feeder connected across a line, with its far end left open or shorted.',
    'balun': 'Short for balanced to unbalanced: it joins a balanced aerial or feeder to an unbalanced one, and keeps current off the outside of the coax braid.',
    'choke balun': 'A balun that puts a high impedance in the way of current on the outside of the braid: turns of the coax itself, or ferrite rings over it.',
    'sleeve balun': 'A quarter wave tube, or braid from a larger cable, over the feeder, joined to the braid at the end away from the aerial and left open at the aerial end.',
    'transformer balun': 'Windings on a ferrite core that join coax to a balanced load, either 1:1 or 4:1, the second stepping the impedance up four times.',
    'SWR': 'Standing wave ratio: the biggest voltage on a feeder divided by the smallest. It says how well the load matches; 1:1 is perfect.',
    'standing wave': 'The fixed pattern of high and low voltage, and of current, along a feeder, made where the forward and reflected waves meet.',
    'forward wave': 'The signal travelling up the feeder from the transmitter towards the load.',
    'reflected wave': 'The part of the signal that a mismatched load sends back down the feeder towards the transmitter.',
    'SWR meter': 'A meter in the feeder that measures the forward and reflected power and shows the SWR.',
    'return loss': 'The forward power divided by the reflected power, in decibels. A high return loss is a good match.',
    'antenna analyser': 'A small instrument that measures an aerial’s impedance, SWR and return loss across a band with a low power signal of its own.',
    'AMU': 'Antenna matching unit, also called an ATU: adjustable coils and capacitors that change the impedance the transmitter sees.',
    'quarter-wave transformer': 'A quarter wave of feeder of a chosen Z₀, used to turn one resistance into another.',
    'harness': 'The set of feeders that joins several aerials, such as stacked Yagis, to one main feeder.'
  },

  panels: PANELS,

  /* ---- the nine items, in reading order ---- */
  items: [
    {
      code: '4A1',
      levels: ['foundation', 'intermediate'],
      introduces: {
        foundation: ['feeder', 'coax', 'twin feeder', 'balanced', 'unbalanced'],
        intermediate: ['balanced', 'unbalanced', 'waveguide']
      },
      panel: null,
      heading: { foundation: 'Two kinds of feeder', intermediate: 'Why twin feeder does not radiate' },
      lead: {
        foundation: 'The cable between the radio and the aerial is not ordinary wire. Two kinds are in common use.',
        intermediate: 'Twin feeder keeps its signal to itself because its two wires cancel each other out, and only while they do.'
      },
      headline: {
        foundation: 'Which cables suit RF, and why coax is the usual choice.',
        intermediate: 'A balanced feeder carries equal and opposite currents, so the fields around it cancel.'
      },
      workNote: {
        foundation: 'Nothing to work out here, and nothing for a bench to solve: which cable is which is a matter of recognising them. The next section puts a feeder on the bench.',
        intermediate: 'Nothing to work out at this level. Intermediate session 10 of the course shows the two fields cancelling with the current moving; from the next section on, the feeder is solved on the bench.'
      },
      explain: {
        foundation: [
          'A feeder carries the radio frequency signal between the radio and the aerial. Mains flex or speaker cable will not do the job: at radio frequencies it loses too much and radiates the signal along its length.',
          'Coax, short for coaxial cable, has a centre conductor inside a tube of braid called the screen, with insulation between them. The signal travels in the space between the two, and the screen keeps it in. That screening is why coax is the cable most stations use. Coax is unbalanced: the signal is on the centre conductor, and the screen around it is earthed.',
          'Twin feeder is two wires held a fixed distance apart, by spacers or a ribbon of plastic. Its two wires carry equal and opposite signals, so it is balanced, and that is what keeps it from radiating.'
        ],
        intermediate: [
          'Twin feeder is balanced: its two wires carry equal currents in opposite directions at every instant. Each current makes a field around its wire, and because the two are equal and opposite, a little way off they cancel, so the feeder does not radiate.',
          'That holds only while the currents stay equal. Run the feeder close to a metal gutter, a mast or a damp wall and one wire couples to it more than the other. The currents become unequal, the fields no longer cancel, and the feeder radiates. Keep twin feeder clear of other objects on stand-off insulators.',
          'Coax is unbalanced: the signal is on the centre conductor and the screen around it is earthed. The field exists only between the centre conductor and the screen, so objects outside make no difference, and coax can be taped to a metal mast.',
          'At microwaves a waveguide replaces both: a hollow metal tube that carries the signal inside it. It works only if its larger side is more than half a wavelength across; any smaller and nothing gets through.'
        ]
      }
    },

    {
      code: '4A2',
      levels: ['foundation', 'intermediate'],
      introduces: {
        foundation: ['feeder loss'],
        intermediate: ['decibel']
      },
      panel: 'loss',
      circuit: 'rg58',
      toggle: { label: 'Cable', levels: ['foundation', 'intermediate'],
                options: [['rg58', 'RG58'], ['rg213', 'RG213'], ['ladder', '450 Ω window line']] },
      heading: { foundation: 'Feeders lose signal', intermediate: 'Feeder loss in decibels' },
      lead: {
        foundation: 'Some of the power sent up a feeder never reaches the aerial. Change the cable, its length and the frequency and see how much.',
        intermediate: 'Feeder loss is quoted in decibels, which makes the sums quick. Work out what reaches the aerial, then check it against the circuit.'
      },
      headline: {
        foundation: 'Feeders lose signal, and they lose it on receive as well as transmit.',
        intermediate: 'Twin feeder against coax, and what a loss in dB means for the power that arrives.'
      },
      presets: [
        { label: '3 dB', levels: ['intermediate'], values: { toggle: 'rg58', f: 145e6, len: 17.13 },
          note: 'RG58 at 145 MHz, cut to lose exactly 3, 6 or 10 dB' },
        { label: '6 dB', levels: ['intermediate'], values: { toggle: 'rg58', f: 145e6, len: 34.25 } },
        { label: '10 dB', levels: ['intermediate'], values: { toggle: 'rg58', f: 145e6, len: 57.09 } }
      ],
      formulas: { intermediate: ['lossLen', 'pAnt'] },
      workLead: {
        intermediate: 'First the loss over this length at this frequency, then what it leaves of the transmitter’s power.'
      },
      workNote: {
        foundation: 'No arithmetic at this level. Read the loss off the graph: more length, more loss; more frequency, more loss; and the window line loses least of the three.',
        intermediate: 'The exam keeps to losses in steps of 3 dB and 10 dB: 3 dB halves the power, 6 dB quarters it, 10 dB is a tenth and 20 dB a hundredth. Neither line above is in the booklet, so learn the steps. The first line uses typical cable figures and is for interest.'
      },
      explain: {
        foundation: [
          'A feeder turns some of the power it carries into heat, so less arrives at the aerial than left the transmitter. That is feeder loss.',
          'Drag the length: a longer feeder loses more. Drag the frequency: the loss rises with frequency, which is why the lowest loss feeder you can get matters most at VHF and UHF. Switch between the three cables and compare them.',
          'The window line, a kind of twin feeder, loses far less than either coax. Of the two coaxes, the thicker RG213 loses less than the thin RG58.',
          'Watch the moving charge along the feeder: it dwindles towards the aerial as the power drains away.',
          'The loss works on receive too. A weak signal coming down from the aerial loses the same share on its way to the radio, so a lossy feeder costs you twice, on what you send and on what you hear.'
        ],
        intermediate: [
          'A loss in decibels is a ratio of powers. Every 3 dB halves the power and every 10 dB divides it by ten, and losses in a row add: 13 dB is 10 dB and then 3 dB, a twentieth.',
          'So given any two of the transmitter power, the feeder loss and the power at the aerial, you can find the third. 100 W through 6 dB leaves 25 W; an aerial that must have 25 W through a 6 dB feeder needs 100 W from the transmitter.',
          'Press the presets. Each sets 145 MHz and a length of RG58 that loses exactly 3, 6 or 10 dB there, and the solved circuit gives the same power at the aerial as the rule.',
          'Cable makers quote loss in dB per 100 m at several frequencies, as the last readout does. Twin feeder usually loses less than coax, and the loss of any feeder rises with its length and with frequency.'
        ]
      },
      highlight: [],
      controls: ['ptx', 'len', 'f']
    },

    {
      code: '4A3',
      levels: ['intermediate', 'full'],
      introduces: {
        intermediate: ['characteristic impedance', 'correctly terminated'],
        full: ['velocity factor', 'electrical length', 'stub']
      },
      panel: { intermediate: 'standing', full: 'stub' },
      circuit: '50',
      toggle: { label: 'Feeder', levels: ['intermediate', 'full'],
                options: [['50', '50 Ω coax'], ['75', '75 Ω coax'], ['300', '300 Ω ribbon'], ['450', '450 Ω window'],
                          ['open', 'Open stub'], ['short', 'Shorted stub']] },
      heading: { intermediate: 'Characteristic impedance', full: 'Velocity factor, and a stub cut to length' },
      lead: {
        intermediate: 'Terminate a feeder in its own characteristic impedance and the ratio of voltage to current is the same all the way along it.',
        full: 'Waves are slower in a feeder than in free space, so a quarter wave of cable is shorter than a quarter wave in air. A stub shows why that matters.'
      },
      headline: {
        intermediate: 'Characteristic impedance, and how the conductor size and spacing decide it.',
        full: 'Velocity factor, and why a cut length of cable is shorter than free space suggests.'
      },
      presets: [
        { label: '50 Ω coax, 50 Ω load', levels: ['intermediate'], values: { toggle: '50', rt: 50 },
          note: 'Each feeder correctly terminated' },
        { label: '75 Ω coax, 75 Ω load', levels: ['intermediate'], values: { toggle: '75', rt: 75 } },
        { label: '450 Ω line, 450 Ω load', levels: ['intermediate'], values: { toggle: '450', rt: 450 } },
        { label: 'Cut correctly for 145 MHz', levels: ['full'],
          values: { toggle: 'open', slen: 0.3466, vf: 0.67, fwant: 100e6, fkill: 145e6 },
          note: 'An open stub to remove 145 MHz' },
        { label: 'Cut to the free-space length', levels: ['full'],
          values: { toggle: 'open', slen: 0.5172, vf: 0.67, fwant: 100e6, fkill: 145e6 } }
      ],
      formulas: {
        intermediate: ['z0vi'],
        full: ['lam', 'phys', 'elec', 'fq']
      },
      workLead: {
        intermediate: 'The voltage and current at the transmitter end of the feeder, from the solved circuit:',
        full: 'Cutting a stub for the unwanted signal, then the other way round: what frequency the stub on the controls is a quarter wave at.'
      },
      workNote: {
        intermediate: 'Ohm’s law is printed in the booklet, and V ÷ I = Z₀ is that law applied to a feeder. It gives Z₀ only when the feeder is correctly terminated. Drag the load away from Z₀ and the voltage and current start to vary along the feeder, so V ÷ I depends on where you measure it.',
        full: 'v = fλ is on the formula sheet, and 300 ÷ f is the quick way to use it, with f in MHz and λ in metres. Physical = electrical × VF is not on the sheet, and neither is 0.67: learn both. Multiply by the VF to cut a piece of cable; divide by it to find what a cut piece is electrically.'
      },
      explain: {
        intermediate: [
          'Every feeder has a characteristic impedance, Z₀. The size of its conductors and the distance between them set it: thinner conductors or a wider spacing give a higher Z₀. Amateurs normally use 50 Ω coax, television coax is 75 Ω, and balanced feeder comes in values from about 75 Ω to 600 Ω.',
          'A feeder is correctly terminated when it ends in a resistive load equal to its own Z₀. Then the voltage and current are the same at every point along it, and V ÷ I equals Z₀ wherever you measure. Drag the cursor along the graph and watch V ÷ I stay put.',
          'Press each preset. 100 W in 50 Ω coax is 70.7 V and 1.41 A; in 450 Ω window line it is 212 V and 0.471 A, the same power carried at a higher voltage and a lower current. Z₀ does not depend on the length: drag the length and nothing moves.',
          'Now drag the load away from Z₀. The flat lines turn into ripples, the voltage and current taking turns to peak, and V ÷ I changes from place to place. The section on 4E1 below takes that further.'
        ],
        full: [
          'Radio waves travel more slowly in a feeder than in free space, because the insulation between the conductors slows them. The velocity factor, VF, is the ratio of the two speeds. It is always less than 1, and for coax with solid polythene insulation it is about 0.67, two thirds.',
          'The frequency is the same inside and out, so the wavelength in the feeder is shorter in the same ratio. A piece of feeder therefore has an electrical length, in wavelengths, longer than its physical length suggests: physical length = electrical length × VF.',
          'A stub is a short length of feeder connected across a line, open or shorted at its far end. At an open end no current can flow, so there the current is zero and the voltage swing biggest. A quarter wave back the pattern has turned round, and the stub’s input looks like a short circuit.',
          'So an open quarter wave stub shorts out the one frequency at which it is a quarter wave: a notch filter. The graph sweeps the signal reaching the receiver with the stub in place. The notches fall at the quarter wave frequency and its odd multiples; at twice that frequency the stub is a half wave and does nothing. Choose Shorted stub and the pattern swaps: the half wave frequency is notched, and at the quarter wave one the stub looks like an open circuit.',
          'Drag the velocity factor and the notches slide, because the same physical length is a different electrical length. Press Cut to the free-space length: forget the VF and the stub notches 97 MHz, right on the FM broadcast it was meant to protect.',
          'Beyond the syllabus: away from its notch a stub is not invisible. Read the loss at the wanted frequency, which the exam takes as none. And a real stub has loss of its own, which is why its notch is a few tens of decibels deep rather than infinitely so.'
        ]
      },
      highlight: [],
      controls: { intermediate: ['rt', 'len', 'f'], full: ['slen', 'vf', 'fwant', 'fkill'] }
    },

    {
      code: '4B1',
      levels: ['foundation', 'intermediate', 'full'],
      introduces: {
        foundation: ['balun'],
        intermediate: ['choke balun'],
        full: ['sleeve balun', 'transformer balun']
      },
      panel: 'balun',
      circuit: 'none',
      toggle: { label: 'Balun', levels: ['foundation', 'intermediate', 'full'],
                options: [['none', 'No balun'], ['coil', 'Coil of coax'], ['ferrite', 'Ferrite rings'], ['sleeve', 'Sleeve']] },
      heading: {
        foundation: 'Why a dipole fed with coax needs a balun',
        intermediate: 'Choke baluns',
        full: 'Three kinds of balun'
      },
      lead: {
        foundation: 'Coax is unbalanced and a dipole is balanced. Join one straight to the other and some current goes where it should not.',
        intermediate: 'A choke balun stops current on the outside of the braid and lets the signal inside the coax straight through.',
        full: 'Three ways to keep current off the outside of the braid, and the range of frequencies each one works over.'
      },
      headline: {
        foundation: 'Why you need a balun between coax and a dipole.',
        intermediate: 'Choke baluns, and how they are put together.',
        full: 'Transformer, sleeve and choke baluns, and the 1:1 and 4:1 circuits.'
      },
      formulas: { full: ['sleeve'] },
      workNote: {
        foundation: 'No arithmetic here. Watch the third path: without a balun about a quarter of the return current comes back down the outside of the braid, and the feeder becomes part of the aerial.',
        intermediate: 'No formula at this level. Compare the two chokes across the bands: the coil works over a band or two, the ferrite over most of HF and well beyond.',
        full: 'This length is not on the formula sheet. The sleeve’s velocity factor is that of the gap between the sleeve and the braid, mostly air here, 0.95, so it is cut a little shorter than a free-space quarter wave.'
      },
      explain: {
        foundation: [
          'A dipole is a balanced aerial: neither half is earthed, and the two halves should carry equal currents. Coax is unbalanced: its screen is earthed at the radio.',
          'Join the coax straight to the dipole and the current up the centre conductor feeds one arm, but its return has two ways home: the other arm, and the outside of the braid, which runs down to the shack as a conductor of its own. The graph shows the share that takes the outside of the braid. With no balun it is about a quarter, at every frequency.',
          'Current on the outside of the braid makes the feeder radiate as part of the aerial, and on receive it picks up noise from the house. A balun, short for balanced to unbalanced, fitted at the feed point stops it. Choose Ferrite rings, one common kind, and watch the current on the outside of the braid fall away.',
          'The circuit is a model, beyond the syllabus: each arm is drawn as half the dipole’s resistance to the space around it, and the outside of the braid as 100 Ω.'
        ],
        intermediate: [
          'A choke balun puts a high impedance in the way of current on the outside of the braid and leaves the signal inside the coax untouched. Inside, the currents on the centre conductor and on the inside of the braid are equal and opposite, so a choke wound from the cable as a whole has nothing to act on there.',
          'There are two usual ways to make one: wind a few turns of the coax itself into a coil close to the feed point, or slip ferrite rings over the coax, or wind it through one.',
          'Compare them across the bands. The coil is an inductor, but its turns lie close together and add capacitance, and above the frequency where the two resonate it stops choking. The ferrite turns the unwanted current into heat and works over a much wider range.',
          'Watch arm A and arm B in the readouts: with a good choke the two carry the same current, which is what a balanced aerial needs.'
        ],
        full: [
          'The syllabus names three kinds of balun: transformer, sleeve and choke. The choke is on the bench as a coil of coax and as ferrite rings.',
          'A sleeve balun is a quarter wave tube, or braid from a larger cable, slipped over the feeder, joined to the braid at the end away from the aerial and left open at the aerial end. The sleeve and the outside of the braid make a quarter wave line shorted at its far end, so at the aerial end it looks like an open circuit and no current can flow onto the outside of the braid. Choose Sleeve.',
          'It works only near the frequency where it is a quarter wave: drag the frequency and watch. At twice that frequency it is a half wave, looks like a short circuit and blocks nothing. Joined at the aerial end instead, it would be nothing more than a thicker braid. So it is a single band balun, best suited to VHF and UHF where the sleeve is short.',
          'A transformer balun has windings on a ferrite core, usually a ring. The 1:1 type, three windings, joins 50 Ω coax to a 50 Ω balanced load. The 4:1 type, two windings, puts twice the turns on the balanced side, so four times the impedance: 50 Ω coax to 200 Ω balanced, or 75 Ω to 300 Ω. To tell them apart, count the windings and see what the coax and the output connect across. Full session 16 draws both.'
        ]
      },
      highlight: { foundation: ['RA', 'RB'], intermediate: ['LCH', 'RCH'], full: ['ROUT'] },
      controls: { foundation: ['fbal'], intermediate: ['fbal'], full: ['fbal', 'fsl'] }
    },

    {
      code: '4E1',
      levels: ['foundation', 'intermediate', 'full'],
      introduces: {
        foundation: ['SWR'],
        intermediate: ['standing wave', 'forward wave', 'reflected wave'],
        full: ['SWR']
      },
      panel: { foundation: 'system', intermediate: 'standing', full: 'standing' },
      heading: {
        foundation: 'The aerial has to suit the frequency',
        intermediate: 'Standing waves',
        full: 'SWR from forward and reflected voltage'
      },
      lead: {
        foundation: 'An aerial matches the transmitter only near the frequency it was built for. Tune away from it and watch the SWR rise.',
        intermediate: 'Mismatch the load and part of the signal comes back down the feeder. Where the two meet, they make a standing wave.',
        full: 'The SWR is set by how much voltage comes back compared with how much goes up.'
      },
      headline: {
        foundation: 'The antenna has to suit the frequency you are using.',
        intermediate: 'The reflected wave meets the forward wave, and together they make a standing wave.',
        full: 'What SWR measures, and how it is worked out.'
      },
      formulas: { intermediate: ['swrMM'], full: ['swrV', 'swrP'] },
      workLead: {
        intermediate: 'The biggest and smallest voltages of the standing wave near the load, at 100 W:',
        full: 'With the forward and reflected voltages at the load, from the solved circuit, then the same from the powers:'
      },
      workNote: {
        foundation: 'No arithmetic at this level. What matters is the shape of the curve: the SWR is lowest at the frequency the aerial was built for and climbs either side of it.',
        intermediate: 'SWR is not calculated at this level; the line above is for interest. What the syllabus asks is what makes the standing wave, and that the reflection changes what the transmitter sees.',
        full: 'The first formula is on the sheet. Taking the square root of the powers is not, and it is where marks are lost: 100 W forward and 4 W back is 10 and 2, so (10 + 2) ÷ (10 − 2) = 1.5:1, not 104 ÷ 96. Set the loss to zero for the bank’s questions, which take the feeder as lossless.'
      },
      explain: {
        foundation: [
          'An aerial is built for a frequency. This one is a dipole cut for 7.1 MHz, on 20 m of coax. At 7.1 MHz its feed point impedance is close to 50 Ω, it matches the feeder and the transmitter, and nearly all the power goes into it.',
          'Drag the frequency away from 7.1 MHz. The aerial no longer presents 50 Ω, some of the power is reflected back down the feeder, and the SWR, the standing wave ratio, rises. An SWR of 1:1 is a perfect match.',
          'So the aerial has to suit the frequency you use. On a frequency it was not designed for it will not match the transmitter and will not work well. This one stays below 2:1 only from about 6.9 to 7.3 MHz.',
          'Beyond the syllabus: the aerial is drawn as a resistance with an L and a C, because near its own frequency a dipole behaves like a tuned circuit.'
        ],
        intermediate: [
          'When a load does not match the feeder, part of the signal reaching it is reflected and travels back towards the transmitter. The reflected wave and the forward wave pass through each other. Where they arrive in step their voltages add; a quarter wave further on they are in opposition and subtract.',
          'The result is a standing wave: points of high and low voltage that stay in the same places along the feeder. The current makes the same pattern, with its peaks where the voltage has its troughs. Watch the moving charge on the feeder: it swings hardest where the current is greatest.',
          'Set the load to 50 Ω with no reactance and the ripples flatten. Drag it away either way, or add reactance, and they grow. An open or shorted end reflects everything.',
          'The reflection also changes the impedance at the input of the feeder, so the transmitter no longer sees 50 Ω. Read what it sees, then change the length of the feeder: the load is the same, but what the transmitter sees moves round.',
          'Both waves lose power in the feeder. Raise the loss per metre and the ripples shrink towards the transmitter, because the reflection has further to travel back.'
        ],
        full: [
          'The standing wave ratio, SWR, is the biggest voltage on the feeder divided by the smallest. Where the forward and reflected voltages add, V max = Vf + Vr; where they subtract, V min = Vf − Vr. So SWR = (Vf + Vr) ÷ (Vf − Vr), the formula on the sheet.',
          'The readouts give the forward and reflected voltages at the load, as a directional coupler there would measure them, and the working puts them into the formula. The current makes the same pattern, so the SWR comes out the same from currents.',
          'A power meter reads watts, not volts. Power goes as the square of the voltage, so take the square root of each power, or of their ratio, first: 4% of the power reflected is 20% of the voltage. Putting watts straight into the formula is the commonest slip in the exam.',
          'No reflection gives 1:1. Total reflection, from an open or a shorted end, makes V min zero and the SWR infinite. With loss in the feeder the SWR changes along it, which is the subject of 4E3.'
        ]
      },
      highlight: { foundation: ['RE'], intermediate: ['RL'], full: ['RL'] },
      controls: { foundation: ['fop'], intermediate: ['rl', 'xl', 'f', 'len', 'dbm'],
                  full: ['ptx', 'rl', 'xl', 'f', 'len', 'dbm'] }
    },

    {
      code: '4E2',
      levels: ['foundation', 'full'],
      introduces: {
        foundation: ['SWR meter'],
        full: ['return loss', 'antenna analyser']
      },
      panel: { foundation: 'system', full: 'analyser' },
      circuit: 'analyser',
      toggle: { label: 'At the top of the feeder', levels: ['foundation'],
                options: [['ok', 'Aerial connected'], ['open', 'Feeder open'], ['short', 'Feeder shorted']] },
      heading: { foundation: 'Reading an SWR meter', full: 'Return loss' },
      lead: {
        foundation: 'An SWR meter in the shack tells you whether the aerial is taking the power. Try a good aerial and two faults.',
        full: 'Return loss says what SWR says, the other way up: how far down the reflected power is.'
      },
      headline: {
        foundation: 'What an SWR meter is telling you.',
        full: 'Return loss, and why a low SWR on its own does not prove the antenna is any good.'
      },
      formulas: { full: ['rl', 'rlTx'] },
      workLead: {
        full: 'At 7.1 MHz, with the forward and reflected power at the aerial from the solved circuit, then at the transmitter:'
      },
      workNote: {
        foundation: 'No arithmetic at this level. Read the verdict: low SWR is good, and a high SWR measured at the transmitter points to the aerial or the feeder.',
        full: 'The return loss formula is on the sheet; the rule for the transmitter end is not. From voltages, return loss is 20 log (Vf ÷ Vr), because power goes as voltage squared. Using 20 log on a power ratio doubles the answer.'
      },
      explain: {
        foundation: [
          'An SWR meter sits in the feeder at the transmitter. It measures the power going up the feeder and the power coming back, and shows how well the aerial matches. Many have two needles, forward and reflected, and the SWR is read where they cross.',
          'With the aerial connected and the frequency near 7.1 MHz, the reflected power is small and the SWR low. Choose Feeder open, as if the feeder had come off the aerial, then Feeder shorted. Nearly everything comes back and the SWR is very high.',
          'A high SWR measured at the transmitter means a fault in the aerial or the feeder, not in the transmitter. Find it before transmitting again: an SWR much greater than 2:1 can damage the transmitter.',
          'The meter reads a little better than the truth, because the feeder loses some of the reflected power on its way back. At Full that is worked out.'
        ],
        full: [
          'Return loss is the ratio of the forward power to the reflected power, in decibels. A good match reflects little, so the ratio is large: a low SWR is a high return loss and a high SWR a low one. 0 dB is everything coming back; 20 dB is one per cent.',
          'An antenna analyser plots it across a band, and this graph is that plot for the dipole cut for 7.1 MHz. The solid curve is measured at the aerial, and its peak is where the aerial matches best. When you choose between two aerials measured the same way, take the one with the higher return loss.',
          'The dashed curve is the same aerial measured at the transmitter, through the feeder. It sits higher all the way across, by twice the feeder loss, so the aerial looks better than it is. Raise the loss per metre and watch the gap grow; 4E3 shows why.',
          'So a low SWR on its own proves little. A dummy load, or a long lossy feeder with nothing on the end, gives a fine reading and radiates nothing.'
        ]
      },
      highlight: { foundation: ['RE'], full: ['RE'] },
      controls: { foundation: ['fop'], full: ['len', 'dbm'] }
    },

    {
      code: '4E3',
      levels: ['full'],
      panel: 'along',
      circuit: 'along',
      heading: { full: 'Feeder loss flatters the SWR' },
      lead: {
        full: 'Measure the SWR at the transmitter end of a lossy feeder and it reads better than the aerial deserves.'
      },
      headline: {
        full: 'Feeder loss flatters the SWR you read at the shack. At the antenna it is worse.'
      },
      formulas: { full: ['lossTot', 'rlTx'] },
      workLead: {
        full: 'The loss one way, then the return loss the transmitter sees:'
      },
      workNote: {
        full: 'Neither is on the sheet. The reflection crosses the feeder twice, once going up as forward power and once coming back, which is where the 2 comes from. Working back from a reading at the transmitter, subtract twice the loss.'
      },
      explain: {
        full: [
          'The forward power falls as it goes up the feeder, so less reaches the aerial than the meter reads going in. The reflected power falls again on its way back. By the time it reaches the transmitter it has crossed the feeder twice.',
          'So the return loss measured at the transmitter is the return loss at the aerial plus twice the feeder loss. The gap between the two lines on the graph is the return loss at each point along the feeder, and it widens towards the transmitter by twice the loss per metre.',
          'The SWR at the aerial depends only on the aerial and the feeder’s Z₀; feeder loss does not change it. What changes is the reading in the shack: more loss, a lower SWR and a higher return loss there, while less power reaches the aerial. Rain in the coax makes the meter look better and the station worse.',
          'Set the aerial’s return loss to 0 dB, an open or shorted end. Through a long, lossy feeder the transmitter still sees a respectable figure, twice the loss. Measure at the aerial end, or allow for the feeder.'
        ]
      },
      highlight: { full: ['RL'] },
      controls: ['ptx', 'rla', 'len', 'dbm']
    },

    {
      code: '4F1',
      levels: ['foundation', 'intermediate', 'full'],
      introduces: {
        foundation: ['AMU'],
        intermediate: ['AMU']
      },
      panel: { foundation: 'system', intermediate: 'system', full: 'tuner' },
      circuit: 'none',
      toggle: { label: 'Matching', levels: ['foundation', 'intermediate', 'full'],
                options: [['none', 'No AMU'], ['tx', 'AMU in the shack'], ['ant', 'AMU at the aerial'],
                          ['L', 'L'], ['pi', 'Pi'], ['T', 'T']] },
      heading: {
        foundation: 'Using an aerial off its frequency',
        intermediate: 'What an AMU does, and what it does not',
        full: 'T, pi and L matching units'
      },
      lead: {
        foundation: 'Use the aerial away from 7.1 MHz and the transmitter no longer sees 50 Ω. An AMU puts that right, for the transmitter.',
        intermediate: 'An AMU in the shack gives the transmitter 50 Ω. It does nothing for the feeder beyond it.',
        full: 'Set any load, choose a network, and the bench designs the AMU for it and solves the result.'
      },
      headline: {
        foundation: 'Use an antenna off frequency and the match changes. What that does to the transmitter.',
        intermediate: 'A matching unit gives the transmitter the impedance it was designed to see.',
        full: 'How a matching unit cancels reactance, and what it does and does not fix.'
      },
      presets: [
        { label: 'Off frequency: 6.8 MHz, AMU in the shack', levels: ['foundation', 'intermediate'],
          values: { toggle: 'tx', fop: 6.8e6 } },
        { label: 'The same, AMU at the aerial', levels: ['intermediate'], values: { toggle: 'ant', fop: 6.8e6 } }
      ],
      formulas: { full: ['xamu1', 'xamu2', 'xamu3'] },
      workLead: {
        full: 'The parts the network needs for this load, each with its reactance at the design frequency:'
      },
      workNote: {
        foundation: 'No arithmetic at this level. Compare the two curves: without the AMU the transmitter sees a mismatch away from 7.1 MHz; with it, a perfect match at whatever frequency it is set for.',
        intermediate: 'No arithmetic at this level either. The point is the dashed curve, which an AMU in the shack cannot touch.',
        full: 'The reactance formulas are on the sheet. How the values are chosen is beyond the syllabus, so the page works them out; the exam asks what the network does and which shape is which.'
      },
      explain: {
        foundation: [
          'A transmitter is designed to deliver its power into one impedance, normally 50 Ω. Used away from 7.1 MHz this aerial presents something else, and the SWR the transmitter sees rises.',
          'Choose AMU in the shack. An antenna matching unit, AMU, also called an ATU, sits between the transmitter and the feeder and changes the impedance the transmitter sees back to 50 Ω. Drag the frequency: the AMU retunes, as an automatic one does, and the transmitter sees 1:1 wherever you go.',
          'That lets the transmitter supply its power without damage. It does not change the aerial, which is still being used away from its frequency.'
        ],
        intermediate: [
          'An AMU changes the impedance presented to the transmitter. It does not tune the feeder or the aerial to resonance: the aerial is exactly as it was.',
          'Choose AMU in the shack and compare the two curves. The transmitter sees 1:1 at the frequency the AMU is set for. The dashed curve, the SWR on the feeder between the AMU and the aerial, has not moved: the mismatch is still there, and so is the standing wave on the feeder.',
          'A step beyond this level, which the Full course takes up: choose AMU at the aerial. Now the feeder is matched as well, and both curves dip together. That is why remote, automatic AMUs are made to fit at the feed point.',
          'Beyond the syllabus: read the power to the aerial in each case. With the AMU in the shack the mismatched feeder carries more current for the same power and loses more. Near 7.1 MHz the difference is small; far from it, where the SWR on the feeder is very high, even 20 m of good coax loses several decibels, and an AMU in the shack cannot prevent that.'
        ],
        full: [
          'Away from its design frequency an aerial’s impedance has reactance as well as resistance, and its resistance is not 50 Ω. An AMU does two jobs: it cancels the reactance with an equal and opposite one, and it transforms the resistance that is left to the value the transmitter wants.',
          'Set any load with the R and X controls, choose a network, and the bench works out the parts, then solves the circuit with them in it. Read what the transmitter sees: 50 Ω and no reactance at the design frequency.',
          'The three circuits are named after their shapes. L: one part in series and one to earth, the simplest. Pi: a part to earth at each end and one in series between them, like a pi low pass filter. T: two in series with one to earth between them, the usual HF AMU with two variable capacitors and a roller inductor. In the exam, look at what is in series and what goes to earth.',
          'The match is exact at one frequency only. The shaded band is where the SWR stays under 1.5:1; drag across the graph to read any frequency. Matching a large ratio takes a higher loaded Q, which narrows the band; that is why an AMU is retuned for each band, and across a wide band.',
          'At the transmitter the AMU matches whatever the feeder presents, cancelling the reactance at the input to the feeder; at the aerial it works on the feed point itself. Either way it does not reduce feeder loss and does not make the aerial resonant.',
          'Beyond the syllabus: the page sets the loaded Q of the pi and T at 3, or higher where the ratio of the two resistances needs it, and chooses the L that puts its capacitor to earth where it can.'
        ]
      },
      highlight: { foundation: [], intermediate: [], full: ['LM1', 'CM1', 'LM2', 'CM2', 'LM3', 'CM3'] },
      controls: { foundation: ['fop'], intermediate: ['fop'], full: ['ar', 'ax', 'af'] }
    },

    {
      code: '4F2',
      levels: ['full'],
      introduces: {
        full: ['quarter-wave transformer', 'harness']
      },
      panel: 'quarter',
      circuit: 'one',
      toggle: { label: 'Sections', levels: ['full'],
                options: [['one', 'One aerial'], ['two', 'Two Yagis'], ['four', 'Four Yagis']] },
      heading: { full: 'The quarter-wave transformer' },
      lead: {
        full: 'A quarter wave of feeder with the right Z₀ turns one resistance into another. Choose the Z₀, or work out the one you need.'
      },
      headline: {
        full: 'A quarter wave of feeder used as an impedance transformer.'
      },
      presets: [
        { label: '100 Ω on 75 Ω coax', values: { toggle: 'one', qz0: 75, qr: 100 },
          note: 'Values the bank uses' },
        { label: '100 Ω, the exact match', values: { toggle: 'one', qz0: 70.71, qr: 100 } },
        { label: 'Two 50 Ω Yagis', values: { toggle: 'two', qz0: 70.71, qr: 50 } },
        { label: 'Four Yagis, 75 Ω tails', values: { toggle: 'four', qz0: 75, qz1: 37.5, qr: 50 } }
      ],
      formulas: { full: ['q4', 'q4z'] },
      workLead: {
        full: 'What the sections give the transmitter, then the Z₀ that would give exactly 50 Ω:'
      },
      workNote: {
        full: 'Z₀² = Zin × Zout is on the sheet; rearrange it for whichever one the question leaves out. In a harness, work out what each tail gives first, put the tails in parallel, then match what is left. Options are rounded: pick the nearest.'
      },
      explain: {
        full: [
          'A quarter wave of feeder transforms the load on its far end. Z₀² = Zin × Zout, where Z₀ is the characteristic impedance of the section, Zout the load on it, and Zin what its near end looks like. A 100 Ω aerial through a quarter wave of 75 Ω coax looks like 56.3 Ω.',
          'Rearranged, Z₀ = √(Zin × Zout). To turn 100 Ω into 50 Ω takes √5000 = 70.7 Ω, and 70 Ω or 75 Ω cable comes close.',
          'It works where the section is a quarter wave long, physically a quarter wavelength times the velocity factor. Sweep the graph: the match holds across the 2 m band and drifts away either side. At three times the frequency the section would be three quarters of a wave and work again; a half wave simply repeats the load.',
          'Stacked aerials need a harness. Choose Two Yagis: two 50 Ω aerials joined directly give 25 Ω. A quarter wave tail on each transforms it up first, so that the two in parallel give 50 Ω: each tail must give 100 Ω, so Z₀ = √(50 × 100) = 70.7 Ω.',
          'Choose Four Yagis. With 75 Ω tails each gives 75² ÷ 50 = 112.5 Ω, and four in parallel make 28.1 Ω. One more quarter wave of √(28.1 × 50) = 37.5 Ω matches that to 50 Ω: two 75 Ω cables side by side make it. The tails are all the same length, so the aerials are fed in phase.'
        ]
      },
      highlight: [],
      controls: ['qz0', 'qz1', 'qr']
    }
  ],

  /*
   * Our own explanation of each answer, keyed by the bank's reference number.
   * The question, its options and the marked answer are the RSGB's and ship
   * unadapted. Everything here is ours. A seed sets the bench to the
   * question's own values where they fit the controls.
   */
  answers: {
    '2025-Full560': {
      why: 'The wave travels more slowly in the cable than in free space, so a wavelength in the cable is shorter. Physical length = electrical length × VF, and the VF is always less than one, so the piece you cut is always shorter than its electrical length.',
      source: { eq: ['elec'], from: ['4A3'] },
      seed: { toggle: 'open', slen: 0.3466, vf: 0.67, fwant: 100e6, fkill: 145e6 },
      seedNote: 'This stub is 34.7 cm long but a quarter wave, 51.7 cm, electrically at 145 MHz. Drag the velocity factor towards 1 and watch the notch move down.'
    },
    '2025-Full561': {
      why: 'Find the free-space quarter wave first, then shorten it by the velocity factor. Solid polythene coax has a VF of about 0.67.',
      working: ['λ = 300 ÷ 10 = 30 m, so λ/4 = 7.5 m',
                'physical = 7.5 m × 0.67',
                '= 5.0 m, about 5 m'],
      source: { eq: ['lam', 'phys'], from: ['4A3'] },
      seed: { toggle: 'open', slen: 5.025, vf: 0.67, fkill: 10e6, fwant: 20e6 },
      seedNote: 'The stub on the bench is set to 5.03 m of 0.67 coax. Its first notch, where it is a quarter wave, lands on 10 MHz.'
    },
    '2025-Full562': {
      why: 'The frequency is the same inside the cable and outside it, so from v = fλ the wavelength falls in the same ratio as the speed. The ratio of the two wavelengths is therefore the ratio of the two speeds: the velocity factor.',
      source: { eq: ['lam'], from: ['4A3'] }
    },
    '2025-Full563': {
      why: 'A quarter wave at 145 MHz in free space, shortened by the velocity factor. Worked with 0.67 it comes to 35 cm. The bank keys 33 cm, the nearest of the four; 50 cm is the free-space length, with the velocity factor forgotten. The options are rounded, so take the nearest.',
      working: ['λ = 300 ÷ 145 = 2.07 m, λ/4 = 0.517 m',
                'physical = 0.517 m × 0.67 = 0.347 m',
                'about 35 cm; the nearest offered is 33 cm'],
      source: { eq: ['lam', 'phys'], from: ['4A3'] },
      seed: { toggle: 'open', slen: 0.3466, vf: 0.67, fwant: 100e6, fkill: 145e6 },
      seedNote: 'Set to 34.7 cm of 0.67 coax, a quarter wave at 145 MHz. Try 33 cm on the stub length: the notch moves up to about 152 MHz, above the band. 33 cm is the nearest option, not the exact length.'
    },
    '2025-Full718': {
      why: 'The length of a quarter wave of cable is proportional to its velocity factor. The exam takes air spaced coax as VF 1 and solid polythene as 0.67, so the new piece is about two thirds of the old. Real air spaced cable has a few spacers and a VF nearer 0.9, which makes the true ratio about three quarters; the exam’s answer rests on taking air as 1.',
      working: ['length is proportional to VF',
                'air spaced about 1, solid polythene 0.67',
                'so about 2/3 of the one it replaces'],
      source: { eq: ['phys'], from: ['4A3'] },
      seed: { toggle: 'open', slen: 0.5172, vf: 1, fwant: 100e6, fkill: 145e6 },
      seedNote: 'The bench holds 51.7 cm of feeder with a VF of 1, a quarter wave at 145 MHz. Set the VF to 0.67 and the notch drops to 97 MHz: the same job now needs a piece two thirds as long.'
    },
    '2025-Full7908': {
      why: 'The stub must short out 145 MHz, so it is an open quarter wave at 145 MHz, in coax with a VF of 0.67. Shorted, a quarter wave stub looks like an open circuit at its own frequency and does nothing. The 52 cm options are a quarter wave at about 97 MHz, which would notch the FM station itself. The bench shows something the question leaves out: at 100 MHz the open stub is not invisible, and takes about 2 to 3 dB off the wanted signal.',
      working: ['λ at 145 MHz = 300 ÷ 145 = 2.07 m',
                'λ/4 × 0.67 = 0.517 m × 0.67 = 0.347 m',
                'about 34 cm, and open circuit at the free end'],
      source: { eq: ['lam', 'phys', 'fq'], from: ['4A3'] },
      seed: { toggle: 'open', slen: 0.34, vf: 0.67, fwant: 100e6, fkill: 145e6 },
      seedNote: 'Read the loss at 145 MHz and at 100 MHz. Then try the other options: 52 cm puts the notch near 97 MHz, and Shorted stub notches only where the stub is a half wave.'
    },
    '2025-Full3659': {
      why: 'A transformer balun is windings on one ferrite core, with the coax connected across one winding and the balanced output taken across the others. The 1:1 type has three equal windings and the same number of turns on each side, so the impedance is unchanged. A 4:1 has two windings and twice the turns on the balanced side. The two filters have no balanced output at all.',
      source: { from: ['4B1'] }
    },
    '2025-Full570': {
      why: 'The three kinds of balun in the syllabus are transformer, sleeve and choke. Differential describes a kind of signal, the opposite of common mode, not a balun.',
      source: { from: ['4B1'] }
    },
    '2025-Full571': {
      why: 'A dipole is balanced and coax is not. Without a balun part of the return current flows down the outside of the braid, which then radiates and picks up noise. A 1:1 balun at the centre stops it. It does not boost the signal, and at 1:1 it does not change the impedance.',
      source: { from: ['4B1'] },
      seed: { toggle: 'ferrite', fbal: 14.2e6 },
      seedNote: 'The bench is set to a choke at 14.2 MHz. Switch between No balun and Ferrite rings and read the current on the outside of the braid.'
    },
    '2025-Full573': {
      why: 'That is a sleeve balun. The sleeve and the outside of the feeder’s braid make a quarter wave line, shorted where the sleeve joins the braid at the end away from the aerial, so at the aerial end it looks like an open circuit and blocks current on the outside of the braid. A half wave would look like a short circuit and block nothing, and just as long as possible does not make it a quarter wave.',
      source: { eq: ['sleeve'], from: ['4B1'] },
      seed: { toggle: 'sleeve', fsl: 145e6, fbal: 145e6 },
      seedNote: 'The sleeve on the bench is a quarter wave at 145 MHz. Drag the frequency up to 290 MHz, where it is a half wave, and watch the braid current come back.'
    },
    '2025-Full7911': {
      why: 'The sleeve is a quarter wave long and is joined to the braid at the end away from the aerial, end A, leaving the aerial end open. Joined at the aerial end it would be nothing more than a thicker braid, and a half wave sleeve looks like a short circuit at the open end, so it blocks nothing.',
      source: { eq: ['sleeve'], from: ['4B1'] },
      seed: { toggle: 'sleeve', fsl: 145e6, fbal: 145e6 },
      seedNote: 'Read the current on the outside of the braid at 145 MHz, where the sleeve is a quarter wave, then at twice that.'
    },
    '2025-Full592': {
      why: 'Where the forward and reverse voltages add you get the biggest voltage on the feeder, and where they subtract the smallest. The ratio of the two, (Vf + Vr) ÷ (Vf − Vr), is the standing wave ratio.',
      source: { eq: ['swrV'], from: ['4E1'] }
    },
    '2025-Full594': {
      why: 'Put the two voltages straight into the formula; they are already voltages, so no square roots are needed.',
      working: ['SWR = (Vf + Vr) ÷ (Vf − Vr)',
                '= (100 + 10) ÷ (100 − 10) = 110 ÷ 90',
                '= 1.22, so 1.2:1'],
      source: { eq: ['swrV'], from: ['4E1'] },
      seed: { ptx: 200, rl: 61.11, xl: 0, dbm: 0 },
      seedNote: '200 W in 50 Ω is 100 V forward, and a 61.1 Ω load sends back a tenth of the voltage. Read the forward and reflected volts at the load.'
    },
    '2025-Full597': {
      why: 'The meter gives voltages, so they go straight into the formula.',
      working: ['SWR = (12 + 2) ÷ (12 − 2)',
                '= 14 ÷ 10',
                '= 1.4, so 1.4:1'],
      source: { eq: ['swrV'], from: ['4E1'] },
      seed: { ptx: 2.88, rl: 70, xl: 0, dbm: 0 },
      seedNote: '2.88 W in 50 Ω is 12 V forward, and a 70 Ω load reflects a sixth of the voltage, 2 V.'
    },
    '2025-Full7917': {
      why: 'Watts first have to become a voltage ratio: power goes as voltage squared, so take the square root of the power ratio. Using the watts directly gives (400 + 25) ÷ (400 − 25) = 1.13, the wrong answer.',
      working: ['Vr ÷ Vf = √(25 ÷ 400) = √0.0625 = 0.25',
                'SWR = (1 + 0.25) ÷ (1 − 0.25) = 1.25 ÷ 0.75',
                '= 1.67, about 1.7:1'],
      source: { eq: ['swrP', 'swrV'], from: ['4E1'] },
      seed: { ptx: 400, rl: 83.33, xl: 0, dbm: 0 },
      seedNote: '400 W forward into an 83.3 Ω load, which reflects a quarter of the voltage and so a sixteenth of the power, 25 W.'
    },
    '2025-Full7918': {
      why: 'Take the square root of the power ratio to get the voltage ratio, then use the SWR formula.',
      working: ['Vr ÷ Vf = √(1 ÷ 9) = 1/3',
                'SWR = (1 + 1/3) ÷ (1 − 1/3) = 1.333 ÷ 0.667',
                '= 2, so 2:1'],
      source: { eq: ['swrP', 'swrV'], from: ['4E1'] },
      seed: { ptx: 9, rl: 100, xl: 0, dbm: 0 },
      seedNote: '9 W forward into 100 Ω, which reflects a third of the voltage and a ninth of the power, 1 W.'
    },
    '2025-Full599': {
      why: 'A higher return loss means less comes back: 20 dB is 1% of the power reflected, 10 dB is 10%. So antenna 2 is the better match. The answer assumes both were measured the same way at the aerial. Measured at the transmitter through feeders of unknown loss, option B would be right, because feeder loss adds twice to the return loss.',
      source: { eq: ['rl'], from: ['4E2', '4E3'] }
    },
    '2025-Full600': {
      why: 'With the far end open, all the power that reaches it is reflected. The forward power loses 3 dB going up the feeder and the reflection loses another 3 dB coming back, 6 dB in all, a quarter.',
      working: ['8 W forward, less 3 dB up the feeder: 4 W reaches the open end',
                'all 4 W is reflected, and loses 3 dB on the way back',
                '= 2 W'],
      source: { eq: ['rlTx'], from: ['4E3'] },
      seed: { item: '4E3', ptx: 8, rla: 0, len: 30, dbm: 0.1 },
      seedNote: 'The bench is set to 8 W into 30 m losing 0.1 dB per metre, 3 dB, with the far end open. Read the reflected power back at the transmitter.'
    },
    '2025-Full601': {
      why: 'These are voltages, so the return loss is 20 log of their ratio, not 10 log. Power goes as voltage squared, which is where the 20 comes from.',
      working: ['RL = 20 log(Vf ÷ Vr) for voltages',
                '= 20 log(10 ÷ 1) = 20 × 1',
                '= 20 dB'],
      source: { eq: ['rl'], from: ['4E2'] },
      seed: { item: '4E1', ptx: 2, rl: 61.11, xl: 0, dbm: 0 },
      seedNote: 'In the SWR section: 2 W in 50 Ω is 10 V forward, and 61.1 Ω reflects 1 V. The return loss there reads 20 dB.'
    },
    '2025-Full602': {
      why: 'A short run of good cable has almost no loss to flatter the reading, so the transmitter sees the mismatch as it is: a high SWR, and a low return loss, since a lot of the power comes back.',
      source: { from: ['4E2', '4E3'] },
      seed: { item: '4E3', rla: 3, len: 5, dbm: 0.02 },
      seedNote: 'A badly matched aerial, 3 dB return loss, on 5 m of good feeder: the transmitter sees almost what the aerial does.'
    },
    '2025-Full7919': {
      why: 'Return loss is 10 log of the forward power over the reflected power.',
      working: ['RL = 10 log(Pf ÷ Pr)',
                '= 10 log(400 ÷ 25) = 10 log 16',
                '= 12.0 dB, so 12 dB'],
      source: { eq: ['rl'], from: ['4E2'] },
      seed: { item: '4E1', ptx: 400, rl: 83.33, xl: 0, dbm: 0 },
      seedNote: 'In the SWR section: 400 W forward, 25 W back. The return loss there reads 12 dB.'
    },
    '2025-Full7920': {
      why: 'Return loss is 10 log of the forward power over the reflected power. The ratio here is 9.',
      working: ['RL = 10 log(9 ÷ 1)',
                '= 10 × 0.954',
                '= 9.54 dB, so 9.5 dB'],
      source: { eq: ['rl'], from: ['4E2'] },
      seed: { item: '4E1', ptx: 9, rl: 100, xl: 0, dbm: 0 },
      seedNote: 'In the SWR section: 9 W forward, 1 W back, return loss 9.54 dB and SWR 2:1.'
    },
    '2025-Full603': {
      why: 'Six more decibels of loss each way takes 12 dB more off the reflection by the time it gets back. The transmitter sees less reflected power, so a lower SWR and a higher return loss, while the aerial itself is unchanged and gets less power.',
      source: { eq: ['rlTx'], from: ['4E3'] },
      seed: { ptx: 100, rla: 6, len: 20, dbm: 0.05 },
      seedNote: 'A poorly matched aerial, 6 dB return loss, on 20 m losing 1 dB. Now let the rain in: raise the loss to 0.35 dB per metre, 6 dB more, and read the SWR at the transmitter.'
    },
    '2025-Full604': {
      why: 'Find the feeder loss first, then add it twice: once for the forward power going up and once for the reflection coming back.',
      working: ['feeder loss = 10 m × 0.2 dB per metre = 2 dB',
                'RL at the TX = 16 + 2 × 2',
                '= 20 dB'],
      source: { eq: ['lossTot', 'rlTx'], from: ['4E3'] },
      seed: { rla: 16, len: 10, dbm: 0.2 },
      seedNote: 'The aerial at 16 dB on 10 m losing 0.2 dB per metre. Read the return loss at the transmitter.'
    },
    '2025-Full607': {
      why: 'The reflected power is attenuated on its way back, so the transmitter sees less of it than leaves the aerial. Less reflected power reads as a lower SWR, so the SWR at the transmitter is lower than at the aerial.',
      source: { from: ['4E3'] },
      seed: { rla: 10, len: 40, dbm: 0.15 },
      seedNote: 'A lossy feeder, 6 dB. Compare the SWR at the aerial with the SWR at the transmitter.'
    },
    '2025-Full608': {
      why: 'Here the measurement was made at the transmitter, so work back to the aerial: take off twice the feeder loss.',
      working: ['RL at the aerial = RL at the TX − 2 × feeder loss',
                '= 30 − 2 × 3',
                '= 24 dB'],
      source: { eq: ['rlTx'], from: ['4E3'] },
      seed: { rla: 24, len: 30, dbm: 0.1 },
      seedNote: 'The bench is set the other way round: an aerial at 24 dB through 3 dB of feeder. The transmitter reads 30 dB.'
    },
    '2025-Full609': {
      why: 'Feeder loss is per metre times the length; then add it twice to the aerial’s return loss.',
      working: ['feeder loss = 10 m × 0.5 dB per metre = 5 dB',
                'RL at the TX = 20 + 2 × 5',
                '= 30 dB'],
      source: { eq: ['lossTot', 'rlTx'], from: ['4E3'] },
      seed: { rla: 20, len: 10, dbm: 0.5 },
      seedNote: 'The aerial at 20 dB on 10 m losing 0.5 dB per metre.'
    },
    '2025-Full610': {
      why: 'Add twice the feeder loss to the aerial’s return loss.',
      working: ['RL at the TX = 15 + 2 × 3',
                '= 15 + 6',
                '= 21 dB'],
      source: { eq: ['rlTx'], from: ['4E3'] },
      seed: { rla: 15, len: 30, dbm: 0.1 },
      seedNote: 'The aerial at 15 dB through 3 dB of feeder.'
    },
    '2025-Full3675': {
      why: 'A correctly adjusted AMU does two things: it tunes out the reactive part of the impedance it is connected to, and it transforms the resistance that remains to 50 Ω, so the transmitter sees 50 Ω with no reactance. It does not make the aerial itself resonant, and leaving some reactance would not be a match.',
      source: { eq: ['xamu1', 'xamu2'], from: ['4F1'] },
      seed: { toggle: 'T', ar: 200, ax: -150, af: 3.6e6 },
      seedNote: 'A T network matching 200 − j150 Ω at 3.6 MHz. Read what the transmitter sees.'
    },
    '2025-Full3750': {
      why: 'An AMU between the transmitter and the feeder works on whatever the feeder presents at its input, cancelling the reactance there and transforming the resistance. It cannot reach the far end of the feeder, so the SWR between the AMU and the aerial is unchanged, and it does nothing to the feeder loss.',
      source: { from: ['4F1'] },
      seed: { toggle: 'L', ar: 30, ax: 40, af: 7.1e6 },
      seedNote: 'Take 30 + j40 Ω as what a feeder presents at its input. The L network cancels the j40 and turns 30 Ω into 50 Ω.'
    },
    '2025-Full3817': {
      why: 'An AMU cancels the inductive or capacitive reactance with an equal and opposite one, and transforms the resistive part to the value the transmitter needs. It does not touch the loss in the feeder.',
      source: { eq: ['xamu1', 'xamu2'], from: ['4F1'] },
      seed: { toggle: 'L', ar: 200, ax: 300, af: 3.6e6 },
      seedNote: 'An inductive load, 200 + j300 Ω. The network’s parts cancel the j300 and bring 200 Ω down to 50 Ω.'
    },
    '2025-Full825': {
      why: 'A part to earth at each end and one in series between them is a pi network, and with variable parts it is a pi match AMU. A balun would have windings on a core; an L match has only two parts.',
      source: { from: ['4F1'] },
      seed: { toggle: 'pi', ar: 200, ax: -150, af: 3.6e6 },
      seedNote: 'The pi network on the bench: capacitor to earth, coil in series, capacitor to earth.'
    },
    '2025-Full829': {
      why: 'Two parts, one in series and one to earth, make an L network: the L match AMU. A pi has a part to earth at each end, and a balun has windings on a core.',
      source: { from: ['4F1'] },
      seed: { toggle: 'L', ar: 200, ax: -150, af: 3.6e6 },
      seedNote: 'The L network on the bench: one part to earth and one in series.'
    },
    '2025-Full849': {
      why: 'Two parts in series with one to earth between them make the letter T: a T-match AMU, the usual HF type with two variable capacitors and an inductor to earth.',
      source: { from: ['4F1'] },
      seed: { toggle: 'T', ar: 200, ax: -150, af: 3.6e6 },
      seedNote: 'The T network on the bench: capacitor in series, coil to earth, capacitor in series.'
    },
    '2025-Full565': {
      why: 'A quarter wave of feeder transforms the load: Zin = Z0² ÷ Zout.',
      working: ['Zin = Z0² ÷ Zout',
                '= 75² ÷ 100 = 5625 ÷ 100',
                '= 56.25 Ω, so 56 Ω'],
      source: { eq: ['q4'], from: ['4F2'] },
      seed: { toggle: 'one', qz0: 75, qr: 100 },
      seedNote: 'The bench: 100 Ω through a quarter wave of 75 Ω coax. Read what the transmitter sees at 145 MHz.'
    },
    '2025-Full566': {
      why: 'Rearrange Z0² = Zin × Zout for Z0, with Zin the 50 Ω wanted and Zout the 100 Ω aerial.',
      working: ['Z0 = √(Zin × Zout)',
                '= √(50 × 100) = √5000',
                '= 70.7 Ω, about 70 Ω'],
      source: { eq: ['q4z'], from: ['4F2'] },
      seed: { toggle: 'one', qz0: 70.71, qr: 100 },
      seedNote: 'A quarter wave of 70.7 Ω on a 100 Ω aerial: the transmitter sees 50 Ω.'
    },
    '2025-Full719': {
      why: 'Only a quarter wave, or an odd number of quarter waves, transforms the impedance this way. A half wave simply repeats the load, 100 Ω, and a short length changes little.',
      source: { eq: ['q4'], from: ['4F2'] },
      seed: { toggle: 'one', qz0: 72, qr: 100 },
      seedNote: 'Sweep the graph: the match is good only around 145 MHz, where the section is a quarter wave.'
    },
    '2025-Full720': {
      why: 'The same rearrangement, with Zin the 50 Ω receiver and Zout the 100 Ω aerial. 72 Ω is the nearest offered.',
      working: ['Z0 = √(Zin × Zout)',
                '= √(50 × 100) = √5000',
                '= 70.7 Ω; 72 Ω is the nearest offered'],
      source: { eq: ['q4z'], from: ['4F2'] },
      seed: { toggle: 'one', qz0: 72, qr: 100 },
      seedNote: 'A quarter wave of 72 Ω on 100 Ω gives 51.8 Ω, an SWR of 1.04:1 on the 50 Ω side.'
    },
    '2025-Full746': {
      why: 'In parallel the two tails must give 50 Ω, so each must give 100 Ω from its 50 Ω Yagi.',
      working: ['each tail must turn 50 Ω into 100 Ω',
                'Z0 = √(50 × 100) = √5000',
                '= 70.7 Ω, about 70 Ω'],
      source: { eq: ['q4z'], from: ['4F2'] },
      seed: { toggle: 'two', qz0: 70.71, qr: 50 },
      seedNote: 'Two 50 Ω Yagis, each on a quarter wave tail of 70.7 Ω. The joint is 50 Ω.'
    },
    '2025-Full7922': {
      why: 'Work out what each tail gives first, put the four in parallel, then find the section that matches that to 50 Ω.',
      working: ['each tail: 75² ÷ 50 = 112.5 Ω; four in parallel: 112.5 ÷ 4 = 28.1 Ω',
                'Z0 = √(28.1 × 50) = √1406',
                '= 37.5 Ω'],
      source: { eq: ['q4', 'q4z'], from: ['4F2'] },
      seed: { toggle: 'four', qz0: 75, qz1: 37.5, qr: 50 },
      seedNote: 'Four 50 Ω Yagis on 75 Ω tails, joined at 28.1 Ω and matched by a quarter wave of 37.5 Ω.'
    }
  },

  outro: {
    foundation: [
      'Three things to take from this page. A feeder loses power, more for a longer one and at a higher frequency. An aerial matches only near the frequency it was built for. And a high SWR at the transmitter means a fault in the aerial or the feeder.',
      'An AMU lets the transmitter work into an aerial that does not match, but the aerial is unchanged. The course session on feeders and antennas goes through each of these again.'
    ],
    intermediate: [
      'A feeder has an impedance of its own, and only a load equal to it leaves the voltage and current the same all the way along. Anything else makes a standing wave, and changes what the transmitter sees.',
      'An AMU in the shack puts the transmitter right and leaves the feeder as it was. Keep the decibel steps to hand: 3 dB is a half, 10 dB a tenth.'
    ],
    full: [
      'Most of the sums at Full come down to four lines: physical = electrical × VF, SWR = (Vf + Vr) ÷ (Vf − Vr) with square roots first for powers, return loss at the transmitter = return loss at the aerial + twice the feeder loss, and Z₀² = Zin × Zout.',
      'Two of those are not on the sheet, and the velocity factor of 0.67 is not either. Where the exam’s answer rests on an assumption, a lossless feeder, a stub invisible away from its notch or air spaced coax at a VF of 1, the bench shows what changes without it.'
    ]
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = BENCH;
if (typeof window !== 'undefined') window.BENCH = BENCH;
