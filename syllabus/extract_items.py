"""
extract_items.py - turn the RSGB combined syllabus PDF into per-level item data.

The specification is a landscape three-column table: Foundation, Intermediate and
Full side by side, with the item code in a narrow gutter on the left. Flattened
text extraction interleaves the columns and silently attributes a learning point
to the wrong level, so this reads the text with coordinates and assigns each
fragment to a column by its x position.

Output: items.json  [{code, section, group, group_title, foundation,
                      intermediate, full, levels}]
"""
import json
import re
import sys
import pypdf

PDF = '260305_Syllabus_2024_v1.6b.pdf'
OUT = 'items.json'

# Column bands, from the measured geometry of the v1.6b table (page width 841.8).
# Body text sits at x ~ 80 / 318 / 559; the code gutter is x < 70.
GUTTER_MAX = 70
BANDS = [('foundation', 70, 310), ('intermediate', 310, 552), ('full', 552, 842)]

HEADER_Y = 500          # column headings and part title sit above this
FOOTER_Y = 50           # running footer sits below this

CODE_RE = re.compile(r'^(\d{1,2})([A-Z])(\d{1,2})$')
SECTION_TITLES = {
    '1': 'Licensing', '2': 'Technical aspects', '3': 'Transmitters and receivers',
    '4': 'Feeders and antennas', '5': 'Propagation', '6': 'EMC',
    '7': 'Operating practices and procedures', '8': 'Safety',
    '9': 'Measurements and construction',
}


def page_fragments(page):
    """Every non-empty text run on the page as (y, x, text)."""
    out = []

    def visit(text, cm, tm, font_dict, font_size):
        if text.strip():
            out.append((round(tm[5], 1), round(tm[4], 1), text.strip()))

    page.extract_text(visitor_text=visit)
    return out


def band_of(x):
    for name, lo, hi in BANDS:
        if lo <= x < hi:
            return name
    return None


def join(fragments):
    """Fragments -> text, reading order, stitching mid-word splits."""
    fragments.sort(key=lambda f: (-f[0], f[1]))
    lines, cur_y, buf = [], None, []
    for y, x, t in fragments:
        if cur_y is None or abs(y - cur_y) > 4:
            if buf:
                lines.append(''.join(buf))
            buf, cur_y = [t], y
        else:
            # same visual line: superscripts and stray glyphs butt straight on
            buf.append(t if t in '-.,' or (buf and buf[-1][-1:] in '-') else ' ' + t)
    if buf:
        lines.append(''.join(buf))
    text = ' '.join(lines)
    text = re.sub(r'\s+', ' ', text)
    text = re.sub(r'\s*-\s*versa', '-versa', text)
    return text.strip()


def main():
    reader = pypdf.PdfReader(PDF)
    items = []           # ordered list of dicts
    by_code = {}
    group_titles = {}
    current = None       # item currently being filled, for page-spanning content

    for pno, page in enumerate(reader.pages):
        frags = [f for f in page_fragments(page) if FOOTER_Y < f[0] < HEADER_Y]
        if not frags:
            continue

        codes = sorted(
            [f for f in frags if f[1] < GUTTER_MAX and CODE_RE.match(f[2])],
            key=lambda f: -f[0])
        body = [f for f in frags if f[1] >= GUTTER_MAX]
        if not codes and current is None:
            continue

        # A group heading sits in the gutter-to-body area with no code; capture it
        # so each item knows which thread it belongs to.
        for y, x, t in frags:
            if x < 200 and not CODE_RE.match(t) and len(t) > 8 and \
                    (codes and y > codes[0][0]) and not t[0].isdigit():
                group_titles.setdefault(pno, t)

        # Split the page vertically: each code owns everything down to the next.
        bounds = []
        for i, (y, x, code) in enumerate(codes):
            top = y + 8
            bot = codes[i + 1][0] + 8 if i + 1 < len(codes) else FOOTER_Y
            bounds.append((code, top, bot))

        # Body text above the first code continues the item from the previous page.
        if current is not None:
            top_edge = bounds[0][1] if bounds else HEADER_Y
            carried = [f for f in body if f[0] >= top_edge]
            for name, lo, hi in BANDS:
                part = join([f for f in carried if lo <= f[1] < hi])
                if part:
                    current[name] = (current[name] + ' ' + part).strip()

        for code, top, bot in bounds:
            m = CODE_RE.match(code)
            section, group_letter = m.group(1), m.group(2)
            rec = by_code.get(code)
            if rec is None:
                rec = {
                    'code': code,
                    'section': section,
                    'section_title': SECTION_TITLES.get(section, '?'),
                    'group': section + group_letter,
                    'group_title': group_titles.get(pno, ''),
                    'foundation': '', 'intermediate': '', 'full': '',
                }
                by_code[code] = rec
                items.append(rec)
            cell = [f for f in body if bot <= f[0] < top]
            for name, lo, hi in BANDS:
                part = join([f for f in cell if lo <= f[1] < hi])
                if part:
                    rec[name] = (rec[name] + ' ' + part).strip()
            current = rec

    for rec in items:
        rec['levels'] = [n for n in ('foundation', 'intermediate', 'full') if rec[n]]

    # Group titles only get captured on the page where a thread starts; fill forward.
    last = {}
    for rec in items:
        if rec['group_title']:
            last[rec['group']] = rec['group_title']
        elif rec['group'] in last:
            rec['group_title'] = last[rec['group']]

    json.dump(items, open(OUT, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)

    tech = [r for r in items if r['section'] in '23459']
    print(f'{len(items)} items -> {OUT}   ({len(tech)} in technical sections)')
    for lvl in ('foundation', 'intermediate', 'full'):
        n = sum(1 for r in items if r[lvl])
        nt = sum(1 for r in tech if r[lvl])
        print(f'  {lvl:<13} {n:>4} items   ({nt} technical)')
    only = {}
    for r in items:
        only[tuple(r['levels'])] = only.get(tuple(r['levels']), 0) + 1
    print('  level combinations:')
    for k, v in sorted(only.items(), key=lambda kv: -kv[1]):
        print('   ', '+'.join(k) or '(empty)', v)


if __name__ == '__main__':
    main()
