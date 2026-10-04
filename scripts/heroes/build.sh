#!/bin/bash
# Rebuild the hero characters from archer-boys.pdf:
#   1. render the PDF pages (300 dpi)
#   2. project.py: head volume from the sheet silhouettes
#   3. bake.ts: mesh the heads, sculpt + skin the suits
#   4. project.py --paint: paint each head (one texture per expression)
# Usage: scripts/heroes/build.sh [hero ...]   (default: all six)
set -e
cd "$(dirname "$0")/../.."
CACHE=scripts/heroes/.cache
mkdir -p "$CACHE/pages"
[ -f "$CACHE/pages/p-1.png" ] || pdftoppm -r 300 -png archer-boys.pdf "$CACHE/pages/p"
HEROES=("$@")
[ ${#HEROES[@]} -eq 0 ] && HEROES=(akshay beeman chase mit mert tolly)
for h in "${HEROES[@]}"; do python3 scripts/heroes/project.py "$CACHE/pages" "$CACHE" "$h"; done
HERO_CACHE="$CACHE/" bun scripts/heroes/bake.ts "${HEROES[@]}"
for h in "${HEROES[@]}"; do python3 scripts/heroes/project.py "$CACHE/pages" "$CACHE" "$h" --paint; done
bun scripts/heroes/manifest.ts
