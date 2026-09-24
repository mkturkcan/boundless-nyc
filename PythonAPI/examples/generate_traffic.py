"""Fill an area with API-controlled traffic: autopilot vehicles on random spawn points and pedestrians that walk to
random corners through the crosswalks, re-planning when they arrive. Runs until Ctrl+C (or --seconds).

    python generate_traffic.py [--vehicles 30] [--walkers 40] [--lat 40.80955 --lon -73.95905] [--radius 150]
                               [--no-ambient] [--seconds 0] [--async]

API actors are never despawned by the city and never counted in its ambient population (see
World.set_ambient_traffic). Everything spawned here is destroyed on exit.
"""
import argparse
import math
import os
import random
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))   # run from a source checkout
import boundless  # noqa: E402
from boundless import Location, Rotation, Transform  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=2000)
    ap.add_argument("--vehicles", type=int, default=30)
    ap.add_argument("--walkers", type=int, default=40)
    ap.add_argument("--lat", type=float, default=40.80955)
    ap.add_argument("--lon", type=float, default=-73.95905)
    ap.add_argument("--radius", type=float, default=150.0)
    ap.add_argument("--no-ambient", action="store_true", help="empty the streets of the city's own traffic first")
    ap.add_argument("--seconds", type=float, default=0.0, help="stop after this much simulated time (0: until Ctrl+C)")
    ap.add_argument("--async", dest="asynchronous", action="store_true", help="free-running (asynchronous) mode")
    ap.add_argument("--seed", type=int, default=7)
    a = ap.parse_args()
    random.seed(a.seed)

    client = boundless.Client(a.host, a.port)
    client.set_timeout(120.0)
    world = client.get_world()
    world.apply_settings(boundless.WorldSettings(synchronous_mode=not a.asynchronous, fixed_delta_seconds=0.05))
    if a.no_ambient:
        world.set_ambient_traffic(vehicles=0, walkers=0)

    m = world.get_map()
    center = m.geolocation_to_location(a.lat, a.lon)
    world.get_spectator().set_transform(Transform(center + Location(-60, -60, 55), Rotation(pitch=-35, yaw=45)))
    print("loading ...", world.wait_until_loaded())

    lib = world.get_blueprint_library()
    vehicle_bps = [b for b in lib.filter("vehicle.*") if b.id not in ("vehicle.firetruck", "vehicle.ambulance")]
    walker_bps = list(lib.filter("walker.pedestrian.*"))
    spawn_points = m.get_spawn_points(center=center, radius=a.radius, spacing=18)
    random.shuffle(spawn_points)
    actors = []

    for sp in spawn_points[:a.vehicles]:
        v = world.try_spawn_actor(random.choice(vehicle_bps), sp)
        if v is None:
            continue
        v.set_autopilot(True)
        actors.append(v)
    print(f"{len(actors)} vehicles on autopilot")

    # pedestrians: spawn near the junctions' corners and send them to other corners
    corners = []
    for j in m.get_junctions(center=center, radius=a.radius):
        for arm in j.arms:
            for side in (-1, 1):
                h = math.radians(arm.heading + side * 45)
                corners.append(j.location + Location(14 * math.cos(h), 14 * math.sin(h), 0))
    walkers = []
    for k in range(a.walkers):
        start = random.choice(corners) + Location(random.uniform(-2, 2), random.uniform(-2, 2), 0)
        w = world.try_spawn_actor(random.choice(walker_bps), Transform(start))
        if w is None:
            continue
        ai = world.spawn_actor(lib.find("controller.ai.walker"), Transform(), attach_to=w)
        ai.start()
        ai.set_max_speed(random.uniform(1.1, 1.6))
        try:
            ai.go_to_location(random.choice(corners))
        except boundless.BoundlessError:
            pass
        walkers.append((w, ai))
        actors += [ai, w]
    print(f"{len(walkers)} pedestrians walking")

    dt = 0.5 if a.asynchronous else 0.05
    t0, step = time.time(), 0
    try:
        while a.seconds <= 0 or step * dt < a.seconds:
            if a.asynchronous:
                time.sleep(dt)          # the server free-runs; we only look in now and then
            else:
                world.tick()
            step += 1
            # a walker that arrived picks a new corner (checked once per simulated second)
            if step % round(1 / dt) == 0:
                for w, ai in walkers:
                    if ai.get_state() == "arrived":
                        try:
                            ai.go_to_location(random.choice(corners))
                        except boundless.BoundlessError:
                            pass
            if step % round(5 / dt) == 0:
                print(f"t = {step * dt:6.1f} s simulated, {time.time() - t0:6.1f} s wall")
    except KeyboardInterrupt:
        pass
    finally:
        print("destroying", len(actors), "actors")
        for act in reversed(actors):
            act.destroy()


if __name__ == "__main__":
    main()
