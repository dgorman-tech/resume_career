import re


def test_get_conn_pragmas(tmp_db):
    assert tmp_db.execute("PRAGMA journal_mode").fetchone()[0] == "wal"
    assert tmp_db.execute("PRAGMA busy_timeout").fetchone()[0] == 5000


def test_ensure_schema_creates_tables_idempotently(tmp_db):
    from app import db as appdb
    appdb.ensure_schema(tmp_db)  # second call must not raise
    names = {r[0] for r in tmp_db.execute(
        "SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    assert {"job_state", "job_scores", "jd_cache", "profile"} <= names


def test_status_check_constraint(tmp_db):
    import sqlite3, pytest
    tmp_db.execute("INSERT INTO job_state(key, status) VALUES ('k1', 'interested')")
    with pytest.raises(sqlite3.IntegrityError):
        tmp_db.execute("INSERT INTO job_state(key, status) VALUES ('k3', 'banana')")


def test_now_iso_format():
    from app import db as appdb
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", appdb.now_iso())
