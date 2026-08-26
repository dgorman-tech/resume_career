import pytest
from fastapi.testclient import TestClient

from app.app import create_app

CFG = {"app": {"internal_companies": []}, "companies": []}


@pytest.fixture
def client(tmp_db):
    db_file = tmp_db.execute("PRAGMA database_list").fetchone()[2]
    return TestClient(create_app(db_path=db_file, cfg=CFG), base_url="http://127.0.0.1")


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


def test_patch_next_action_roundtrips(client):
    r = client.patch("/api/jobs/k1", json={"next_action_at": "2026-09-01",
                                           "next_action_note": "follow up with recruiter"})
    assert r.json()["ok"] is True
    j = next(x for x in client.get("/api/jobs").json()["data"] if x["key"] == "k1")
    assert j["next_action_at"] == "2026-09-01"
    assert j["next_action_note"] == "follow up with recruiter"


def test_patch_clears_next_action_with_empty_string(client):
    client.patch("/api/jobs/k1", json={"next_action_at": "2026-09-01"})
    client.patch("/api/jobs/k1", json={"next_action_at": ""})
    j = next(x for x in client.get("/api/jobs").json()["data"] if x["key"] == "k1")
    assert j["next_action_at"] is None


def test_patch_rejects_malformed_next_action_date(client):
    r = client.patch("/api/jobs/k1", json={"next_action_at": "next tuesday"})
    assert r.status_code == 400 and r.json()["ok"] is False


def test_patch_records_a_dismiss_reason(client):
    r = client.patch("/api/jobs/k1", json={"status": "dismissed", "dismiss_reason": "comp"})
    assert r.json()["ok"] is True
    j = next(x for x in client.get("/api/jobs").json()["data"] if x["key"] == "k1")
    assert j["status"] == "dismissed" and j["dismiss_reason"] == "comp"


def test_patch_rejects_a_reason_outside_the_vocabulary(client):
    r = client.patch("/api/jobs/k1", json={"status": "dismissed", "dismiss_reason": "vibes"})
    assert r.status_code == 400 and r.json()["ok"] is False


def test_dismissing_without_a_reason_stays_allowed(client):
    client.patch("/api/jobs/k1", json={"status": "dismissed"})
    j = next(x for x in client.get("/api/jobs").json()["data"] if x["key"] == "k1")
    assert j["status"] == "dismissed" and j["dismiss_reason"] is None


def test_undismissing_clears_the_reason_it_no_longer_explains(client):
    client.patch("/api/jobs/k1", json={"status": "dismissed", "dismiss_reason": "rto"})
    client.patch("/api/jobs/k1", json={"status": "interested"})
    j = next(x for x in client.get("/api/jobs").json()["data"] if x["key"] == "k1")
    assert j["status"] == "interested" and j["dismiss_reason"] is None


def test_starring_a_dismissed_job_leaves_its_reason_intact(client):
    # only a status change away from dismissed invalidates the reason
    client.patch("/api/jobs/k1", json={"status": "dismissed", "dismiss_reason": "level"})
    client.patch("/api/jobs/k1", json={"starred": True})
    j = next(x for x in client.get("/api/jobs").json()["data"] if x["key"] == "k1")
    assert j["dismiss_reason"] == "level"


def test_patch_unknown_key_404(client):
    r = client.patch("/api/jobs/nope", json={"status": "applied"})
    assert r.status_code == 404 and r.json()["ok"] is False


def test_patch_invalid_status_400(client):
    assert client.patch("/api/jobs/k1", json={"status": "banana"}).status_code == 400


def test_profile_roundtrip_sets_updated_at(client):
    empty = client.get("/api/profile").json()["data"]
    assert empty["resume_text"] == "" and empty["updated_at"] is None
    assert empty["comp_floor_cad"] is None and empty["min_level"] == ""
    r = client.put("/api/profile", json={"resume_text": "R", "rules_text": "X"})
    assert r.json()["data"]["updated_at"] is not None
    again = client.get("/api/profile").json()["data"]
    assert again["resume_text"] == "R" and again["rules_text"] == "X"


def test_profile_roundtrip_persists_structured_fields(client):
    r = client.put("/api/profile", json={
        "resume_text": "R", "rules_text": "X", "comp_floor_cad": 170000,
        "comp_goal_cad": 200000, "max_office_days": 2,
        "location_text": "Toronto", "min_level": "senior_manager",
    })
    assert r.status_code == 200
    again = client.get("/api/profile").json()["data"]
    assert again["comp_floor_cad"] == 170000 and again["comp_goal_cad"] == 200000
    assert again["max_office_days"] == 2 and again["location_text"] == "Toronto"
    assert again["min_level"] == "senior_manager"


def test_profile_rejects_invalid_min_level(client):
    r = client.put("/api/profile", json={"resume_text": "R", "rules_text": "X", "min_level": "banana"})
    assert r.status_code == 400


def test_profile_rejects_out_of_range_office_days(client):
    r = client.put("/api/profile", json={"resume_text": "R", "rules_text": "X", "max_office_days": 9})
    assert r.status_code == 400
