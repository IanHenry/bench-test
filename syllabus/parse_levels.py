"""
parse_levels.py - authoritative per-level syllabus items.

The combined specification is a three-column landscape table, and column
attribution from a PDF is fragile: group headings sit in the left margin and get
read as Foundation content, which silently invents learning points at a level
that does not teach them. The standalone per-level documents are single column,
so each one says without ambiguity what that level examines.

Source: 220901_Syllabus_2019_<level>_only_v1.5.pdf  (Sept 2022)
Cross-check: 260305_Syllabus_2024_v1.6b.pdf         (Mar 2026, current)

Output: items_by_level.json
        [{code, section, section_title, group, group_title,
          foundation, intermediate, full, levels}]
"""
import json
import re
import sys

LEVELS = ('foundation', 'intermediate', 'full')
SECTION_TITLES = {
    '1': 'Licensing', '2': 'Technical aspects', '3': 'Transmitters and receivers',
    '4': 'Feeders and antennas', '5': 'Propagation', '6': 'EMC',
    '7': 'Operating practices and procedures', '8': 'Safety',
    '9': 'Measurements and construction',
}
TECHNICAL = set('23459')

# A code introduces an item only when a sentence starts right after it.
CODE_SPLIT = re.compile(r'\b(\d{1,2}[A-Z]\d{1,2})\s+(?=[A-Z(])')
NOISE = re.compile(r'(Syllabus 201[89].*?Page [\d.]+|Amateur radio syllabus.*?V\d[\d.]*|'
                   r'Page \d+ of \d+|^\s*\d+\s*$)', re.M)


def clean(s):
    s = NOISE.sub(' ', s)
    s = s.replace(' ', ' ')
    s = re.sub(r'\s+', ' ', s)
    return s.strip()


def split_heading(text):
    """Trailing group heading -> (item_text, heading_for_next_item)."""
    m = re.search(r'\.\s+([A-Z][^.]{4,58})\s*$', text)
    if m and not m.group(1).rstrip().endswith('.'):
        head = m.group(1).strip()
        # a heading is a title, not a sentence: no verb-ish trailing punctuation
        if len(head.split()) <= 8:
            return text[:m.start() + 1].strip(), head
    return text.strip(), None


def parse_level(path):
    text = clean(open(path, encoding='utf-8').read())
    parts = CODE_SPLIT.split(text)
    out, heading = {}, None
    # parts = [preamble, code, body, code, body, ...]
    pending = None
    for i in range(1, len(parts), 2):
        code, body = parts[i], parts[i + 1]
        body, next_head = split_heading(body)
        if pending:
            out[pending[0]] = (pending[1], pending[2])
        pending = (code, body, heading)
        heading = next_head
    if pending:
        out[pending[0]] = (pending[1], pending[2])
    return out


def main():
    per = {lvl: parse_level(f'level_{lvl.capitalize()}.txt') for lvl in LEVELS}

    codes = sorted(set().union(*[set(p) for p in per.values()]),
                   key=lambda c: (int(re.match(r'(\d+)', c).group(1)),
                                  re.match(r'\d+([A-Z])', c).group(1),
                                  int(re.match(r'\d+[A-Z](\d+)', c).group(1))))

    items = []
    for code in codes:
        sec = re.match(r'(\d+)', code).group(1)
        grp = re.match(r'(\d+[A-Z])', code).group(1)
        title = ''
        for lvl in LEVELS:
            if code in per[lvl] and per[lvl][code][1]:
                title = per[lvl][code][1]
                break
        rec = {
            'code': code, 'section': sec,
            'section_title': SECTION_TITLES.get(sec, '?'),
            'group': grp, 'group_title': title,
            'technical': sec in TECHNICAL,
        }
        for lvl in LEVELS:
            rec[lvl] = per[lvl][code][0] if code in per[lvl] else ''
        rec['levels'] = [l for l in LEVELS if rec[l]]
        items.append(rec)

    # fill group titles forward within a group
    last = {}
    for r in items:
        if r['group_title']:
            last[r['group']] = r['group_title']
        elif r['group'] in last:
            r['group_title'] = last[r['group']]

    # currency check against the current combined specification
    cur = open('syllabus_2024_v1.6b.txt', encoding='utf-8').read()
    cur_codes = set(re.findall(r'(?:^|\s)(\d{1,2}[A-Z]\d{1,2})(?=\s)', cur))
    ours = {r['code'] for r in items}
    for r in items:
        r['in_v1_6b'] = r['code'] in cur_codes

    json.dump(items, open('items_by_level.json', 'w', encoding='utf-8'),
              indent=1, ensure_ascii=False)

    tech = [r for r in items if r['technical']]
    print(f'{len(items)} items -> items_by_level.json  ({len(tech)} technical)')
    for lvl in LEVELS:
        print(f'  {lvl:<13} {sum(1 for r in items if r[lvl]):>4} total   '
              f'{sum(1 for r in tech if r[lvl]):>4} technical')
    combos = {}
    for r in items:
        combos[tuple(r['levels'])] = combos.get(tuple(r['levels']), 0) + 1
    print('  level ladders:')
    for k, v in sorted(combos.items(), key=lambda kv: -kv[1]):
        print(f"    {'+'.join(x[0].upper() for x in k) or '(none)':<8} {v}")
    print(f"  dropped since v1.5: {sorted(ours - cur_codes)}")
    print(f"  new in v1.6b:       {sorted(cur_codes - ours)}")


if __name__ == '__main__':
    main()
