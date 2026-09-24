"""Quickstart: connect, look around W 120th St & Amsterdam Ave, spawn a taxi with a camera, drive it on autopilot and
save what the camera sees.

    python quickstart.py [--host 127.0.0.1] [--port 2000] [--frames 60] [--out _out/quickstart]
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))   # run from a source checkout
import boundless  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=2000)
    ap.add_argument("--frames", type=int, default=60)
    ap.add_argument("--out", default="_out/quickstart")
    a = ap.parse_args()

    client = boundless.Client(a.host, a.port)
    client.set_timeout(120.0)
    world = client.get_world()
    print("server", client.get_server_version(), "client", client.get_client_version())

    # fixed 20 Hz steps: the world only moves when we tick it
    world.apply_settings(boundless.WorldSettings(synchronous_mode=True, fixed_delta_seconds=0.05))

    # the city streams around the spectator: park it over the intersection, then wait for the tiles
    m = world.get_map()
    here = m.geolocation_to_location(40.80955, -73.95905)            # W 120th St & Amsterdam Ave
    world.get_spectator().set_transform(boundless.Transform(here + boundless.Location(-40, -40, 35), boundless.Rotation(pitch=-30, yaw=45)))
    print("loading:", world.wait_until_loaded())

    junction = m.get_junctions(center=here, radius=60)[0]
    print(junction, junction.arms)

    lib = world.get_blueprint_library()
    spawn = m.get_spawn_points(center=junction.location, radius=90)[0]
    taxi = world.spawn_actor(lib.find("vehicle.taxi2"), spawn)
    taxi.set_autopilot(True, route=["straight", "right"])
    print("spawned", taxi, "at", taxi.get_transform())

    cam_bp = lib.find("sensor.camera.rgb")
    cam_bp.set_attribute("fov", 90)
    # 6 m behind and 3 m above the taxi, looking slightly down (x forward, y left, z up)
    cam = world.spawn_actor(cam_bp, boundless.Transform(boundless.Location(-6.5, 0, 3.0), boundless.Rotation(pitch=-12)), attach_to=taxi)
    os.makedirs(a.out, exist_ok=True)
    cam.listen(lambda image: image.save_to_disk(os.path.join(a.out, "%06d.png")))

    for i in range(a.frames):
        frame = world.tick()
        if i % 10 == 0:
            print(f"frame {frame}: taxi at {taxi.get_location()}, {taxi.get_speed():.1f} m/s")

    cam.stop()
    cam.destroy()
    taxi.destroy()
    print("wrote", len(os.listdir(a.out)), "images to", a.out)


if __name__ == "__main__":
    main()
