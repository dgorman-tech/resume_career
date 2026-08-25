import json

import pytest
from unittest.mock import MagicMock

from app import scorer
from app import db as appdb

CFG = {"app": {"internal_companies": ["ExampleBank"], "batch_model": "test-flash"},
       "companies": []}

GOOD = json.dumps({"fit": 92,
                   "subscores": {"comp": 95, "player_coach": 92, "cost_center": 90,
                                 "flex": 85, "level": 88},
                   "why": "Strong match.", "gaps": "No dbt.", "angle": "Lead with rigor."})


def _seed_profile(conn, rules_text="RULES TEXT"):
    conn.execute("INSERT INTO profile(id, resume_text, rules_text, updated_at) "
                 "VALUES (1, 'RESUME TEXT', ?, '2026-08-24T00:00:00Z')", (rules_text,))
    conn.commit()


def test_pick_lens():
    assert scorer.pick_lens("ExampleBank", CFG) == "internal"
    assert scorer.pick_lens("examplebank", CFG) == "internal"
    assert scorer.pick_lens("Wealthsimple", CFG) == "external"


def test_prompt_contains_profile_job_and_generated_rubric(tmp_db):
    # rules_text is a stand-in for the gitignored, DB-only comp/level rules a real profile
    # would hold; the seeded rubric must never embed a personal number, so this proves the
    # rules_text -> prompt path carries that data instead.
    _seed_profile(tmp_db, rules_text="RULES TEXT floor $170K CAD, goal $200K, Senior Manager level.")
    job = dict(tmp_db.execute("SELECT * FROM jobs WHERE key='k1'").fetchone())
    dims = appdb.load_dimensions(tmp_db)
    p = scorer.build_batch_prompt(scorer.load_profile(tmp_db), job, "JD BODY", "external", dims)
    for needle in ("RESUME TEXT", "RULES TEXT", "170", "Manager, Analytics Engineering",
                   "Wealthsimple", "JD BODY", "- comp:", "- player_coach:", "- level:"):
        assert needle in p
    assert "170" not in scorer.build_rubric(dims, "external")
    assert "170" not in scorer.build_rubric(dims, "internal")


def test_rubric_uses_active_dimensions_in_order(tmp_db):
    tmp_db.execute("UPDATE score_dimensions SET archived=1 WHERE key='flex'")
    tmp_db.execute(
        "INSERT INTO score_dimensions(key, label, description, weight, position) "
        "VALUES ('team_culture','Team culture','collaborative, low-ego team signals.',10,0)")
    tmp_db.commit()
    r = scorer.build_rubric(appdb.load_dimensions(tmp_db), "external")
    assert "- team_culture: collaborative, low-ego team signals." in r
    assert "flex" not in r
    assert r.index("team_culture") < r.index("- comp:")          # position 0 sorts first
    assert "EXTERNAL" in r and "holistic judgment" in r


def test_internal_rubric_is_preamble_plus_dimensions(tmp_db):
    r = scorer.build_rubric(appdb.load_dimensions(tmp_db), "internal")
    assert "INTERNAL mobility" in r and "Ignore" in r and "- comp:" in r


def test_batch_schema_requires_active_keys():
    s = scorer.build_batch_schema(["comp", "team_culture"])
    assert s["properties"]["subscores"]["required"] == ["comp", "team_culture"]
    assert set(s["properties"]["subscores"]["properties"]) == {"comp", "team_culture"}


def test_validate_dynamic_keys_and_drops_extras():
    raw = json.dumps({"fit": 80, "subscores": {"comp": 90, "stray": 10},
                      "why": "w", "gaps": "g", "angle": "a"})
    d = scorer._validate(raw, ["comp"])
    assert d["subscores"] == {"comp": 90}
    with pytest.raises(scorer.ScorerError):
        scorer._validate(raw, ["comp", "missing_dim"])


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
