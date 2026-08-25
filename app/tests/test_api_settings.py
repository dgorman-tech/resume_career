import json

import pytest
from fastapi.testclient import TestClient

from app.app import create_app

# On-disk shape: includes non-editable keys the API must preserve but never expose.
FULL_CFG = {
    "ntfy_topic": "my-secret-topic",
    "db_path": "watcher.db",
    "digest_dir": "digests",
    "user_agent": "personal-job-watcher/1.0",
    "request_timeout_seconds": 20,
    "delay_between_requests_seconds": 1.5,
    "filters": {
        "title_domain": ["data"],
        "title_seniority": ["manager"],
        "title_exclude": ["intern"],
        "location_include": ["toronto"],
        "location_exclude": ["us only"],
    },
    "companies": [
        {"name": "Acme", "tier": 1, "adapter": "ashby", "slug": "acme"},
        {"name": "BigCo", "tier": 3, "adapter": "workday", "tenant": "bigco",
         "wd": "wd3", "site": "External", "search_terms": ["data"], "max_per_term": 100},
    ],
    "app": {
        "batch_model": "m-flash",
        "deep_dive_model": "m-pro",
        "batch_scoring": True,
        "internal_companies": ["BigCo"],
        "port": 8765,
    },
}


@pytest.fixture
def cfg_file(tmp_path):
    p = tmp_path / "config.json"
    p.write_text(json.dumps(FULL_CFG), encoding="utf-8")
    return p


@pytest.fixture
def client(tmp_db, cfg_file):
    db_file = tmp_db.execute("PRAGMA database_list").fetchone()[2]
    app = create_app(db_path=db_file, cfg=FULL_CFG, config_path=cfg_file)
    return TestClient(app, base_url="http://127.0.0.1")


def test_get_settings_returns_editable_subset(client):
    body = client.get("/api/settings").json()
    assert body["ok"] is True
    data = body["data"]
    assert data["ntfy_topic"] == "my-secret-topic"
    assert data["filters"]["title_domain"] == ["data"]
    assert [c["name"] for c in data["companies"]] == ["Acme", "BigCo"]
    assert data["app"] == {"batch_model": "m-flash", "deep_dive_model": "m-pro",
                           "batch_scoring": True, "internal_companies": ["BigCo"]}


def test_get_settings_never_exposes_pacing_or_paths(client):
    data = client.get("/api/settings").json()["data"]
    for key in ("user_agent", "delay_between_requests_seconds",
                "request_timeout_seconds", "db_path", "digest_dir"):
        assert key not in data
    assert "port" not in data["app"]


def test_get_settings_falls_back_to_example_when_config_missing(tmp_db, tmp_path):
    db_file = tmp_db.execute("PRAGMA database_list").fetchone()[2]
    app = create_app(db_path=db_file, cfg=FULL_CFG,
                     config_path=tmp_path / "does-not-exist.json")
    data = TestClient(app, base_url="http://127.0.0.1").get("/api/settings").json()["data"]
    assert data["companies"] == []
    assert "title_domain" in data["filters"]
    assert data["app"]["batch_scoring"] is True


def test_get_settings_defaults_missing_sections_of_partial_config(tmp_db, tmp_path):
    # a config predating the app/ scoring era: no "app" block, sparse filters
    partial = {"ntfy_topic": "", "companies": [], "filters": {"title_domain": ["data"]}}
    p = tmp_path / "config.json"
    p.write_text(json.dumps(partial), encoding="utf-8")
    db_file = tmp_db.execute("PRAGMA database_list").fetchone()[2]
    app = create_app(db_path=db_file, cfg=FULL_CFG, config_path=p)
    data = TestClient(app, base_url="http://127.0.0.1").get("/api/settings").json()["data"]
    assert data["app"]["internal_companies"] == []
    assert data["app"]["batch_scoring"] is True
    assert isinstance(data["app"]["batch_model"], str) and data["app"]["batch_model"]
    assert data["filters"]["title_domain"] == ["data"]
    assert data["filters"]["location_exclude"] == []


EDIT_BODY = {
    "ntfy_topic": "new-topic",
    "filters": {
        "title_domain": ["risk"],
        "title_seniority": ["director"],
        "title_exclude": [],
        "location_include": ["remote"],
        "location_exclude": [],
    },
    "companies": [
        {"name": "NewCo", "tier": 2, "adapter": "lever", "slug": "newco"},
        {"name": "SFCo", "tier": 2, "adapter": "successfactors_rmk",
         "host": "jobs.sfco.com", "feeds": ["(data)"], "location": "Toronto"},
    ],
    "app": {"batch_model": "m2-flash", "deep_dive_model": "m2-pro",
            "batch_scoring": False, "internal_companies": []},
}


def test_put_settings_roundtrips_through_get(client):
    body = client.put("/api/settings", json=EDIT_BODY).json()
    assert body["ok"] is True
    data = client.get("/api/settings").json()["data"]
    assert data["ntfy_topic"] == "new-topic"
    assert [c["name"] for c in data["companies"]] == ["NewCo", "SFCo"]
    assert data["app"]["batch_scoring"] is False


def test_put_settings_preserves_non_editable_keys_on_disk(client, cfg_file):
    client.put("/api/settings", json=EDIT_BODY)
    on_disk = json.loads(cfg_file.read_text(encoding="utf-8"))
    assert on_disk["user_agent"] == FULL_CFG["user_agent"]
    assert on_disk["delay_between_requests_seconds"] == 1.5
    assert on_disk["db_path"] == "watcher.db"
    assert on_disk["app"]["port"] == 8765
    assert on_disk["companies"][0]["name"] == "NewCo"


def test_put_settings_creates_file_from_example_when_missing(tmp_db, tmp_path):
    db_file = tmp_db.execute("PRAGMA database_list").fetchone()[2]
    cfg_path = tmp_path / "config.json"
    app = create_app(db_path=db_file, cfg=FULL_CFG, config_path=cfg_path)
    resp = TestClient(app, base_url="http://127.0.0.1").put("/api/settings", json=EDIT_BODY)
    assert resp.json()["ok"] is True
    on_disk = json.loads(cfg_path.read_text(encoding="utf-8"))
    assert on_disk["ntfy_topic"] == "new-topic"
    # non-editable keys seeded from the example template
    assert "user_agent" in on_disk and "delay_between_requests_seconds" in on_disk


def test_put_settings_rejects_company_missing_slug(client):
    bad = {**EDIT_BODY,
           "companies": [{"name": "Broken", "tier": 1, "adapter": "ashby"}]}
    resp = client.put("/api/settings", json=bad)
    assert resp.status_code == 400
    assert "slug" in resp.json()["error"]


def test_put_settings_rejects_unknown_adapter(client):
    bad = {**EDIT_BODY,
           "companies": [{"name": "X", "tier": 1, "adapter": "greenhouse", "slug": "x"}]}
    resp = client.put("/api/settings", json=bad)
    assert resp.status_code == 400
    assert "adapter" in resp.json()["error"]


def test_test_company_returns_count_and_sample_titles(client, monkeypatch):
    import watcher as w
    seen = {}

    def fake_ashby(session, cfg, company):
        seen["company"] = company
        seen["cfg"] = cfg
        return [{"job_id": str(i), "title": f"Role {i}", "location": "Toronto"}
                for i in range(7)]

    monkeypatch.setitem(w.ADAPTERS, "ashby", fake_ashby)
    resp = client.post("/api/settings/test-company",
                       json={"name": "Acme", "tier": 1, "adapter": "ashby", "slug": "acme"})
    data = resp.json()["data"]
    assert data["jobs_found"] == 7
    assert data["sample_titles"] == ["Role 0", "Role 1", "Role 2", "Role 3", "Role 4"]
    assert seen["company"]["slug"] == "acme"
    # pacing comes from the on-disk config, not the request
    assert seen["cfg"]["request_timeout_seconds"] == 20


def test_test_company_reports_fetch_failure(client, monkeypatch):
    import requests
    import watcher as w

    def boom(session, cfg, company):
        raise requests.RequestException("connection refused")

    monkeypatch.setitem(w.ADAPTERS, "lever", boom)
    resp = client.post("/api/settings/test-company",
                       json={"name": "X", "tier": 1, "adapter": "lever", "slug": "x"})
    assert resp.status_code == 502
    assert "connection refused" in resp.json()["error"]


def test_test_company_rejects_invalid_entry(client):
    resp = client.post("/api/settings/test-company",
                       json={"name": "Broken", "tier": 1, "adapter": "ashby"})
    assert resp.status_code == 400
    assert "slug" in resp.json()["error"]


def test_rejects_workday_tenant_url_injection(client):
    # tenant is interpolated into https://{tenant}.{wd}.myworkdayjobs.com — a "/" or ":"
    # would break out of the intended subdomain and point the fetch anywhere
    bad = {"name": "X", "tier": 1, "adapter": "workday", "tenant": "internal-host:9200/x",
           "wd": "wd3", "site": "External", "search_terms": ["data"]}
    resp = client.post("/api/settings/test-company", json=bad)
    assert resp.status_code == 400
    assert "tenant" in resp.json()["error"]


def test_rejects_successfactors_host_with_port_or_path(client):
    for host in ("127.0.0.1:8765", "jobs.co.com/path", "a b.com"):
        bad = {**EDIT_BODY,
               "companies": [{"name": "S", "tier": 1, "adapter": "successfactors_rmk",
                              "host": host, "feeds": ["(x)"]}]}
        resp = client.put("/api/settings", json=bad)
        assert resp.status_code == 400, host


def test_rejects_loopback_and_private_hosts(client):
    for host in ("localhost", "127.0.0.1", "192.168.1.10", "10.0.0.5"):
        bad = {**EDIT_BODY,
               "companies": [{"name": "S", "tier": 1, "adapter": "successfactors_rmk",
                              "host": host, "feeds": ["(x)"]}]}
        resp = client.put("/api/settings", json=bad)
        assert resp.status_code == 400, host


def test_rejects_slug_with_path_characters(client):
    bad = {**EDIT_BODY,
           "companies": [{"name": "X", "tier": 1, "adapter": "ashby", "slug": "a/b"}]}
    resp = client.put("/api/settings", json=bad)
    assert resp.status_code == 400
    assert "slug" in resp.json()["error"]


def test_put_settings_lowercases_filter_keywords(client):
    # watcher matches keywords against lowercased titles, so "Data" would never match
    body = {**EDIT_BODY,
            "filters": {**EDIT_BODY["filters"],
                        "title_domain": ["Data", " Risk "],
                        "location_include": ["Toronto"]}}
    client.put("/api/settings", json=body)
    data = client.get("/api/settings").json()["data"]
    assert data["filters"]["title_domain"] == ["data", "risk"]
    assert data["filters"]["location_include"] == ["toronto"]
