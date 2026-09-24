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

**Content.** The archive published on GitHub omits `Content/` (3.1 GB). Download the matching version into this
folder:

```
pip install -U huggingface_hub
hf download mehmetkeremturkcan/boundless-nyc --repo-type dataset --revision v{{VERSION}} --include "Content/*" --local-dir .
```

**Requirements.** Windows 10/11 x64 and a GPU with Direct3D 11. On hybrid laptops the server requests the discrete
GPU. The Python package needs Python ≥ 3.8; `numpy` is optional.

**Licence.** See `LICENSE`. Third-party data and assets are listed in `ACKNOWLEDGEMENTS.md`, with the attributions
their licences require.
