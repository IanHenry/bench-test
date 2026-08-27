# Bench Test

Interactive benches for the technical half of the RSGB amateur radio syllabus.
One bench per lettered syllabus group, covering every level that teaches the
group, with the circuits live rather than drawn.

Free, non-commercial, static, client side. No backend, no build-time network
access, no dependencies. `python build.py` writes self-contained HTML files
into `benches/`.

---

## The rules this project works under

These are not preferences. They decide what can ship.

**The licence manuals and Exam Secrets are copyright.** They are read for
pitch, coverage, emphasis, and to find which figures deserve to move. Never a
word or a figure from them in shipped output. Every explanation is written
fresh.

**Syllabus learning-objective wording is RSGB copyright.** Item codes such as
`2I4` are factual references and fine to use. The one-line description of each
item in `content/descriptions.json` is our own wording, not theirs.

**The question bank may be reused, unadapted, with attribution, for
non-commercial training.** So questions are never reworded, renumbered, or
regenerated, and the option order is left exactly as supplied. The bank lives
at `bank/questions.csv`, 571 questions, Full level only. Foundation and
Intermediate are marked as still to come by the RSGB.

**Do not ask the RSGB for data.** Their public interface fetches a static CSV,
and that file is the export.

**CircuitJS is GPL and has not been looked at.** The moving-charge animation
is derived from our own phasor solution. Keep it that way.

---

## Layout

```
engine/       the simulation and drawing engines, no dependencies
  mna.js         complex modified nodal analysis, R L C V I and G (VCCS)
  dsp.js         FFT, spectrum, aliasing, quantisation
  dc.js          diode and operating point maths, conduction angle, classes
  format.js      engineering notation and rounding
  plot.js        the plotting engine: bands, dual axes, cursors, labels
  schematic.js   circuit symbols and wiring
  flow.js        animated charge along wires and through components
  test-*.js      73 assertions across mna, dsp and dc
  check-*.js     the two circuit checkers, described below
content/      one file per bench, plus descriptions.json
template/     bench.html, the generic page all benches are built into
syllabus/     per-level syllabus parsing and the authoritative item lists
bank/         the RSGB question CSV and its images
benches/      build output, self contained HTML
```

Run everything:

```bash
python build.py
```

Tests and checkers separately:

```bash
node engine/test-mna.js && node engine/test-dsp.js && node engine/test-dc.js
```

```bash
node engine/check-layouts.js content/2I.js && node engine/check-flow.js content/2I.js
```

A local server for the browser, from the repo root:

```bash
python -m http.server 8412
```

---

## The checks, and why each exists

`build.py` refuses to ship a bench that fails any of these. **Every one was
added after the same mistake had already shipped once.** They are the memory
of this project and should not be weakened to make a build pass.

| Check | The failure it was written for |
|---|---|
| Level coverage matches the syllabus | A bench taught a level the syllabus does not examine |
| Per-level headline matches `descriptions.json` | Headline drifted from the item it belongs to |
| Per-level explanations differ | The same prose shown at two levels |
| Answers present, sourced, and cite real equations | An answer appeared from nowhere |
| Terms defined before first use | Jargon used pages before it was explained |
| Every control described | Sliders named after components with no circuit on screen |
| Intro, outro and a lead at every level | Items opening cold with no way in |
| A question seeds the bench | Nothing connected the questions to the instrument |
| Working shows numbers, not just symbols | Answers that stated relationships without substituting |
| Working arrives at the correct option | A diode question worked for a circuit that was not the one in its diagram, ending on a figure that was not among the four answers |
| Circuits drawn on circuit benches | A bench silently lost its schematics |
| `check-layouts.js`: every circuit joined up | Dangling leads, which look almost right |
| `check-flow.js`: every conductor carries a named current | Legs drawn with nothing moving in them, which read as broken circuits |
| Sources recorded, key messages mapped to items and levels | Pages that were correct and pedagogically incomplete |

`check-flow.js` deserves a note. Every drawn element and every wire must
resolve to a current the netlist actually solves for. A part that genuinely
carries no signal current is declared `'-'`, which is a claim that has to be
meant: bypassed, shorted, or an open output. Unannotated is not allowed,
because that is how the dead legs kept getting through.

---

## Conventions that are easy to get wrong

**Current direction.** Write each netlist element so that `a` to `b` is the
direction conventional current flows on a positive half cycle, and orient the
drawing to match. Then the reported sign, the plotted trace and the moving
dots all agree with no special cases. Writing `RC c 0` instead of `RC 0 c`
reports the collector current 180 degrees out, because it measures collector
node to ground while the load actually feeds current into the collector node.

**Do not model a part by assuming it.** The common emitter stage once
computed its gain with the emitter at signal earth while the drawing showed an
unbypassed emitter resistor: a gain the circuit as drawn could not produce.
If the maths needs a component, draw it and put it in the netlist.

**Animation scales to the largest current actually drawn**, not the largest in
the netlist. The transistor's controlled source and its output resistance are
inside the device and never on the page; normalising to those left the biggest
visible branch at half swing.

**Charge animation scales compressively** (`pow(m, 0.32)`, intensity floored
at 0.18) because real branch currents span four orders of magnitude and linear
scaling freezes everything but the largest.

**Two traces on one plot get their own axis**, with each scale named in the
legend, the way a scope gives each channel its own volts per division. A
shared axis buries anything more than about ten times smaller. Draw the
thicker trace first so a coincident thinner one still shows.

**A panel returning `circuit:` must return a parsed circuit**
(`MNA.parseNetlist(...)`), not a netlist string. Returning the wrong shape
throws inside `render`. Panel failures are now contained per item and shown
where they happen, and `window.__benchErrors` records load-time errors.

---

## Verifying a change

Building clean is necessary and not sufficient. The models were right and the
displays were broken for most of one session.

- **Check what is drawn, not what is computed.** Sample the rendered canvas,
  find each trace by its legend swatch colour, take the mean y per column and
  correlate the two. Minus one proves an inversion is on screen; the pixel
  height of each trace proves it is visible at all.
- **Kirchhoff at every node across a sweep of control settings** is a cheap and
  decisive check that a drawn circuit is true.
- **`requestAnimationFrame` never fires while the browser pane is hidden**, so
  a probe that awaits it hangs. Panel renders are synchronous on click.
- Load every bench at every level and read `window.__benchErrors` and
  `.panel-failed` before calling it done.

---

## Where it stands

Three benches built: **2F** sampling and conversion, **2H** tuned circuits and
filters, **2I** semiconductors.

`overview.html` is the outward facing description, for sending to someone whose
opinion is wanted. `notes/` holds internal working records, including the
detailed check of the benches against the reference books. **`notes/` is not
published and must stay out of any deployed site**: it names copyright material
and quotes figures from it, which is fine as a working note and not something
to put on a public page.

Outstanding, in rough order of value:

1. **The Colpitts schematic.** The oscillator panel draws the correct
   configuration and states the right physics, but the tuned circuit and the
   capacitive tap are described rather than drawn. Needs a layout with the
   tank, the divider and one no-connect crossing, and a netlist that solves an
   oscillator honestly: it has no input source, so driving it to animate the
   charge needs thought rather than a convenient fudge.
2. **Two-tone intermodulation at 3F2.** Needs only the existing DSP engine.
3. **The remaining syllabus groups.** 126 items, 221 level entries in
   `content/descriptions.json`; three groups are covered.
4. **Audio.** Deferred deliberately. The DSP engine must emit a plain sample
   buffer with playback as a thin adapter; nothing visual may depend on an
   AudioContext.

Not yet done and needed before any public launch: this is **not a git
repository**, there is no index page tying the benches together, and nothing
is deployed.
