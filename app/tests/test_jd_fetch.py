from unittest.mock import MagicMock

from app import jd_fetch

CFG = {"companies": [
    {"name": "Wealthsimple", "adapter": "ashby", "slug": "wealthsimple", "tier": 1},
    {"name": "Scotiabank", "adapter": "successfactors_rmk", "host": "jobs.scotiabank.com", "tier": 2},
]}


def test_strip_html():
    out = jd_fetch.strip_html("<p>Hello <strong>world</strong></p><img src='x'><li>item</li>")
    assert "Hello world" in out and "item" in out
    assert "<" not in out


def test_inline_jd_cached_and_returned(tmp_db):
    got = jd_fetch.get_jd(tmp_db, MagicMock(), CFG, "k2", inline_jd="Requisition text here")
    assert got == "Requisition text here"
    row = tmp_db.execute("SELECT jd_text FROM jd_cache WHERE key='k2'").fetchone()
    assert row["jd_text"] == "Requisition text here"


def test_cache_hit_skips_network(tmp_db):
    tmp_db.execute("INSERT INTO jd_cache(key, jd_text, fetched_at) VALUES ('k1','cached JD','x')")
    session = MagicMock()
    assert jd_fetch.get_jd(tmp_db, session, CFG, "k1") == "cached JD"
    session.request.assert_not_called()


def test_ashby_fetch_parses_and_trims(tmp_db, monkeypatch):
    long_html = "<p>" + ("word " * 4000) + "</p>"  # ~20k chars -> must trim to 8000
    payload = {"jobs": [{"id": "j1", "descriptionHtml": long_html}]}
    resp = MagicMock(status_code=200)
    resp.json.return_value = payload
    session = MagicMock()
    session.request.return_value = resp
    got = jd_fetch.get_jd(tmp_db, session, CFG, "k1")
    assert got is not None and len(got) <= jd_fetch.JD_TRIM
    assert "word" in got


def test_unknown_source_returns_none(tmp_db):
    # k2 is successfactors_rmk with no inline JD and no cache -> None, no crash
    assert jd_fetch.get_jd(tmp_db, MagicMock(), CFG, "k2") is None
