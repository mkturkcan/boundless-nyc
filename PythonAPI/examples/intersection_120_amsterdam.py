"""W 120th St & Amsterdam Ave, Manhattan: a scripted scenario and a perception dataset.

What it does
  * finds the signalized junction of W 120th St and Amsterdam Ave in the live map;
  * drives a HERO taxi north on Amsterdam under direct control (a pure-pursuit lane follower that stops for the red
    light and goes on green: VehicleControl throttle / steer / brake);
  * adds cars on autopilot with planned turns (left / straight / right) through the same junction;
  * sends pedestrians across the crosswalks with controller.ai.walker (routes over sidewalks and crosswalks), and
    walks one more under direct WalkerControl along the sidewalk;
  * films it all from a pole-mounted traffic camera at the south-west corner (RGB + semantic segmentation + instance
    masks + boxes) and from a dashcam on the taxi;
  * writes the frames and a COCO annotation file (visible and amodal boxes, occlusion, actor ids).

    python intersection_120_amsterdam.py [--frames 240] [--every 4] [--out _out/amsterdam120] [--time day|golden|dusk|night]

Needs a running server (BoundlessNYC.exe). numpy is optional (it adds box overlays).
"""
import argparse
import json
import math
import os
import queue
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))   # run from a source checkout
import boundless  # noqa: E402
from boundless import Location, Rotation, Transform, VehicleControl, WalkerControl, Vector3D  # noqa: E402

try:
    import numpy as np
except ImportError:
    np = None

LAT, LON = 40.80955, -73.95905            # W 120th St & Amsterdam Ave


def unit(yaw_deg):
    return Vector3D(math.cos(math.radians(yaw_deg)), math.sin(math.radians(yaw_deg)), 0.0)


def wrap(a):
    return (a + 180.0) % 360.0 - 180.0


class LaneFollower:
    """Pure pursuit on map waypoints + a speed controller that stops for red lights before the junction."""

    def __init__(self, world, vehicle, junction, cruise=8.0):
        self.world, self.v, self.j, self.cruise = world, vehicle, junction, cruise
        self.map = world.get_map()
        self.heading = None

    def step(self):
        t = self.v.get_transform()
        speed = self.v.get_speed()
        wp = self.map.get_waypoint(t.location, heading=t.rotation.yaw)
        if wp is None:
            return VehicleControl(brake=1.0)
        # a target 5-9 m ahead along the lane, the straightest continuation through a junction
        look = max(5.0, 0.9 * speed + 4.0)
        ahead = wp.next(look)
        if not ahead:
            return VehicleControl(brake=1.0)
        target = min(ahead, key=lambda w: abs(wrap(w.transform.rotation.yaw - t.rotation.yaw)))
        p = t.inverse_transform_point(target.transform.location)          # x forward, y left
        curvature = 2.0 * p.y / max(1.0, p.x * p.x + p.y * p.y)
        steer = max(-1.0, min(1.0, -math.degrees(math.atan(2.8 * curvature)) / 35.0))   # steer > 0 turns right
        # the light for our heading, and the stop line ~12 m before the junction centre
        to_j = self.j.location - t.location
        along = to_j.dot(unit(t.rotation.yaw))
        want = self.cruise
        if 9.0 < along < 45.0:
            light = self.world.get_traffic_light_state(t.rotation.yaw)
            if light.state != "green" or (light.time_left < 2.0 and along > 16.0):
                stop_d = along - 12.5
                want = 0.0 if stop_d < 0.8 else min(self.cruise, math.sqrt(2.0 * 2.5 * stop_d))
        # and never into anyone: a walker on the crosswalk, the queue at the light (3 m standstill gap)
        obs = self.v.get_obstacle_ahead(max_distance=35.0, width=2.4)
        if obs is not None:
            gap = obs["distance"] - 3.0
            want = min(want, 0.0 if gap < 0.5 else math.sqrt(2.0 * 3.0 * gap))
        err = want - speed
        if err >= 0:
            return VehicleControl(throttle=min(1.0, 0.25 + 0.35 * err), steer=steer)
        return VehicleControl(throttle=0.0, brake=min(1.0, -0.4 * err + (0.3 if want == 0.0 else 0.0)), steer=steer)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=2000)
    ap.add_argument("--frames", type=int, default=240, help="simulation steps (20 per second)")
    ap.add_argument("--every", type=int, default=4, help="save every N-th frame")
    ap.add_argument("--out", default="_out/amsterdam120")
    ap.add_argument("--time", default="day", choices=["day", "golden", "dusk", "night"])
    ap.add_argument("--ambient-vehicles", type=int, default=60)
    ap.add_argument("--ambient-walkers", type=int, default=120)
    a = ap.parse_args()

    client = boundless.Client(a.host, a.port)
    client.set_timeout(180.0)
    world = client.get_world()
    original = world.get_settings()
    world.apply_settings(boundless.WorldSettings(synchronous_mode=True, fixed_delta_seconds=0.05))
    world.set_weather(boundless.WeatherParameters(a.time))
    world.set_ambient_traffic(vehicles=a.ambient_vehicles, walkers=a.ambient_walkers)

    m = world.get_map()
    here = m.geolocation_to_location(LAT, LON)
    spectator = world.get_spectator()
    spectator.set_transform(Transform(here + Location(-45, -45, 40), Rotation(pitch=-35, yaw=45)))
    print("loading the blocks around the intersection ...", world.wait_until_loaded())

    J = m.get_junctions(center=here, radius=60)[0]
    arms = sorted(J.arms, key=lambda r: -r.lanes)
    ams = next(r for r in arms if r.lanes >= 4)                     # Amsterdam Ave: the 4-lane avenue
    north = ams.heading if -90 < ams.heading < 90 else wrap(ams.heading + 180)   # the avenue's northbound heading
    street = wrap(north - 90)                                        # W 120th St, eastbound-ish
    print(f"{J}\n  Amsterdam Ave northbound heading {north:.1f} deg, W 120th St {street:.1f} deg")
    u_ave, u_st = unit(north), unit(street)
    lib = world.get_blueprint_library()
    actors = []

    # ---------------------------------------------------------------- vehicles
    hero_wp = m.get_waypoint(J.location - u_ave * 70.0, heading=north)
    hero_bp = lib.find("vehicle.taxi2")
    hero = world.spawn_actor(hero_bp, hero_wp.transform)
    actors.append(hero)
    driver = LaneFollower(world, hero, J, cruise=8.5)
    print("hero taxi", hero.id, "on Amsterdam Ave, 70 m south of the junction")

    plans = [  # (arm direction, distance out, blueprint, turns)
        (-u_ave, 45.0, "vehicle.suv", ["left"]),
        (u_ave, 55.0, "vehicle.van", ["straight"]),
        (-u_st, 40.0, "vehicle.lincoln", ["right"]),
        (u_st, 45.0, "vehicle.taxi", ["straight"]),
        (-u_ave, 80.0, "vehicle.boxtruck", ["right"]),
    ]
    for d, dist, bp, route in plans:
        p = J.location + d * dist
        heading = math.degrees(math.atan2(-d.y, -d.x))              # driving TOWARD the junction
        wp = m.get_waypoint(p, heading=heading)
        if wp is None:
            continue
        v = world.try_spawn_actor(lib.find(bp), wp.transform)
        if v is None:
            continue
        v.set_autopilot(True, route=route)
        actors.append(v)
        print(f"  autopilot {bp:18s} id {v.id}: {route[0]} through the junction")

    # ---------------------------------------------------------------- pedestrians
    corners = {(s1, s2): J.location + u_ave * (13.0 * s1) + u_st * (16.0 * s2) for s1 in (-1, 1) for s2 in (-1, 1)}
    walkers = []
    walker_bps = [b for b in lib.filter("walker.pedestrian.*") if b.get_attribute("age") == "adult"]
    trips = [((-1, -1), (-1, 1)), ((-1, 1), (1, 1)), ((1, 1), (1, -1)), ((1, -1), (-1, -1)), ((-1, -1), (1, -1)), ((1, 1), (-1, 1))]
    for k, (src, dst) in enumerate(trips):
        bp = walker_bps[(k * 7) % len(walker_bps)]
        start = corners[src] + u_ave * (1.5 * (k % 3))
        w = world.try_spawn_actor(bp, Transform(start, Rotation(yaw=0)))
        if w is None:
            continue
        ai = world.spawn_actor(lib.find("controller.ai.walker"), Transform(), attach_to=w)
        ai.start()
        ai.set_max_speed(1.25 + 0.1 * (k % 3))
        path = ai.go_to_location(corners[dst])
        walkers.append((w, ai))
        actors += [ai, w]
        print(f"  walker {w.id} ({bp.get_attribute('name')}): corner {src} -> {dst}, {len(path)} path points")
    # one pedestrian under DIRECT control: each tick a WalkerControl steers it along a planned sidewalk path up the
    # avenue's west side (outside Mudd Hall) toward W 120th
    s0, s1 = J.location - u_ave * 60.0 - u_st * 12.5, J.location - u_ave * 20.0 - u_st * 12.5
    _, stroll = m.plan_walk_route(s0, s1)
    stroller = world.spawn_actor(walker_bps[3], Transform(stroll[0] if stroll else s0, Rotation(yaw=north)))
    actors.append(stroller)

    # ---------------------------------------------------------------- sensors
    pole = corners[(-1, -1)] - u_st * 3.0 + Location(0, 0, 6.5)
    look = J.location - pole
    cam_T = Transform(pole, Rotation(pitch=math.degrees(math.atan2(look.z + 1.0, math.hypot(look.x, look.y))), yaw=math.degrees(math.atan2(look.y, look.x))))
    q = {name: queue.Queue() for name in ("rgb", "sem", "inst", "dash")}
    sensors = []
    # the first RGB camera is the PRIMARY view (the server window shows it, and its image is the tick's own frame);
    # every further camera pose costs one more rendered frame per tick, so co-locate what you can: these three share
    # one pose and one capture
    for name, bp_id in (("rgb", "sensor.camera.rgb"), ("sem", "sensor.camera.semantic_segmentation"), ("inst", "sensor.camera.instance_segmentation")):
        bp = lib.find(bp_id)
        bp.set_attribute("fov", 80)
        if name == "inst":
            bp.set_attribute("amodal", 8)      # measure the full (amodal) box and the occlusion of the 8 largest objects
        s = world.spawn_actor(bp, cam_T)
        s.listen(q[name].put)
        sensors.append(s)
    dash_bp = lib.find("sensor.camera.rgb")
    dash_bp.set_attribute("fov", 100)
    dash = world.spawn_actor(dash_bp, Transform(Location(1.1, 0, 1.62), Rotation(pitch=-5)), attach_to=hero)
    dash.listen(q["dash"].put)
    sensors.append(dash)

    out = a.out
    for sub in ("rgb", "semantic", "instance", "dashcam", "overlay"):
        os.makedirs(os.path.join(out, sub), exist_ok=True)
    coco = boundless.util.CocoWriter(world.get_semantic_classes())
    stats = {}
    ids = {"hero": hero.id, "walkers": [w.id for w, _ in walkers], "stroller": stroller.id,
           "autopilot": [v.id for v in actors if isinstance(v, boundless.Vehicle) and v.id != hero.id]}

    # ---------------------------------------------------------------- run
    t_start = time.time()
    try:
        for i in range(a.frames):
            hero.apply_control(driver.step())
            if stroll:                                   # steer the stroller to the next point of its path
                here = stroller.get_location()
                while len(stroll) > 1 and here.distance_2d(stroll[0]) < 0.6:
                    stroll.pop(0)
                done = len(stroll) == 1 and here.distance_2d(stroll[0]) < 0.6
                stroller.apply_control(WalkerControl(direction=stroll[0] - here, speed=0.0 if done else 1.15))
            frame = world.tick()
            rgb, sem, inst, dcam = (q[k].get(timeout=60) for k in ("rgb", "sem", "inst", "dash"))
            assert rgb.frame == sem.frame == inst.frame == dcam.frame == frame
            if i % a.every:
                continue
            name = f"{frame:06d}"
            rgb.save_to_disk(os.path.join(out, "rgb", name + ".png"))
            sem.save_to_disk(os.path.join(out, "semantic", name + ".png"))
            inst.save_to_disk(os.path.join(out, "instance", name + ".png"))
            dcam.save_to_disk(os.path.join(out, "dashcam", name + ".png"))
            labels = [l for l in inst.labels if l.area >= 60]
            coco.add(f"rgb/{name}.png", labels, rgb.width, rgb.height, frame=frame)
            for l in labels:
                stats[l.class_name] = stats.get(l.class_name, 0) + 1
            if np is not None:
                from boundless.png import write_png
                ours = [l for l in labels if l.actor_id]
                img = boundless.util.draw_boxes_rgb(rgb, [l for l in labels if l.class_id in (19, 20, 21, 23)],
                                                    color_of=lambda l: (255, 200, 0) if l.actor_id else (60, 200, 255))
                write_png(os.path.join(out, "overlay", name + ".png"), rgb.width, rgb.height, img.tobytes(), 3)
            seen = sorted({l.actor_id for l in labels if l.actor_id})
            light = world.get_traffic_light_state(north)
            print(f"frame {frame}: {len(labels)} objects, our actors in view {seen}, hero {hero.get_speed():4.1f} m/s, "
                  f"Amsterdam light {light.state:6s} ({time.time() - t_start:.0f} s)")
    finally:
        coco.save(os.path.join(out, "annotations_coco.json"))
        with open(os.path.join(out, "scenario.json"), "w") as f:
            json.dump({"junction": J.id, "location": J.location.to_dict(), "camera": cam_T.to_dict(), "actors": ids,
                       "objects_per_class": stats, "frames": a.frames, "every": a.every}, f, indent=1)
        for s in sensors:
            s.stop()
        for act in reversed(actors + sensors):
            act.destroy()
        world.apply_settings(original)
    print(f"done: {len(coco.images)} frames, {len(coco.annotations)} boxes -> {out}")


if __name__ == "__main__":
    main()
