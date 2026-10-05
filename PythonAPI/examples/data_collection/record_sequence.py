"""Recording a sequence with consistent annotations: a camera rig (RGB, depth, semantic and instance segmentation
with labels) on a car driving on autopilot, recorded every tick at 20 Hz. Every sensor delivers its data for a step
before world.tick() returns, so the files of one frame always belong together; an object keeps its instance id from
frame to frame, so the ids double as track ids.

Writes, per frame: rgb/, depth/ (.npy, or .pfm without numpy), semantic/ (class ids), instance/ (instance codes) and
labels/ (.json); once: poses.jsonl (the car and the camera per frame), tracks.json (the frames of every object) and
coco.json (visible boxes; instance_id is the track id). The car carrying the rig is left out of the labels' tracks.

    python record_sequence.py [--host 127.0.0.1] [--port 2000] [--out _out/sequence] [--frames 100]
"""
import argparse
import json
import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))   # run from a source checkout
import boundless  # noqa: E402
from boundless import Location, Rotation, Transform, util  # noqa: E402

try:
    import numpy  # noqa: F401
    DEPTH_EXT = ".npy"
except ImportError:
    DEPTH_EXT = ".pfm"

AMSTERDAM_120 = (40.80955, -73.95905)   # W 120th St and Amsterdam Ave
SENSORS = ["rgb", "depth", "semantic_segmentation", "instance_segmentation"]
TRACKED = {"car", "bus", "truck", "bicycle", "pedestrian"}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=2000)
    ap.add_argument("--out", default="_out/sequence")
    ap.add_argument("--frames", type=int, default=100, help="frames to record (20 per simulated second)")
    a = ap.parse_args()
    random.seed(3)

    client = boundless.Client(a.host, a.port)
    client.set_timeout(120.0)
    world = client.get_world()
    original = world.get_settings()
    world.apply_settings(boundless.WorldSettings(synchronous_mode=True, fixed_delta_seconds=0.05))

    m = world.get_map()
    here = m.geolocation_to_location(*AMSTERDAM_120)
    spectator = world.get_spectator()
    spectator.set_transform(Transform(here + Location(0, 0, 30)))
    print("loaded:", world.wait_until_loaded())

    lib = world.get_blueprint_library()
    car = world.spawn_actor(lib.find("vehicle.suv"), random.choice(m.get_spawn_points(center=here, radius=80)))
    car.set_autopilot(True)
    rig, cameras = {}, []
    for name in SENSORS:     # one pose for all four: 0.6 m ahead of the car's centre, 1.9 m up (x forward, z up)
        bp = lib.find("sensor.camera." + name)
        bp.set_attribute("fov", 90)
        cam = world.spawn_actor(bp, Transform(Location(0.6, 0, 1.9), Rotation(pitch=-4)), attach_to=car)
        cam.listen(lambda d, name=name: rig.update({name: d}))
        cameras.append(cam)

    coco = util.CocoWriter([c for c in world.get_semantic_classes() if c["name"] in TRACKED])
    tracks, written, incomplete = {}, 0, 0
    out = lambda *p: os.path.join(a.out, *p)
    os.makedirs(out("labels"), exist_ok=True)
    try:
        for _ in range(20):                                   # one second on autopilot before recording
            world.tick()
        with open(out("poses.jsonl"), "w") as poses:
            for i in range(a.frames):
                rig.clear()
                frame = world.tick()
                spectator.set_transform(Transform(car.get_location() + Location(0, 0, 30)))   # stream around the car
                if sorted(rig) != sorted(SENSORS) or any(d.frame != frame for d in rig.values()):
                    incomplete += 1                           # never expected in synchronous mode: skip the frame
                    continue
                rgb, depth, sem, inst = (rig[n] for n in SENSORS)
                name = f"{written:06d}"
                rgb.save_to_disk(out("rgb", name + ".png"))
                depth.save_to_disk(out("depth", name + DEPTH_EXT))
                sem.save_to_disk(out("semantic", name + ".png"), colorize=False)
                inst.save_to_disk(out("instance", name + ".png"), labels=False)
                objects = [l for l in inst.labels if l.class_name in TRACKED and l.actor_id != car.id]
                with open(out("labels", name + ".json"), "w") as f:
                    json.dump({**inst.to_dict(), "objects": [l.to_dict() for l in objects]}, f)
                coco.add(f"rgb/{name}.png", objects, rgb.width, rgb.height, frame=frame)
                for l in objects:
                    t = tracks.setdefault(l.id, {"class": l.class_name, "actor_id": l.actor_id, "frames": []})
                    t["frames"].append(written)
                poses.write(json.dumps({"index": written, "frame": frame, "timestamp": rgb.timestamp,
                                        "vehicle": car.get_transform().to_dict(), "speed": car.get_speed(),
                                        "camera": rgb.transform.to_dict(),
                                        "K": util.camera_intrinsics(rgb.width, rgb.height, rgb.fov)}) + "\n")
                written += 1
                if i % 20 == 0:
                    print(f"frame {frame}: {len(objects)} objects, car at {car.get_speed():.1f} m/s")
        coco.save(out("coco.json"))
        with open(out("tracks.json"), "w") as f:
            json.dump({str(k): v for k, v in tracks.items()}, f)
        long_tracks = sum(1 for t in tracks.values() if len(t["frames"]) >= written // 2)
        print(f"{written} frames written ({incomplete} incomplete), {len(tracks)} tracks, "
              f"{long_tracks} of them in at least half of the frames, {len(coco.annotations)} boxes in coco.json")
    finally:
        for cam in cameras:
            cam.destroy()
        car.destroy()
        world.apply_settings(original)


if __name__ == "__main__":
    main()
