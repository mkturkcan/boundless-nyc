# Notice: pedestrian models (peds24)

These pedestrian bodies, outfits and textures are converted from the CARLA 0.10.0 walkers. CARLA distributes them
under CC BY 4.0. Attribution: "CARLA Simulator (carla.org), CC BY 4.0". The walk, run and idle clips are retargeted
from the 100STYLE dataset (Mason, Starke and Komura, 2022; CC BY 4.0). The bags are CC BY 4.0 Sketchfab models; their
authors are listed in ACKNOWLEDGEMENTS.md.

**MetaHuman.** All 25 bodies carry material instances with an `_MH` suffix and MetaHuman-style eye materials, which
indicate components created with Epic Games' MetaHuman. MetaHuman-derived components are subject to Epic's
MetaHuman licence (https://www.metahuman.com/license), in addition to CC BY 4.0. Epic's terms allow MetaHuman
characters in other engines and software, including commercial projects. They do not allow using MetaHumans to train
or enhance artificial-intelligence models, and revenue thresholds apply to commercial users.

Do not use these assets, or frames rendered with them, to train, fine-tune, test or benchmark machine-learning models
unless Epic's terms permit your use. For such frames, render with the built-in procedural pedestrians instead:
`--pedestrians procedural` on the simulation server, or `?crowd=0` in the browser client.

`manifest.json` in this folder carries the same flag in its `license` block (`"metahuman": true`).
