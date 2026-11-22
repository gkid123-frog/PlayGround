#!/usr/bin/env bash
set -euo pipefail

run_timed() {
  /usr/bin/time -p "$@"
}

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

PORT="${PORT:-3000}"
DIST_DIR="$PROJECT_DIR/dist"
METADATA_DIR="/home/runner/work/_temp/omgithub-web"
METADATA_FILE="$METADATA_DIR/deployment-output.json"

mkdir -p "$DIST_DIR" "$METADATA_DIR"

run_timed npm install --no-audit --no-fund

# The application is a self-contained static document. Rebuild dist when the
# source or the existing output is stale.
if [[ ! -f "$DIST_DIR/index.html" ]] || [[ "$PROJECT_DIR/index.html" -nt "$DIST_DIR/index.html" ]]; then
  rm -rf "$DIST_DIR"
  mkdir -p "$DIST_DIR"
  cp "$PROJECT_DIR/index.html" "$DIST_DIR/index.html"
  find "$PROJECT_DIR" -maxdepth 1 -type f \( -name '*.css' -o -name '*.js' \) -exec cp {} "$DIST_DIR" \;
fi

printf '{"project":"%s","directory":"%s"}\n' "$PROJECT_DIR" "$DIST_DIR" > "$METADATA_FILE"

exec /usr/bin/time -p python3 -m http.server "$PORT" --bind 0.0.0.0 --directory "$DIST_DIR"
