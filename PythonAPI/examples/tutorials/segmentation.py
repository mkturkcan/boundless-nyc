"""Semantic and instance segmentation: RGB, semantic and instance cameras at one pose above W 125th St and Lenox Ave.
Saves the class-palette mask, the raw class ids, the instance codes with their labels, and a colour-per-instance view;
prints the classes in view and the largest objects. Needs numpy.

    python segmentation.py [--host 127.0.0.1] [--port 2000] [--out _out/segmentation]
"""
import argparse
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))   # run from a source checkout
import boundless  # noqa: E402
from boundless import Location, Rotation, Transform  # noqa: E402
from boundless.png import write_png  # noqa: E402

LENOX_125 = (40.80776, -73.94549)          # W 125th St & Lenox Ave, Harlem


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=2000)
    ap.add_argument("--out", default="_out/segmentation")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)

    client = boundless.Client(a.host, a.port)
    client.set_timeout(120.0)
    world = client.get_world()
    original = world.get_settings()
    world.apply_settings(boundless.WorldSettings(synchronous_mode=True, fixed_delta_seconds=0.05))
    m = world.get_map()
    here = m.geolocation_to_location(*LENOX_125)
    world.get_spectator().set_transform(Transform(here + Location(0, 0, 30)))
    world.wait_until_loaded()
    junction = m.get_junctions(center=here, radius=40)[0]

    # three cameras with the same pose and field of view share one capture per tick
    pose = Transform(junction.location + Location(-45, -40, 16), Rotation(pitch=-14, yaw=42))
    lib = world.get_blueprint_library()
    latest, cameras = {}, []
    for kind in ("rgb", "semantic_segmentation", "instance_segmentation"):
        bp = lib.find("sensor.camera." + kind)
        bp.set_attribute("fov", 75)
        cam = world.spawn_actor(bp, pose)
        cam.listen(lambda data, kind=kind: latest.__setitem__(kind, data))
        cameras.append(cam)

    try:
        for _ in range(40):
            world.tick()
        rgb, sem, inst = latest["rgb"], latest["semantic_segmentation"], latest["instance_segmentation"]
        assert rgb.frame == sem.frame == inst.frame          # the three images are of the same step
        rgb.save_to_disk(os.path.join(a.out, "rgb.png"))
        sem.save_to_disk(os.path.join(a.out, "semantic.png"))                      # class palette
        sem.save_to_disk(os.path.join(a.out, "semantic_ids.png"), colorize=False)  # one byte per pixel: the class id
        inst.save_to_disk(os.path.join(a.out, "instance.png"))                     # 24-bit instance codes + instance.json

        classes = world.get_semantic_classes()                 # [{id, name, rgb, isthing}]
        with open(os.path.join(a.out, "classes.json"), "w", encoding="utf-8") as f:
            json.dump(classes, f, indent=1)
        ids = sem.to_numpy()                                   # (H, W) uint8 class ids
        share = np.bincount(ids.ravel(), minlength=256) / ids.size
        print("classes in view:")
        for c in sorted(classes, key=lambda c: -share[c["id"]]):
            if share[c["id"]] >= 0.001:
                print(f"  {c['id']:2d} {c['name']:22s} rgb {tuple(c['rgb'])}  {100 * share[c['id']]:5.1f} %")

        # per-instance ids (0: stuff and background); one random colour per object
        iid = inst.instance_ids()                              # (H, W) uint32
        uniq, inverse = np.unique(iid, return_inverse=True)
        colours = np.random.default_rng(7).integers(48, 256, size=(len(uniq), 3), dtype=np.uint8)
        colours[uniq == 0] = 0
        vis = colours[inverse.reshape(iid.shape)]
        write_png(os.path.join(a.out, "instance_colors.png"), inst.width, inst.height, np.ascontiguousarray(vis).tobytes(), 3)

        print(f"{len(inst.labels)} labelled objects; the largest:")
        for label in sorted(inst.labels, key=lambda l: -l.area)[:8]:
            pixels = int(inst.mask(label).sum())               # the object's mask from the id image
            print(f"  id {label.id:6d} {label.class_name:14s} bbox {label.bbox}  area {label.area}  mask {pixels}")
    finally:
        for cam in cameras:
            cam.destroy()
        world.apply_settings(original)


if __name__ == "__main__":
    main()
