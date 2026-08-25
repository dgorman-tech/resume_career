from pathlib import Path
from unittest.mock import MagicMock

import watcher as w

FIXTURE = (Path(__file__).parent / "fixtures" / "examplebank-rss.xml").read_text(encoding="utf-8")

COMPANY = {"name": "ExampleBank", "adapter": "successfactors_rmk",
           "host": "jobs.examplebank.com", "feeds": ["(risk)"], "location": "Toronto", "tier": 2}
CFG = {"delay_between_requests_seconds": 0}


def _session_returning(text):
    resp = MagicMock(status_code=200, text=text)
    session = MagicMock()
    session.request.return_value = resp
    return session


def test_parses_items():
    jobs = w.fetch_successfactors_rmk(_session_returning(FIXTURE), CFG, COMPANY)
    assert len(jobs) == 3
    sm = next(j for j in jobs if j["job_id"] == "601199917")
    assert sm["title"] == "Senior Manager, Technology Risk and Control Self-Assessment"
    assert sm["location"] == "Toronto, ON, CA, M5H 1H1"
    assert sm["posted_at"] == "2026-08-24"
    assert sm["salary_min"] is None and sm["salary_max"] is None


def test_url_stripped_of_tracking_params():
    jobs = w.fetch_successfactors_rmk(_session_returning(FIXTURE), CFG, COMPANY)
    for j in jobs:
        assert "utm_" not in j["url"] and "?" not in j["url"]
        assert j["url"].startswith("https://jobs.examplebank.com/job/")


def test_jd_text_captured_and_stripped():
    jobs = w.fetch_successfactors_rmk(_session_returning(FIXTURE), CFG, COMPANY)
    # Job 601200717 has base64 img tag that should be stripped
    cloud_eng = next(j for j in jobs if j["job_id"] == "601200717")
    assert "Requisition ID: 256278" in cloud_eng["jd_text"]
    assert "<p>" not in cloud_eng["jd_text"] and "base64" not in cloud_eng["jd_text"]


def test_dedup_across_feeds():
    company = dict(COMPANY, feeds=["(risk)", "(analytics)"])  # same fixture served twice
    jobs = w.fetch_successfactors_rmk(_session_returning(FIXTURE), CFG, company)
    assert len(jobs) == 3  # duplicates by numeric id collapsed


def test_empty_feed():
    empty_rss = """<?xml version="1.0" encoding="UTF-8"?><rss version='2.0'>
    <channel><title>Empty Feed</title><link>https://jobs.examplebank.com</link>
    <description>Test</description></channel></rss>"""
    jobs = w.fetch_successfactors_rmk(_session_returning(empty_rss), CFG, COMPANY)
    assert len(jobs) == 0
