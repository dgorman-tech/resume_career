"""Structured JD facts. The load-bearing rule: a fact whose quote cannot be
found in the job description is dropped, so a wrong extraction can never become
an opaque badge on the board."""

import json

import pytest
from unittest.mock import MagicMock

from app import facts, scorer

CFG = {"app": {"internal_companies": [], "facts_model": "test-flash"}, "companies": []}

JD = """About the role
We are hiring a Senior Manager, Data Platform in Toronto.
You will need 8+ years of experience building data platforms.
This role is hybrid: 2 days per week in the office.
Required: expert SQL, production Python, and dbt.
The salary range is $170,000 - $210,000 CAD.
Applications close on 2026-09-30.
Must be legally eligible to work in Canada.
"""


def fact(field, value, quote):
    return {"field": field, "value": value, "quote": quote}


def payload(*items, confidence=80):
    return json.dumps({"facts": list(items), "confidence": confidence})


# ----------------------------------------------------------------- validation

def test_reads_scalar_facts_with_their_evidence():
    d = facts.validate_facts(payload(
        fact("years_min", "8", "8+ years of experience"),
        fact("office_days", "2", "2 days per week in the office"),
        fact("remote_policy", "hybrid", "This role is hybrid"),
        fact("level", "senior_manager", "Senior Manager, Data Platform"),
    ), JD)

    assert d["years_min"] == 8 and d["office_days"] == 2
    assert d["remote_policy"] == "hybrid" and d["level"] == "senior_manager"
    assert d["evidence"]["years_min"] == "8+ years of experience"
    assert d["evidence"]["remote_policy"] == "This role is hybrid"


def test_drops_a_fact_whose_quote_is_not_in_the_jd():
    # the failure this whole design exists to prevent
    d = facts.validate_facts(payload(
        fact("office_days", "5", "5 days per week in the office"),
        fact("years_min", "8", "8+ years of experience"),
    ), JD)

    assert d["office_days"] is None and "office_days" not in d["evidence"]
    assert d["years_min"] == 8          # the honest fact beside it survives


def test_drops_a_fact_with_no_quote_at_all():
    d = facts.validate_facts(payload(fact("office_days", "2", "")), JD)
    assert d["office_days"] is None


def test_matches_a_quote_across_a_line_break():
    jd = "You will need 8+ years\nof experience building platforms."
    d = facts.validate_facts(payload(fact("years_min", "8", "8+ years of experience")), jd)
    assert d["years_min"] == 8


def test_matches_a_quote_that_differs_only_in_case():
    d = facts.validate_facts(payload(fact("remote_policy", "hybrid", "this role is HYBRID")), JD)
    assert d["remote_policy"] == "hybrid"


def test_collects_every_must_have_with_its_own_quote():
    d = facts.validate_facts(payload(
        fact("must_haves", "expert SQL", "Required: expert SQL"),
        fact("must_haves", "dbt", "production Python, and dbt"),
    ), JD)
    assert d["must_haves"] == ["expert SQL", "dbt"]
    assert d["evidence"]["must_haves"] == ["Required: expert SQL", "production Python, and dbt"]


def test_drops_only_the_unsupported_must_have():
    d = facts.validate_facts(payload(
        fact("must_haves", "expert SQL", "Required: expert SQL"),
        fact("must_haves", "Kubernetes", "deep Kubernetes experience"),
    ), JD)
    assert d["must_haves"] == ["expert SQL"]


def test_reads_a_salary_range_and_a_deadline():
    d = facts.validate_facts(payload(
        fact("salary_min_jd", "170000", "$170,000 - $210,000 CAD"),
        fact("salary_max_jd", "210000", "$170,000 - $210,000 CAD"),
        fact("apply_deadline", "2026-09-30", "Applications close on 2026-09-30"),
    ), JD)
    assert d["salary_min_jd"] == 170000 and d["salary_max_jd"] == 210000
    assert d["apply_deadline"] == "2026-09-30"


@pytest.mark.parametrize("field,value", [
    ("office_days", "9"),            # a week has five working days
    ("years_min", "-2"),
    ("years_min", "not a number"),
    ("remote_policy", "flexible"),   # outside the vocabulary
    ("level", "wizard"),
    ("salary_min_jd", "12"),         # not an annual salary
    ("apply_deadline", "next tuesday"),
    ("apply_deadline", "2026-13-45"),
])
def test_drops_values_that_cannot_be_true(field, value):
    quote = "8+ years of experience"      # a real quote, so only the value is at fault
    d = facts.validate_facts(payload(fact(field, value, quote)), JD)
    assert d[field] is None


def test_ignores_a_field_it_does_not_know():
    d = facts.validate_facts(payload(fact("vibe", "great", "8+ years of experience")), JD)
    assert "vibe" not in d


def test_clamps_confidence():
    assert facts.validate_facts(payload(confidence=140), JD)["confidence"] == 100
    assert facts.validate_facts(payload(confidence=-5), JD)["confidence"] == 0


def test_caps_the_number_of_must_haves():
    items = [fact("must_haves", f"skill {i}", "Required: expert SQL") for i in range(40)]
    d = facts.validate_facts(payload(*items), JD)
    assert len(d["must_haves"]) == facts.MAX_MUST_HAVES


def test_an_extraction_that_found_nothing_is_still_valid():
    d = facts.validate_facts(payload(), JD)
    assert d["must_haves"] == [] and d["years_min"] is None and d["evidence"] == {}


def test_malformed_json_raises():
    with pytest.raises(scorer.ScorerError):
        facts.validate_facts("not json {", JD)


def test_facts_not_a_list_raises():
    with pytest.raises(scorer.ScorerError):
        facts.validate_facts(json.dumps({"facts": "lots", "confidence": 50}), JD)


# ----------------------------------------------------------------- conflicts

def profile(**over):
    base = {"max_office_days": None, "min_level": "", "comp_floor": None}
    return {**base, **over}


def facts_row(**over):
    base = {"years_min": None, "level": None, "office_days": None, "remote_policy": None,
            "must_haves": [], "salary_min_jd": None, "salary_max_jd": None,
            "apply_deadline": None, "visa_or_clearance": None, "evidence": {}, "confidence": 0}
    return {**base, **over}


def test_no_conflicts_against_an_empty_profile():
    f = facts_row(office_days=5, level="ic", salary_max_jd=50000)
    assert facts.find_conflicts(f, profile()) == []


def test_flags_more_office_days_than_you_will_do():
    f = facts_row(office_days=4, evidence={"office_days": "4 days per week onsite"})
    [c] = facts.find_conflicts(f, profile(max_office_days=2))
    assert c["field"] == "office_days"
    assert c["quote"] == "4 days per week onsite"      # the badge can show its source
    assert "4" in c["message"] and "2" in c["message"]


def test_accepts_office_days_at_your_limit():
    assert facts.find_conflicts(facts_row(office_days=2), profile(max_office_days=2)) == []


def test_flags_a_level_below_your_floor():
    f = facts_row(level="manager", evidence={"level": "Manager, Analytics"})
    [c] = facts.find_conflicts(f, profile(min_level="senior_manager"))
    assert c["field"] == "level" and c["quote"] == "Manager, Analytics"


def test_accepts_a_level_above_your_floor():
    assert facts.find_conflicts(facts_row(level="director"), profile(min_level="senior_manager")) == []


def test_flags_a_range_whose_ceiling_is_under_your_floor():
    f = facts_row(salary_max_jd=150000, evidence={"salary_max_jd": "$130,000 - $150,000"})
    [c] = facts.find_conflicts(f, profile(comp_floor=170000))
    assert c["field"] == "salary_max_jd" and "150" in c["message"]


def test_accepts_a_range_that_reaches_your_floor():
    f = facts_row(salary_max_jd=180000)
    assert facts.find_conflicts(f, profile(comp_floor=170000)) == []


def test_reports_every_conflict_not_just_the_first():
    f = facts_row(office_days=5, level="ic", salary_max_jd=90000)
    found = facts.find_conflicts(f, profile(max_office_days=2, min_level="senior_manager",
                                            comp_floor=170000))
    assert {c["field"] for c in found} == {"office_days", "level", "salary_max_jd"}


def test_a_fact_that_was_never_extracted_cannot_conflict():
    assert facts.find_conflicts(facts_row(), profile(max_office_days=0, min_level="vp_plus",
                                                    comp_floor=500000)) == []


def test_row_to_facts_parses_the_json_columns():
    parsed = facts.row_to_facts({"must_haves": '["SQL"]', "evidence": '{"level": "q"}',
                                 "level": "manager"})
    assert parsed["must_haves"] == ["SQL"] and parsed["evidence"] == {"level": "q"}


def test_row_to_facts_survives_a_corrupt_json_column():
    parsed = facts.row_to_facts({"must_haves": "not json", "evidence": None})
    assert parsed["must_haves"] == [] and parsed["evidence"] == {}


# -------------------------------------------------------------- persistence

def _seed_profile(conn):
    conn.execute("INSERT INTO profile(id, resume_text, rules_text) VALUES (1,'R','X')")
    conn.commit()


def test_extract_facts_persists_with_provenance(tmp_db, monkeypatch):
    _seed_profile(tmp_db)
    monkeypatch.setattr("app.jd_fetch.get_jd", lambda *a, **k: JD)
    monkeypatch.setattr(scorer, "_call_llm", lambda *a, **k: payload(
        fact("office_days", "2", "2 days per week in the office"),
        fact("must_haves", "expert SQL", "Required: expert SQL")))

    facts.extract_facts(tmp_db, MagicMock(), CFG, "k1")

    row = tmp_db.execute("SELECT * FROM job_facts WHERE key='k1'").fetchone()
    assert row["office_days"] == 2
    assert json.loads(row["must_haves"]) == ["expert SQL"]
    assert json.loads(row["evidence"])["office_days"] == "2 days per week in the office"
    assert row["model"] == "test-flash" and row["prompt_version"] == facts.PROMPT_VERSION
    assert row["jd_hash"] and row["extracted_at"]


def test_a_malformed_response_writes_no_row_at_all(tmp_db, monkeypatch):
    monkeypatch.setattr("app.jd_fetch.get_jd", lambda *a, **k: JD)
    monkeypatch.setattr(scorer, "_call_llm", lambda *a, **k: "{ not json")

    with pytest.raises(scorer.ScorerError):
        facts.extract_facts(tmp_db, MagicMock(), CFG, "k1")

    assert tmp_db.execute("SELECT COUNT(*) FROM job_facts").fetchone()[0] == 0


def test_re_extraction_replaces_rather_than_duplicates(tmp_db, monkeypatch):
    monkeypatch.setattr("app.jd_fetch.get_jd", lambda *a, **k: JD)
    for days, quote in (("2", "2 days per week in the office"), ("2", "This role is hybrid")):
        monkeypatch.setattr(scorer, "_call_llm",
                            lambda *a, _q=quote, _d=days, **k: payload(fact("office_days", _d, _q)))
        facts.extract_facts(tmp_db, MagicMock(), CFG, "k1")
    assert tmp_db.execute("SELECT COUNT(*) FROM job_facts WHERE key='k1'").fetchone()[0] == 1


def test_extraction_without_a_job_description_refuses(tmp_db, monkeypatch):
    monkeypatch.setattr("app.jd_fetch.get_jd", lambda *a, **k: None)
    with pytest.raises(scorer.ScorerError, match="description"):
        facts.extract_facts(tmp_db, MagicMock(), CFG, "k1")


def test_unknown_job_refuses(tmp_db, monkeypatch):
    with pytest.raises(scorer.ScorerError):
        facts.extract_facts(tmp_db, MagicMock(), CFG, "nope")
