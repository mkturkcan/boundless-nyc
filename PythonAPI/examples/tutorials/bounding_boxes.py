"""Bounding boxes: an RGB camera and a bounding-box camera at one pose on Amsterdam Ave, looking north across W 120th
St. Draws the visible and amodal 2D boxes and the projected 3D boxes of the road users, and exports the frame's labels
as JSON. Needs numpy.

    python bounding_boxes.py [--host 127.0.0.1] [--port 2000] [--out _out/bounding_boxes]
"""
import argparse
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))   # run from a source checkout
import boundless  # noqa: E402
from boundless import Location, Rotation, Transform  # noqa: E402
from boundless.png import write_png  # noqa: E402
from boundless.util import project_point  # noqa: E402

AMSTERDAM_120 = (40.80955, -73.95905)      # W 120th St & Amsterdam Ave, Morningside Heights
UPTOWN = 61.0                              # Manhattan's avenues run at this yaw (degrees counter-clockwise from east)
ROAD_USERS = ("car", "bus", "truck", "bicycle", "pedestrian")
COLOUR = {"car": (255, 196, 0), "bus": (80, 200, 255), "truck": (80, 200, 255), "bicycle": (150, 255, 90),
          "pedestrian": (255, 70, 120)}


def line(img, p, q, colour, width=2):
    """Draw a segment from p to q (pixel coordinates) into an (H, W, 3) array."""
    n = int(max(abs(q[0] - p[0]), abs(q[1] - p[1]))) + 2
    xs, ys = np.linspace(p[0], q[0], n), np.linspace(p[1], q[1], n)
    for dx in range(-(width // 2), width - width // 2):
        for dy in range(-(width // 2), width - width // 2):
            x, y = np.round(xs + dx).astype(int), np.round(ys + dy).astype(int)
            ok = (x >= 0) & (x < img.shape[1]) & (y >= 0) & (y < img.shape[0])
            img[y[ok], x[ok]] = colour


def rectangle(img, box, colour, width=2, dash=0):
    """[x, y, w, h]; dash > 0 draws dashes of that length."""
    x, y, w, h = box
    corners = [(x, y), (x + w, y), (x + w, y + h), (x, y + h), (x, y)]
    for p, q in zip(corners, corners[1:]):
        if not dash:
            line(img, p, q, colour, width)
            continue
        length = math.hypot(q[0] - p[0], q[1] - p[1])
        for s in np.arange(0.0, length, 2 * dash):
            t0, t1 = s / length, min(1.0, (s + dash) / length)
            line(img, (p[0] + (q[0] - p[0]) * t0, p[1] + (q[1] - p[1]) * t0), (p[0] + (q[0] - p[0]) * t1, p[1] + (q[1] - p[1]) * t1), colour, width)


def box_corners(label):
    """The 8 world-frame corners of an object's 3D box: location is the ground point under its centre, extent the half
    sizes (x along its heading), yaw its heading."""
    c, e, yaw = label.location, label.extent, math.radians(label.yaw)
    fx, fy = math.cos(yaw), math.sin(yaw)
    return [Location(c.x + sx * e.x * fx - sy * e.y * fy, c.y + sx * e.x * fy + sy * e.y * fx, c.z + up * 2 * e.z)
            for sx in (-1, 1) for sy in (-1, 1) for up in (0, 1)]


EDGES = [(i, j) for i in range(8) for j in range(i + 1, 8) if bin(i ^ j).count("1") == 1]   # the 12 box edges


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=2000)
    ap.add_argument("--out", default="_out/bounding_boxes")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)

    client = boundless.Client(a.host, a.port)
    client.set_timeout(120.0)
    world = client.get_world()
    original = world.get_settings()
    world.apply_settings(boundless.WorldSettings(synchronous_mode=True, fixed_delta_seconds=0.05))
    m = world.get_map()
    here = m.geolocation_to_location(*AMSTERDAM_120)
    world.get_spectator().set_transform(Transform(here + Location(0, 0, 30)))
    world.wait_until_loaded()
    junction = m.get_junctions(center=here, radius=60)[0]

    # 7 m above the west side of the avenue, 45 m south of the junction, looking up the avenue
    up = Location(math.cos(math.radians(UPTOWN)), math.sin(math.radians(UPTOWN)), 0)
    east = Location(up.y, -up.x, 0)
    pose = Transform(junction.location - up * 45 - east * 9 + Location(0, 0, 7), Rotation(pitch=-12, yaw=UPTOWN + 8))
    lib = world.get_blueprint_library()
    latest, cameras = {}, []
    for kind in ("rgb", "bounding_boxes"):
        bp = lib.find("sensor.camera." + kind)
        bp.set_attribute("fov", 65)
        if kind == "bounding_boxes":
            bp.set_attribute("amodal", 48)        # amodal box and occlusion for the 48 largest objects
        cam = world.spawn_actor(bp, pose)
        cam.listen(lambda data, kind=kind: latest.__setitem__(kind, data))
        cameras.append(cam)

    try:
        for _ in range(40):
            world.tick()
        rgb, boxes = latest["rgb"], latest["bounding_boxes"]
        rgb.save_to_disk(os.path.join(a.out, "rgb.png"))
        boxes.save_to_disk(os.path.join(a.out, "labels.json"))          # every labelled object of the frame

        users = boxes.filter(classes=ROAD_USERS, min_area=150)
        img2d, img3d = rgb.to_numpy()[..., :3].copy(), rgb.to_numpy()[..., :3].copy()
        print(f"{len(boxes.labels)} labelled objects, {len(users)} road users")
        print(f"  {'class':10s} {'visible box':22s} {'amodal box':22s} occlusion  distance")
        for label in sorted(users, key=lambda l: -l.area):
            colour = COLOUR[label.class_name]
            rectangle(img2d, label.bbox, colour, width=3)
            if label.amodal_bbox and (label.occlusion or 0) > 0.05:
                rectangle(img2d, label.amodal_bbox, colour, width=2, dash=8)      # the occluded extent, dashed
            dist = label.location.distance(boxes.transform.location) if label.location else float("nan")
            occl = f"{label.occlusion:9.2f}" if label.occlusion is not None else "        -"
            print(f"  {label.class_name:10s} {str(label.bbox):22s} {str(label.amodal_bbox):22s} {occl}  {dist:6.1f} m")
            if label.yaw is None or label.extent is None:          # 3D boxes for the objects with a heading
                continue
            pts = [project_point(p, boxes.transform, boxes.width, boxes.height, boxes.fov) for p in box_corners(label)]
            if all(pts):
                for i, j in EDGES:
                    line(img3d, pts[i][:2], pts[j][:2], colour, width=2)
        write_png(os.path.join(a.out, "boxes_2d.png"), rgb.width, rgb.height, img2d.tobytes(), 3)
        write_png(os.path.join(a.out, "boxes_3d.png"), rgb.width, rgb.height, img3d.tobytes(), 3)
    finally:
        for cam in cameras:
            cam.destroy()
        world.apply_settings(original)


if __name__ == "__main__":
    main()
