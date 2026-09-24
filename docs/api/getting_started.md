# Getting started with BoundlessNYC

BoundlessNYC is the boundless.js digital twin of New York City as a simulation server. Like CARLA, the server renders
and simulates, and your code drives it over TCP through a Python API: you spawn and control vehicles and pedestrians,
attach cameras, step the world, and read back images, segmentation, depth and bounding boxes.

## Start the server

Windows: double-click `StartServer.bat`, or run it from a terminal with options:

```
BoundlessNYC.exe --port 2000 --res 1280x720 --time day
BoundlessNYC.exe --headless            no window (the GPU still renders)
```

| option | default | |
|---|---|---|
| `--port` / `--host` | 2000 / 127.0.0.1 | the API socket (use `--host 0.0.0.0` to accept other machines) |
| `--res WxH` | 1280x720 | the render and RGB camera resolution |
| `--start-lat` / `--start-lon` | 40.80955, -73.95905 | where the city streams in first (W 120th St & Amsterdam Ave) |
| `--time` | day | `day`, `golden`, `dusk`, `night` |
| `--quality` | high | `medium` renders cheaper frames |
| `--headless` | off | hide the window |
| `--pedestrians` | photoreal | `procedural`: built-in pedestrians instead of the photoreal bank, whose MetaHuman-derived components may not be used to train AI models (`LICENSING.md`) |
| `--log FILE` / `--verbose` | | server log |

The first start compiles shaders and streams the city: allow a minute or two. `server.status` answers at once, and
`Client.get_world()` waits for the city.

## Install the Python package

```
pip install PythonAPI/dist/boundless-0.1.0-py3-none-any.whl
pip install numpy          # optional: arrays and box overlays
```

## A first script

```python
import boundless
client = boundless.Client("127.0.0.1", 2000)
world = client.get_world()
here = world.get_map().geolocation_to_location(40.80955, -73.95905)
print(world.get_map().get_junctions(center=here, radius=60)[0])
```

## The examples

| script | shows |
|---|---|
| `PythonAPI/examples/quickstart.py` | a taxi on autopilot with a chase camera, frames saved to `_out/` |
| `PythonAPI/examples/intersection_120_amsterdam.py` | a scripted scenario at W 120th St & Amsterdam Ave. A taxi under direct control stops for the light and for anyone in its path. Autopilot cars make planned turns. AI pedestrians cross, and one walks under direct control. A pole camera writes RGB, semantic and instance images and a COCO file; a dashcam rides along. |
| `PythonAPI/examples/generate_traffic.py` | fills an area with autopilot traffic and wandering pedestrians |
| `PythonAPI/examples/benchmark.py` | seconds per tick for common sensor setups on your machine |

## Synchronous stepping

```python
settings = world.get_settings()
world.apply_settings(boundless.WorldSettings(synchronous_mode=True, fixed_delta_seconds=0.05))
cam = world.spawn_actor(world.get_blueprint_library().find("sensor.camera.rgb"),
                        boundless.Transform(boundless.Location(-6, 0, 3), boundless.Rotation(pitch=-12)), attach_to=car)
cam.listen(lambda image: image.save_to_disk(f"_out/{image.frame:06d}.png"))
for _ in range(200):
    world.tick()           # every listening sensor has delivered this frame when tick() returns
world.apply_settings(settings)
```

## What the city is

- **Geometry:** New York City from open data: NYC building footprints, LiDAR heights, the street centreline, and
  planimetric sidewalks, curbs and paint. Streets carry signals, lanes, parking and the city's ambient traffic and
  pedestrians.
- **Real storefronts:** a growing set of shops is modelled on its real frontage from reference photographs. At
  W 120th St & Amsterdam Ave these are Hartley Chemist and Appletree Market.
- **Coordinates:** ENU metres from 40.7831 N, 73.9712 W: x east, y north, z up. Rotations are in degrees: yaw
  counter-clockwise from east, pitch nose-up. Attached actors are placed in the parent's frame (x forward, y left, z up).

See `python_api.md` for the full API and `protocol.md` for the wire protocol, which any language can speak.
