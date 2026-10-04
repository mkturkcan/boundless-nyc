# BX-QA (AR34 BX, 2026-10-03): a Cycles take against the web take of the same shot, for surfaces whose colour is off.
#
#   python3 cyc_vs_web.py <cycles take dir> [--web <web take dir>] [--json out.json] [--sheet out.jpg [--sheetalways]]
#       [--step 1] [--frames a-b | a,b,c] [--t 0.7] [--area 0.004] [--tl 1.0] [--larea 0.02] [--quiet]
#
# A wrong texture or material on a surface (a texture of another harvest, a material family rule catching the wrong
# materials) changes the surface's hue or saturation far beyond what the two renderers' lighting does. Per frame, both
# frames (frame_%05d.jpg; the web take defaults to boundlessjs/shots/ad/clips/<shot>, a folder moved aside as
# _<shot>_<stamp> maps to its shot) are read at 640x360 and averaged to 160 x 90 cells (16 x 16 px at 2560x1440) in
# linear RGB; the Cycles frame is divided by the frame's exposure and white balance (per channel, the median Cycles / web
# ratio over the cells both frames expose: L* 8-97); then, per cell, the CIELAB chroma distance relative to lightness,
#     d = |(a*, b*)_cycles - (a*, b*)_web| / (mean L* + 10).
# At frame 50 the cells flagged on today's defects have a median d of 0.94 (t7ArchTrack's mustard paving), 1.60
# (t7DinoGlide's patterned walk and blue facade) and 0.81 (t7StreetGlide's olive facades); over all exposed cells the
# proofs reach p95 0.13-0.55, p99 0.32-0.73 (shade, bounce, the rig's tint). Cells over --t (0.7) count as off colour,
# except where both frames show foliage colours (the Blender tree set's crowns differ from the web's in tint by design).
# A surface gone near black (or white) keeps a low chroma: cells whose |L* difference| / (mean L* + 10) is over --tl
# (1.0, L* 60 against 10; one of the two lit, L* > 20) count as off lightness. Both maps get a 3 x 3 opening (no thin
# poles, edges, small cars). Traffic and walkers differ between the takes and pass through the frame; a surface stays: the
# take's scores are the medians over its frames of the two flagged areas (fractions of the frame), and the take fails
# when either is over its limit (--area 0.004, --larea 0.02).
# Calibration (2026-10-03, every frame of 26 takes): the five takes with another harvest's textures fail (off colour
# t7ApolloDive 5.70 %, t7StreetGlide 2.66 %, t7ArchTrack 1.53 %, t7DinoGlide 0.82 %; off lightness t7BladeCrane 4.44 %);
# the 15 others, BX-FIN's three proofs and three first-pass takes pass (off colour at most 0.26 %, off lightness at most
# 0.76 %). The sheet (web | cycles | flagged cells, magenta colour, cyan lightness) shows the three worst frames.
# Exit 0 pass, 1 fail, 2 nothing to compare (no web take, no common frames). docs/notes/ar34-bx-qa.md.
import os, sys, json, argparse
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
WEB_ROOT = os.path.normpath(os.path.join(HERE, '..', '..', '..', 'shots', 'ad', 'clips'))
GW, GH, FW, FH = 160, 90, 640, 360
M = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]], np.float32)
WP = np.array([0.95047, 1.0, 1.08883], np.float32)


def load(p):
    im = Image.open(p)
    im.draft('RGB', (FW, FH))
    im = im.convert('RGB')
    if im.size != (FW, FH): im = im.resize((FW, FH), Image.BOX)
    a = np.asarray(im, dtype=np.float32) / 255.0
    lin = np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)
    k = FW // GW
    return lin.reshape(GH, k, GW, k, 3).mean(axis=(1, 3))


def lab(lin):
    xyz = lin @ M.T / WP
    f = np.where(xyz > 0.008856, np.cbrt(np.maximum(xyz, 0)), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def foliage(L):
    h = np.degrees(np.arctan2(L[..., 2], L[..., 1]))
    return (h > 95) & (h < 200) & (np.hypot(L[..., 1], L[..., 2]) > 8)


def compare(pc, pw, t, tl):
    c, w = load(pc), load(pw)
    Lc, Lw = lab(c)[..., 0], lab(w)[..., 0]
    valid = (Lw > 8) & (Lw < 97) & (Lc > 8) & (Lc < 97)
    gain = np.exp(np.median(np.log(c[valid] + 1e-4) - np.log(w[valid] + 1e-4), axis=0)) if valid.sum() > 200 else np.ones(3, np.float32)
    A, B = lab(c / gain), lab(w)
    Lm = 0.5 * (A[..., 0] + B[..., 0])
    d = np.hypot(A[..., 1] - B[..., 1], A[..., 2] - B[..., 2]) / (Lm + 10)
    d = np.where(valid, d, 0)
    box = np.ones((3, 3), bool)
    m = ndi.binary_opening((d > t) & ~(foliage(A) & foliage(B)), structure=box)
    # a surface gone near black (or white) where the other target draws it mid-grey: |L* difference| over (mean L* + 10)
    # past --tl (1.0: L* 60 against 10); one of the two must be lit (L* > 20), neither clipped
    dl = np.abs(A[..., 0] - B[..., 0]) / (Lm + 10)
    ml = ndi.binary_opening((dl > tl) & (np.maximum(A[..., 0], B[..., 0]) > 20) & (A[..., 0] < 97) & (B[..., 0] < 97), structure=box)
    p95 = float(np.percentile(d[valid], 95)) if valid.any() else 0.0
    return m, ml, {'area': round(float(m.mean()), 5), 'larea': round(float(ml.mean()), 5), 'p95': round(p95, 3), 'valid': round(float(valid.mean()), 3),
                   'gain': [round(float(x), 3) for x in gain]}


def web_dir_for(cyc):
    """the web take of a Cycles take folder: clips/<shot>; a folder moved aside (_<shot>_<stamp>) maps to its shot"""
    name = os.path.basename(os.path.normpath(cyc))
    if os.path.isdir(os.path.join(WEB_ROOT, name)): return os.path.join(WEB_ROOT, name)
    bare = name.lstrip('_')
    cands = [d for d in os.listdir(WEB_ROOT) if bare == d or bare.startswith(d + '_')] if os.path.isdir(WEB_ROOT) else []
    return os.path.join(WEB_ROOT, max(cands, key=len)) if cands else None


def frame_list(cyc, web, spec, step):
    have = lambda d: {int(f[6:11]) for f in os.listdir(d) if f.startswith('frame_') and f.endswith('.jpg') and f[6:11].isdigit()}
    common = sorted(have(cyc) & have(web))
    if spec:
        want = set()
        for part in spec.split(','):
            a, _, b = part.partition('-')
            want |= set(range(int(a), int(b or a) + 1))
        common = [f for f in common if f in want]
    return common[::max(1, step)]


def sheet(cyc, web, frames, masks, lmasks, out, W=640, H=360):
    rows = []
    for f in frames:
        iw = Image.open(os.path.join(web, f'frame_{f:05d}.jpg')).convert('RGB').resize((W, H), Image.BILINEAR)
        ic = Image.open(os.path.join(cyc, f'frame_{f:05d}.jpg')).convert('RGB').resize((W, H), Image.BILINEAR)
        up = lambda x: np.asarray(Image.fromarray(x.astype(np.uint8) * 255).resize((W, H), Image.NEAREST)) > 0
        ov = np.asarray(ic).copy()
        for mm, col in ((up(lmasks[f]), (0, 255, 255)), (up(masks[f]), (255, 0, 255))):
            ov[mm] = (0.45 * ov[mm] + 0.55 * np.array(col)).astype(np.uint8)
        r = Image.new('RGB', (3 * W, H))
        for i, im in enumerate((iw, ic, Image.fromarray(ov))): r.paste(im, (i * W, 0))
        d = ImageDraw.Draw(r)
        for i, lbl in enumerate(('web', 'cycles', f'frame {f}: off colour (magenta) {masks[f].mean() * 100:.1f} %, off lightness (cyan) {lmasks[f].mean() * 100:.1f} %')): d.text((i * W + 8, 8), lbl, fill=(255, 255, 0))
        rows.append(r)
    im = Image.new('RGB', (3 * W, H * len(rows)))
    for i, r in enumerate(rows): im.paste(r, (0, i * H))
    im.save(out, quality=85)


def main():
    ap = argparse.ArgumentParser(description='Cycles take against the web take: surfaces whose hue / saturation is off')
    ap.add_argument('cyc')
    ap.add_argument('--web')
    ap.add_argument('--json')
    ap.add_argument('--sheet', help='web | cycles | flagged cells at the three worst frames (written for a failing take, or always with --sheetalways)')
    ap.add_argument('--sheetalways', action='store_true')
    ap.add_argument('--frames')
    ap.add_argument('--step', type=int, default=1)
    ap.add_argument('--t', type=float, default=0.7, help='per-cell chroma distance over lightness that counts as off-colour')
    ap.add_argument('--area', type=float, default=0.004, help='the take fails when its median off-colour area (fraction of the frame) is over this')
    ap.add_argument('--tl', type=float, default=1.0, help='per-cell lightness difference over lightness that counts as off-lightness')
    ap.add_argument('--larea', type=float, default=0.02, help='... or when its median off-lightness area is over this')
    ap.add_argument('--quiet', action='store_true')
    a = ap.parse_args()
    web = a.web or web_dir_for(a.cyc)
    res = {'cyc': os.path.abspath(a.cyc), 'web': os.path.abspath(web) if web else None, 't': a.t, 'area_max': a.area, 'tl': a.tl, 'larea_max': a.larea}
    frames = frame_list(a.cyc, web, a.frames, a.step) if web and os.path.isdir(web) and os.path.isdir(a.cyc) else []
    if not frames:
        res.update({'pass': None, 'reason': 'no web take or no common frames'})
        print(f'cyc_vs_web {os.path.basename(os.path.normpath(a.cyc))}: nothing to compare ({res["reason"]})')
        if a.json: json.dump(res, open(a.json, 'w'), indent=1)
        sys.exit(2)
    per, masks, lmasks = {}, {}, {}
    for f in frames:
        m, ml, s = compare(os.path.join(a.cyc, f'frame_{f:05d}.jpg'), os.path.join(web, f'frame_{f:05d}.jpg'), a.t, a.tl)
        per[f], masks[f], lmasks[f] = s, m, ml
    areas = np.array([per[f]['area'] for f in frames]); lareas = np.array([per[f]['larea'] for f in frames])
    score, lscore = float(np.median(areas)), float(np.median(lareas))
    worst = sorted(frames, key=lambda f: -(per[f]['area'] / a.area + per[f]['larea'] / a.larea))[:3]
    ok = score <= a.area and lscore <= a.larea
    res.update({'pass': bool(ok), 'score': round(score, 5), 'lscore': round(lscore, 5), 'frames': len(frames),
                'q75': round(float(np.percentile(areas, 75)), 5), 'lq75': round(float(np.percentile(lareas, 75)), 5),
                'worst': [{'frame': f, **per[f]} for f in worst],
                'per_frame': {str(f): [per[f]['area'], per[f]['larea']] for f in frames}})
    if a.sheet and (not ok or a.sheetalways):
        sheet(a.cyc, web, sorted(worst), masks, lmasks, a.sheet)
        res['sheet'] = os.path.abspath(a.sheet)
    if a.json: json.dump(res, open(a.json, 'w'), indent=1)
    if not a.quiet or not ok:
        print(f'cyc_vs_web {os.path.basename(os.path.normpath(a.cyc))}: {"PASS" if ok else "FAIL"} median off-colour area {score * 100:.2f} % '
              f'(limit {a.area * 100:.2f} %), off-lightness {lscore * 100:.2f} % (limit {a.larea * 100:.2f} %); worst frames {", ".join(str(f) for f in worst)}; {len(frames)} frames')
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
