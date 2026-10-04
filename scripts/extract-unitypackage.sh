#!/usr/bin/env bash
# Extracts the raw files (PNG, WAV, OGG, MP3, TTF, FBX models...) from a Unity .unitypackage
# without needing the Unity Editor, into assets/licensed/<package-name>/.
#
# A .unitypackage is a gzipped tar. Each entry is a folder holding `asset`
# (the file's bytes) and `pathname` (its original path inside the Unity project).
#
# Usage: scripts/extract-unitypackage.sh path/to/Some.unitypackage [out-dir]
#
# assets/licensed/ is gitignored: Unity Asset Store EULA allows shipping these
# inside the app but NOT redistributing them in a public repo.
set -euo pipefail

pkg="${1:?usage: $0 file.unitypackage [out-dir]}"
name="$(basename "$pkg" .unitypackage)"
out="${2:-assets/licensed/$name}"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

tar -xzf "$pkg" -C "$tmp"
mkdir -p "$out"
count=0
for d in "$tmp"/*/; do
  [ -f "$d/asset" ] && [ -f "$d/pathname" ] || continue
  rel="$(head -n1 "$d/pathname" | tr -d '\r')"
  case "$rel" in
    *.png|*.PNG|*.jpg|*.jpeg|*.wav|*.WAV|*.ogg|*.mp3|*.ttf|*.otf|*.json|*.fbx|*.FBX|*.obj|*.glb) ;;
    *) continue ;; # skip .cs scripts, .prefab, .mat, .anim and other Unity-only data
  esac
  rel="${rel#Assets/}"
  mkdir -p "$out/$(dirname "$rel")"
  cp "$d/asset" "$out/$rel"
  count=$((count + 1))
done
echo "Extracted $count files to $out"
