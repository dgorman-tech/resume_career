import pytest
from fastapi.testclient import TestClient

from app.app import create_app

CFG = {"app": {"internal_companies": ["Scotiabank"], "batch_model": "m-flash",
               "deep_dive_model": "m-pro", "batch_scoring": True},
       "companies": []}


@pytest.fixture
def client(tmp_db, tmp_path, monkeypatch):
    # create_app opens its own connection to the same file the tmp_db fixture made
    db_file = tmp_db.execute("PRAGMA database_list").fetchone()[2]
    app = create_app(db_path=db_file, cfg=CFG)
    return TestClient(app)


def test_jobs_shape_and_defaults(client):
    body = client.get("/api/jobs").json()
    assert body["ok"] is True
    jobs = body["data"]
    assert len(jobs) == 3
    k1 = next(j for j in jobs if j["key"] == "k1")
    assert k1["status"] == "new" and k1["starred"] is False and k1["fit"] is None
    assert k1["is_internal"] is False and k1["stale"] is False
    k2 = next(j for j in jobs if j["key"] == "k2")
    assert k2["is_internal"] is True


def test_jobs_joins_state_and_scores(client, tmp_db):
    tmp_db.execute("INSERT INTO job_state(key, status, starred, note) VALUES ('k1','interested',1,'call ref')")
    tmp_db.execute("INSERT INTO job_scores(key, fit, subscores, lens, scored_at) "
                   "VALUES ('k1', 92, '{\"comp\": 95}', 'external', '2026-08-24T13:00:00Z')")
    tmp_db.commit()
    k1 = next(j for j in client.get("/api/jobs").json()["data"] if j["key"] == "k1")
    assert k1["status"] == "interested" and k1["starred"] is True
    assert k1["fit"] == 92 and k1["subscores"]["comp"] == 95


def test_stale_flag(client, tmp_db):
    tmp_db.execute("INSERT INTO job_scores(key, fit, scored_at) VALUES ('k1', 80, '2026-08-20T00:00:00Z')")
    tmp_db.execute("INSERT INTO profile(id, resume_text, rules_text, updated_at) "
                   "VALUES (1,'r','x','2026-08-24T00:00:00Z')")
    tmp_db.commit()
    k1 = next(j for j in client.get("/api/jobs").json()["data"] if j["key"] == "k1")
    assert k1["stale"] is True


def test_stats(client, tmp_db):
    body = client.get("/api/stats").json()["data"]
    assert body["open"] == 3 and body["unreviewed"] == 3
    assert body["median_t1_salary"] == 175500  # (156000+195000)/2 for the single T1 row


def test_health_never_leaks_key(client, monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "secret-value")
    body = client.get("/api/health").json()["data"]
    assert body["key_present"] is True
    assert "secret-value" not in str(body)
    assert body["batch_model"] == "m-flash"
