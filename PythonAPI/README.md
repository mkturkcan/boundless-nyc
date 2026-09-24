# boundless: the Python API of the boundless.js NYC simulator

`boundless` drives a running **BoundlessNYC** server (the boundless.js digital twin of New York City, packaged as a
desktop simulator) over TCP, the way the `carla` package drives a CARLA server:

- spawn vehicles from the NYC fleet and pedestrians (37 outfit variants);
- control vehicles directly (throttle, steer, brake) or hand them to the traffic simulation, with optional turn plans;
- walk pedestrians directly, or send them across the city with an AI controller that routes over sidewalks and
  crosswalks;
- attach cameras for RGB, semantic segmentation, instance segmentation (masks plus visible and amodal boxes, with
  occlusion and the actor id of every object), depth, and bounding boxes;
- step the world in synchronous mode and get every sensor's data for each step;
- query lanes, junctions, spawn points and signal states, and change the time of day, the rain and the amount of
  background traffic.

The package is pure Python (3.8+) with no dependencies. numpy is optional; it enables `to_numpy()` and a few
helpers.

## Install

```sh
pip install dist/boundless-0.1.0-py3-none-any.whl      # from a release
pip install -e PythonAPI                                # from a source checkout
```

## Five lines

```python
import boundless
client = boundless.Client("127.0.0.1", 2000)
world = client.get_world()
here = world.get_map().geolocation_to_location(40.80955, -73.95905)    # W 120th St & Amsterdam Ave
print(world.get_map().get_junctions(center=here, radius=60)[0])
```

## Frames and units

| | |
|---|---|
| world | ENU metres from 40.7831 N, 73.9712 W: **x east, y north, z up** |
| `Rotation(pitch, yaw, roll)` | degrees; yaw counter-clockwise from east, pitch nose-up positive, roll right-side-down positive |
| attachments (`attach_to=`) | the child's transform is in the parent's body frame: **x forward, y left, z up** |
| images | top-down rows; boxes are `[x, y, w, h]` pixels from the top-left |
| `VehicleControl.steer` | -1 .. 1, positive turns **right** (as in CARLA) |

## Examples

| script | what it shows |
|---|---|
| `examples/quickstart.py` | connect, stream the tiles in, spawn a taxi on autopilot with a chase camera, save frames |
| `examples/intersection_120_amsterdam.py` | a scripted scenario at W 120th St & Amsterdam Ave: a taxi under direct control that stops for the light, autopilot cars with planned turns, pedestrians crossing with AI routes, a pole-mounted camera writing RGB, semantic, instance and COCO boxes, and a dashcam |
| `examples/generate_traffic.py` | fill an area with autopilot vehicles and wandering pedestrians |
| `examples/benchmark.py` | seconds per tick for common sensor setups on your machine |

The full reference is `Docs/python_api.md`, and the wire protocol is `Docs/protocol.md`.
