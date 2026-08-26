#!/usr/bin/env python3
"""One-time bootstrap for a fresh clone of Career HQ.

Run: python3 scripts/setup.py

Checks your Python/Node versions, installs Python dependencies, creates
watcher/config.json and .env from their checked-in templates if you don't
already have them, and builds the web app. Safe to re-run any time — every
step only does the work that's still needed, and nothing it creates ever
overwrites a file you already have.

Cross-platform, standard-library only (no new dependency just to bootstrap).
"""

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MIN_PYTHON = (3, 11)
MIN_NODE_MAJOR = 20


class SetupError(Exception):
    """A step failed in a known, explainable way."""


def step(msg):
    print(f"\n==> {msg}")


def fail(msg):
    """Raise a SetupError carrying a plain-language, actionable message."""
    raise SetupError(msg)


def check_python(version_info=None):
    step("Checking Python version")
    version_info = version_info or sys.version_info
    if (version_info.major, version_info.minor) < MIN_PYTHON:
        fail(
            f"Python {MIN_PYTHON[0]}.{MIN_PYTHON[1]}+ is required, found "
            f"{version_info.major}.{version_info.minor}. Install a newer Python "
            "from https://www.python.org/downloads/ and run this again."
        )
    print(f"  Python {version_info.major}.{version_info.minor} OK")


def parse_node_major(version_output):
    """'v20.11.1\\n' -> 20. Raises SetupError on anything unparseable."""
    text = version_output.strip().lstrip("v")
    try:
        return int(text.split(".")[0])
    except (ValueError, IndexError):
        fail(
            f"Could not read a Node.js version from {version_output.strip()!r}. "
            "Reinstall Node from https://nodejs.org/ and run this again."
        )


def check_node(run=subprocess.run):
    step("Checking Node.js version")
    node = shutil.which("node")
    if not node:
        fail(
            "Node.js was not found on PATH. Install Node 20+ (only needed once, "
            "to build the web app) from https://nodejs.org/ and run this again."
        )
    try:
        result = run([node, "--version"], capture_output=True, text=True, check=True)
    except (OSError, subprocess.CalledProcessError) as exc:
        fail(f"Could not run 'node --version' ({exc}). Reinstall Node.js from https://nodejs.org/.")
        return
    major = parse_node_major(result.stdout)
    if major < MIN_NODE_MAJOR:
        fail(
            f"Node.js {MIN_NODE_MAJOR}+ is required, found {result.stdout.strip()}. "
            "Install a newer version from https://nodejs.org/ and run this again."
        )
    print(f"  Node.js {result.stdout.strip()} OK")


def install_python_deps(root=ROOT, run=subprocess.run):
    step("Installing Python dependencies (pip install -r requirements.txt)")
    try:
        run([sys.executable, "-m", "pip", "install", "-r", str(root / "requirements.txt")], check=True)
    except subprocess.CalledProcessError as exc:
        fail(f"pip install failed (exit code {exc.returncode}) — see the output above for why.")


def ensure_file_from_example(target, example, label):
    """Copy `example` to `target` only if `target` doesn't exist yet. Never
    overwrites. Returns True if it created the file."""
    if target.exists():
        print(f"  {label} already exists — leaving it alone")
        return False
    if not example.exists():
        fail(f"{example} is missing from the repo — can't create {label} from it.")
    target.write_text(example.read_text(encoding="utf-8"), encoding="utf-8")
    print(f"  created {label} from {example.name}")
    return True


def bootstrap_config(root=ROOT):
    step("Setting up watcher/config.json")
    ensure_file_from_example(root / "watcher" / "config.json",
                             root / "watcher" / "config.example.json",
                             "watcher/config.json")


def bootstrap_env(root=ROOT):
    step("Setting up .env")
    ensure_file_from_example(root / ".env", root / ".env.example", ".env")


def build_web(root=ROOT, run=subprocess.run):
    step("Installing and building the web app (this can take a minute)")
    web_dir = root / "web"
    npm = shutil.which("npm")
    if not npm:
        fail("npm was not found on PATH. It ships with Node.js — reinstall from https://nodejs.org/.")
    for args, desc in ((["install"], "npm install"), (["run", "build"], "npm run build")):
        try:
            run([npm, *args], cwd=str(web_dir), check=True)
        except subprocess.CalledProcessError as exc:
            fail(f"{desc} failed (exit code {exc.returncode}) — see the output above for why.")


def print_next_steps():
    print("\nSetup complete. Next steps:")
    print("  1. Launch Career HQ:")
    print("       macOS/Linux: ./career-hq.sh")
    print("       Windows:     double-click career-hq.bat")
    print("     (or run it directly: python -m uvicorn app.app:app --host 127.0.0.1 --port 8765)")
    print("  2. In the browser tab that opens, go to Settings and add the")
    print("     companies you want to watch.")
    print("  3. Go to Profile, paste or upload your resume, and set your comp")
    print("     floor/goal, currency, and other requirements.")
    print("  4. (Optional) put your Gemini API key in .env to turn on AI fit")
    print("     scoring — see SETUP.md.")
    print("\nSee SETUP.md for the full walkthrough.")


def main():
    print("Career HQ setup")
    print("================")
    check_python()
    check_node()
    install_python_deps()
    bootstrap_config()
    bootstrap_env()
    build_web()
    print_next_steps()


if __name__ == "__main__":
    try:
        main()
    except SetupError as exc:
        print(f"\nSetup stopped: {exc}", file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        print("\nSetup cancelled.")
        sys.exit(130)
    except Exception as exc:  # last resort: never show a bare traceback
        print(f"\nSetup stopped with an unexpected error: {exc}", file=sys.stderr)
        sys.exit(1)
