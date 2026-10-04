#!/bin/bash
# Rebuild the hero characters from archer-boys.pdf:
#   1. render the PDF pages (300 dpi, cached)
#   2. sprites.py: cut each hero's head drawings (front per expression,
#      right, back, left) into one registered atlas
#   3. bake.ts: sculpt and skin each chibi suit
#   4. manifest.ts: regenerate src/game3d/heroAssets.ts
# Usage: scripts/heroes/build.sh [hero ...]   (default: all six)
set -e
cd "$(dirname "$0")/../.."
CACHE=scripts/heroes/.cache
mkdir -p "$CACHE/pages"
[ -f "$CACHE/pages/p-1.png" ] || pdftoppm -r 300 -png archer-boys.pdf "$CACHE/pages/p"
python3 scripts/heroes/sprites.py "$CACHE/pages" "$@"
bun scripts/heroes/bake.ts "$@"
bun scripts/heroes/manifest.ts
