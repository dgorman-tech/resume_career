import time

import pytest
from fastapi.testclient import TestClient

from app import scorer
from app.app import create_app

CFG = {"app": {"internal_companies": [], "batch_model": "m-flash", "deep_dive_model": "m-pro"},
       "companies": []}


@pytest.fixture
def client(tmp_db):
    db_file = tmp_db.execute("PRAGMA database_list").fetchone()[2]
    return TestClient(create_app(db_path=db_file, cfg=CFG), base_url="http://127.0.0.1")


@pytest.fixture(autouse=True)
def drain_backfill():
    """The backfill slot is a module global guarding one worker thread. A test
    that starts one and returns without waiting leaves `running` set, and the
    next test to post a backfill gets 409'd instead of running."""
    yield
    from app import app as appmod
    for _ in range(300):
        with appmod._backfill_lock:
            if not appmod._backfill["running"]:
                break
        time.sleep(0.01)
    with appmod._backfill_lock:
        appmod._backfill.update({"running": False, "done": 0, "total": 0, "errors": 0})


def _seed_profile(conn):
    conn.execute("INSERT INTO profile(id, resume_text, rules_text, updated_at) VALUES (1,'R','X','2026-08-24T00:00:00Z')")
    conn.commit()


def test_score_now(client, tmp_db, monkeypatch):
    _seed_profile(tmp_db)
    import json
    good = {"fit": 88, "subscores": {"comp": 1, "level": 1, "flex": 1, "domain": 1, "growth": 1},
            "why": "w", "gaps": "g", "angle": "a"}
    monkeypatch.setattr(scorer, "_call_llm", lambda *a, **k: json.dumps(good))
    monkeypatch.setattr("app.jd_fetch.get_jd", lambda *a, **k: "JD")
    r = client.post("/api/jobs/k1/score")
    assert r.json()["ok"] is True and r.json()["data"]["fit"] == 88


def test_score_now_error_envelope(client, tmp_db, monkeypatch):
    monkeypatch.setattr(scorer, "_call_llm", lambda *a, **k: "irrelevant")
    r = client.post("/api/jobs/k1/score")   # no profile seeded -> ScorerError
    assert r.status_code == 400 and "profile" in r.json()["error"].lower()


def test_deep_dive_streams_and_persists(client, tmp_db, monkeypatch):
    _seed_profile(tmp_db)
    monkeypatch.setattr(scorer, "_stream_llm", lambda cfg, model, prompt: iter(["# Verdict\n", "Strong."]))
    monkeypatch.setattr("app.jd_fetch.get_jd", lambda *a, **k: "JD")
    with client.stream("POST", "/api/jobs/k1/deep-dive") as r:
        text = "".join(chunk for chunk in r.iter_text())
    assert "Strong." in text
    row = tmp_db.execute("SELECT deep_dive_md, deep_dive_model FROM job_scores WHERE key='k1'").fetchone()
    assert row["deep_dive_md"] == "# Verdict\nStrong." and row["deep_dive_model"] == "m-pro"


def test_deep_dive_unexpected_error_returns_500_envelope(client, tmp_db, monkeypatch):
    _seed_profile(tmp_db)

    def _boom(*a, **k):
        raise RuntimeError("boom")

    monkeypatch.setattr("app.jd_fetch.get_jd", _boom)
    r = client.post("/api/jobs/k1/deep-dive")
    assert r.status_code == 500
    body = r.json()
    assert body["ok"] is False and "boom" in body["error"]


def _seed_stale_shortlist(conn):
    """k1 applied + stale, k2 starred + stale, k3 shortlisted but freshly scored."""
    _seed_profile(conn)  # profile saved 2026-08-24
    conn.execute("INSERT INTO job_state(key, status, starred) VALUES ('k1','applied',0)")
    conn.execute("INSERT INTO job_state(key, status, starred) VALUES ('k2','new',1)")
    conn.execute("INSERT INTO job_state(key, status, starred) VALUES ('k3','interested',0)")
    conn.execute("INSERT INTO job_scores(key, fit, scored_at) VALUES ('k1',80,'2026-08-20T00:00:00Z')")
    conn.execute("INSERT INTO job_scores(key, fit, scored_at) VALUES ('k2',80,'2026-08-20T00:00:00Z')")
    conn.execute("INSERT INTO job_scores(key, fit, scored_at) VALUES ('k3',80,'2026-08-25T00:00:00Z')")
    conn.commit()


def test_health_counts_stale_shortlisted_so_the_ui_can_confirm_before_spending(client, tmp_db):
    _seed_stale_shortlist(tmp_db)
    assert client.get("/api/health").json()["data"]["stale_shortlisted"] == 2


def test_rescore_stale_touches_only_shortlisted_stale_jobs(client, tmp_db, monkeypatch):
    _seed_stale_shortlist(tmp_db)
    scored = []
    monkeypatch.setattr("app.scorer.score_job",
                        lambda conn, sess, cfg, key, **kw: scored.append(key) or {"fit": 71})
    monkeypatch.setattr("app.app.BACKFILL_DELAY", 0)

    r = client.post("/api/rescore-stale", json={"limit": 10})

    assert r.json()["data"]["total"] == 2
    for _ in range(100):
        if not client.get("/api/scoring-status").json()["data"]["running"]:
            break
        time.sleep(0.05)
    assert sorted(scored) == ["k1", "k2"]


def test_rescore_stale_does_nothing_when_no_profile_was_ever_saved(client, tmp_db, monkeypatch):
    # nothing can be stale against a profile that does not exist
    tmp_db.execute("INSERT INTO job_state(key, status) VALUES ('k1','applied')")
    tmp_db.execute("INSERT INTO job_scores(key, fit, scored_at) VALUES ('k1',80,'2026-08-20T00:00:00Z')")
    tmp_db.commit()
    r = client.post("/api/rescore-stale", json={"limit": 10})
    assert r.json()["data"] == {"started": False, "total": 0}


def test_rescore_stale_respects_the_limit(client, tmp_db, monkeypatch):
    _seed_stale_shortlist(tmp_db)
    monkeypatch.setattr("app.scorer.score_job", lambda *a, **k: {"fit": 71})
    monkeypatch.setattr("app.app.BACKFILL_DELAY", 0)
    r = client.post("/api/rescore-stale", json={"limit": 1})
    assert r.json()["data"]["total"] == 1


def test_backfill_and_status(client, tmp_db, monkeypatch):
    _seed_profile(tmp_db)
    import json
    good = {"fit": 70, "subscores": {"comp": 1, "level": 1, "flex": 1, "domain": 1, "growth": 1},
            "why": "w", "gaps": "g", "angle": "a"}
    monkeypatch.setattr(scorer, "_call_llm", lambda *a, **k: json.dumps(good))
    monkeypatch.setattr("app.jd_fetch.get_jd", lambda *a, **k: "JD")
    monkeypatch.setattr("app.app.BACKFILL_DELAY", 0)
    r = client.post("/api/score-unscored", json={"limit": 10})
    assert r.json()["data"]["total"] == 3
    for _ in range(100):
        s = client.get("/api/scoring-status").json()["data"]
        if not s["running"]:
            break
        time.sleep(0.05)
    assert s["done"] == 3 and s["errors"] == 0
