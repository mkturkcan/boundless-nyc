"""The world, its map, settings, weather and blueprints."""
from __future__ import annotations

import fnmatch
from typing import Dict, Iterator, List, Optional, Sequence, Tuple

from .actors import Actor, Sensor, Spectator, make_actor
from .geometry import GeoLocation, Location, Rotation, Transform, Vector3D, _loc
from .transport import BoundlessError


class WorldSettings:
    """synchronous_mode: the world advances only on World.tick(). fixed_delta_seconds: the step per tick."""

    def __init__(self, synchronous_mode: bool = True, fixed_delta_seconds: float = 0.05):
        self.synchronous_mode = bool(synchronous_mode)
        self.fixed_delta_seconds = fixed_delta_seconds

    def __repr__(self):
        return f"WorldSettings(synchronous_mode={self.synchronous_mode}, fixed_delta_seconds={self.fixed_delta_seconds})"


class WeatherParameters:
    """time_of_day: 'day', 'golden', 'dusk' or 'night'; rain: 0 (dry) .. 1 (downpour, wet streets)."""

    def __init__(self, time_of_day: str = "day", rain: float = 0.0):
        self.time_of_day, self.rain = time_of_day, float(rain)

    def __repr__(self):
        return f"WeatherParameters(time_of_day={self.time_of_day!r}, rain={self.rain})"


WeatherParameters.Day = WeatherParameters("day")
WeatherParameters.Golden = WeatherParameters("golden")
WeatherParameters.Dusk = WeatherParameters("dusk")
WeatherParameters.Night = WeatherParameters("night")
WeatherParameters.RainyDay = WeatherParameters("day", 0.8)
WeatherParameters.RainyNight = WeatherParameters("night", 0.8)


class ActorBlueprint:
    def __init__(self, d: dict):
        self.id: str = d["id"]
        self.tags: List[str] = list(d.get("tags", []))
        self._defaults = {k: v for k, v in (d.get("attributes") or {}).items()}
        self._set: Dict[str, str] = {}

    def __repr__(self):
        return f"ActorBlueprint(id={self.id!r}, tags={self.tags})"

    def has_tag(self, tag: str) -> bool:
        return tag in self.tags

    def has_attribute(self, name: str) -> bool:
        return name in self._defaults

    def get_attribute(self, name: str):
        return self._set.get(name, self._defaults.get(name))

    def set_attribute(self, name: str, value) -> None:
        """Values are sent as given. Vehicles: color 'r,g,b', role_name. Walkers: speed, outfit (bit mask:
        1 coat, 2 hoodie, 4 backpack, 8 bag, 16 phone, 32 umbrella). Cameras: fov (horizontal degrees),
        image_size_x / image_size_y (label cameras; RGB always renders at the server resolution), sensor_tick
        (seconds between frames; 0 = every tick), amodal (how many of the largest objects get an amodal box and an
        occlusion measurement: 0 by default, ~5 ms each), min_pixels (smallest visible area that gets a label)."""
        self._set[name] = value

    @property
    def attributes(self) -> dict:
        return {**self._defaults, **self._set}


class BlueprintLibrary:
    def __init__(self, bps: List[ActorBlueprint]):
        self._bps = bps

    def __iter__(self) -> Iterator[ActorBlueprint]:
        return iter(self._bps)

    def __len__(self) -> int:
        return len(self._bps)

    def __getitem__(self, i) -> ActorBlueprint:
        return self._bps[i]

    def find(self, id: str) -> ActorBlueprint:
        for b in self._bps:
            if b.id == id:
                return b
        raise KeyError(f"no blueprint {id!r}")

    def filter(self, pattern: str) -> "BlueprintLibrary":
        return BlueprintLibrary([b for b in self._bps if fnmatch.fnmatch(b.id, pattern) or pattern in b.tags])


class Waypoint:
    """A point on a lane: road_id / lane_id (positive with the road's direction), s along the road, the lane's pose."""

    def __init__(self, world, d: dict):
        self._world = world
        self.id: str = d["id"]
        self.road_id: int = d["road_id"]
        self.lane_id: int = d["lane_id"]
        self.s: float = d["s"]
        self.transform: Transform = Transform.from_dict(d["transform"])
        self.lane_width: float = d.get("lane_width", 3.2)
        self.lanes: int = d.get("lanes", 1)
        self.is_junction: bool = d.get("is_junction", False)
        self.road_class: int = d.get("road_class", 0)
        self.oneway: bool = d.get("oneway", False)
        self.speed_limit: float = d.get("speed_limit", 40.0)   # km/h

    def __repr__(self):
        return f"Waypoint(road={self.road_id}, lane={self.lane_id}, s={self.s:.1f}, {self.transform.location!r})"

    def next(self, distance: float) -> List["Waypoint"]:
        """Waypoints `distance` metres ahead along the lane; past a junction, one per onward road."""
        return [Waypoint(self._world, w) for w in self._world._call("map.waypoint_next", id=self.id, distance=float(distance))]


class JunctionArm:
    def __init__(self, d: dict):
        self.road_id, self.heading, self.lanes = d["road_id"], d["heading"], d["lanes"]
        self.oneway, self.road_class = d["oneway"], d["road_class"]

    def __repr__(self):
        return f"JunctionArm(road={self.road_id}, heading={self.heading}, lanes={self.lanes}, oneway={self.oneway})"


class Junction:
    def __init__(self, d: dict):
        self.id: str = d["id"]
        self.location: Location = Location.from_dict(d["location"])
        self.signalized: bool = d["signalized"]
        self.arms: List[JunctionArm] = [JunctionArm(a) for a in d["arms"]]

    def __repr__(self):
        return f"Junction({self.id}, {self.location!r}, signalized={self.signalized}, arms={len(self.arms)})"


class TrafficLightState:
    def __init__(self, d: dict):
        self.state: str = d["state"]           # 'green', 'yellow', 'red'
        self.time_left: float = d["time_left"]
        self.cycle: float = d["cycle"]
        self.axis: str = d["axis"]             # 'north_south' or 'east_west' (the street grid's axes)

    def __repr__(self):
        return f"TrafficLightState({self.state}, {self.time_left:.1f} s left, {self.axis})"


class Map:
    """The loaded city. Queries only see what has streamed in around the spectator."""

    def __init__(self, world, d: dict):
        self._world = world
        self.name: str = d.get("name", "NYC")
        self.geo_origin = d.get("geo_origin", {})

    def __repr__(self):
        return f"Map({self.name})"

    def get_spawn_points(self, center: Location = None, radius: float = 150.0, spacing: float = 30.0) -> List[Transform]:
        p = {"radius": radius, "spacing": spacing}
        if center is not None:
            p["center"] = _loc(center)
        return [Transform.from_dict(t) for t in self._world._call("map.get_spawn_points", **p)]

    def get_waypoint(self, location: Location, heading: Optional[float] = None, max_distance: float = 30.0) -> Optional[Waypoint]:
        p = {"location": _loc(location), "max_distance": max_distance}
        if heading is not None:
            p["heading"] = heading
        d = self._world._call("map.get_waypoint", **p)
        return Waypoint(self._world, d) if d else None

    def get_junctions(self, center: Location = None, radius: float = 120.0) -> List[Junction]:
        p = {"radius": radius}
        if center is not None:
            p["center"] = _loc(center)
        return [Junction(j) for j in self._world._call("map.get_junctions", **p)]

    def plan_walk_route(self, start: Location, end: Location) -> Tuple[float, List[Location]]:
        r = self._world._call("map.plan_walk_route", start=_loc(start), end=_loc(end))
        return r["length"], [Location.from_dict(p) for p in r["path"]]

    def get_surface(self, location: Location) -> dict:
        """{'height': m, 'kind': 'asphalt' | 'sidewalk' | 'curb' | 'paintW' | ..., 'road': bool}"""
        return self._world._call("map.get_surface", location=_loc(location))

    def geolocation_to_location(self, latitude: float, longitude: float, altitude: float = 0.0) -> Location:
        return Location.from_dict(self._world._call("geo.to_location", lat=latitude, lon=longitude, alt=altitude))

    def transform_to_geolocation(self, location: Location) -> GeoLocation:
        d = self._world._call("geo.to_geolocation", **_loc(location))
        return GeoLocation(d["lat"], d["lon"], d["alt"])


class WorldSnapshot:
    def __init__(self, d: dict):
        self.frame: int = d["frame"]
        self.timestamp: float = d["timestamp"]
        self._actors = {a["id"]: a for a in d["actors"]}

    def __len__(self):
        return len(self._actors)

    def __iter__(self):
        return iter(self._actors.values())

    def find(self, actor_id: int) -> Optional[dict]:
        return self._actors.get(actor_id)


class ActorList(list):
    def filter(self, pattern: str) -> "ActorList":
        return ActorList(a for a in self if fnmatch.fnmatch(a.type_id, pattern))

    def find(self, actor_id: int) -> Optional[Actor]:
        for a in self:
            if a.id == actor_id:
                return a
        return None


class World:
    def __init__(self, client):
        self._client = client
        self._bp_cache: Optional[BlueprintLibrary] = None
        self._classes: Optional[List[dict]] = None
        self.last_tick: Optional[dict] = None

    def _call(self, method: str, **params):
        return self._client._transport.call(method, params)

    def __repr__(self):
        return "World(NYC)"

    # ---- time
    def get_settings(self) -> WorldSettings:
        d = self._call("world.get_settings")
        return WorldSettings(d["synchronous_mode"], d["fixed_delta_seconds"])

    def apply_settings(self, settings: WorldSettings) -> int:
        return self._call("world.apply_settings", synchronous_mode=settings.synchronous_mode, fixed_delta_seconds=settings.fixed_delta_seconds)["frame"]

    def tick(self, seconds: Optional[float] = None) -> int:
        """Advance one fixed step (synchronous mode) and wait until every listening sensor has delivered it.
        Returns the frame number; `World.last_tick` keeps the whole answer, including `timing` (where the tick's
        milliseconds went: the step frame, then each sensor group's switch / RGB / label passes)."""
        r = self._client._transport.call("world.tick", {}, timeout=seconds)
        self.last_tick = r
        return r["frame"]

    def wait_until_loaded(self, timeout: float = 180.0) -> dict:
        """Render (without advancing time) until the tiles, buildings and landmarks around the spectator are in."""
        return self._client._transport.call("world.wait_until_loaded", {"timeout": timeout}, timeout=timeout + 30)

    def get_snapshot(self) -> WorldSnapshot:
        return WorldSnapshot(self._call("world.get_snapshot"))

    # ---- content
    def get_map(self) -> Map:
        return Map(self, self._call("map.info"))

    def get_spectator(self) -> Spectator:
        return make_actor(self, self._call("world.get_actor", id=1))

    def get_blueprint_library(self) -> BlueprintLibrary:
        if self._bp_cache is None:
            self._bp_cache = BlueprintLibrary([ActorBlueprint(b) for b in self._call("world.get_blueprints")])
        return BlueprintLibrary([ActorBlueprint({"id": b.id, "tags": b.tags, "attributes": dict(b._defaults)}) for b in self._bp_cache])

    def spawn_actor(self, blueprint: ActorBlueprint, transform: Transform = None, attach_to: Actor = None) -> Actor:
        """Place an actor. Vehicles and walkers are set on the ground under `transform.location`. A sensor or
        controller with `attach_to` follows its parent; its transform is then relative (x forward, y left, z up)."""
        p = {"blueprint": blueprint.id, "attributes": {k: v for k, v in blueprint._set.items()},
             "transform": (transform or Transform()).to_dict()}
        if attach_to is not None:
            p["attach_to"] = attach_to.id
        return make_actor(self, self._call("world.spawn_actor", **p))

    def try_spawn_actor(self, blueprint: ActorBlueprint, transform: Transform = None, attach_to: Actor = None) -> Optional[Actor]:
        try:
            return self.spawn_actor(blueprint, transform, attach_to)
        except BoundlessError:
            return None

    def get_actors(self, filter: Optional[str] = None) -> ActorList:
        return ActorList(make_actor(self, d) for d in self._call("world.get_actors", filter=filter))

    def get_actor(self, actor_id: int) -> Optional[Actor]:
        try:
            return make_actor(self, self._call("world.get_actor", id=actor_id))
        except BoundlessError:
            return None

    # ---- environment
    def get_weather(self) -> WeatherParameters:
        d = self._call("world.get_weather")
        return WeatherParameters(d["time_of_day"], d["rain"])

    def set_weather(self, weather: WeatherParameters) -> None:
        self._call("world.set_weather", time_of_day=weather.time_of_day, rain=weather.rain)

    def set_ambient_traffic(self, vehicles: Optional[int] = None, walkers: Optional[int] = None) -> dict:
        """How many background vehicles / pedestrians the city keeps around the spectator (defaults 620 / 520).
        API-spawned actors are never counted or removed. 0 empties the streets for a controlled scenario."""
        return self._call("world.set_ambient_traffic", vehicles=vehicles, walkers=walkers)

    def get_ambient_traffic(self) -> dict:
        return self._call("world.get_ambient_traffic")

    def get_traffic_light_state(self, heading: float) -> "TrafficLightState":
        """The signal state for traffic travelling at `heading` (yaw, degrees). Every signalized junction runs the
        same 40 s cycle: north-south green 0-15 s, yellow to 18, all red to 20; east-west green 20-35, yellow to 38."""
        return TrafficLightState(self._call("world.get_traffic_light_state", heading=heading))

    def get_semantic_classes(self) -> List[dict]:
        if self._classes is None:
            self._classes = self._call("map.get_semantic_classes")
        return self._classes
