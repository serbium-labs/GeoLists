#!/usr/bin/env bash
set -euo pipefail

# Official Protomaps daily build. Override BUILD_DATE to reproduce an older cutout.
BUILD_DATE="${BUILD_DATE:-$(date -u +%Y%m%d)}"
BOUNDS="${SPB_BOUNDS:-29.40,59.63,31.05,60.25}"
OUT_DIR="${GEOLISTS_MAPS_DIR:-data/maps}"
OUT="$OUT_DIR/spb-$BUILD_DATE.pmtiles"
ASSET_DIR="public/map-assets/fonts/Noto Sans Regular"

command -v pmtiles >/dev/null || { echo 'Install pmtiles CLI: https://docs.protomaps.com/pmtiles/cli'; exit 1; }
mkdir -p "$OUT_DIR"
pmtiles extract "https://build.protomaps.com/$BUILD_DATE.pmtiles" "$OUT" --bbox="$BOUNDS" --maxzoom=15
pmtiles verify "$OUT"
SHA256="$(shasum -a 256 "$OUT" | awk '{print $1}')"
SIZE="$(wc -c < "$OUT" | tr -d ' ')"
printf '{\n  "version": "%s",\n  "file": "%s",\n  "sha256": "%s",\n  "size": %s\n}\n' "$BUILD_DATE" "$(basename "$OUT")" "$SHA256" "$SIZE" > "$OUT_DIR/active.json.tmp"
mv "$OUT_DIR/active.json.tmp" "$OUT_DIR/active.json"
mkdir -p "$ASSET_DIR"
for RANGE in 0-255 1024-1279 8192-8447; do
  curl --fail --location --retry 3 "https://raw.githubusercontent.com/protomaps/basemaps-assets/main/fonts/Noto%20Sans%20Regular/$RANGE.pbf" --output "$ASSET_DIR/$RANGE.pbf"
done
curl --fail --location --retry 3 "https://raw.githubusercontent.com/protomaps/basemaps-assets/main/fonts/OFL.txt" --output "public/map-assets/fonts/OFL.txt"
echo "Installed $OUT ($SIZE bytes, sha256 $SHA256)"
echo "For remote updates, publish the archive and a manifest with version, HTTPS url, sha256 and size."
