#!/usr/bin/env bash
# VG37 shrubs, hedges and beds (GROUND): fetch the CC0 leaf scans into a cache directory outside the repository.
#   bash boundlessjs/tools/ar35/veg/fetch_vg37.sh [cacheDir]      (default /data0/projectnyc_aux/tmp/veg/src)
# Sources and licences: docs/notes/ar35-veg.md, SOURCES table. Nothing here is committed; build_vg37.py reads the cache.
set -euo pipefail
DST="${1:-/data0/projectnyc_aux/tmp/veg/src}"
UA="boundless-nyc-research/0.1 (project contact: github.com/boundless-nyc)"
mkdir -p "$DST"
cd "$DST"
get() { [ -s "$2" ] || timeout 300 curl -sfL -A "$UA" "$1" -o "$2"; }
# ambientCG leaf scans (CC0, ambientcg.com/list?type=Atlas,Decal&q=LeafSet):
#   001 small elliptic leaves (boxwood, privet), 013 narrow lanceolate (privet, rhododendron's young leaves), 017 / 029 ivy,
#   019 needles (yew), 020 dandelion, 022 elliptic dark green (rhododendron, viburnum), 024 ovate serrate (hydrangea),
#   026 grass foliage (ornamental grasses, liriope)
for s in 001 013 017 019 020 022 024 026 029; do
  get "https://ambientcg.com/get?file=LeafSet${s}_2K-PNG.zip" "LeafSet${s}_2K-PNG.zip" || { echo "missing LeafSet${s}"; continue; }
  mkdir -p "LeafSet${s}"; unzip -oq "LeafSet${s}_2K-PNG.zip" -d "LeafSet${s}"
done
ls -R "$DST" | grep -c png
