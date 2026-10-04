#!/bin/bash
# Builds the Stickchers launch trailer end to end from archer-boys.pdf and the game's assets.
# Needs: poppler (pdftoppm), ffmpeg, python3 with pillow + numpy + scipy. Takes about four minutes.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$HERE/../../.."; BUILD="$HERE/../build"
mkdir -p "$BUILD/pages" "$HERE/../refs" "$HERE/../out"
pdftoppm -r 220 -png "$ROOT/archer-boys.pdf" "$BUILD/pages/p"                          # character sheets
python3 -W ignore "$HERE/cut.py" "$BUILD/pages" "$HERE/../refs" "$BUILD/contact.png"   # pose sprites
python3 -W ignore "$HERE/render.py"                                                    # picture
python3 -W ignore "$HERE/music.py"                                                     # score
python3 -W ignore "$HERE/mix.py"                                                       # final mix
