# Texture sheets for the delivery fleet (drawn from scratch; no photographs): box panels, roll-up door, liveries.
#   python textures.py <outdir>
import sys, os, math, random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tex')
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(20261001)


def noise(h, w, scale, octaves=4):
    out = np.zeros((h, w), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        sh = max(2, int(h / scale * 2 ** o)), max(2, int(w / scale * 2 ** o))
        n = rng.random(sh).astype(np.float32)
        n = np.array(Image.fromarray((n * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC), np.float32) / 255
        out += amp * n
        tot += amp
        amp *= 0.5
    return out / tot


def box_side():
    """2048 x 1024: one side of a 26-ft (7.92 m) FRP dry-freight box, u = rear -> front, v = floor -> roof.
    Off-white gel coat, 4-ft panel joints, road grime rising from the bottom rail, rain streaks under the roof rail,
    scuffs at dock height, DOT-C2 conspicuity tape (alternating red / white) along the bottom."""
    W, H = 2048, 1024
    pxm = W / 7.92
    base = np.array([236, 236, 231], np.float32)
    img = np.ones((H, W, 3), np.float32) * base
    # broad tonal variation
    img *= (0.975 + 0.035 * noise(H, W, 300))[..., None]
    y = np.linspace(1, 0, H)[:, None]          # 1 at the top row (roof), 0 at the floor
    # grime: rises from the bottom, streaky
    streak = noise(H, W, 40, 3)
    streak = np.array(Image.fromarray((streak * 255).astype(np.uint8)).resize((W, 8)).resize((W, H), Image.BICUBIC), np.float32) / 255
    g = np.clip((0.22 - (y)) / 0.22, 0, 1) ** 1.6 * (0.55 + 0.45 * streak)
    grime = np.array([150, 142, 128], np.float32)
    img = img * (1 - 0.55 * g[..., None]) + grime * (0.55 * g[..., None])
    # rain streaks from the roof rail
    rs = (rng.random(W) < 0.08).astype(np.float32)
    rs = np.convolve(rs, np.ones(5) / 5, mode='same')
    fall = np.clip(1 - (1 - y) / (0.25 + 0.5 * rng.random(W)[None, :]), 0, 1)
    img *= (1 - 0.10 * (rs[None, :] * fall))[..., None]
    im = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(im)
    # panel joints every 4 ft (1.219 m), a sealant line with a faint shadow
    x = 1.219 * pxm
    while x < W - 4:
        d.line([(x, 0), (x, H)], fill=(205, 205, 200), width=3)
        d.line([(x + 3, 0), (x + 3, H)], fill=(222, 222, 217), width=1)
        x += 1.219 * pxm
    # rivet rows under the roof rail and above the bottom rail (the rails are geometry; rivets on the panel edge)
    for yy in (int(H * 0.035), int(H * 0.955)):
        for xx in range(6, W, int(0.15 * pxm)):
            d.ellipse([xx - 2, yy - 2, xx + 2, yy + 2], fill=(190, 190, 186))
    # scuffs at dock / bollard height near the rear (u small = rear)
    for k in range(14):
        cx = rng.uniform(0.0, 0.25) * W
        cy = H * (1 - rng.uniform(0.05, 0.35))
        ln = rng.uniform(20, 120)
        col = tuple(int(c) for c in (rng.uniform(120, 170),) * 3)
        d.line([(cx, cy), (cx + ln, cy + rng.uniform(-6, 6))], fill=col, width=int(rng.uniform(1, 4)))
    # DOT-C2 conspicuity tape: 2 in tall, 7 in red / 11 in white segments, a band 0.20 m above the floor
    # (the band sits above the 0.17 m bottom rail extrusion, which is geometry)
    ty0 = H - int((0.20 + 0.051) / 2.61 * H)
    ty1 = H - int(0.20 / 2.61 * H)
    xx, red = 0.0, True
    while xx < W:
        seg = (7 if red else 11) * 0.0254 * pxm
        col = (178, 22, 26) if red else (238, 238, 236)
        d.rectangle([xx, ty0, xx + seg, ty1], fill=col)
        xx += seg
        red = not red
    im = im.filter(ImageFilter.GaussianBlur(0.6))
    im.save(os.path.join(OUT, 'box_side.png'))


def rollup():
    """1024 x 1024 roll-up door skin: off-white slats with a pressed line, grime at the bottom, hand prints at the
    handle height"""
    W, H = 1024, 1024
    img = np.ones((H, W, 3), np.float32) * np.array([232, 232, 228], np.float32)
    img *= (0.97 + 0.04 * noise(H, W, 200))[..., None]
    y = np.linspace(1, 0, H)[:, None]
    g = np.clip((0.25 - y) / 0.25, 0, 1) ** 1.5
    img = img * (1 - 0.35 * g[..., None]) + np.array([140, 132, 120], np.float32) * 0.35 * g[..., None]
    # hand smudges around the handle (v ~ 0.13 above the sill)
    yy, xx = np.mgrid[0:H, 0:W]
    for k in range(9):
        cx, cy = rng.uniform(0.3, 0.7) * W, (1 - rng.uniform(0.08, 0.22)) * H
        r = rng.uniform(15, 40)
        m = np.exp(-((xx - cx) ** 2 + (yy - cy) ** 2) / (2 * r * r))
        img *= (1 - 0.12 * m)[..., None]
    im = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))
    im.filter(ImageFilter.GaussianBlur(0.8)).save(os.path.join(OUT, 'rollup.png'))


def stepvan_paint():
    """2048 x 512 paint map (multiplied by the fleet colour at runtime, so near-white): u = rear -> front over the
    7.3 m body side, v = ground -> roof (3.0 m). The riveted aluminium body: vertical rivet seams at the body posts
    (24 in = 0.61 m) on the cargo section, rivet rows along the belt rail and the roof rail, a rub rail shadow."""
    W, H = 2048, 512
    L, HT = 7.30, 3.0
    pxm, pym = W / L, H / HT
    img = np.ones((H, W, 3), np.float32) * 248.0
    img *= (0.985 + 0.02 * noise(H, W, 200))[..., None]
    im = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(im)
    Y = lambda y: H - y * pym
    X = lambda z: (z) * pxm           # z measured from the rear face
    z = 0.05
    while z < L - 1.75:               # posts on the cargo section only (cab section is the door and the hood)
        x = X(z)
        d.line([(x, Y(2.92)), (x, Y(0.70))], fill=(226, 226, 224), width=2)
        for yy in np.arange(0.74, 2.92, 0.075):
            d.ellipse([x - 3, Y(yy) - 3, x + 3, Y(yy) + 3], fill=(214, 214, 212))
        z += 0.61
    for yr in (0.74, 1.40, 2.62, 2.90):
        for zz in np.arange(0.03, L - 1.75, 0.075):
            d.ellipse([X(zz) - 2.5, Y(yr) - 2.5, X(zz) + 2.5, Y(yr) + 2.5], fill=(218, 218, 216))
    im = im.filter(ImageFilter.GaussianBlur(0.7))
    im.save(os.path.join(OUT, 'stepvan_paint.png'))

FONTS = '/data0/projectnyc/client/public/fonts/ar33/'


def F(name, size):
    return ImageFont.truetype(FONTS + name, size)


def side_halves(draw_side, W=2048, H=2048, L=7.30, HT=3.0, name='wrap.png', base=(240, 240, 240)):
    """a livery sheet for a body side mapped u = rear -> front over L, v = ground -> HT: the TOP half is the left side
    (+x, the street side; its front is at the image's LEFT so text reads correctly), the BOTTOM half the right side (-x,
    the kerb side; front at the RIGHT). draw_side(img, side, X, Y) paints one half: X(z from the rear face), Y(height)."""
    im = Image.new('RGB', (W, H), base)
    for side, oy in ((1, 0), (-1, H // 2)):
        half = Image.new('RGB', (W, H // 2), base)
        X = (lambda zz: W - zz / L * W) if side > 0 else (lambda zz: zz / L * W)
        Y = lambda yy: (HT - yy) / HT * (H // 2)
        draw_side(half, side, X, Y)
        im.paste(half, (0, oy))
    im.save(os.path.join(OUT, name))


def foodtruck_wrap():
    """ZARELO'S (an invented brand): a hot red-orange wrap with a sunburst, the script name, a stylised empanada
    badge, an invented menu on the kerb side beside the serving window, phone / social lines (invented), a checker band"""
    def side(im, s, X, Y):
        W, H = im.size
        a = np.zeros((H, W, 3), np.float32)
        yy = np.linspace(0, 1, H)[:, None]
        top, bot = np.array([214, 46, 28], np.float32), np.array([150, 18, 22], np.float32)
        a[:] = top * (1 - yy[..., None]) + bot * yy[..., None]
        # sunburst rays from a point behind the brand
        cx, cy = (X(4.7) if s > 0 else X(2.6)), Y(2.2)
        gy, gx = np.mgrid[0:H, 0:W]
        ang = np.arctan2(gy - cy, gx - cx)
        rays = (np.sin(ang * 18) > 0.55).astype(np.float32) * np.clip(1 - np.hypot(gx - cx, gy - cy) / 900, 0, 1)
        a += rays[..., None] * np.array([40, 30, 0], np.float32)
        im.paste(Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)))
        d = ImageDraw.Draw(im)
        # lower checker band and a gold pinstripe
        for k in range(0, W, 28):
            for r in range(2):
                if (k // 28 + r) % 2 == 0:
                    d.rectangle([k, Y(0.98) + r * 14, k + 28, Y(0.98) + r * 14 + 14], fill=(20, 20, 20))
                else:
                    d.rectangle([k, Y(0.98) + r * 14, k + 28, Y(0.98) + r * 14 + 14], fill=(245, 245, 240))
        d.rectangle([0, Y(1.04), W, Y(1.02)], fill=(250, 196, 40))
        # brand
        # street side: the big brand mid-body; kerb side: the brand over the serving window (z 2.7 .. 4.9 m from the rear)
        bx = X(4.7) if s > 0 else X(3.8)
        if s > 0:
            d.text((bx, Y(2.20)), "Zarelo's", font=F('KaushanScript-Regular.ttf', 150), fill=(255, 214, 64), anchor='mm', stroke_width=6, stroke_fill=(60, 10, 8))
            d.text((bx, Y(1.68)), 'GRIDDLE  &  EMPANADAS', font=F('Anton-Regular.ttf', 54), fill=(255, 255, 255), anchor='mm', stroke_width=2, stroke_fill=(60, 10, 8))
        else:
            d.text((bx, Y(2.70)), "Zarelo's  Griddle", font=F('KaushanScript-Regular.ttf', 92), fill=(255, 214, 64), anchor='mm', stroke_width=5, stroke_fill=(60, 10, 8))
        # empanada badge: a golden half-moon with crimp marks
        ex, ey = (X(6.35) if s > 0 else X(0.55)), Y(1.95)
        d.ellipse([ex - 120, ey - 120, ex + 120, ey + 120], fill=(255, 236, 190), outline=(60, 10, 8), width=8)
        d.pieslice([ex - 90, ey - 60, ex + 90, ey + 110], 180, 360, fill=(222, 150, 48), outline=(120, 60, 10), width=5)
        for k in range(9):
            t = math.pi + math.pi * (k + 0.5) / 9
            d.line([(ex + 84 * math.cos(t), ey + 25 + 84 * math.sin(t)), (ex + 98 * math.cos(t), ey + 25 + 98 * math.sin(t))], fill=(120, 60, 10), width=6)
        d.text((bx, Y(1.30)), 'FRESH DAILY  -  HARLEM  NYC', font=F('BarlowCondensed-Bold.ttf', 44), fill=(255, 236, 190), anchor='mm')
        d.text((bx, Y(1.13)), '(212) 555-0147   @zarelosgriddle', font=F('BarlowCondensed-SemiBold.ttf', 36), fill=(255, 255, 255), anchor='mm')
        if s < 0:
            d.text((X(5.9), Y(2.0)), 'CASH', font=F('Bungee-Regular.ttf', 40), fill=(255, 255, 255), anchor='mm')
            d.text((X(5.9), Y(1.8)), '& CARD', font=F('Bungee-Regular.ttf', 40), fill=(255, 255, 255), anchor='mm')
        if s < 0:
            # menu board beside the serving window (window spans z -4.6 .. -2.4 from the bumper, i.e. 2.7 .. 4.9 m from the rear)
            x0, x1 = X(1.25), X(2.55)
            d.rectangle([x0, Y(2.42), x1, Y(1.22)], fill=(22, 22, 24), outline=(250, 196, 40), width=6)
            d.text(((x0 + x1) / 2, Y(2.33)), 'MENU', font=F('Bungee-Regular.ttf', 46), fill=(250, 196, 40), anchor='mm')
            items = [('Beef Empanada', '4'), ('Chicken Empanada', '4'), ('Cheese Empanada', '3.5'), ('Chopped Cheese', '9'),
                     ('Pernil Plate', '13'), ('Rice & Beans', '6'), ('Tostones', '5'), ('Morir Sonando', '5'), ('Soda / Water', '2')]
            fi = F('BarlowCondensed-Medium.ttf', 31)
            for k, (it, pr) in enumerate(items):
                yk = Y(2.20) + k * 34
                d.text((x0 + 16, yk), it, font=fi, fill=(240, 240, 236))
                d.text((x1 - 16, yk), '$' + pr, font=fi, fill=(250, 196, 40), anchor='ra')
    side_halves(side, name='foodtruck_wrap.png', base=(200, 30, 24))


def foodtruck_kitchen():
    """the serving window's interior: stainless back wall, shelf with squeeze bottles and foil pans, the hood"""
    W, H = 1024, 512
    a = np.ones((H, W, 3), np.float32) * np.array([150, 152, 155], np.float32)
    a *= (0.85 + 0.25 * np.abs(np.sin(np.linspace(0, 40, W)))[None, :, None] * 0.2 + 0.1 * noise(H, W, 30)[..., None])
    im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W, 90], fill=(70, 72, 76))                     # hood
    for k in range(12):
        d.rectangle([20 + k * 84, 30, 80 + k * 84, 60], fill=(40, 40, 42))
    d.rectangle([0, 230, W, 245], fill=(200, 202, 205))              # shelf
    rng2 = np.random.default_rng(7)
    x = 20
    while x < W - 40:
        w = int(rng2.uniform(18, 30))
        col = [(220, 40, 30), (240, 200, 40), (250, 250, 245), (60, 140, 60)][int(rng2.integers(0, 4))]
        d.rounded_rectangle([x, 160, x + w, 230], radius=6, fill=col)
        x += w + int(rng2.uniform(6, 20))
    d.rectangle([0, 380, W, H], fill=(120, 122, 125))                # counter front
    for k in range(5):
        d.rectangle([60 + k * 190, 300, 200 + k * 190, 370], fill=(196, 198, 200), outline=(90, 90, 92), width=3)   # foil pans
    im.filter(ImageFilter.GaussianBlur(1.0)).save(os.path.join(OUT, 'foodtruck_kitchen.png'))


def icecream_wrap():
    """SNOWDRIFT CONES (an invented brand): a white body, sky-blue and pink swirl bands, drawn soft-serve cones, the
    script name, a picture menu on the kerb side beside the two serving windows (invented items and prices)"""
    def cone(d, cx, cy, sc, top=(255, 250, 240), dip=None):
        d.polygon([(cx - 40 * sc, cy), (cx + 40 * sc, cy), (cx, cy + 130 * sc)], fill=(222, 170, 92), outline=(150, 100, 40))
        for k in range(-3, 4):
            d.line([(cx + k * 12 * sc, cy), (cx + k * 4 * sc, cy + 110 * sc)], fill=(170, 120, 60), width=max(1, int(2 * sc)))
        for k, (w, h) in enumerate(((50, 34), (40, 30), (28, 26), (14, 22))):
            yk = cy - 16 * sc - k * 24 * sc
            d.ellipse([cx - w * sc, yk - h * sc / 2, cx + w * sc, yk + h * sc / 2], fill=top, outline=(200, 190, 175), width=max(1, int(2 * sc)))
        if dip:
            d.ellipse([cx - 46 * sc, cy - 40 * sc, cx + 46 * sc, cy - 8 * sc], fill=dip)

    def side(im, s, X, Y):
        W, H = im.size
        d = ImageDraw.Draw(im)
        # swirl bands
        pts1 = [(x, Y(1.0) + 40 * math.sin(x / 140)) for x in range(0, W + 20, 20)]
        d.polygon(pts1 + [(W, H), (0, H)], fill=(86, 170, 228))
        pts2 = [(x, Y(1.12) + 36 * math.sin(x / 140 + 1.2)) for x in range(0, W + 20, 20)]
        d.line(pts2, fill=(244, 120, 170), width=22)
        d.rectangle([0, 0, W, Y(2.62)], fill=(86, 170, 228))
        d.line([(x, Y(2.58) + 18 * math.sin(x / 90)) for x in range(0, W + 20, 20)], fill=(244, 120, 170), width=16)
        # street side: brand mid-box; kerb side: over the serving windows (2.2 .. 4.5 m from the rear)
        bx = X(2.6) if s > 0 else X(3.35)
        by = Y(2.20) if s > 0 else Y(2.66)
        d.text((bx, by), 'Snowdrift', font=F('Pacifico-Regular.ttf', 120) if os.path.exists(FONTS + 'Pacifico-Regular.ttf') else F('Lobster-Regular.ttf', 120), fill=(236, 70, 140), anchor='mm', stroke_width=5, stroke_fill=(255, 255, 255))
        if s > 0:
            d.text((bx, Y(1.78)), 'SOFT  SERVE  ·  CONES  ·  SHAKES', font=F('BarlowCondensed-Bold.ttf', 48), fill=(40, 90, 170), anchor='mm')
        for k, zz in enumerate((0.55, 4.3, 1.1, 4.0)):
            if s < 0:
                continue
            if k >= 2:
                continue
            cone(d, X(zz), Y(2.05), 1.6, dip=[None, (90, 50, 30), (240, 140, 180), None][k])
        if s < 0:
            # picture menu between the windows' rear edge and the rear corner
            x0, x1 = X(0.30), X(1.95)
            d.rounded_rectangle([x0, Y(2.42), x1, Y(1.20)], radius=14, fill=(255, 255, 255), outline=(40, 90, 170), width=6)
            d.text(((x0 + x1) / 2, Y(2.34)), 'MENU', font=F('Bungee-Regular.ttf', 40), fill=(236, 70, 140), anchor='mm')
            items = [('Small Cone', '3.50'), ('Large Cone', '4.50'), ('Dipped Cone', '5'), ('Sundae', '6'), ('Shake', '6.50'), ('Banana Split', '8')]
            for k, (it, pr) in enumerate(items):
                col, row = k % 2, k // 2
                cx = x0 + (x1 - x0) * (0.27 + 0.48 * col)
                cy = Y(2.16) + row * 92
                cone(d, cx - 60, cy, 0.42, dip=(90, 50, 30) if 'Dipped' in it else None)
                d.text((cx - 25, cy - 10), it, font=F('BarlowCondensed-SemiBold.ttf', 30), fill=(40, 40, 60))
                d.text((cx - 25, cy + 24), '$' + pr, font=F('BarlowCondensed-Bold.ttf', 30), fill=(236, 70, 140))
    side_halves(side, L=6.80, name='icecream_wrap.png', base=(248, 248, 246))


def icecream_window():
    W, H = 1024, 512
    im = Image.new('RGB', (W, H), (205, 215, 225))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 300, W, H], fill=(230, 232, 236))
    for k in range(4):
        x = 80 + k * 240
        d.rectangle([x, 120, x + 120, 300], fill=(240, 242, 246), outline=(150, 150, 160), width=4)   # soft-serve machines
        d.rectangle([x + 40, 230, x + 80, 260], fill=(120, 120, 130))
    d.rectangle([0, 0, W, 60], fill=(250, 250, 250))
    im.filter(ImageFilter.GaussianBlur(1.2)).save(os.path.join(OUT, 'icecream_window.png'))


if __name__ == '__main__':
    box_side()
    rollup()
    stepvan_paint()
    foodtruck_wrap()
    foodtruck_kitchen()
    icecream_wrap()
    icecream_window()
    print('textures ->', OUT)
