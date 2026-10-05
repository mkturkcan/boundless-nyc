"""2D and 3D bounding boxes of vehicles and pedestrians from a pole camera at W 120th St and Amsterdam Ave, written
in two formats: COCO (coco/annotations.json) and KITTI (kitti/image_2, label_2, calib), with a preview of every frame
(preview/: visible 2D boxes, 3D boxes as wireframes). Needs numpy.

    python boxes_coco_kitti.py [--host 127.0.0.1] [--port 2000] [--out _out/boxes] [--frames 5]
"""
import argparse
import math
import os
import random
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))   # run from a source checkout
import boundless  # noqa: E402
from boundless import Location, Rotation, Transform, util  # noqa: E402
from boundless.png import write_png  # noqa: E402

AMSTERDAM_120 = (40.80955, -73.95905)   # W 120th St and Amsterdam Ave
CLASSES = {"car", "bus", "truck", "pedestrian"}
EDGES = [(0, 1), (2, 3), (4, 5), (6, 7), (0, 2), (1, 3), (4, 6), (5, 7), (0, 4), (1, 5), (2, 6), (3, 7)]


def draw_line(img, p, q, color):
    n = int(max(abs(q[0] - p[0]), abs(q[1] - p[1]))) + 1
    if n > 4000:
        return
    xs = np.linspace(p[0], q[0], n).round().astype(int)
    ys = np.linspace(p[1], q[1], n).round().astype(int)
    ok = (xs >= 0) & (xs < img.shape[1]) & (ys >= 0) & (ys < img.shape[0])
    img[ys[ok], xs[ok]] = color


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=2000)
    ap.add_argument("--out", default="_out/boxes")
    ap.add_argument("--frames", type=int, default=5)
    ap.add_argument("--every", type=int, default=10, help="ticks between saved frames (20 ticks = 1 s)")
    a = ap.parse_args()
    random.seed(1)

    client = boundless.Client(a.host, a.port)
    client.set_timeout(120.0)
    world = client.get_world()
    original = world.get_settings()
    world.apply_settings(boundless.WorldSettings(synchronous_mode=True, fixed_delta_seconds=0.05))

    m = world.get_map()
    here = m.geolocation_to_location(*AMSTERDAM_120)
    pose = Transform(here + Location(-30, -24, 7), Rotation(pitch=-14, yaw=40))   # a pole camera, 7 m up
    world.get_spectator().set_transform(pose)
    print("loaded:", world.wait_until_loaded())

    # the background traffic is already there; add a few actors of our own (their labels carry actor_id)
    lib = world.get_blueprint_library()
    actors = []
    for sp in m.get_spawn_points(center=here, radius=60, spacing=20)[:4]:
        car = world.try_spawn_actor(random.choice(list(lib.filter("vehicle.*"))), sp)
        if car:
            car.set_autopilot(True)
            actors.append(car)
    rgb_bp, box_bp = lib.find("sensor.camera.rgb"), lib.find("sensor.camera.bounding_boxes")
    box_bp.set_attribute("amodal", 12)        # amodal box and occlusion for the 12 largest objects (KITTI 'occluded')
    box_bp.set_attribute("min_pixels", 40)
    data = {}
    cameras = [world.spawn_actor(rgb_bp, pose), world.spawn_actor(box_bp, pose)]
    cameras[0].listen(lambda image: data.update(rgb=image))
    cameras[1].listen(lambda boxes: data.update(boxes=boxes))

    coco = util.CocoWriter([c for c in world.get_semantic_classes() if c["name"] in CLASSES])
    kitti = os.path.join(a.out, "kitti")
    try:
        for i in range(a.frames):
            for _ in range(a.every):
                world.tick()
            rgb, boxes = data["rgb"], data["boxes"]
            assert rgb.frame == boxes.frame
            name = f"{i:06d}"
            rgb.save_to_disk(os.path.join(kitti, "image_2", name + ".png"))
            objects = boxes.filter(classes=CLASSES, min_area=40)

            # COCO: the visible box [x, y, w, h]; amodal box, occlusion and actor id ride along
            coco.add(f"../kitti/image_2/{name}.png", objects, rgb.width, rgb.height, frame=rgb.frame)
            # KITTI: one line per object with a 3D pose in front of the camera, and the camera's calibration
            lines = [util.kitti_object(l, boxes.transform) for l in objects]
            lines = [s for s in lines if s]
            os.makedirs(os.path.join(kitti, "label_2"), exist_ok=True)
            os.makedirs(os.path.join(kitti, "calib"), exist_ok=True)
            with open(os.path.join(kitti, "label_2", name + ".txt"), "w") as f:
                f.write("\n".join(lines) + ("\n" if lines else ""))
            with open(os.path.join(kitti, "calib", name + ".txt"), "w") as f:
                f.write(util.kitti_calib(rgb.width, rgb.height, rgb.fov))

            # preview: 2D boxes (green vehicles, red pedestrians) and 3D wireframes (yellow)
            img = util.draw_boxes_rgb(rgb, objects, lambda l: (255, 60, 60) if l.class_name == "pedestrian" else (60, 220, 90))
            for l in objects:
                vs = util.label_vertices(l)
                pts = [util.project_point(v, rgb.transform, rgb.width, rgb.height, rgb.fov) for v in vs] if vs else []
                if pts and all(p is not None for p in pts):
                    for e0, e1 in EDGES:
                        draw_line(img, pts[e0], pts[e1], (255, 220, 0))
            path = os.path.join(a.out, "preview", name + ".png")
            os.makedirs(os.path.dirname(path), exist_ok=True)
            write_png(path, rgb.width, rgb.height, np.ascontiguousarray(img).tobytes(), 3)
            mine = sum(1 for l in objects if l.actor_id)
            print(f"frame {rgb.frame}: {len(objects)} vehicles and pedestrians ({mine} spawned by this script), {len(lines)} KITTI lines")
        os.makedirs(os.path.join(a.out, "coco"), exist_ok=True)
        print("COCO:", coco.save(os.path.join(a.out, "coco", "annotations.json")), f"({len(coco.annotations)} boxes)")
    finally:
        for cam in cameras:
            cam.destroy()
        for actor in actors:
            actor.destroy()
        world.apply_settings(original)


if __name__ == "__main__":
    main()
