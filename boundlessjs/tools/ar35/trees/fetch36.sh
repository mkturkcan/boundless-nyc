#!/usr/bin/env bash
# TR36 street trees: fetch the CC0 source scans (ambientCG, Poly Haven) into a cache directory outside the repository.
#   bash tools/ar35/trees/fetch36.sh [cacheDir]      (default /data0/projectnyc_aux/tmp/trees/src)
# Sources and licences: docs/notes/ar34-trees.md, SOURCES table. Nothing here is committed; build36.py reads the cache.
set -euo pipefail
DST="${1:-/data0/projectnyc_aux/tmp/trees/src}"
UA="valdrada-research/0.1 (project contact: github.com/mkturkcan/valdrada)"
mkdir -p "$DST"
cd "$DST"
get() { [ -s "$2" ] || timeout 300 curl -sfL -A "$UA" "$1" -o "$2"; }
# ambientCG leaf scans (CC0): LeafSet001 / 003 (small elliptic leaves: honeylocust and sophora leaflets), 014 / 024 (ovate
# serrate: elm, zelkova, cherry), 022 (elliptic, darker); TR37: 010 (green palmate maple leaves: the London plane), 016 (green oak),
# 027 (autumn maple)
for s in 001 003 010 014 016 022 024 027; do
  get "https://ambientcg.com/get?file=LeafSet${s}_2K-PNG.zip" "LeafSet${s}_2K-PNG.zip"
  mkdir -p "LeafSet${s}"; unzip -oq "LeafSet${s}_2K-PNG.zip" -d "LeafSet${s}"
done
# ambientCG bark (CC0): Bark001 (grey, deep interlacing furrows: sophora, ash, elm), Bark012 (brown oak)
for s in 001 012; do
  get "https://ambientcg.com/get?file=Bark${s}_2K-JPG.zip" "Bark${s}_2K-JPG.zip"
  mkdir -p "Bark${s}"; unzip -oq "Bark${s}_2K-JPG.zip" -d "Bark${s}"
done
# Poly Haven bark (CC0): bark_willow_02 (dark grey-brown scaly ridges: the honeylocust); TR37 species bark (2K colour, GL
# normal, displacement, AO): japanese_sycamore (Platanus: the London plane's mottled, peeling plates), japanese_zelkova_bark
# (zelkova and elm), sakura_bark (cherry), jolcham_oak_bark_01 (oak), trident_maple_bark (maple)
for a in bark_willow_02 japanese_sycamore japanese_zelkova_bark sakura_bark jolcham_oak_bark_01 trident_maple_bark; do
  mkdir -p "$a"
  for m in diff nor_gl rough ao disp; do
    get "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/${a}/${a}_${m}_2k.jpg" "${a}/${a}_${m}_2k.jpg" || echo "missing ${a} ${m}"
  done
done
ls -R "$DST" | head -80
