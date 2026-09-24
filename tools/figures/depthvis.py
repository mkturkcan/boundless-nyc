"""Colour-map the metric depth captured by capture.py for figures: log scale between --near and --far metres, turbo
colour map (near = warm), sky dark. Reads <name>_depth.npy, writes <name>_depth_vis.png next to it.

    python tools/figures/depthvis.py docs/assets/figures/raw/sensors_depth.npy [--near 4 --far 180]
"""
import argparse
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "PythonAPI"))
from boundless.png import write_png  # noqa: E402
from capture import turbo  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("npy", nargs="+")
ap.add_argument("--near", type=float, default=4.0)
ap.add_argument("--far", type=float, default=180.0)
ap.add_argument("--sky", type=float, default=990.0, help="depths at or beyond this are sky")
a = ap.parse_args()
for p in a.npy:
    d = np.load(p)
    x = (np.log(np.clip(d, a.near, a.far)) - np.log(a.near)) / (np.log(a.far) - np.log(a.near))
    rgb = turbo(1.0 - x)
    rgb[d >= a.sky] = (14, 18, 26)
    out = p.replace("_depth.npy", "_depth_vis.png")
    write_png(out, d.shape[1], d.shape[0], np.ascontiguousarray(rgb).tobytes(), 3)
    q = np.percentile(d[d < a.sky], [5, 50, 95])
    print(f"{out}: depth p5/p50/p95 = {q[0]:.1f} / {q[1]:.1f} / {q[2]:.1f} m")
