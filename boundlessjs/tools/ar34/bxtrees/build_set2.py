#!/usr/bin/env python3
# TREEUE (AR34, 2026-10-07): build the whole second tree set in parallel Blender processes (CPU work; no render).
#
#   python3 tools/ar34/bxtrees/build_set2.py [--jobs 16] [--out /data0/projectnyc_aux/assets/bxtrees2] [--trees a,b] [--noblend]
#
# Steps: the bark scans of the first set linked into <out>/tex (the ginkgo takes the oak scan, tinted), then
# build_trees2.py on --jobs chunks of the tree list, then the chunks' stats merged into <out>/trees.json and NOTICE.md.
import argparse, json, os, shutil, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser()
ap.add_argument('--jobs', type=int, default=16)
ap.add_argument('--out', default='/data0/projectnyc_aux/assets/bxtrees2')
ap.add_argument('--src', default='/data0/projectnyc_aux/assets/bxtrees')
ap.add_argument('--trees', default=None)
ap.add_argument('--noblend', action='store_true')
ap.add_argument('--blender', default=os.environ.get('BLENDER', '/data0/projectnyc_aux/.tools/blender/blender'))
a = ap.parse_args()
os.makedirs(f'{a.out}/tex', exist_ok=True)
# bark: hard links to the first set's CC0 scans
for f in os.listdir(f'{a.src}/tex'):
    if f.startswith('bark_'):
        dst = f'{a.out}/tex/{f}'
        if not os.path.exists(dst): os.link(f'{a.src}/tex/{f}', dst)
for k in ('col', 'nrm', 'rough', 'disp'):
    s, d = f'{a.src}/tex/bark_oak_{k}.jpg', f'{a.out}/tex/bark_ginkgo_{k}.jpg'
    if os.path.exists(s) and not os.path.exists(d): os.link(s, d)
if not a.trees:
    import re
    src = open(os.path.join(HERE, 'build_trees2.py')).read()
    ns = {}
    exec(re.search(r'^TREES = \(.*?\)\n', src, re.S | re.M).group(0), ns)
    trees = ns['TREES']
else:
    trees = a.trees.split(',')
# the bigger trees first, so the chunks finish together
order = {'l': 0, 'm': 1, 'y': 2}
trees = sorted(trees, key=lambda t: order[t.split('_')[1][0]])
chunks = [trees[i::a.jobs] for i in range(a.jobs) if trees[i::a.jobs]]
t0 = time.time()
procs = []
for i, ch in enumerate(chunks):
    cmd = [a.blender, '-b', '--factory-startup', '--python', os.path.join(HERE, 'build_trees2.py'), '--', '--trees', ','.join(ch),
           '--out', a.out, '--stats', f'{a.out}/stats_part{i}.json'] + (['--noblend'] if a.noblend else [])
    log = open(f'/data0/projectnyc_aux/tmp/treeue/build2_part{i}.log', 'w')
    procs.append(subprocess.Popen(cmd, stdout=log, stderr=subprocess.STDOUT, env=dict(os.environ, CUDA_VISIBLE_DEVICES='1')))
codes = [p.wait() for p in procs]
stats = {}
try: stats = json.load(open(f'{a.out}/trees.json'))
except Exception: pass
for i in range(len(chunks)):
    p = f'{a.out}/stats_part{i}.json'
    try: stats.update(json.load(open(p))); os.remove(p)
    except Exception as e: print('part', i, 'missing', e)
json.dump(dict(sorted(stats.items())), open(f'{a.out}/trees.json', 'w'), indent=1)
open(f'{a.out}/NOTICE.md', 'w').write(
    '# bxtrees2: the second street-tree set of BoundlessNYC\n\n'
    'Geometry: procedural, grown by tools/ar34/bxtrees/treegen.py and treegen2.py (BoundlessNYC), released under CC BY 4.0.\n'
    'The ginkgo leaf is drawn by tools/ar34/bxtrees/leaves2.py (BoundlessNYC, CC BY 4.0).\n\n'
    'Leaf scans (CC0, ambientCG): LeafSet010 (plane, maple), LeafSet016 (pin oak), LeafSet014 (zelkova, cherry), LeafSet024 (pear,\n'
    'linden, plum, ornamentals), LeafSet022 (honeylocust and sophora leaflets).\n'
    'Bark scans (CC0): Poly Haven japanese_sycamore (plane), bark_willow_02 (honeylocust), jolcham_oak_bark_01 (pin oak, ornamentals,\n'
    'ginkgo), japanese_zelkova_bark (zelkova), trident_maple_bark (maple), sakura_bark (cherry, plum); ambientCG Bark012 (pear),\n'
    'Bark001 (linden, sophora).\n')
print(json.dumps({'trees': len(trees), 'chunks': len(chunks), 'exit': codes, 'secs': round(time.time() - t0, 1)}))
