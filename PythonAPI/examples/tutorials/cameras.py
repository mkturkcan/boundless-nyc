"""Cameras: spawn a taxi on autopilot on Lenox Ave, attach a chase camera and a dashcam to it, and save their frames
while it drives north through W 125th St.

    python cameras.py [--host 127.0.0.1] [--port 2000] [--seconds 12] [--every 20] [--out _out/cameras]
"""
import argparse
import math
import os
import queue
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))   # run from a source checkout
import boundless  # noqa: E402
from boundless import Location, Rotation, Transform  # noqa: E402

LENOX_125 = (40.80776, -73.94549)          # W 125th St & Lenox Ave, Harlem
UPTOWN = 61.0                              # Manhattan's avenues run at this yaw (degrees counter-clockwise from east)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=2000)
    ap.add_argument("--seconds", type=float, default=12.0, help="simulated time to record")
    ap.add_argument("--every", type=int, default=20, help="save every N-th step (20 steps = 1 s)")
    ap.add_argument("--out", default="_out/cameras")
    a = ap.parse_args()

    client = boundless.Client(a.host, a.port)
    client.set_timeout(120.0)
    world = client.get_world()
    original, ambient = world.get_settings(), world.get_ambient_traffic()
    world.apply_settings(boundless.WorldSettings(synchronous_mode=True, fixed_delta_seconds=0.05))
    world.set_ambient_traffic(vehicles=200)         # thinner background traffic, for a clear run up the avenue

    m = world.get_map()
    here = m.geolocation_to_location(*LENOX_125)
    world.get_spectator().set_transform(Transform(here + Location(0, 0, 30)))
    world.wait_until_loaded()

    # every signal runs the same cycle: wait for a fresh green uptown, so that the taxi drives through the junction
    while True:
        light = world.get_traffic_light_state(UPTOWN)
        if light.state == "green" and light.time_left > 12.0:
            break
        world.tick()
    print("uptown light:", light)

    # a northbound lane 60 m south of the junction (east of the median): its waypoint pose is a valid spawn pose
    up = Location(math.cos(math.radians(UPTOWN)), math.sin(math.radians(UPTOWN)), 0)
    right = Location(up.y, -up.x, 0)
    start = m.get_waypoint(here - up * 60.0 + right * 5.0, heading=UPTOWN)
    lib = world.get_blueprint_library()
    taxi = world.spawn_actor(lib.find("vehicle.taxi2"), start.transform)
    taxi.set_autopilot(True, route=["straight", "straight"])     # the traffic simulation drives it
    print("taxi", taxi.id, "on road", start.road_id, "lane", start.lane_id, "speed limit", start.speed_limit, "km/h")

    # attachment offsets are in the taxi's frame: x forward, y left, z up
    rigs = {
        "chase": (Transform(Location(-7.0, 0.0, 3.0), Rotation(pitch=-12)), 90),
        "dashcam": (Transform(Location(0.9, 0.0, 1.55), Rotation(pitch=-3)), 100),
    }
    frames, cameras = {}, []
    for name, (offset, fov) in rigs.items():
        bp = lib.find("sensor.camera.rgb")
        bp.set_attribute("fov", fov)
        cam = world.spawn_actor(bp, offset, attach_to=taxi)
        frames[name] = queue.Queue()
        cam.listen(frames[name].put)
        cameras.append(cam)

    try:
        for step in range(int(a.seconds / 0.05)):
            frame = world.tick()
            images = {name: q.get(timeout=30) for name, q in frames.items()}   # one image per camera per tick
            if step % a.every:
                continue
            for name, image in images.items():
                image.save_to_disk(os.path.join(a.out, name, f"{frame:06d}.png"))
            print(f"t = {step * 0.05:5.2f} s  frame {frame}  taxi {taxi.get_speed():4.1f} m/s at {taxi.get_location()}")
    finally:
        for cam in cameras:
            cam.destroy()
        taxi.destroy()
        world.set_ambient_traffic(vehicles=ambient["vehicles"])
        world.apply_settings(original)


if __name__ == "__main__":
    main()
