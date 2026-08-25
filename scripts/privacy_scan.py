"""Scan git-tracked files for personal/private references before pushing to a public repo.
Run: python scripts/privacy_scan.py   (--strict also fails on medium/low severity)

Patterns come from privacy_patterns.json (generic defaults, committed) plus
privacy_patterns.local.json (your own name/company/etc, gitignored — copy
privacy_patterns.local.json.example to get started)."""

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SEVERITY_ORDER = {"high": 0, "medium": 1, "low": 2}


def load_patterns():
    patterns = []
    for name in ("privacy_patterns.json", "privacy_patterns.local.json"):
        path = ROOT / "scripts" / name
        if not path.exists():
            continue
        for entry in json.loads(path.read_text(encoding="utf-8"))["patterns"]:
            patterns.append({**entry, "compiled": re.compile(entry["pattern"]), "source": name})
    return patterns


def tracked_files():
    out = subprocess.run(["git", "ls-files"], cwd=ROOT, capture_output=True, text=True, check=True)
    return [ROOT / line for line in out.stdout.splitlines() if line.strip()]


def scan(patterns):
    findings = []
    for path in tracked_files():
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        for lineno, line in enumerate(text.splitlines(), start=1):
            for pat in patterns:
                if pat["compiled"].search(line):
                    findings.append({
                        "file": path.relative_to(ROOT).as_posix(),
                        "line": lineno,
                        "label": pat["label"],
                        "severity": pat["severity"],
                        "text": line.strip()[:160],
                    })
    return findings


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--strict", action="store_true", help="exit non-zero on medium/low findings too")
    parser.add_argument("--list-patterns", action="store_true", help="print loaded patterns and exit")
    args = parser.parse_args()

    patterns = load_patterns()
    if args.list_patterns:
        for pat in patterns:
            print(f"[{pat['severity']:6}] {pat['label']} ({pat['source']}): {pat['pattern']}")
        return 0

    findings = sorted(scan(patterns), key=lambda f: (SEVERITY_ORDER[f["severity"]], f["file"], f["line"]))
    if not findings:
        print(f"clean — {len(patterns)} patterns, no matches in tracked files")
        return 0

    for f in findings:
        print(f"[{f['severity']:6}] {f['file']}:{f['line']} ({f['label']}): {f['text']}")

    high = [f for f in findings if f["severity"] == "high"]
    print(f"\n{len(findings)} finding(s), {len(high)} high severity")
    if high or (args.strict and findings):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
