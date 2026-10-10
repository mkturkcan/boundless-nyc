# Delivery and vending trucks of 125th Street for the traffic sim (AR34 wave 2, track DELIVERY):
#   boxtruck26  26-ft box on a Class 6 cab-over chassis (the white cab-over box truck of the 125th St captures)
#   stepvan     walk-in step van, flat front (P-series body on a stripped chassis), 14-ft body
#   cargovan    high-roof full-size cargo van (Transit / Sprinter class), 148-in wheelbase
#   foodtruck   the step van as a food truck (serving window, awning, menu boards, roof vents), invented brand
#   icecream    soft-serve truck on a cutaway van chassis (painted body, serving windows, cones), invented brand
# Built procedurally to the dimensions in docs/notes/ar34-veh-delivery.md; no brand marks of real companies.
#   blender --background --python build_delivery.py -- <kind> <out.glb> <meta.json> <texdir>
# Output: root node <kind> with LOD0 / LOD1 / LOD2 children (sim/fleet24.js reads them by name); finish.mjs adds the
# metadata extras, KTX2 textures and meshopt compression.
import bpy, sys, os, json, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vlib as V
from vlib import mat, box, boxc, prism, lathe, tube, torus, quad, make

A = sys.argv[sys.argv.index('--') + 1:]
KIND, OUT, META, TEXD = A[0], A[1], A[2], A[3]
V.S['texdir'] = TEXD
bpy.ops.wm.read_factory_settings(use_empty=True)

ROLE = dict(head=1, fbl=2, fbr=3, tail=4, rbl=5, rbr=6, rev=7)
HUBS = {}

# ------------------------------------------------------------------ materials (linear colours)
def MAT():
    return dict(
        paint=mat('paint:body', (0.73, 0.73, 0.72), 0, 0.35),
        rubber=mat('detail:tyre', (0.022, 0.022, 0.024), 0, 0.86),
        steel=mat('detail:wheelsteel', (0.50, 0.51, 0.52), 0.55, 0.38),
        chrome=mat('detail:chrome', (0.80, 0.80, 0.80), 1.0, 0.12),
        alu=mat('detail:alu', (0.62, 0.63, 0.64), 1.0, 0.32),
        black=mat('detail:blackplastic', (0.022, 0.022, 0.024), 0, 0.62),
        satin=mat('detail:satinblack', (0.03, 0.03, 0.032), 0.2, 0.42),
        chassis=mat('detail:chassis', (0.018, 0.018, 0.02), 0.3, 0.55),
        grey=mat('detail:greyplastic', (0.10, 0.10, 0.105), 0, 0.55),
        void=mat('detail:void', (0.004, 0.004, 0.005), 0, 0.9),
        interior=mat('detail:interior', (0.035, 0.036, 0.04), 0, 0.75),
        seat=mat('detail:seat', (0.05, 0.052, 0.058), 0, 0.8),
        mirror=mat('detail:mirrorglass', (0.85, 0.87, 0.9), 1.0, 0.03),
        amber=mat('detail:amberlens', (0.9, 0.32, 0.02), 0, 0.15),
        redrefl=mat('detail:redreflector', (0.55, 0.01, 0.01), 0, 0.2),
        glass=mat('glass:window', (0.02, 0.025, 0.03), 0, 0.03),
        lens=mat('lens:cover', (0.9, 0.9, 0.9), 0, 0.02),
        lamp=mat('lamp:lamp', (0.85, 0.85, 0.85), 0.6, 0.2),
        lampin=mat('lampInner:housing', (0.02, 0.02, 0.02), 0.2, 0.25),
        plate=mat('detail:LicensePlate', (0.8, 0.7, 0.3), 0.1, 0.45),
    )


LOD = lambda: V.S['lod']


def segs(a, b, c):
    return (a, b, c)[LOD()]

# ------------------------------------------------------------------ shared assemblies
def wheel(M, wid, hx, hy, hz, side, R, Rr, W, dual=False, disc='front'):
    """one wheel (or a dual pair) on the hub (hx, hy, hz); side +1 = left (+x). _WHEEL = wid on every vertex."""
    n = segs(48, 24, 12)
    HUBS[wid] = dict(id=wid, p=[hx, hy, hz], r=R, w=(W * (2.15 if dual else 1)) / 2 + 0.02)
    centres = [hx] if not dual else [hx + side * W * 0.56, hx - side * W * 0.56]
    for k, cx in enumerate(centres):
        h = W / 2
        if LOD() == 0:
            prof = [(-h + 0.012, Rr + 0.012), (-h - 0.004, Rr + 0.05), (-h - 0.010, Rr + 0.55 * (R - Rr)), (-h - 0.002, R - 0.035),
                    (-h + 0.022, R - 0.004), (-0.30 * h, R), (-0.28 * h, R - 0.012), (-0.18 * h, R - 0.012), (-0.16 * h, R),
                    (0.16 * h, R), (0.18 * h, R - 0.012), (0.28 * h, R - 0.012), (0.30 * h, R), (h - 0.022, R - 0.004),
                    (h + 0.002, R - 0.035), (h + 0.010, Rr + 0.55 * (R - Rr)), (h + 0.004, Rr + 0.05), (h - 0.012, Rr + 0.012)]
        else:
            prof = [(-h + 0.01, Rr + 0.01), (-h - 0.008, Rr + 0.5 * (R - Rr)), (-h + 0.02, R - 0.01), (h - 0.02, R - 0.01),
                    (h + 0.008, Rr + 0.5 * (R - Rr)), (h - 0.01, Rr + 0.01)]
        prof = [(o * side, r) for (o, r) in prof]
        lathe(f'tyre{wid}{k}', M['rubber'], prof, (cx, hy, hz), n, wheel=wid, smooth=True, sharp=50)
        # rim: outer flange, well, dished disc, hub boss. The outer face of the pair carries the disc detail.
        outer = (k == 0)
        dish = (0.055 if disc == 'front' else -0.075) if outer else -0.03
        o = side
        rp = [(-0.42 * W * o, Rr - 0.006), (-0.45 * W * o, Rr + 0.014), (-0.47 * W * o, Rr + 0.014),
              (0.47 * W * o, Rr + 0.014), (0.45 * W * o, Rr + 0.014), (0.42 * W * o, Rr - 0.006), (0.40 * W * o, Rr - 0.03),
              ((0.20 * W + dish * 0.2) * o, Rr - 0.04), ((dish) * o, 0.72 * Rr), ((dish + 0.006) * o, 0.42 * Rr),
              ((dish + 0.012) * o, 0.30 * Rr)]
        lathe(f'rim{wid}{k}', M['steel'], rp, (cx, hy, hz), segs(40, 20, 10), wheel=wid, smooth=True, sharp=40, cap1=True)
        if outer:
            # hub: a domed cap and ten lug nuts on the 285.75 mm bolt circle (hand holes as dark recesses)
            hb = cx + (dish + 0.012) * o
            lathe(f'hub{wid}', M['chrome'] if disc == 'front' else M['steel'],
                  [(0, 0.115), (0.03 * o, 0.11), (0.05 * o, 0.085), (0.075 * o, 0.07), (0.10 * o, 0.04), (0.105 * o, 0.0)],
                  (hb, hy, hz), segs(24, 12, 8), wheel=wid, smooth=True)
            if LOD() == 0:
                for j in range(10):
                    t = 2 * math.pi * (j + 0.5) / 10
                    lathe(f'lug{wid}{j}', M['chrome'], [(0, 0.017), (0.025 * o, 0.017), (0.032 * o, 0.012), (0.034 * o, 0.0)],
                          (hb, hy + 0.143 * math.cos(t), hz + 0.143 * math.sin(t)), 6, wheel=wid)
            if LOD() < 2:
                for j in range(segs(10, 5, 0)):
                    t = 2 * math.pi * j / 10
                    rr = 0.60 * Rr
                    lathe(f'hole{wid}{j}', M['void'], [(-0.001 * o, 0.038), (0.004 * o, 0.032), (0.0045 * o, 0.0)],
                          (cx + dish * 0.6 * o + 0.002 * o, hy + rr * math.cos(t), hz + rr * math.sin(t)), 10, wheel=wid)


def plate(M, x, y, z, facing):
    """NY plate 12 x 6 in; facing +1 front, -1 rear. UVs index the runtime plate atlas cell (fleet24.js plateAtlas)."""
    W, H = 0.305, 0.152
    xs = (x - W / 2, x + W / 2) if facing > 0 else (x + W / 2, x - W / 2)
    # glTF v = 1 - blender v; the atlas plate band is v 74/256 (top) .. 194/256 (bottom), u 4/256 .. 252/256
    vt, vb = 1 - 74 / 256, 1 - 194 / 256
    u0, u1 = 4 / 256, 252 / 256
    pts = [(xs[0], y - H / 2, z), (xs[1], y - H / 2, z), (xs[1], y + H / 2, z), (xs[0], y + H / 2, z)]
    quad('plate', M['plate'], pts, (0, 0, facing), uvq=[(u0, vb), (u1, vb), (u1, vt), (u0, vt)])
    # frame / backing plate
    box('plateback', M['black'], x - W / 2 - 0.012, x + W / 2 + 0.012, y - H / 2 - 0.012, y + H / 2 + 0.012,
        z - (0.012 if facing > 0 else -0.002), z - (0.002 if facing > 0 else -0.012))


def lampbox(M, name, role, x0, x1, y0, y1, z0, z1, facing, lens=True, bevel=0.01):
    """a lamp body with its role; a clear lens 3 mm proud on the facing side (+1 front, -1 rear)"""
    box(name, M['lamp'], x0, x1, y0, y1, z0, z1, lamp=role, bevel=bevel if LOD() == 0 else 0)
    if lens and LOD() < 2:
        zf = (max(z0, z1) + 0.003) if facing > 0 else (min(z0, z1) - 0.003)
        quad(name + 'L', M['lens'], [(x0, y0, zf), (x1, y0, zf), (x1, y1, zf), (x0, y1, zf)], (0, 0, facing), lamp=role)


def round_lamp(M, name, role, x, y, z, r, facing, depth=0.05):
    n = segs(24, 12, 8)
    o = facing
    lathe(name, M['lamp'], [(0, r), (-depth * o, r), (-depth * o, 0)], (x, y, z), n, axis='z', lamp=role, cap0=False)
    lathe(name + 'c', M['lamp'], [(0, 0), (0, r)], (x, y, z), n, axis='z', lamp=role)
    if LOD() < 2:
        lathe(name + 'L', M['lens'], [(0.004 * o, 0), (0.004 * o, r * 1.02)], (x, y, z), n, axis='z', lamp=role)
        lathe(name + 'b', M['chrome'], [(0.0, r * 1.02), (0.006 * o, r * 1.06), (0.0, r * 1.14)], (x, y, z), n, axis='z')


def west_coast_mirror(M, side, ax, ay, az, hx, hy0, hy1, hz, wide=0.19):
    """tubular arms from the cab (ax, ay..., az) to a tall mirror head at x = hx (side +1 left), plus a convex spot mirror"""
    s = side
    r = 0.012
    tube('mArmT', M['chrome'], (ax, ay + 0.35, az), (hx, hy1 - 0.03, hz), r, segs(10, 6, 4))
    tube('mArmB', M['chrome'], (ax, ay - 0.05, az), (hx, hy0 + 0.03, hz), r, segs(10, 6, 4))
    tube('mPost', M['chrome'], (hx, hy0 - 0.02, hz), (hx, hy1 + 0.02, hz), r * 0.9, segs(10, 6, 4))
    hx2 = hx + s * 0.03
    box('mHead', M['black'], min(hx2, hx2 + s * 0.06), max(hx2, hx2 + s * 0.06), hy0, hy1, hz - wide / 2, hz + wide / 2, bevel=0.012)
    # the glass faces backward (-z)
    quad('mGlass', M['mirror'], [(hx2 + s * 0.01, hy0 + 0.015, hz - wide / 2 - 0.002), (hx2 + s * 0.05, hy0 + 0.015, hz - wide / 2 - 0.002),
                                 (hx2 + s * 0.05, hy1 - 0.015, hz - wide / 2 - 0.002), (hx2 + s * 0.01, hy1 - 0.015, hz - wide / 2 - 0.002)], (0, 0, -1))
    if LOD() < 2:
        lathe('mSpot', M['black'], [(0, 0.085), (0.04, 0.085), (0.05, 0.0)], (hx2 + s * 0.03, hy0 - 0.13, hz), segs(20, 10, 6), axis='z', cap0=True)
        lathe('mSpotG', M['mirror'], [(-0.002, 0.0), (-0.002, 0.08), (0.012, 0.0)], (hx2 + s * 0.03, hy0 - 0.13, hz - 0.002), segs(20, 10, 6), axis='z')


def seat(M, x, yb, z, w=0.50, back=0.62, rake=0.18):
    """seat cushion top at yb, facing +z, centred on (x, z)"""
    box('seatB', M['seat'], x - w / 2, x + w / 2, yb - 0.12, yb, z - 0.25, z + 0.25, bevel=0.035)
    prism('seatK', M['seat'], [(z - 0.22, yb - 0.02), (z - 0.12, yb - 0.02), (z - 0.12 - rake, yb + back), (z - 0.24 - rake, yb + back)],
          x - w / 2, x + w / 2, bevel=0.04)
    if LOD() == 0:
        box('seatH', M['seat'], x - 0.14, x + 0.14, yb + back + 0.03, yb + back + 0.22, z - 0.27 - rake, z - 0.17 - rake, bevel=0.03)


def steering(M, x, y, z, tilt=0.55, R=0.21):
    ax = (0.0, math.sin(tilt), math.cos(tilt))
    torus('wheelRim', M['satin'], (x, y, z), ax, R, 0.016, segs(28, 14, 8), segs(8, 5, 4))
    tube('wheelCol', M['satin'], (x, y, z), (x, y - 0.35 * math.sin(tilt) - 0.05, z - 0.35 * math.cos(tilt)), 0.03, 8)
    boxc('wheelHub', M['satin'], (x, y, z), (0.12, 0.06, 0.12), bevel=0.02)

# ------------------------------------------------------------------ 26-ft box truck (cab-over)
def boxtruck26():
    M = MAT()
    boxm = mat('detail:boxpanel', (0.80, 0.80, 0.78), 0, 0.42, tex='box_side.png')
    roll = mat('detail:rollupdoor', (0.78, 0.78, 0.76), 0.0, 0.45, tex='rollup.png')
    grille = M['satin']
    R, Rr, TW = 0.419, 0.2477, 0.245          # 245/70R19.5 on 19.5 x 6.75 steel wheels
    zFh, WB = -1.22, 6.10                      # front hub behind the bumper face, wheelbase
    zRh = zFh - WB
    HW = 1.15                                  # cab half width
    yB = 0.66                                  # cab skin bottom
    # ---- cab lower body (to the belt line) with the front wheel arch
    # the arch runs rear -> front (t = pi .. 0) around the hub, clamped to the skin bottom
    na = segs(16, 10, 6)
    arch = [(zFh + 0.58 * math.cos(math.pi * (1 - k / na)), max(yB, 0.42 + 0.58 * math.sin(math.pi * (1 - k / na)))) for k in range(na + 1)]
    yBl = 1.62                                 # belt line: the windshield and the door glass start here
    prof = [(-0.13, yB), (-0.11, 1.10), (-0.10, yBl), (-2.06, yBl), (-2.06, yB)] + arch
    V.prism('cabLow', M['paint'], prof, -HW, HW, smooth=False, bevel=0.05, bseg=3, bangle=30)
    # interior shelf at the belt line (dark) so the body's top face never shows through the glass
    box('cabShelf', M['interior'], -HW + 0.04, HW - 0.04, yBl, yBl + 0.005, -2.0, -0.16)
    # ---- greenhouse: A pillars, door frames, rear quarter, roof cap, back wall
    for s in (1, -1):
        x0, x1 = (HW - 0.075, HW) if s > 0 else (-HW, -HW + 0.075)
        V.prism('aPil', M['paint'], [(-0.10, yBl), (-0.20, yBl), (-0.40, 2.56), (-0.30, 2.56)], x0, x1, bevel=0.02)
        V.prism('rQtr', M['paint'], [(-1.42, yBl), (-2.06, yBl), (-2.06, 2.56), (-1.42, 2.56)], x0, x1, bevel=0.02)
        V.prism('bPil', M['paint'], [(-1.36, yBl), (-1.44, yBl), (-1.44, 2.56), (-1.36, 2.56)], x0 + (-0.01 if s > 0 else 0.01), x1, bevel=0.01)
    V.prism('roof', M['paint'], [(-0.30, 2.54), (-0.36, 2.70), (-0.48, 2.79), (-1.98, 2.80), (-2.06, 2.74), (-2.06, 2.54)], -HW, HW, bevel=0.05, bseg=3, bangle=25)
    box('backWall', M['paint'], -HW, HW, yBl, 2.55, -2.06, -1.98)
    # windshield (one pane, raked) and door glass (recessed 1 cm); the passenger door has the low "peep" window
    V.quad('wsG', M['glass'], [(-HW + 0.07, yBl + 0.015, -0.105), (HW - 0.07, yBl + 0.015, -0.105), (HW - 0.07, 2.55, -0.315), (-HW + 0.07, 2.55, -0.315)], (0, 0.3, 1))
    # the dark sun band across the top of the windshield
    zt = lambda y: -0.105 - (y - yBl - 0.015) / (2.55 - yBl - 0.015) * 0.21 + 0.006
    V.quad('visor', M['satin'], [(-HW + 0.07, 2.42, zt(2.42)), (HW - 0.07, 2.42, zt(2.42)), (HW - 0.07, 2.552, zt(2.552)), (-HW + 0.07, 2.552, zt(2.552))], (0, 0.3, 1))
    for s in (1, -1):
        xg = s * (HW - 0.012)
        V.quad('doorG', M['glass'], [(xg, yBl + 0.005, -0.185), (xg, yBl + 0.005, -1.355), (xg, 2.545, -1.355), (xg, 2.545, -0.405)], (s, 0, 0))
        if s < 0:
            V.quad('peepG', M['glass'], [(xg - 0.002, 1.18, -0.30), (xg - 0.002, 1.18, -0.62), (xg - 0.002, 1.58, -0.62), (xg - 0.002, 1.58, -0.36)], (s, 0, 0))
            box('peepBack', M['interior'], xg + 0.004, xg + 0.02, 1.16, 1.60, -0.64, -0.28)
    # ---- door shut lines and handles (thin dark strips 2 mm proud), steps, grab handles
    if LOD() < 2:
        for s in (1, -1):
            xo = s * (HW + 0.002)
            for (z0, z1, y0, y1) in ((-0.16, -0.17, 0.80, yBl), (-1.37, -1.38, 0.95, yBl), (-1.38, -0.17, 0.80, 0.81)):
                box('seam', M['void'], min(xo, xo + s * 0.003), max(xo, xo + s * 0.003), y0, y1, z1, z0)
            box('handle', M['satin'], min(xo, xo + s * 0.03), max(xo, xo + s * 0.03), 1.52, 1.56, -1.30, -1.12, bevel=0.01)
            box('step1', M['chassis'], min(s * 0.95, s * HW), max(s * 0.95, s * HW), 0.42, 0.46, -0.66, -0.20)
            tube('grab', M['chrome'], (s * (HW + 0.03), 1.00, -1.47), (s * (HW + 0.03), 1.75, -1.47), 0.016, segs(10, 6, 4))
    # ---- front: bumper, grille, badge bar, head / turn lamps, fog lamps, wipers
    V.prism('bumper', M['paint'], [(0.0, 0.46), (0.0, 0.76), (-0.06, 0.80), (-0.30, 0.80), (-0.30, 0.46)], -1.16, 1.16, bevel=0.03, bangle=30)
    V.prism('bumperLip', M['black'], [(0.0, 0.36), (0.0, 0.46), (-0.30, 0.46), (-0.30, 0.38)], -1.12, 1.12, bevel=0.01)
    box('grille', grille, -0.70, 0.70, 1.06, 1.42, -0.105, -0.085, bevel=0.01)
    if LOD() < 2:
        for k in range(3):
            yk = 1.10 + k * 0.105
            box('grSlot', M['void'], -0.62, 0.62, yk, yk + 0.06, -0.083, -0.080)
            box('grBar', M['paint'], -0.66, 0.66, yk + 0.065, yk + 0.095, -0.084, -0.074, bevel=0.004 if LOD() == 0 else 0)
    box('badge', M['chrome'], -0.24, 0.24, 1.47, 1.52, -0.10, -0.085, bevel=0.008)
    for s in (1, -1):
        xa, xb = sorted((s * 0.72, s * 1.07))
        V.box('hlBezel', M['satin'], xa - 0.01, xb + 0.01, 0.80, 1.03, -0.12, -0.09, bevel=0.01)
        lampbox(M, 'head', ROLE['head'], *sorted((s * 0.74, s * 0.99)), 0.83, 1.00, -0.115, -0.085, 1)
        lampbox(M, 'turnF', ROLE['fbl'] if s > 0 else ROLE['fbr'], *sorted((s * 0.995, s * 1.06)), 0.83, 1.00, -0.115, -0.085, 1)
        round_lamp(M, 'fog', 0, s * 0.85, 0.62, 0.004, 0.05, 1, depth=0.03)
        # wipers
        tube('wiper', M['satin'], (s * 0.25, 1.77, -0.13), (s * 0.25 - 0.45, 2.15, -0.21), 0.008, 6)
    # roof marker lamps (amber, three at the centre, US identification lamps)
    for k in (-1, 0, 1):
        boxc('idLamp', M['amber'], (k * 0.16, 2.80, -0.52), (0.09, 0.03, 0.05), bevel=0.008)
    # mirrors
    for s in (1, -1):
        west_coast_mirror(M, s, s * (HW - 0.02), 1.82, -0.32, s * (HW + 0.23), 1.88, 2.30, -0.30)
    # ---- cab interior (seen through the glass)
    if LOD() < 2:
        seat(M, 0.55, 1.66, -1.58, back=0.66)
        seat(M, -0.55, 1.66, -1.58, back=0.66)
        box('dash', M['interior'], -HW + 0.06, HW - 0.06, yBl, 1.80, -0.62, -0.16, bevel=0.03)
        steering(M, 0.55, 1.95, -0.80, tilt=0.95)
        box('bunkWall', M['interior'], -HW + 0.05, HW - 0.05, yBl, 2.55, -1.98, -1.95)
    # ---- chassis: rails, axles, fuel tank, battery / DPF box, driveshaft, mud flaps
    for s in (1, -1):
        box('rail', M['chassis'], min(s * 0.40, s * 0.47), max(s * 0.40, s * 0.47), 0.72, 0.98, -10.0, -0.35)
    tube('fAxle', M['chassis'], (-0.95, R - 0.04, zFh), (0.95, R - 0.04, zFh), 0.06, segs(12, 8, 6))
    tube('rAxle', M['chassis'], (-0.80, R, zRh), (0.80, R, zRh), 0.075, segs(14, 8, 6))
    lathe('diff', M['chassis'], [(-0.22, 0.08), (-0.15, 0.20), (0.0, 0.24), (0.12, 0.18), (0.20, 0.08)], (0, R - 0.02, zRh), segs(18, 10, 6), axis='z', cap0=True, cap1=True, smooth=True)
    tube('dshaft', M['chassis'], (0, 0.55, -2.3), (0, R + 0.02, zRh + 0.3), 0.045, segs(12, 8, 6))
    lathe('fuel', M['alu'], [(0, 0), (0, 0.22), (-0.02, 0.25), (-1.08, 0.25), (-1.10, 0.22), (-1.10, 0)], (0.80, 0.55, -2.45), segs(32, 16, 8), axis='z', smooth=True, sharp=60)
    for zz in (-2.62, -3.38):
        lathe('strap', M['chassis'], [(0, 0.255), (-0.05, 0.255)], (0.80, 0.55, zz), segs(32, 16, 8), axis='z')
    for zz in (-2.4, -2.2):
        pass
    box('battery', M['chassis'], -1.02, -0.50, 0.40, 0.92, -3.35, -2.35, bevel=0.02)
    lathe('dpf', M['alu'], [(0, 0), (0, 0.17), (0.9, 0.17), (0.9, 0)], (-0.70, 0.62, -3.5 - 0.9), segs(20, 10, 6), axis='z', smooth=True, sharp=60)
    for s in (1, -1):
        box('flap', M['rubber'], min(s * 0.62, s * 1.18), max(s * 0.62, s * 1.18), 0.18, 0.92, zRh - 0.62, zRh - 0.605)
        box('flapHanger', M['chassis'], min(s * 0.47, s * 1.18), max(s * 0.47, s * 1.18), 0.90, 0.96, zRh - 0.63, zRh - 0.58)
    # ---- box: 26 ft (7.92 m) x 2.50 m, floor 1.20 m, roof 3.81 m
    zb0, zb1 = -2.20, -2.20 - 7.92
    BW = 1.25
    y0, y1 = 1.20, 3.81
    L = zb0 - zb1

    def uv_box(p, n):
        if abs(n[0]) > 0.7:
            return ((p[2] - zb1) / L, (p[1] - y0) / (y1 - y0) * 0.97 + 0.015)
        if abs(n[2]) > 0.7:
            return (0.42 + 0.16 * (p[0] + BW) / (2 * BW), (p[1] - y0) / (y1 - y0) * 0.97 + 0.015)
        return (0.5 + 0.0 * p[0], 0.5)
    box('box', boxm, -BW + 0.02, BW - 0.02, y0 + 0.02, y1 - 0.02, zb1 + 0.02, zb0 - 0.02, uv=uv_box, bevel=0.01)
    # aluminium extrusions: corner posts, top rails, bottom rails, front corner caps
    for s in (1, -1):
        xa, xb = sorted((s * (BW - 0.035), s * (BW + 0.012)))
        for zc in (zb0, zb1):
            za, zz = sorted((zc, zc + (-0.09 if zc == zb0 else 0.09)))
            box('post', M['alu'], xa, xb, y0, y1, za, zz, bevel=0.006)
        box('topRail', M['alu'], xa, xb, y1 - 0.11, y1, zb1, zb0, bevel=0.006)
        box('botRail', M['alu'], xa, xb, y0, y0 + 0.17, zb1, zb0, bevel=0.006)
    box('frontCap', M['alu'], -BW, BW, y1 - 0.11, y1, zb0 - 0.09, zb0 + 0.012, bevel=0.006)
    # cross-members under the floor (seen from the street between the wheels)
    nCM = segs(18, 6, 0)
    for k in range(nCM):
        zc = zb0 - 0.2 - k * (L - 0.4) / max(1, nCM - 1)
        box('xm', M['chassis'], -BW + 0.05, BW - 0.05, 1.02, 1.20, zc - 0.04, zc + 0.04)
    box('sill', M['chassis'], -0.55, 0.55, 0.98, 1.20, zb1 + 0.1, zb0 - 0.1)
    # rear frame, header and the roll-up door (slats)
    box('rHeader', M['alu'], -BW, BW, 3.42, y1, zb1 - 0.03, zb1 + 0.10, bevel=0.008)
    for s in (1, -1):
        box('rPost', M['alu'], min(s * 1.09, s * BW), max(s * 1.09, s * BW), y0, 3.42, zb1 - 0.03, zb1 + 0.10, bevel=0.008)
    box('rSill', M['alu'], -BW, BW, y0 - 0.02, y0 + 0.10, zb1 - 0.05, zb1 + 0.10, bevel=0.008)
    nsl = segs(12, 6, 1)
    hs = (3.42 - (y0 + 0.10)) / nsl
    for k in range(nsl):
        ya = y0 + 0.10 + k * hs
        prof = [(zb1 + 0.04, ya + 0.004), (zb1 + 0.035, ya + 0.02), (zb1 + 0.028, ya + hs * 0.5), (zb1 + 0.035, ya + hs - 0.02), (zb1 + 0.04, ya + hs - 0.004), (zb1 + 0.06, ya + hs * 0.5)]
        V.prism('slat', roll, prof, -1.09, 1.09, smooth=True, sharp=40,
                uv=lambda p, n, ya=ya: ((p[0] + 1.09) / 2.18, (p[1] - y0) / (3.42 - y0)))
        if k and LOD() < 2:
            box('slatGap', M['void'], -1.09, 1.09, ya - 0.006, ya + 0.006, zb1 + 0.036, zb1 + 0.042)
    box('doorHandle', M['chrome'], -0.25, 0.25, 1.40, 1.43, zb1 + 0.005, zb1 + 0.03, bevel=0.008)
    box('latch', M['steel'], -0.06, 0.06, 1.30, 1.40, zb1 + 0.01, zb1 + 0.035)
    box('strap', M['black'], 0.40, 0.45, 1.33, 2.10, zb1 + 0.012, zb1 + 0.025)
    # rear underride guard and its posts, dock bumpers, tuck-under lift gate, rear lamps
    box('icc', M['chassis'], -1.12, 1.12, 0.42, 0.56, zb1 + 0.0, zb1 + 0.12, bevel=0.01)
    for s in (1, -1):
        box('iccPost', M['chassis'], min(s * 0.50, s * 0.60), max(s * 0.50, s * 0.60), 0.56, 1.02, zb1 + 0.04, zb1 + 0.12)
        box('dock', M['rubber'], min(s * 0.70, s * 0.92), max(s * 0.70, s * 0.92), 0.98, 1.16, zb1 - 0.08, zb1 + 0.02, bevel=0.01)
    box('liftgate', M['alu'], -1.05, 1.05, 0.66, 0.92, zb1 + 0.20, zb1 + 0.62, bevel=0.01)
    for s in (1, -1):
        tube('lgArm', M['chassis'], (s * 0.75, 0.95, zb1 + 0.9), (s * 0.75, 0.75, zb1 + 0.3), 0.04, segs(10, 6, 4))
    for s in (1, -1):
        xs = sorted((s * 0.88, s * 1.08))
        lampbox(M, 'tail', ROLE['tail'], xs[0], xs[1], 1.02, 1.12, zb1 - 0.06, zb1 - 0.03, -1)
        lampbox(M, 'turnR', ROLE['rbl'] if s > 0 else ROLE['rbr'], xs[0], xs[1], 0.92, 1.01, zb1 - 0.06, zb1 - 0.03, -1)
        xr = sorted((s * 0.62, s * 0.74))
        lampbox(M, 'rev', ROLE['rev'], xr[0], xr[1], 0.98, 1.10, zb1 - 0.06, zb1 - 0.03, -1)
        # top rear clearance lamps (red, light with the tails), red reflectors low on the posts
        boxc('clrR', M['lamp'], (s * 1.17, 3.62, zb1 - 0.035), (0.06, 0.10, 0.03), lamp=ROLE['tail'])
        boxc('clrF', M['amber'], (s * (BW - 0.01), 3.70, zb0 - 0.05), (0.04, 0.06, 0.06), bevel=0.005)
        boxc('sideMk', M['amber'], (s * (BW + 0.014), 1.30, zb0 - 0.35), (0.015, 0.05, 0.10))
        boxc('sideMkR', M['redrefl'], (s * (BW + 0.014), 1.30, zb1 + 0.35), (0.015, 0.05, 0.10))
    for k in (-1, 0, 1):
        boxc('idR', M['lamp'], (k * 0.14, 3.62, zb1 - 0.035), (0.08, 0.04, 0.03), lamp=ROLE['tail'])
    plate(M, 0.0, 0.62, 0.008, 1)
    plate(M, 0.55, 0.74, zb1 - 0.005, -1)
    # the box's rounded front cap over the cab roof (fibreglass)
    capm = mat('detail:boxcap', (0.80, 0.80, 0.78), 0, 0.38)
    V.prism('boxCap', capm, [(zb0 - 0.02, 2.92), (zb0 + 0.16, 2.98), (zb0 + 0.26, 3.12), (zb0 + 0.30, 3.36), (zb0 + 0.28, 3.66), (zb0 + 0.20, 3.78), (zb0 - 0.02, y1 - 0.02)],
            -BW + 0.04, BW - 0.04, smooth=True, sharp=50, bevel=0.03)
    # wheels: front singles, rear duals
    for s, fid, rid in ((1, 1, 3), (-1, 2, 4)):
        wheel(M, fid, s * 0.985, R, zFh, s, R, Rr, TW, dual=False, disc='front')
        wheel(M, rid, s * 0.85, R, zRh, s, R, Rr, TW, dual=True, disc='rear')
    return dict(name='boxtruck26', front=0.0)


# ------------------------------------------------------------------ step van (walk-in, flat front)
def stepvan(food=False):
    M = MAT()
    L = 7.30                                    # overall body length, bumper face at z = 0
    zr = -L
    HW = 1.18                                   # body half width (2.36 m)
    R, Rr, TW = 0.405, 0.2477, 0.225            # 225/70R19.5
    zFh, WB = -0.92, 4.01                       # 158 in wheelbase; the front axle sits under the windshield
    zBh = -2.22                                 # the bulkhead behind the cab (the walk-in door is ahead of it)
    zRh = zFh - WB
    yB, yBelt, yRoof = 0.62, 1.38, 2.98

    def uv_paint(p, n):
        if abs(n[0]) > 0.6:
            return ((p[2] - zr) / L, p[1] / 3.0)
        return (0.97, 0.5)

    def uv_wrap(p, n):
        # foodtruck_wrap.png: top half = the left side (front at the image's left), bottom half = the right side
        if abs(n[0]) > 0.6:
            u = (p[2] - zr) / L
            return ((1 - u, 0.5 + 0.5 * p[1] / 3.0) if n[0] > 0 else (u, 0.5 * p[1] / 3.0))
        return (0.5, 0.12)
    if food:
        body = mat('paint:foodwrap', (1, 1, 1), 0, 0.35, tex='foodtruck_wrap.png')
        uv_paint = uv_wrap
    else:
        body = mat('paint:stepbody', (0.73, 0.73, 0.72), 0, 0.35, tex='stepvan_paint.png')
    roll = mat('detail:rollupdoor', (0.78, 0.78, 0.76), 0.0, 0.45, tex='rollup.png')

    def arch(zc, r, n):
        return [(zc + r * math.cos(math.pi * (1 - k / n)), max(yB, 0.40 + r * math.sin(math.pi * (1 - k / n)))) for k in range(n + 1)]
    na = segs(16, 10, 6)
    prof = [(-0.13, yB), (-0.13, 1.16), (-0.24, 1.25), (-0.58, yBelt), (zBh, yBelt), (zBh, 2.66), (zr + 0.0, 2.66), (zr, yB)]
    prof += arch(zRh, 0.54, na) + arch(zFh, 0.52, na)
    V.prism('body', body, prof, -HW, HW, uv=uv_paint, bevel=0.07, bseg=3, bangle=30)
    box('shelf', M['interior'], -HW + 0.05, HW - 0.05, yBelt, yBelt + 0.005, zBh + 0.02, -0.62)
    # roof with the rounded front cap (over the windshield) and the cab's door headers
    V.prism('roof', body, [(-0.665, 2.40), (-0.69, 2.58), (-0.77, 2.77), (-0.93, 2.91), (-1.22, yRoof), (zr, yRoof), (zr, 2.64), (zBh, 2.64), (zBh, 2.40)],
            -HW, HW, uv=uv_paint, bevel=0.06, bseg=3, bangle=25)
    for s in (1, -1):
        x0, x1 = (HW - 0.09, HW) if s > 0 else (-HW, -HW + 0.09)
        V.prism('aPil', body, [(-0.56, yBelt), (-0.80, yBelt), (-0.80, 2.42), (-0.66, 2.42)], x0, x1, uv=uv_paint, bevel=0.02)
        V.prism('bPil', body, [(-2.14, yBelt), (zBh - 0.02, yBelt), (zBh - 0.02, 2.66), (-2.14, 2.66)], x0, x1, uv=uv_paint, bevel=0.015)
        V.prism('dPil', body, [(-1.44, yBelt), (-1.52, yBelt), (-1.52, 2.42), (-1.44, 2.42)], x0, x1, uv=uv_paint, bevel=0.01)
    # windshield: two flat panes and the centre post
    for s in (1, -1):
        xa, xb = sorted((s * 0.025, s * (HW - 0.08)))
        V.quad('ws', M['glass'], [(xa, yBelt + 0.01, -0.575), (xb, yBelt + 0.01, -0.575), (xb, 2.39, -0.66), (xa, 2.39, -0.66)], (0, 0.1, 1))
    V.prism('wsPost', M['black'], [(-0.57, yBelt), (-0.60, yBelt), (-0.69, 2.41), (-0.66, 2.41)], -0.03, 0.03)
    # sliding pocket doors: window, door edges, handle; entry step in the body side under the door
    for s in (1, -1):
        xg = s * (HW - 0.01)
        V.quad('qtrG', M['glass'], [(xg, yBelt + 0.03, -0.82), (xg, yBelt + 0.03, -1.44), (xg, 2.37, -1.44), (xg, 2.37, -0.82)], (s, 0, 0))
        V.quad('doorG', M['glass'], [(xg, yBelt + 0.03, -1.55), (xg, yBelt + 0.03, -2.12), (xg, 2.37, -2.12), (xg, 2.37, -1.55)], (s, 0, 0))
        if LOD() < 2:
            xo = s * (HW + 0.002)
            for (z0, z1, y0, y1) in ((-1.51, -1.52, 0.66, yBelt), (-2.15, -2.16, 0.66, yBelt)):
                box('seam', M['void'], min(xo, xo + s * 0.003), max(xo, xo + s * 0.003), y0, y1, z1, z0)
            box('dHandle', M['chrome'], min(xo, xo + s * 0.025), max(xo, xo + s * 0.025), 1.18, 1.22, -2.12, -1.98, bevel=0.008)
            tube('grab', M['chrome'], (s * (HW + 0.035), 0.95, -2.24), (s * (HW + 0.035), 1.80, -2.24), 0.015, segs(10, 6, 4))
            box('stepWell', M['chassis'], min(s * (HW - 0.30), s * HW), max(s * (HW - 0.30), s * HW), 0.40, 0.46, -2.14, -1.54)
            # rub rail along the body (black), side markers
            box('rub', M['black'], min(s * HW, s * (HW + 0.03)), max(s * HW, s * (HW + 0.03)), 0.80, 0.86, zr + 0.15, zRh + 0.6, bevel=0.01)
            box('rub2', M['black'], min(s * HW, s * (HW + 0.03)), max(s * HW, s * (HW + 0.03)), 0.80, 0.86, zRh - 0.6, zBh, bevel=0.01)
            boxc('mkF', M['amber'], (s * (HW + 0.012), 0.95, zBh - 0.10), (0.02, 0.05, 0.09), bevel=0.005)
            boxc('mkR', M['lamp'], (s * (HW + 0.012), 0.95, zr + 0.25), (0.02, 0.05, 0.09), lamp=ROLE['tail'])
    # front: bumper, grille, round headlamps (two per side) and turn lamps, wipers, mirrors
    V.prism('bumper', M['chassis'], [(0.0, 0.40), (0.0, 0.66), (-0.04, 0.68), (-0.20, 0.68), (-0.20, 0.40)], -1.22, 1.22, bevel=0.015)
    if LOD() < 2:
        for k in range(segs(9, 4, 0)):
            box('bRib', M['satin'], -1.20, 1.20, 0.665, 0.672, -0.02 - k * 0.02, -0.012 - k * 0.02)
    box('grillePanel', M['satin'], -0.50, 0.50, 0.70, 1.12, -0.140, -0.128, bevel=0.01)
    for (a0, a1, b0, b1) in ((-0.50, 0.50, 1.10, 1.125), (-0.50, 0.50, 0.695, 0.72), (-0.505, -0.48, 0.70, 1.12), (0.48, 0.505, 0.70, 1.12)):
        box('gFrame', M['chrome'], a0, a1, b0, b1, -0.130, -0.122, bevel=0.004 if LOD() == 0 else 0)
    if LOD() < 2:
        for k in range(segs(7, 4, 0)):
            yk = 0.75 + k * 0.05
            box('gSlot', M['void'], -0.45, 0.45, yk, yk + 0.022, -0.1285, -0.126)
    for s in (1, -1):
        box('lampPanel', M['satin'], min(s * 0.54, s * 1.10), max(s * 0.54, s * 1.10), 0.82, 1.10, -0.145, -0.128, bevel=0.01)
        round_lamp(M, 'headO', ROLE['head'], s * 0.97, 0.96, -0.125, 0.085, 1, depth=0.04)
        round_lamp(M, 'headI', ROLE['head'], s * 0.71, 0.96, -0.125, 0.085, 1, depth=0.04)
        round_lamp(M, 'turnF', ROLE['fbl'] if s > 0 else ROLE['fbr'], s * 0.84, 0.76, -0.125, 0.045, 1, depth=0.03)
        tube('wiper', M['satin'], (s * 0.55, yBelt + 0.04, -0.585), (s * 0.55 - s * 0.10, 2.05, -0.63), 0.008, 6)
        west_coast_mirror(M, s, s * (HW - 0.02), 1.55, -0.72, s * (HW + 0.24), 1.70, 2.10, -0.70, wide=0.17)
    for k in (-1, 0, 1):
        boxc('idLamp', M['amber'], (k * 0.16, yRoof - 0.01, -1.15), (0.09, 0.03, 0.05), bevel=0.008)
    # rear: roll-up door in its frame, bumper with step, round tail lamps stacked on the corner posts
    for s in (1, -1):
        box('rPost', M['alu'], min(s * 1.02, s * HW), max(s * 1.02, s * HW), 0.62, 2.96, zr - 0.02, zr + 0.06, bevel=0.006)
    box('rHeader', M['alu'], -HW, HW, 2.50, 2.96, zr - 0.02, zr + 0.06, bevel=0.006)
    box('rSill', M['alu'], -HW, HW, 0.62, 0.80, zr - 0.03, zr + 0.06, bevel=0.006)
    nsl = segs(9, 5, 1)
    hs = (2.50 - 0.80) / nsl
    for k in range(nsl):
        ya = 0.80 + k * hs
        prof2 = [(zr + 0.04, ya + 0.004), (zr + 0.035, ya + 0.02), (zr + 0.028, ya + hs * 0.5), (zr + 0.035, ya + hs - 0.02), (zr + 0.04, ya + hs - 0.004), (zr + 0.06, ya + hs * 0.5)]
        V.prism('slat', roll, prof2, -1.02, 1.02, smooth=True, sharp=40, uv=lambda p, n: ((p[0] + 1.02) / 2.04, (p[1] - 0.62) / 1.9))
        if k and LOD() < 2:
            box('slatGap', M['void'], -1.02, 1.02, ya - 0.006, ya + 0.006, zr + 0.036, zr + 0.042)
    box('doorHandle', M['chrome'], -0.20, 0.20, 0.92, 0.95, zr + 0.005, zr + 0.03, bevel=0.008)
    V.prism('rBumper', M['chassis'], [(zr + 0.05, 0.38), (zr + 0.05, 0.60), (zr - 0.26, 0.60), (zr - 0.26, 0.44)], -1.10, 1.10, bevel=0.01)
    if LOD() < 2:
        for k in range(segs(10, 5, 0)):
            box('stepRib', M['satin'], -1.08, 1.08, 0.600, 0.608, zr - 0.24 + k * 0.026, zr - 0.232 + k * 0.026)
    for s in (1, -1):
        xc = s * 1.10
        round_lamp(M, 'tailA', ROLE['tail'], xc, 1.52, zr - 0.025, 0.06, -1, depth=0.03)
        round_lamp(M, 'tailB', ROLE['tail'], xc, 1.38, zr - 0.025, 0.06, -1, depth=0.03)
        round_lamp(M, 'turnR', ROLE['rbl'] if s > 0 else ROLE['rbr'], xc, 1.24, zr - 0.025, 0.06, -1, depth=0.03)
        round_lamp(M, 'rev', ROLE['rev'], xc, 1.10, zr - 0.025, 0.05, -1, depth=0.03)
        boxc('clrR', M['lamp'], (s * 1.08, 2.88, zr - 0.03), (0.07, 0.05, 0.03), lamp=ROLE['tail'])
    for k in (-1, 0, 1):
        boxc('idR', M['lamp'], (k * 0.14, 2.88, zr - 0.03), (0.08, 0.04, 0.03), lamp=ROLE['tail'])
    plate(M, 0.0, 0.53, 0.006, 1)
    plate(M, -0.55, 0.70, zr - 0.035, -1)
    # cab interior: driver's seat (left), jump seat, engine cover, dash, steering wheel, bulkhead with its door
    if LOD() < 2:
        seat(M, 0.62, yBelt + 0.05, -1.55, w=0.48, back=0.60)
        box('jump', M['seat'], -0.85, -0.45, yBelt - 0.05, yBelt + 0.02, -1.80, -1.50, bevel=0.03)
        box('doghouse', M['interior'], -0.30, 0.30, yBelt, yBelt + 0.25, -1.40, -0.62, bevel=0.06)
        box('dash', M['interior'], -HW + 0.08, HW - 0.08, yBelt, yBelt + 0.22, -0.80, -0.60, bevel=0.03)
        steering(M, 0.62, 1.86, -1.10, tilt=0.75)
        box('bulkhead', M['grey'], -HW + 0.06, HW - 0.06, yBelt, 2.62, zBh, zBh + 0.04)
        box('bhDoor', M['interior'], -0.35, 0.25, yBelt + 0.02, 2.30, zBh + 0.04, zBh + 0.05)
    # chassis under the body
    for s in (1, -1):
        box('rail', M['chassis'], min(s * 0.38, s * 0.46), max(s * 0.38, s * 0.46), 0.50, 0.70, zr + 0.3, -0.30)
    tube('fAxle', M['chassis'], (-0.95, R - 0.04, zFh), (0.95, R - 0.04, zFh), 0.055, segs(12, 8, 6))
    tube('rAxle', M['chassis'], (-0.78, R, zRh), (0.78, R, zRh), 0.07, segs(14, 8, 6))
    lathe('diff', M['chassis'], [(-0.20, 0.08), (-0.13, 0.19), (0.0, 0.22), (0.11, 0.17), (0.18, 0.08)], (0, R - 0.02, zRh), segs(18, 10, 6), axis='z', cap0=True, cap1=True, smooth=True)
    tube('dshaft', M['chassis'], (0, 0.45, -1.9), (0, R, zRh + 0.25), 0.04, segs(12, 8, 6))
    lathe('fuel', M['chassis'], [(0, 0), (0, 0.20), (0.8, 0.20), (0.8, 0)], (-0.70, 0.45, -2.2 - 0.8), segs(20, 10, 6), axis='z', smooth=True, sharp=60)
    for s in (1, -1):
        box('flap', M['rubber'], min(s * 0.60, s * 1.12), max(s * 0.60, s * 1.12), 0.16, 0.62, zRh - 0.60, zRh - 0.585)
    if food:
        food_parts(M, body, HW, zr, yRoof, yBelt)
    for s, fid, rid in ((1, 1, 3), (-1, 2, 4)):
        wheel(M, fid, s * 0.97, R, zFh, s, R, Rr, TW, dual=False, disc='front')
        wheel(M, rid, s * 0.80, R, zRh, s, R, Rr, TW, dual=True, disc='rear')
    return dict(name='stepvan')


def food_parts(M, body, HW, zr, yRoof, yBelt):
    """the food truck's equipment on the step van: kerb-side serving window (frame, kitchen, sliding pane, counter),
    the hinged awning on its props, roof exhaust hoods and an AC unit, propane tanks and the generator at the rear"""
    kitchen = mat('detail:kitchen', (0.5, 0.5, 0.5), 0.3, 0.5, tex='foodtruck_kitchen.png')
    steel = mat('detail:stainless', (0.62, 0.63, 0.64), 1.0, 0.28)
    awn = mat('detail:awning', (0.20, 0.018, 0.016), 0, 0.5)
    z0, z1, y0, y1 = -4.60, -2.40, 1.45, 2.38
    x = -HW
    box('kitchen', kitchen, x - 0.004, x - 0.002, y0, y1, z0, z1,
        uv=lambda p, n: ((p[2] - z0) / (z1 - z0), (p[1] - y0) / (y1 - y0)))
    for (a0, a1, b0, b1) in ((z0 - 0.05, z0, y0 - 0.05, y1 + 0.05), (z1, z1 + 0.05, y0 - 0.05, y1 + 0.05), (z0, z1, y1, y1 + 0.05), (z0, z1, y0 - 0.05, y0)):
        box('wFrame', steel, x - 0.06, x + 0.005, b0, b1, a0, a1, bevel=0.006)
    V.quad('slide', M['glass'], [(x - 0.03, y0, z0), (x - 0.03, y0, (z0 + z1) / 2), (x - 0.03, y1, (z0 + z1) / 2), (x - 0.03, y1, z0)], (-1, 0, 0))
    box('counter', steel, x - 0.34, x, y0 - 0.05, y0 - 0.02, z0 - 0.05, z1 + 0.05, bevel=0.005)
    for zc in (z0 + 0.2, z1 - 0.2):
        V.prism('bracket', steel, [(x, y0 - 0.06), (x - 0.30, y0 - 0.06), (x, y0 - 0.32)], zc - 0.01, zc + 0.01, axis='z')
    # awning: a hinged flap 0.80 m deep raised 18 degrees, on two props
    V.prism('awning', awn, [(x - 0.01, y1 + 0.06), (x - 0.80, y1 + 0.32), (x - 0.80, y1 + 0.35), (x - 0.01, y1 + 0.09)], z0 - 0.10, z1 + 0.10, axis='z', bevel=0.008)
    for zc in (z0 - 0.02, z1 + 0.02):
        tube('prop', steel, (x - 0.01, y1 - 0.30, zc), (x - 0.74, y1 + 0.30, zc), 0.012, 8)
    if LOD() < 2:
        for k in range(8):
            zc = z0 + 0.1 + k * (z1 - z0 - 0.2) / 7
            box('awnLed', mat('detail:ledstrip', (0.9, 0.85, 0.7), 0, 0.3), x - 0.78, x - 0.70, y1 + 0.30, y1 + 0.31, zc - 0.04, zc + 0.04)
    # roof: two mushroom exhaust hoods over the line, a box fan, the AC unit
    for zc in (-3.0, -3.8):
        tube('ventPipe', steel, (-0.45, yRoof, zc), (-0.45, yRoof + 0.30, zc), 0.10, segs(16, 8, 6))
        lathe('ventCap', steel, [(0.30, 0.0), (0.30, 0.24), (0.36, 0.22), (0.42, 0.0)], (-0.45, yRoof, zc), segs(20, 10, 6), axis='y', cap0=False, smooth=True)
    box('fanBox', steel, 0.10, 0.70, yRoof, yRoof + 0.26, -3.75, -3.05, bevel=0.01)
    if LOD() < 2:
        for k in range(6):
            box('louvre', M['void'], 0.12, 0.68, yRoof + 0.05 + k * 0.035, yRoof + 0.065 + k * 0.035, -3.756, -3.745)
    box('ac', mat('detail:acunit', (0.62, 0.62, 0.60), 0, 0.5), -0.45, 0.45, yRoof, yRoof + 0.24, -6.2, -5.4, bevel=0.03)
    lathe('acFan', M['void'], [(0.0, 0.0), (0.0, 0.22)], (0, yRoof + 0.243, -5.8), segs(24, 12, 6), axis='y')
    # propane tanks in a cage on the rear bumper, the generator box beneath
    prop = mat('detail:propane', (0.70, 0.70, 0.68), 0.1, 0.45)
    for xc in (-0.35, 0.35):
        lathe('tank', prop, [(0.0, 0.0), (0.0, 0.15), (0.05, 0.16), (0.60, 0.16), (0.70, 0.12), (0.74, 0.05), (0.75, 0.0)], (xc, 0.60, zr - 0.15), segs(20, 10, 6), axis='y', smooth=True, sharp=50)
        tube('valve', M['chrome'], (xc, 1.35, zr - 0.15), (xc, 1.42, zr - 0.15), 0.03, 8)
    for xc in (-0.62, 0.0, 0.62):
        tube('cage', M['chassis'], (xc, 0.60, zr - 0.33), (xc, 1.30, zr - 0.33), 0.012, 6)
    tube('cageTop', M['chassis'], (-0.62, 1.30, zr - 0.33), (0.62, 1.30, zr - 0.33), 0.012, 6)
    box('gen', M['chassis'], -0.55, 0.55, 0.22, 0.58, zr + 0.10, zr + 0.90, bevel=0.015)


# ------------------------------------------------------------------ high-roof cargo van (148-in wheelbase)
def cargovan():
    M = MAT()
    L, HW = 5.98, 1.035
    zr = -L
    R, Rr, TW = 0.356, 0.2032, 0.235            # 235/65R16
    zFh, WB = -0.96, 3.76
    zRh = zFh - WB
    yB, yBelt = 0.50, 1.24
    clad = mat('detail:cladding', (0.03, 0.031, 0.033), 0, 0.68)

    def arch(zc, r, n):
        return [(zc + r * math.cos(math.pi * (1 - k / n)), max(yB, 0.36 + r * math.sin(math.pi * (1 - k / n)))) for k in range(n + 1)]
    na = segs(16, 10, 6)
    prof = [(-0.05, yB), (-0.06, 0.74), (-0.10, 0.93), (-0.20, 1.03), (-0.82, 1.20), (-0.90, yBelt), (-1.92, yBelt), (-1.92, 2.62),
            (zr + 0.02, 2.62), (zr, 2.55), (zr, yB)] + arch(zRh, 0.47, na) + arch(zFh, 0.46, na)
    V.prism('body', M['paint'], prof, -HW, HW, bevel=0.06, bseg=3, bangle=28)
    box('shelf', M['interior'], -HW + 0.05, HW - 0.05, yBelt, yBelt + 0.005, -1.90, -0.95)
    V.prism('roof', M['paint'], [(-1.50, 1.95), (-1.58, 2.05), (-1.74, 2.27), (-1.95, 2.55), (-2.15, 2.71), (-2.40, 2.78), (zr + 0.08, 2.78), (zr, 2.70), (zr, 2.58), (-1.92, 2.58), (-1.92, 1.95)],
            -HW + 0.03, HW - 0.03, bevel=0.07, bseg=3, bangle=25)
    for s in (1, -1):
        x0, x1 = (HW - 0.09, HW - 0.01) if s > 0 else (-HW + 0.01, -HW + 0.09)
        V.prism('aPil', M['paint'], [(-0.86, yBelt), (-0.98, yBelt), (-1.56, 1.97), (-1.47, 1.97)], x0, x1, bevel=0.02)
        V.prism('bPil', M['paint'], [(-1.84, yBelt), (-1.93, yBelt), (-1.93, 2.0), (-1.84, 2.0)], x0, x1, bevel=0.015)
    V.quad('ws', M['glass'], [(-HW + 0.07, yBelt + 0.01, -0.90), (HW - 0.07, yBelt + 0.01, -0.90), (HW - 0.08, 1.96, -1.50), (-HW + 0.08, 1.96, -1.50)], (0, 0.6, 1))
    for s in (1, -1):
        xg = s * (HW - 0.02)
        V.quad('doorG', M['glass'], [(xg, yBelt + 0.02, -0.98), (xg, yBelt + 0.02, -1.83), (xg, 1.95, -1.83), (xg, 1.95, -1.52)], (s, 0, 0))
    # rear doors: two windows with a dark partition behind
    for s in (1, -1):
        xa, xb = sorted((s * 0.06, s * 0.86))
        V.quad('rearG', M['glass'], [(xa, 1.55, zr - 0.004), (xb, 1.55, zr - 0.004), (xb, 2.25, zr - 0.004), (xa, 2.25, zr - 0.004)], (0, 0, -1))
    box('rearBack', M['interior'], -0.9, 0.9, 1.50, 2.30, zr + 0.003, zr + 0.01)
    # shut lines: front doors, sliding door (right side), rear doors
    if LOD() < 2:
        for s in (1, -1):
            xo = s * (HW + 0.002)
            lines = [(-0.93, -0.94, 0.55, yBelt), (-1.92, -1.93, 0.55, 2.0)]
            if s < 0:
                lines += [(-3.30, -3.31, 0.55, 2.45), (-1.97, -1.98, 0.55, 2.45)]
            for (z0, z1, y0, y1) in lines:
                box('seam', M['void'], min(xo, xo + s * 0.003), max(xo, xo + s * 0.003), y0, y1, z1, z0)
            box('dHandle', M['black'], min(xo, xo + s * 0.03), max(xo, xo + s * 0.03), 1.08, 1.12, -1.80, -1.62, bevel=0.01)
        box('slTrack', M['black'], -HW - 0.012, -HW, 1.62, 1.66, -4.40, -2.0)
        box('slHandle', M['black'], -HW - 0.03, -HW, 1.06, 1.10, -2.25, -2.05, bevel=0.01)
        box('rSeam', M['void'], -0.004, 0.004, 0.55, 2.55, zr - 0.003, zr - 0.001)
        box('rHandle', M['black'], 0.04, 0.22, 1.22, 1.26, zr - 0.03, zr - 0.002, bevel=0.01)
    # lower cladding and arch flares (black), bumpers, grille, lamps
    for s in (1, -1):
        xa, xb = sorted((s * (HW - 0.02), s * (HW + 0.015)))
        box('sill', clad, xa, xb, 0.48, 0.64, zRh + 0.50, zFh - 0.48, bevel=0.01)
        for zc, r in ((zFh, 0.47), (zRh, 0.48)):
            n2 = segs(14, 8, 4)
            pts = [(zc + (r + 0.05) * math.cos(math.pi * (1 - k / n2)), 0.36 + (r + 0.05) * math.sin(math.pi * (1 - k / n2))) for k in range(n2 + 1)]
            inner = [(zc + r * math.cos(math.pi * (1 - k / n2)), 0.36 + r * math.sin(math.pi * (1 - k / n2))) for k in range(n2 + 1)]
            ring = [p for p in pts if p[1] > yB - 0.02] + [p for p in reversed(inner) if p[1] > yB - 0.02]
            V.prism('flare', clad, ring, xa, xb, bevel=0.008)
    V.prism('fBumper', clad, [(0.0, 0.30), (0.0, 0.58), (-0.05, 0.64), (-0.32, 0.64), (-0.32, 0.30), (-0.05, 0.27)], -1.0, 1.0, bevel=0.03, bangle=30)
    V.prism('grille', M['satin'], [(-0.04, 0.66), (-0.06, 0.92), (-0.10, 0.96), (-0.12, 0.66)], -0.52, 0.52, bevel=0.01)
    if LOD() < 2:
        for k in range(segs(5, 3, 0)):
            yk = 0.69 + k * 0.05
            box('gBar', M['chrome'] if k == 2 else M['black'], -0.50, 0.50, yk, yk + 0.02, -0.065 + 0.008 * (k / 5), -0.045, bevel=0.003 if LOD() == 0 else 0)
    for s in (1, -1):
        xa, xb = sorted((s * 0.56, s * 0.98))
        V.prism('hl', M['lamp'], [(-0.06, 0.82), (-0.10, 0.98), (-0.40, 1.08), (-0.38, 0.92)], xa, xb, lamp=ROLE['head'], bevel=0.01)
        V.prism('hlT', M['lamp'], [(-0.25, 0.86), (-0.30, 0.99), (-0.42, 1.06), (-0.40, 0.90)], *sorted((s * 0.90, s * 1.0)), lamp=ROLE['fbl'] if s > 0 else ROLE['fbr'])
        round_lamp(M, 'fog', 0, s * 0.78, 0.40, 0.003, 0.045, 1, depth=0.03)
    box('rBumper', clad, -1.0, 1.0, 0.36, 0.56, zr - 0.18, zr + 0.06, bevel=0.02)
    if LOD() < 2:
        for k in range(segs(8, 4, 0)):
            box('stepRib', M['satin'], -0.35, 0.35, 0.56, 0.566, zr - 0.16 + k * 0.02, zr - 0.152 + k * 0.02)
    for s in (1, -1):
        xa, xb = sorted((s * 0.90, s * HW))
        lampbox(M, 'tail', ROLE['tail'], xa, xb, 1.18, 1.52, zr - 0.035, zr + 0.01, -1)
        lampbox(M, 'turnR', ROLE['rbl'] if s > 0 else ROLE['rbr'], xa, xb, 1.02, 1.17, zr - 0.035, zr + 0.01, -1)
        lampbox(M, 'rev', ROLE['rev'], xa, xb, 0.90, 1.01, zr - 0.035, zr + 0.01, -1)
    boxc('chmsl', M['lamp'], (0, 2.72, zr - 0.01), (0.40, 0.04, 0.03), lamp=ROLE['tail'])
    plate(M, 0.0, 0.46, 0.006, 1)
    plate(M, 0.0, 0.70, zr - 0.005, -1)
    # roof ribs
    if LOD() < 2:
        for k in range(segs(9, 4, 0)):
            zc = -2.6 - k * 0.36
            box('rib', M['paint'], -HW + 0.12, HW - 0.12, 2.78, 2.795, zc - 0.05, zc + 0.05, bevel=0.006 if LOD() == 0 else 0)
    # nose taper in plan: the bonnet and the bumper narrow toward the front (everything built so far)
    V.deform(lambda p: (p[0] * (1 - 0.085 * max(0.0, min(1.0, (p[2] + 0.95) / 0.95)) ** 1.4), p[1], p[2]))
    # mirrors on the doors: a tall black housing with a lower convex section
    for s in (1, -1):
        tube('mArm', M['black'], (s * (HW - 0.02), 1.30, -1.0), (s * (HW + 0.15), 1.32, -1.02), 0.02, 8)
        box('mHead', M['black'], *sorted((s * (HW + 0.12), s * (HW + 0.30))), 1.18, 1.52, -1.07, -0.98, bevel=0.02)
        V.quad('mGlass', M['mirror'], [(s * (HW + 0.13), 1.20, -1.072), (s * (HW + 0.29), 1.20, -1.072), (s * (HW + 0.29), 1.50, -1.072), (s * (HW + 0.13), 1.50, -1.072)], (0, 0, -1))
        tube('wiper', M['satin'], (s * 0.30, yBelt + 0.03, -0.93), (s * 0.30 - 0.50, 1.55, -1.18), 0.008, 6)
    # interior: two front seats, dash, steering wheel, the cargo partition
    if LOD() < 2:
        seat(M, 0.52, 0.98, -1.70, w=0.50, back=0.66)
        seat(M, -0.52, 0.98, -1.70, w=0.50, back=0.66)
        box('dash', M['interior'], -HW + 0.06, HW - 0.06, 1.02, 1.30, -1.18, -0.92, bevel=0.04)
        steering(M, 0.52, 1.36, -1.25, tilt=0.38, R=0.19)
        box('partition', M['grey'], -HW + 0.04, HW - 0.04, 0.6, 2.55, -2.10, -2.06)
    for s in (1, -1):
        box('rail', M['chassis'], *sorted((s * 0.42, s * 0.50)), 0.32, 0.46, zr + 0.3, -0.5)
    tube('rAxle', M['chassis'], (-0.75, R, zRh), (0.75, R, zRh), 0.05, segs(12, 8, 6))
    lathe('diff', M['chassis'], [(-0.16, 0.07), (-0.10, 0.15), (0.0, 0.17), (0.09, 0.13), (0.14, 0.06)], (0, R - 0.01, zRh), segs(16, 8, 6), axis='z', cap0=True, cap1=True, smooth=True)
    tube('dshaft', M['chassis'], (0, 0.36, -1.4), (0, R, zRh + 0.2), 0.035, segs(10, 6, 4))
    for s, fid, rid in ((1, 1, 3), (-1, 2, 4)):
        alloy_wheel(M, fid, s * 0.87, R, zFh, s, R, Rr, TW)
        alloy_wheel(M, rid, s * 0.85, R, zRh, s, R, Rr, TW)
    return dict(name='cargovan')


def alloy_wheel(M, wid, hx, hy, hz, side, R, Rr, W):
    """a passenger-van wheel: tyre, a steel rim with a black plastic full cover (the fleet-van look)"""
    n = segs(48, 24, 12)
    HUBS[wid] = dict(id=wid, p=[hx, hy, hz], r=R, w=W / 2 + 0.02)
    h = W / 2
    o = side
    prof = [(-h + 0.012, Rr + 0.012), (-h - 0.006, Rr + 0.04), (-h - 0.010, Rr + 0.55 * (R - Rr)), (-h - 0.002, R - 0.03),
            (-h + 0.02, R - 0.003), (h - 0.02, R - 0.003), (h + 0.002, R - 0.03), (h + 0.010, Rr + 0.55 * (R - Rr)), (h + 0.006, Rr + 0.04), (h - 0.012, Rr + 0.012)]
    if LOD() > 0:
        prof = [prof[0], prof[2], prof[4], prof[5], prof[7], prof[9]]
    lathe(f'tyre{wid}', M['rubber'], [(a * o, r) for (a, r) in prof], (hx, hy, hz), n, wheel=wid, smooth=True, sharp=50)
    lathe(f'rim{wid}', M['steel'], [(-0.4 * W * o, Rr - 0.005), (0.42 * W * o, Rr - 0.005), (0.45 * W * o, Rr + 0.01), (0.40 * W * o, Rr - 0.02), (0.30 * W * o, Rr - 0.03)],
          (hx, hy, hz), segs(36, 18, 8), wheel=wid, smooth=True)
    # hub cover: a dished black disc with five raised spokes and a centre cap
    lathe(f'cover{wid}', M['satin'], [(0.30 * W * o, Rr - 0.03), (0.36 * W * o, 0.80 * Rr), (0.40 * W * o, 0.45 * Rr), (0.43 * W * o, 0.30 * Rr), (0.45 * W * o, 0.0)],
          (hx, hy, hz), segs(36, 18, 8), wheel=wid, smooth=True, cap1=False)
    if LOD() < 2:
        for j in range(5):
            t = 2 * math.pi * j / 5
            c, s_ = math.cos(t), math.sin(t)
            r0, r1 = 0.33 * Rr, 0.88 * Rr
            pts = []
            for (rr, ww) in ((r0, 0.035), (r1, 0.05)):
                pts.append((rr * c - ww * s_, rr * s_ + ww * c))
                pts.append((rr * c + ww * s_, rr * s_ - ww * c))
            x0 = hx + 0.395 * W * o
            x1 = hx + 0.425 * W * o
            # a raised spoke between the two radii (a thin prism across the wheel face)
            v = []
            for xx in (x0, x1):
                for (a, b) in (pts[0], pts[1], pts[3], pts[2]):
                    v.append((xx, hy + a, hz + b))
            make(f'spoke{wid}{j}', v, [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)], M['satin'], wheel=wid)
        lathe(f'cap{wid}', M['chrome'], [(0.44 * W * o, 0.05), (0.47 * W * o, 0.04), (0.48 * W * o, 0.0)], (hx, hy, hz), 16, wheel=wid, smooth=True)


# ------------------------------------------------------------------ soft-serve truck on a cutaway van chassis
def icecream():
    M = MAT()
    L, HW, BW = 6.80, 1.035, 1.15
    zr = -L
    R, Rr, TW = 0.372, 0.2032, 0.225            # 225/75R16, rear duals
    zFh, WB = -0.96, 4.01
    zRh = zFh - WB
    yB, yBelt = 0.50, 1.24
    clad = mat('detail:cladding', (0.03, 0.031, 0.033), 0, 0.68)
    wrap = mat('paint:icewrap', (1, 1, 1), 0, 0.3, tex='icecream_wrap.png')
    win = mat('detail:icewindow', (0.7, 0.7, 0.7), 0.0, 0.4, tex='icecream_window.png')

    def uv_wrap(p, n):
        if abs(n[0]) > 0.6:
            u = (p[2] - zr) / L
            return ((1 - u, 0.5 + 0.5 * p[1] / 3.0) if n[0] > 0 else (u, 0.5 * p[1] / 3.0))
        return (0.5, 0.40)           # the white band
    def uv_white(p, n):
        return (0.5, 0.40)

    def arch(zc, r, n, yb):
        return [(zc + r * math.cos(math.pi * (1 - k / n)), max(yb, 0.36 + r * math.sin(math.pi * (1 - k / n)))) for k in range(n + 1)]
    na = segs(16, 10, 6)
    # cab (cutaway van front)
    prof = [(-0.05, yB), (-0.06, 0.74), (-0.10, 0.93), (-0.20, 1.03), (-0.82, 1.20), (-0.90, yBelt), (-1.97, yBelt), (-1.97, yB)] + arch(zFh, 0.46, na, yB)
    V.prism('cab', wrap, prof, -HW, HW, uv=uv_white, bevel=0.06, bseg=3, bangle=28)
    box('shelf', M['interior'], -HW + 0.05, HW - 0.05, yBelt, yBelt + 0.005, -1.95, -0.95)
    V.prism('cabRoof', wrap, [(-1.50, 1.95), (-1.58, 2.04), (-1.72, 2.10), (-1.97, 2.10), (-1.97, 1.95)], -HW + 0.03, HW - 0.03, uv=uv_white, bevel=0.05, bseg=2)
    for s in (1, -1):
        x0, x1 = (HW - 0.09, HW - 0.01) if s > 0 else (-HW + 0.01, -HW + 0.09)
        V.prism('aPil', wrap, [(-0.86, yBelt), (-0.98, yBelt), (-1.56, 1.97), (-1.47, 1.97)], x0, x1, uv=uv_white, bevel=0.02)
        V.prism('bPil', wrap, [(-1.86, yBelt), (-1.97, yBelt), (-1.97, 2.0), (-1.86, 2.0)], x0, x1, uv=uv_white, bevel=0.015)
        xg = s * (HW - 0.02)
        V.quad('doorG', M['glass'], [(xg, yBelt + 0.02, -0.98), (xg, yBelt + 0.02, -1.85), (xg, 1.95, -1.85), (xg, 1.95, -1.52)], (s, 0, 0))
    V.quad('ws', M['glass'], [(-HW + 0.07, yBelt + 0.01, -0.90), (HW - 0.07, yBelt + 0.01, -0.90), (HW - 0.08, 1.96, -1.50), (-HW + 0.08, 1.96, -1.50)], (0, 0.6, 1))
    van_nose(M, clad)
    V.deform(lambda p: (p[0] * (1 - 0.085 * max(0.0, min(1.0, (p[2] + 0.95) / 0.95)) ** 1.4), p[1], p[2]))
    # box body with the cab-over nose cap
    yb0, yb1 = 0.80, 2.86
    pb = [(-1.98, yb0), (-1.98, 2.12), (-1.40, 2.14), (-1.44, 2.56), (-1.60, 2.80), (-1.98, yb1), (zr, yb1), (zr, yb0)]
    V.prism('box', wrap, pb, -BW, BW, uv=uv_wrap, bevel=0.05, bseg=3, bangle=30)
    box('boxSkirt', wrap, -BW + 0.05, BW - 0.05, 0.60, yb0, zr + 0.05, -2.0, uv=uv_white)
    # kerb-side serving windows: interior panel, chrome frames, sliding panes, a small counter
    chrome = M['chrome']
    for (a, b) in ((2.25, 3.30), (3.45, 4.45)):
        z0, z1 = zr + a, zr + b
        y0, y1 = 1.55, 2.35
        box('win', win, -BW - 0.004, -BW - 0.002, y0, y1, z0, z1, uv=lambda p, n, z0=z0, z1=z1: ((p[2] - z0) / (z1 - z0), (p[1] - 1.55) / 0.8))
        for (a0, a1, b0, b1) in ((z0 - 0.04, z0, y0 - 0.04, y1 + 0.04), (z1, z1 + 0.04, y0 - 0.04, y1 + 0.04), (z0, z1, y1, y1 + 0.04), (z0, z1, y0 - 0.04, y0)):
            box('wFrame', chrome, -BW - 0.04, -BW + 0.005, b0, b1, a0, a1, bevel=0.005)
        V.quad('slide', M['glass'], [(-BW - 0.025, y0, z0), (-BW - 0.025, y0, (z0 + z1) / 2), (-BW - 0.025, y1, (z0 + z1) / 2), (-BW - 0.025, y1, z0)], (-1, 0, 0))
        box('counter', chrome, -BW - 0.22, -BW, y0 - 0.05, y0 - 0.025, z0 - 0.03, z1 + 0.03, bevel=0.004)
    # chrome diamond-plate band along the lower box, rear corner guards, the rear bumper
    for s in (1, -1):
        box('dplate', chrome, *sorted((s * BW, s * (BW + 0.012))), yb0 - 0.20, yb0 + 0.22, zr + 0.02, -2.0, bevel=0.004)
        box('cornerG', chrome, *sorted((s * (BW - 0.10), s * (BW + 0.01))), yb0, yb1 - 0.05, zr - 0.012, zr + 0.10, bevel=0.004)
    box('rBumper', chrome, -1.12, 1.12, 0.40, 0.58, zr - 0.16, zr + 0.06, bevel=0.02)
    box('rDoorSeam', M['void'], -0.45, 0.45, 0.85, 2.40, zr - 0.003, zr - 0.001)
    box('rDoorIn', wrap, -0.43, 0.43, 0.87, 2.38, zr - 0.006, zr - 0.003, uv=uv_white)
    box('rHandle', chrome, 0.25, 0.38, 1.50, 1.54, zr - 0.03, zr - 0.006, bevel=0.008)
    for s in (1, -1):
        xc = s * 0.95
        round_lamp(M, 'tailA', ROLE['tail'], xc, 1.05, zr - 0.01, 0.06, -1, depth=0.03)
        round_lamp(M, 'turnR', ROLE['rbl'] if s > 0 else ROLE['rbr'], xc, 0.90, zr - 0.01, 0.05, -1, depth=0.03)
        round_lamp(M, 'tailT', ROLE['tail'], xc, 2.70, zr - 0.01, 0.05, -1, depth=0.03)
        boxc('clrF', M['amber'], (s * (BW - 0.06), 2.84, -1.62), (0.07, 0.03, 0.05), bevel=0.006)
    plate(M, 0.0, 0.46, 0.006, 1)
    plate(M, 0.0, 0.70, zr - 0.165, -1)
    # roof: a soft-serve cone sculpture over the cab
    cone = mat('detail:conewaffle', (0.62, 0.36, 0.13), 0, 0.6)
    cream = mat('detail:softserve', (0.86, 0.84, 0.78), 0, 0.35)
    n = segs(28, 14, 8)
    k = 0.55
    lathe('cone', cone, [(0.0, 0.0), (0.0, 0.03 * k), (0.62 * k, 0.21 * k), (0.66 * k, 0.23 * k), (0.68 * k, 0.0)], (0, yb1, -2.7), n, axis='y', smooth=True, sharp=50)
    lathe('swirl', cream, [(a * k, r * k) for (a, r) in ((0.66, 0.0), (0.66, 0.25), (0.74, 0.27), (0.82, 0.24), (0.86, 0.20), (0.92, 0.21), (0.98, 0.18), (1.03, 0.14),
                           (1.08, 0.15), (1.13, 0.11), (1.18, 0.07), (1.22, 0.035), (1.26, 0.0))], (0, yb1, -2.7), n, axis='y', smooth=True, sharp=70)
    # mirrors and wipers
    for s in (1, -1):
        tube('mArm', M['black'], (s * (HW - 0.02), 1.30, -1.0), (s * (HW + 0.15), 1.32, -1.02), 0.02, 8)
        box('mHead', M['black'], *sorted((s * (HW + 0.12), s * (HW + 0.30))), 1.18, 1.52, -1.07, -0.98, bevel=0.02)
        V.quad('mGlass', M['mirror'], [(s * (HW + 0.13), 1.20, -1.072), (s * (HW + 0.29), 1.20, -1.072), (s * (HW + 0.29), 1.50, -1.072), (s * (HW + 0.13), 1.50, -1.072)], (0, 0, -1))
        tube('wiper', M['satin'], (s * 0.30, yBelt + 0.03, -0.93), (s * 0.30 - 0.50, 1.55, -1.18), 0.008, 6)
    if LOD() < 2:
        seat(M, 0.52, 0.98, -1.70, w=0.50, back=0.66)
        seat(M, -0.52, 0.98, -1.70, w=0.50, back=0.66)
        box('dash', M['interior'], -HW + 0.06, HW - 0.06, 1.02, 1.30, -1.18, -0.92, bevel=0.04)
        steering(M, 0.52, 1.36, -1.25, tilt=0.38, R=0.19)
    for s in (1, -1):
        box('rail', M['chassis'], *sorted((s * 0.42, s * 0.50)), 0.40, 0.62, zr + 0.3, -0.5)
    tube('rAxle', M['chassis'], (-0.80, R, zRh), (0.80, R, zRh), 0.06, segs(12, 8, 6))
    for s, fid, rid in ((1, 1, 3), (-1, 2, 4)):
        alloy_wheel(M, fid, s * 0.87, R, zFh, s, R, Rr, TW)
        wheel(M, rid, s * 0.80, R, zRh, s, R, Rr, TW, dual=True, disc='rear')
    return dict(name='icecream')


def van_nose(M, clad):
    """the cargo-van front end (bumper, grille, lamps); call before the nose-taper deform"""
    V.prism('fBumper', clad, [(0.0, 0.30), (0.0, 0.58), (-0.05, 0.64), (-0.32, 0.64), (-0.32, 0.30), (-0.05, 0.27)], -1.0, 1.0, bevel=0.03, bangle=30)
    V.prism('grille', M['satin'], [(-0.04, 0.66), (-0.06, 0.92), (-0.10, 0.96), (-0.12, 0.66)], -0.52, 0.52, bevel=0.01)
    if LOD() < 2:
        for k in range(segs(5, 3, 0)):
            yk = 0.69 + k * 0.05
            box('gBar', M['chrome'] if k == 2 else M['black'], -0.50, 0.50, yk, yk + 0.02, -0.065 + 0.008 * (k / 5), -0.045, bevel=0.003 if LOD() == 0 else 0)
    for s in (1, -1):
        xa, xb = sorted((s * 0.56, s * 0.98))
        V.prism('hl', M['lamp'], [(-0.06, 0.82), (-0.10, 0.98), (-0.40, 1.08), (-0.38, 0.92)], xa, xb, lamp=ROLE['head'], bevel=0.01)
        V.prism('hlT', M['lamp'], [(-0.25, 0.86), (-0.30, 0.99), (-0.42, 1.06), (-0.40, 0.90)], *sorted((s * 0.90, s * 1.0)), lamp=ROLE['fbl'] if s > 0 else ROLE['fbr'])
        round_lamp(M, 'fog', 0, s * 0.78, 0.40, 0.003, 0.045, 1, depth=0.03)


BUILD = dict(boxtruck26=boxtruck26, stepvan=stepvan, cargovan=cargovan, foodtruck=lambda: stepvan(food=True), icecream=icecream)

# ------------------------------------------------------------------ build all LODs, centre, export
root = bpy.data.objects.new(KIND, None)
bpy.context.scene.collection.objects.link(root)
lods = []
for li in range(3):
    V.S['lod'] = li
    HUBS.clear()
    info = BUILD[KIND]()
    lods.append(V.finish_lod(f'LOD{li}', root))
# centre on the LOD0 envelope in x / z, ground at the lowest tyre point (y = 0 by construction)
import mathutils
bb0 = [1e9] * 3
bb1 = [-1e9] * 3
for v in lods[0].data.vertices:
    p = V.RT(v.co)
    for k in range(3):
        bb0[k] = min(bb0[k], p[k])
        bb1[k] = max(bb1[k], p[k])
# x stays as built (every kind is built symmetric about x = 0; a kerb-side awning or counter must not move the axles)
shift = (0.0, 0.0, -(bb0[2] + bb1[2]) / 2)
for ob in lods:
    ob.data.transform(mathutils.Matrix.Translation(V.BL(shift)))
hubs = []
for wid in sorted(HUBS):
    h = HUBS[wid]
    hubs.append(dict(id=wid, p=[round(h['p'][0] + shift[0], 4), round(h['p'][1], 4), round(h['p'][2] + shift[2], 4)], r=round(h['r'], 4), w=round(h['w'], 4)))
size = [round(2 * max(abs(bb0[0]), abs(bb1[0])), 3), round(bb1[1], 3), round(bb1[2] - bb0[2], 3)]
meta = dict(kind=KIND, size=size, hubs=hubs, wheelbase=round(abs(hubs[0]['p'][2] - hubs[2]['p'][2]), 3),
            tris=[V.tris_of(o) for o in lods])
json.dump(meta, open(META, 'w'), indent=1)
print('META', json.dumps(meta))
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=False, export_apply=True,
                          export_attributes=True, export_extras=False, export_yup=True, export_texcoords=True,
                          export_normals=True, export_materials='EXPORT', export_cameras=False, export_lights=False,
                          export_animations=False, export_skins=False, export_morph=False)
print('WROTE', OUT)
