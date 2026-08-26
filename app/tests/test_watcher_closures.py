"""The 'nothing slips' join: postings the user has a stake in must announce
themselves when they close, instead of silently disappearing from the board."""

from unittest.mock import MagicMock

import watcher as w


def test_pipeline_closures_only_returns_jobs_you_acted_on(tmp_db):
    tmp_db.execute("INSERT INTO job_state(key, status) VALUES ('k1','applied')")
    tmp_db.execute("INSERT INTO job_state(key, status) VALUES ('k2','interested')")
    tmp_db.execute("INSERT INTO job_state(key, status) VALUES ('k3','dismissed')")
    tmp_db.commit()

    hits = w.pipeline_closures(tmp_db, ["k1", "k2", "k3"])

    assert [h["key"] for h in hits] == ["k1", "k2"]
    assert hits[0]["company"] == "Wealthsimple"
    assert hits[0]["status"] == "applied"
    assert hits[0]["title"] == "Manager, Analytics Engineering"


def test_pipeline_closures_ignores_untouched_jobs(tmp_db):
    # never triaged: closing is routine churn, not something that needs attention
    assert w.pipeline_closures(tmp_db, ["k1", "k2", "k3"]) == []


def test_pipeline_closures_with_no_closed_keys_makes_no_query(tmp_db):
    assert w.pipeline_closures(tmp_db, []) == []


def test_digest_lists_pipeline_closures_in_their_own_section(tmp_path, monkeypatch):
    monkeypatch.setattr(w, "BASE_DIR", tmp_path)
    hits = [{"key": "k1", "company": "Wealthsimple",
             "title": "Manager, Analytics Engineering", "status": "applied"}]

    w.write_digest({}, False, {}, {}, ["stats"], pipeline_closures=hits)

    digest = (tmp_path / "latest-digest.md").read_text(encoding="utf-8")
    assert "Needs attention" in digest
    assert "Wealthsimple" in digest and "Manager, Analytics Engineering" in digest
    assert "applied" in digest


def test_digest_omits_the_section_when_nothing_you_track_closed(tmp_path, monkeypatch):
    monkeypatch.setattr(w, "BASE_DIR", tmp_path)
    w.write_digest({}, False, {}, {}, ["stats"], pipeline_closures=[])
    assert "Needs attention" not in (tmp_path / "latest-digest.md").read_text(encoding="utf-8")


def test_ntfy_announces_a_closed_application_even_with_no_new_matches(monkeypatch):
    sent = {}
    monkeypatch.setattr(w.requests, "post",
                        lambda url, data=None, headers=None, timeout=None: sent.update(
                            {"data": data.decode("utf-8"),
                             "title": headers["Title"]}) or MagicMock())
    hits = [{"key": "k1", "company": "Wealthsimple",
             "title": "Manager, Analytics Engineering", "status": "applied"}]

    w.push_ntfy({"ntfy_topic": "topic-x"}, [], fits={}, pipeline_closures=hits)

    assert "Applied posting closed: Wealthsimple — Manager, Analytics Engineering" in sent["data"]


def test_ntfy_stays_silent_when_nothing_happened(monkeypatch):
    calls = []
    monkeypatch.setattr(w.requests, "post",
                        lambda *a, **k: calls.append(1) or MagicMock())
    w.push_ntfy({"ntfy_topic": "topic-x"}, [], fits={}, pipeline_closures=[])
    assert calls == []
