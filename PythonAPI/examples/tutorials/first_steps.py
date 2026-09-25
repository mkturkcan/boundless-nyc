"""First steps: connect to the server, place the spectator, step the world in synchronous mode, and change the time
of day and the weather. Saves one RGB image per condition at W 125th St and Lenox Ave.

    python first_steps.py [--host 127.0.0.1] [--port 2000] [--out _out/first_steps]
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))   # run from a source checkout
import boundless  # noqa: E402
from boundless import Location, Rotation, Transform, WeatherParameters  # noqa: E402

LENOX_125 = (40.80776, -73.94549)          # W 125th St & Lenox Ave, Harlem


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=2000)
    ap.add_argument("--out", default="_out/first_steps")
    a = ap.parse_args()

    client = boundless.Client(a.host, a.port)       # retries until the server accepts the connection
    client.set_timeout(120.0)
    world = client.get_world()                       # waits until the simulator has booted
    info = client.get_server_info()
    print(f"server {client.get_server_version()}, {info['resolution'][0]}x{info['resolution'][1]}, {info['gpu']}")

    # synchronous mode: the world advances one fixed step per world.tick() and waits in between
    original, original_weather = world.get_settings(), world.get_weather()
    world.apply_settings(boundless.WorldSettings(synchronous_mode=True, fixed_delta_seconds=0.05))

    # the city streams in around the spectator: move it to the intersection and wait for the tiles
    m = world.get_map()
    here = m.geolocation_to_location(*LENOX_125)
    world.get_spectator().set_transform(Transform(here + Location(0, 0, 30)))
    print("loaded:", world.wait_until_loaded())
    junction = m.get_junctions(center=here, radius=40)[0]
    print(junction, "arm headings:", sorted({round(arm.heading) for arm in junction.arms}))

    # an RGB camera at eye height on the south-west corner, looking up Lenox Ave
    bp = world.get_blueprint_library().find("sensor.camera.rgb")
    bp.set_attribute("fov", 80)
    camera = world.spawn_actor(bp, Transform(junction.location + Location(-22, -20, 1.8), Rotation(pitch=2, yaw=45)))
    latest = {}
    camera.listen(lambda image: latest.update(image=image))   # runs once per tick, before tick() returns

    conditions = [("day", WeatherParameters.Day), ("golden", WeatherParameters.Golden),
                  ("dusk", WeatherParameters.Dusk), ("night", WeatherParameters.Night),
                  ("rain", WeatherParameters.RainyDay)]
    try:
        for name, weather in conditions:
            world.set_weather(weather)
            for _ in range(60):                     # 3 s of simulated time: lighting and image history settle
                frame = world.tick()
            path = latest["image"].save_to_disk(f"{a.out}/{name}.png")
            print(f"{name:7s} frame {frame}, sim time {world.get_snapshot().timestamp:6.2f} s -> {path}")
        # rain leaves the streets wet, and they dry over a few seconds of simulated time: dry them for the next script
        camera.stop()
        world.set_weather(original_weather)
        for _ in range(200):
            world.tick()
    finally:
        camera.destroy()
        world.set_weather(original_weather)
        world.apply_settings(original)


if __name__ == "__main__":
    main()
