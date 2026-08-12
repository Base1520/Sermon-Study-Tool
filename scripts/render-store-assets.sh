#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/store/assets"
TMP="${TMPDIR:-/private/tmp}/operator-store-feature-base.png"
ARIAL="/System/Library/Fonts/Supplemental/Arial.ttf"
ARIAL_BOLD="/System/Library/Fonts/Supplemental/Arial Bold.ttf"
ARIAL_BLACK="/System/Library/Fonts/Supplemental/Arial Black.ttf"

command -v magick >/dev/null || { echo "ImageMagick is required." >&2; exit 1; }
for font in "$ARIAL" "$ARIAL_BOLD" "$ARIAL_BLACK"; do
  [[ -f "$font" ]] || { echo "Required font missing: $font" >&2; exit 1; }
done

mkdir -p "$OUT"

magick "$ROOT/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png" \
  -resize 512x512 \
  -alpha on -channel A -evaluate set 100% +channel -depth 8 \
  "PNG32:$OUT/google-play-icon.png"

cd "$ROOT"
magick -font "$ARIAL" -background none \
  store/assets/google-play-feature.svg \
  "$TMP"

magick "$TMP" \
  -fill '#0b0e0a' -draw 'rectangle 450,8 1024,500' \
  -fill '#e5be49' -font "$ARIAL_BOLD" -pointsize 20 -kerning 5 -draw "text 478,102 'BASE 1520'" \
  -fill '#f5f2e8' -font "$ARIAL_BLACK" -pointsize 72 -kerning -2 -draw "text 474,190 'THE'" -draw "text 474,268 'OPERATOR'" \
  -fill '#e5be49' -draw 'rectangle 478,291 954,293' \
  -fill '#c6c9bb' -font "$ARIAL_BOLD" -pointsize 21 -kerning 1.8 -draw "text 478,333 'TEXT-FIRST SCRIPTURE STUDY'" \
  -fill '#959c8b' -font "$ARIAL" -pointsize 17 -kerning .7 -draw "text 478,370 'CONTEXT  >  MEANING  >  FAITHFUL USE'" \
  -fill '#e5be49' -draw 'roundrectangle 478,397 683,441 4,4' \
  -fill '#28351f' -stroke '#8d7937' -strokewidth 1 -draw 'roundrectangle 696,397 954,441 4,4' \
  -stroke none -fill '#11140f' -font "$ARIAL_BOLD" -pointsize 12 -kerning 1.1 -draw "text 497,424 'PHONE · QUICK STUDY'" \
  -fill '#e8e5d9' -pointsize 11 -kerning 1 -draw "text 714,424 'TABLET · PLAIN + SERMON'" \
  -background '#0b0e0a' -alpha remove -alpha off -depth 8 \
  "PNG24:$OUT/google-play-feature.png"

rm -f "$TMP"
echo "Rendered $OUT/google-play-icon.png"
echo "Rendered $OUT/google-play-feature.png"
