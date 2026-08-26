"""Minimal .env loader.

No python-dotenv dependency: this is the whole thing. It exists because the
repo's own troubleshooting notes call out a real trap — a scheduled task
never inherits a shell `export`, so GEMINI_API_KEY silently vanishes for
unattended runs unless it's set as a persistent OS environment variable. A
gitignored `.env` file at the repo root is the friend-proof alternative.
"""

import os
import re

_LINE_RE = re.compile(r"^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$")


def parse_env_text(text):
    """KEY=value lines -> dict. Blank lines and full-line '#' comments are
    skipped, surrounding quotes are stripped, malformed lines are ignored
    rather than raising."""
    values = {}
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        m = _LINE_RE.match(line)
        if not m:
            continue
        value = m.group(2).strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        values[m.group(1)] = value
    return values


def load_dotenv(path, environ=None):
    """Fill `environ` (default os.environ) from the .env file at `path`,
    without ever overwriting a variable that's already set there — a real
    environment variable always wins. No-op if the file doesn't exist."""
    if environ is None:
        environ = os.environ
    if not path.exists():
        return
    for key, value in parse_env_text(path.read_text(encoding="utf-8")).items():
        environ.setdefault(key, value)
