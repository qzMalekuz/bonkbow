#!/bin/bash
# Final render of every shot to build/shots/sNN/f_####.png. Resumable (--skip keeps finished
# frames). Two Blender processes share the GPU.   usage: rig/render_all.sh [quality]
HERE="$(cd "$(dirname "$0")" && pwd)"; Q="${1:-final}"; LOG="$HERE/../build/logs"; mkdir -p "$LOG"
run() { for n in "$@"; do blender -b -P "$HERE/render.py" -- --shot "$n" --q "$Q" --skip 1 > "$LOG/s$n.log" 2>&1; echo "shot $n done"; done; }
run 6 8 10 13 15 17 19 22 24 1 3 &
run 7 9 11 14 16 18 20 23 2 4 &
wait
echo ALL DONE
