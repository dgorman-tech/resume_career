import json

import pytest
from unittest.mock import MagicMock

from app import scorer

CFG = {"app": {"internal_companies": ["ExampleBank"], "batch_model": "test-flash"},
       "companies": []}

GOOD = json.dumps({"fit": 92,
                   "subscores": {"comp": 95, "player_coach": 92, "cost_center": 90,
                                 "flex": 85, "level": 88},
                   "why": "Strong match.", "gaps": "No dbt.", "angle": "Lead with rigor."})


def _seed_profile(conn, rules_text="RULES TEXT", **structured):
    fields = {"comp_floor_cad": None, "comp_goal_cad": None, "max_office_days": None,
              "location_text": "", "min_level": "", **structured}
    conn.execute(
        """INSERT INTO profile(id, resume_text, rules_text, comp_floor_cad, comp_goal_cad,
                                max_office_days, location_text, min_level, updated_at)
           VALUES (1, 'RESUME TEXT', ?, ?, ?, ?, ?, ?, '2026-08-24T00:00:00Z')""",
        (rules_text, fields["comp_floor_cad"], fields["comp_goal_cad"], fields["max_office_days"],
         fields["location_text"], fields["min_level"]))
    conn.commit()


def test_pick_lens():
    assert scorer.pick_lens("ExampleBank", CFG) == "internal"
    assert scorer.pick_lens("examplebank", CFG) == "internal"
    assert scorer.pick_lens("Wealthsimple", CFG) == "external"


def test_prompt_contains_profile_job_and_lens(tmp_db):
    # rules_text is a stand-in for the gitignored, DB-only comp/level rules a real profile
    # would hold; the rubric itself must never embed a real or fake personal number, so this
    # proves the rules_text -> prompt path carries that data instead.
    _seed_profile(tmp_db, rules_text="RULES TEXT floor $170K CAD, goal $200K, Senior Manager level.")
    job = dict(tmp_db.execute("SELECT * FROM jobs WHERE key='k1'").fetchone())
    p = scorer.build_batch_prompt(scorer.load_profile(tmp_db), job, "JD BODY", "external")
    for needle in ("RESUME TEXT", "RULES TEXT", "170", "Manager, Analytics Engineering",
                   "Wealthsimple", "JD BODY"):
        assert needle in p
    assert "170" not in scorer._EXTERNAL_RUBRIC and "170" not in scorer._INTERNAL_RUBRIC
    p_int = scorer.build_batch_prompt(scorer.load_profile(tmp_db), job, "JD BODY", "internal")
    assert "internal" in p_int.lower()


def test_structured_facts_included_in_prompt(tmp_db):
    _seed_profile(tmp_db, comp_floor_cad=170000, comp_goal_cad=200000,
                  max_office_days=2, location_text="Toronto or Canada-remote",
                  min_level="senior_manager")
    job = dict(tmp_db.execute("SELECT * FROM jobs WHERE key='k1'").fetchone())
    p = scorer.build_batch_prompt(scorer.load_profile(tmp_db), job, "JD BODY", "external")
    for needle in ("170,000", "200,000", "Max office days/week: 2",
                   "Toronto or Canada-remote", "Senior Manager"):
        assert needle in p


def test_structured_facts_absent_when_unset(tmp_db):
    _seed_profile(tmp_db)
    assert scorer.format_structured_facts(scorer.load_profile(tmp_db)) == "(none set)"


def test_score_job_persists(tmp_db, monkeypatch):
    _seed_profile(tmp_db)
    monkeypatch.setattr(scorer, "_call_llm", lambda cfg, model, prompt, schema=None: GOOD)
    monkeypatch.setattr("app.jd_fetch.get_jd", lambda *a, **k: "JD BODY")
    result = scorer.score_job(tmp_db, MagicMock(), CFG, "k1")
    assert result["fit"] == 92
    row = tmp_db.execute("SELECT * FROM job_scores WHERE key='k1'").fetchone()
    assert row["fit"] == 92 and row["lens"] == "external" and row["model"] == "test-flash"
    assert json.loads(row["subscores"])["comp"] == 95


def test_score_job_internal_lens(tmp_db, monkeypatch):
    _seed_profile(tmp_db)
    monkeypatch.setattr(scorer, "_call_llm", lambda cfg, model, prompt, schema=None: GOOD)
    monkeypatch.setattr("app.jd_fetch.get_jd", lambda *a, **k: "JD")
    scorer.score_job(tmp_db, MagicMock(), CFG, "k2")
    assert tmp_db.execute("SELECT lens FROM job_scores WHERE key='k2'").fetchone()["lens"] == "internal"


def test_malformed_json_raises(tmp_db, monkeypatch):
    _seed_profile(tmp_db)
    monkeypatch.setattr(scorer, "_call_llm", lambda *a, **k: "not json {")
    monkeypatch.setattr("app.jd_fetch.get_jd", lambda *a, **k: "JD")
    with pytest.raises(scorer.ScorerError):
        scorer.score_job(tmp_db, MagicMock(), CFG, "k1")


def test_missing_profile_raises(tmp_db, monkeypatch):
    monkeypatch.setattr(scorer, "_call_llm", lambda *a, **k: GOOD)
    with pytest.raises(scorer.ScorerError):
        scorer.score_job(tmp_db, MagicMock(), CFG, "k1")


def test_subscores_not_dict_raises(tmp_db, monkeypatch):
    _seed_profile(tmp_db)
    bad = json.dumps({"fit": 50, "subscores": "n/a", "why": "w", "gaps": "g", "angle": "a"})
    monkeypatch.setattr(scorer, "_call_llm", lambda *a, **k: bad)
    monkeypatch.setattr("app.jd_fetch.get_jd", lambda *a, **k: "JD")
    with pytest.raises(scorer.ScorerError):
        scorer.score_job(tmp_db, MagicMock(), CFG, "k1")


def test_out_of_range_fit_clamped(tmp_db, monkeypatch):
    _seed_profile(tmp_db)
    bad = json.loads(GOOD); bad["fit"] = 140
    monkeypatch.setattr(scorer, "_call_llm", lambda *a, **k: json.dumps(bad))
    monkeypatch.setattr("app.jd_fetch.get_jd", lambda *a, **k: "JD")
    assert scorer.score_job(tmp_db, MagicMock(), CFG, "k1")["fit"] == 100
