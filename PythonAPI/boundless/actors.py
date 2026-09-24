"""Actors: vehicles, walkers, their AI controller, sensors and the spectator."""
from __future__ import annotations

import math
from typing import Callable, List, Optional, Sequence

from .geometry import BoundingBox, Location, Rotation, Transform, Vector3D, _loc
from . import sensor_data


class VehicleControl:
    """throttle, brake in [0, 1]; steer in [-1, 1] (positive turns right, up to 35 degrees at the wheels)."""
    __slots__ = ("throttle", "steer", "brake", "hand_brake", "reverse")

    def __init__(self, throttle: float = 0.0, steer: float = 0.0, brake: float = 0.0, hand_brake: bool = False, reverse: bool = False):
        self.throttle, self.steer, self.brake = float(throttle), float(steer), float(brake)
        self.hand_brake, self.reverse = bool(hand_brake), bool(reverse)

    def __repr__(self):
        return f"VehicleControl(throttle={self.throttle:.2f}, steer={self.steer:.2f}, brake={self.brake:.2f}, hand_brake={self.hand_brake}, reverse={self.reverse})"

    def to_dict(self) -> dict:
        return {k: getattr(self, k) for k in self.__slots__}


class WalkerControl:
    """direction: a world-frame vector (only x, y matter); speed in m/s."""
    __slots__ = ("direction", "speed", "jump")

    def __init__(self, direction: Vector3D = None, speed: float = 1.3, jump: bool = False):
        self.direction = direction if direction is not None else Vector3D(1, 0, 0)
        self.speed, self.jump = float(speed), bool(jump)

    def to_dict(self) -> dict:
        return {"direction": _loc(self.direction), "speed": self.speed, "jump": self.jump}


class Actor:
    """Anything in the world the API can address. `id`, `type_id`, `attributes`, `parent` (an actor id or 0)."""

    def __init__(self, world, desc: dict):
        self._world = world
        self.id: int = int(desc["id"])
        self.type_id: str = desc.get("type_id", "")
        self.parent: int = int(desc.get("parent") or 0)
        self.attributes: dict = dict(desc.get("attributes") or {})
        bb = desc.get("bounding_box")
        self.bounding_box: Optional[BoundingBox] = BoundingBox.from_dict(bb) if bb else None
        self._alive = True

    def __repr__(self):
        return f"{type(self).__name__}(id={self.id}, type_id={self.type_id!r})"

    def __eq__(self, o):
        return isinstance(o, Actor) and o.id == self.id

    def __hash__(self):
        return hash(self.id)

    def _call(self, method: str, **params):
        return self._world._call(method, id=self.id, **params)

    @property
    def is_alive(self) -> bool:
        return self._alive

    def get_transform(self) -> Transform:
        return Transform.from_dict(self._call("actor.get_transform"))

    def get_location(self) -> Location:
        return self.get_transform().location

    def set_transform(self, transform: Transform) -> Transform:
        return Transform.from_dict(self._call("actor.set_transform", transform=transform.to_dict()))

    def set_location(self, location: Location) -> Transform:
        return Transform.from_dict(self._call("actor.set_transform", transform={"location": _loc(location)}))

    def get_velocity(self) -> Vector3D:
        return Vector3D.from_dict(self._call("actor.get_velocity"))

    def get_speed(self) -> float:
        return self.get_velocity().length()

    def set_target_velocity(self, velocity: Vector3D) -> Vector3D:
        return Vector3D.from_dict(self._call("actor.set_target_velocity", velocity=_loc(velocity)))

    def destroy(self) -> bool:
        if not self._alive:
            return False
        ok = self._world._call("world.destroy_actor", id=self.id).get("destroyed", False)
        self._alive = False
        return ok


class Vehicle(Actor):
    """A car, taxi, van, truck or bus from the NYC fleet. Manual (apply_control) until set_autopilot(True)."""

    def apply_control(self, control: VehicleControl) -> None:
        self._call("vehicle.apply_control", **control.to_dict())

    def get_control(self) -> VehicleControl:
        return VehicleControl(**self._call("vehicle.get_control"))

    def get_obstacle_ahead(self, max_distance: float = 30.0, width: float = 2.2) -> Optional[dict]:
        """The nearest road user in this vehicle's path, background or API: a corridor `width` metres wide ahead of the
        front bumper, up to `max_distance`. Returns {'distance' (m from the bumper), 'kind' ('vehicle' | 'walker'),
        'actor_id' (0 for a background road user), 'speed'} or None. CARLA's sensor.other.obstacle, as a query."""
        return self._call("vehicle.get_obstacle_ahead", max_distance=float(max_distance), width=float(width))

    def set_autopilot(self, enabled: bool = True, route: Optional[Sequence[str]] = None) -> None:
        """enabled: the traffic simulation drives it (lanes, signals, car following, yielding to walkers).
        route: optional turns to take at the next junctions, e.g. ['straight', 'left', 'right']."""
        self._call("vehicle.set_autopilot", enabled=bool(enabled), route=list(route) if route else None)


class Walker(Actor):
    """A pedestrian. Walks under apply_control, or under a controller.ai.walker's route."""

    def apply_control(self, control: WalkerControl) -> None:
        self._call("walker.apply_control", **control.to_dict())


class WalkerAIController(Actor):
    """controller.ai.walker, attached to a walker: plans routes over the sidewalk / crosswalk graph."""

    def start(self) -> None:
        self._call("walker_ai.start")

    def stop(self) -> None:
        self._call("walker_ai.stop")

    def go_to_location(self, location: Location, direct: bool = False) -> List[Location]:
        """Walk to `location` along sidewalks and crosswalks (direct=True: a straight line). Returns the planned path."""
        r = self._call("walker_ai.go_to_location", location=_loc(location), direct=bool(direct))
        return [Location.from_dict(p) for p in r.get("path", [])]

    def set_max_speed(self, speed: float = 1.4) -> None:
        self._call("walker_ai.set_max_speed", speed=float(speed))

    def get_state(self) -> str:
        """'stopped', 'idle', 'walking' or 'arrived'."""
        return self._call("walker_ai.get_state").get("state", "")


class Sensor(Actor):
    """A camera. listen(callback) streams its data: the callback runs on the client's network thread, once per
    world.tick() (synchronous mode) and before that tick() returns."""

    def __init__(self, world, desc: dict):
        super().__init__(world, desc)
        self._cb: Optional[Callable] = None

    @property
    def is_listening(self) -> bool:
        return self._cb is not None

    def listen(self, callback: Callable[[sensor_data.SensorData], None]) -> None:
        if self.type_id == "sensor.camera.semantic_segmentation" and not sensor_data.SemanticSegmentationImage.classes:
            sensor_data.SemanticSegmentationImage.classes = self._world.get_semantic_classes()
        self._cb = callback
        self._world._client._transport.add_listener(self.id, lambda meta, blobs: callback(sensor_data.from_event(meta, blobs)))
        self._call("sensor.listen")

    def stop(self) -> None:
        self._call("sensor.stop")
        self._world._client._transport.remove_listener(self.id)
        self._cb = None

    def destroy(self) -> bool:
        if self._cb is not None:
            self._world._client._transport.remove_listener(self.id)
            self._cb = None
        return super().destroy()


class Spectator(Actor):
    """The viewpoint of the server window, and the centre the world streams around (tiles load near it)."""


def make_actor(world, desc: dict) -> Actor:
    t = desc.get("type_id", "")
    if t.startswith("vehicle."):
        return Vehicle(world, desc)
    if t.startswith("walker."):
        return Walker(world, desc)
    if t == "controller.ai.walker":
        return WalkerAIController(world, desc)
    if t.startswith("sensor."):
        return Sensor(world, desc)
    if t == "spectator":
        return Spectator(world, desc)
    return Actor(world, desc)
