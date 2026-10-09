"""Spawning, controlling and removing vehicles and pedestrians at W 120th St and Amsterdam Ave: a car under direct
control, then on autopilot with a planned turn; a pedestrian walking a planned route; a pedestrian under direct
control; a chase camera on the car. Prints what each actor does and saves a chase frame every second.

    python actors_control.py [--host 127.0.0.1] [--port 2000] [--out _out/actors] [--empty]

--empty removes the background traffic while the script runs (a controlled scenario) and restores it afterwards.
"""
import argparse
import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))   # run from a source checkout
import valdrada  # noqa: E402
from valdrada import Location, Rotation, Transform, Vector3D, VehicleControl, WalkerControl  # noqa: E402

AMSTERDAM_120 = (40.80955, -73.95905)   # W 120th St and Amsterdam Ave
UPTOWN = 61.0                           # the avenues' heading (yaw, degrees)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=2000)
    ap.add_argument("--out", default="_out/actors")
    ap.add_argument("--empty", action="store_true", help="no background traffic while the script runs")
    a = ap.parse_args()
    random.seed(2)

    client = valdrada.Client(a.host, a.port)
    client.set_timeout(120.0)
    world = client.get_world()
    original, ambient = world.get_settings(), world.get_ambient_traffic()
    world.apply_settings(valdrada.WorldSettings(synchronous_mode=True, fixed_delta_seconds=0.05))
    if a.empty:
        world.set_ambient_traffic(vehicles=0, walkers=0)

    m = world.get_map()
    junction = m.get_junctions(center=m.geolocation_to_location(*AMSTERDAM_120), radius=60)[0]
    world.get_spectator().set_transform(Transform(junction.location + Location(0, 0, 40), Rotation(pitch=-90)))
    print("loaded:", world.wait_until_loaded())
    lib = world.get_blueprint_library()
    spawned = []

    def spawn(bp, transform, **kw):
        actor = world.spawn_actor(bp, transform, **kw)
        spawned.append(actor)
        return actor

    def run(seconds, every=None):
        for i in range(int(seconds * 20)):
            world.tick()
            if every and i % 20 == 0:
                every()

    try:
        # 1. a vehicle 40 m downtown of the junction, in an uptown lane: spawn points are lane centres, facing the traffic
        start = Transform(junction.location - Rotation(yaw=UPTOWN).get_forward_vector() * 40)
        sp = min(m.get_spawn_points(center=start.location, radius=40, spacing=10),
                 key=lambda t: abs((t.rotation.yaw - UPTOWN + 180) % 360 - 180) * 10 + t.location.distance(start.location))
        bp = lib.find("vehicle.taxi2")
        car = spawn(bp, sp)
        print("spawned", car, "at", car.get_location(), "box half sizes", car.bounding_box.extent)

        cam_bp = lib.find("sensor.camera.rgb")
        cam_bp.set_attribute("fov", 80)
        chase = spawn(cam_bp, Transform(Location(-7, 0, 3), Rotation(pitch=-10)), attach_to=car)   # x forward, y left, z up
        latest = {}
        chase.listen(lambda image: latest.update(image=image))
        save = lambda: latest and latest["image"].save_to_disk(os.path.join(a.out, "chase", "%06d.png"))

        # 2. direct control: throttle for two seconds, then brake
        car.apply_control(VehicleControl(throttle=0.6))
        run(2.0, save)
        print(f"after 2 s of throttle: {car.get_speed():.1f} m/s, obstacle ahead: {car.get_obstacle_ahead(max_distance=40)}")
        car.apply_control(VehicleControl(brake=1.0))
        run(1.5)
        print(f"after braking: {car.get_speed():.1f} m/s")

        # 3. autopilot: the traffic simulation drives it (lanes, signals, car following); turn left at the next junction
        car.set_autopilot(True, route=["left"])
        print("signal for uptown traffic:", world.get_traffic_light_state(UPTOWN))
        run(8.0, save)
        print(f"on autopilot: {car.get_location()}, heading {car.get_transform().rotation.yaw:.0f} deg")

        # 4. a pedestrian with a route controller (controller.ai.walker): walks a planned route over sidewalks and crosswalks
        walker_bps = list(lib.filter("walker.pedestrian.*"))
        corner = junction.location + Rotation(yaw=UPTOWN + 90).get_forward_vector() * 16 - Rotation(yaw=UPTOWN).get_forward_vector() * 16
        walker = spawn(random.choice(walker_bps), Transform(corner, Rotation(yaw=UPTOWN)))
        ai = spawn(lib.find("controller.ai.walker"), Transform(), attach_to=walker)
        ai.start()
        ai.set_max_speed(1.4)
        path = ai.go_to_location(junction.location + Rotation(yaw=UPTOWN).get_forward_vector() * 30)
        print(f"walker route: {len(path)} points, state {ai.get_state()}")

        # 5. a pedestrian under direct control: a heading and a speed, kept until changed
        manual = spawn(random.choice(walker_bps), Transform(corner + Location(2, 0, 0)))
        manual.apply_control(WalkerControl(direction=Rotation(yaw=UPTOWN).get_forward_vector(), speed=1.2))
        run(6.0, save)
        print(f"after 6 s: routed walker {ai.get_state()} at {walker.get_location()}, manual walker at {manual.get_location()}")
        manual.apply_control(WalkerControl(direction=Vector3D(1, 0, 0), speed=0.0))      # stop

        print("actors of this script:", [x.type_id for x in world.get_actors() if x in spawned])
    finally:
        # sensors and controllers first, then what they are attached to
        for actor in sorted(spawned, key=lambda x: 0 if x.type_id.startswith(("sensor.", "controller.")) else 1):
            actor.destroy()
        world.set_ambient_traffic(vehicles=ambient["vehicles"], walkers=ambient["walkers"])
        world.apply_settings(original)
        print("destroyed", len(spawned), "actors")


if __name__ == "__main__":
    main()
