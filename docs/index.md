---
title: BoundlessNYC
hide:
  - navigation
  - toc
---

# BoundlessNYC { .visually-hidden }

![A simulator frame at W 125th St and Lenox Ave in Harlem, with its semantic segmentation and depth](assets/figures/hero.jpg){ .hero }

<p class="lead">BoundlessNYC is a city-scale digital twin of New York City compiled from public municipal records. It
renders Manhattan, the Bronx, Brooklyn and Queens in real time, simulates traffic and pedestrians on the city's own
street network, and returns pixel-exact ground truth through a Python API modelled on CARLA.</p>

[Get started](api/getting_started.md){ .md-button .md-button--primary }
[Python API](api/python_api.md){ .md-button }
[Demo in the browser](https://huggingface.co/spaces/mehmetkeremturkcan/boundless-nyc){ .md-button }
[Compiled city](https://huggingface.co/datasets/mehmetkeremturkcan/boundless-nyc){ .md-button }

## How it works

<figure markdown="span">
  ![Public records, the compiled city, the real-time render and its ground truth for one block of Harlem](assets/figures/pipeline.jpg)
</figure>

Every element of the city traces back to a record. Building footprints come from NYC Building Footprints and are
joined to the tax-lot database (PLUTO) for floors, use and year of construction, and to the facade inspection filings
for the wall material, so a brick tenement is brick and a limestone apartment house is stone. Each building is
classified into one of 16 facade typologies and dressed procedurally: windows on the recorded floor count, cornices,
storefronts, fire escapes, stoops and rooftop equipment. Streets come from the city's centreline database with their
recorded widths, lane counts, directions and speed limits. They become carriageways, kerbs, crosswalks, lane paint,
bus lanes, and the lane and sidewalk graphs that traffic and pedestrians move on.

The compiler is a Node.js pipeline and the renderer is three.js on WebGL2, so nothing needs an engine build. Changing
how the city looks or behaves is an edit to a JavaScript module and a page reload, and the whole city can be
recompiled from the public records ([Building from source](building.md)).

## Ground truth for every frame

<figure markdown="span">
  ![RGB, semantic segmentation, instance segmentation with visible and amodal boxes, and depth for one step at W 120th St and Amsterdam Ave](assets/figures/sensors.jpg)
</figure>

Each synchronous step can return RGB, semantic segmentation in 36 classes, instance segmentation with visible and
amodal boxes, occlusion ratios and 3D poses, and metric depth. The labels come from the renderer itself, so they need
no annotation and never drift from the image. The Python package writes COCO detection files directly
([Python API](api/python_api.md)).

## The whole city, streamed

<figure markdown="span">
  ![Every building of the four boroughs shaded by height, with the tile grid and the streaming radii around a camera in Harlem](assets/figures/coverage.jpg)
</figure>

The compiled city holds 937,965 buildings in 2,884 tiles of 512 m and 210 far-field tiles of 2,048 m, 2.4 GB in all.
The client keeps full detail within 1 km of the camera and draws far-field tiles out to 13 km, which keeps any street
of the four boroughs within reach of a laptop GPU.

## Architecture

<figure markdown="span">
  ![The compiler, the compiled city, the interactive client, the simulation server and the Python API](assets/figures/architecture.png)
</figure>

The same client runs in two hosts. In a browser, as on the Hugging Face Space, it is an interactive explorer. Inside
the simulation server, an Electron application, it advances one fixed step per request and sends sensor frames over
TCP to the Python API ([wire protocol](api/protocol.md)).

## Gallery

<figure markdown="span">
  ![Six frames from the simulator: Fifth Avenue, 125th Street, Times Square at night, Harlem brownstones, Williamsburg in the rain and Columbia's Low Library](assets/figures/gallery.jpg)
</figure>

## Citation

```bibtex
@article{turkcan2024boundless,
  title   = {Boundless: Generating photorealistic synthetic data for object detection in urban streetscapes},
  author  = {Turkcan, Mehmet Kerem and Li, Yuyang and Zang, Chengbo and Ghaderi, Javad and Zussman, Gil and Kostic, Zoran},
  journal = {arXiv preprint arXiv:2409.03022},
  year    = {2024}
}
```
