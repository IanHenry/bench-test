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
  mna.js         complex modified nodal analysis, R L C V I, G (VCCS), T
                 (a lossy transmission line, stamped from its ABCD parameters)
                 and K (coupling between two inductors, M = k√(L1 L2))
  tran.js        time-step nodal analysis for nonlinear circuits: R L C V I,
                 diodes, Zeners and NPN transistors, backward Euler or
                 trapezoidal, Newton with junction limiting; settle() runs a
                 mains-driven circuit until it repeats, jumping ahead when a
                 big capacitor closes in on its charge only slowly
  dsp.js         FFT, spectrum, aliasing, quantisation
  dc.js          diode and operating point maths, conduction angle, classes
  format.js      engineering notation and rounding
  plot.js        the plotting engine: bands, dual axes, cursors, labels
  schematic.js   circuit symbols and wiring, and where each terminal lands
  flow.js        animated charge: AC slosh, DC drift, and time series
  test-*.js      284 assertions across mna, dsp, dc, flow and tran
  check-*.js     the two circuit checkers, described below
  fixtures/      layouts using the newer symbols and modes, for the tests
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
node engine/test-mna.js && node engine/test-dsp.js && node engine/test-dc.js && node engine/test-flow.js && node engine/test-tran.js
python test_build.py
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

## Writing a new page

A page is `content/<page>.js` defining `BENCH`, built to `benches/<page>.html`
by `python build.py <page>`. Copy the shape of `2H.js` (circuits) or `2F.js`
(no circuits). The fields below are the ones added for pages that span several
groups or show DC and time-varying circuits; everything else is as in the
existing pages.

**Several groups on one page.** `groups: ['2A', '2B', '2C']` beside
`group:`. The page id stays the file name. Questions are drawn from every
listed group, every item must belong to one of them, and every syllabus item
in them must be on the page (the build warns otherwise). `group` is what the
tag at the top shows, so make it readable (`'2A to 2C'`); the eyebrow then
reads "items in groups 2A, 2B and 2C". Without `groups`, the file name is the
group, as before.

**Sliders in the item, not the rail.** On an item, `controls: ['V', 'R']`, or
per level `controls: { foundation: ['V'], full: ['V', 'R'] }`. The item gets
its own strip of those sliders above its instrument, showing only the ones the
current level lists. A control that any item lists leaves the shared rail; a
control no item lists stays in it, so a supply voltage common to everything
can stay at the top. Copies of a control share one value. The build warns if
an item lists a control the page does not define. Pages that list none keep
the rail exactly as before.

**Seeds and presets can set toggles.** Besides control ids, a seed (in
`answers`) or a preset's `values` may carry `toggle: '<option key>'` to set
the item's toggle, and `item: '<code>'` when the seed belongs to a different
item from the one the question sits in. `toggle` and `item` are therefore
reserved, not control ids. A question seed that sets a toggle, names an item,
or belongs to an item with its own sliders scrolls to that item, clear of the
rail; otherwise it keeps the question in view as before.

**Charge that is not AC.** A panel can return `flow` beside `layout` (and
`circuit`). The template scales to the largest current drawn unless `iMax`
is given.

| `flow` | What moves | Currents |
|---|---|---|
| none, with `circuit` | AC slosh, as before | solved at `p.fAnim` or `d.f0` |
| `{ mode: 'dc' }` | steady one-way drift, speed in proportion to current | `circuit` solved at 0 Hz, real part |
| `{ mode: 'dc', currents: { R1: 0.012 } }` | the same | the panel's own, in amperes; the sign is the direction |
| `{ mode: 'time', duration, currents: t => ({ R1: i }) }` | charge and discharge: fast at the switch, creeping to a halt | a function of circuit time in seconds over `duration` |
| `{ mode: 'ac', currents: { IP: {re, im} } }` | AC slosh | the panel's own phasors (numbers allowed) |

A time series may also carry `hideStill: true`: a branch carrying nothing at
that moment then draws no dots at all, so a rectifier shows charge only in
the diodes that are conducting (2J). It is off by default, and a page that
leaves it out animates exactly as before.

Options: `compress: true` scales speed as `pow(m, 0.32)` when branches span
orders of magnitude (it gives up the visible Kirchhoff balance that linear
speed gives); `loop` is the screen seconds one time-series pass takes
(default 6); `charge: t => ({ R1: q })` gives the closed form charge for an
exact time series; `label: t => '1.4 τ after the switch closes'` says the
moment in the note under the circuit; `note` replaces the DC note, and
`note: false` leaves a note the panel wrote itself. Passes of a time series
join without a jump, so a charge then discharge cycle (net charge zero) loops
cleanly.

**Symbols.** Besides `R C L D DZ DV V B Q`:

| type | Draws | Fields |
|---|---|---|
| `CP` | polarised (electrolytic) capacitor | the hollow positive plate is on the first terminal, so at rot 90 the positive lead is at the top; turn it to rot 270 for a reversed part and mark it `flowReversed: true` if its current still runs top to bottom |
| `S` | switch | `open: true`; closed by default. An open switch carries nothing and must not name a current; on a closed one the drawn charge stops at the contacts, so the lever still reads as a switch |
| `N` | neon lamp | `lit: true` fills the envelope with its glow |
| `LP` | filament lamp, a circle with a cross | model it as a resistor in the netlist; the drawn charge stops at the glass, so the filament stays readable |
| `M` | moving coil meter | `meter: 'mA'` (the letter inside, drawn upright), or `reading: 0..1` for a needle instead; name it `RM` and model it as a small resistor in the netlist |
| `TL` | a length of feeder, drawn across the page | four pins: inner and screen at the left end, then at the right, the screens `LINE_GAP` (16) below; `len: 120` in layout units; `twin: true` for twin or ladder line; `flow: ['in', 'out']` names the current into the left end and out of the right end, which differ on a line; `along: ['T1', 'T2', ...]` names the current at the start of each section the netlist cuts the feeder into, so the charge shows the standing wave; the screen current runs back under the inner. See `engine/fixtures/line.js` |
| `U` | three terminal regulator, a box | three pins: in at x &minus;30, out at x +30, common at y +30; `text: '7812'` is written inside. Like a transistor it has no drawn charge of its own, so its pins are where current enters and leaves the drawing |
| `T` | transformer | four pins: primary top and bottom at x &minus;20, secondary at x +20, y &plusmn;30 from its centre; `flow: ['IP', 'IS']` names each winding's current, positive top to bottom; `flowReversed: [false, true]` for a secondary that drives current out of its top; `humps: [8, 4]` shows the turns ratio; `core: 'air'`; `dots: true`; `inductors: true` draws it in the inductance colour, for a pair of tuned coils such as an IF transformer, whose windings are coupled L elements with a K between them; `tap: true` adds a fifth pin at the middle of the secondary (x +20, y 0), and the secondary's halves then carry a current each, `flow: ['IP', 'top', 'bottom']` |

Every two terminal part runs from its first terminal (left at rot 0, top at
rot 90) to its second, and a diode's first terminal is its anode: a forward
biased diode points the way its current goes. A reverse biased Zener drawn
cathode up (rot 270) carries its current downward, so mark it
`flowReversed: true`. A transistor (`Q`) takes `mirror: true` to face the other way, base on the
right, and `labelAt: 'left'` or `'right'` to be labelled beside its circle
rather than above it, where the collector lead runs. A layout may carry
`labelPx: 15` to draw every label at that size on screen whatever scale it is
fitted at (never below the usual 13 layout units); 2J uses it.
`Schematic.pins(el)` gives the terminal positions the
checkers use, so a layout can be checked against them while it is drawn. The
resistor body is 28 by 10 layout units, the house proportion of 56 by 20
(2.8 : 1); the circuit is scaled to the canvas. At a capacitor (`C` or `CP`)
the drawn charge stops at the plates: it arrives at one and leaves the other,
and none crosses the dielectric. The checkers still see one run end to end.

**Page options in the template.** `circuitColumn: 420` widens the circuit
column on a wide screen (default 300 px), for a page whose networks would
otherwise be drawn too small to read. `circuitHeight: 300` goes with it and
makes the circuit canvas and the graph beside it that tall on the same wide
screens (default 230 px), so a network can use the width it has been given;
2H uses both. A page that sizes its canvases itself, as 2A and 3F do, leaves
it out. `colophonNote` may be one string, one
per level (`{ foundation: ..., full: ..., all: ... }`), or a function of the
level, for a note that is true at one level only. A pressed preset button
(`aria-pressed="true"`) is styled by the template. Legend swatches wrap their
label in its own element, so a label with a subscript stays one run of text.
The plot engine draws every axis and cursor label at 15 px, with a true minus
sign, and `Fmt.eng` writes a true minus sign too. A trace may carry
`dash: [on, off]`: two traces of one quantity are told apart by dashing one,
never by fading it, since a faded colour falls below 4.5:1 on the panel and
faded lines that overlap pile up until they look solid. A filled trace may
carry `fillTo: 0` to fill to that value rather than to the foot of the axis,
for a current that never goes negative on an axis that does. `standfirst`, like
`colophonNote`, may be one string or one per level, for a page whose
Foundation instruments do less than its Full ones. Subscripts and
superscripts in the working, its note and the question working are 15 px,
like everything else, and so are those anywhere else in the items: readout
labels, legends and prose. A control
may carry `snap: v => …` to hold only values that exist (2A snaps its marked
resistor to E12). `Fmt.eng` moves up a prefix when rounding reaches 1000, so
0.99999 V reads "1 V", never "1000 mV".

**Checking DC and time layouts.** An `allLayouts()` entry may carry the same
`flow` the panel returns: `{ name, layout, netlist, flow: { mode: 'dc' } }`
solves at 0 Hz, so a capacitor must be drawn `'-'`; `flow` with `currents`
needs no netlist; a time series is sampled across its duration. Any entry
with `flow` is also checked for balance: at every junction, the current drawn
arriving must equal the current leaving, which catches a wire written the
wrong way round. Points where a source, transistor, ground or terminal lands
are not balanced, since current enters or leaves the drawing there. See
`engine/fixtures/new-modes.js` for worked examples of each.

---

## Colours

One scheme runs across the course and Bench. A quantity is always the
course's colour for it (from the course's `parts/style.txt`); everything you
press is the g0lft.org site blue. The variables live in `template/bench.html`,
light and dark, and reach a panel through `ctx.tokens` (the `t` a panel draws
with). Dark values are lighter variants, each at least 4.5:1 on the dark panels.

| Variable | Token | Light | Dark | Means |
|---|---|---|---|---|
| `--q-v` | `t.v` | `#0D6EFD` | `#6EA8FE` | voltage |
| `--q-i` | `t.i` | `#FD7E14` | `#FD9843` | current: lines, fills, moving charge |
| `--q-i-ink` | `t.iInk` | `#C2410C` | `#FD9843` | current as text (`#FD7E14` is too pale to read) |
| `--q-r` | `t.r` | `#343A40` | `#CED4DA` | resistance; resistors are drawn in it |
| `--q-p` | `t.p` | `#DC3545` | `#F08A93` | power |
| `--q-l` | `t.l` | `#198754` | `#5DC593` | inductance, X<sub>L</sub>; inductors are drawn in it |
| `--q-c` | `t.c` | `#6F42C1` | `#B79CF0` | capacitance, X<sub>C</sub>; capacitors are drawn in it |
| `--q-z` | `t.z` | `#0A3D7A` | `#9DB8E8` | impedance |
| `--q-note` | `t.note` | `#FFC107` | `#FFC107` | notices and warnings, fills and rules only |
| `--q-note-ink` | `t.noteInk` | `#856404` | `#FFD45E` | notices and warnings as text |
| `--q-mark` | `t.mark` | `#495057` | `#AEBBC6` | a cursor, mark or band that is not a quantity |
| `--q-v-fill`, `--q-i-fill`, `--q-p-fill` | `t.vFill`, `t.iFill`, `t.pFill` | | | translucent fills under a trace |
| `--accent` | `t.accent` | `#1F6AE1` (hover `#1F4DB6`) | `#6FA0F2` (hover `#9DBDF6`) | chrome only: level switch, links, toggles, sliders, pressed presets, focus rings, item codes |

Chrome: `--paper #FAFBFC`, `--surface #FFFFFF`, `--surface-2 #FAFBFC`,
`--ink #1A1A1A`, `--ink-soft #495057`, `--ink-faint #6C757D`, `--wire #6C757D`.
Keep `--surface` a six digit hex: 2A and 2D read it to tell dark mode.

Never use `--accent` for a quantity, and never draw a quantity in a colour
that means another. The figure a panel is about (`ro(..., hot)`) is marked by
a tinted cell, not recoloured, and the working is in ink, so neither can
contradict the colour of what it shows. The engine now does this by default:
charge dots are `--q-i`; R, L and C are drawn in `--q-r`, `--q-l`, `--q-c`
(highlighted parts keep their colour, heavier, label bold); a plot trace with
no colour is `--q-v`, a mark or cursor with none is `--q-mark`.

**Deprecated, kept as aliases until every page is recoloured.** Do not use
them in new work; each follows its new name into dark mode.

| Old | Token | Now aliases | Was |
|---|---|---|---|
| `--trace` | `t.trace` | `--q-i-ink` | amber, the main trace |
| `--trace-fill` | `t.fill` | `--q-i-fill` | |
| `--phase` | `t.phase` | `--q-v` | teal, the second trace |
| `--marker` | `t.marker` | `--q-p` | magenta, marks, cursors and highlights |

The old names meant "first trace", "second trace" and "mark", not a quantity,
so each page recolours by what each use shows, not by a search and replace:

| Page | Map each use to |
|---|---|
| 2A | `hues()`: `i: t.trace` → `t.i` for lines and bars, `t.iInk` in `span()` text; hard-coded `v` → `t.v`, `p` → `t.p`, `r: t.ink` → `t.r`; `bad: t.marker` and `ok` green → `t.noteInk` / `t.ink` (green is inductance) |
| 2D | `hues()`: `volt: t.phase` → `t.v`; `amp: t.trace` → `t.i`; `power`, `cap`, `ind` hex → `t.p`, `t.c`, `t.l`; `warn: t.marker` → `t.noteInk`; `spark` → `t.note`; cursors and "the rating" marks (`t.marker`) → `t.mark` |
| 2E | currents (`t.trace`) → `t.i`; voltages (`t.phase`) → `t.v`; power (`t.marker`, with `t.fill`) → `t.p`, `t.pFill`; V<sub>C</sub> in the phasor sum (`t.marker`) → `t.c`; "your frequency" and signal B → `t.mark` |
| 2F | done: analogue signal → `t.v`; the held values → a translucent band of `t.v` (`tint(t.v, 0.38)`, 0.5 in dark) behind the signal; the digital blocks of the chain → `t.ink`; samples, Nyquist and marks → `t.mark` |
| 2H | X<sub>L</sub> and energy in L → `t.l`; X<sub>C</sub> and energy in C → `t.c`; impedance curves (`t.trace`, `t.fill`) → `t.z`; the loop current in amperes (`t.trace`, `t.fill`) → `t.i`, `t.iFill`; phase angle (`t.phase`), f<sub>0</sub> and bandwidth bands, marks and cursors (`t.marker`) → `t.mark` |
| 2I | done: collector, drain and diode currents (`t.trace`, `t.fill`) → `t.i`, `t.iFill`; input and output voltages → `t.v`; the load and bias lines (`t.phase`) → `t.r`; breakdown, pinch off and saturation marks (`t.marker`) → `t.mark`; circuit labels drawn by the page at 15 px, the circuit canvas sized to the layout. The syllabus's "common emitter (source)" in Full 2I4: the common source stage is drawn under 2I3 (FET), and the 2I4 prose points there |
| 3F | done: power (`t.marker`, `tint(t.marker, …)`) → `t.p`, `t.pFill`, a second power trace (sent back, asked for, before the filter, third order) `t.p` dashed rather than faded, the heat bar hatched; direct current (`t.trace`) → `t.i`; the PA transfer curve, output against input voltage (`t.phase`) → `t.v`, its swing band and marks → `t.mark`; ratings, the SSB channel and filter loss (`t.phase`) → `t.mark` |

When a page no longer reads `t.trace`, `t.fill`, `t.phase` or `t.marker`,
say so here (2F, 2H, 2I and 3F no longer read any of them); when none does, delete the aliases from `bench.html` and
`tokens()`.

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

Ten benches are built: **2A to 2C** resistance, power and tolerance,
**2D** reactive components, **2E** AC theory, **2F** sampling and conversion,
**2H** tuned circuits and filters, **2I** semiconductors, **2J** power supplies, **3F** RF power
amplifiers, **3I** the superhet receiver, and **4A, 4B, 4E and 4F** feeders, SWR and matching (page `4A`).
2F, 2H and 2I are live at https://bench.g0lft.org; the other seven
are built and checked here but not yet pushed. Each links back to the course
sessions that use it, at course.g0lft.org, and those sessions link to it. The engine
tests carry 284 assertions, and `test_build.py` checks the page and group
handling. The Colpitts oscillator is drawn and solved.

`overview.html` is the outward facing description, for sending to someone whose
opinion is wanted. `notes/` holds internal working records, including the
detailed check of the benches against the reference books. **`notes/` is not
published and must stay out of any deployed site**: it names copyright material
and quotes figures from it, which is fine as a working note and not something
to put on a public page.

Outstanding, in rough order of value:

1. **The remaining syllabus groups.** 126 items, 221 level entries in
   `content/descriptions.json`; fifteen groups are covered (2A to 2F, 2H,
   2I, 2J, 3F, 3I, 4A, 4B, 4E and 4F). Next: 4C and 4D antennas, which can
   reuse the line element. 2J brought in `tran.js`, a time-step solver, which
   other time-domain items (AGC, oscillator start-up) could use.
2. **Audio.** Deferred deliberately. The DSP engine must emit a plain sample
   buffer with playback as a thin adapter; nothing visual may depend on an
   AudioContext.
3. **Beta above 400.** The beta control tops out at 400; worth widening.

### Deployment

Only `index.html`, `benches/`, `images/` (the site logo the pages share)
and `CNAME` belong on the public site. `.github/workflows/pages.yml` stages
exactly those and publishes them. It
takes effect once the repository's Pages source is set to GitHub Actions;
until then Pages serves the whole repository root, this README, `build.py`,
`content/` and `bank/questions.csv` included.
