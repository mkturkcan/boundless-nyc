# Notice: pedestrian models (peds24)

These pedestrian bodies, outfits and textures are converted from the CARLA 0.10.0 walkers. CARLA distributes them
under CC BY 4.0. Attribution: "CARLA Simulator (carla.org), CC BY 4.0". The walk, run and idle clips are retargeted
from the 100STYLE dataset (Mason, Starke and Komura, 2022; CC BY 4.0). The bags are CC BY 4.0 Sketchfab models; their
authors are listed in ACKNOWLEDGEMENTS.md.

**MetaHuman.** All 25 bodies carry material instances with an `_MH` suffix and MetaHuman-style eye materials, which
indicate components created with Epic Games' MetaHuman. MetaHuman-derived components are subject to Epic's
MetaHuman licence (https://www.metahuman.com/license), which operates through the Unreal Engine EULA, in addition to
CC BY 4.0. On artificial intelligence the licence states:

> You can use MetaHuman characters and animation in workflows that incorporate artificial intelligence technology.
> However, you may not use MetaHuman characters or animation curves to build or enhance any database or train or test
> artificial intelligence, machine learning, deep learning, neural networks, or similar technologies (as further
> detailed in the Unreal Engine EULA). This includes the use of rendered output from MetaHuman digital characters and
> animation curves, if created to replicate the functionality of MetaHuman.

Do not use these assets to build or enhance a dataset, or to train or test a model, unless Epic's terms permit your
use. That includes recording labelled frames and evaluating a model in the simulator. For such work, render with the
built-in procedural pedestrians instead: `--pedestrians procedural` on the simulation server, or `?crowd=0` in the
browser client.

`manifest.json` in this folder carries the same flag in its `license` block (`"metahuman": true`).

