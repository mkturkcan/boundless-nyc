"""Offline tests of the 3D box and KITTI helpers in boundless.util (no server needed).

    python -m unittest discover -s PythonAPI/tests
"""
import math
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from boundless import Location, Rotation, Transform  # noqa: E402
from boundless.sensor_data import ObjectLabel  # noqa: E402
from boundless import util  # noqa: E402


def label(cls="car", loc=(20.0, 0.0, 0.0), yaw=0.0, extent=(2.4, 1.1, 0.8), occlusion=None, bbox=(600, 330, 80, 60)):
    d = {"id": 7, "class_id": 19, "class": cls, "bbox": list(bbox), "area": 4000, "truncated": False}
    if loc is not None:
        d["location"] = dict(zip("xyz", loc))
        d["extent"] = dict(zip("xyz", extent))
    if yaw is not None:
        d["yaw"] = yaw
    if occlusion is not None:
        d["amodal_bbox"], d["occlusion"] = list(bbox), occlusion
    return ObjectLabel(d)


def fields(line):
    parts = line.split()
    return parts[0], [float(v) for v in parts[1:]]


def same_angle(a, b, tol=0.011):
    return abs((a - b + math.pi) % (2 * math.pi) - math.pi) < tol


class KittiTest(unittest.TestCase):
    cam = Transform(Location(0, 0, 0), Rotation(yaw=0))      # looking east (+x), level

    def test_calib_focal_length(self):
        text = util.kitti_calib(1280, 720, 90.0)
        lines = text.strip().split("\n")
        self.assertEqual([l.split(":")[0] for l in lines], ["P0", "P1", "P2", "P3", "R0_rect", "Tr_velo_to_cam", "Tr_imu_to_velo"])
        p2 = [float(v) for v in lines[2].split()[1:]]
        self.assertAlmostEqual(p2[0], 640.0, places=6)      # f = W / (2 tan(fov / 2))
        self.assertEqual((p2[2], p2[6]), (640.0, 360.0))

    def test_car_ahead_driving_away(self):
        kind, v = fields(util.kitti_object(label(), self.cam))
        self.assertEqual(kind, "Car")
        trunc, occl, alpha, l, t, r, b, h, w, ln, x, y, z, ry = v
        self.assertEqual((l, t, r, b), (600, 330, 680, 390))
        self.assertEqual((h, w, ln), (1.6, 2.2, 4.8))
        self.assertEqual((x, y, z), (0.0, 0.0, 20.0))
        self.assertTrue(same_angle(ry, -math.pi / 2) and same_angle(alpha, -math.pi / 2))
        self.assertEqual(occl, 3)                               # no amodal measurement: unknown

    def test_car_right_of_camera_heading_north(self):
        # 10 m ahead, 10 m to the right, the camera 1.5 m above the car's ground point, the car heading north
        kind, v = fields(util.kitti_object(label(loc=(10.0, -10.0, -1.5), yaw=90.0), self.cam))
        x, y, z, ry, alpha = v[10], v[11], v[12], v[13], v[2]
        self.assertEqual((x, y, z), (10.0, 1.5, 10.0))
        self.assertTrue(same_angle(ry, math.pi))                # heading along the camera's -x (image left)
        self.assertTrue(same_angle(alpha, math.pi - math.atan2(10.0, 10.0)))

    def test_rejections_and_occlusion(self):
        self.assertIsNone(util.kitti_object(label(loc=(-5.0, 0.0, 0.0)), self.cam))      # behind the camera
        self.assertIsNone(util.kitti_object(label(cls="hydrant"), self.cam))            # not a KITTI type
        self.assertIsNone(util.kitti_object(label(loc=None), self.cam))                 # no 3D pose
        self.assertEqual(fields(util.kitti_object(label(cls="hydrant"), self.cam, {"hydrant": "Misc"}))[0], "Misc")
        for occ, want in ((0.02, 0), (0.3, 1), (0.8, 2)):
            self.assertEqual(fields(util.kitti_object(label(occlusion=occ), self.cam))[1][1], want)

    def test_label_vertices(self):
        vs = util.label_vertices(label(loc=(5.0, 5.0, 2.0), yaw=90.0))
        self.assertEqual(len(vs), 8)
        self.assertAlmostEqual(min(p.z for p in vs), 2.0)      # the location is the bottom centre
        self.assertAlmostEqual(max(p.z for p in vs), 3.6)
        self.assertAlmostEqual(max(p.y for p in vs) - min(p.y for p in vs), 4.8)   # length along the heading (north)
        self.assertAlmostEqual(max(p.x for p in vs) - min(p.x for p in vs), 2.2)
        self.assertIsNone(util.label_vertices(label(loc=None)))


if __name__ == "__main__":
    unittest.main()
