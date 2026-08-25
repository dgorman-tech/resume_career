"""Shared SQLite access for Career HQ. The watcher owns jobs/runs; this module
owns job_state, job_scores, jd_cache, profile."""

import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DB_DEFAULT = REPO_ROOT / "watcher" / "watcher.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS jobs(
  key TEXT PRIMARY KEY, company TEXT, tier INTEGER, source TEXT, job_id TEXT,
  title TEXT, location TEXT, url TEXT,
  salary_min REAL, salary_max REAL, salary_raw TEXT,
  posted_at TEXT, first_seen TEXT, last_seen TEXT, closed_at TEXT,
  matched INTEGER
);
CREATE TABLE IF NOT EXISTS runs(
  ts TEXT, company TEXT, source TEXT, status TEXT,
  jobs_found INTEGER, matched INTEGER, error TEXT
);
CREATE TABLE IF NOT EXISTS job_state (
  key TEXT PRIMARY KEY REFERENCES jobs(key),
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','interested','dismissed','applied')),
  starred INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS job_scores (
  key TEXT PRIMARY KEY REFERENCES jobs(key),
  fit INTEGER,
  subscores TEXT,
  why TEXT, gaps TEXT, angle TEXT,
  lens TEXT CHECK (lens IN ('external','internal')),
  model TEXT, scored_at TEXT,
  deep_dive_md TEXT, deep_dive_model TEXT, deep_dive_at TEXT
);
CREATE TABLE IF NOT EXISTS jd_cache (
  key TEXT PRIMARY KEY REFERENCES jobs(key),
  jd_text TEXT, fetched_at TEXT
);
CREATE TABLE IF NOT EXISTS profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  resume_text TEXT NOT NULL DEFAULT '',
  rules_text TEXT NOT NULL DEFAULT '',
  comp_floor_cad INTEGER,
  comp_goal_cad INTEGER,
  max_office_days INTEGER,
  location_text TEXT NOT NULL DEFAULT '',
  min_level TEXT NOT NULL DEFAULT '',
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS score_dimensions (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  weight INTEGER NOT NULL DEFAULT 10,
  position INTEGER NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0
);
"""

# columns added after the initial release; ensure_schema adds them to existing DBs
# since CREATE TABLE IF NOT EXISTS is a no-op once the table already exists
PROFILE_ADDED_COLUMNS = [
    ("comp_floor_cad", "INTEGER"),
    ("comp_goal_cad", "INTEGER"),
    ("max_office_days", "INTEGER"),
    ("location_text", "TEXT NOT NULL DEFAULT ''"),
    ("min_level", "TEXT NOT NULL DEFAULT ''"),
    ("holistic_weight", "INTEGER NOT NULL DEFAULT 50"),
    ("rubric_updated_at", "TEXT"),
]

DEFAULT_DIMENSIONS = [
    ("comp", "Compensation",
     'posted/likely compensation vs the comp criteria (floor and goal) described in CANDIDATE '
     'RULES below. If no range is posted, infer cautiously from title/company/market and say so in "why".'),
    ("player_coach", "Player-coach",
     "small team leadership WITH hands-on technical work (SQL/Python/BI). Pure people-management "
     "or pure IC scores low."),
    ("cost_center", "Cost-center",
     "is the data/analytics work the PRODUCT (or a direct revenue driver) at this company, or "
     "internal overhead? Product = high."),
    ("flex", "Flexibility",
     "trust-based flexibility (hybrid <=2 days office, or remote). Rigid full-time RTO = near 0."),
    ("level", "Level",
     "seniority and scope appropriate to the candidate's current level, as described in CANDIDATE RULES."),
]


def _seed_dimensions(conn):
    if conn.execute("SELECT COUNT(*) FROM score_dimensions").fetchone()[0]:
        return
    conn.executemany(
        "INSERT INTO score_dimensions(key, label, description, weight, position) VALUES (?,?,?,10,?)",
        [(k, label, desc, i + 1) for i, (k, label, desc) in enumerate(DEFAULT_DIMENSIONS)])


def load_dimensions(conn, include_archived=False):
    sql = "SELECT key, label, description, weight, position, archived FROM score_dimensions"
    if not include_archived:
        sql += " WHERE archived=0"
    return [dict(r) for r in conn.execute(sql + " ORDER BY position, key").fetchall()]


def slugify_label(label, existing_keys):
    base = re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_")[:32] or "dim"
    key, n = base, 1
    while key in existing_keys:
        n += 1
        key = f"{base}_{n}"
    return key


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def get_conn(db_path=None):
    # check_same_thread=False: streaming responses (deep-dive) can hop worker threads across
    # next() calls, but each connection still serves exactly one request/flow at a time.
    conn = sqlite3.connect(str(db_path or DB_DEFAULT), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def _add_missing_columns(conn):
    existing = {r["name"] for r in conn.execute("PRAGMA table_info(profile)").fetchall()}
    for name, coltype in PROFILE_ADDED_COLUMNS:
        if name not in existing:
            conn.execute(f"ALTER TABLE profile ADD COLUMN {name} {coltype}")


def ensure_schema(conn):
    conn.executescript(SCHEMA)
    _add_missing_columns(conn)
    _seed_dimensions(conn)
    conn.commit()
