from unittest.mock import MagicMock

import pytest

import watcher as w


CFG = {"app": {"internal_companies": ["ExampleBank"]}, "companies": []}


def test_run_scoring_step_scores_new_and_unscored(tmp_db, monkeypatch):
    calls = []

    def fake_score(conn, session, cfg, key, inline_jd=None):
        calls.append((key, inline_jd))
        conn.execute("INSERT OR REPLACE INTO job_scores(key, fit) VALUES (?, 77)", (key,))
        return {"fit": 77}

    monkeypatch.setattr("app.scorer.score_job", fake_score)
    new_matched = [{"key": "k1", "title": "t", "jd_text": None},
                   {"key": "k2", "title": "t", "jd_text": "INLINE JD"}]
    result = w.run_scoring_step(tmp_db, MagicMock(), CFG, new_matched)
    scored_keys = {c[0] for c in calls}
    assert {"k1", "k2", "k3"} == scored_keys          # k3 = older unscored backlog
    assert dict(calls)["k2"] == "INLINE JD"           # inline jd forwarded
    assert result["scored"] == 3 and result["failed"] == 0
    assert result["fits"]["k1"] == 77


def test_run_scoring_step_survives_failures(tmp_db, monkeypatch):
    def fake_score(conn, session, cfg, key, inline_jd=None):
        from app.scorer import ScorerError
        raise ScorerError("boom")
    monkeypatch.setattr("app.scorer.score_job", fake_score)
    result = w.run_scoring_step(tmp_db, MagicMock(), CFG, [{"key": "k1", "jd_text": None}])
    assert result["failed"] >= 1 and result["scored"] == 0


def test_run_facts_step_extracts_new_matches_and_a_bounded_backlog(tmp_db, monkeypatch):
    calls = []

    def fake_extract(conn, session, cfg, key, inline_jd=None):
        calls.append((key, inline_jd))
        conn.execute("INSERT OR REPLACE INTO job_facts(key, office_days) VALUES (?, 2)", (key,))
        return {"office_days": 2}

    monkeypatch.setattr("app.facts.extract_facts", fake_extract)
    new_matched = [{"key": "k1", "jd_text": None}, {"key": "k2", "jd_text": "INLINE JD"}]

    result = w.run_facts_step(tmp_db, MagicMock(), CFG, new_matched)

    assert {c[0] for c in calls} == {"k1", "k2", "k3"}   # k3 = older job with no facts yet
    assert dict(calls)["k2"] == "INLINE JD"              # inline jd forwarded, no refetch
    assert result["extracted"] == 3 and result["failed"] == 0


def test_run_facts_step_survives_a_job_with_no_description(tmp_db, monkeypatch):
    def boom(*a, **k):
        from app.scorer import ScorerError
        raise ScorerError("no job description available")

    monkeypatch.setattr("app.facts.extract_facts", boom)
    result = w.run_facts_step(tmp_db, MagicMock(), CFG, [{"key": "k1", "jd_text": None}])
    assert result["failed"] >= 1 and result["extracted"] == 0


def test_run_facts_step_can_be_switched_off(tmp_db, monkeypatch):
    calls = []
    monkeypatch.setattr("app.facts.extract_facts", lambda *a, **k: calls.append(1))
    cfg = {"app": {"extract_facts": False}, "companies": []}
    w.run_facts_step(tmp_db, MagicMock(), cfg, [{"key": "k1", "jd_text": None}])
    assert calls == []


def test_run_facts_step_skips_jobs_that_already_have_facts(tmp_db, monkeypatch):
    tmp_db.execute("INSERT INTO job_facts(key, office_days) VALUES ('k3', 3)")
    tmp_db.commit()
    calls = []
    monkeypatch.setattr("app.facts.extract_facts",
                        lambda conn, s, c, key, inline_jd=None: calls.append(key))
    w.run_facts_step(tmp_db, MagicMock(), CFG, [])
    assert "k3" not in calls


def test_push_ntfy_includes_fit(monkeypatch):
    sent = {}
    monkeypatch.setattr(w.requests, "post",
                        lambda url, data=None, headers=None, timeout=None: sent.update(
                            {"data": data.decode("utf-8")}) or MagicMock())
    jobs = [{"key": "k1", "company": "Wealthsimple", "title": "Manager, AE"}]
    w.push_ntfy({"ntfy_topic": "topic-x"}, jobs, fits={"k1": 92})
    assert "Wealthsimple: Manager, AE (fit 92)" in sent["data"]


def test_open_db_connection_supports_scorer_row_access(tmp_path, monkeypatch):
    """Regression test: watcher.open_db()'s connection must be usable by the real (not
    mocked) app.scorer.score_job / app.jd_fetch.get_jd, which both do dict-style row
    access (row["resume_text"], job["source"], etc.) requiring conn.row_factory =
    sqlite3.Row. Before that was set on watcher's own connection, this crashed with
    `TypeError: tuple indices must be integers or slices, not str` on every scoring
    attempt in a real `python watcher/watcher.py` run -- regardless of whether
    GEMINI_API_KEY was configured, since the crash happened before the key check."""
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setattr(w, "BASE_DIR", tmp_path)
    conn = w.open_db({"db_path": "watcher.db"})
    try:
        from app import db as appdb, scorer

        appdb.ensure_schema(conn)
        conn.execute(
            "INSERT INTO jobs VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            ("k1", "Wealthsimple", 1, "ashby", "j1", "Manager, Analytics Engineering",
             "Toronto; Remote", "https://example.com/1", None, None, "", "2026-08-22",
             "2026-08-24T12:00:00Z", "2026-08-24T12:00:00Z", None, 1))
        conn.execute(
            "INSERT INTO profile(id, resume_text, rules_text) VALUES (1, 'resume', 'rules')")
        conn.commit()

        with pytest.raises(scorer.ScorerError, match="GEMINI_API_KEY"):
            scorer.score_job(conn, MagicMock(), {}, "k1")
    finally:
        conn.close()
