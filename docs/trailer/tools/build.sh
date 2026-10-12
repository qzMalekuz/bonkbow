#!/bin/bash
# Builds the 60-second Stickchers launch trailer end to end (and the 30 s and 15 s cuts):
# 3D render of every shot in Blender, the soundtrack, then cards + encode. See TRAILER.md.
# Needs: Blender 5.x, ffmpeg, python3 with pillow + numpy + scipy. About two hours on an M4;
# the render is resumable, so re-running picks up where it stopped.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
"$HERE/../rig/render_all.sh" final                  # picture: build/shots/sNN/f_####.png
python3 -W ignore "$HERE/audio60.py"                # score + sound effects: build/audio60.wav
python3 -W ignore "$HERE/assemble.py"               # out/stickchers-launch-60.mp4
python3 -W ignore "$HERE/assemble.py" --cut 30      # out/stickchers-launch-30.mp4
python3 -W ignore "$HERE/assemble.py" --cut 15      # out/stickchers-launch-15.mp4
