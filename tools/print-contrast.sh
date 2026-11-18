#!/usr/bin/env bash
# Make a print-ready, high-contrast black-and-white copy of a faded PDF, scan, or photo.
# The original is never touched; the copy is "<name> (print, black).pdf" next to it (or --out).
#
#   tools/print-contrast.sh <input.pdf|.jpg|.png|.heic|.tif> [--out <file.pdf>] [--level 75%] [--gamma 0.5] [--no-thicken]
#
# Recipe (the one that fixed the faded CT report, t47u):
#   1. Render every page at 300 dpi (Ghostscript for PDFs; ImageMagick for images, HEIC via libheif).
#   2. Grayscale, then levels 0%,75% with gamma 0.5: faint gray / faded blue text becomes solid black.
#   3. Near-white speck cleanup: anything lighter than 90% becomes pure white.
#   4. Thicken strokes by 1 px (morphology Erode Diamond:1) so thin scanned text prints solid.
#   5. Fit each page onto US Letter at 300 dpi (2550x3300 px = 612x792 pt) and rebuild one PDF.
# Needs gs (Ghostscript) and magick (ImageMagick 7): brew install ghostscript imagemagick
set -euo pipefail
in="${1:-}"
if [ -z "$in" ] || [ ! -f "$in" ]; then sed -n '2,5p' "$0"; exit 2; fi
shift
out=""; level="75%"; gamma="0.5"; thicken=1
while [ $# -gt 0 ]; do case "$1" in
  --out) out="$2"; shift 2;; --level) level="$2"; shift 2;; --gamma) gamma="$2"; shift 2;;
  --no-thicken) thicken=0; shift;; *) echo "unknown option: $1" >&2; exit 2;; esac; done
base="$(basename "$in")"; stem="${base%.*}"; ext="$(printf '%s' "${base##*.}" | tr 'A-Z' 'a-z')"
[ -n "$out" ] || out="$(dirname "$in")/$stem (print, black).pdf"
abs() { (cd "$(dirname "$1")" && printf '%s/%s' "$(pwd)" "$(basename "$1")"); }
if [ "$(abs "$in")" = "$(abs "$out")" ]; then echo "refusing to overwrite the original" >&2; exit 1; fi
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
if [ "$ext" = pdf ]; then
  gs -q -dSAFER -dBATCH -dNOPAUSE -sDEVICE=png16m -r300 -sOutputFile="$work/src-%03d.png" "$in"
else
  magick "$in" -auto-orient -background white -alpha remove -alpha off "$work/src-%03d.png"
fi
for f in "$work"/src-*.png; do
  n="$(basename "$f" .png)"; n="${n#src-}"
  wh="$(magick identify -format '%w %h' "$f")"; w="${wh% *}"; h="${wh#* }"
  if [ "$w" -gt "$h" ]; then pw=3300; ph=2550; else pw=2550; ph=3300; fi
  if [ "$thicken" = 1 ]; then
    magick "$f" -colorspace Gray -level "0%,$level,$gamma" -white-threshold 90% -morphology Erode Diamond:1 \
      -resize "${pw}x${ph}>" -background white -gravity center -extent "${pw}x${ph}" -type Grayscale -depth 8 "$work/p-$n.png"
  else
    magick "$f" -colorspace Gray -level "0%,$level,$gamma" -white-threshold 90% \
      -resize "${pw}x${ph}>" -background white -gravity center -extent "${pw}x${ph}" -type Grayscale -depth 8 "$work/p-$n.png"
  fi
done
magick "$work"/p-*.png -units PixelsPerInch -density 300 -compress Zip "$out"
preview="${out%.pdf}.preview.png"
gs -q -dSAFER -dBATCH -dNOPAUSE -sDEVICE=pnggray -r150 -dFirstPage=1 -dLastPage=1 -sOutputFile="$preview" "$out"
echo "wrote: $out"
echo "preview (page 1, 150 dpi): $preview"
gs -q -dNODISPLAY -dNOSAFER -dPDFINFO "$out" 2>&1 | grep -E 'File has|MediaBox' || true
