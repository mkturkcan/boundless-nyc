"""boundless — the Python API of the boundless.js NYC simulator.

    import boundless
    client = boundless.Client("127.0.0.1", 2000)
    world = client.get_world()

Frames: ENU metres (x east, y north, z up) from 40.7831 N, 73.9712 W; Rotation(pitch, yaw, roll) in degrees with yaw
counter-clockwise from east. Attachments: x forward, y left, z up. See docs/api/ for the full reference.
"""
__version__ = "0.1.0"

from .geometry import BoundingBox, GeoLocation, Location, Rotation, Transform, Vector3D
from .transport import BoundlessError, ConnectionClosed
from .actors import Actor, Sensor, Spectator, Vehicle, VehicleControl, Walker, WalkerAIController, WalkerControl
from .world import (ActorBlueprint, ActorList, BlueprintLibrary, Junction, JunctionArm, Map, TrafficLightState, Waypoint,
                    WeatherParameters, World, WorldSettings, WorldSnapshot)
from .sensor_data import (BoundingBoxes, DepthImage, Image, InstanceSegmentationImage, ObjectLabel, SemanticSegmentationImage,
                          SensorData)
from .client import Client
from . import util

__all__ = [
    "Actor", "ActorBlueprint", "ActorList", "BlueprintLibrary", "BoundingBox", "BoundingBoxes", "BoundlessError", "Client",
    "ConnectionClosed", "DepthImage", "GeoLocation", "Image", "InstanceSegmentationImage", "Junction", "JunctionArm",
    "Location", "Map", "ObjectLabel", "Rotation", "SemanticSegmentationImage", "Sensor", "SensorData", "Spectator",
    "TrafficLightState", "Transform", "Vector3D", "Vehicle", "VehicleControl", "Walker", "WalkerAIController",
    "WalkerControl", "Waypoint", "WeatherParameters", "World", "WorldSettings", "WorldSnapshot", "util",
]
