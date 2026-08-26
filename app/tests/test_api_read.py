import pytest
from fastapi.testclient import TestClient

from app.app import create_app

CFG = {"app": {"internal_companies": ["ExampleBank"], "batch_model": "m-flash",
               "deep_dive_model": "m-pro", "batch_scoring": True},
       "companies": []}


@pytest.fixture
def client(tmp_db, tmp_path, monkeypatch):
    # create_app opens its own connection to the same file the tmp_db fixture made
    db_file = tmp_db.execute("PRAGMA database_list").fetchone()[2]
    app = create_app(db_path=db_file, cfg=CFG)
    return TestClient(app, base_url="http://127.0.0.1")


def test_rejects_spoofed_host_header(client):
    # DNS-rebinding defence: only loopback hostnames may address this API
    resp = client.get("/api/jobs", headers={"Host": "evil.example"})
    assert resp.status_code == 400


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


def test_closed_job_in_pipeline_stays_visible(client, tmp_db):
    # a posting you applied to must not vanish the day it closes — that is the
    # exact moment you need to see it
    tmp_db.execute("UPDATE jobs SET closed_at='2026-08-25T00:00:00Z' WHERE key='k1'")
    tmp_db.execute("INSERT INTO job_state(key, status) VALUES ('k1','applied')")
    tmp_db.commit()
    k1 = next((j for j in client.get("/api/jobs").json()["data"] if j["key"] == "k1"), None)
    assert k1 is not None and k1["closed_at"] == "2026-08-25T00:00:00Z"


def test_closed_job_without_pipeline_status_disappears(client, tmp_db):
    tmp_db.execute("UPDATE jobs SET closed_at='2026-08-25T00:00:00Z' WHERE key='k3'")
    tmp_db.commit()
    keys = [j["key"] for j in client.get("/api/jobs").json()["data"]]
    assert "k3" not in keys


def test_stale_flag(client, tmp_db):
    tmp_db.execute("INSERT INTO job_scores(key, fit, scored_at) VALUES ('k1', 80, '2026-08-20T00:00:00Z')")
    tmp_db.execute("INSERT INTO profile(id, resume_text, rules_text, updated_at) "
                   "VALUES (1,'r','x','2026-08-24T00:00:00Z')")
    tmp_db.commit()
    k1 = next(j for j in client.get("/api/jobs").json()["data"] if j["key"] == "k1")
    assert k1["stale"] is True


def test_stale_flag_from_rubric_change(client, tmp_db):
    tmp_db.execute("INSERT INTO job_scores(key, fit, scored_at) VALUES ('k1', 80, '2026-08-20T00:00:00Z')")
    # profile saved BEFORE scoring (not stale), rubric edited AFTER (stale)
    tmp_db.execute("INSERT INTO profile(id, resume_text, rules_text, updated_at, rubric_updated_at) "
                   "VALUES (1,'r','x','2026-08-19T00:00:00Z','2026-08-21T00:00:00Z')")
    tmp_db.commit()
    k1 = next(j for j in client.get("/api/jobs").json()["data"] if j["key"] == "k1")
    assert k1["stale"] is True


def test_not_stale_when_scored_after_both(client, tmp_db):
    tmp_db.execute("INSERT INTO job_scores(key, fit, scored_at) VALUES ('k1', 80, '2026-08-22T00:00:00Z')")
    tmp_db.execute("INSERT INTO profile(id, resume_text, rules_text, updated_at, rubric_updated_at) "
                   "VALUES (1,'r','x','2026-08-19T00:00:00Z','2026-08-21T00:00:00Z')")
    tmp_db.commit()
    k1 = next(j for j in client.get("/api/jobs").json()["data"] if j["key"] == "k1")
    assert k1["stale"] is False


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


def test_health_reports_unfilled_placeholder_key_as_absent(client, monkeypatch):
    # a fresh `scripts/setup.py` run copies .env.example verbatim, so this is
    # exactly what a friend's environment looks like right after bootstrap —
    # the gear icon must not claim the key is configured.
    monkeypatch.setenv("GEMINI_API_KEY", "your-gemini-api-key-here")
    body = client.get("/api/health").json()["data"]
    assert body["key_present"] is False
