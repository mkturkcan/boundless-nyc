"""RGB, depth, semantic and instance segmentation from one camera pose, saved as images and per-pixel masks.

Writes rgb.png; depth.pfm (exact metres), depth_mm.png (16-bit millimetres) and depth_preview.png; semantic_ids.png
(one class id per pixel) and semantic_color.png; instance.png (24-bit instance codes) with instance.json (the labels);
masks/class_<name>.png for a few classes and masks/<id>_<class>.png for every vehicle and pedestrian; classes.json.
Needs numpy.

    python sensor_suite.py [--host 127.0.0.1] [--port 2000] [--out _out/sensor_suite]
"""
import argparse
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))   # run from a source checkout
import valdrada  # noqa: E402
from valdrada import Location, Rotation, Transform  # noqa: E402
from valdrada.png import write_png  # noqa: E402

AMSTERDAM_120 = (40.80955, -73.95905)   # W 120th St and Amsterdam Ave
SENSORS = ["rgb", "depth", "semantic_segmentation", "instance_segmentation"]
CLASS_MASKS = ["road", "sidewalk", "crosswalk", "car", "pedestrian", "vegetation"]
OBJECTS = {"car", "bus", "truck", "pedestrian"}


def save_mask(path, mask):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    h, w = mask.shape
    return write_png(path, w, h, (mask.astype(np.uint8) * 255).tobytes(), 1)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=2000)
    ap.add_argument("--out", default="_out/sensor_suite")
    a = ap.parse_args()

    client = valdrada.Client(a.host, a.port)
    client.set_timeout(120.0)
    world = client.get_world()
    original = world.get_settings()
    world.apply_settings(valdrada.WorldSettings(synchronous_mode=True, fixed_delta_seconds=0.05))

    here = world.get_map().geolocation_to_location(*AMSTERDAM_120)
    pose = Transform(here + Location(-28, -22, 9), Rotation(pitch=-17, yaw=40))
    world.get_spectator().set_transform(pose)
    print("loaded:", world.wait_until_loaded())

    # four cameras with the same pose, field of view and size: one render serves all four, so the outputs align
    lib = world.get_blueprint_library()
    data, cameras = {}, []
    for name in SENSORS:
        bp = lib.find("sensor.camera." + name)
        bp.set_attribute("fov", 90)
        cam = world.spawn_actor(bp, pose)
        cam.listen(lambda d, name=name: data.update({name: d}))
        cameras.append(cam)
    try:
        for _ in range(10):                      # settle the image history; every tick delivers all four
            frame = world.tick()
        assert all(d.frame == frame for d in data.values()), "every sensor delivers the same frame"
        rgb, depth, sem, inst = (data[n] for n in SENSORS)
        out = lambda name: os.path.join(a.out, name)

        rgb.save_to_disk(out("rgb.png"))
        depth.save_to_disk(out("depth.pfm"))
        depth.save_to_disk(out("depth_mm.png"))
        d = depth.to_numpy()
        preview = (255 * np.clip(1.0 - np.log1p(d) / np.log1p(300.0), 0, 1)).astype(np.uint8)   # near bright, far dark
        write_png(out("depth_preview.png"), depth.width, depth.height, preview.tobytes(), 1)
        sem.save_to_disk(out("semantic_ids.png"), colorize=False)
        sem.save_to_disk(out("semantic_color.png"))
        inst.save_to_disk(out("instance.png"))   # also writes instance.json
        with open(out("classes.json"), "w") as f:
            json.dump(world.get_semantic_classes(), f, indent=1)

        # per-pixel masks: a class mask from the semantic ids, an object mask from the instance ids
        ids = sem.to_numpy()
        by_name = {c["name"]: c["id"] for c in world.get_semantic_classes()}
        for name in CLASS_MASKS:
            save_mask(out(f"masks/class_{name}.png"), ids == by_name[name])
        inst_ids = inst.instance_ids()
        objects = [l for l in inst.labels if l.class_name in OBJECTS]
        for l in objects:
            save_mask(out(f"masks/{l.id}_{l.class_name}.png"), inst_ids == l.id)

        counts = np.bincount(ids.ravel(), minlength=256)
        names = {c["id"]: c["name"] for c in world.get_semantic_classes()}
        top = ", ".join(f"{names.get(i, i)} {100 * counts[i] / ids.size:.1f}%" for i in np.argsort(counts)[::-1][:6])
        print(f"frame {frame}: {rgb.width}x{rgb.height}, depth at the centre {d[d.shape[0] // 2, d.shape[1] // 2]:.1f} m")
        print("pixels by class:", top)
        print(f"{len(inst.labels)} labelled objects, {len(objects)} vehicles and pedestrians with a mask in {out('masks')}")
    finally:
        for cam in cameras:
            cam.destroy()
        world.apply_settings(original)


if __name__ == "__main__":
    main()
