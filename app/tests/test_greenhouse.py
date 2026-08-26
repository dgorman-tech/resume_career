import json
from pathlib import Path
from unittest.mock import MagicMock

import watcher as w

FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "greenhouse-jobs.json").read_text(encoding="utf-8"))

COMPANY = {"name": "ExampleCorp", "adapter": "greenhouse", "slug": "examplecorp", "tier": 1}
CFG = {"delay_between_requests_seconds": 0, "request_timeout_seconds": 20}


def _session_returning(data):
    resp = MagicMock(status_code=200)
    resp.json.return_value = data
    session = MagicMock()
    session.request.return_value = resp
    return session


def test_maps_fields_to_the_shared_adapter_shape():
    jobs = w.fetch_greenhouse(_session_returning(FIXTURE), CFG, COMPANY)
    assert len(jobs) == 3
    de = next(j for j in jobs if j["job_id"] == "4020123")
    assert de["title"] == "Senior Data Engineer"
    assert de["location"] == "Dublin, Ireland"
    assert de["url"] == "https://boards.greenhouse.io/examplecorp/jobs/4020123"
    assert de["posted_at"] == "2026-08-20"


def test_parses_salary_out_of_content_via_parse_salary_text():
    jobs = w.fetch_greenhouse(_session_returning(FIXTURE), CFG, COMPANY)
    de = next(j for j in jobs if j["job_id"] == "4020123")
    assert de["salary_min"] == 120000
    assert de["salary_max"] == 150000


def test_job_without_compensation_text_has_no_salary():
    jobs = w.fetch_greenhouse(_session_returning(FIXTURE), CFG, COMPANY)
    pm = next(j for j in jobs if j["job_id"] == "4020456")
    assert pm["salary_min"] is None and pm["salary_max"] is None
    # no verbatim compensation quote was captured, so raw stays honestly empty
    assert pm["salary_raw"] == ""


def test_content_is_stripped_to_plain_text_and_exposed_as_jd_text():
    jobs = w.fetch_greenhouse(_session_returning(FIXTURE), CFG, COMPANY)
    pm = next(j for j in jobs if j["job_id"] == "4020456")
    assert "<" not in pm["jd_text"]
    assert "5+ years experience" in pm["jd_text"]


def test_html_escaped_content_is_unescaped_before_tags_are_stripped():
    # the real API returns "content" as HTML *escaped* as text (literal
    # "&lt;h2&gt;"), not plain HTML — unescaping must happen before tag-stripping
    # or the markup and entities leak straight into jd_text
    jobs = w.fetch_greenhouse(_session_returning(FIXTURE), CFG, COMPANY)
    se = next(j for j in jobs if j["job_id"] == "4020789")
    assert "<" not in se["jd_text"] and "&lt;" not in se["jd_text"] and "&amp;" not in se["jd_text"]
    assert "About the role" in se["jd_text"]
    assert "Support customers & ship fixes." in se["jd_text"]
    assert se["salary_min"] == 95000 and se["salary_max"] == 110000


def test_fetches_the_documented_boards_api_endpoint_with_content_true(monkeypatch):
    real_fetch = w.fetch
    seen = {}

    def spy_fetch(session, cfg, method, url, **kwargs):
        seen["method"], seen["url"] = method, url
        return real_fetch(session, cfg, method, url, **kwargs)

    monkeypatch.setattr(w, "fetch", spy_fetch)
    w.fetch_greenhouse(_session_returning(FIXTURE), CFG, COMPANY)
    assert seen["method"] == "GET"
    assert seen["url"] == "https://boards-api.greenhouse.io/v1/boards/examplecorp/jobs?content=true"


def test_registered_in_adapters():
    assert w.ADAPTERS["greenhouse"] is w.fetch_greenhouse
