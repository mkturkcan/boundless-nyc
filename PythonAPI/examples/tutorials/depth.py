"""Depth: an RGB and a depth camera at one pose on Columbia's College Walk. Saves metric depth as float32 (.npy) and as
a 16-bit PNG in millimetres, writes a colour-mapped preview, and back-projects the depth into a coloured point cloud
(.ply) in the world frame. Needs numpy.

    python depth.py [--host 127.0.0.1] [--port 2000] [--out _out/depth]
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

COLLEGE_WALK = (40.80712, -73.96232)       # Columbia University, south of Low Library


def turbo(x):
    """Turbo colour map for x in [0, 1] -> uint8 RGB. Polynomial fit of Turbo by Anton Mikhailov (Google, 2019),
    Apache-2.0."""
    x = np.clip(x, 0.0, 1.0)
    r = 0.13572138 + x * (4.61539260 + x * (-42.66032258 + x * (132.13108234 + x * (-152.94239396 + x * 59.28637943))))
    g = 0.09140261 + x * (2.19418839 + x * (4.84296658 + x * (-14.18503333 + x * (4.27729857 + x * 2.82956604))))
    b = 0.10667330 + x * (12.64194608 + x * (-60.58204836 + x * (110.36276771 + x * (-89.90310912 + x * 27.34824973))))
    return (np.clip(np.stack([r, g, b], -1), 0, 1) * 255 + 0.5).astype(np.uint8)


def back_project(depth, step=1):
    """World points (N, 3) and their pixel indices for every step-th pixel that is not sky."""
    d = depth.to_numpy()[::step, ::step]
    v, u = np.mgrid[0:depth.height:step, 0:depth.width:step]
    f = depth.width / (2.0 * math.tan(math.radians(depth.fov) / 2.0))          # focal length in pixels
    keep = d < depth.depth_max
    # camera frame: x forward (the view axis), y left, z up; image right is -y and image down is -z
    x = d[keep]
    y = -(u[keep] + 0.5 - depth.width / 2.0) * x / f
    z = -(v[keep] + 0.5 - depth.height / 2.0) * x / f
    R = np.array(depth.transform.rotation.matrix())                             # body -> world
    t = np.array([depth.transform.location.x, depth.transform.location.y, depth.transform.location.z])
    return np.stack([x, y, z], -1) @ R.T + t, (v[keep], u[keep])


def write_ply(path, xyz, rgb):
    v = np.empty(len(xyz), dtype=[("x", "<f4"), ("y", "<f4"), ("z", "<f4"), ("r", "u1"), ("g", "u1"), ("b", "u1")])
    v["x"], v["y"], v["z"] = xyz.T
    v["r"], v["g"], v["b"] = rgb.T
    with open(path, "wb") as f:
        f.write(("ply\nformat binary_little_endian 1.0\nelement vertex %d\nproperty float x\nproperty float y\n"
                 "property float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n" % len(v)).encode())
        v.tofile(f)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=2000)
    ap.add_argument("--out", default="_out/depth")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)

    client = boundless.Client(a.host, a.port)
    client.set_timeout(120.0)
    world = client.get_world()
    original = world.get_settings()
    world.apply_settings(boundless.WorldSettings(synchronous_mode=True, fixed_delta_seconds=0.05))
    m = world.get_map()
    here = m.geolocation_to_location(*COLLEGE_WALK)
    world.get_spectator().set_transform(Transform(here + Location(0, 0, 20)))
    world.wait_until_loaded()
    ground = m.get_surface(here)["height"]                  # the lawn's height in the world frame

    pose = Transform(Location(here.x, here.y, ground + 4.0), Rotation(pitch=-2, yaw=69))
    lib = world.get_blueprint_library()
    latest, cameras = {}, []
    for kind in ("rgb", "depth"):
        bp = lib.find("sensor.camera." + kind)
        bp.set_attribute("fov", 72)
        cam = world.spawn_actor(bp, pose)
        cam.listen(lambda data, kind=kind: latest.__setitem__(kind, data))
        cameras.append(cam)

    try:
        for _ in range(40):
            world.tick()
        rgb, depth = latest["rgb"], latest["depth"]
        rgb.save_to_disk(os.path.join(a.out, "rgb.png"))
        depth.save_to_disk(os.path.join(a.out, "depth.npy"))     # float32 metres along the view axis
        depth.save_to_disk(os.path.join(a.out, "depth.png"))     # uint16 millimetres; 65.535 m and beyond saturate

        d = depth.to_numpy()
        sky = d >= depth.depth_max                               # no geometry along the ray
        near, far = 2.0, depth.depth_max
        x = (np.log(np.clip(d, near, far)) - math.log(near)) / (math.log(far) - math.log(near))
        vis = turbo(1.0 - 0.9 * x)                               # near is red, far is blue
        vis[sky] = (18, 22, 30)
        write_png(os.path.join(a.out, "depth_colormap.png"), depth.width, depth.height, np.ascontiguousarray(vis).tobytes(), 3)
        p5, p50, p95 = np.percentile(d[~sky], [5, 50, 95])
        print(f"depth: 5th / 50th / 95th percentile {p5:.1f} / {p50:.1f} / {p95:.1f} m; sky {100 * sky.mean():.1f} % of pixels; "
              f"{100 * (d >= 65.535).mean():.1f} % at or beyond the 16-bit PNG's 65.535 m")

        xyz, (rows, cols) = back_project(depth, step=2)
        write_ply(os.path.join(a.out, "points.ply"), xyz, rgb.to_numpy()[rows, cols, :3])
        print(f"{len(xyz)} points -> points.ply")

        # the same for one pixel with the API's geometry: the image centre, from the camera frame to the world frame
        v, u = depth.height // 2, depth.width // 2
        K = boundless.util.camera_intrinsics(depth.width, depth.height, depth.fov)
        dc = float(d[v, u])
        p_cam = boundless.Vector3D(dc, -(u + 0.5 - K[0][2]) * dc / K[0][0], -(v + 0.5 - K[1][2]) * dc / K[1][1])
        print(f"image centre: {dc:.2f} m along the view axis, world {depth.transform.transform_point(p_cam)}")
    finally:
        for cam in cameras:
            cam.destroy()
        world.apply_settings(original)


if __name__ == "__main__":
    main()
