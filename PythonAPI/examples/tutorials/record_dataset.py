"""Recording a dataset: autopilot vehicles and walking pedestrians around W 120th St and Amsterdam Ave, filmed by a pole
camera rig that records synchronized RGB, semantic segmentation, instance segmentation with labels, and depth. Writes
a COCO detection file for the road users and a contact sheet of the recorded frames. Needs numpy.

    python record_dataset.py [--host 127.0.0.1] [--port 2000] [--frames 24] [--every 20] [--vehicles 20]
                             [--walkers 40] [--out _out/record_dataset]

Output: rgb/, semantic/ (class palette), instance/ (instance codes, and the frame's labels as JSON), depth/ (16-bit
millimetres), annotations_coco.json, contact_sheet.png.
"""
import argparse
import math
import os
import queue
import random
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))   # run from a source checkout
import boundless  # noqa: E402
from boundless import Location, Rotation, Transform  # noqa: E402
from boundless.png import write_png  # noqa: E402

AMSTERDAM_120 = (40.80955, -73.95905)      # W 120th St & Amsterdam Ave, Morningside Heights
DT = 0.05
ROAD_USERS = ("car", "bus", "truck", "bicycle", "pedestrian")
COLOUR = {"car": (255, 196, 0), "bus": (80, 200, 255), "truck": (80, 200, 255), "bicycle": (150, 255, 90),
          "pedestrian": (255, 70, 120)}


def spawn_traffic(world, m, lib, junction, n_vehicles, n_walkers, rng):
    """Autopilot vehicles on lanes around the junction, and pedestrians sent between its corners."""
    actors = []
    vehicle_bps = [b for b in lib.filter("vehicle.*") if b.id not in ("vehicle.firetruck", "vehicle.ambulance")]
    spawn_points = m.get_spawn_points(center=junction.location, radius=120, spacing=16)
    rng.shuffle(spawn_points)
    for sp in spawn_points[:n_vehicles]:
        v = world.try_spawn_actor(rng.choice(vehicle_bps), sp)
        if v is not None:
            v.set_autopilot(True)
            actors.append(v)
    corners = [junction.location + Location(15 * math.cos(math.radians(arm.heading + side)), 15 * math.sin(math.radians(arm.heading + side)), 0)
               for arm in junction.arms for side in (-45, 45)]
    walkers = []
    walker_bps = list(lib.filter("walker.pedestrian.*"))
    for _ in range(n_walkers):
        start = rng.choice(corners) + Location(rng.uniform(-3, 3), rng.uniform(-3, 3), 0)
        w = world.try_spawn_actor(rng.choice(walker_bps), Transform(start))
        if w is None:
            continue
        ai = world.spawn_actor(lib.find("controller.ai.walker"), Transform(), attach_to=w)
        ai.start()
        ai.set_max_speed(rng.uniform(1.1, 1.6))
        try:
            ai.go_to_location(rng.choice(corners))
        except boundless.BoundlessError:          # no sidewalk route between those corners
            pass
        walkers.append(ai)
        actors += [ai, w]
    return actors, walkers, corners


def outline(img, box, colour):
    x0, y0, w, h = (int(round(v)) for v in box)
    x1, y1 = min(img.shape[1] - 1, x0 + w), min(img.shape[0] - 1, y0 + h)
    x0, y0 = max(0, x0), max(0, y0)
    img[y0, x0:x1] = img[y1, x0:x1] = colour
    img[y0:y1, x0] = img[y0:y1, x1] = colour


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=2000)
    ap.add_argument("--frames", type=int, default=24, help="frames to record")
    ap.add_argument("--every", type=int, default=20, help="simulation steps between recorded frames")
    ap.add_argument("--vehicles", type=int, default=20)
    ap.add_argument("--walkers", type=int, default=40)
    ap.add_argument("--warmup", type=float, default=6.0, help="seconds of simulation before recording")
    ap.add_argument("--seed", type=int, default=3)
    ap.add_argument("--out", default="_out/record_dataset")
    a = ap.parse_args()
    rng = random.Random(a.seed)
    for sub in ("rgb", "semantic", "instance", "depth"):
        os.makedirs(os.path.join(a.out, sub), exist_ok=True)

    client = boundless.Client(a.host, a.port)
    client.set_timeout(120.0)
    world = client.get_world()
    original = world.get_settings()
    world.apply_settings(boundless.WorldSettings(synchronous_mode=True, fixed_delta_seconds=DT))
    m = world.get_map()
    here = m.geolocation_to_location(*AMSTERDAM_120)
    world.get_spectator().set_transform(Transform(here + Location(0, 0, 30)))
    world.wait_until_loaded()
    junction = m.get_junctions(center=here, radius=60)[0]
    lib = world.get_blueprint_library()
    actors, walkers, corners = spawn_traffic(world, m, lib, junction, a.vehicles, a.walkers, rng)
    print(f"{sum(isinstance(x, boundless.Vehicle) for x in actors)} vehicles, {len(walkers)} pedestrians")
    sensors = []
    try:
        for _ in range(int(a.warmup / DT)):          # let the traffic spread out before recording
            world.tick()

        # the rig: four cameras at one pose; sensor_tick makes them capture only every `every` steps
        pose = Transform(junction.location + Location(-24, -24, 8), Rotation(pitch=-12, yaw=45))
        queues = {}
        for kind in ("rgb", "semantic_segmentation", "instance_segmentation", "depth"):
            bp = lib.find("sensor.camera." + kind)
            bp.set_attribute("fov", 70)
            bp.set_attribute("sensor_tick", a.every * DT)
            if kind == "instance_segmentation":
                bp.set_attribute("amodal", 8)
            cam = world.spawn_actor(bp, pose)
            queues[kind] = queue.Queue()
            cam.listen(queues[kind].put)
            sensors.append(cam)

        classes = [c for c in world.get_semantic_classes() if c["name"] in ROAD_USERS]
        coco = boundless.util.CocoWriter(classes)
        thumbs, step = [], 0
        while len(coco.images) < a.frames and step < (a.frames + 1) * a.every:
            frame = world.tick()
            step += 1
            if step % 20 == 0:                         # walkers that arrived pick a new corner
                for ai in walkers:
                    if ai.get_state() == "arrived":
                        try:
                            ai.go_to_location(rng.choice(corners))
                        except boundless.BoundlessError:
                            pass
            if queues["rgb"].empty():                  # the rig is not due on this step
                continue
            rgb, sem, inst, depth = (queues[k].get() for k in ("rgb", "semantic_segmentation", "instance_segmentation", "depth"))
            assert rgb.frame == sem.frame == inst.frame == depth.frame == frame
            name = f"{frame:06d}"
            rgb.save_to_disk(os.path.join(a.out, "rgb", name + ".png"))
            sem.save_to_disk(os.path.join(a.out, "semantic", name + ".png"))
            inst.save_to_disk(os.path.join(a.out, "instance", name + ".png"))     # + instance/<frame>.json
            depth.save_to_disk(os.path.join(a.out, "depth", name + ".png"))
            users = inst.filter(classes=ROAD_USERS, min_area=100)
            coco.add(f"rgb/{name}.png", users, rgb.width, rgb.height, frame=frame)

            # a quarter-size thumbnail with the boxes, for the contact sheet
            H, W = rgb.height, rgb.width
            thumb = rgb.to_numpy()[..., :3].reshape(H // 4, 4, W // 4, 4, 3).mean(axis=(1, 3)).astype(np.uint8)
            for label in users:
                outline(thumb, [v / 4 for v in label.bbox], COLOUR[label.class_name])
            thumbs.append(thumb)
            print(f"frame {frame}: {len(users)} road users, {sum(1 for l in users if l.actor_id)} of them spawned here")

        coco.save(os.path.join(a.out, "annotations_coco.json"))
        cols, pad = 4, 6
        th, tw = thumbs[0].shape[:2]
        rows = math.ceil(len(thumbs) / cols)
        sheet = np.full((rows * (th + pad) + pad, cols * (tw + pad) + pad, 3), 255, np.uint8)
        for k, t in enumerate(thumbs):
            r, c = divmod(k, cols)
            sheet[pad + r * (th + pad):pad + r * (th + pad) + th, pad + c * (tw + pad):pad + c * (tw + pad) + tw] = t
        write_png(os.path.join(a.out, "contact_sheet.png"), sheet.shape[1], sheet.shape[0], sheet.tobytes(), 3)
        per_class = {c["name"]: sum(1 for x in coco.annotations if x["category_id"] == c["id"]) for c in classes}
        print(f"{len(coco.images)} frames, {len(coco.annotations)} boxes {per_class} -> {a.out}")
    finally:
        for s in sensors:
            s.destroy()
        for x in reversed(actors):
            x.destroy()
        world.apply_settings(original)


if __name__ == "__main__":
    main()
