#!/bin/bash
HERE="$(cd "$(dirname "$0")" && pwd)"; LOG="$HERE/../build/logs"; mkdir -p "$LOG"
run() { for n in "$@"; do blender -b -P "$HERE/render.py" -- --shot "$n" --q final --skip 1 > "$LOG/s$n.log" 2>&1; echo "shot $n done"; done; }
run 51 53 55 57 59 61 & run 52 54 56 58 60 & wait
echo ALL DONE
