#!/usr/bin/env bash
# Capture the deployed preview at desktop and mobile sizes.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

: "${CAPTURE_URL:?Set CAPTURE_URL to the preview URL}"
: "${CAPTURE_DIR:?Set CAPTURE_DIR to an output directory outside the source tree}"

timed() {
  local label="$1"; shift
  echo "[capture] $label"
  /usr/bin/time -p "$@"
}

timed "create capture directory" mkdir -p "$CAPTURE_DIR"
CAPTURE_DIR="$(cd "$CAPTURE_DIR" && pwd)"

case "$CAPTURE_DIR" in
  "$PROJECT_DIR"|"$PROJECT_DIR"/*)
    echo "[capture] CAPTURE_DIR must be outside $PROJECT_DIR" >&2
    exit 1
    ;;
esac

timed "capture desktop and mobile" node "$PROJECT_DIR/scripts/capture.mjs" "$CAPTURE_URL" "$CAPTURE_DIR"
timed "verify screenshots" bash -c '
  for f in "$1/final-desktop.png" "$1/final-mobile.png"; do
    test -s "$f" || { echo "Missing $f" >&2; exit 1; }
    magic="$(od -An -tx1 -N8 "$f" | tr -d " \n")"
    [ "$magic" = "89504e470d0a1a0a" ] || { echo "Not a PNG: $f" >&2; exit 1; }
  done
' _ "$CAPTURE_DIR"

echo "[capture] screenshots ready in $CAPTURE_DIR"
