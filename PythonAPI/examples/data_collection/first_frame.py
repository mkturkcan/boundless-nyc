"""Your first frame: move the camera to W 120th St and Amsterdam Ave and save one RGB image and its bounding boxes.

    python first_frame.py        (a server on 127.0.0.1:2000; writes _out/rgb.png and _out/boxes.json)
"""
import valdrada
from valdrada import Location, Rotation, Transform

world = valdrada.Client("127.0.0.1", 2000).get_world()
spot = world.get_map().geolocation_to_location(40.80955, -73.95905)   # W 120th St and Amsterdam Ave
pose = Transform(spot + Location(-30, -30, 12), Rotation(pitch=-15, yaw=45))
world.get_spectator().set_transform(pose)                              # the city streams in around the spectator
world.wait_until_loaded()
lib = world.get_blueprint_library()
rgb, boxes = (world.spawn_actor(lib.find("sensor.camera." + kind), pose) for kind in ("rgb", "bounding_boxes"))
rgb.listen(lambda image: print(image.save_to_disk("_out/rgb.png")))
boxes.listen(lambda labels: print(labels.save_to_disk("_out/boxes.json"), len(labels.labels), "objects"))
world.tick()                                                           # one step: both files exist when it returns
rgb.destroy(), boxes.destroy()
