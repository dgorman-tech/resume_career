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
    return TestClient(create_app(db_path=db_file, cfg=CFG))


def _seed_profile(conn):
    conn.execute("INSERT INTO profile(id, resume_text, rules_text, updated_at) VALUES (1,'R','X','2026-08-24T00:00:00Z')")
    conn.commit()


def test_score_now(client, tmp_db, monkeypatch):
    _seed_profile(tmp_db)
    import json
    good = {"fit": 88, "subscores": {"comp": 1, "player_coach": 1, "cost_center": 1, "flex": 1, "level": 1},
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


def test_backfill_and_status(client, tmp_db, monkeypatch):
    _seed_profile(tmp_db)
    import json
    good = {"fit": 70, "subscores": {"comp": 1, "player_coach": 1, "cost_center": 1, "flex": 1, "level": 1},
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
