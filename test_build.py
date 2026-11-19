"""
test_build.py - the page and group handling in build.py.
Run: python test_build.py
"""
import json
import sys
from pathlib import Path

import build

passed = failed = 0


def check(label, got, want):
    global passed, failed
    ok = got == want
    if ok:
        passed += 1
    else:
        failed += 1
    print('  %s %-56s got %r  want %r' % ('ok  ' if ok else 'FAIL', label, got, want))


syllabus = {r['code']: r['levels'] for r in json.loads(
    (build.ROOT / 'syllabus' / 'levels.json').read_text(encoding='utf-8'))}

print('\ngroups')
check('a page without groups covers the group it is named after',
      build.groups_of("const BENCH = {\n  group: '2H',\n", '2H'), ['2H'])
check('a page with groups covers all of them',
      build.groups_of("const BENCH = {\n  group: '2A',\n  groups: ['2A', '2B', '2C'],\n", 'basics'),
      ['2A', '2B', '2C'])
check('an item-level groups key is not mistaken for the page one',
      build.groups_of("const BENCH = {\n    x: { groups: ['9Z'] },\n", '2H'), ['2H'])

print('\nquestions')
one, _ = build.questions_for('2H')
same, _ = build.questions_for(['2H'])
check('a single group name still works', len(one), len(same))
many, _ = build.questions_for(['2A', '2B', '2C'])
check('several groups bring in the questions of each',
      len(many), sum(len(build.questions_for([g])[0]) for g in ('2A', '2B', '2C')))
check('and only those', sorted({q['code'][:2] for q in many}) <= ['2A', '2B', '2C'], True)

print('\ncoverage')
check('a complete page has nothing missing',
      build.check_groups(['2H1', '2H2', '2H3', '2H4', '2H5'], ['2H'], syllabus), [])
check('an item left out of a group is reported',
      build.check_groups(['2A1', '2B1'], ['2A', '2B'], syllabus), ['2A2 is in group 2A but not on this page'])
check('an item from another group is reported',
      build.check_groups(['2H1', '2H2', '2H3', '2H4', '2H5', '2I1'], ['2H'], syllabus),
      ["2I1 is not in this page's groups (2H)"])

print('\nitem controls')
content = ("  controls: [\n    { id: 'V', label: 'V' },\n    { id: 'R', label: 'R' }\n  ],\n"
           "  items: [\n    {\n      code: '2A1',\n      controls: ['V', 'Q'],\n    },\n"
           "    {\n      code: '2A2',\n      controls: { foundation: ['R'], full: ['R', 'X'] },\n    }\n  ]")
check('a listed control the page does not define is reported',
      build.check_item_controls(content),
      ['2A1 lists control "Q", which the page does not define',
       '2A2 lists control "X", which the page does not define'])

print('\nexisting pages')
for page in ('2H', '2I', '2F'):
    text = (build.ROOT / 'content' / (page + '.js')).read_text(encoding='utf-8')
    codes = __import__('re').findall(r"code: '([0-9A-Z]+)'", text)
    check('%s covers its group exactly' % page,
          build.check_groups(codes, build.groups_of(text, page), syllabus), [])

print('\n%d passed, %d failed\n' % (passed, failed))
sys.exit(1 if failed else 0)
