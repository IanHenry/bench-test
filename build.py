#!/usr/bin/env python3
"""
build.py - assemble a self-contained bench page from the shared engine.

Every bench is the same template plus one content file. The engine lives in
engine/ and is written once; this inlines it so a published page needs no
network at all. Nothing is duplicated between benches, so a fix to the solver
reaches all of them on the next build.

    python build.py            build every bench in content/
    python build.py 2H         build just that one
"""
import base64
import csv
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent
ENGINE = ['format.js', 'mna.js', 'dsp.js', 'dc.js', 'plot.js', 'schematic.js', 'flow.js']
TEMPLATE = ROOT / 'template' / 'bench.html'
OUT = ROOT / 'benches'


def strip_module_exports(js):
    """Drop the Node export tail; the browser build uses the window globals."""
    return re.sub(r"if \(typeof module !== 'undefined'.*?\n", '', js)


def wrap(name, js):
    """Each engine file gets its own scope so top-level consts cannot collide."""
    return ('/* ---- engine/%s ---- */\n(function () {\n%s\n})();\n'
            % (name, strip_module_exports(js).strip()))


LEVELS = ('foundation', 'intermediate', 'full')


def item_blocks(content):
    """Split the content file into one text block per item."""
    parts = re.split(r"\n    \{\n      code: '", content)
    return {p.split("'", 1)[0]: p for p in parts[1:]}


def check_items(content, codes, desc, syllabus):
    """
    An item that appears at more than one level must say something different
    at each of them, because the exam asks for something different. This is
    the check that stops a second level being added by copying the first.
    """
    warnings = []
    blocks = item_blocks(content)

    for code in codes:
        block = blocks.get(code, '')
        declared = re.search(r"levels: \[([^\]]*)\]", block)
        declared = re.findall(r"'(\w+)'", declared.group(1)) if declared else []

        # the bench must teach exactly the levels the syllabus examines
        expected = syllabus.get(code)
        if expected is None:
            warnings.append('%s is not a syllabus item' % code)
        elif sorted(declared) != sorted(expected):
            warnings.append('%s declares %s but the syllabus has %s'
                            % (code, declared or '[]', expected))

        if code not in desc:
            warnings.append('%s missing from descriptions.json' % code)
            continue

        for lvl in declared:
            if lvl not in desc[code]:
                warnings.append('%s has no %s description' % (code, lvl))
            elif desc[code][lvl] not in block:
                warnings.append('%s %s headline differs from descriptions.json' % (code, lvl))
            if ("%s: [" % lvl) not in block:
                warnings.append('%s has no %s explanation' % (code, lvl))

        # prose must actually differ between levels
        prose = {}
        for lvl in declared:
            m = re.search(r"%s: \[(.*?)\n        \]" % lvl, block, re.S)
            if m:
                prose[lvl] = re.sub(r'\s+', ' ', m.group(1)).strip()
        seen = {}
        for lvl, text in prose.items():
            if text in seen:
                warnings.append('%s says the same thing at %s and %s'
                                % (code, seen[text], lvl))
            seen[text] = lvl

    return warnings


def questions_for(group):
    """
    Pull this group's questions out of the published bank.

    They ship verbatim: text, all four options, the marked answer and any
    image, exactly as supplied. The terms permit redistribution in unadapted
    form inside training material with attribution, and adapting them is
    forbidden, so nothing here rewrites or reorders anything.

    Images are inlined as data URIs so a published page needs no network.
    """
    csv_path = ROOT / 'bank' / 'questions.csv'
    if not csv_path.exists():
        return [], 'no bank/questions.csv, questions omitted'

    out, missing = [], []
    with csv_path.open(encoding='utf-8-sig', newline='') as fh:
        for row in csv.DictReader(fh):
            code = row['TagsToSyllabus'].strip()
            if not code.startswith(group):
                continue
            image = None
            name = row['ImageFileName'].strip()
            if name:
                f = ROOT / 'bank' / 'images' / name
                if f.exists():
                    mime = 'image/svg+xml' if name.lower().endswith('.svg') else 'image/png'
                    image = 'data:%s;base64,%s' % (
                        mime, base64.b64encode(f.read_bytes()).decode('ascii'))
                else:
                    missing.append(name)
            out.append({
                'code': code,
                'ref': row['Reference Number'].strip(),
                'q': row['Stimulus'].strip(),
                'options': [row['Option %d' % i].strip() for i in (1, 2, 3, 4)],
                'answer': row['Correct Answer'].strip(),
                # the text of the right option, so the working can be
                # checked for arriving at it
                'correct': row.get('Option %d' % (
                    'ABCD'.index(row['Correct Answer'].strip()) + 1), '').strip(),
                'image': image,
            })
    note = ('images not downloaded: %s' % ', '.join(missing)) if missing else None
    return out, note


SI = {'p': 1e-12, 'n': 1e-9, 'u': 1e-6, 'm': 1e-3, '': 1.0,
      'k': 1e3, 'K': 1e3, 'M': 1e6, 'G': 1e9}


def quantities(text):
    """Every number in a string, scaled by any SI prefix attached to it."""
    text = (text.replace('&minus;', '-').replace('&times;', ' ')
                .replace('&Omega;', ' ').replace('\u2212', '-'))
    out = set()
    for m in re.finditer(r'(\d+(?:\.\d+)?)\s*([pnumkKMG])?', text):
        v = float(m.group(1))
        out.add(v)
        out.add(v * SI.get(m.group(2) or '', 1.0))
    return out


def lands_on(last_line, correct):
    """
    Does the final line of the working arrive at the correct option? A
    numeric option has to be matched by a number; an option named in words,
    such as a graph or a response, has to be named.
    """
    if not correct:
        return True
    nums = {v for v in quantities(correct) if v > 0}
    if nums:
        got = quantities(last_line)
        return any(a and b and abs(a - b) / max(a, b) <= 0.06
                   for a in got for b in nums)
    # a worded option: expect the distinguishing word to be repeated
    words = [w for w in re.findall(r'[A-Za-z]+', correct) if len(w) > 3]
    if not words:
        return True
    low = last_line.lower()
    return any(w.lower() in low for w in words)


def check_answers(content, questions):
    """
    Every question shipped must carry our own explanation of its answer.
    Highlighting the right option teaches nothing on its own, and it is easy
    to add a bench and forget the reasoning, which is exactly what happened
    to 2F the first time round.
    """
    warnings = []
    m = re.search(r"\n  answers: \{(.*?)\n  \},\n", content, re.S)
    block = m.group(1) if m else ''
    # allow any run of spaces after the colon, since these are aligned by hand
    equations = set(re.findall(r"\n    (\w+):\s*\{", content))
    for q in questions:
        key = "'%s'" % q['ref']
        if key not in block:
            warnings.append('%s (%s) has no answer explanation' % (q['ref'], q['code']))
            continue
        # each answer must say where its reasoning came from, and any equation
        # it cites has to be one this bench actually shows
        seg = block.split(key, 1)[1].split("\n    '", 1)[0]
        if 'source:' not in seg:
            warnings.append('%s (%s) does not say where its answer comes from' % (q['ref'], q['code']))
        # working must carry the numbers, not only the relationship. An
        # equation on its own is what the book already gives them; the value
        # is watching the figures go in and a result come out.
        wk = re.search(r"working: \[(.*?)\]", seg, re.S)
        if wk:
            lines = re.findall(r"'([^']*)'", wk.group(1))
            if len(lines) < 2:
                warnings.append('%s shows working in one line, with no substitution'
                                % q['ref'])
            elif not any(re.search(r"\d", l) for l in lines[1:]):
                warnings.append('%s shows working with no numbers in it' % q['ref'])

        # and the working has to arrive at the answer. Working that ends on a
        # different figure from the correct option is answering a different
        # question, which is how a diode question came to be worked for a
        # circuit that was not the one in its diagram.
        if wk:
            lines = re.findall(r"'([^']*)'", wk.group(1))
            if lines:
                if not lands_on(lines[-1], q.get('correct', '')):
                    warnings.append(
                        '%s: the working ends "%s" but the correct answer is "%s"'
                        % (q['ref'], lines[-1][:60], q.get('correct', '')[:40]))

        for eq in re.findall(r"eq: \[([^\]]*)\]", seg):
            for k in re.findall(r"'(\w+)'", eq):
                if k not in equations:
                    warnings.append('%s cites equation "%s", which this bench does not show'
                                    % (q['ref'], k))
    return warnings


def check_terms(content, codes):
    """
    A term must be defined in the section that first uses it, and not before
    it is needed. Reading order is the order of the items, so a word appearing
    in an earlier section than the one that introduces it is a failure.
    """
    warnings = []
    m = re.search(r"\n  terms: \{(.*?)\n  \},\n", content, re.S)
    if not m:
        return warnings
    terms = re.findall(r"\n    '([^']+)':", m.group(1))
    blocks = item_blocks(content)
    order = [c for c in codes if c in blocks]

    introduced_at = {}
    for i, code in enumerate(order):
        for t in re.findall(r"'([^']+)'", re.search(r"introduces: \{(.*?)\n      \}",
                            blocks[code], re.S).group(1)
                            if re.search(r"introduces: \{", blocks[code]) else ''):
            if t in terms:
                introduced_at.setdefault(t, i)

    for t in terms:
        if t not in introduced_at:
            warnings.append('term "%s" is defined but never introduced' % t)

    # Prose only. Longer terms are masked out before shorter ones are looked
    # for, otherwise "forward bias" counts as a use of "bias" and every
    # section that defines the longer phrase is reported for the shorter one.
    by_length = sorted(introduced_at, key=len, reverse=True)
    for i, code in enumerate(order):
        prose = ' '.join(re.findall(r"'([^']{40,})'", blocks[code]))
        for t in by_length:
            hit = re.search(r"\b%s\b" % re.escape(t), prose, re.I)
            prose = re.sub(r"\b%s\b" % re.escape(t), ' ', prose, flags=re.I)
            if hit and i < introduced_at[t]:
                warnings.append('%s uses "%s" before %s introduces it'
                                % (code, t, order[introduced_at[t]]))
    return warnings


def check_layouts(group):
    """
    Run the layout checker. A schematic with a dangling lead looks almost
    right, which is worse than looking wrong, and it is not something to be
    caught by eye.
    """
    src = ROOT / 'content' / (group + '.js')
    problems = []
    # check-layouts proves the circuit is joined up; check-flow proves it is
    # alive. A leg drawn with nothing moving in it reads as a broken circuit
    # rather than as a fact about the circuit, and the reader cannot tell
    # which we meant.
    for checker in ('check-layouts.js', 'check-flow.js'):
        try:
            r = subprocess.run(['node', str(ROOT / 'engine' / checker), str(src)],
                               capture_output=True, text=True, timeout=30)
        except Exception as exc:
            problems.append('could not run %s: %s' % (checker, exc))
            continue
        if r.returncode != 0:
            problems += [l.strip() for l in r.stdout.splitlines() if ':' in l]
    return problems


def check_parity(content, questions):
    """
    The features a finished bench is expected to have. Every one of these was
    present on some bench and absent on the next one, which is why they are
    checked rather than remembered.
    """
    warnings = []

    # every control says what it is
    controls = re.findall(r"\{ id: '(\w+)'[^}]*\}", content)
    described = re.findall(r"\{ id: '(\w+)'[^}]*desc:", content)
    for c in controls:
        if c not in described:
            warnings.append('control "%s" has no description' % c)

    # the bench introduces its vocabulary
    if '\n  terms: {' not in content:
        warnings.append('bench defines no terms')

    # it reads as something rather than a list of items
    for part in ('intro:', 'outro:'):
        if ('\n  %s' % part) not in content:
            warnings.append('bench has no %s' % part.rstrip(':'))
    if 'lead:' not in content:
        warnings.append('no item has a lead in sentence')
    if 'heading:' not in content:
        warnings.append('no item has a heading')

    # questions link back to the instrument. Not every question can: a good
    # many are asked in words. But a bench where none of them do has lost the
    # feature rather than had no use for it.
    seeds = len(re.findall(r"\n      seed: \{", content))
    if questions and seeds == 0:
        warnings.append('no question sets the bench to its own values, '
                        'so nothing links the questions to the instrument')

    # What was read before the bench was designed, and where each key message
    # from that reading is covered. Enumerating them is the discipline: it is
    # the difference between having read the chapter and having conveyed it.
    src = re.search(r"\n  sources: \{(.*?)\n  \},", content, re.S)
    if not src:
        warnings.append('bench records no sources: read the manuals and Exam '
                        'Secrets for every level it teaches before designing it')
    else:
        blocks = item_blocks(content)
        if 'read:' not in src.group(1):
            warnings.append('sources lists no reading')
        msgs = re.findall(r"\{ at: '(\w+)', level: '(\w+)'", src.group(1))
        if not msgs:
            warnings.append('sources lists no key messages from the reading')
        for code, lvl in msgs:
            if code not in blocks:
                warnings.append('key message points at %s, which is not an item' % code)
            elif ("'%s'" % lvl) not in (re.search(r"levels: \[([^\]]*)\]",
                                                  blocks[code]) or
                                        type('x', (), {'group': lambda *a: ''})()).group(1):
                warnings.append('key message for %s is filed under %s, which that '
                                'item does not teach' % (code, lvl))

    # On a bench whose controls are named after components, every panel with
    # an instrument must draw the circuit. Otherwise the reader meets sliders
    # called R1 and RE with nothing on screen those names refer to.
    if "circuitBased: true" in content:
        for code, block in item_blocks(content).items():
            if 'panel: null' in block:
                continue
            if re.search(r"noSchematic: true", block):
                warnings.append('%s hides its circuit on a bench whose controls '
                                'are named after components' % code)

    # A control that belongs to one level must say so, or it turns up at the
    # others doing nothing. An item whose panel changes by level is the case
    # this keeps getting wrong.
    for code, block in item_blocks(content).items():
        if 'toggle: {' not in block:
            continue
        per_level_panel = re.search(r"panel: \{", block)
        if per_level_panel and 'levels:' not in block.split('toggle: {', 1)[1][:400]:
            warnings.append('%s has a toggle with no levels, on an item whose panel '
                            'changes by level' % code)

    # Every level of every item needs a lead in: it is where the points from
    # the reading get made before the reader touches anything.
    for code, block in item_blocks(content).items():
        declared = re.search(r"levels: \[([^\]]*)\]", block)
        declared = re.findall(r"'(\w+)'", declared.group(1)) if declared else []
        lead = re.search(r"lead: \{(.*?)\n      \}", block, re.S)
        for lvl in declared:
            # whole word: "xfoundation:" contains "foundation:"
            if not lead or not re.search(r"\b%s:" % lvl, lead.group(1)):
                warnings.append('%s has no lead in at %s level' % (code, lvl))

    # working shown for the numeric ones
    # match the field, not the substring: "notworking:" contains "working:"
    if questions and not re.search(r"\n      working: \[", content):
        warnings.append('no answer shows its working')
    return warnings


def build(group):
    content_path = ROOT / 'content' / (group + '.js')
    if not content_path.exists():
        raise SystemExit('no content file for %s' % group)

    engine = '\n'.join(wrap(n, (ROOT / 'engine' / n).read_text(encoding='utf-8'))
                       for n in ENGINE)
    content = strip_module_exports(content_path.read_text(encoding='utf-8'))

    # the descriptions file is the record of our own item wording; check the
    # bench agrees with it rather than letting the two drift apart
    desc = json.loads((ROOT / 'content' / 'descriptions.json').read_text(encoding='utf-8'))['items']
    syllabus = {r['code']: r['levels'] for r in
                json.loads((ROOT / 'syllabus' / 'levels.json').read_text(encoding='utf-8'))}
    codes = re.findall(r"code: '([0-9A-Z]+)'", content)
    warnings = check_items(content, codes, desc, syllabus)

    questions, qnote = questions_for(group)
    if qnote:
        warnings.append(qnote)
    warnings += check_answers(content, questions)
    warnings += check_terms(content, codes)
    warnings += check_parity(content, questions)
    warnings += check_layouts(group)

    m = re.search(r"pageTitle: '([^']+)'", content) or re.search(r"title: '([^']+)'", content)
    title = m.group(1)
    html = TEMPLATE.read_text(encoding='utf-8')
    html = html.replace('{{TITLE}}', title)
    html = html.replace('{{ENGINE}}', engine)
    html = html.replace('{{CONTENT}}', content)
    html = html.replace('{{QUESTIONS}}',
                        'const QUESTIONS = ' + json.dumps(questions, ensure_ascii=False) + ';')

    OUT.mkdir(exist_ok=True)
    out = OUT / (group + '.html')
    out.write_text(html, encoding='utf-8')

    print('%s -> %s  (%d kB, %d items, %d questions)'
          % (group, out.relative_to(ROOT), len(html) // 1024, len(codes), len(questions)))
    for w in warnings:
        print('   warning: %s' % w)
    return not warnings


def write_index():
    """
    The landing page is the overview, copied to index.html so that the site
    root is something a reader can be sent to. Kept as one file so the two
    cannot drift apart.
    """
    src = ROOT / 'overview.html'
    if src.exists():
        (ROOT / 'index.html').write_text(
            src.read_text(encoding='utf-8'), encoding='utf-8')
        print('overview.html -> index.html')


def main():
    write_index()
    groups = sys.argv[1:] or [p.stem for p in (ROOT / 'content').glob('*.js')]
    ok = all(build(g) for g in groups)
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
