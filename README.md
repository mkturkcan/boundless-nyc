# BoundlessNYC

BoundlessNYC is a city-scale digital twin of New York City compiled from public municipal records. It combines:

- a real-time WebGL2 renderer;
- lane-level traffic and pedestrian simulation;
- pixel-exact perception ground truth;
- a client–server API modelled on CARLA.

The simulator is intended for synthetic data generation, closed-loop scenario simulation and streetscape studies in
which every modelled element can be traced to a public record.

| | |
|---|---|
| Coverage | Manhattan, the Bronx, Brooklyn and Queens |
| Buildings | 930,787 footprints from NYC Building Footprints, joined to PLUTO (use, class, floors, year) and to facade-inspection filings (wall material); 16 facade typologies with procedural architectural detail; 55 landmarks with dedicated models |
| Streets | NYC Street Centerline (CSCL): widths, lane counts, direction, speed limits and grade separation become the carriageway, kerbs, sidewalks, markings and a routable lane graph |
| Street furniture | Street trees, hydrants, bus shelters, LinkNYC kiosks, bicycle racks and subway entrances placed from their records; signals at junctions derived from the street network; lamps, signage and street furniture generated along the kerbs |
| Streaming | 2,884 tiles of 512 m (1 km detail radius) and 210 far-field tiles of 2,048 m (13 km radius), 2.4 GB compiled |
| Simulation | IDM car following on the lane graph with signal phases and turn planning; pedestrians on the sidewalk graph with signal-aware crossings; 14 vehicle types, 37 pedestrian variants |
| Sensors | RGB; semantic segmentation (Cityscapes-compatible classes); instance segmentation with visible and amodal boxes, occlusion ratios and 3D poses; metric depth |
| Interfaces | Interactive browser client; simulation server with a TCP API and a Python client (synchronous stepping, actor control, sensors, map queries) |

Links:

- Demo (browser, WebGL2): <https://huggingface.co/spaces/mehmetkeremturkcan/boundless-nyc>
- Compiled city, models and textures: <https://huggingface.co/datasets/mehmetkeremturkcan/boundless-nyc>
- Simulation server binaries: <https://github.com/mkturkcan/boundless-nyc/releases>
- Paper: [arXiv:2409.03022](https://arxiv.org/abs/2409.03022).

## Repository layout

```
boundlessjs/            renderer, simulation and perception client (three.js r185, Vite)
  src/                  engine, streaming, materials, traffic, pedestrians, perception, API bridge
  tools/pipeline/       city compiler: NYC Open Data -> binary tiles
  public/               LUTs, fonts, data; tiles, models and textures are downloaded (BUILDING.md)
src/                    building-generator library shared with the client (@nyc alias); index.html is its demo
server/                 simulation server (Electron): TCP API, content serving, release builder
PythonAPI/              `boundless` Python client, examples
space/                  the Hugging Face Space: static server for the dataset's Content/
tools/                  web packaging, headless rendering, perception export, asset build scripts
docs/                   API reference, wire protocol, rendering techniques, building typologies
```

## Quick start

**Binary release (Windows x64).**

1. Download `BoundlessNYC-<version>-win64.zip` from Releases and extract it.
2. Fetch the compiled city into the same folder:

   ```
   hf download mehmetkeremturkcan/boundless-nyc --repo-type dataset --revision v0.1.0 --include "Content/*" --local-dir <extracted folder>
   ```

3. Start the server and run an example:

   ```
   StartServer.bat
   pip install PythonAPI/dist/boundless-<version>-py3-none-any.whl
   python PythonAPI/examples/intersection_120_amsterdam.py
   ```

**From source.** See [BUILDING.md](BUILDING.md). In short:

```
npm install && (cd boundlessjs && npm install)
# binary banks (tiles, models, textures): download, or compile the tiles (BUILDING.md)
hf download mehmetkeremturkcan/boundless-nyc --repo-type dataset --revision v0.1.0 \
    --include "Content/tiles/*" --include "Content/models/*" --include "Content/textures/*" --local-dir .cache/hf
mv .cache/hf/Content/tiles .cache/hf/Content/models .cache/hf/Content/textures boundlessjs/public/
cd boundlessjs && npm run dev        # http://127.0.0.1:5219
```

## Python API

```python
import boundless
from boundless import Location, Rotation, Transform

client = boundless.Client("127.0.0.1", 2000)
world = client.get_world()
world.apply_settings(boundless.WorldSettings(synchronous_mode=True, fixed_delta_seconds=0.05))

# tiles stream around the spectator: place it, then wait for the area to load
m = world.get_map()
here = m.geolocation_to_location(40.80955, -73.95905)            # W 120th St & Amsterdam Ave
world.get_spectator().set_transform(Transform(here + Location(-40, -40, 35), Rotation(pitch=-30, yaw=45)))
world.wait_until_loaded()

lib = world.get_blueprint_library()
junction = m.get_junctions(center=here, radius=60)[0]
taxi = world.spawn_actor(lib.find("vehicle.taxi2"), m.get_spawn_points(center=junction.location, radius=90)[0])
taxi.set_autopilot(True, route=["straight", "right"])

# instance segmentation + per-object labels (visible/amodal boxes, occlusion, 3D pose), 6.5 m behind the taxi
cam = world.spawn_actor(lib.find("sensor.camera.instance_segmentation"),
                        Transform(Location(-6.5, 0, 3.0), Rotation(pitch=-12)), attach_to=taxi)
cam.listen(lambda image: print(image.frame, [(l.class_name, l.bbox, l.occlusion) for l in image.labels]))

for _ in range(100):
    world.tick()
```

Frames are ENU metres (x east, y north, z up); attachment offsets are x forward, y left, z up. The full reference is in
[docs/api/python_api.md](docs/api/python_api.md); the language-independent wire protocol is in
[docs/api/protocol.md](docs/api/protocol.md).

## Performance

Setup:

- Hardware: release build on Windows 11 with an NVIDIA RTX 3060 Laptop GPU (Direct3D 11 through ANGLE).
- Scene: W 120th St & Amsterdam Ave, with one autopilot vehicle and ambient traffic.
- Settings: 1280 × 720, synchronous mode, fixed step 0.05 s.
- Measurement: `PythonAPI/examples/benchmark.py` (60 ticks per configuration, after 5 warm-up ticks); each value is
  the mean of two consecutive runs.

| Sensor configuration | ms / step | × real time |
|---|---:|---:|
| none | 72 | 0.69 |
| RGB | 91 | 0.55 |
| depth | 118 | 0.42 |
| RGB + semantic + instance, one pose | 180 | 0.28 |
| RGB + semantic + instance, amodal boxes for 8 objects | 272 | 0.18 |
| RGB + semantic + instance, plus a vehicle-mounted RGB camera | 274 | 0.18 |

## Data and licensing

- **Code licence.** Not yet chosen. See [LICENSE](LICENSE); no licence is granted until it is replaced.
- **Data.** City geometry derives from NYC Open Data, New York State open data and OpenStreetMap (ODbL 1.0).
- **Assets.** Textures and skies come from Poly Haven and ambientCG (CC0). Vehicles, pedestrians and props derive
  from CARLA (CC BY 4.0).

Sources and conditions are listed in [ACKNOWLEDGEMENTS.md](ACKNOWLEDGEMENTS.md) and
[boundlessjs/DATA_SOURCES.md](boundlessjs/DATA_SOURCES.md).

## Citation

```bibtex
@article{turkcan2024boundless,
  title   = {Boundless: Generating photorealistic synthetic data for object detection in urban streetscapes},
  author  = {Turkcan, Mehmet Kerem and Li, Yuyang and Zang, Chengbo and Ghaderi, Javad and Zussman, Gil and Kostic, Zoran},
  journal = {arXiv preprint arXiv:2409.03022},
  year    = {2024}
}
```
