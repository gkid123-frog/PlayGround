#!/usr/bin/env bash
# Build the static game into PROJECT_DIR/dist and serve it in the foreground.
set -euo pipefail

cd "$(dirname "$0")"
PROJECT_DIR="$(pwd)"
PORT="${PORT:-3000}"
DIST_DIR="$PROJECT_DIR/dist"
OPENCODE_WEB_DIR="${OPENCODE_WEB_DIR:-${RUNNER_TEMP:-/home/runner/work/_temp}/omgithub-web}"

timed() {
  local label="$1"; shift
  echo "[start] $label"
  /usr/bin/time -p "$@"
}

timed "check index.html" test -f "$PROJECT_DIR/index.html"

# Install runtime dependencies only when the project declares any.
if [[ -f "$PROJECT_DIR/package.json" ]] && node -e 'const p=require(process.argv[1]);process.exit(Object.keys(p.dependencies||{}).length?0:1)' "$PROJECT_DIR/package.json"; then
  if [[ -f "$PROJECT_DIR/package-lock.json" ]]; then
    timed "install dependencies" npm ci --omit=dev --no-audit --no-fund
  else
    timed "install dependencies" npm install --omit=dev --no-audit --no-fund
  fi
else
  echo "[start] no runtime dependencies to install"
fi

# Build the static output inside PROJECT_DIR.
timed "clean dist" rm -rf "$DIST_DIR"
timed "create dist" mkdir -p "$DIST_DIR"
timed "copy index.html" cp "$PROJECT_DIR/index.html" "$DIST_DIR/index.html"
for asset in public assets; do
  if [[ -d "$PROJECT_DIR/$asset" ]]; then
    timed "copy $asset" cp -R "$PROJECT_DIR/$asset/." "$DIST_DIR/"
  fi
done

# Declare the built static directory to the controller.
timed "create metadata dir" mkdir -p "$OPENCODE_WEB_DIR"
timed "write deployment-output.json" node -e 'const fs=require("fs");fs.writeFileSync(process.argv[1],JSON.stringify({project:process.argv[2],directory:process.argv[3]})+"\n")' "$OPENCODE_WEB_DIR/deployment-output.json" "$PROJECT_DIR" "$DIST_DIR"

echo "[start] serving $DIST_DIR on 0.0.0.0:$PORT"
exec python3 -m http.server "$PORT" --bind 0.0.0.0 --directory "$DIST_DIR"
