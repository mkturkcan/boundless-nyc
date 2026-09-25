"""Controlling actors at W 120th St and Amsterdam Ave: a taxi under manual control that stops for the light, a car on
autopilot with a planned turn, a pedestrian steered along a sidewalk route, and one sent across the junction by the AI
controller. The streets are emptied of the city's own traffic first. A camera looks straight down on the junction;
the script saves its frames and draws every actor's path over the last one. Needs numpy.

    python actors.py [--host 127.0.0.1] [--port 2000] [--seconds 30] [--out _out/actors]
"""
import argparse
import math
import os
import queue
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))   # run from a source checkout
import boundless  # noqa: E402
from boundless import Location, Rotation, Transform, VehicleControl, WalkerControl  # noqa: E402
from boundless.png import write_png  # noqa: E402
from boundless.util import project_point  # noqa: E402

AMSTERDAM_120 = (40.80955, -73.95905)      # W 120th St & Amsterdam Ave, Morningside Heights
UPTOWN = 61.0                              # Manhattan's avenues run at this yaw (degrees counter-clockwise from east)
DT = 0.05
COLOUR = {"manual": (255, 196, 0), "autopilot": (80, 200, 255), "walker": (255, 70, 120), "ai_walker": (150, 255, 90)}


def unit(yaw):
    return Location(math.cos(math.radians(yaw)), math.sin(math.radians(yaw)), 0)


def drive(world, taxi, junction, cruise=7.0):
    """A manual controller: hold `cruise` m/s straight ahead, stop at the line while the light is not green."""
    t = taxi.get_transform()
    ahead = (junction.location - t.location).dot(unit(t.rotation.yaw))      # metres to the junction centre
    target = cruise
    if 11.0 < ahead < 35.0 and world.get_traffic_light_state(t.rotation.yaw).state != "green":
        target = 0.0 if ahead < 13.0 else min(cruise, math.sqrt(2.0 * 2.0 * (ahead - 13.0)))
    if target == 0.0:
        return VehicleControl(brake=1.0)
    error = target - taxi.get_speed()
    if error >= 0:
        return VehicleControl(throttle=min(1.0, 0.3 + 0.3 * error))
    return VehicleControl(brake=min(1.0, 0.5 - 0.3 * error))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=2000)
    ap.add_argument("--seconds", type=float, default=30.0)
    ap.add_argument("--out", default="_out/actors")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)

    client = boundless.Client(a.host, a.port)
    client.set_timeout(120.0)
    world = client.get_world()
    original, ambient = world.get_settings(), world.get_ambient_traffic()
    world.apply_settings(boundless.WorldSettings(synchronous_mode=True, fixed_delta_seconds=DT))
    world.set_ambient_traffic(vehicles=0, walkers=0)        # API actors only; they are never counted or removed
    m = world.get_map()
    here = m.geolocation_to_location(*AMSTERDAM_120)
    world.get_spectator().set_transform(Transform(here + Location(0, 0, 30)))
    world.wait_until_loaded()
    J = m.get_junctions(center=here, radius=60)[0]
    lib = world.get_blueprint_library()
    up, east = unit(UPTOWN), unit(UPTOWN - 90)            # up the avenue, and along the street towards the east
    actors = []

    # every signal runs the same cycle: start as W 120th St turns green, so that the taxi on the avenue meets a red
    while True:
        light = world.get_traffic_light_state(UPTOWN - 90)
        if light.state == "green" and light.time_left > 12.0:
            break
        world.tick()

    def spawn(bp_id, transform):
        actor = world.spawn_actor(lib.find(bp_id), transform)
        actors.append(actor)
        return actor

    try:
        # vehicles: spawn on a lane pose from the map; manual until set_autopilot(True)
        manual = spawn("vehicle.taxi2", m.get_waypoint(J.location - up * 55 + east * 4, heading=UPTOWN).transform)
        auto = spawn("vehicle.suv", m.get_waypoint(J.location - east * 45, heading=UPTOWN - 90).transform)
        auto.set_autopilot(True, route=["left"])            # at the next junction, turn left (uptown)

        # pedestrians: one steered directly along a sidewalk route, one routed by the AI controller
        _, sidewalk = m.plan_walk_route(J.location - up * 45 - east * 12.5, J.location + up * 30 - east * 12.5)
        walker = spawn("walker.pedestrian.0003", Transform(sidewalk[0]))
        crosser = spawn("walker.pedestrian.0011", Transform(J.location - up * 14 + east * 14))
        ai = world.spawn_actor(lib.find("controller.ai.walker"), Transform(), attach_to=crosser)
        actors.append(ai)
        ai.start()
        route = ai.go_to_location(J.location + up * 14 - east * 14)   # the opposite corner, over two crosswalks
        print(f"sidewalk route {len(sidewalk)} points; AI route {len(route)} points, state {ai.get_state()}")

        # a camera 80 m above the junction looking straight down, the avenue running left to right
        bp = lib.find("sensor.camera.rgb")
        bp.set_attribute("fov", 75)
        cam = world.spawn_actor(bp, Transform(J.location + Location(0, 0, 80), Rotation(pitch=-90, yaw=UPTOWN + 90)))
        actors.append(cam)
        frames = queue.Queue()
        cam.listen(frames.put)

        tracked = {"manual": manual, "autopilot": auto, "walker": walker, "ai_walker": crosser}
        paths = {k: [] for k in tracked}
        for step in range(int(a.seconds / DT)):
            manual.apply_control(drive(world, manual, J))
            here_w = walker.get_location()
            while len(sidewalk) > 1 and here_w.distance_2d(sidewalk[0]) < 0.8:
                sidewalk.pop(0)
            arrived = len(sidewalk) == 1 and here_w.distance_2d(sidewalk[0]) < 0.8
            walker.apply_control(WalkerControl(direction=sidewalk[0] - here_w, speed=0.0 if arrived else 1.4))
            frame = world.tick()
            image = frames.get(timeout=30)
            for k, actor in tracked.items():
                paths[k].append(actor.get_location())
            if step % 40 == 0:
                image.save_to_disk(os.path.join(a.out, f"top_{frame:06d}.png"))
                print(f"t = {step * DT:5.2f} s: taxi {manual.get_speed():4.1f} m/s, "
                      f"light {world.get_traffic_light_state(UPTOWN).state}, AI walker {ai.get_state()}")

        # every actor's path, projected into the last top-down frame
        img = image.to_numpy()[..., :3].copy()
        for k, pts in paths.items():
            for p in pts:
                uv = project_point(p, image.transform, image.width, image.height, image.fov)
                if uv and 0 <= uv[0] < image.width and 0 <= uv[1] < image.height:
                    x, y = int(uv[0]), int(uv[1])
                    img[max(0, y - 2):y + 3, max(0, x - 2):x + 3] = COLOUR[k]
        write_png(os.path.join(a.out, "paths.png"), image.width, image.height, img.tobytes(), 3)
        print("travelled:", {k: round(sum(p.distance(q) for p, q in zip(pts, pts[1:])), 1) for k, pts in paths.items()})
    finally:
        for actor in reversed(actors):
            actor.destroy()
        world.set_ambient_traffic(vehicles=ambient["vehicles"], walkers=ambient["walkers"])
        world.apply_settings(original)


if __name__ == "__main__":
    main()
