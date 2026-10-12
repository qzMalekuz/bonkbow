#!/bin/bash
# Review pass: contact-sheet frames for every shot (build/sheet/sNN/), two at a time.
HERE="$(cd "$(dirname "$0")" && pwd)"; Q="${1:-draft}"; mkdir -p "$HERE/../build/logs"
run() { for n in "$@"; do blender -b -P "$HERE/render.py" -- --shot "$n" --sheet --q "$Q" > "$HERE/../build/logs/sheet$n.log" 2>&1; grep -E "Traceback|line [0-9]+, in" "$HERE/../build/logs/sheet$n.log" | tail -3; done; }
run 1 2 3 4 6 7 8 9 10 11 & run 13 14 15 16 17 18 19 20 22 23 24 & wait
