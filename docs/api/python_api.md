# `boundless` Python API reference (0.1.0)

`pip install PythonAPI/dist/boundless-0.1.0-py3-none-any.whl`. Pure Python 3.8+; numpy is optional
(`to_numpy()`, `util.draw_boxes_rgb`). Modelled on CARLA's `carla` package: the same objects and verbs, where the NYC
simulator has them.

## Client

```python
client = boundless.Client(host="127.0.0.1", port=2000, timeout=120.0)   # retries until the server answers
client.set_timeout(seconds)
client.get_server_info()      # api_version, resolution, gpu, fps, frame, settings, geo origin
client.get_server_version(); client.get_client_version()
client.wait_until_ready(timeout=300)   # the first start compiles shaders: 1-2 minutes
world = client.get_world()             # waits for ready
client.close()                          # also a context manager: `with boundless.Client() as client:`
```

## World

| call | what it does |
|---|---|
| `get_settings()` / `apply_settings(WorldSettings(synchronous_mode=True, fixed_delta_seconds=0.05))` | Synchronous mode (default) advances only on `tick()`. Asynchronous mode runs on real time. |
| `tick(seconds=None) -> int` | One fixed step. Every listening sensor has delivered this frame before it returns. `world.last_tick["timing"]` breaks the milliseconds down. |
| `wait_until_loaded(timeout=180)` | Renders (time frozen) until the tiles and buildings around the spectator are in. |
| `get_snapshot()` | Frame, timestamp, and every API actor's transform and velocity. |
| `get_map()` | `Map` |
| `get_spectator()` | the viewpoint: where the city streams in, and the window's view when no camera is listening |
| `get_blueprint_library()` | `BlueprintLibrary` (`find(id)`, `filter("vehicle.*")`) |
| `spawn_actor(bp, transform, attach_to=None)` / `try_spawn_actor(...)` | vehicles and walkers are set on the ground under `transform.location` |
| `get_actors(filter=None)` / `get_actor(id)` | `ActorList` / `Actor` |
| `set_weather(WeatherParameters(time_of_day, rain))` / `get_weather()` | `"day"`, `"golden"`, `"dusk"`, `"night"`; rain 0-1; presets `WeatherParameters.Day ... RainyNight` |
| `set_ambient_traffic(vehicles=None, walkers=None)` / `get_ambient_traffic()` | the background population kept around the spectator (620 / 520). 0 empties the streets. API actors are never counted or removed. |
| `get_traffic_light_state(heading)` | `TrafficLightState(state, time_left, cycle, axis)`. Every signal runs one 40 s cycle. |
| `get_semantic_classes()` | `[{id, name, rgb}]`, a Cityscapes-compatible table |

## Blueprints

- `vehicle.<kind>`, 14 kinds of the NYC fleet: `taxi`, `taxi2` (the current TLC cab), `lincoln`, `suv`, `charger`,
  `impala`, `mercedes`, `mini`, `van`, `boxtruck`, `police`, `ambulance`, `minibus`, `firetruck`. Attributes:
  `class`, `width`, `height`, `length`, `color` (`"r,g,b"`), `role_name`.
- `walker.pedestrian.0000` .. `0036`: 37 outfits. Attributes: `name`, `gender`, `age`, `build`, `uniform`, `speed`,
  `outfit` (a bit mask: 1 coat, 2 hoodie, 4 backpack, 8 bag, 16 phone, 32 umbrella). These photoreal pedestrians contain
  MetaHuman-derived components, which may not be used to train AI models (LICENSING.md). With the server option
  `--pedestrians procedural` the library instead holds one blueprint, `walker.pedestrian.procedural`, the built-in
  procedural pedestrian.
- `controller.ai.walker`: attach to a walker.
- `sensor.camera.rgb`, `.semantic_segmentation`, `.instance_segmentation`, `.depth`, `.bounding_boxes`. Attributes:
  - `fov`: horizontal field of view in degrees.
  - `image_size_x` / `image_size_y`: label cameras. RGB always renders at the server's `--res`.
  - `sensor_tick`: seconds between frames; 0 means every tick.
  - `amodal`: how many of the largest objects also get an amodal box and an occlusion value. Each costs about 5 ms; default 0.
  - `min_pixels`: the smallest visible area that gets a label.

## Actors

| class | calls |
|---|---|
| `Actor` | `id, type_id, parent, attributes, bounding_box`, `get_transform()`, `get_location()`, `set_transform(t)`, `set_location(l)`, `get_velocity()`, `get_speed()`, `set_target_velocity(v)`, `destroy()` |
| `Vehicle` | `apply_control(VehicleControl(throttle, steer, brake, hand_brake, reverse))`. `steer` > 0 turns right, up to 35° at the wheels. `get_control()`, `set_autopilot(True, route=["left", "straight", "right"])`: the traffic simulation drives it, with signals, car following and yielding to walkers, taking the listed turns at the next junctions. `get_obstacle_ahead(max_distance=30, width=2.2)`: the nearest walker or vehicle in its path. |
| `Walker` | `apply_control(WalkerControl(direction, speed))`, with direction a world-frame vector |
| `WalkerAIController` | `start()`, `stop()`, `go_to_location(loc, direct=False) -> path`, `set_max_speed(v)`, `get_state()`. Routes run over sidewalks and crosswalks; walkers wait at the kerb for a WALK long enough to cross and for no car in the way. |
| `Sensor` | `listen(callback)` (the callback runs on the network thread, before `tick()` returns), `stop()`, `is_listening` |

## Sensor data

| class | from | notes |
|---|---|---|
| `Image` | rgb | `raw_data` RGBA; `to_numpy()` (H x W x 4); `save_to_disk(path, alpha=False)` (PNG) |
| `SemanticSegmentationImage` | semantic | class ids; `to_numpy()`; `colorize()` (palette RGB bytes); `save_to_disk(path, colorize=True)` (palette PNG, or the raw ids) |
| `InstanceSegmentationImage` | instance | `labels: [ObjectLabel]` (and everything `BoundingBoxes` has); `instance_ids()`; `mask(label_or_id)`; `save_to_disk(path, labels=True)` (PNG + JSON) |
| `DepthImage` | depth | float metres; `to_numpy()`, `to_array()`; `save_to_disk(path)`: by extension `.npy`, `.pfm`, or `.png` (16-bit millimetres) |
| `BoundingBoxes` | bounding_boxes | `labels`; `filter(classes=None, min_area=0, actors_only=False)`; `to_dict()`; `save_to_disk(path)` (JSON) |

`ObjectLabel` fields:

- `id`, `class_id`, `class_name`;
- `actor_id`: the API actor, or 0 for the background city;
- `bbox`: `[x, y, w, h]`, visible pixels only;
- `amodal_bbox`, `occlusion`: with `amodal > 0`;
- `truncated`, `area`;
- `location`, `yaw`, `extent`: the object's 3D pose in the world frame.

Every sensor event also carries `frame`, `timestamp`, `transform` (the sensor's world pose), `width`, `height` and `fov`.

## Map

| call | returns |
|---|---|
| `get_spawn_points(center, radius=150, spacing=30)` | transforms on lane centres, facing the direction of travel |
| `get_waypoint(location, heading=None, max_distance=30)` | `Waypoint(road_id, lane_id, s, transform, lane_width, lanes, is_junction, road_class, oneway, speed_limit)`; `.next(d)` |
| `get_junctions(center, radius=120)` | `Junction(id, location, signalized, arms=[JunctionArm(road_id, heading, lanes, oneway, road_class)])` |
| `plan_walk_route(start, end)` | `(length, [Location])` over sidewalks and crosswalks |
| `get_surface(location)` | `{height, kind, road}` (`kind`: sidewalk, curb, asphalt, gutter, busred, paint, grass...) |
| `geolocation_to_location(lat, lon)` / `transform_to_geolocation(loc)` | WGS84 conversions |

## Geometry

`Vector3D`, `Location` (with `+ - * /`, `length`, `distance`, `distance_2d`, `dot`, `cross`, `make_unit_vector`),
`Rotation(pitch, yaw, roll)` (`get_forward_vector`, `get_right_vector`, `get_up_vector`, `matrix`),
`Transform(location, rotation)` (`transform_point`, `inverse_transform_point`, `get_matrix`, `get_inverse_matrix`),
`BoundingBox(location, extent, rotation)` (`get_local_vertices`, `get_world_vertices(transform)`), `GeoLocation`.

## Utilities (`boundless.util`)

- `camera_intrinsics(width, height, fov)`: the 3 x 3 K matrix.
- `project_point(point, camera_transform, width, height, fov)` and `project_bbox(actor_transform, bbox, camera_transform,
  width, height, fov)`: 3D to pixels.
- `CocoWriter(classes, thing_only=True)`: `add(file_name, labels, width, height, frame=0, min_area=0)` per frame, then `save(path)`. Visible boxes
  go in `bbox`; the amodal box and occlusion are extra fields.
- `draw_boxes_rgb(image, labels, color_of=None, thickness=2)`: an RGB array with boxes drawn (needs numpy).
- `png.write_png(path, width, height, data, channels)`: a PNG writer with no dependencies.

## Performance

The server renders with a full post chain (TAA, SSAO, bloom) on the GPU the OS gives Chromium; ask for the discrete one.
Ticks on an RTX 3060 Laptop GPU at 1280 x 720, 0.05 s per step:

| sensors | ms per tick | real time |
|---|---:|---:|
| none | ~55 | ~0.9x |
| one RGB camera | ~75 | ~0.65x |
| RGB + semantic + instance on one pose | ~155 | ~0.3x |
| ... plus amodal boxes for 8 objects | ~200 | ~0.25x |
| ... plus a second RGB pose (dashcam) | ~215 | ~0.23x |

Rules of thumb:

- The first RGB camera is the PRIMARY view. Its image is the tick's own frame, and the window shows it.
- Every further camera pose costs one more rendered frame per tick. Co-locate cameras where you can.
- Label cameras cost CPU time for their passes; use `sensor_tick` to run them less often than the simulation steps.
- `server --quality medium` renders cheaper frames.
