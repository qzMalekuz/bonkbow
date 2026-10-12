#!/bin/bash
# Re-render only the shots with characters in them (resumable).
HERE="$(cd "$(dirname "$0")" && pwd)"; LOG="$HERE/../build/logs"; mkdir -p "$LOG"
run() { for n in "$@"; do blender -b -P "$HERE/render.py" -- --shot "$n" --q final --skip 1 > "$LOG/s$n.log" 2>&1; echo "shot $n done"; done; }
run 6 8 10 13 15 17 19 22 2 & run 7 9 11 14 16 18 20 23 & wait
echo ALL DONE
