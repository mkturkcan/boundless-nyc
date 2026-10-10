# NYPD patrol car: 2020- Ford Police Interceptor Utility (Explorer U625 body), built from scratch.
#   blender --background --python build_nypd.py -- <out/nypd_raw.glb>     then: node pack.mjs nypd <out/nypd_raw.glb>
# Published dimensions (docs/notes/ar34-veh-services.md "Dimensions"): length 5.050 m, width 2.004 m, height 1.775 m,
# wheelbase 3.025 m. Everything else (overhangs, side and plan curves, lamp and stripe positions) is ESTIMATED from the
# Commons photographs listed in the notes, not taken from drawings.
# Frame (sim/fleet24.js): +Z forward, +Y up, left side at +X, origin at the ground centre, metres.
import bpy, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from svc_lib import *

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else os.path.join(HERE, 'out', 'nypd_raw.glb')
KIND = 'nypd'
LIVERY = os.path.join(TEX, 'nypd_livery.png')

from nypd_shape import *

# ring rows (index of the row a band starts at)
R_UNDER, R_ROCK, R_CURVE, R_CLAD, R_LOW, R_CONC, R_MID, R_SHOULDER, R_CREASE, R_BELT, R_WINM, R_WINT, R_DRIP, R_ROOF, R_CROWN = range(15)
def gh(z):
    top = top_of(z)
    return clamp((top - min(belt_of(z), top - 0.004)) / 0.28, 0, 1)
def ring(z):
    hw, yb, belt, top = hw_of(z), yb_of(z), belt_of(z), top_of(z)
    sh = min(belt, top - 0.004)
    g = gh(z)
    clad = clad_of(z)
    pts = [
        (0.0, yb), (hw - 0.10, yb), (hw - 0.022, yb + 0.05), (hw, clad), (hw - 0.004, max(clad + 0.03, 0.64)),
        (hw - 0.013, max(clad + 0.06, 0.78)), (hw - 0.006, max(clad + 0.09, 0.96)), (hw, max(clad + 0.12, 1.085)),
        (hw - 0.012, sh - 0.022), (hw - 0.045, sh),
        (mix(hw - 0.07, hw - 0.15, g), mix(sh + 0.002, sh + (top - sh) * 0.48, g)),
        (mix(hw - 0.09, hw - 0.235, g), mix(sh + 0.004, top - 0.07, g)),
        (mix(hw - 0.12, hw - 0.285, g), mix(sh + 0.008, top - 0.022, g)),
        (mix(hw * 0.55, hw * 0.52, g), mix(sh + 0.026, top + 0.004, g)), (0.0, mix(sh + 0.032, top + 0.010, g)),
    ]
    out = []
    for k, (x, y) in enumerate(pts):
        if k <= R_CURVE:
            for hz in (ZF, ZR):
                a = arch_y(z, hz, RA)
                if a > 0 and y < a: y = a
        out.append((x, y))
    # set-back of the fascia / tailgate per height near the ends
    wn = smooth((z - (HL - 0.5)) / 0.5); wt = smooth(((-HL + 0.45) - z) / 0.45)
    return [(x, y, z - nose(y) * wn + tail(y) * wt) for (x, y) in out]

def stations(n):
    zs = [-HL + L * (0.5 - 0.5 * math.cos(math.pi * i / n)) * 0.4 + L * (i / n) * 0.6 for i in range(n + 1)]
    for hz in (ZF, ZR):
        for d in (-RA - 0.075, -RA, RA, RA + 0.075): zs.append(hz + d)
    for zk in (1.30, 1.00, 0.40, 0.36, -0.44, -0.56, -1.38, -1.50, -2.05, -2.10, -2.40): zs.append(zk)
    return sorted(set(round(z, 4) for z in zs if -HL <= z <= HL))

def body_mat(zc, k, g):
    """material of the band between ring rows k and k+1 at station zc"""
    if k <= R_CURVE: return 'trim'                                # underbody, rocker curve, cladding
    if k < R_BELT: return 'paint'
    cabin = -2.40 <= zc <= 1.30
    if not cabin or g < 0.02: return 'paint'
    if k in (R_BELT, R_WINM):                                     # side glass band
        if zc > 1.0: return 'trim'                                # mirror sail
        if -0.56 <= zc <= -0.44 or -1.50 <= zc <= -1.38: return 'trim'   # B and C pillars
        if zc < -2.05: return 'paint'                             # D pillar
        return 'glass'
    if k == R_WINT:                                               # upper frame / A-pillar
        if zc < -2.05: return 'paint'
        return 'trim'
    if 0.40 <= zc <= 1.28: return 'glass'                         # windshield
    if -2.40 <= zc <= -2.10: return 'glass'                       # rear window
    return 'paint'

def livery_uv(p, n):
    x, y, z = p
    ax, ay, az = abs(n[0]), abs(n[1]), abs(n[2])
    if ax >= 0.55 * max(ay, az) and ax > 0.35:
        if n[0] > 0: return ((HL - z) / L, 0.55 + 0.45 * clamp(y / 1.8, 0, 1))
        return ((z + HL) / L, 0.10 + 0.45 * clamp(y / 1.8, 0, 1))
    if ay >= az:
        if z > 1.9: return (0.5 * clamp((x + 1.0) / 2.0, 0, 1), 0.10 * clamp((2.53 - z) / 0.53, 0, 1))
        return (0.25, 0.30)
    if n[2] < 0 and z < -2.2:
        return (0.5 + 0.5 * clamp((1.0 - x) / 2.0, 0, 1), 0.10 * clamp((y - 0.80) / 0.50, 0, 1))
    return (0.25, 0.30)

def body(kit, nst, inner):
    zs = stations(nst)
    R = [ring(z) for z in zs]
    paint, trim, glass = kit.part('paint', 'paint'), kit.part('trim', 'detail'), kit.part('glass', 'glass')
    inn = kit.part('interior', 'detail')
    for i in range(len(zs) - 1):
        r0, r1 = R[i], R[i + 1]
        zc = (zs[i] + zs[i + 1]) / 2
        g = gh(zc)
        for k in range(len(r0) - 1):
            m = body_mat(zc, k, g)
            for sgn in (1, -1):
                a = (sgn * r0[k][0], r0[k][1], r0[k][2]); b = (sgn * r0[k + 1][0], r0[k + 1][1], r0[k + 1][2])
                c = (sgn * r1[k + 1][0], r1[k + 1][1], r1[k + 1][2]); d = (sgn * r1[k][0], r1[k][1], r1[k][2])
                ps = [a, b, c, d] if sgn > 0 else [a, d, c, b]
                if m == 'paint': poly(kit, paint, ps)
                elif m == 'trim': poly(kit, trim, ps, sw=5 if k >= R_BELT else 0)
                else:
                    poly(kit, glass, ps, sw=0)
                    if zc < -0.50 and k in (R_BELT, R_WINM):
                        # rear door and quarter glass: privacy tint, a second pane 2 cm inside the first
                        q = [(p[0] - math.copysign(0.02, p[0]), p[1], p[2]) for p in ps]
                        poly(kit, glass, q, sw=0)
                if inner and -2.32 < zc < 1.12 and (R_LOW <= k <= R_CREASE or k >= R_DRIP):
                    q = [(p[0] - math.copysign(0.05, p[0]) if abs(p[0]) > 0.06 else p[0], p[1] - (0.05 if k >= R_DRIP else 0), p[2]) for p in ps]
                    poly(kit, inn, q[::-1], sw=11 if k >= R_DRIP else 3)
    # end caps: bands between ring rows, left to right
    for (r, front) in ((R[0], False), (R[-1], True)):
        for k in range(len(r) - 1):
            (x0, y0, z0), (x1, y1, z1) = r[k], r[k + 1]
            ps = [(x0, y0, z0), (x1, y1, z1), (-x1, y1, z1), (-x0, y0, z0)]
            if not front: ps = ps[::-1]
            ps = [p for j, p in enumerate(ps) if not (abs(p[0]) < 1e-6 and any(abs(q[0]) < 1e-6 and q[1] == p[1] for q in ps[:j]))]
            if len(ps) < 3: continue
            if k <= R_CURVE: poly(kit, trim, ps, sw=0)
            else: poly(kit, paint, ps)

def fz(y):  return HL - nose(y)           # fascia surface z at height y (centre)
def rz(y):  return -HL + tail(y)

def wheels(kit, nseg, lod):
    tyre, rim, chrome = kit.part('tyre', 'detail'), kit.part('wheel_dtl', 'detail'), kit.part('chrome', 'detail')
    liner = kit.part('trim', 'detail')
    w2 = 0.255 / 2
    for wid, (hz, side) in enumerate([(ZF, 1), (ZF, -1), (ZR, 1), (ZR, -1)], start=1):
        hx = side * HUBX
        prof = [(-w2 + 0.012, 0.232), (-w2, 0.30), (-w2 + 0.012, 0.352), (-w2 + 0.04, TR - 0.003), (w2 - 0.04, TR - 0.003),
                (w2 - 0.012, 0.352), (w2, 0.30), (w2 - 0.012, 0.232)]
        if lod > 0: prof = [prof[0], prof[1], prof[3], prof[4], prof[6], prof[7]]
        lathe_x(kit, tyre, hx, TR, hz, prof, nseg, side, 1, wheel=wid)
        # steel wheel: rim lip and dish with the vent-hole face from the detail atlas (cell 2)
        uvf = (lambda q, hz=hz: cell_uv(2, 0.5 + (q[2] - hz) / 0.50, 0.5 - (q[1] - TR) / 0.50))
        rp = [(w2 - 0.012, 0.232), (w2 - 0.03, 0.222), (w2 - 0.055, 0.21), (w2 - 0.075, 0.16), (w2 - 0.072, 0.10)]
        if lod > 0: rp = [rp[0], rp[2], rp[4]]
        lathe_x(kit, rim, hx, TR, hz, rp, nseg, side, 5, wheel=wid, uvf=uvf)
        cp = [(w2 - 0.072, 0.10), (w2 - 0.058, 0.088), (w2 - 0.046, 0.06), (w2 - 0.041, 0.025), (w2 - 0.040, 0.0)]
        if lod > 0: cp = [cp[0], cp[2], cp[4]]
        lathe_x(kit, chrome, hx, TR, hz, cp, nseg, side, 2, wheel=wid)
        if lod == 0:
            for k in range(6):
                a = 2 * math.pi * k / 6 + 0.3
                box(kit, chrome, (hx + side * (w2 - 0.068), TR + 0.112 * math.sin(a), hz + 0.112 * math.cos(a)), (0.018, 0.024, 0.024), sw=2, wheel=wid)
        if lod < 2:
            # wheel-well liner: a dark half drum over the tyre
            for k in range(14):
                a0, a1 = math.pi * k / 14, math.pi * (k + 1) / 14
                r = RA + 0.005
                x0, x1 = hx - side * 0.24, hx + side * 0.17
                p = [(x0, TR + 0.03 + r * math.sin(a0), hz + r * math.cos(a0)), (x0, TR + 0.03 + r * math.sin(a1), hz + r * math.cos(a1)),
                     (x1, TR + 0.03 + r * math.sin(a1), hz + r * math.cos(a1)), (x1, TR + 0.03 + r * math.sin(a0), hz + r * math.cos(a0))]
                poly(kit, liner, p if side < 0 else p[::-1], sw=0)

def mirror_x(ps, sx):
    """a polygon authored for the left side (+X), mirrored to the right with its winding kept outward"""
    return ps if sx > 0 else [(-p[0], p[1], p[2]) for p in ps][::-1]

def front_rear(kit, lod):
    # the detail-atlas part carries the RMP plates: its name says 'plate' so fleet24.js adds no NY plate quads
    trim, dtl = kit.part('trim', 'detail'), kit.part('plate_dtl', 'detail')
    lamp, lens, inner = kit.part('lamp', 'lamp'), kit.part('lens', 'lens'), kit.part('lampInner', 'lampInner')
    chrome = kit.part('chrome', 'detail')
    # grille: trapezoid of hex mesh (detail atlas cell 0) on the fascia, with a frame proud of it
    yb_, yt_ = 0.64, 0.99
    wb_, wt_ = 0.50, 0.58
    nb = 7
    for j in range(nb):
        # horizontal bands following the curved fascia, 1.2 cm proud of it
        y0, y1 = mix(yb_, yt_, j / nb), mix(yb_, yt_, (j + 1) / nb)
        w0, w1 = mix(wb_, wt_, j / nb), mix(wb_, wt_, (j + 1) / nb)
        ps = [(-w0, y0, fz(y0) + 0.012), (w0, y0, fz(y0) + 0.012), (w1, y1, fz(y1) + 0.012), (-w1, y1, fz(y1) + 0.012)]
        poly(kit, dtl, ps, uvs=[cell_uv(0, 0.5 - w0 / (2 * wt_), 1 - j / nb), cell_uv(0, 0.5 + w0 / (2 * wt_), 1 - j / nb),
                               cell_uv(0, 0.5 + w1 / (2 * wt_), 1 - (j + 1) / nb), cell_uv(0, 0.5 - w1 / (2 * wt_), 1 - (j + 1) / nb)])
        for sx in (1, -1):
            # side frame strips
            a, b = (sx * w0, y0, fz(y0)), (sx * w1, y1, fz(y1))
            q = [a, b, (b[0], b[1], b[2] + 0.03), (a[0], a[1], a[2] + 0.03)]
            poly(kit, trim, q if sx > 0 else q[::-1], sw=5)
    for (y, w) in ((yb_, wb_), (yt_, wt_)):
        q = [(-w, y, fz(y)), (w, y, fz(y)), (w, y, fz(y) + 0.03), (-w, y, fz(y) + 0.03)]
        poly(kit, trim, q if y < 0.8 else q[::-1], sw=5)
    for sx in (1, -1):
        def P(x, y, back): return (x, y, fz(y) - back + 0.010)
        x0, x1 = 0.58, 0.80
        yl0, yl1 = 0.925, 1.010
        hs = [P(x0, yl0, 0.0), P(x1, yl0 + 0.012, 0.0), P(x1 + 0.02, yl1, 0.0), P(x0, yl1 - 0.004, 0.0)]
        poly(kit, inner, mirror_x(hs, sx), sw=5)
        poly(kit, lens, mirror_x([(p[0], p[1], p[2] + 0.012) for p in hs], sx), sw=0)
        led = [P(x0 + 0.02, yl1 - 0.026, -0.006), P(x1 - 0.01, yl1 - 0.02, -0.006), P(x1 - 0.01, yl1 - 0.008, -0.006), P(x0 + 0.02, yl1 - 0.013, -0.006)]
        poly(kit, lamp, mirror_x(led, sx), lamp=1)
        if lod == 0:
            for xe in (0.625, 0.705):
                c = (xe, 0.952, fz(0.952) + 0.018)
                n = 12
                poly(kit, lamp, mirror_x([(c[0] + 0.024 * math.cos(2 * math.pi * q / n), c[1] + 0.024 * math.sin(2 * math.pi * q / n), c[2]) for q in range(n)], sx), lamp=1)
        bl = [P(x1 - 0.045, yl0 + 0.014, -0.004), P(x1 + 0.005, yl0 + 0.018, -0.004), P(x1 + 0.012, yl1 - 0.01, -0.004), P(x1 - 0.045, yl1 - 0.012, -0.004)]
        poly(kit, lamp, mirror_x([(p[0], p[1], p[2] + 0.004) for p in bl], sx), lamp=2 if sx > 0 else 3)
        box(kit, trim, (sx * 0.64, 0.50, fz(0.50) - 0.012), (0.26, 0.10, 0.04), sw=5)          # fog-lamp pocket
    box(kit, trim, (0, 0.52, fz(0.52) - 0.012), (0.92, 0.12, 0.04), sw=5)                    # lower intake
    box(kit, trim, (0, 0.37, fz(0.37) - 0.02), (1.40, 0.06, 0.06), sw=0)                     # skid strip
    pz = fz(0.70) + 0.016
    poly(kit, dtl, [(-0.152, 0.625, pz), (0.152, 0.625, pz), (0.152, 0.777, pz), (-0.152, 0.777, pz)],
         uvs=[cell_uv(1, 0, 1), cell_uv(1, 1, 1), cell_uv(1, 1, 0), cell_uv(1, 0, 0)])
    # rear: tail lamps across the D-pillar corner, black lower bumper, roof spoiler, the plate on the tailgate
    for sx in (1, -1):
        def Q(x, y, fwd): return (x, y, rz(y) + fwd - 0.006)
        ts = [Q(0.95, 1.04, 0.10), Q(0.60, 1.04, 0.0), Q(0.60, 1.21, 0.0), Q(0.95, 1.20, 0.12)]
        poly(kit, inner, mirror_x(ts, sx), sw=5)
        poly(kit, lamp, mirror_x([(p[0], p[1], p[2] - 0.008) for p in ts], sx), lamp=4)
        poly(kit, lens, mirror_x([(p[0], p[1], p[2] - 0.016) for p in ts], sx), sw=0)
    box(kit, trim, (0, 0.45, rz(0.45) - 0.01), (1.78, 0.16, 0.06), sw=0)                     # rear bumper lower
    box(kit, trim, (0, top_of(-2.08) + 0.01, -2.09), (1.30, 0.035, 0.15), sw=5)              # roof spoiler
    pz = rz(0.88) - 0.016
    poly(kit, dtl, [(0.152, 0.81, pz), (-0.152, 0.81, pz), (-0.152, 0.962, pz), (0.152, 0.962, pz)],
         uvs=[cell_uv(1, 0, 1), cell_uv(1, 1, 1), cell_uv(1, 1, 0), cell_uv(1, 0, 0)])
    for sx in (1, -1):
        bevel_box(kit, trim, (sx * (HW + 0.085), 1.24, 1.02), (0.15, 0.16, 0.10), 0.03, sw=5, seg=2 if lod == 0 else 1)
        box(kit, trim, (sx * (HW + 0.01), 1.20, 1.04), (0.04, 0.05, 0.10), sw=5)
        if lod == 0:
            box(kit, kit.part('glass', 'glass'), (sx * (HW + 0.085), 1.24, 0.966), (0.12, 0.13, 0.006), sw=0)
    if lod == 0:
        for z in (0.16, -0.88):
            for sx in (1, -1):
                box(kit, trim, (sx * (HW + 0.004), 1.085, z), (0.014, 0.034, 0.17), sw=5)
    # spotlight on the right A-pillar (the refs: passenger side)
    lathe_x(kit, chrome, -(HW - 0.07), 1.32, 1.02, [(0.0, 0.0), (0.0, 0.065), (0.10, 0.065), (0.10, 0.0)], 14 if lod == 0 else 8, 1, 2)

def lightbar(kit, lod):
    """the NYPD roof bar: a flat black bar on two feet at the roof edges, seven domes, clear and red alternating"""
    trim, siren, lens, inner = kit.part('trim', 'detail'), kit.part('siren', 'siren'), kit.part('lens', 'lens'), kit.part('lampInner', 'lampInner')
    zc, y0 = 0.12, top_of(0.12)
    for sx in (1, -1):
        box(kit, trim, (sx * 0.64, y0 + 0.035, zc), (0.06, 0.07, 0.34), sw=5)
        box(kit, trim, (sx * 0.64, y0 + 0.004, zc), (0.10, 0.012, 0.40), sw=0)
    yb = y0 + 0.09
    box(kit, trim, (0, yb - 0.02, zc), (1.46, 0.04, 0.27), sw=5)
    n = 7
    for k in range(n):
        x = -0.60 + 1.20 * k / (n - 1)
        red = k % 2 == 1
        h, wx, wz = 0.105, 0.175, 0.215
        seg = 5 if lod == 0 else 1
        for j in range(seg):
            t0, t1 = j / seg, (j + 1) / seg
            s0, s1 = 1 - 0.28 * t0 ** 1.6, 1 - 0.28 * t1 ** 1.6
            ya, yb2 = yb + h * t0, yb + h * t1
            c = [(x - wx / 2 * s0, ya, zc - wz / 2 * s0), (x + wx / 2 * s0, ya, zc - wz / 2 * s0), (x + wx / 2 * s0, ya, zc + wz / 2 * s0), (x - wx / 2 * s0, ya, zc + wz / 2 * s0)]
            d = [(x - wx / 2 * s1, yb2, zc - wz / 2 * s1), (x + wx / 2 * s1, yb2, zc - wz / 2 * s1), (x + wx / 2 * s1, yb2, zc + wz / 2 * s1), (x - wx / 2 * s1, yb2, zc + wz / 2 * s1)]
            for q in range(4):
                ps = [c[(q + 1) % 4], c[q], d[q], d[(q + 1) % 4]]
                if red: poly(kit, siren, ps, sw=9, lamp=8)
                else: poly(kit, lens, ps, sw=0)
        top = [(x - wx / 2 * 0.72, yb + h, zc - wz / 2 * 0.72), (x + wx / 2 * 0.72, yb + h, zc - wz / 2 * 0.72), (x + wx / 2 * 0.72, yb + h, zc + wz / 2 * 0.72), (x - wx / 2 * 0.72, yb + h, zc + wz / 2 * 0.72)]
        if red: poly(kit, siren, top[::-1], sw=9, lamp=8)
        else:
            poly(kit, lens, top[::-1], sw=0)
            box(kit, inner, (x, yb + 0.045, zc), (0.11, 0.07, 0.13), sw=2)           # reflector under the clear dome

def interior(kit, lod):
    inn = kit.part('interior', 'detail')
    box(kit, inn, (0, 0.47, -0.55), (1.80, 0.04, 3.30), sw=3)                       # floor
    box(kit, inn, (0, 1.03, 0.88), (1.78, 0.20, 0.42), sw=3)                        # dashboard
    for sx in (1, -1):
        box(kit, inn, (sx * 0.40, 0.62, 0.08), (0.52, 0.14, 0.52), sw=4)
        box(kit, inn, (sx * 0.40, 0.99, -0.20), (0.50, 0.62, 0.12), sw=4)
        box(kit, inn, (sx * 0.40, 1.36, -0.21), (0.26, 0.16, 0.10), sw=4)
    box(kit, inn, (0, 0.62, -1.05), (1.50, 0.14, 0.52), sw=4)                       # rear bench (moulded)
    box(kit, inn, (0, 0.95, -1.33), (1.50, 0.62, 0.10), sw=4)
    box(kit, inn, (0, 1.06, -0.38), (1.62, 0.92, 0.025), sw=11 if lod == 0 else 3)   # prisoner partition
    box(kit, inn, (0.02, 1.08, 0.66), (0.30, 0.20, 0.03), sw=5)                     # the laptop on its mount
    if lod == 0:
        n = 18
        for k in range(n):
            a0 = 2 * math.pi * (k + 0.5) / n
            r = 0.19
            box(kit, inn, (0.38 + r * math.cos(a0), 1.13 + r * math.sin(a0) * 0.85, 0.66 - r * math.sin(a0) * 0.45), (0.035, 0.035, 0.035), sw=0)

root = start(KIND)
LODS = [(150, 48), (64, 20), (26, 10)]
for li, (nst, nseg) in enumerate(LODS):
    kit = Kit(KIND, livery_uv)
    body(kit, nst, inner=li < 2)
    wheels(kit, nseg, li)
    front_rear(kit, li)
    lightbar(kit, li)
    if li < 2: interior(kit, li)
    if li == 2: merge_into(kit, 'trim', ['tyre', 'chrome', 'lampInner'])
    emit(KIND, kit, f'L{li}', lod_node(root, li), LIVERY, sharp_deg={'paint': 40, 'glass': 40, 'interior': 40})
    print(f'LOD{li}', {k: len(p.f) for k, p in kit.parts.items()})

export(OUT, [{'id': i + 1, 'p': [round(sx * HUBX, 4), round(TR, 4), round(hz, 4)], 'r': round(TR, 4), 'w': round(0.255 / 2 + 0.02, 4)}
             for i, (hz, sx) in enumerate([(ZF, 1), (ZF, -1), (ZR, 1), (ZR, -1)])],
       'built from scratch in Blender (client/tools/ar34/vehicles/services/build_nypd.py)',
       {'model': '2020- Ford Police Interceptor Utility, NYPD patrol livery'})
