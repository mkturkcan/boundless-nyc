# Re-cut the channel-letter outlines (public/fonts/ar33/o/*.json) from the fonts with fontTools: variable faces are
# instanced with fontTools' instancer (fontkit's getVariation misplaced points in some glyphs: Montserrat 600's B, P, R,
# A and G had spikes and a floating crossbar) and every glyph's overlapping contours are merged (skia-pathops), so the
# extruded letters triangulate cleanly. Keeps each file's metrics, kerning and names; rewrites glyphs' o / ha / x_min /
# x_max. Run:
#   uv run --no-project --with fonttools --with skia-pathops python boundlessjs/tools/ar33/signs/fix_outlines.py [Key-tag ...]
# (the font map comes from fonts.mjs through node: `node -e` below).
import json, os, subprocess, sys
from fontTools.ttLib import TTFont
from fontTools.pens.basePen import BasePen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.varLib import instancer
from fontTools.ttLib.removeOverlaps import removeOverlaps

HERE = os.path.dirname(os.path.abspath(__file__))
FD = os.path.normpath(os.path.join(HERE, '..', '..', '..', 'public', 'fonts', 'ar33'))
OD = os.path.join(FD, 'o')
MAP_JS = """import('./fonts.mjs').then(({ FAMILIES }) => { const out = [];
  for (const F of FAMILIES) { const e = [];
    if (F.files) for (const [tag, file] of Object.entries(F.files)) e.push([tag, file, null]);
    else for (const w of F.w) e.push([String(w), F.file, F.v ? { ...F.v, ...(F.v.wght ? { wght: w } : {}) } : null]);
    if (F.italic) for (const w of F.w) e.push([w + 'i', F.italic, { wght: w }]);
    for (const [tag, file, axes] of e) out.push({ json: F.key + '-' + tag + '.json', file, axes }); }
  process.stdout.write(JSON.stringify(out)); });"""

class OPen(BasePen):
    # three typeface 'o' strings: m x y / l x y / q x y cpx cpy / b x y c1x c1y c2x c2y (end point first)
    def __init__(self, gs):
        super().__init__(gs); self.o = []
    def _moveTo(self, p): self.o += ['m', r(p[0]), r(p[1])]
    def _lineTo(self, p): self.o += ['l', r(p[0]), r(p[1])]
    def _qCurveToOne(self, p1, p2): self.o += ['q', r(p2[0]), r(p2[1]), r(p1[0]), r(p1[1])]
    def _curveToOne(self, p1, p2, p3): self.o += ['b', r(p3[0]), r(p3[1]), r(p1[0]), r(p1[1]), r(p2[0]), r(p2[1])]
    def _closePath(self): pass
    def _endPath(self): pass

def r(v):
    v = round(v * 10) / 10
    return str(int(v)) if v == int(v) else str(v)

def main():
    want = set(sys.argv[1:])
    fmap = json.loads(subprocess.run(['node', '-e', MAP_JS], cwd=HERE, capture_output=True, text=True, check=True).stdout)
    cache = {}
    n = 0
    for e in fmap:
        key = e['json'][:-5]
        if want and key not in want: continue
        jp = os.path.join(OD, e['json'])
        if not os.path.exists(jp): print('skip (no json)', e['json']); continue
        J = json.load(open(jp, encoding='utf8'))
        axes = {k: v for k, v in (e['axes'] or {}).items() if not isinstance(v, list)}
        ck = (e['file'], json.dumps(axes, sort_keys=True))
        if ck not in cache:
            f = TTFont(os.path.join(FD, e['file']))
            if 'fvar' in f:
                full = {a.axisTag: a.defaultValue for a in f['fvar'].axes}
                full.update({k: v for k, v in axes.items() if k in full})
                f = instancer.instantiateVariableFont(f, full, inplace=False, overlap=instancer.OverlapMode.REMOVE)
            else:
                try: removeOverlaps(f)
                except Exception as ex: print('  overlaps kept', e['file'], ex)
            cache[ck] = f
        f = cache[ck]
        gs = f.getGlyphSet(); cmap = f.getBestCmap(); hmtx = f['hmtx']
        changed = 0
        for ch, g in J['glyphs'].items():
            gn = cmap.get(ord(ch))
            if gn is None or gn not in gs: continue
            p = OPen(gs); gs[gn].draw(p)
            b = BoundsPen(gs); gs[gn].draw(b)
            o = ' '.join(map(str, p.o))
            if o != g.get('o'): changed += 1
            g['o'] = o
            g['ha'] = int(round(hmtx[gn][0]))
            if b.bounds: g['x_min'] = int(round(b.bounds[0])); g['x_max'] = int(round(b.bounds[2]))
        json.dump(J, open(jp, 'w', encoding='utf8'), separators=(',', ':'), ensure_ascii=False)
        n += 1
        print(f"{e['json']}: {changed} glyphs re-cut ({e['file']} {axes or 'static'})")
    print('files', n)

main()
