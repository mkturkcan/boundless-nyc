# CP32 far park (world/materials.js makeFarMaterial): Central Park as the far LoD draws it, from the USGS NAIP aerial
# (public domain). The far tiles colour the park's ground one flat grey, so every aerial up the park turned grey past
# the near tiles (~1.3 km). This resamples a NAIP export of the park into a texture on the park's own rectangle (the grid's
# bearing, 29 deg; NYC Parks M010 plus 10 m: centre (447.2, 82.2), 4168 x 902 m) at ~2 m a texel, which the far
# material lays over its ground inside that rectangle.
#
#   python client/tools/cp/relief_farphoto.py <naip.jpg> [lon0 lat0 lon1 lat1]
#     the export: https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/exportImage
#       ?bbox=-73.9830,40.7635,-73.9480,40.8015&bboxSR=4326&imageSR=4326&size=2764,3000&format=jpg&f=image
#   -> client/public/textures/cp32_park_far.jpg
import math, os, sys
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
src = sys.argv[1]
lon0, lat0, lon1, lat1 = (float(v) for v in sys.argv[2:6]) if len(sys.argv) >= 6 else (-73.9830, 40.7635, -73.9480, 40.8015)
LAT0, LON0 = 40.7831, -73.9712
M_LAT = 111132.0
M_LON = 111320.0 * math.cos(math.radians(LAT0))
C = (447.2, 82.2)
U = (0.4848, -0.8746)   # up the park (bearing 29 deg)
V = (0.8746, 0.4848)    # across it, to the east
HU, HV = 2084.0, 451.0
W, H = 2048, 448        # texels along U, across V

img = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
ih, iw = img.shape[:2]
s = (np.arange(W) + 0.5) / W
t = (np.arange(H) + 0.5) / H
S, T = np.meshgrid(s, t)
u = S * 2 * HU - HU
v = T * 2 * HV - HV
x = C[0] + u * U[0] + v * V[0]
z = C[1] + u * U[1] + v * V[1]
lon = LON0 + x / M_LON
lat = LAT0 - z / M_LAT
px = (lon - lon0) / (lon1 - lon0) * iw - 0.5
py = (lat1 - lat) / (lat1 - lat0) * ih - 0.5
x0 = np.clip(np.floor(px).astype(int), 0, iw - 2); y0 = np.clip(np.floor(py).astype(int), 0, ih - 2)
fx = np.clip(px - x0, 0, 1)[..., None]; fy = np.clip(py - y0, 0, 1)[..., None]
out = (img[y0, x0] * (1 - fx) * (1 - fy) + img[y0, x0 + 1] * fx * (1 - fy) + img[y0 + 1, x0] * (1 - fx) * fy + img[y0 + 1, x0 + 1] * fx * fy)
# a 2x2 box pre-filter: the source is 1.4 m a pixel, the texture 2 m a texel
dst = os.path.join(ROOT, 'public', 'textures', 'cp32_park_far.jpg')
Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(dst, quality=88, optimize=True)
print('wrote', dst, os.path.getsize(dst), 'bytes', W, 'x', H, 'mean rgb', out.reshape(-1, 3).mean(0).round(1))
