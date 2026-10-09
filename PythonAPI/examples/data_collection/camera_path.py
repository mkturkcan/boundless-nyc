"""Placing and moving a camera: a still from a camera placed by hand, then a scripted path (a dolly up Amsterdam Ave
that rises and turns west into W 120th St), one RGB frame per step and the pose of every frame in poses.json.

    python camera_path.py [--host 127.0.0.1] [--port 2000] [--out _out/camera_path] [--steps 60]
"""
import argparse
import json
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))   # run from a source checkout
import valdrada  # noqa: E402
from valdrada import Location, Rotation, Transform, util  # noqa: E402

AMSTERDAM_120 = (40.80955, -73.95905)   # W 120th St and Amsterdam Ave
UPTOWN = 61.0                           # the avenues' heading: yaw in degrees, counter-clockwise from east


def look_at(eye, target):
    """A camera pose at `eye` looking at `target` (a camera looks along its +x)."""
    d = target - eye
    return Transform(eye, Rotation(pitch=math.degrees(math.atan2(d.z, math.hypot(d.x, d.y))),
                                   yaw=math.degrees(math.atan2(d.y, d.x))))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=2000)
    ap.add_argument("--out", default="_out/camera_path")
    ap.add_argument("--steps", type=int, default=60, help="frames along the path (20 per simulated second)")
    a = ap.parse_args()

    client = valdrada.Client(a.host, a.port)
    client.set_timeout(120.0)
    world = client.get_world()
    original = world.get_settings()
    world.apply_settings(valdrada.WorldSettings(synchronous_mode=True, fixed_delta_seconds=0.05))

    # positions in the street's own frame: metres uptown, metres to the west side (left), metres up
    junction = world.get_map().get_junctions(center=world.get_map().geolocation_to_location(*AMSTERDAM_120), radius=60)[0]
    fwd = Rotation(yaw=UPTOWN).get_forward_vector()
    left = Rotation(yaw=UPTOWN).get_left_vector()
    at = lambda up_ave, west, up: junction.location + fwd * up_ave + left * west + Location(0, 0, up)

    spectator = world.get_spectator()
    placed = look_at(at(-20, 14.5, 1.7), at(0, 0, 1.5))      # eye height on the west sidewalk, facing the junction
    spectator.set_transform(placed)                           # tiles, buildings and traffic stream in around it
    print("loaded:", world.wait_until_loaded())

    bp = world.get_blueprint_library().find("sensor.camera.rgb")
    bp.set_attribute("fov", 75)
    camera = world.spawn_actor(bp, placed)                    # no attach_to: the transform is in world coordinates
    frames = {}
    camera.listen(lambda image: frames.update({image.frame: image}))
    poses = []
    try:
        for _ in range(10):                                   # a few steps for the image history to settle
            frame = world.tick()
        print("placed:", frames[frame].save_to_disk(os.path.join(a.out, "placed.png")))
        frames.clear()

        # the path: key frames of (eye, target), eased linearly between them
        keys = [(0.0, at(-70, 0, 4.5), at(0, 0, 2)),
                (0.5, at(-25, 3, 9), at(15, 0, 1)),
                (1.0, at(2, 6, 30), at(2, 45, 0))]
        for i in range(a.steps):
            t = i / max(1, a.steps - 1)
            k = next(j for j in range(1, len(keys)) if t <= keys[j][0])
            (t0, e0, g0), (t1, e1, g1) = keys[k - 1], keys[k]
            u = (t - t0) / (t1 - t0)
            u = u * u * (3 - 2 * u)                           # ease in and out
            pose = look_at(e0 + (e1 - e0) * u, g0 + (g1 - g0) * u)
            camera.set_transform(pose)
            spectator.set_transform(pose)                     # keep the streaming centre with the camera
            frame = world.tick()
            image = frames.pop(frame)
            image.save_to_disk(os.path.join(a.out, "path", "%06d.png"))
            poses.append({"frame": frame, "timestamp": image.timestamp, "transform": image.transform.to_dict(),
                          "K": util.camera_intrinsics(image.width, image.height, image.fov)})
        with open(os.path.join(a.out, "poses.json"), "w") as f:
            json.dump(poses, f, indent=1)
        print(f"path: {len(poses)} frames in {os.path.join(a.out, 'path')}, poses in poses.json")
    finally:
        camera.destroy()
        world.apply_settings(original)


if __name__ == "__main__":
    main()
