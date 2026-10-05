"""Time of day and weather: the same view of W 120th St and Amsterdam Ave by day, at golden hour, at dusk and at
night, then in rain by day and by night. One RGB image per condition.

    python weather_time.py [--host 127.0.0.1] [--port 2000] [--out _out/weather]
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))   # run from a source checkout
import boundless  # noqa: E402
from boundless import Location, Rotation, Transform, WeatherParameters  # noqa: E402

AMSTERDAM_120 = (40.80955, -73.95905)   # W 120th St and Amsterdam Ave
CONDITIONS = [
    ("day", WeatherParameters.Day),
    ("golden", WeatherParameters.Golden),
    ("dusk", WeatherParameters.Dusk),
    ("night", WeatherParameters.Night),
    ("rain_day", WeatherParameters.RainyDay),                      # = WeatherParameters("day", rain=0.8)
    ("rain_night", WeatherParameters("night", rain=0.8)),
]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=2000)
    ap.add_argument("--out", default="_out/weather")
    ap.add_argument("--settle", type=int, default=60, help="ticks after each change (lighting, wet streets, image history)")
    a = ap.parse_args()

    client = boundless.Client(a.host, a.port)
    client.set_timeout(120.0)
    world = client.get_world()
    original, original_weather = world.get_settings(), world.get_weather()
    world.apply_settings(boundless.WorldSettings(synchronous_mode=True, fixed_delta_seconds=0.05))

    here = world.get_map().geolocation_to_location(*AMSTERDAM_120)
    pose = Transform(here + Location(-35, -28, 6), Rotation(pitch=-8, yaw=40))
    world.get_spectator().set_transform(pose)
    print("loaded:", world.wait_until_loaded())
    camera = world.spawn_actor(world.get_blueprint_library().find("sensor.camera.rgb"), pose)
    latest = {}
    camera.listen(lambda image: latest.update(image=image))
    try:
        for name, weather in CONDITIONS:
            world.set_weather(weather)
            for _ in range(a.settle):
                world.tick()
            print(f"{name:10s} {world.get_weather()} -> {latest['image'].save_to_disk(os.path.join(a.out, name + '.png'))}")
    finally:
        camera.destroy()
        world.set_weather(original_weather)
        for _ in range(200):          # rain leaves the streets wet; they dry over a few simulated seconds
            world.tick()
        world.apply_settings(original)


if __name__ == "__main__":
    main()
