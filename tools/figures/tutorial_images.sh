#!/usr/bin/env bash
# Regenerate the images and console transcripts of the tutorials (docs/tutorials/) by running every script in
# PythonAPI/examples/tutorials/ against a simulation server, then copying the outputs to docs/assets/tutorials/
# (JPEG for camera images, PNG for masks, .txt for what each script printed).
#
#   bash tools/figures/tutorial_images.sh [--server <path to BoundlessNYC.exe>] [--host 127.0.0.1] [--port 2000]
#                                         [--python python] [--work .cache/tutorials] [--only first_steps,depth]
#
# Without --server a server must already be listening (a release build, or `npm run dev` in server/). With --server the
# script starts that executable headless at 1280x720, the default resolution, and stops it when it is done.
# Needs Python with numpy, and Node.js with the repository's npm dependencies (ffmpeg-static converts the JPEGs).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SERVER="" HOST="127.0.0.1" PORT="2000" PY="${PYTHON:-python}" WORK="$ROOT/.cache/tutorials" ONLY=""
while [ $# -gt 0 ]; do
  case "$1" in
    --server) SERVER="$2"; shift 2 ;;
    --host) HOST="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --python) PY="$2"; shift 2 ;;
    --work) WORK="$2"; shift 2 ;;
    --only) ONLY="$2"; shift 2 ;;
    *) echo "unknown option $1" >&2; exit 2 ;;
  esac
done
SCRIPTS=(first_steps cameras segmentation depth bounding_boxes record_dataset actors)
[ -n "$ONLY" ] && IFS=',' read -r -a SCRIPTS <<< "$ONLY"
DOCS="$ROOT/docs/assets/tutorials"
FFMPEG="$(cd "$ROOT" && node -p "require('ffmpeg-static')")"
mkdir -p "$WORK" "$DOCS"

if [ -n "$SERVER" ]; then
  LOG="$WORK/server.log"
  rm -f "$LOG"
  env -u ELECTRON_RUN_AS_NODE "$SERVER" --headless --res 1280x720 --host "$HOST" --port "$PORT" --log "$LOG" &
  PID=$!
  stop_server() {
    if [ -r "/proc/$PID/winpid" ]; then taskkill //PID "$(cat "/proc/$PID/winpid")" //T //F > /dev/null 2>&1 || true; fi
    kill "$PID" 2> /dev/null || true
    wait "$PID" 2> /dev/null || true
  }
  trap stop_server EXIT
  for _ in $(seq 180); do
    grep -q "listening on" "$LOG" 2> /dev/null && break
    kill -0 "$PID" 2> /dev/null || { echo "the server exited:" >&2; cat "$LOG" >&2; exit 1; }
    sleep 1
  done
  grep -q "listening on" "$LOG" || { echo "the server did not start listening" >&2; exit 1; }
fi

# the scripts run from the work directory with their default --out (_out/<name>), as a reader would run them
for name in "${SCRIPTS[@]}"; do
  echo "== $name"
  rm -rf "$WORK/_out/$name"
  (cd "$WORK" && "$PY" -u "$ROOT/PythonAPI/examples/tutorials/$name.py" --host "$HOST" --port "$PORT") 2>&1 | tee "$WORK/$name.log"
  cp "$WORK/$name.log" "$DOCS/$name.txt"
done

jpg() { "$FFMPEG" -loglevel error -y -i "$1" -vf "scale='min(1280,iw)':-2" -q:v 3 "$DOCS/$2"; }
png() { cp "$1" "$DOCS/$2"; }
nth() { find "$1" -maxdepth 1 -name '*.png' | sort | sed -n "$2p"; }       # the n-th saved frame of a sequence
O="$WORK/_out"
for name in "${SCRIPTS[@]}"; do
  case "$name" in
    first_steps)
      for c in day golden dusk night rain; do jpg "$O/first_steps/$c.png" "first_steps_$c.jpg"; done ;;
    cameras)
      n=$(find "$O/cameras/chase" -maxdepth 1 -name '*.png' | wc -l)
      jpg "$(nth "$O/cameras/chase" 1)" cameras_chase_1.jpg
      jpg "$(nth "$O/cameras/chase" $(( (n + 1) / 2 )))" cameras_chase_2.jpg
      jpg "$(nth "$O/cameras/chase" "$n")" cameras_chase_3.jpg
      jpg "$(nth "$O/cameras/dashcam" $(( (n + 1) / 2 )))" cameras_dashcam.jpg ;;
    segmentation)
      jpg "$O/segmentation/rgb.png" segmentation_rgb.jpg
      png "$O/segmentation/semantic.png" segmentation_semantic.png
      png "$O/segmentation/instance_colors.png" segmentation_instances.png ;;
    depth)
      jpg "$O/depth/rgb.png" depth_rgb.jpg
      jpg "$O/depth/depth_colormap.png" depth_colormap.jpg ;;
    bounding_boxes)
      jpg "$O/bounding_boxes/boxes_2d.png" boxes_2d.jpg
      jpg "$O/bounding_boxes/boxes_3d.png" boxes_3d.jpg
      # one entry of labels.json for the page: the largest partly occluded vehicle (amodal box and heading)
      "$PY" - "$O/bounding_boxes/labels.json" "$DOCS/boxes_label.json" <<'PY'
import json, sys
objects = json.load(open(sys.argv[1]))["objects"]
full = [o for o in objects if o.get("amodal_bbox") and o.get("yaw") is not None]
full = [o for o in full if (o.get("occlusion") or 0) > 0.1] or full or objects
json.dump(max(full, key=lambda o: o["area"]), open(sys.argv[2], "w"), indent=2)
PY
      ;;
    record_dataset)
      jpg "$O/record_dataset/contact_sheet.png" dataset_contact_sheet.jpg
      # the COCO file's structure for the page: its categories, the first image and that image's first annotation
      "$PY" - "$O/record_dataset/annotations_coco.json" "$DOCS/dataset_coco_excerpt.json" <<'PY'
import json, sys
coco = json.load(open(sys.argv[1]))
image = coco["images"][0]
excerpt = {"images": [image, "..."], "annotations": [next(a for a in coco["annotations"] if a["image_id"] == image["id"]), "..."],
           "categories": coco["categories"]}
json.dump(excerpt, open(sys.argv[2], "w"), indent=2)
PY
      ;;
    actors)
      jpg "$O/actors/paths.png" actors_paths.jpg ;;
  esac
done
echo "tutorial images and transcripts in $DOCS"
