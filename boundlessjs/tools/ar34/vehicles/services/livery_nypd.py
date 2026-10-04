# NYPD patrol livery for the Ford Police Interceptor Utility (2020-), drawn from scratch (no copied insignia files).
#   python livery_nypd.py            -> tex/nypd_livery.png (2048 x 2048), tex/svc_swatch.png (256 x 256)
# Layout (shared with build_nypd.py; UV v up from the image bottom):
#   left side   v 0.55..1.00  y 0..1.8 m,  u = (L/2 - z) / L   (viewer at +X: the front is on the left)
#   right side  v 0.10..0.55  y 0..1.8 m,  u = (z + L/2) / L   (viewer at -X: the front is on the right)
#   hood        u 0.00..0.50  v 0.00..0.10, x across, z 2.00..2.53 m (text reads from the front)
#   tailgate    u 0.50..1.00  v 0.00..0.10, x across, y 0.80..1.30 m (text reads from behind)
# Livery after Wikimedia Commons photographs of 2020-2024 NYPD PIUs (docs/notes/ar34-veh-services.md "References"):
# a medium-blue band under the side glass from the headlamp to the tail lamp ("POLICE" in white on the front fender),
# a second band along both doors, "NYPD" in heavy italic capitals on the front door, the three-line courtesy motto on the
# rear door (red initials), the unit number and precinct on the rear quarter, "NYPD POLICE" on the hood and the tailgate.
import os, sys
def smooth_(t):
    t = 0 if t < 0 else 1 if t > 1 else t
    return t * t * (3 - 2 * t)
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'tex')
L = 5.05
S = 2048
F_SERIF_BI = '/usr/share/fonts/opentype/urw-base35/C059-BdIta.otf'
F_SANS_BI = '/usr/share/fonts/opentype/urw-base35/NimbusSans-BoldItalic.otf'
WHITE = (246, 246, 244)
BLUE = (28, 86, 200)        # the stripe / lettering blue (sRGB), sampled look of the refs' daylight stripes
NAVY = (20, 42, 110)
RED = (196, 30, 38)

img = Image.new('RGB', (S, S), WHITE)
g = ImageDraw.Draw(img)

def side_px(z, y, side):
    """metres on the car's side -> pixel (x right, y down)"""
    u = (L / 2 - z) / L if side == 'L' else (z + L / 2) / L
    v0 = 0.55 if side == 'L' else 0.10
    v = v0 + 0.45 * (y / 1.8)
    return u * S, (1 - v) * S

PX_M_U = S / L                 # px per metre along the car
PX_M_V = 0.45 * S / 1.8        # px per metre up the car

def band(side, z0, z1, y0, y1, col):
    a = side_px(z0, y1, side); b = side_px(z1, y0, side)
    g.rectangle([min(a[0], b[0]), min(a[1], b[1]), max(a[0], b[0]), max(a[1], b[1])], fill=col)

def text_side(side, s, z, y, cap_m, font, col, anchor='ms', stretch=1.0):
    """text whose baseline-centre sits at (z, y) on the side; drawn on its own layer, scaled to the side's
    anisotropic pixel grid (px/m differ along and up the car)"""
    size = int(cap_m * PX_M_V / 0.70)
    f = ImageFont.truetype(font, size)
    bb = g.textbbox((0, 0), s, font=f, anchor='ls')
    w, h = bb[2] - bb[0] + 8, size * 2
    lay = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(lay).text((4 - bb[0], int(size * 1.4)), s, font=f, fill=col + (255,), anchor='ls')
    sx = PX_M_U / PX_M_V * stretch
    lay = lay.resize((max(1, int(w * sx)), h), Image.LANCZOS)
    cx, cy = side_px(z, y, side)
    ox = cx - lay.width / 2 if anchor == 'ms' else (cx if anchor == 'ls' else cx - lay.width)
    img.paste(lay, (int(ox), int(cy - size * 1.4)), lay)

# estimated (not a rectified measurement) from the 108 Pct side photograph against its 0.763 m tyre: upper band 1.11-1.17 m (1.10-1.21 on
# the front fender, where it carries POLICE), lower band 0.62-0.68 m between the wheel arches
sys.path.insert(0, HERE)
from nypd_shape import crease_of

def band_follow(side, z0, z1, below, height, col, n=60):
    """a band whose top edge runs `below` m under the shoulder crease (the side face ends there), `height` tall"""
    top = [side_px(z0 + (z1 - z0) * k / n, crease_of(z0 + (z1 - z0) * k / n) - below, side) for k in range(n + 1)]
    bot = [side_px(z0 + (z1 - z0) * k / n, crease_of(z0 + (z1 - z0) * k / n) - below - height(z0 + (z1 - z0) * k / n), side) for k in range(n + 1)]
    g.polygon(top + bot[::-1], fill=col)

for side in 'LR':
    # upper band under the shoulder crease from the headlamp to the tail lamp, taller on the front fender (POLICE)
    band_follow(side, -2.36, 2.30, 0.012, lambda z: 0.055 + 0.035 * smooth_((z - 1.20) / 0.25) * (1 - smooth_((z - 2.12) / 0.18)), BLUE)
    text_side(side, 'POLICE', 1.70, crease_of(1.70) - 0.087, 0.062, F_SERIF_BI, WHITE)
    # lower band along both doors, arch to arch
    band(side, -0.98, 1.10, 0.62, 0.68, BLUE)
    # NYPD on the front door (centre z 0.40, cap 0.23 m)
    text_side(side, 'NYPD', 0.42, 0.79, 0.235, F_SERIF_BI, BLUE, stretch=1.05)
    # courtesy motto on the rear door: red initials, blue words
    zc = -0.92
    for k, (ini, rest) in enumerate([('C', 'OURTESY'), ('P', 'ROFESSIONALISM'), ('R', 'ESPECT')]):
        y = 0.99 - k * 0.075
        # the block starts at the rear door's front edge on the left side (text runs rearward) and near its rear
        # edge on the right side (text runs forward), so it stays clear of NYPD on both
        z0 = zc + 0.22 if side == 'L' else zc - 0.40
        text_side(side, ini, z0, y, 0.07, F_SANS_BI, RED, anchor='ls')
        text_side(side, rest, (z0 - 0.062) if side == 'L' else (z0 + 0.062), y, 0.036, F_SANS_BI, BLUE, anchor='ls')
    # unit number and precinct in a gap of the band on the rear quarter (invented numbers), blue on white
    zg0, zg1 = -2.30, -1.62
    band_follow(side, zg0, zg1, 0.006, lambda z: 0.07, WHITE)
    text_side(side, '5126', -1.80 if side == 'L' else -2.12, crease_of(-1.95) - 0.062, 0.05, F_SANS_BI, BLUE)
    text_side(side, '28 PCT', -2.12 if side == 'L' else -1.80, crease_of(-1.95) - 0.062, 0.05, F_SANS_BI, BLUE)
    # the department patch on the front fender behind the arch: a shield in navy and gold, drawn plain
    cx, cy = side_px(1.08, 0.84, side)
    w, h = 0.10 * PX_M_U, 0.15 * PX_M_V
    pts = [(cx - w / 2, cy - h / 2), (cx + w / 2, cy - h / 2), (cx + w / 2, cy + h * 0.15), (cx, cy + h / 2), (cx - w / 2, cy + h * 0.15)]
    g.polygon(pts, fill=NAVY)
    s2 = [(cx + (x - cx) * 0.78, cy + (y - cy) * 0.80 - h * 0.02) for x, y in pts]
    g.polygon(s2, fill=(200, 160, 60))
    s3 = [(cx + (x - cx) * 0.60, cy + (y - cy) * 0.62 - h * 0.03) for x, y in pts]
    g.polygon(s3, fill=(36, 70, 150))

# hood: "NYPD POLICE" near the front edge, reading from the front
def hood_px(x, z):
    u = 0.5 * (x + 1.0) / 2.0
    v = 0.10 * (2.53 - z) / 0.53
    return u * S, (1 - v) * S
f = ImageFont.truetype(F_SERIF_BI, 96)
lay = Image.new('RGBA', (1100, 160), (0, 0, 0, 0))
ImageDraw.Draw(lay).text((550, 120), 'NYPD POLICE', font=f, fill=BLUE + (255,), anchor='ms')
# hood band: x -0.62..0.62 m (1024 px over 2.0 m), text cap ~0.09 m: v scale 0.1*2048/0.53 = 386 px/m
lay = lay.resize((int(1.24 * 512), int(160 * 0.5)), Image.LANCZOS)
cx, cy = hood_px(0.0, 2.30)
img.paste(lay, (int(cx - lay.width / 2), int(cy - lay.height / 2)), lay)

# tailgate: "NYPD POLICE" at y ~1.0 m, reading from behind
def tail_px(x, y):
    u = 0.5 + 0.5 * (1.0 - x) / 2.0
    v = 0.10 * (y - 0.80) / 0.50
    return u * S, (1 - v) * S
lay = Image.new('RGBA', (1100, 160), (0, 0, 0, 0))
ImageDraw.Draw(lay).text((550, 120), 'NYPD POLICE', font=f, fill=BLUE + (255,), anchor='ms')
lay = lay.resize((int(1.15 * 512), int(160 * 0.62)), Image.LANCZOS)
cx, cy = tail_px(0.0, 1.0)
img.paste(lay, (int(cx - lay.width / 2), int(cy - lay.height / 2)), lay)

os.makedirs(OUT, exist_ok=True)
img.save(os.path.join(OUT, 'nypd_livery.png'))

# swatch atlas for the detail parts (the runtime multiplies a detail material's map by white): 8 x 8 cells of 32 px
SW = [
    (18, 18, 20),     # 0 black plastic trim
    (24, 24, 26),     # 1 tyre rubber
    (200, 202, 205),  # 2 chrome / polished
    (40, 40, 42),     # 3 interior dark grey
    (58, 58, 60),     # 4 seat fabric
    (12, 12, 13),     # 5 gloss black (steel wheels, light-bar base)
    (110, 112, 115),  # 6 brake disc / bare steel
    (250, 250, 248),  # 7 plate white
    (28, 86, 200),    # 8 livery blue
    (196, 30, 38),    # 9 red
    (70, 72, 76),     # 10 grille mid grey
    (150, 152, 150),  # 11 interior light grey (partition frame)
]
sw = Image.new('RGB', (256, 256), (128, 128, 128))
d2 = ImageDraw.Draw(sw)
for i, c in enumerate(SW):
    x, y = (i % 8) * 32, (i // 8) * 32
    d2.rectangle([x, y, x + 31, y + 31], fill=c)
sw.save(os.path.join(OUT, 'svc_swatch.png'))
print('wrote', os.path.join(OUT, 'nypd_livery.png'), os.path.join(OUT, 'svc_swatch.png'))
