#!/bin/bash
# OFFLINE TARGETS (AR34 LOOK, 2026-10-02): render the exported key frames in Blender Cycles and log the numbers.
#   bash render_keys.sh <usd dir> <out dir> [samples] [WxH] [gpu index] [extra blender_render.py args...]
# One import per key frame (the root sublayers that frame's moving sets and the shot's camera); a JSON line per render in
# <out dir>/render_stats.jsonl. GPU renders only outside the teasers' recording window (the caller's job).
source /data0/projectnyc_aux/env.sh
set -u
USD=$1; OUT=$2; SPP=${3:-256}; RES=${4:-2560x1440}; GPU=${5:-2}; shift 5 || true
EXTRA="$*"
BL=/data0/projectnyc_aux/.tools/blender/blender
HERE=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$OUT"
for root in "$USD"/t7Arch*_f*.usda; do
  b=$(basename "$root" .usda); f=$((10#${b##*_f}))
  echo "[$(date +%H:%M:%S)] $b frame $f"
  CUDA_VISIBLE_DEVICES=$GPU timeout -k 30 1500 "$BL" -b --factory-startup --python "$HERE/blender_render.py" -- \
    --usd "$root" --frame "$f" --out "$OUT/${b}_cycles.png" --res "$RES" --samples "$SPP" $EXTRA > "$OUT/${b}.log" 2>&1
  grep RENDER_STATS "$OUT/${b}.log" | sed 's/^RENDER_STATS //' | tee -a "$OUT/render_stats.jsonl"
done
echo "[$(date +%H:%M:%S)] done"
