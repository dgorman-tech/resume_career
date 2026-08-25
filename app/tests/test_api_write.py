import pytest
from fastapi.testclient import TestClient

from app.app import create_app

CFG = {"app": {"internal_companies": []}, "companies": []}


@pytest.fixture
def client(tmp_db):
    db_file = tmp_db.execute("PRAGMA database_list").fetchone()[2]
    return TestClient(create_app(db_path=db_file, cfg=CFG))


def test_patch_status_and_note(client):
    r = client.patch("/api/jobs/k1", json={"status": "interested", "note": "ping Sam"})
    assert r.json()["ok"] is True
    j = next(x for x in client.get("/api/jobs").json()["data"] if x["key"] == "k1")
    assert j["status"] == "interested" and j["note"] == "ping Sam"


def test_patch_starred_only_preserves_status(client):
    client.patch("/api/jobs/k1", json={"status": "applied"})
    client.patch("/api/jobs/k1", json={"starred": True})
    j = next(x for x in client.get("/api/jobs").json()["data"] if x["key"] == "k1")
    assert j["status"] == "applied" and j["starred"] is True


def test_patch_unknown_key_404(client):
    r = client.patch("/api/jobs/nope", json={"status": "applied"})
    assert r.status_code == 404 and r.json()["ok"] is False


def test_patch_invalid_status_400(client):
    assert client.patch("/api/jobs/k1", json={"status": "banana"}).status_code == 400


def test_profile_roundtrip_sets_updated_at(client):
    empty = client.get("/api/profile").json()["data"]
    assert empty["resume_text"] == "" and empty["updated_at"] is None
    r = client.put("/api/profile", json={"resume_text": "R", "rules_text": "X"})
    assert r.json()["data"]["updated_at"] is not None
    again = client.get("/api/profile").json()["data"]
    assert again["resume_text"] == "R" and again["rules_text"] == "X"
