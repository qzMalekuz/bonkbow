#!/bin/bash
# Paint the faces and render the eight derp shots (resumable; two Blender processes).
HERE="$(cd "$(dirname "$0")" && pwd)"; LOG="$HERE/../build/logs"; mkdir -p "$LOG"
python3 -W ignore "$HERE/../tools/derp_faces.py" all
run() { for n in "$@"; do blender -b -P "$HERE/render.py" -- --shot "$n" --q final --skip 1 > "$LOG/s$n.log" 2>&1; echo "shot $n done"; done; }
run 41 43 45 47 & run 42 44 46 48 & wait
echo ALL DONE
