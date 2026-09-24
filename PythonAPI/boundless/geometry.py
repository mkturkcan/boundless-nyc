"""Locations, rotations and transforms.

World frame: ENU metres from the project origin (40.7831 N, 73.9712 W): x = east, y = north, z = up.
Rotation(pitch, yaw, roll) in degrees: yaw counter-clockwise from east, pitch nose-up positive, roll right-side-down
positive. Body frame (actors and sensors): x forward, y left, z up. A camera looks along its +x.
"""
from __future__ import annotations

import math
from typing import Iterable, List, Sequence, Tuple


class Vector3D:
    __slots__ = ("x", "y", "z")

    def __init__(self, x: float = 0.0, y: float = 0.0, z: float = 0.0):
        self.x, self.y, self.z = float(x), float(y), float(z)

    def __add__(self, o): return type(self)(self.x + o.x, self.y + o.y, self.z + o.z)
    def __sub__(self, o): return type(self)(self.x - o.x, self.y - o.y, self.z - o.z)
    def __mul__(self, k: float): return type(self)(self.x * k, self.y * k, self.z * k)
    __rmul__ = __mul__
    def __truediv__(self, k: float): return type(self)(self.x / k, self.y / k, self.z / k)
    def __neg__(self): return type(self)(-self.x, -self.y, -self.z)
    def __iter__(self): return iter((self.x, self.y, self.z))
    def __eq__(self, o): return isinstance(o, Vector3D) and (self.x, self.y, self.z) == (o.x, o.y, o.z)
    def __repr__(self): return f"{type(self).__name__}(x={self.x:.3f}, y={self.y:.3f}, z={self.z:.3f})"

    def length(self) -> float: return math.sqrt(self.x * self.x + self.y * self.y + self.z * self.z)
    def squared_length(self) -> float: return self.x * self.x + self.y * self.y + self.z * self.z
    def distance(self, o: "Vector3D") -> float: return (self - o).length()
    def distance_2d(self, o: "Vector3D") -> float: return math.hypot(self.x - o.x, self.y - o.y)
    def dot(self, o: "Vector3D") -> float: return self.x * o.x + self.y * o.y + self.z * o.z
    def cross(self, o: "Vector3D") -> "Vector3D":
        return type(self)(self.y * o.z - self.z * o.y, self.z * o.x - self.x * o.z, self.x * o.y - self.y * o.x)
    def make_unit_vector(self) -> "Vector3D":
        n = self.length()
        return type(self)(0, 0, 0) if n == 0 else self / n

    def to_dict(self) -> dict: return {"x": self.x, "y": self.y, "z": self.z}

    @classmethod
    def from_dict(cls, d: dict) -> "Vector3D": return cls(d.get("x", 0.0), d.get("y", 0.0), d.get("z", 0.0))


class Location(Vector3D):
    """A point in the world (ENU metres)."""


class Rotation:
    __slots__ = ("pitch", "yaw", "roll")

    def __init__(self, pitch: float = 0.0, yaw: float = 0.0, roll: float = 0.0):
        self.pitch, self.yaw, self.roll = float(pitch), float(yaw), float(roll)

    def __repr__(self): return f"Rotation(pitch={self.pitch:.3f}, yaw={self.yaw:.3f}, roll={self.roll:.3f})"
    def __eq__(self, o): return isinstance(o, Rotation) and (self.pitch, self.yaw, self.roll) == (o.pitch, o.yaw, o.roll)

    def matrix(self) -> List[List[float]]:
        """3x3 rotation, body -> world: R = Rz(yaw) . Ry(-pitch) . Rx(roll)."""
        cy, sy = math.cos(math.radians(self.yaw)), math.sin(math.radians(self.yaw))
        cp, sp = math.cos(math.radians(self.pitch)), math.sin(math.radians(self.pitch))
        cr, sr = math.cos(math.radians(self.roll)), math.sin(math.radians(self.roll))
        # columns: forward, left, up
        fwd = (cp * cy, cp * sy, sp)
        left = (-cr * sy - sr * sp * cy, cr * cy - sr * sp * sy, sr * cp)
        up = (sr * sy - cr * sp * cy, -sr * cy - cr * sp * sy, cr * cp)
        return [[fwd[0], left[0], up[0]], [fwd[1], left[1], up[1]], [fwd[2], left[2], up[2]]]

    def get_forward_vector(self) -> Vector3D:
        m = self.matrix()
        return Vector3D(m[0][0], m[1][0], m[2][0])

    def get_left_vector(self) -> Vector3D:
        m = self.matrix()
        return Vector3D(m[0][1], m[1][1], m[2][1])

    def get_right_vector(self) -> Vector3D:
        return -self.get_left_vector()

    def get_up_vector(self) -> Vector3D:
        m = self.matrix()
        return Vector3D(m[0][2], m[1][2], m[2][2])

    def to_dict(self) -> dict: return {"pitch": self.pitch, "yaw": self.yaw, "roll": self.roll}

    @classmethod
    def from_dict(cls, d: dict) -> "Rotation": return cls(d.get("pitch", 0.0), d.get("yaw", 0.0), d.get("roll", 0.0))


class Transform:
    __slots__ = ("location", "rotation")

    def __init__(self, location: Location = None, rotation: Rotation = None):
        self.location = location if location is not None else Location()
        self.rotation = rotation if rotation is not None else Rotation()

    def __repr__(self): return f"Transform({self.location!r}, {self.rotation!r})"

    def transform_point(self, p: Vector3D) -> Location:
        """Body-frame point (x forward, y left, z up) -> world."""
        m = self.rotation.matrix()
        return Location(
            self.location.x + m[0][0] * p.x + m[0][1] * p.y + m[0][2] * p.z,
            self.location.y + m[1][0] * p.x + m[1][1] * p.y + m[1][2] * p.z,
            self.location.z + m[2][0] * p.x + m[2][1] * p.y + m[2][2] * p.z,
        )

    def inverse_transform_point(self, p: Vector3D) -> Vector3D:
        """World point -> this transform's body frame (x forward, y left, z up)."""
        m = self.rotation.matrix()
        d = (p.x - self.location.x, p.y - self.location.y, p.z - self.location.z)
        return Vector3D(
            m[0][0] * d[0] + m[1][0] * d[1] + m[2][0] * d[2],
            m[0][1] * d[0] + m[1][1] * d[1] + m[2][1] * d[2],
            m[0][2] * d[0] + m[1][2] * d[1] + m[2][2] * d[2],
        )

    def get_matrix(self) -> List[List[float]]:
        """4x4 homogeneous body -> world."""
        m = self.rotation.matrix()
        t = self.location
        return [m[0] + [t.x], m[1] + [t.y], m[2] + [t.z], [0.0, 0.0, 0.0, 1.0]]

    def get_inverse_matrix(self) -> List[List[float]]:
        m = self.rotation.matrix()
        t = self.location
        rt = [[m[j][i] for j in range(3)] for i in range(3)]
        tt = [-(rt[i][0] * t.x + rt[i][1] * t.y + rt[i][2] * t.z) for i in range(3)]
        return [rt[0] + [tt[0]], rt[1] + [tt[1]], rt[2] + [tt[2]], [0.0, 0.0, 0.0, 1.0]]

    def get_forward_vector(self) -> Vector3D: return self.rotation.get_forward_vector()
    def get_right_vector(self) -> Vector3D: return self.rotation.get_right_vector()
    def get_up_vector(self) -> Vector3D: return self.rotation.get_up_vector()

    def to_dict(self) -> dict: return {"location": self.location.to_dict(), "rotation": self.rotation.to_dict()}

    @classmethod
    def from_dict(cls, d: dict) -> "Transform":
        return cls(Location.from_dict(d.get("location", {})), Rotation.from_dict(d.get("rotation", {})))


class BoundingBox:
    """An oriented box: `location` is its centre in the actor's body frame, `extent` the half sizes."""
    __slots__ = ("location", "extent", "rotation")

    def __init__(self, location: Location = None, extent: Vector3D = None, rotation: Rotation = None):
        self.location = location if location is not None else Location()
        self.extent = extent if extent is not None else Vector3D()
        self.rotation = rotation if rotation is not None else Rotation()

    def __repr__(self): return f"BoundingBox(location={self.location!r}, extent={self.extent!r})"

    def get_local_vertices(self) -> List[Location]:
        e, c = self.extent, self.location
        return [Location(c.x + sx * e.x, c.y + sy * e.y, c.z + sz * e.z)
                for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)]

    def get_world_vertices(self, actor_transform: Transform) -> List[Location]:
        return [actor_transform.transform_point(v) for v in self.get_local_vertices()]

    @classmethod
    def from_dict(cls, d: dict) -> "BoundingBox":
        return cls(Location.from_dict(d.get("location", {})), Vector3D.from_dict(d.get("extent", {})))


class GeoLocation:
    __slots__ = ("latitude", "longitude", "altitude")

    def __init__(self, latitude: float = 0.0, longitude: float = 0.0, altitude: float = 0.0):
        self.latitude, self.longitude, self.altitude = latitude, longitude, altitude

    def __repr__(self): return f"GeoLocation(latitude={self.latitude:.7f}, longitude={self.longitude:.7f}, altitude={self.altitude:.2f})"


def _loc(v) -> dict:
    """Accept a Location / Vector3D / (x, y, z) tuple / dict."""
    if isinstance(v, Vector3D):
        return v.to_dict()
    if isinstance(v, dict):
        return {"x": v.get("x", 0.0), "y": v.get("y", 0.0), "z": v.get("z", 0.0)}
    x, y, *z = v
    return {"x": float(x), "y": float(y), "z": float(z[0]) if z else 0.0}
