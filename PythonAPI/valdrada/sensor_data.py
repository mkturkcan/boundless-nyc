"""What sensors deliver. Images are top-down, row-major. numpy is optional: every `to_numpy()` needs it, every
`save_to_disk()` works without it."""
from __future__ import annotations

import array
import json
import os
import struct
import sys
from typing import Dict, List, Optional

from .geometry import Location, Transform, Vector3D
from .png import write_png

try:  # optional
    import numpy as _np
except ImportError:  # pragma: no cover
    _np = None

# instance codes: pixel (r, g, b) = code; id = code * INV mod 2^24 (see labels' instance_encoding)
ID_MUL, ID_INV, ID_MOD = 3635641, 5029001, 1 << 24


def _need_numpy(what: str):
    if _np is None:
        raise ImportError(f"{what} needs numpy (pip install numpy)")
    return _np


def _mkdirs(path: str) -> None:
    d = os.path.dirname(os.path.abspath(path))
    os.makedirs(d, exist_ok=True)


class SensorData:
    """Common fields of every measurement."""

    def __init__(self, meta: dict, blobs):
        self.frame: int = int(meta.get("frame", 0))
        self.timestamp: float = float(meta.get("timestamp", 0.0))
        self.sensor_id: int = int(meta.get("sensor", 0))
        self.type_id: str = meta.get("type_id", "")
        self.transform: Transform = Transform.from_dict(meta.get("transform", {}))
        self.width: int = int(meta.get("width", 0))
        self.height: int = int(meta.get("height", 0))
        self.fov: float = float(meta.get("fov", 90.0))
        self.raw_data: bytes = bytes(blobs[0]) if blobs else b""

    def __repr__(self):
        return f"{type(self).__name__}(frame={self.frame}, {self.width}x{self.height}, sensor={self.sensor_id})"

    def _path(self, path: str) -> str:
        path = path % self.frame if "%" in path else path
        _mkdirs(path)
        return path


class Image(SensorData):
    """sensor.camera.rgb: 8-bit RGBA at the server resolution, rendered through the full pipeline (shadows, TAA,
    bloom, grading). Every RGB camera can have its own pose; each pose beyond the first costs two settle frames."""

    def to_numpy(self):
        np = _need_numpy("Image.to_numpy")
        return np.frombuffer(self.raw_data, dtype=np.uint8).reshape(self.height, self.width, 4)

    def save_to_disk(self, path: str, alpha: bool = False) -> str:
        """PNG (RGB, or RGBA with alpha=True). `path` may contain %d / %06d for the frame number."""
        path = self._path(path)
        if alpha:
            return write_png(path, self.width, self.height, self.raw_data, 4)
        rgb = bytearray(self.width * self.height * 3)
        src = memoryview(self.raw_data)
        rgb[0::3] = src[0::4]
        rgb[1::3] = src[1::4]
        rgb[2::3] = src[2::4]
        return write_png(path, self.width, self.height, rgb, 3)


class SemanticSegmentationImage(SensorData):
    """sensor.camera.semantic_segmentation: one class id (0-255) per pixel. `classes` is the server's class table
    [{id, name, rgb, isthing}] (Cityscapes colours for the Cityscapes classes)."""

    classes: List[dict] = []

    def to_numpy(self):
        np = _need_numpy("SemanticSegmentationImage.to_numpy")
        return np.frombuffer(self.raw_data, dtype=np.uint8).reshape(self.height, self.width)

    def colorize(self, classes: Optional[List[dict]] = None) -> bytes:
        """RGB bytes in the class palette (pure Python: bytes.translate per channel)."""
        classes = classes or self.classes
        tabs = [bytearray(256) for _ in range(3)]
        for c in classes:
            for k in range(3):
                tabs[k][c["id"]] = c["rgb"][k]
        out = bytearray(len(self.raw_data) * 3)
        for k in range(3):
            out[k::3] = self.raw_data.translate(bytes(tabs[k]))
        return bytes(out)

    def save_to_disk(self, path: str, colorize: bool = True) -> str:
        """colorize=True: an RGB PNG in the class palette; False: the raw class ids as an 8-bit gray PNG."""
        path = self._path(path)
        if colorize:
            return write_png(path, self.width, self.height, self.colorize(), 3)
        return write_png(path, self.width, self.height, self.raw_data, 1)


class ObjectLabel:
    """One object in view, from the instance pass.

    bbox / amodal_bbox are [x, y, w, h] pixels in the image (top-left origin); amodal is the full extent including
    the occluded part, occlusion = 1 - visible / amodal area (measured by re-rendering the object alone).
    actor_id is set when the object is an API-spawned actor. location / yaw / extent are the object's world pose
    and half sizes when known (vehicles, pedestrians, furniture)."""

    __slots__ = ("id", "class_id", "class_name", "actor_id", "bbox", "amodal_bbox", "occlusion", "truncated", "area",
                 "location", "yaw", "extent")

    def __init__(self, d: dict):
        self.id: int = d["id"]
        self.class_id: int = d["class_id"]
        self.class_name: str = d["class"]
        self.actor_id: int = d.get("actor_id", 0)
        self.bbox: List[int] = d["bbox"]
        self.amodal_bbox: Optional[List[int]] = d.get("amodal_bbox")
        self.occlusion: Optional[float] = d.get("occlusion")
        self.truncated: bool = d.get("truncated", False)
        self.area: int = d.get("area", 0)
        self.location: Optional[Location] = Location.from_dict(d["location"]) if d.get("location") else None
        self.yaw: Optional[float] = d.get("yaw")
        self.extent: Optional[Vector3D] = Vector3D.from_dict(d["extent"]) if d.get("extent") else None

    def __repr__(self):
        return f"ObjectLabel({self.class_name} id={self.id} actor={self.actor_id} bbox={self.bbox} occl={self.occlusion})"

    def to_dict(self) -> dict:
        d = {k: getattr(self, k) for k in ("id", "class_id", "class_name", "actor_id", "bbox", "amodal_bbox", "occlusion", "truncated", "area", "yaw")}
        if self.location is not None: d["location"] = self.location.to_dict()
        if self.extent is not None: d["extent"] = self.extent.to_dict()
        return d


class BoundingBoxes(SensorData):
    """sensor.camera.bounding_boxes: the labels alone (no image)."""

    def __init__(self, meta: dict, blobs):
        super().__init__(meta, blobs)
        lab = meta.get("labels") or {}
        self.labels: List[ObjectLabel] = [ObjectLabel(r) for r in lab.get("instances", [])]
        self.camera: dict = lab.get("camera", {})
        self.classes: List[dict] = lab.get("classes", [])

    def filter(self, classes=None, min_area: int = 0, actors_only: bool = False) -> List[ObjectLabel]:
        cs = set(classes) if classes else None
        return [l for l in self.labels if (cs is None or l.class_name in cs) and l.area >= min_area and (not actors_only or l.actor_id)]

    def to_dict(self) -> dict:
        return {"frame": self.frame, "timestamp": self.timestamp, "width": self.width, "height": self.height, "fov": self.fov,
                "sensor_transform": self.transform.to_dict(), "camera": self.camera, "objects": [l.to_dict() for l in self.labels]}

    def save_to_disk(self, path: str) -> str:
        path = self._path(path)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(self.to_dict(), f, indent=1)
        return path


class InstanceSegmentationImage(BoundingBoxes):
    """sensor.camera.instance_segmentation: RGBA where (r, g, b) is the object's 24-bit instance code
    (id = code * 5029001 mod 2^24; 0 = background / stuff) plus the labels of every object in view."""

    def instance_ids(self):
        """(H, W) uint32 instance ids (numpy)."""
        np = _need_numpy("InstanceSegmentationImage.instance_ids")
        a = np.frombuffer(self.raw_data, dtype=np.uint8).reshape(self.height, self.width, 4).astype(np.uint32)
        code = a[..., 0] | (a[..., 1] << 8) | (a[..., 2] << 16)
        return (code.astype(np.uint64) * ID_INV % ID_MOD).astype(np.uint32)

    def mask(self, label_or_id):
        """Boolean (H, W) mask of one object (numpy)."""
        oid = label_or_id.id if isinstance(label_or_id, ObjectLabel) else int(label_or_id)
        return self.instance_ids() == oid

    def save_to_disk(self, path: str, labels: bool = True) -> str:
        """The code image as an RGB PNG (lossless: the codes round-trip), and the labels next to it as JSON."""
        path = self._path(path)
        rgb = bytearray(self.width * self.height * 3)
        src = memoryview(self.raw_data)
        rgb[0::3] = src[0::4]
        rgb[1::3] = src[1::4]
        rgb[2::3] = src[2::4]
        write_png(path, self.width, self.height, rgb, 3)
        if labels:
            with open(os.path.splitext(path)[0] + ".json", "w", encoding="utf-8") as f:
                json.dump(self.to_dict(), f, indent=1)
        return path


class DepthImage(SensorData):
    """sensor.camera.depth: float32 metres along the view axis, top-down rows; `depth_max` (1000 m) is sky."""

    def __init__(self, meta: dict, blobs):
        super().__init__(meta, blobs)
        self.depth_max: float = float(meta.get("depth_max", 1000.0))

    def to_numpy(self):
        np = _need_numpy("DepthImage.to_numpy")
        return np.frombuffer(self.raw_data, dtype="<f4").reshape(self.height, self.width)

    def to_array(self) -> array.array:
        a = array.array("f")
        a.frombytes(self.raw_data)
        if sys.byteorder != "little":
            a.byteswap()
        return a

    def save_to_disk(self, path: str) -> str:
        """.pfm (float, exact), .npy (numpy) or .png (16-bit millimetres, clipped at 65.535 m; needs numpy)."""
        path = self._path(path)
        ext = os.path.splitext(path)[1].lower()
        if ext == ".pfm":
            row = self.width * 4
            data = memoryview(self.raw_data)
            with open(path, "wb") as f:
                f.write(f"Pf\n{self.width} {self.height}\n-1.0\n".encode("ascii"))
                for y in range(self.height - 1, -1, -1):   # PFM rows run bottom-up
                    f.write(data[y * row:(y + 1) * row])
            return path
        np = _need_numpy("DepthImage.save_to_disk(.npy/.png)")
        d = self.to_numpy()
        if ext == ".npy":
            np.save(path, d)
            return path
        mm = np.clip(d * 1000.0, 0, 65535).astype(">u2")
        return write_png(path, self.width, self.height, mm.tobytes(), 1, 16)


_BY_FORMAT = {
    "rgba8": Image,
    "class_u8": SemanticSegmentationImage,
    "instance_rgba8": InstanceSegmentationImage,
    "depth_f32": DepthImage,
    "labels": BoundingBoxes,
}


def from_event(meta: dict, blobs) -> SensorData:
    cls = _BY_FORMAT.get(meta.get("format"), SensorData)
    return cls(meta, blobs)
