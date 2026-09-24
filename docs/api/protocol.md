# BoundlessNYC wire protocol (API 0.1.0)

The Python package speaks this protocol; any language with TCP sockets and JSON can too.

## Transport

One TCP connection per client (default `127.0.0.1:2000`). Both directions send **frames**:

```
[u32 big-endian length N][u8 kind][N-1 bytes payload]
kind 1 = JSON (UTF-8)      kind 2 = binary blob
```

## Requests and responses

```json
-> {"id": 7, "method": "world.spawn_actor", "params": {"blueprint": "vehicle.taxi2", "transform": {...}}}
<- {"id": 7, "result": {"id": 104, "type_id": "vehicle.taxi2", ...}}
<- {"id": 8, "error": {"code": "unknown_blueprint", "message": "unknown blueprint vehicle.tank"}}
```

`id` is any integer the client picks. Requests are answered in order per connection.

## Sensor events

A listening sensor pushes one event per frame it captures:

```json
<- {"event": "sensor", "sensor": 110, "type_id": "sensor.camera.rgb", "frame": 42, "timestamp": 2.1,
    "transform": {...}, "width": 1280, "height": 720, "fov": 90, "format": "rgba8", "blobs": 1}
<- [blob frame: 1280 * 720 * 4 bytes]
```

`blobs` binary frames follow the JSON header immediately. In synchronous mode every event of a tick arrives **before**
the `world.tick` response.

| format | blob |
|---|---|
| `rgba8` | RGBA, 8 bit, rows top to bottom |
| `class_u8` | one byte per pixel: the semantic class id (`map.get_semantic_classes`) |
| `instance_rgba8` | RGBA instance ids (`code = r + g*256 + b*65536`), plus `labels` in the JSON header |
| `depth_f32` | float32 metres per pixel (little-endian), `depth_max` in the header |
| `labels` | no blob: boxes only, in `labels` |

`labels` = `{camera: {fx, fy, cx, cy, ...}, sensor_transform, instances: [...], classes: [...]}`. Each instance:
`id, class_id, class, actor_id (0 = background), bbox [x, y, w, h], area, truncated, location, yaw, extent`, and with
`amodal > 0` also `amodal_bbox, occlusion`.

## Frames and units

- World: ENU metres from 40.7831 N, 73.9712 W. **x east, y north, z up.**
- `rotation` `{pitch, yaw, roll}` in degrees: yaw counter-clockwise from east, pitch nose-up, roll right-side-down.
- Attached actors: `transform` is relative to the parent's body frame (x forward, y left, z up).
- A transform is `{"location": {"x", "y", "z"}, "rotation": {"pitch", "yaw", "roll"}}`.

## Methods

Answered by the server process itself (they work while the city is still loading):

| method | params | result |
|---|---|---|
| `server.status` | | `{ready, server_version, uptime, clients}` |
| `server.ping` | | `"pong"` |

Answered by the simulation:

| method | params | result |
|---|---|---|
| `server.info` | | `api_version, resolution, gpu, fps, frame, timestamp, synchronous_mode, fixed_delta_seconds, geo_origin` |
| `world.get_settings` | | `{synchronous_mode, fixed_delta_seconds, idle_nap_ms}` |
| `world.apply_settings` | `synchronous_mode?, fixed_delta_seconds?, idle_nap_ms?` | settings + `frame` |
| `world.tick` | `dt?` | `{frame, timestamp, timing}`; synchronous mode only |
| `world.wait_until_loaded` | `timeout?` | `{loaded, seconds, tiles, macro}` |
| `world.get_snapshot` | | `{frame, timestamp, actors: [{id, type_id, transform, velocity}]}` |
| `world.get_blueprints` | | `[{id, tags, attributes}]` |
| `world.get_actors` | `filter?` (glob) | actor descriptions |
| `world.get_actor` | `id` | actor description |
| `world.spawn_actor` | `blueprint, transform?, attributes?, attach_to?` | actor description |
| `world.destroy_actor` | `id` | `{destroyed}` |
| `world.set_weather` | `time_of_day?, rain?` | weather |
| `world.get_weather` | | `{time_of_day, rain}` |
| `world.set_ambient_traffic` | `vehicles?, walkers?` | `{vehicles, walkers}` |
| `world.get_ambient_traffic` | | `{vehicles, walkers, vehicles_now, walkers_now}` (targets, and how many are out) |
| `world.get_traffic_light_state` | `heading` | `{state, time_left, cycle, axis}` |
| `actor.get_transform` / `actor.get_velocity` / `actor.get_bounding_box` | `id` | |
| `actor.set_transform` | `id, transform` | the new transform |
| `actor.set_target_velocity` | `id, velocity` | |
| `vehicle.apply_control` | `id, throttle, steer, brake, hand_brake, reverse` | |
| `vehicle.get_control` | `id` | |
| `vehicle.get_obstacle_ahead` | `id, max_distance?, width?` | `{distance, kind, actor_id, speed}` or `null` |
| `vehicle.set_autopilot` | `id, enabled, route?` (`["left", "straight", ...]`) | |
| `walker.apply_control` | `id, direction, speed, jump` | |
| `walker_ai.start` / `walker_ai.stop` | `id` | |
| `walker_ai.set_max_speed` | `id, speed` | |
| `walker_ai.go_to_location` | `id, location, direct?` | `{path}` |
| `walker_ai.get_state` | `id` | `{state}`: `stopped`, `idle`, `walking`, `arrived` |
| `sensor.listen` / `sensor.stop` | `id` | |
| `map.info` | | `{name, geo_origin}` |
| `map.get_spawn_points` | `center?, radius?, spacing?` | transforms on lane centres |
| `map.get_waypoint` | `location, heading?, max_distance?` | waypoint or `null` |
| `map.waypoint_next` | `id, distance` | waypoints |
| `map.get_junctions` | `center?, radius?` | `[{id, location, signalized, arms}]` |
| `map.plan_walk_route` | `start, end` | `{length, path}` |
| `map.get_surface` | `location` | `{height, kind, road}` |
| `map.get_semantic_classes` | | `[{id, name, rgb}]` |
| `geo.to_location` | `lat, lon, alt?` | location |
| `geo.to_geolocation` | `x, y, z` | `{lat, lon, alt}` |

Error codes: `unknown_method`, `unknown_blueprint`, `no_such_actor`, `wrong_actor_type`, `no_such_waypoint`,
`not_synchronous`, `off_road` (autopilot requested away from any lane), `no_route`, `pool_full` (that vehicle kind has no
free instance slot), `autopilot`, `bad_weather`, `no_traffic`, `no_walkers`, and `internal` for anything unexpected.
