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
    assert [d["key"] for d in dims] == ["comp", "level", "flex", "domain", "growth"]
    assert all(d["weight"] == 10 and d["archived"] == 0 for d in dims)
    assert dims[0]["label"] == "Compensation"
    assert "CANDIDATE RULES" in dims[0]["description"]
    # neutral defaults: no dimension names a specific tool, role shape, or person's taste
    for d in dims:
        assert "player" not in d["description"].lower()
        assert "cost-center" not in d["description"].lower() and "cost center" not in d["description"].lower()


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


def test_legacy_comp_cad_columns_migrate_to_currency_aware_ones(tmp_path):
    """Guards the owner's live DB: months of comp_floor_cad/comp_goal_cad data must
    survive the move to currency-aware comp_floor/comp_goal, exactly once, without
    ever dropping the old columns."""
    from app import db as appdb
    conn = appdb.get_conn(tmp_path / "legacy.db")
    # the OLD profile schema, predating comp_floor/comp_goal/currency
    conn.execute("""CREATE TABLE profile (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        resume_text TEXT NOT NULL DEFAULT '',
        rules_text TEXT NOT NULL DEFAULT '',
        comp_floor_cad INTEGER,
        comp_goal_cad INTEGER,
        max_office_days INTEGER,
        location_text TEXT NOT NULL DEFAULT '',
        min_level TEXT NOT NULL DEFAULT '',
        updated_at TEXT)""")
    conn.execute(
        "INSERT INTO profile(id, resume_text, rules_text, comp_floor_cad, comp_goal_cad) "
        "VALUES (1, 'RESUME', 'RULES', 170000, 200000)")
    conn.commit()

    appdb.ensure_schema(conn)

    row = conn.execute(
        "SELECT comp_floor, comp_goal, currency, comp_floor_cad, comp_goal_cad "
        "FROM profile WHERE id=1").fetchone()
    assert row["comp_floor"] == 170000 and row["comp_goal"] == 200000
    assert row["currency"] == "CAD"
    # the old columns are never dropped, so nothing already relying on them breaks
    assert row["comp_floor_cad"] == 170000 and row["comp_goal_cad"] == 200000

    # idempotent: a second (and third) launch must not clobber or re-derive anything
    appdb.ensure_schema(conn)
    appdb.ensure_schema(conn)
    row_again = conn.execute(
        "SELECT comp_floor, comp_goal, currency FROM profile WHERE id=1").fetchone()
    assert row_again["comp_floor"] == 170000 and row_again["comp_goal"] == 200000
    assert row_again["currency"] == "CAD"
    conn.close()


def test_legacy_migration_does_not_overwrite_a_value_already_set_on_the_new_column(tmp_path):
    """If the new column was already populated (e.g. the user changed it after an
    earlier partial migration), the backfill must not stomp it with the stale
    legacy value."""
    from app import db as appdb
    conn = appdb.get_conn(tmp_path / "legacy2.db")
    conn.execute("""CREATE TABLE profile (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        resume_text TEXT NOT NULL DEFAULT '',
        rules_text TEXT NOT NULL DEFAULT '',
        comp_floor_cad INTEGER,
        comp_goal_cad INTEGER,
        comp_floor INTEGER,
        comp_goal INTEGER,
        updated_at TEXT)""")
    conn.execute(
        "INSERT INTO profile(id, resume_text, rules_text, comp_floor_cad, comp_goal_cad, comp_floor) "
        "VALUES (1, 'RESUME', 'RULES', 170000, 200000, 999999)")
    conn.commit()

    appdb.ensure_schema(conn)

    row = conn.execute("SELECT comp_floor, comp_goal FROM profile WHERE id=1").fetchone()
    assert row["comp_floor"] == 999999          # untouched: it already had a value
    assert row["comp_goal"] == 200000           # backfilled: it was NULL
    conn.close()


def test_a_db_that_never_had_the_legacy_columns_is_unaffected_by_the_backfill(tmp_db):
    """Safety net for the common case: a fresh DB (or the fixture DB every other
    test in this suite uses) never had comp_floor_cad/comp_goal_cad, so the
    migration guard must be a true no-op there."""
    tmp_db.execute("INSERT INTO profile(id, resume_text, rules_text, comp_floor, comp_goal) "
                   "VALUES (1, 'r', 'x', 170000, 200000)")
    tmp_db.commit()
    from app import db as appdb
    appdb.ensure_schema(tmp_db)  # must not raise (no comp_floor_cad column exists) and not change anything
    row = tmp_db.execute("SELECT comp_floor, comp_goal, currency FROM profile WHERE id=1").fetchone()
    assert row["comp_floor"] == 170000 and row["comp_goal"] == 200000 and row["currency"] == "CAD"


def test_next_action_columns_are_added_to_a_pre_existing_job_state(tmp_path):
    """The real watcher.db already has a job_state table, so CREATE TABLE IF NOT
    EXISTS is a no-op there — the follow-up columns only arrive if the migration
    path covers job_state as well as profile."""
    from app import db as appdb
    conn = appdb.get_conn(tmp_path / "old.db")
    conn.execute("""CREATE TABLE job_state (
        key TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'new'
          CHECK (status IN ('new','interested','dismissed','applied')),
        starred INTEGER NOT NULL DEFAULT 0, note TEXT, updated_at TEXT)""")
    conn.execute("INSERT INTO job_state(key, status, note) VALUES ('k1','applied','keep me')")
    conn.commit()

    appdb.ensure_schema(conn)

    row = conn.execute(
        "SELECT status, note, next_action_at, next_action_note FROM job_state WHERE key='k1'").fetchone()
    assert row["status"] == "applied" and row["note"] == "keep me"   # existing data survives
    assert row["next_action_at"] is None and row["next_action_note"] is None
    appdb.ensure_schema(conn)  # idempotent: a second launch must not re-add them
    conn.close()


def test_dismiss_reason_column_reaches_a_pre_existing_job_state(tmp_path):
    from app import db as appdb
    conn = appdb.get_conn(tmp_path / "old.db")
    conn.execute("""CREATE TABLE job_state (
        key TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'new'
          CHECK (status IN ('new','interested','dismissed','applied')),
        starred INTEGER NOT NULL DEFAULT 0, note TEXT, updated_at TEXT)""")
    conn.commit()

    appdb.ensure_schema(conn)

    conn.execute("INSERT INTO job_state(key, status, dismiss_reason) VALUES ('k1','dismissed','comp')")
    assert conn.execute("SELECT dismiss_reason FROM job_state WHERE key='k1'").fetchone()[0] == "comp"
    conn.close()


def test_dismiss_reason_rejects_a_reason_outside_the_vocabulary(tmp_db):
    import sqlite3, pytest
    tmp_db.execute("INSERT INTO job_state(key, status, dismiss_reason) VALUES ('k1','dismissed','rto')")
    with pytest.raises(sqlite3.IntegrityError):
        tmp_db.execute("INSERT INTO job_state(key, status, dismiss_reason) VALUES ('k2','dismissed','vibes')")


def test_dismiss_reason_is_optional(tmp_db):
    # dismissing without picking a reason must stay possible; the reason is a bonus
    tmp_db.execute("INSERT INTO job_state(key, status) VALUES ('k1','dismissed')")
    assert tmp_db.execute("SELECT dismiss_reason FROM job_state WHERE key='k1'").fetchone()[0] is None


def test_score_history_records_provenance_and_appends(tmp_db):
    from app import db as appdb
    cols = {r["name"] for r in tmp_db.execute("PRAGMA table_info(score_history)").fetchall()}
    assert {"key", "fit", "subscores", "why", "gaps", "angle", "lens", "model",
            "prompt_version", "profile_hash", "rubric_hash", "jd_hash", "scored_at"} <= cols
    for fit in (70, 80):
        tmp_db.execute(
            "INSERT INTO score_history(key, fit, model, prompt_version, scored_at) VALUES (?,?,?,?,?)",
            ("k1", fit, "m", "batch/1", appdb.now_iso()))
    # append-only: the second write must not replace the first
    assert [r[0] for r in tmp_db.execute(
        "SELECT fit FROM score_history WHERE key='k1' ORDER BY id").fetchall()] == [70, 80]


def test_job_facts_table_holds_facts_and_their_provenance(tmp_db):
    cols = {r["name"] for r in tmp_db.execute("PRAGMA table_info(job_facts)").fetchall()}
    assert {"key", "years_min", "level", "office_days", "remote_policy", "must_haves",
            "salary_min_jd", "salary_max_jd", "apply_deadline", "visa_or_clearance",
            "evidence", "confidence", "model", "prompt_version", "jd_hash",
            "extracted_at"} <= cols


def test_job_facts_is_one_row_per_job(tmp_db):
    from app import db as appdb
    for days in (3, 2):
        tmp_db.execute(
            """INSERT INTO job_facts(key, office_days, extracted_at) VALUES (?,?,?)
               ON CONFLICT(key) DO UPDATE SET office_days=excluded.office_days""",
            ("k1", days, appdb.now_iso()))
    rows = tmp_db.execute("SELECT office_days FROM job_facts WHERE key='k1'").fetchall()
    assert [r[0] for r in rows] == [2]   # re-extraction replaces, it does not accumulate


def test_load_dimensions_filters_and_orders(tmp_db):
    from app import db as appdb
    tmp_db.execute("UPDATE score_dimensions SET archived=1 WHERE key='flex'")
    tmp_db.execute("UPDATE score_dimensions SET position=99 WHERE key='comp'")
    tmp_db.commit()
    active = appdb.load_dimensions(tmp_db)
    assert [d["key"] for d in active] == ["level", "domain", "growth", "comp"]
    assert len(appdb.load_dimensions(tmp_db, include_archived=True)) == 5


def test_slugify_label(tmp_db):
    from app import db as appdb
    assert appdb.slugify_label("Team Culture!", set()) == "team_culture"
    assert appdb.slugify_label("Team Culture", {"team_culture"}) == "team_culture_2"
    assert appdb.slugify_label("Team Culture", {"team_culture", "team_culture_2"}) == "team_culture_3"
    assert appdb.slugify_label("???", set()) == "dim"
    assert len(appdb.slugify_label("x" * 80, set())) <= 32
