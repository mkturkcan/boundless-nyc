# BoundlessNYC {{VERSION}}

A simulation server for New York City, driven from Python. It runs the boundless.js digital twin (streets,
buildings, signals, traffic and pedestrians) behind a CARLA-style API.

```
StartServer.bat                                        (or: BoundlessNYC.exe --port 2000 --res 1280x720)
pip install PythonAPI/dist/boundless-{{VERSION}}-py3-none-any.whl
python PythonAPI/examples/intersection_120_amsterdam.py
```

| Path | Contents |
|---|---|
| `BoundlessNYC.exe` | the server (window or `--headless`; TCP API on port 2000) |
| `Content/` | the city: the built client and its streamed tiles, textures and models |
| `PythonAPI/` | the `boundless` package (source and wheel) and the examples |
| `Docs/` | `getting_started.md`, `python_api.md`, `protocol.md` |

**Content.** `Content/` (3.1 GB) is also published as the Hugging Face dataset `mehmetkeremturkcan/boundless-nyc`
(tag `v{{VERSION}}`). To restore it in this folder:

```
pip install -U huggingface_hub
hf download mehmetkeremturkcan/boundless-nyc --repo-type dataset --revision v{{VERSION}} --include "Content/*" --local-dir .
```

**Requirements.** Windows 10/11 x64 and a GPU with Direct3D 11. On hybrid laptops the server requests the discrete
GPU. The Python package needs Python ≥ 3.8; `numpy` is optional.

**Licensing.** Code: MIT (`LICENSE`). Compiled city: ODbL 1.0. Vehicle, prop and pedestrian models: CC BY 4.0. The
photoreal pedestrians contain MetaHuman-derived components that may not be used to build or enhance a dataset or to
train or test AI models. For that work, start the server with `--pedestrians procedural`. `LICENSING.md` covers every component, and
`ACKNOWLEDGEMENTS.md` lists the required attributions.
