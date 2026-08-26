"""Structured facts read out of a job description by one cheap LLM pass.

Everything here exists to make a wrong extraction harmless. The model is asked
for a (field, value, quote) triple per fact rather than a filled-in form, and
every quote is checked against the cached JD before the value is kept. A fact
whose quote is not in the JD is dropped, so a hallucinated "5 days in office"
badge cannot appear next to a remote role. Values are then bounded the way
scores are clamped: a value that cannot be true is discarded, not stored.
"""

import json
import re
from datetime import datetime

from app import jd_fetch, scorer
from app.db import now_iso

# Bump when the extraction prompt changes shape.
PROMPT_VERSION = "facts/1"

MAX_FACTS = 60          # cap the array before iterating anything the model sent
MAX_MUST_HAVES = 12
MAX_MUST_HAVE_LEN = 120
MAX_QUOTE_LEN = 300

REMOTE_POLICIES = ("remote", "hybrid", "onsite")
# same vocabulary as the profile's min_level, so conflicts compare like with like
LEVELS = ("ic", "manager", "senior_manager", "director", "vp_plus")

# annual-salary sanity bounds, matching the watcher's own salary parsing
SALARY_MIN, SALARY_MAX = 20000.0, 1000000.0
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

MUST_HAVES = "must_haves"


def _norm(text):
    """Collapse whitespace and case so a quote spanning a line break still
    matches. Deliberately not a looser match: the point is to prove the phrase
    came from the JD, not to guess what the model meant."""
    return re.sub(r"\s+", " ", (text or "")).strip().lower()


def _int_in(lo, hi):
    def coerce(raw):
        value = int(str(raw).strip())
        return value if lo <= value <= hi else None
    return coerce


def _one_of(allowed):
    def coerce(raw):
        value = str(raw).strip().lower()
        return value if value in allowed else None
    return coerce


def _salary(raw):
    value = float(str(raw).replace(",", "").replace("$", "").strip())
    return value if SALARY_MIN <= value <= SALARY_MAX else None


def _iso_date(raw):
    value = str(raw).strip()
    if not DATE_RE.match(value):
        return None
    try:
        datetime.strptime(value, "%Y-%m-%d")
    except ValueError:
        return None
    return value


def _text(limit):
    def coerce(raw):
        value = str(raw).strip()[:limit]
        return value or None
    return coerce


# field -> coercion. A coercion returning None (or raising) drops the fact.
SCALAR_FIELDS = {
    "years_min": _int_in(0, 50),
    "level": _one_of(LEVELS),
    "office_days": _int_in(0, 5),
    "remote_policy": _one_of(REMOTE_POLICIES),
    "salary_min_jd": _salary,
    "salary_max_jd": _salary,
    "apply_deadline": _iso_date,
    "visa_or_clearance": _text(200),
}

_INSTRUCTIONS = f"""Read the job description below and report only facts it states outright.

Return a list of facts. Each fact has:
- "field": one of {", ".join(sorted(SCALAR_FIELDS))}, or "{MUST_HAVES}" for a hard requirement
- "value": the value, as a string
- "quote": the exact sentence or phrase from the job description that states it

Rules:
- Copy the quote verbatim from the job description. A fact whose quote is not
  found in the text is discarded, so never paraphrase or invent one.
- Omit any field the description does not state. Do not guess.
- level must be one of: {", ".join(LEVELS)}
- remote_policy must be one of: {", ".join(REMOTE_POLICIES)}
- office_days is days per week in an office, 0-5
- salaries are annual figures in the posting's currency, digits only
- apply_deadline is YYYY-MM-DD
- confidence is 0-100: how clearly the description stated these facts."""

FACTS_SCHEMA = {
    "type": "object",
    "properties": {
        "facts": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "field": {"type": "string"},
                    "value": {"type": "string"},
                    "quote": {"type": "string"},
                },
                "required": ["field", "value", "quote"],
            },
        },
        "confidence": {"type": "integer"},
    },
    "required": ["facts", "confidence"],
}


def build_facts_prompt(job, jd_text):
    return (f"{_INSTRUCTIONS}\n\n## JOB\nCompany: {job['company']}\nTitle: {job['title']}\n"
            f"Location: {job.get('location', '')}\n\n## JOB DESCRIPTION\n{jd_text}\n\n"
            "Return ONLY the JSON object.")


def _empty():
    return {**{f: None for f in SCALAR_FIELDS}, MUST_HAVES: [], "evidence": {}, "confidence": 0}


def validate_facts(raw, jd_text):
    """Coerce and evidence-check a raw model response. Raises ScorerError only
    when the response is unusable as a whole; individual bad facts are dropped."""
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise scorer.ScorerError(f"malformed facts JSON: {exc}") from exc
    if not isinstance(payload, dict) or not isinstance(payload.get("facts"), list):
        raise scorer.ScorerError("facts JSON missing a facts array")

    haystack = _norm(jd_text)
    out = _empty()
    out["confidence"] = scorer._clamp(payload.get("confidence", 0))
    must_have_quotes = []

    for item in payload["facts"][:MAX_FACTS]:
        if not isinstance(item, dict):
            continue
        field = str(item.get("field", "")).strip()
        quote = str(item.get("quote", "")).strip()[:MAX_QUOTE_LEN]
        # the gate: no quote, or a quote that is not in the JD, means no fact
        if not quote or _norm(quote) not in haystack:
            continue

        if field == MUST_HAVES:
            if len(out[MUST_HAVES]) >= MAX_MUST_HAVES:
                continue
            value = _text(MAX_MUST_HAVE_LEN)(item.get("value"))
            if value:
                out[MUST_HAVES].append(value)
                must_have_quotes.append(quote)
            continue

        coerce = SCALAR_FIELDS.get(field)
        if coerce is None or out[field] is not None:   # unknown, or already filled
            continue
        try:
            value = coerce(item.get("value"))
        except (TypeError, ValueError):
            continue
        if value is not None:
            out[field] = value
            out["evidence"][field] = quote

    if must_have_quotes:
        out["evidence"][MUST_HAVES] = must_have_quotes
    return out


def _load_json(raw, fallback):
    if not raw:
        return fallback
    try:
        value = json.loads(raw)
    except (TypeError, ValueError, json.JSONDecodeError):
        return fallback
    return value if isinstance(value, type(fallback)) else fallback


def row_to_facts(row):
    """A job_facts row with its JSON columns parsed. A corrupt column degrades to
    empty rather than taking the whole board down."""
    d = dict(row)
    d[MUST_HAVES] = _load_json(d.get(MUST_HAVES), [])
    d["evidence"] = _load_json(d.get("evidence"), {})
    return d


def find_conflicts(f, profile):
    """Where the JD contradicts a hard requirement. Pure comparison, no model:
    these only ever demote and warn — dismissing stays the user's call."""
    out = []
    evidence = f.get("evidence") or {}

    def add(field, message):
        out.append({"field": field, "message": message, "quote": evidence.get(field)})

    max_days, days = profile.get("max_office_days"), f.get("office_days")
    if max_days is not None and days is not None and days > max_days:
        add("office_days", f"{days} office days/week vs your limit of {max_days}")

    floor_level, level = profile.get("min_level") or "", f.get("level")
    if floor_level in LEVELS and level in LEVELS and LEVELS.index(level) < LEVELS.index(floor_level):
        add("level", f"posted at {level.replace('_', ' ')}, "
                     f"below your {floor_level.replace('_', ' ')} floor")

    floor, top = profile.get("comp_floor"), f.get("salary_max_jd")
    if floor and top is not None and top < floor:
        add("salary_max_jd", f"tops out at ${top:,.0f} vs your ${floor:,.0f} floor")

    return out


def extract_facts(conn, session, cfg, key, inline_jd=None):
    job_row = conn.execute("SELECT * FROM jobs WHERE key=?", (key,)).fetchone()
    if job_row is None:
        raise scorer.ScorerError(f"unknown job key {key}")
    job = dict(job_row)
    jd_text = jd_fetch.get_jd(conn, session, cfg, key, inline_jd=inline_jd)
    if not jd_text:
        raise scorer.ScorerError("no job description available to extract facts from")

    model = cfg.get("app", {}).get("facts_model", "gemini-flash-latest")
    d = validate_facts(
        scorer._call_llm(cfg, model, build_facts_prompt(job, jd_text), FACTS_SCHEMA), jd_text)

    conn.execute(
        """INSERT INTO job_facts(key, years_min, level, office_days, remote_policy, must_haves,
                                 salary_min_jd, salary_max_jd, apply_deadline, visa_or_clearance,
                                 evidence, confidence, model, prompt_version, jd_hash, extracted_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(key) DO UPDATE SET
             years_min=excluded.years_min, level=excluded.level, office_days=excluded.office_days,
             remote_policy=excluded.remote_policy, must_haves=excluded.must_haves,
             salary_min_jd=excluded.salary_min_jd, salary_max_jd=excluded.salary_max_jd,
             apply_deadline=excluded.apply_deadline, visa_or_clearance=excluded.visa_or_clearance,
             evidence=excluded.evidence, confidence=excluded.confidence, model=excluded.model,
             prompt_version=excluded.prompt_version, jd_hash=excluded.jd_hash,
             extracted_at=excluded.extracted_at""",
        (key, d["years_min"], d["level"], d["office_days"], d["remote_policy"],
         json.dumps(d[MUST_HAVES]), d["salary_min_jd"], d["salary_max_jd"], d["apply_deadline"],
         d["visa_or_clearance"], json.dumps(d["evidence"]), d["confidence"], model,
         PROMPT_VERSION, scorer.input_hash(jd_text), now_iso()))
    conn.commit()
    return d
