"""Print the port Career HQ should run on: whatever watcher/config.json (or,
failing that, the checked-in config.example.json) says under app.port,
defaulting to 8765. Used by both career-hq launchers so the port lives in
one place instead of being hardcoded twice.

Run: python scripts/read_port.py
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_PORT = 8765


def read_port():
    for name in ("config.json", "config.example.json"):
        path = ROOT / "watcher" / name
        if not path.exists():
            continue
        try:
            return json.loads(path.read_text(encoding="utf-8")).get("app", {}).get("port", DEFAULT_PORT)
        except (json.JSONDecodeError, OSError):
            return DEFAULT_PORT
    return DEFAULT_PORT


if __name__ == "__main__":
    print(read_port())
