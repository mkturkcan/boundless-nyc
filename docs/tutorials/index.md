# Tutorials

These tutorials go from a first connection to a recorded dataset. Each page explains one script in
`PythonAPI/examples/tutorials/` and shows what it writes and prints. Every image and transcript on these pages comes
from running the scripts against the release server at its default resolution (1280 × 720).

| Tutorial and script | Covers |
|---|---|
| [First steps](first-steps.md)<br>`first_steps.py` | connecting, the spectator and streaming, synchronous stepping, time of day and weather |
| [Cameras](cameras.md)<br>`cameras.py` | a vehicle on autopilot, attached RGB cameras, saving frames |
| [Semantic and instance segmentation](segmentation.md)<br>`segmentation.py` | label cameras, the class palette, instance ids and masks |
| [Depth](depth.md)<br>`depth.py` | metric depth, 16-bit PNG, a colour-mapped preview, back-projection to a point cloud |
| [Bounding boxes](bounding-boxes.md)<br>`bounding_boxes.py` | visible and amodal 2D boxes, occlusion, 3D poses, overlays, per-frame JSON |
| [Recording a dataset](recording-a-dataset.md)<br>`record_dataset.py` | traffic and pedestrians, a synchronized sensor rig, a COCO annotation file |
| [Controlling actors](controlling-actors.md)<br>`actors.py` | manual driving, autopilot with a route, walkers, the AI controller, destroying actors |

## Before you start

Start the server as described in [Getting started](../api/getting_started.md) and leave it running. Install the
Python package and numpy, which every tutorial from segmentation on uses for arrays and drawing:

```
pip install PythonAPI/dist/boundless-0.1.0-py3-none-any.whl numpy
python PythonAPI/examples/tutorials/first_steps.py
```

From a source checkout the scripts run without installing the package, since they add `PythonAPI/` to the import
path themselves. Every script takes `--host` and `--port` for a server on another machine or port, and `--out` for
its output folder (default `_out/<script name>` in the current directory). The scripts put the world in synchronous
mode, destroy the actors they spawn and restore the settings they changed before they exit.

## Conventions

The world frame is ENU metres from 40.7831 N, 73.9712 W: x east, y north, z up. Rotations are pitch, yaw and roll in
degrees, with yaw counter-clockwise from east, and a camera looks along its +x axis. The Manhattan street grid is
rotated about 29° clockwise from true north, so its avenues run uptown at a yaw of about 61°; the scripts call this
heading `UPTOWN`. The offset of an attached actor is in its parent's frame: x forward, y left, z up.
