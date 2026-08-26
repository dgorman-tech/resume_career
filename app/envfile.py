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

# The literal value .env.example ships for GEMINI_API_KEY. scripts/setup.py
# copies that file to .env verbatim on a fresh clone, so right after bootstrap
# the variable is genuinely *set* — just to a value that will never work.
# Treating it as "configured" would tell a friend the key is detected (gear
# icon, /api/health) and let a scoring call fail opaquely against Gemini
# instead of the plain "add your key" message they'd get from no key at all.
PLACEHOLDER_GEMINI_KEY = "your-gemini-api-key-here"


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


def gemini_key_configured(environ=None):
    """True only if GEMINI_API_KEY is set to something other than the
    unfilled-in placeholder from .env.example (see PLACEHOLDER_GEMINI_KEY)."""
    if environ is None:
        environ = os.environ
    value = environ.get("GEMINI_API_KEY", "")
    return bool(value) and value != PLACEHOLDER_GEMINI_KEY
