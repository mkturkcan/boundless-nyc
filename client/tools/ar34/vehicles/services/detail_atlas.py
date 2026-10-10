# Detail atlas shared by the SERVICES vehicles: tex/svc_detail.png (1024 x 1024, 4 x 4 cells of 256 px), drawn from
# scratch. The runtime multiplies a detail material's map by white (sim/fleet24.js runtimeMaterial), so every colour of a
# detail part lives here or in tex/svc_swatch.png.
#   cell 0  PIU grille: black hexagonal mesh over a dark cavity, the blue oval badge in the middle
#   cell 1  NYPD RMP number plate (white, blue numbers, the small model-year digits), invented number
#   cell 2  steel-wheel face (black dish, the ring of vent holes, the lug circle)
#   cell 3  tyre sidewall (dark rubber with a faint lettering band)
#   cell 4  FDNY ambulance / engine plate (NY "official" style, invented)
#   cell 5  diamond plate (aluminium tread plate)
#   cell 6  compartment roll-up door (aluminium slats)
#   cell 7  pump-panel gauges (black dials on brushed aluminium)
import os, math
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'tex')
C = 256
img = Image.new('RGB', (C * 4, C * 4), (40, 40, 42))
g = ImageDraw.Draw(img)
F_SANS_B = '/usr/share/fonts/opentype/urw-base35/NimbusSans-Bold.otf'

def cell(i):
    return (i % 4) * C, (i // 4) * C

# 0 grille mesh
x0, y0 = cell(0)
g.rectangle([x0, y0, x0 + C - 1, y0 + C - 1], fill=(8, 8, 9))
r = 7.0
for row in range(-1, int(C / (r * 1.5)) + 2):
    for col in range(-1, int(C / (r * 1.732)) + 2):
        cx = x0 + col * r * 1.732 + (r * 0.866 if row % 2 else 0)
        cy = y0 + row * r * 1.5
        pts = [(cx + r * 0.78 * math.cos(math.pi / 6 + k * math.pi / 3), cy + r * 0.78 * math.sin(math.pi / 6 + k * math.pi / 3)) for k in range(6)]
        g.polygon(pts, fill=(2, 2, 2), outline=(34, 34, 36))
g.rectangle([x0, y0, x0 + C - 1, y0 + C - 1], outline=(20, 20, 22), width=3)
g.ellipse([x0 + C / 2 - 26, y0 + C / 2 - 12, x0 + C / 2 + 26, y0 + C / 2 + 12], fill=(20, 52, 120), outline=(190, 190, 195), width=2)

# 1 NYPD number plate (white, blue digits; the department's own vehicle numbers)
x0, y0 = cell(1)
g.rectangle([x0, y0, x0 + C - 1, y0 + C - 1], fill=(235, 235, 232))
g.rectangle([x0 + 3, y0 + 3, x0 + C - 4, y0 + C - 4], outline=(60, 60, 64), width=3)
f = ImageFont.truetype(F_SANS_B, 118)
g.text((x0 + 108, y0 + C / 2 + 6), '5126', font=f, fill=(30, 70, 170), anchor='mm')
f2 = ImageFont.truetype(F_SANS_B, 52)
g.text((x0 + 222, y0 + C / 2 + 38), '21', font=f2, fill=(30, 70, 170), anchor='mm')

# 2 steel wheel face
x0, y0 = cell(2)
cx, cy = x0 + C / 2, y0 + C / 2
g.rectangle([x0, y0, x0 + C - 1, y0 + C - 1], fill=(10, 10, 11))
g.ellipse([cx - 124, cy - 124, cx + 124, cy + 124], fill=(16, 16, 18))
g.ellipse([cx - 100, cy - 100, cx + 100, cy + 100], fill=(20, 20, 22))
for k in range(8):
    a = 2 * math.pi * k / 8
    hx, hy = cx + 76 * math.cos(a), cy + 76 * math.sin(a)
    g.ellipse([hx - 14, hy - 10, hx + 14, hy + 10], fill=(2, 2, 2))
for k in range(6):
    a = 2 * math.pi * k / 6 + 0.3
    hx, hy = cx + 42 * math.cos(a), cy + 42 * math.sin(a)
    g.ellipse([hx - 7, hy - 7, hx + 7, hy + 7], fill=(120, 120, 122))

# 3 tyre sidewall
x0, y0 = cell(3)
g.rectangle([x0, y0, x0 + C - 1, y0 + C - 1], fill=(22, 22, 24))
for k in range(0, C, 9):
    g.line([x0 + k, y0 + 100, x0 + k + 4, y0 + 100], fill=(34, 34, 36), width=3)

# 4 FDNY plate (white, black legend, invented number)
x0, y0 = cell(4)
g.rectangle([x0, y0, x0 + C - 1, y0 + C - 1], fill=(236, 236, 232))
g.rectangle([x0 + 3, y0 + 3, x0 + C - 4, y0 + C - 4], outline=(40, 40, 44), width=3)
g.text((x0 + C / 2, y0 + 40), 'NEW YORK', font=ImageFont.truetype(F_SANS_B, 30), fill=(20, 30, 90), anchor='mm')
g.text((x0 + C / 2, y0 + C / 2 + 10), '24-117', font=ImageFont.truetype(F_SANS_B, 84), fill=(20, 20, 24), anchor='mm')
g.text((x0 + C / 2, y0 + C - 36), 'OFFICIAL', font=ImageFont.truetype(F_SANS_B, 30), fill=(20, 30, 90), anchor='mm')

# 5 diamond plate
x0, y0 = cell(5)
g.rectangle([x0, y0, x0 + C - 1, y0 + C - 1], fill=(170, 172, 176))
for row in range(0, C, 16):
    for col in range(0, C, 16):
        ox = 8 if (row // 16) % 2 else 0
        px, py = x0 + col + ox, y0 + row
        g.line([px - 5, py + 5, px + 5, py - 5], fill=(215, 217, 220), width=4)

# 6 roll-up door slats
x0, y0 = cell(6)
g.rectangle([x0, y0, x0 + C - 1, y0 + C - 1], fill=(182, 184, 188))
for k in range(0, C, 12):
    g.line([x0, y0 + k, x0 + C, y0 + k], fill=(120, 122, 126), width=2)
g.rectangle([x0 + 100, y0 + C - 30, x0 + 156, y0 + C - 14], fill=(60, 60, 64))

# 7 pump-panel gauges
x0, y0 = cell(7)
g.rectangle([x0, y0, x0 + C - 1, y0 + C - 1], fill=(176, 178, 182))
for k in range(0, C, 3):
    g.line([x0 + k, y0, x0 + k, y0 + C], fill=(168, 170, 174) if k % 2 else (184, 186, 190), width=1)
for (gx, gy, rr) in ((60, 60, 34), (140, 60, 34), (210, 60, 26), (60, 150, 24), (120, 150, 24), (180, 150, 24)):
    g.ellipse([x0 + gx - rr, y0 + gy - rr, x0 + gx + rr, y0 + gy + rr], fill=(20, 20, 22), outline=(230, 230, 232), width=4)
    g.ellipse([x0 + gx - rr + 7, y0 + gy - rr + 7, x0 + gx + rr - 7, y0 + gy + rr - 7], fill=(235, 235, 230))
    g.line([x0 + gx, y0 + gy, x0 + gx + rr * 0.6, y0 + gy - rr * 0.4], fill=(200, 20, 20), width=3)
for k in range(5):
    g.rectangle([x0 + 20 + k * 46, y0 + 200, x0 + 52 + k * 46, y0 + 236], fill=(200, 30, 30) if k % 2 else (30, 60, 160))

os.makedirs(OUT, exist_ok=True)
img.save(os.path.join(OUT, 'svc_detail.png'))
print('wrote', os.path.join(OUT, 'svc_detail.png'))
