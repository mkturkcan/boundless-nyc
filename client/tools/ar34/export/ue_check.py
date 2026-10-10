# UE (AR34, 2026-10-07): a UE take against BOTH reference takes of its shot, the web take and the Cycles take, region by
# region (the regions are the UE take's own data pass: ue_frames.py writes <take>/_ue/regions/frame_%05d.png, ids in
# ue_families.json regions). Unlike cyc_vs_web.py nothing is normalised: the UE take must match the references as they are.
#
#   python ue_check.py <UE take dir> [--web <dir>] [--cyc <dir>] [--frames 0,54,107 | --step 6] [--json f] [--sheet f.jpg]
#
# Per frame, at 640 x 360 in CIELAB, for each region (sky, buildings, ground, vegetation, structure, and 'all' = every
# region but vehicles and sky), over the region's pixels (eroded by one pixel; vehicles and walkers move differently in
# each take and are left out):
#   band   the region's mean L*, a* and b* in UE must lie inside [min(web, cycles) - tol, max(web, cycles) + tol], tol L*
#          --tl (10), a* / b* --tab (5): a sky lit grey where both references are black, a cast over the whole frame;
#   bright the share of the region's pixels whose L* is over both references' by --dl (25) or more must stay under --share
#          (0.06): white bands, a road washed out under the lamps;
#   dark   the same, under both references: shade gone near black where both show grey steel and red brick.
# A region fails the take when it fails in more than a third of its frames (at least 1 % of the frame); the take fails
# when any region fails. Exit 0 pass, 1 fail, 2 nothing to compare (no regions, no reference frames).
# R3-PHYS (2026-10-07): with physical light the web take is no longer a lighting reference: --noweb compares the UE take
# with the Cycles take alone (both physical, lit alike: the band is the Cycles take's +- tol, the outliers against it); the
# light-independent checks against the web (flicker, z-fighting, pops, coplanar, missing objects, hue drift) stay with
# temporal_scan, the coplanar audit and cyc_vs_web.
import argparse, json, os
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.normpath(os.path.join(HERE, '..', '..', '..', 'shots', 'ad'))
IDS = json.load(open(os.path.join(HERE, 'ue_families.json')))['regions']['ids']
FW, FH = 640, 360
M = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]], np.float32)
WP = np.array([0.95047, 1.0, 1.08883], np.float32)
REGIONS = ['sky', 'buildings', 'ground', 'vegetation', 'structure', 'all']


def load(p):
    im = Image.open(p).convert('RGB')
    if im.size != (FW, FH): im = im.resize((FW, FH), Image.BOX)
    a = np.asarray(im, np.float32) / 255.0
    lin = np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)
    xyz = lin @ M.T / WP
    f = np.where(xyz > 0.008856, np.cbrt(np.maximum(xyz, 0)), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def regions(p):
    r = np.asarray(Image.open(p))
    if r.ndim == 3: r = r[..., 0]
    h, w = r.shape
    return r[(np.arange(FH) * h // FH + h // (2 * FH))[:, None], (np.arange(FW) * w // FW + w // (2 * FW))[None, :]]


def masks(reg):
    out = {}
    for name in REGIONS:
        if name == 'all': m = (reg != IDS['vehicles']) & (reg != IDS['sky']) & (reg != IDS['none'])
        else: m = reg == IDS[name]
        out[name] = ndi.binary_erosion(m, structure=np.ones((3, 3), bool))
    return out


def frame(ue, web, cyc, regp, A):
    U, Wb, C = load(ue), load(web), load(cyc)
    mk = masks(regions(regp))
    res, bad_px = {}, np.zeros((FH, FW), np.uint8)
    for name, m in mk.items():
        n = int(m.sum())
        if n < 0.01 * FW * FH: continue
        mu = [float(X[..., i][m].mean()) for X in (U, Wb, C) for i in range(3)]
        u, w, c = mu[0:3], mu[3:6], mu[6:9]
        dev, why = {}, []
        for i, (lab, tol) in enumerate((('L', A.tl), ('a', A.tab), ('b', A.tab))):
            lo, hi = min(w[i], c[i]) - tol, max(w[i], c[i]) + tol
            d = u[i] - hi if u[i] > hi else (u[i] - lo if u[i] < lo else 0.0)
            dev[lab] = round(d, 1)
            if d: why.append(f'{lab}* {u[i]:.0f} outside web {w[i]:.0f} / cycles {c[i]:.0f} by {d:+.0f}')
        Lu, Lw, Lc = U[..., 0], Wb[..., 0], C[..., 0]
        br = m & (Lu - np.maximum(Lw, Lc) > A.dl)
        dk = m & (np.minimum(Lw, Lc) - Lu > A.dl)
        sb, sd = float(br.sum()) / n, float(dk.sum()) / n
        if sb > A.share: why.append(f'{sb * 100:.0f} % of it brighter than both by {A.dl:.0f} L*')
        if sd > A.share: why.append(f'{sd * 100:.0f} % of it darker than both by {A.dl:.0f} L*')
        if name != 'all':
            bad_px[br] = 1; bad_px[dk] = 2
        res[name] = {'share': round(n / (FW * FH), 3), 'ue': [round(x, 1) for x in u], 'web': [round(x, 1) for x in w],
                     'cyc': [round(x, 1) for x in c], 'dev': dev, 'bright': round(sb, 3), 'dark': round(sd, 3), 'fail': bool(why), 'why': why}
    return res, bad_px


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('take'); ap.add_argument('--web'); ap.add_argument('--cyc')
    ap.add_argument('--frames'); ap.add_argument('--step', type=int, default=6)
    ap.add_argument('--tl', type=float, default=10.0); ap.add_argument('--tab', type=float, default=5.0)
    ap.add_argument('--dl', type=float, default=25.0); ap.add_argument('--share', type=float, default=0.06)
    ap.add_argument('--json'); ap.add_argument('--sheet')
    ap.add_argument('--noweb', action='store_true', help='R3-PHYS: the Cycles take as the only reference')
    A = ap.parse_args()
    shot = os.path.basename(os.path.normpath(A.take)).lstrip('_').split('_20')[0]
    web = A.web or os.path.join(SHOTS, 'clips', shot)
    cyc = A.cyc or os.path.join(SHOTS, 'clips_cyc', shot)
    if A.noweb: web = cyc   # R3-PHYS: one reference
    rdir = os.path.join(A.take, '_ue', 'regions')
    have = lambda d, ext='.jpg': {int(f[6:11]) for f in os.listdir(d) if f.startswith('frame_') and f.endswith(ext)} if os.path.isdir(d) else set()
    common = sorted(have(A.take) & have(web) & have(cyc) & have(rdir, '.png'))
    if A.frames:
        want = set()
        for part in A.frames.split(','):
            x, _, y = part.partition('-'); want |= set(range(int(x), int(y or x) + 1))
        common = [f for f in common if f in want]
    elif A.step > 1:
        common = common[::A.step] + ([common[-1]] if common and common[-1] not in common[::A.step] else [])
    if not common:
        print('UE_CHECK nothing to compare (regions, web or Cycles frames missing)')
        if A.json: json.dump({'pass': None, 'reason': 'nothing to compare'}, open(A.json, 'w'))
        return 2
    per, bad = {}, {}
    for f in common:
        nm = f'frame_{f:05d}'
        per[f], bad[f] = frame(os.path.join(A.take, nm + '.jpg'), os.path.join(web, nm + '.jpg'), os.path.join(cyc, nm + '.jpg'),
                               os.path.join(rdir, nm + '.png'), A)
    summary, why = {}, []
    for name in REGIONS:
        fr = [f for f in common if name in per[f]]
        if not fr: continue
        nf = sum(per[f][name]['fail'] for f in fr)
        med = lambda key, i=None: round(float(np.median([per[f][name][key][i] if i is not None else per[f][name][key] for f in fr])), 1)
        s = {'frames': len(fr), 'failed_frames': nf, 'fail': nf * 3 > len(fr),
             'L': [med('ue', 0), med('web', 0), med('cyc', 0)], 'a': [med('ue', 1), med('web', 1), med('cyc', 1)],
             'b': [med('ue', 2), med('web', 2), med('cyc', 2)], 'bright': med('bright'), 'dark': med('dark')}
        short = lambda w_: w_.split(' ')[0] if '*' in w_.split(' ')[0] else ('brighter' if 'brighter' in w_ else 'darker')
        s['why'] = sorted({short(w_) for f in fr for w_ in per[f][name]['why']})
        summary[name] = s
        if s['fail']:
            why.append(f"{name}: {nf}/{len(fr)} frames (UE L* {s['L'][0]}, a* {s['a'][0]}, b* {s['b'][0]} against web {s['L'][1]} / {s['a'][1]} / {s['b'][1]}, "
                       f"cycles {s['L'][2]} / {s['a'][2]} / {s['b'][2]}; brighter {s['bright'] * 100:.0f} %, darker {s['dark'] * 100:.0f} %)")
    ok = not why
    out = {'pass': ok, 'frames': common, 'regions': summary, 'why': why, 'web': None if A.noweb else web, 'cyc': cyc, 'refs': 'cycles' if A.noweb else 'web+cycles',
           'limits': {'tl': A.tl, 'tab': A.tab, 'dl': A.dl, 'share': A.share}}
    if A.sheet:
        worst = sorted(common, key=lambda f: -sum(r['fail'] for r in per[f].values()))[:3]
        rows = []
        for f in worst:
            nm = f'frame_{f:05d}.jpg'
            ims = [Image.open(os.path.join(d, nm)).convert('RGB').resize((FW, FH)) for d in (web, cyc, A.take)]
            ov = np.asarray(ims[2]).copy()
            for v_, col in ((1, (255, 0, 255)), (2, (0, 255, 255))):
                mm = bad[f] == v_
                ov[mm] = (0.45 * ov[mm] + 0.55 * np.array(col)).astype(np.uint8)
            r = Image.new('RGB', (4 * FW, FH)); dd = ImageDraw.Draw(r)
            for i, im in enumerate(ims + [Image.fromarray(ov)]): r.paste(im, (i * FW, 0))
            fails = ', '.join(k for k, v in per[f].items() if v['fail'])
            for i, t in enumerate(('cycles' if A.noweb else 'web', 'cycles', 'UE', f'frame {f}: brighter (magenta) / darker (cyan) than both; failing: {fails or "none"}')):
                dd.text((i * FW + 8, 8), t, fill=(255, 255, 0))
            rows.append(r)
        S = Image.new('RGB', (4 * FW, FH * len(rows)))
        for i, r in enumerate(rows): S.paste(r, (0, i * FH))
        S.save(A.sheet, quality=85); out['sheet'] = A.sheet
    if A.json: json.dump(out, open(A.json, 'w'), indent=1)
    print(f"UE_CHECK {'PASS' if ok else 'FAIL'} {len(common)} frames" + ('' if ok else ': ' + ' | '.join(why)))
    return 0 if ok else 1


if __name__ == '__main__':
    raise SystemExit(main())
