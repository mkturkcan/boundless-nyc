"""Live test against a running server: a vehicle spawned through the API keeps a finite pose on autopilot.
Skipped unless VALDRADA_TEST_PORT names the port of a running server (VALDRADA_TEST_HOST, default 127.0.0.1).

    VALDRADA_TEST_PORT=2000 python -m unittest discover -s PythonAPI/tests
"""
import math
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import valdrada  # noqa: E402
from valdrada import Location, Rotation, Transform  # noqa: E402

PORT = os.environ.get("VALDRADA_TEST_PORT", os.environ.get("BOUNDLESS_TEST_PORT"))


@unittest.skipUnless(PORT, "set VALDRADA_TEST_PORT to the port of a running server")
class AutopilotTest(unittest.TestCase):
    def test_api_vehicle_on_autopilot_keeps_a_finite_pose(self):
        client = valdrada.Client(os.environ.get("VALDRADA_TEST_HOST", os.environ.get("BOUNDLESS_TEST_HOST", "127.0.0.1")), int(PORT), timeout=30.0)
        client.set_timeout(120.0)
        world = client.get_world()
        original = world.get_settings()
        world.apply_settings(valdrada.WorldSettings(synchronous_mode=True, fixed_delta_seconds=0.05))
        m = world.get_map()
        here = m.geolocation_to_location(40.80955, -73.95905)       # W 120th St and Amsterdam Ave
        world.get_spectator().set_transform(Transform(here + Location(0, 0, 40), Rotation(pitch=-90)))
        world.wait_until_loaded()
        lib = world.get_blueprint_library()
        car = world.spawn_actor(lib.find("vehicle.taxi2"), m.get_spawn_points(center=here, radius=90)[0])
        try:
            start = car.get_location()
            car.set_autopilot(True)
            for _ in range(40):                                      # 2 s
                world.tick()
            t = car.get_transform()                                  # raised a TypeError on NaN coordinates before the fix
            for v in (t.location.x, t.location.y, t.location.z, t.rotation.yaw):
                self.assertTrue(math.isfinite(v))
            self.assertGreater(t.location.distance(start), 0.05)     # it drove (or crept up to a stop line)
        finally:
            car.destroy()
            world.apply_settings(original)


if __name__ == "__main__":
    unittest.main()
