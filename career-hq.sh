#!/usr/bin/env bash
# Career HQ launcher for macOS/Linux (mirrors career-hq.bat): starts the
# server if it isn't already listening on the configured port, waits
# briefly, then opens the board in the default browser. Safe to run from
# any working directory, or to double-click if your file manager runs
# executable .sh files directly.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN=python3
elif command -v python >/dev/null 2>&1; then
  PYTHON_BIN=python
else
  echo "Python was not found on PATH. Install Python 3.11+ from" >&2
  echo "https://www.python.org/downloads/ and run this again." >&2
  exit 1
fi

PORT="$("$PYTHON_BIN" scripts/read_port.py 2>/dev/null || true)"
if ! [[ "$PORT" =~ ^[0-9]+$ ]]; then
  PORT=8765
fi

port_open() {
  (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null
}

if ! port_open "$PORT"; then
  echo "Career HQ isn't running yet — starting it on port $PORT..."
  (nohup "$PYTHON_BIN" -m uvicorn app.app:app --host 127.0.0.1 --port "$PORT" >/dev/null 2>&1 &)
  sleep 2
fi

URL="http://127.0.0.1:${PORT}"
if command -v open >/dev/null 2>&1; then
  open "$URL"
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL"
else
  echo "Open $URL in your browser to use Career HQ."
fi
