#!/usr/bin/bash
# Build delivery-fleet kinds: textures -> Blender model (3 LODs) -> fleet GLB in public/models/fleet24/.
#   client/tools/ar34/vehicles/delivery/build.sh boxtruck26 stepvan cargovan foodtruck icecream
set -eu
source /data0/projectnyc_aux/env.sh
D=$(cd "$(dirname "$0")" && pwd)
OUTD=$D/../../../../public/models/fleet24
WORK=${DLV_WORK:-$D/.work}
mkdir -p "$WORK"
timeout 300 python "$D/textures.py" "$D/tex"
for k in "$@"; do
  timeout -k 10 600 /data0/projectnyc_aux/.tools/blender/blender --background --python "$D/build_delivery.py" -- "$k" "$WORK/${k}_raw.glb" "$WORK/${k}_meta.json" "$D/tex" 2>&1 | grep -E "^(META|WROTE)|Error|error|Traceback" || true
  timeout 600 node "$D/finish.mjs" "$k" "$WORK/${k}_raw.glb" "$WORK/${k}_meta.json" "$OUTD/$k.glb"
done
