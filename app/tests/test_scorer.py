import json

import pytest
from unittest.mock import MagicMock

from app import scorer
from app import db as appdb

CFG = {"app": {"internal_companies": ["ExampleBank"], "batch_model": "test-flash"},
       "companies": []}

GOOD = json.dumps({"fit": 92,
                   "subscores": {"comp": 95, "level": 92, "flex": 85,
                                 "domain": 90, "growth": 88},
                   "why": "Strong match.", "gaps": "No dbt.", "angle": "Lead with rigor."})


def _seed_profile(conn, rules_text="RULES TEXT", **structured):
    fields = {"comp_floor": None, "comp_goal": None, "currency": "CAD", "max_office_days": None,
              "location_text": "", "min_level": "", **structured}
    conn.execute(
        """INSERT INTO profile(id, resume_text, rules_text, comp_floor, comp_goal, currency,
                                max_office_days, location_text, min_level, updated_at)
           VALUES (1, 'RESUME TEXT', ?, ?, ?, ?, ?, ?, ?, '2026-08-24T00:00:00Z')""",
        (rules_text, fields["comp_floor"], fields["comp_goal"], fields["currency"],
         fields["max_office_days"], fields["location_text"], fields["min_level"]))
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
                   "Wealthsimple", "JD BODY", "- comp:", "- domain:", "- level:"):
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


def test_structured_facts_included_in_prompt(tmp_db):
    _seed_profile(tmp_db, comp_floor=170000, comp_goal=200000,
                  max_office_days=2, location_text="Toronto or Canada-remote",
                  min_level="senior_manager")
    job = dict(tmp_db.execute("SELECT * FROM jobs WHERE key='k1'").fetchone())
    dims = appdb.load_dimensions(tmp_db)
    p = scorer.build_batch_prompt(scorer.load_profile(tmp_db), job, "JD BODY", "external", dims)
    for needle in ("170,000", "200,000", "CAD", "Max office days/week: 2",
                   "Toronto or Canada-remote", "Senior Manager"):
        assert needle in p


def test_structured_facts_use_the_profiles_configured_currency(tmp_db):
    _seed_profile(tmp_db, comp_floor=70000, comp_goal=90000, currency="EUR")
    p = scorer.format_structured_facts(scorer.load_profile(tmp_db))
    assert "70,000 EUR" in p and "90,000 EUR" in p and "CAD" not in p


def test_posted_salary_prefers_the_verbatim_raw_string(tmp_db):
    _seed_profile(tmp_db)
    job = dict(tmp_db.execute("SELECT * FROM jobs WHERE key='k1'").fetchone())
    job["salary_raw"] = "€70,000 - €90,000"
    dims = appdb.load_dimensions(tmp_db)
    p = scorer.build_batch_prompt(scorer.load_profile(tmp_db), job, "JD BODY", "external", dims)
    assert "€70,000 - €90,000" in p


def test_posted_salary_omits_currency_when_the_raw_string_is_unavailable(tmp_db):
    _seed_profile(tmp_db)
    job = dict(tmp_db.execute("SELECT * FROM jobs WHERE key='k1'").fetchone())
    job["salary_raw"] = None
    dims = appdb.load_dimensions(tmp_db)
    p = scorer.build_batch_prompt(scorer.load_profile(tmp_db), job, "JD BODY", "external", dims)
    assert f"Posted salary: {job['salary_min']} - {job['salary_max']}\n" in p
    assert "CAD" not in p


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


def test_score_job_appends_history_with_provenance(tmp_db, monkeypatch):
    _seed_profile(tmp_db)
    monkeypatch.setattr(scorer, "_call_llm", lambda cfg, model, prompt, schema=None: GOOD)
    monkeypatch.setattr("app.jd_fetch.get_jd", lambda *a, **k: "JD BODY")

    scorer.score_job(tmp_db, MagicMock(), CFG, "k1")

    row = tmp_db.execute("SELECT * FROM score_history WHERE key='k1'").fetchone()
    assert row["fit"] == 92 and row["lens"] == "external" and row["model"] == "test-flash"
    assert row["prompt_version"] == scorer.PROMPT_VERSION
    # every input that could move the number is identified, without storing it
    assert row["profile_hash"] and row["rubric_hash"] and row["jd_hash"]
    assert "RESUME TEXT" not in str(dict(row))
    assert json.loads(row["subscores"])["comp"] == 95


def test_rescoring_keeps_the_earlier_history_rows(tmp_db, monkeypatch):
    _seed_profile(tmp_db)
    monkeypatch.setattr("app.jd_fetch.get_jd", lambda *a, **k: "JD BODY")
    for fit in (60, 90):
        payload = json.loads(GOOD); payload["fit"] = fit
        monkeypatch.setattr(scorer, "_call_llm", lambda *a, _p=payload, **k: json.dumps(_p))
        scorer.score_job(tmp_db, MagicMock(), CFG, "k1")

    assert [r[0] for r in tmp_db.execute(
        "SELECT fit FROM score_history WHERE key='k1' ORDER BY id").fetchall()] == [60, 90]
    # job_scores still holds only the latest
    assert tmp_db.execute("SELECT fit FROM job_scores WHERE key='k1'").fetchone()[0] == 90


def test_history_hashes_track_the_inputs_that_changed(tmp_db, monkeypatch):
    _seed_profile(tmp_db)
    monkeypatch.setattr(scorer, "_call_llm", lambda cfg, model, prompt, schema=None: GOOD)
    monkeypatch.setattr("app.jd_fetch.get_jd", lambda *a, **k: "JD BODY")
    scorer.score_job(tmp_db, MagicMock(), CFG, "k1")

    tmp_db.execute("UPDATE profile SET rules_text='DIFFERENT RULES' WHERE id=1")
    tmp_db.commit()
    scorer.score_job(tmp_db, MagicMock(), CFG, "k1")

    rows = tmp_db.execute(
        "SELECT profile_hash, rubric_hash, jd_hash FROM score_history WHERE key='k1' ORDER BY id").fetchall()
    assert rows[0]["profile_hash"] != rows[1]["profile_hash"]   # the rules moved
    assert rows[0]["rubric_hash"] == rows[1]["rubric_hash"]     # the rubric did not
    assert rows[0]["jd_hash"] == rows[1]["jd_hash"]             # nor the JD


def test_history_records_a_missing_jd_as_absent_not_empty(tmp_db, monkeypatch):
    _seed_profile(tmp_db)
    monkeypatch.setattr(scorer, "_call_llm", lambda cfg, model, prompt, schema=None: GOOD)
    monkeypatch.setattr("app.jd_fetch.get_jd", lambda *a, **k: None)
    scorer.score_job(tmp_db, MagicMock(), CFG, "k1")
    assert tmp_db.execute("SELECT jd_hash FROM score_history WHERE key='k1'").fetchone()[0] is None


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


def test_call_llm_rejects_unset_key(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    with pytest.raises(scorer.ScorerError, match="GEMINI_API_KEY"):
        scorer._call_llm(CFG, "test-flash", "prompt")


def test_call_llm_rejects_unfilled_placeholder_key(monkeypatch):
    # a fresh `scripts/setup.py` run copies .env.example verbatim, so right
    # after bootstrap GEMINI_API_KEY is genuinely set — to a value that will
    # never authenticate. This must fail the same plain way as no key at all,
    # not surface an opaque Gemini auth error on the first real call.
    monkeypatch.setenv("GEMINI_API_KEY", "your-gemini-api-key-here")
    with pytest.raises(scorer.ScorerError, match="GEMINI_API_KEY"):
        scorer._call_llm(CFG, "test-flash", "prompt")


def test_stream_llm_rejects_unfilled_placeholder_key(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "your-gemini-api-key-here")
    with pytest.raises(scorer.ScorerError, match="GEMINI_API_KEY"):
        next(scorer._stream_llm(CFG, "test-flash", "prompt"))
