"""Shared SQLite access for Career HQ. The watcher owns jobs/runs; this module
owns job_state, job_scores, jd_cache, profile."""

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
  updated_at TEXT
);
"""


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


def ensure_schema(conn):
    conn.executescript(SCHEMA)
    conn.commit()
