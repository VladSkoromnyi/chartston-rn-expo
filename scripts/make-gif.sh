#!/usr/bin/env bash
# Convert an iOS Simulator recording into a README demo GIF.
#
#   scripts/make-gif.sh <input.mov> <output.gif> [crop_top_px] [crop_bottom_px]
#
# Crops away the status bar / demo-app chrome (pixel rows at the source's
# resolution), scales to 360 px wide at 15 fps, and uses a two-pass palette
# (palettegen → paletteuse) so candles stay crisp. Prints the final size and
# warns above the 3 MB budget.
#
# Env: FPS (15), WIDTH (360), MAX_BYTES (3145728), START (seconds to skip, 0).
set -euo pipefail

in=${1:?input .mov}
out=${2:?output .gif}
top=${3:-0}
bottom=${4:-0}
fps=${FPS:-15}
width=${WIDTH:-360}
max=${MAX_BYTES:-3145728}
start=${START:-0}

h=$(ffprobe -v error -select_streams v:0 -show_entries stream=height -of csv=p=0 "$in")
crop_h=$((h - top - bottom))
filters="crop=in_w:${crop_h}:0:${top},fps=${fps},scale=${width}:-1:flags=lanczos"
palette=$(mktemp -t palette).png
trap 'rm -f "$palette"' EXIT

ffmpeg -v error -y -ss "$start" -i "$in" -vf "${filters},palettegen=max_colors=128:stats_mode=diff" "$palette"
ffmpeg -v error -y -ss "$start" -i "$in" -i "$palette" \
  -lavfi "${filters}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" \
  -loop 0 "$out"

bytes=$(stat -f%z "$out" 2>/dev/null || stat -c%s "$out")
echo "$out: $((bytes / 1024)) KB"
if [ "$bytes" -gt "$max" ]; then
  echo "warning: over the $((max / 1048576)) MB budget — try FPS=12 or WIDTH=320" >&2
fi
