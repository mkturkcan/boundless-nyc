# TAXI textures, drawn from scratch (no photo pixels): the cab liveries as side-projection sheets for the paint class,
# and the shared detail atlas (solid swatches with their metal / roughness, the roof sign panels).
#   python3 client/tools/ar34/vehicles/taxi/draw_tex.py
# Paint sheet layout (2048 x 2048): top half = the car's LEFT side (+X runtime, front at the sheet's left), bottom half =
# its RIGHT side (front at the sheet's right, so lettering reads forward on both), u = metres from the front bumper / L,
# v = height over the ground / SIDE_H inside each half. Row 0 of each half is the roof line (plain paint).
import json, math, os, sys
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'tex')
os.makedirs(OUT, exist_ok=True)
FONT_BOLD = next((f for f in ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf'] if os.path.exists(f)), None)
FONT_COND = next((f for f in ['/usr/share/fonts/truetype/liberation/LiberationSansNarrow-Bold.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf'] if os.path.exists(f)), FONT_BOLD)
SIDE_H = 2.1   # metres covered by each half (ground to above the roof)
YELLOW = (242, 183, 5)      # TLC taxi yellow as the fleet already paints it (sim/fleet24.js TAXI_YELLOW 0xf2b705)
GREEN = (136, 198, 62)      # Street Hail Livery apple green, sampled off refs (see notes); round 1 uses it only in the atlas
BLACK = (18, 18, 20)

def font(path, px):
    return ImageFont.truetype(path, max(6, int(px)))

def livery(spec, name, base):
    W = H = 2048
    im = Image.new('RGB', (W, H), base)
    d = ImageDraw.Draw(im)
    L = spec['L']
    pxm_u = W / L                 # px per metre along the car
    pxm_v = (H / 2) / SIDE_H      # px per metre up the car
    def X(m_from_front, side):    # side 0 = left (front at the left), 1 = right (front at the right)
        u = m_from_front / L
        return (u if side == 0 else 1 - u) * W
    def Y(h, side):
        return side * H / 2 + (1 - h / SIDE_H) * H / 2
    for side in (0, 1):
        for g in spec['graphics']:
            t = g['t']
            if t == 'disc_t':
                cx, cy, r = X(g['at'], side), Y(g['h'], side), g['dia'] / 2
                rx, ry = r * pxm_u, r * pxm_v
                d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=BLACK)
                # the T is the body colour showing through: top bar and stem down to the disc's edge
                bw, bh, sw, top = 0.52 * 2 * r, 0.20 * 2 * r, 0.185 * 2 * r, 0.26 * 2 * r
                yt = g['h'] + r - top
                d.rectangle([cx - bw / 2 * pxm_u, Y(yt, side), cx + bw / 2 * pxm_u, Y(yt - bh, side)], fill=base)
                # stem clipped by the circle: draw it long and re-mask outside the disc
                stem = Image.new('L', (W, H), 0)
                ImageDraw.Draw(stem).rectangle([cx - sw / 2 * pxm_u, Y(yt - bh + 0.01, side), cx + sw / 2 * pxm_u, Y(g['h'] - r - 0.05, side)], fill=255)
                disc = Image.new('L', (W, H), 0)
                ImageDraw.Draw(disc).ellipse([cx - rx + 1, cy - ry + 1, cx + rx - 1, cy + ry - 1], fill=255)
                from PIL import ImageChops
                m = ImageChops.multiply(stem, disc)
                im.paste(Image.new('RGB', (W, H), base), (0, 0), m)
            elif t == 'text':
                cap = g['cap']
                f = font(FONT_BOLD if not g.get('cond') else FONT_COND, cap * pxm_v / 0.72)
                # draw at the vertical scale, squeeze to the horizontal scale
                tw = int(d.textlength(g['s'], font=f)) + 8
                th = int(cap * pxm_v / 0.72 * 1.3) + 8
                tile = Image.new('L', (tw, th), 0)
                ImageDraw.Draw(tile).text((4, 4), g['s'], font=f, fill=255)
                sx = pxm_u / pxm_v
                tile = tile.resize((max(1, int(tw * sx)), th), Image.LANCZOS)
                cx, cy = X(g['at'], side), Y(g['h'], side)
                col = Image.new('RGB', tile.size, tuple(g.get('col', BLACK)))
                im.paste(col, (int(cx - tile.width / 2), int(cy - th / 2)), tile)
            elif t == 'icons':
                # the passenger-information column at the sliding door's front edge: small black discs with captions
                for k, cap in enumerate(g['caps']):
                    h = g['h'] - k * g['pitch']
                    cx, cy, r = X(g['at'], side), Y(h, side), g['dia'] / 2
                    d.ellipse([cx - r * pxm_u, cy - r * pxm_v, cx + r * pxm_u, cy + r * pxm_v], fill=BLACK)
                    # pictogram: a light glyph inside each disc (invented simple marks)
                    d.ellipse([cx - r * 0.35 * pxm_u, cy - r * 0.55 * pxm_v, cx + r * 0.35 * pxm_u, cy + r * 0.15 * pxm_v], fill=base)
                    f = font(FONT_BOLD, 0.011 * pxm_v / 0.72)
                    for j, line in enumerate(cap.split('|')):
                        tw = d.textlength(line, font=f)
                        d.text((cx - tw / 2, cy + r * pxm_v + 2 + j * 0.016 * pxm_v), line, font=f, fill=BLACK)
            elif t == 'box':
                a, b = X(g['z0'], side), X(g['z1'], side)
                d.rectangle([min(a, b), Y(g['h1'], side), max(a, b), Y(g['h0'], side)], fill=tuple(g['col']))
    im.save(os.path.join(OUT, name + '.png'))
    return im

# ---- NV200 (TLC medallion cab, 2013-): positions in metres from the front bumper of the built body (build_nv200.py
# prints its door spans: front door 1.34-2.51 m, sliding door 2.50-3.57 m, L 4.73 m). Graphics from the 2024 Commons
# photographs (NY-Taxi-Y204309C, Y200747C, Y204070C): T disc centred on the sliding door, "NYC" on the front door below
# the handle line, the medallion number under the rear quarter window, the information icons down the sliding door's
# front edge. No checker band on production cabs (only the 2012 show car carried one).
NV200 = {
    'L': 4.73,
    'graphics': [
        {'t': 'disc_t', 'at': 3.06, 'h': 0.66, 'dia': 0.60},
        {'t': 'text', 's': 'NYC', 'at': 1.98, 'h': 0.86, 'cap': 0.105},
        {'t': 'text', 's': '4K17', 'at': 3.92, 'h': 1.20, 'cap': 0.062},
        {'t': 'icons', 'at': 2.62, 'h': 1.08, 'pitch': 0.105, 'dia': 0.046, 'caps': ['INDUCTION|LOOP', 'METERED|FARE', 'FLAT FARE|JFK']},
    ],
}
livery(NV200, 'nv200_livery', YELLOW)

# ---- detail atlas (1024 x 1024): 16 x 16 swatch cells of 32 px in the top-left 512 x 512, metal / roughness in a
# second sheet (glTF: G = roughness, B = metalness); the roof sign panels below the swatches.
SW = [  # name, sRGB albedo, roughness, metalness
    ('trim_black', (22, 22, 24), 0.55, 0.0), ('gloss_black', (12, 12, 13), 0.22, 0.0), ('chrome', (235, 235, 238), 0.10, 1.0),
    ('tyre', (30, 30, 32), 0.86, 0.0), ('rim_silver', (190, 192, 196), 0.30, 1.0), ('steel_dark', (70, 72, 76), 0.45, 0.8),
    ('fabric', (46, 46, 48), 0.92, 0.0), ('plastic_grey', (78, 78, 82), 0.60, 0.0), ('leather_black', (24, 24, 26), 0.45, 0.0),
    ('partition', (40, 42, 46), 0.35, 0.3), ('white', (225, 225, 225), 0.45, 0.0), ('reflector_red', (150, 10, 10), 0.3, 0.0),
    ('sign_black', (14, 14, 15), 0.30, 0.0), ('mirror', (230, 232, 235), 0.04, 1.0), ('disc', (120, 118, 116), 0.40, 1.0),
    ('under', (28, 27, 26), 0.92, 0.0), ('grille', (18, 18, 19), 0.40, 0.2), ('rubber_seal', (14, 14, 14), 0.75, 0.0),
    ('steel_wheel', (34, 35, 37), 0.42, 0.6), ('hubcap', (160, 162, 166), 0.32, 0.9), ('step_alu', (150, 152, 156), 0.38, 1.0),
    ('dash', (32, 32, 34), 0.70, 0.0), ('screen', (8, 10, 14), 0.10, 0.0), ('yellow', YELLOW, 0.35, 0.0), ('green', GREEN, 0.35, 0.0),
    ('carpet', (36, 36, 38), 0.95, 0.0),
]
A = Image.new('RGB', (1024, 1024), (128, 128, 128))
M = Image.new('RGB', (1024, 1024), (255, 140, 0))
da, dm = ImageDraw.Draw(A), ImageDraw.Draw(M)
cells = {}
for i, (n, c, r, m) in enumerate(SW):
    cx, cy = (i % 16) * 32, (i // 16) * 32
    da.rectangle([cx, cy, cx + 31, cy + 31], fill=c)
    dm.rectangle([cx, cy, cx + 31, cy + 31], fill=(255, int(r * 255), int(m * 255)))
    cells[n] = [(cx + 16) / 1024, (cy + 16) / 1024]
# roof sign number panel (NV200 roof dome front / rear face): lit numerals on black, 512 x 128 at (0, 512)
def panel(x0, y0, w, h, text, fg, bg, cap_frac=0.62):
    da.rectangle([x0, y0, x0 + w - 1, y0 + h - 1], fill=bg)
    dm.rectangle([x0, y0, x0 + w - 1, y0 + h - 1], fill=(255, 90, 0))
    f = font(FONT_BOLD, h * cap_frac / 0.72)
    tw = da.textlength(text, font=f)
    da.text((x0 + (w - tw) / 2, y0 + h * 0.5 - h * cap_frac / 0.72 * 0.62), text, font=f, fill=fg)
    return [x0 / 1024, y0 / 1024, (x0 + w) / 1024, (y0 + h) / 1024]
regions = {}
regions['dome_num'] = panel(0, 512, 512, 128, '4K17', (238, 236, 228), (16, 16, 17))
# ad topper faces (two-sided billboard on the roof rack): an invented advertiser, 512 x 160 each
def topper(x0, y0, w, h, lines, bg, fg):
    da.rectangle([x0, y0, x0 + w - 1, y0 + h - 1], fill=bg)
    dm.rectangle([x0, y0, x0 + w - 1, y0 + h - 1], fill=(255, 60, 0))
    for k, (s, frac, col) in enumerate(lines):
        f = font(FONT_BOLD, h * frac / 0.72)
        tw = da.textlength(s, font=f)
        da.text((x0 + (w - tw) / 2, y0 + h * (0.12 + 0.42 * k)), s, font=f, fill=col)
    return [x0 / 1024, y0 / 1024, (x0 + w) / 1024, (y0 + h) / 1024]
regions['topper_a'] = topper(0, 656, 512, 160, [('KESTRELBOX', 0.24, (255, 255, 255)), ('STORAGE $1 FIRST MONTH', 0.13, (255, 214, 0))], (20, 70, 150), None)
regions['topper_b'] = topper(512, 656, 512, 160, [('MANGO SLICE', 0.24, (255, 255, 255)), ('PIZZA  OPEN LATE', 0.15, (255, 255, 255))], (190, 30, 40), None)
A.save(os.path.join(OUT, 'taxi_detail.png'))
M.save(os.path.join(OUT, 'taxi_detail_mr.png'))
json.dump({'cells': cells, 'regions': regions}, open(os.path.join(OUT, 'taxi_detail.json'), 'w'), indent=1)
print('wrote', OUT)
