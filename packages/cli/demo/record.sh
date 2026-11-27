#!/usr/bin/env bash
# Re-records the quickstart demo against a fake AWS endpoint and rebuilds the player page.
# Requires: node, python3, asciinema (pip install asciinema). Run from anywhere.
set -euo pipefail

DEMO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI_DIR="$(dirname "$DEMO_DIR")"
export FAKE_AWS_PORT="${FAKE_AWS_PORT:-4599}"
COLS="${DEMO_COLS:-100}"
ROWS="${DEMO_ROWS:-28}"

command -v asciinema >/dev/null || { echo "asciinema not found: pip install asciinema" >&2; exit 1; }

echo "Building the CLI…"
(cd "$CLI_DIR" && pnpm run build >/dev/null)

node "$DEMO_DIR/fake-aws.mjs" >/dev/null &
FAKE_AWS_PID=$!
trap 'kill "$FAKE_AWS_PID" 2>/dev/null || true' EXIT
sleep 1

echo "Recording…"
DEMO_COLS="$COLS" DEMO_ROWS="$ROWS" asciinema rec --overwrite --quiet \
  --cols "$COLS" --rows "$ROWS" --title "infrascan quickstart" \
  --command "python3 '$DEMO_DIR/scenario.py'" \
  "$DEMO_DIR/quickstart.cast" </dev/null

python3 "$DEMO_DIR/build-page.py"
