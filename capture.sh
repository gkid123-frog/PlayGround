#!/usr/bin/env bash
set -uo pipefail

run_timed() {
  /usr/bin/time -p "$@"
}

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

: "${CAPTURE_URL:?Set CAPTURE_URL}"
: "${CAPTURE_DIR:?Set CAPTURE_DIR}"

mkdir -p "$CAPTURE_DIR"
export CAPTURE_URL CAPTURE_DIR
export RUNTIME_DIR="${RUNTIME_DIR:-/home/runner/work/_temp/omgithub-runtime}"

set +e
run_timed node "$RUNTIME_DIR/scripts/default-capture.mjs"
status=$?
set -e

case "$status" in
  0)
    if [[ -s "$CAPTURE_DIR/final-desktop.png" && -s "$CAPTURE_DIR/final-mobile.png" ]]; then
      exit 0
    fi
    echo "Rendering defect: one or more final capture files were not produced." >&2
    exit 1
    ;;
  75)
    echo "Temporary browser/navigation infrastructure failure (exit 75)." >&2
    exit 75
    ;;
  *)
    echo "Capture script or rendering defect (exit $status)." >&2
    exit 1
    ;;
esac
