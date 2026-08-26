import json

import pytest
from fastapi.testclient import TestClient

from app import facts, scorer
from app.app import create_app

CFG = {"app": {"internal_companies": [], "facts_model": "m-flash"}, "companies": []}

JD = ("This role is hybrid: 4 days per week in the office. "
      "Required: expert SQL. The range is $120,000 - $150,000.")


@pytest.fixture
def client(tmp_db):
    db_file = tmp_db.execute("PRAGMA database_list").fetchone()[2]
    return TestClient(create_app(db_path=db_file, cfg=CFG), base_url="http://127.0.0.1")


def _seed_facts(conn, key="k1", **over):
    row = {"years_min": None, "level": None, "office_days": 4, "remote_policy": "hybrid",
           "must_haves": json.dumps(["expert SQL"]), "salary_min_jd": 120000.0,
           "salary_max_jd": 150000.0, "apply_deadline": None, "visa_or_clearance": None,
           "evidence": json.dumps({"office_days": "4 days per week in the office"}),
           "confidence": 80, **over}
    conn.execute(
        f"""INSERT INTO job_facts(key, {', '.join(row)}, extracted_at)
            VALUES (?, {', '.join('?' * len(row))}, '2026-08-25T00:00:00Z')""",
        (key, *row.values()))
    conn.commit()


def _seed_profile(conn, **over):
    p = {"max_office_days": None, "min_level": "", "comp_floor": None, **over}
    conn.execute(
        """INSERT INTO profile(id, resume_text, rules_text, max_office_days, min_level,
                               comp_floor) VALUES (1,'R','X',?,?,?)""",
        (p["max_office_days"], p["min_level"], p["comp_floor"]))
    conn.commit()


def test_jobs_carry_no_facts_until_extraction_runs(client):
    k1 = next(j for j in client.get("/api/jobs").json()["data"] if j["key"] == "k1")
    assert k1["facts"] is None and k1["conflicts"] == []


def test_jobs_expose_extracted_facts_with_evidence(client, tmp_db):
    _seed_facts(tmp_db)
    k1 = next(j for j in client.get("/api/jobs").json()["data"] if j["key"] == "k1")
    assert k1["facts"]["office_days"] == 4 and k1["facts"]["remote_policy"] == "hybrid"
    assert k1["facts"]["must_haves"] == ["expert SQL"]
    assert k1["facts"]["evidence"]["office_days"] == "4 days per week in the office"


def test_conflicts_are_reported_with_the_quote_behind_them(client, tmp_db):
    _seed_facts(tmp_db)
    _seed_profile(tmp_db, max_office_days=2, comp_floor=170000)
    k1 = next(j for j in client.get("/api/jobs").json()["data"] if j["key"] == "k1")
    by_field = {c["field"]: c for c in k1["conflicts"]}
    assert set(by_field) == {"office_days", "salary_max_jd"}
    assert by_field["office_days"]["quote"] == "4 days per week in the office"


def test_a_conflicting_job_stays_on_the_board_and_stays_scorable(client, tmp_db):
    _seed_facts(tmp_db)
    _seed_profile(tmp_db, max_office_days=0)
    k1 = next(j for j in client.get("/api/jobs").json()["data"] if j["key"] == "k1")
    # flagged, never removed and never auto-dismissed
    assert k1["conflicts"] and k1["status"] == "new"


def test_extract_facts_endpoint_stores_and_returns(client, tmp_db, monkeypatch):
    monkeypatch.setattr("app.jd_fetch.get_jd", lambda *a, **k: JD)
    monkeypatch.setattr(scorer, "_call_llm", lambda *a, **k: json.dumps({
        "facts": [{"field": "office_days", "value": "4",
                   "quote": "4 days per week in the office"}],
        "confidence": 90}))

    r = client.post("/api/jobs/k1/extract-facts")

    assert r.json()["ok"] is True and r.json()["data"]["office_days"] == 4
    assert tmp_db.execute("SELECT office_days FROM job_facts WHERE key='k1'").fetchone()[0] == 4


def test_extract_facts_without_a_description_is_a_clean_error(client, monkeypatch):
    monkeypatch.setattr("app.jd_fetch.get_jd", lambda *a, **k: None)
    r = client.post("/api/jobs/k1/extract-facts")
    assert r.status_code == 400 and r.json()["ok"] is False


def test_extract_facts_on_an_unknown_job_is_a_clean_error(client):
    r = client.post("/api/jobs/nope/extract-facts")
    assert r.status_code == 400 and r.json()["ok"] is False


def test_health_counts_jobs_still_missing_facts(client, tmp_db):
    assert client.get("/api/health").json()["data"]["missing_facts"] == 3
    _seed_facts(tmp_db)
    assert client.get("/api/health").json()["data"]["missing_facts"] == 2


def test_jobs_table_is_untouched_by_extraction(client, tmp_db, monkeypatch):
    before = tmp_db.execute("SELECT * FROM jobs WHERE key='k1'").fetchone()
    monkeypatch.setattr("app.jd_fetch.get_jd", lambda *a, **k: JD)
    monkeypatch.setattr(scorer, "_call_llm", lambda *a, **k: json.dumps({
        "facts": [{"field": "salary_min_jd", "value": "120000",
                   "quote": "The range is $120,000 - $150,000"}], "confidence": 50}))
    client.post("/api/jobs/k1/extract-facts")
    after = tmp_db.execute("SELECT * FROM jobs WHERE key='k1'").fetchone()
    assert dict(before) == dict(after)
