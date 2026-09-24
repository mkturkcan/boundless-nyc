"""Measure how fast the server steps the world with different sensor setups (synchronous mode, W 120th St & Amsterdam).

    python benchmark.py [--ticks 60] [--dt 0.05]

Prints seconds per tick and the real-time factor (simulated seconds per wall second) for each setup.
"""
import argparse
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))   # run from a source checkout
import boundless  # noqa: E402
from boundless import Location, Rotation, Transform  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=2000)
    ap.add_argument("--ticks", type=int, default=60)
    ap.add_argument("--dt", type=float, default=0.05)
    ap.add_argument("--idle-nap", type=float, default=None, help="(experiment) ms the server sleeps between idle frames")
    ap.add_argument("--only", default=None, help="comma-separated setup numbers to run (0-based)")
    a = ap.parse_args()

    client = boundless.Client(a.host, a.port)
    world = client.get_world()
    info = client.get_server_info()
    print(f"server {info.get('api_version')} at {info.get('resolution')} on {info.get('gpu', '?')}")
    old = world.get_settings()
    world.apply_settings(boundless.WorldSettings(synchronous_mode=True, fixed_delta_seconds=a.dt))
    if a.idle_nap is not None:
        world._call("world.apply_settings", idle_nap_ms=a.idle_nap)
    m = world.get_map()
    J = m.geolocation_to_location(40.80955, -73.95905)
    world.get_spectator().set_transform(Transform(J + Location(-30, -30, 20), Rotation(pitch=-25, yaw=45)))
    world.wait_until_loaded()
    lib = world.get_blueprint_library()

    car = world.spawn_actor(lib.find("vehicle.taxi2"), m.get_spawn_points(center=J, radius=60, spacing=25)[0])
    car.set_autopilot(True)
    pole = Transform(J + Location(-14, -14, 6.5), Rotation(pitch=-20, yaw=45))
    dash = Transform(Location(1.1, 0, 1.62), Rotation(pitch=-5))
    counts = {}

    def cam(bp, tf, parent=None, **attrs):
        b = lib.find(bp)
        for k, v in attrs.items():
            b.set_attribute(k, v)
        s = world.spawn_actor(b, tf, attach_to=parent)
        s.listen(lambda d, k=bp: counts.__setitem__(k, counts.get(k, 0) + 1))
        return s

    setups = [
        ("no sensors", []),
        ("pole rgb", [("sensor.camera.rgb", pole, None, {})]),
        ("pole rgb + semantic + instance", [("sensor.camera.rgb", pole, None, {}),
                                            ("sensor.camera.semantic_segmentation", pole, None, {}),
                                            ("sensor.camera.instance_segmentation", pole, None, {"amodal": 0})]),
        ("  ... with amodal boxes (8)", [("sensor.camera.rgb", pole, None, {}),
                                         ("sensor.camera.semantic_segmentation", pole, None, {}),
                                         ("sensor.camera.instance_segmentation", pole, None, {"amodal": 8})]),
        ("pole rgb + semantic + instance, dashcam rgb", [("sensor.camera.rgb", pole, None, {}),
                                                        ("sensor.camera.semantic_segmentation", pole, None, {}),
                                                        ("sensor.camera.instance_segmentation", pole, None, {"amodal": 0}),
                                                        ("sensor.camera.rgb", dash, car, {"fov": 100})]),
        ("depth only", [("sensor.camera.depth", pole, None, {})]),
    ]
    print(f"{'setup':46s} {'s/tick':>8s} {'x real time':>12s}")
    try:
        only = {int(x) for x in a.only.split(",")} if a.only else None
        for k, (name, spec) in enumerate(setups):
            if only is not None and k not in only:
                continue
            sensors = [cam(bp, tf, parent, **attrs) for bp, tf, parent, attrs in spec]
            for _ in range(5):                                    # warm-up: shaders, first readbacks
                world.tick()
            counts.clear()
            t0 = time.perf_counter()
            for _ in range(a.ticks):
                world.tick()
            dt = (time.perf_counter() - t0) / a.ticks
            got = sum(counts.values())
            print(f"{name:46s} {dt:8.3f} {a.dt / dt:12.2f}" + (f"   ({got} frames)" if spec else ""))
            for s in sensors:
                s.destroy()
    finally:
        car.destroy()
        world.apply_settings(old)


if __name__ == "__main__":
    main()
