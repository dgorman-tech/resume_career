import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "watcher"))


def _watcher_tables(conn):
    conn.execute("""CREATE TABLE IF NOT EXISTS jobs(
        key TEXT PRIMARY KEY, company TEXT, tier INTEGER, source TEXT, job_id TEXT,
        title TEXT, location TEXT, url TEXT,
        salary_min REAL, salary_max REAL, salary_raw TEXT,
        posted_at TEXT, first_seen TEXT, last_seen TEXT, closed_at TEXT,
        matched INTEGER)""")
    conn.execute("""CREATE TABLE IF NOT EXISTS runs(
        ts TEXT, company TEXT, source TEXT, status TEXT,
        jobs_found INTEGER, matched INTEGER, error TEXT)""")


SEED_JOBS = [
    ("k1", "Wealthsimple", 1, "ashby", "j1", "Manager, Analytics Engineering",
     "Toronto; Remote", "https://example.com/1", 156000, 195000, "", "2026-08-22",
     "2026-08-24T12:00:00Z", "2026-08-24T12:00:00Z", None, 1),
    ("k2", "ExampleBank", 2, "successfactors_rmk", "601199917",
     "Senior Manager, Technology Risk and Control Self-Assessment",
     "Toronto, ON, CA, M5H 1H1", "https://example.com/2", None, None, "", "2026-08-24",
     "2026-08-24T12:00:00Z", "2026-08-24T12:00:00Z", None, 1),
    ("k3", "Jobber", 3, "ashby", "j3", "Data Analyst II", "Toronto",
     "https://example.com/3", None, None, "", "2026-07-01",
     "2026-07-02T12:00:00Z", "2026-08-24T12:00:00Z", None, 1),
]


import pytest


@pytest.fixture
def tmp_db(tmp_path):
    from app import db as appdb
    path = tmp_path / "test.db"
    conn = appdb.get_conn(path)
    _watcher_tables(conn)
    conn.executemany("INSERT INTO jobs VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", SEED_JOBS)
    appdb.ensure_schema(conn)
    conn.commit()
    yield conn
    conn.close()
