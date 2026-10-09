"""Camera geometry and dataset helpers."""
from __future__ import annotations

import json
import math
from typing import Iterable, List, Optional, Sequence, Tuple

from .geometry import BoundingBox, Location, Rotation, Transform, Vector3D


def camera_intrinsics(width: int, height: int, fov: float) -> List[List[float]]:
    """3x3 K for a pinhole camera with horizontal field of view `fov` (degrees)."""
    f = width / (2.0 * math.tan(math.radians(fov) / 2.0))
    return [[f, 0.0, width / 2.0], [0.0, f, height / 2.0], [0.0, 0.0, 1.0]]


def project_point(point: Location, camera: Transform, width: int, height: int, fov: float) -> Optional[Tuple[float, float, float]]:
    """World point -> (u, v, depth) in pixels (top-left origin), or None when it is behind the camera.
    The camera looks along its +x; image right is its -y, image down is its -z."""
    p = camera.inverse_transform_point(point)
    if p.x <= 1e-6:
        return None
    f = width / (2.0 * math.tan(math.radians(fov) / 2.0))
    return (width / 2.0 + f * (-p.y) / p.x, height / 2.0 + f * (-p.z) / p.x, p.x)


def project_bbox(actor_transform: Transform, bbox, camera: Transform, width: int, height: int, fov: float):
    """The 2D box [x, y, w, h] around an actor's projected 3D box (None if any corner is behind the camera)."""
    pts = [project_point(v, camera, width, height, fov) for v in bbox.get_world_vertices(actor_transform)]
    if any(p is None for p in pts):
        return None
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    x0, y0, x1, y1 = max(0, min(xs)), max(0, min(ys)), min(width, max(xs)), min(height, max(ys))
    if x1 <= x0 or y1 <= y0:
        return None
    return [x0, y0, x1 - x0, y1 - y0]


class CocoWriter:
    """Collects frames of labels into one COCO detection file (bbox = the VISIBLE box; the amodal box, occlusion
    and actor id ride along as extra keys)."""

    def __init__(self, classes: Sequence[dict], thing_only: bool = True):
        self.categories = [{"id": c["id"], "name": c["name"], "supercategory": "thing" if c.get("isthing") else "stuff"}
                           for c in classes if c["id"] > 0 and (c.get("isthing") or not thing_only)]
        self._keep = {c["id"] for c in self.categories}
        self.images: List[dict] = []
        self.annotations: List[dict] = []

    def add(self, file_name: str, labels, width: int, height: int, frame: int = 0, min_area: int = 0) -> int:
        img_id = len(self.images) + 1
        self.images.append({"id": img_id, "file_name": file_name, "width": width, "height": height, "frame": frame})
        for l in labels:
            if l.class_id not in self._keep or l.area < min_area:
                continue
            ann = {"id": len(self.annotations) + 1, "image_id": img_id, "category_id": l.class_id, "bbox": list(l.bbox),
                   "area": l.area, "iscrowd": 0, "instance_id": l.id, "truncated": l.truncated}
            if l.amodal_bbox:
                ann["amodal_bbox"] = list(l.amodal_bbox)
                ann["occlusion"] = l.occlusion
            if l.actor_id:
                ann["actor_id"] = l.actor_id
            self.annotations.append(ann)
        return img_id

    def save(self, path: str) -> str:
        with open(path, "w", encoding="utf-8") as f:
            json.dump({"info": {"description": "Valdrada synthetic data"}, "images": self.images,
                       "annotations": self.annotations, "categories": self.categories}, f)
        return path


def draw_boxes_rgb(image, labels, color_of=None, thickness: int = 2):
    """Draw [x, y, w, h] rectangles on an Image (numpy, returns an (H, W, 3) array)."""
    import numpy as np
    a = image.to_numpy()[..., :3].copy()
    H, W = a.shape[:2]
    for l in labels:
        x, y, w, h = [int(round(v)) for v in l.bbox]
        c = (color_of(l) if color_of else (255, 60, 60))
        x0, y0, x1, y1 = max(0, x), max(0, y), min(W - 1, x + w), min(H - 1, y + h)
        a[y0:y0 + thickness, x0:x1] = c
        a[max(y0, y1 - thickness):y1, x0:x1] = c
        a[y0:y1, x0:x0 + thickness] = c
        a[y0:y1, max(x0, x1 - thickness):x1] = c
    return a


# ---------------------------------------------------------------- 3D boxes and KITTI
KITTI_TYPES = {"car": "Car", "truck": "Truck", "bus": "Bus", "pedestrian": "Pedestrian"}


def label_vertices(label) -> Optional[List[Location]]:
    """The 8 world corners of an ObjectLabel's 3D box, or None when the label has no 3D pose. A label's `location` is
    the bottom centre of its box (on the ground), `extent` its half sizes (x along its heading), `yaw` its heading
    (0 when the label has none, as for standing pedestrians)."""
    if label.location is None or label.extent is None:
        return None
    box = BoundingBox(Location(0.0, 0.0, label.extent.z), label.extent)
    return box.get_world_vertices(Transform(label.location, Rotation(yaw=label.yaw or 0.0)))


def kitti_calib(width: int, height: int, fov: float) -> str:
    """The text of a KITTI calib file for a camera with horizontal field of view `fov`: P0..P3 = K [I | 0],
    R0_rect and the two Tr matrices identity (the labels are already in the camera frame)."""
    K = camera_intrinsics(width, height, fov)
    P = [K[0][0], 0.0, K[0][2], 0.0, 0.0, K[1][1], K[1][2], 0.0, 0.0, 0.0, 1.0, 0.0]
    fmt = lambda vals: " ".join(f"{v:.12e}" for v in vals)
    eye3, eye34 = [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0], [1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0]
    lines = [f"P{i}: {fmt(P)}" for i in range(4)]
    lines += [f"R0_rect: {fmt(eye3)}", f"Tr_velo_to_cam: {fmt(eye34)}", f"Tr_imu_to_velo: {fmt(eye34)}"]
    return "\n".join(lines) + "\n"


def _wrap_pi(a: float) -> float:
    return (a + math.pi) % (2.0 * math.pi) - math.pi


def kitti_object(label, camera: Transform, types: Optional[dict] = None) -> Optional[str]:
    """One line of a KITTI label_2 file for an ObjectLabel seen by a camera at `camera` (the sensor's world
    transform, SensorData.transform), or None when its class is not in `types` (default KITTI_TYPES), it has no 3D
    pose, or its box centre is behind the camera.

    Fields: type, truncated (0 or 1), occluded (0 visible, 1 partly, 2 largely occluded, 3 unknown: needs the
    camera's `amodal` attribute), alpha, the visible 2D box (left, top, right, bottom), dimensions (height, width,
    length), the bottom centre in camera coordinates (x right, y down, z forward) and rotation_y. KITTI assumes a
    level camera; under a pitched camera the heading is projected onto the camera's x-z plane."""
    kind = (types or KITTI_TYPES).get(label.class_name)
    if kind is None or label.location is None or label.extent is None:
        return None
    p = camera.inverse_transform_point(label.location)          # x forward, y left, z up
    x, y, z = -p.y, -p.z, p.x                                   # KITTI camera: x right, y down, z forward
    if z <= 0.0:
        return None
    m = camera.rotation.matrix()
    yaw = math.radians(label.yaw or 0.0)
    f = (math.cos(yaw), math.sin(yaw), 0.0)                     # the object's heading in the world
    fb = [m[0][k] * f[0] + m[1][k] * f[1] + m[2][k] * f[2] for k in range(3)]   # ... in the camera body frame
    ry = math.atan2(-fb[0], -fb[1])                             # heading (cos ry, 0, -sin ry) in KITTI camera axes
    alpha = _wrap_pi(ry - math.atan2(x, z))
    if label.occlusion is None:
        occluded = 3
    else:
        occluded = 0 if label.occlusion < 0.1 else (1 if label.occlusion < 0.5 else 2)
    bx, by, bw, bh = label.bbox
    e = label.extent
    vals = [1.0 if label.truncated else 0.0, occluded, alpha, bx, by, bx + bw, by + bh,
            2.0 * e.z, 2.0 * e.y, 2.0 * e.x, x, y, z, _wrap_pi(ry)]
    return kind + " " + " ".join(f"{v:.2f}" if isinstance(v, float) else str(v) for v in vals)
