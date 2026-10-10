# Shape of the 2020- Ford Police Interceptor Utility (shared by build_nypd.py and livery_nypd.py): published length,
# width, height and wheelbase (docs/notes/ar34-veh-services.md "Dimensions"); every curve here is ESTIMATED from the
# Commons photographs, not taken from drawings. Frame: +Z forward, +Y up, left side at +X, metres.
import math
def clamp(v, a, b): return a if v < a else b if v > b else v
def mix(a, b, t): return a + (b - a) * t
def smooth(t): t = clamp(t, 0, 1); return t * t * (3 - 2 * t)

L, HL, W = 5.05, 2.525, 2.004
HW = W / 2 - 0.002
WB = 3.025
ZF, ZR = 1.575, 1.575 - WB          # axles (front overhang 0.95 m, estimated)
TR = 0.3815                          # 255/60R18 (not verified)
HUBX = 0.85                          # track 1.70 m (not verified)
RA = 0.47                            # arch opening radius (estimated)

# ---------------------------------------------------------------- side and plan profiles
def hw_of(z):
    h = HW
    if z > 1.90: h -= 0.16 * ((z - 1.90) / (HL - 1.90)) ** 2.2
    if z < -2.15: h -= 0.07 * ((-2.15 - z) / (HL - 2.15)) ** 2
    return h
def yb_of(z):
    y = 0.215
    if z > 2.05: y += 0.17 * smooth((z - 2.05) / 0.47)
    if z < -2.10: y += 0.17 * smooth((-2.10 - z) / 0.42)
    return y
def belt_of(z):
    # side-glass sill: 1.17 m at the A-pillar rising to 1.25 m at the D-pillar, the quarter glass kicking up behind it
    b = 1.17 + 0.08 * clamp((1.0 - z) / 2.6, 0, 1)
    if z < -1.55: b += 0.06 * smooth((-1.55 - z) / 0.5)
    return b
# top silhouette on the centre line: (z, y) control points, piecewise linear (the stations are dense)
TOP = [(HL, 1.02), (2.47, 1.07), (2.40, 1.092), (2.00, 1.13), (1.60, 1.16), (1.30, 1.172), (1.00, 1.33), (0.70, 1.52),
       (0.50, 1.65), (0.36, 1.72), (0.20, 1.748), (-0.6, 1.758), (-1.6, 1.748), (-2.05, 1.732), (-2.12, 1.72),
       (-2.28, 1.52), (-2.40, 1.30), (-2.47, 1.27), (-HL, 1.24)]
def top_of(z):
    for (z0, y0), (z1, y1) in zip(TOP, TOP[1:]):
        if z1 <= z <= z0: return mix(y1, y0, (z - z1) / (z0 - z1) if z0 != z1 else 0)
    return TOP[-1][1] if z < 0 else TOP[0][1]
def arch_y(z, hz, r):
    d = abs(z - hz)
    return TR + 0.03 + math.sqrt(r * r - d * d) if d < r else -1
def clad_of(z):
    c = 0.42
    for hz in (ZF, ZR): c = max(c, arch_y(z, hz, RA + 0.075))
    c = max(c, 0.42 + 0.14 * smooth((z - 2.12) / 0.2), 0.42 + 0.14 * smooth((-2.18 - z) / 0.2))
    return c
def nose(y):     # fascia set-back (m) at height y: the upper fascia leans back, the chin tucks under
    return 0.11 * smooth((y - 0.62) / 0.45) + 0.05 * smooth((0.42 - y) / 0.18)
def tail(y):
    return 0.05 * smooth((y - 0.95) / 0.3) + 0.035 * smooth((0.42 - y) / 0.15)

def crease_of(z):
    """the shoulder crease under the side glass (ring row R_CREASE)"""
    return min(belt_of(z), top_of(z) - 0.004) - 0.022
