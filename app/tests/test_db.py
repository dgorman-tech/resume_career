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


def test_ensure_schema_creates_jobs_and_runs_on_a_brand_new_db(tmp_path):
    # a friend's first launch, before the watcher has ever run once: no jobs/runs
    # tables exist yet, and the app must not depend on the watcher having created them
    from app import db as appdb
    conn = appdb.get_conn(tmp_path / "fresh.db")
    appdb.ensure_schema(conn)
    names = {r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    assert {"jobs", "runs"} <= names
    assert conn.execute("SELECT COUNT(*) FROM jobs").fetchone()[0] == 0
    conn.close()


def test_status_check_constraint(tmp_db):
    import sqlite3, pytest
    tmp_db.execute("INSERT INTO job_state(key, status) VALUES ('k1', 'interested')")
    with pytest.raises(sqlite3.IntegrityError):
        tmp_db.execute("INSERT INTO job_state(key, status) VALUES ('k3', 'banana')")


def test_now_iso_format():
    from app import db as appdb
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", appdb.now_iso())


def test_score_dimensions_seeded(tmp_db):
    from app import db as appdb
    dims = appdb.load_dimensions(tmp_db)
    assert [d["key"] for d in dims] == ["comp", "player_coach", "cost_center", "flex", "level"]
    assert all(d["weight"] == 10 and d["archived"] == 0 for d in dims)
    assert dims[0]["label"] == "Compensation"
    assert "CANDIDATE RULES" in dims[0]["description"]


def test_seed_runs_once_and_migration_is_idempotent(tmp_db):
    from app import db as appdb
    tmp_db.execute("UPDATE score_dimensions SET weight=77 WHERE key='comp'")
    tmp_db.commit()
    appdb.ensure_schema(tmp_db)  # second run must not re-seed or duplicate columns
    appdb.ensure_schema(tmp_db)
    assert tmp_db.execute("SELECT COUNT(*) FROM score_dimensions").fetchone()[0] == 5
    assert tmp_db.execute("SELECT weight FROM score_dimensions WHERE key='comp'").fetchone()[0] == 77


def test_profile_columns_added_with_defaults(tmp_db):
    tmp_db.execute("INSERT INTO profile(id, resume_text, rules_text) VALUES (1,'r','x')")
    tmp_db.commit()
    row = tmp_db.execute("SELECT holistic_weight, rubric_updated_at FROM profile WHERE id=1").fetchone()
    assert row["holistic_weight"] == 50 and row["rubric_updated_at"] is None


def test_load_dimensions_filters_and_orders(tmp_db):
    from app import db as appdb
    tmp_db.execute("UPDATE score_dimensions SET archived=1 WHERE key='flex'")
    tmp_db.execute("UPDATE score_dimensions SET position=99 WHERE key='comp'")
    tmp_db.commit()
    active = appdb.load_dimensions(tmp_db)
    assert [d["key"] for d in active] == ["player_coach", "cost_center", "level", "comp"]
    assert len(appdb.load_dimensions(tmp_db, include_archived=True)) == 5


def test_slugify_label(tmp_db):
    from app import db as appdb
    assert appdb.slugify_label("Team Culture!", set()) == "team_culture"
    assert appdb.slugify_label("Team Culture", {"team_culture"}) == "team_culture_2"
    assert appdb.slugify_label("Team Culture", {"team_culture", "team_culture_2"}) == "team_culture_3"
    assert appdb.slugify_label("???", set()) == "dim"
    assert len(appdb.slugify_label("x" * 80, set())) <= 32
