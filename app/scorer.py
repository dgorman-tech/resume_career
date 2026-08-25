"""All Gemini calls for Career HQ. Batch scoring here; deep dive added in Task 9."""

import json
import os

from app import jd_fetch
from app.db import now_iso


class ScorerError(Exception):
    pass


BATCH_SCHEMA = {
    "type": "object",
    "properties": {
        "fit": {"type": "integer"},
        "subscores": {
            "type": "object",
            "properties": {
                "comp": {"type": "integer"}, "player_coach": {"type": "integer"},
                "cost_center": {"type": "integer"}, "flex": {"type": "integer"},
                "level": {"type": "integer"},
            },
            "required": ["comp", "player_coach", "cost_center", "flex", "level"],
        },
        "why": {"type": "string"}, "gaps": {"type": "string"}, "angle": {"type": "string"},
    },
    "required": ["fit", "subscores", "why", "gaps", "angle"],
}

_EXTERNAL_RUBRIC = """You are scoring an EXTERNAL job posting for this candidate. Score 0-100 overall (fit)
and per dimension (subscores):
- comp: posted/likely compensation vs the comp criteria (floor and goal) described in CANDIDATE
  RULES below. If no range is posted, infer cautiously from title/company/market and say so in "why".
- player_coach: small team leadership WITH hands-on technical work (SQL/Python/BI). Pure
  people-management or pure IC scores low.
- cost_center: is the data/analytics work the PRODUCT (or a direct revenue driver) at this
  company, or internal overhead? Product = high.
- flex: trust-based flexibility (hybrid <=2 days office, or remote). Rigid full-time RTO = near 0.
- level: seniority and scope appropriate to the candidate's current level, as described in
  CANDIDATE RULES.
fit is your holistic judgment, not an average. Be blunt."""

_INTERNAL_RUBRIC = """You are scoring an INTERNAL mobility posting at the candidate's current employer
(internal lens). IGNORE the external comp floor. Score 0-100 overall (fit) and per dimension:
- comp: step-up potential vs the candidate's current banding, as described in CANDIDATE RULES
  (a clear step up in level/comp = high).
- player_coach: same definition as ever - small team + hands-on.
- cost_center: closeness to revenue/product vs pure overhead within the company.
- flex: flexibility signals of the team/role.
- level: promotion-level scope or a clear promotion path relative to the candidate's current
  level (see CANDIDATE RULES); lateral moves score mid unless the team/skills are exceptional.
  Weigh leverage value for an external negotiation in "angle"."""


def pick_lens(company, cfg):
    internals = [c.lower() for c in cfg.get("app", {}).get("internal_companies", [])]
    return "internal" if (company or "").lower() in internals else "external"


def load_profile(conn):
    row = conn.execute("SELECT * FROM profile WHERE id=1").fetchone()
    if row is None or not (row["resume_text"] or "").strip():
        return None
    return row


_LEVEL_LABELS = {
    "ic": "Individual contributor", "manager": "Manager", "senior_manager": "Senior Manager",
    "director": "Director", "vp_plus": "VP or above",
}


def format_structured_facts(profile):
    """Render the profile's structured (non-free-text) fields as labeled facts for the prompt."""
    lines = []
    floor, goal = profile["comp_floor_cad"], profile["comp_goal_cad"]
    if floor or goal:
        lines.append(f"Comp: floor ${floor:,} CAD, goal ${goal:,} CAD" if floor and goal
                      else f"Comp floor: ${floor:,} CAD" if floor else f"Comp goal: ${goal:,} CAD")
    if profile["max_office_days"] is not None:
        lines.append(f"Max office days/week: {profile['max_office_days']}")
    if profile["location_text"]:
        lines.append(f"Location: {profile['location_text']}")
    if profile["min_level"]:
        lines.append(f"Minimum level: {_LEVEL_LABELS.get(profile['min_level'], profile['min_level'])}")
    return "\n".join(lines) or "(none set)"


def build_batch_prompt(profile, job, jd_text, lens):
    rubric = _INTERNAL_RUBRIC if lens == "internal" else _EXTERNAL_RUBRIC
    salary = ""
    if job.get("salary_min") or job.get("salary_max"):
        salary = f"Posted salary: {job.get('salary_min')} - {job.get('salary_max')} CAD\n"
    return (
        f"{rubric}\n\n## CANDIDATE FACTS\n{format_structured_facts(profile)}\n\n"
        f"## CANDIDATE RULES\n{profile['rules_text']}\n\n"
        f"## CANDIDATE RESUME\n{profile['resume_text']}\n\n"
        f"## JOB\nCompany: {job['company']} (tier {job.get('tier')})\n"
        f"Title: {job['title']}\nLocation: {job.get('location', '')}\n{salary}"
        f"Posted: {job.get('posted_at', '')}\n\n"
        f"## JOB DESCRIPTION\n{jd_text or '(no description available - score from title/company/location and lower confidence)'}\n\n"
        "Return ONLY the JSON object."
    )


def _call_llm(cfg, model, prompt, schema=None):
    """Sole non-streaming touchpoint with google-genai. Fix SDK drift here only."""
    if not os.environ.get("GEMINI_API_KEY"):
        raise ScorerError("GEMINI_API_KEY is not set")
    from google import genai
    from google.genai import types
    client = genai.Client()
    config = types.GenerateContentConfig(temperature=0.2)
    if schema is not None:
        config = types.GenerateContentConfig(
            temperature=0.2, response_mime_type="application/json", response_schema=schema)
    try:
        resp = client.models.generate_content(model=model, contents=prompt, config=config)
    except Exception as exc:
        raise ScorerError(f"gemini call failed: {exc}") from exc
    if not getattr(resp, "text", None):
        raise ScorerError("gemini returned empty response")
    return resp.text


def _clamp(v):
    try:
        return max(0, min(100, int(v)))
    except (TypeError, ValueError):
        raise ScorerError(f"non-integer score value: {v!r}")


def _validate(raw):
    try:
        d = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ScorerError(f"malformed score JSON: {exc}") from exc
    if (not isinstance(d, dict) or "fit" not in d or "subscores" not in d
            or not isinstance(d["subscores"], dict)):
        raise ScorerError("score JSON missing required keys")
    d["fit"] = _clamp(d["fit"])
    subs = d["subscores"]
    for k in ("comp", "player_coach", "cost_center", "flex", "level"):
        subs[k] = _clamp(subs.get(k))
    for k in ("why", "gaps", "angle"):
        d[k] = str(d.get(k, ""))[:600]
    return d


def score_job(conn, session, cfg, key, inline_jd=None):
    profile = load_profile(conn)
    if profile is None:
        raise ScorerError("profile is empty - fill it in the Profile screen first")
    job_row = conn.execute("SELECT * FROM jobs WHERE key=?", (key,)).fetchone()
    if job_row is None:
        raise ScorerError(f"unknown job key {key}")
    job = dict(job_row)
    jd_text = jd_fetch.get_jd(conn, session, cfg, key, inline_jd=inline_jd)
    lens = pick_lens(job["company"], cfg)
    model = cfg.get("app", {}).get("batch_model", "gemini-flash-latest")
    d = _validate(_call_llm(cfg, model, build_batch_prompt(profile, job, jd_text, lens), BATCH_SCHEMA))
    conn.execute(
        """INSERT INTO job_scores(key, fit, subscores, why, gaps, angle, lens, model, scored_at)
           VALUES (?,?,?,?,?,?,?,?,?)
           ON CONFLICT(key) DO UPDATE SET fit=excluded.fit, subscores=excluded.subscores,
             why=excluded.why, gaps=excluded.gaps, angle=excluded.angle, lens=excluded.lens,
             model=excluded.model, scored_at=excluded.scored_at""",
        (key, d["fit"], json.dumps(d["subscores"]), d["why"], d["gaps"], d["angle"],
         lens, model, now_iso()))
    conn.commit()
    return d


_DEEP_DIVE_INSTRUCTIONS = """Write a deep-dive assessment of this job for the candidate, in markdown,
with EXACTLY these sections:
# Verdict
# Comp analysis
# Gap plan
# Application angle
# Questions to ask them
# Red flags
Rules: comp analysis must compare against the candidate's targets AND the salary evidence table.
For internal-lens jobs, comp analysis is about level/step-up and leverage for external negotiation.
Be specific and blunt; no filler; cite concrete resume lines when arguing fit."""


def build_deep_dive_prompt(profile, job, jd_text, lens, batch_score, salary_evidence):
    rubric = _INTERNAL_RUBRIC if lens == "internal" else _EXTERNAL_RUBRIC
    prior = json.dumps(batch_score) if batch_score else "(not yet batch-scored)"
    evidence = "\n".join(
        f"- {e['title']}: {e['salary_min']}-{e['salary_max']}" for e in salary_evidence) or "(none)"
    return (
        f"{_DEEP_DIVE_INSTRUCTIONS}\n\nLens context:\n{rubric}\n\n"
        f"## CANDIDATE FACTS\n{format_structured_facts(profile)}\n\n"
        f"## CANDIDATE RULES\n{profile['rules_text']}\n\n## CANDIDATE RESUME\n{profile['resume_text']}\n\n"
        f"## JOB\nCompany: {job['company']} (tier {job.get('tier')})\nTitle: {job['title']}\n"
        f"Location: {job.get('location','')}\nPosted salary: {job.get('salary_min')}-{job.get('salary_max')}\n\n"
        f"## JOB DESCRIPTION\n{jd_text or '(unavailable)'}\n\n"
        f"## PRIOR BATCH SCORE\n{prior}\n\n## SALARY EVIDENCE (same company/tier, from the watcher DB)\n{evidence}\n"
    )


def _stream_llm(cfg, model, prompt):
    """Sole streaming touchpoint with google-genai. Fix SDK drift here only."""
    if not os.environ.get("GEMINI_API_KEY"):
        raise ScorerError("GEMINI_API_KEY is not set")
    from google import genai
    from google.genai import types
    client = genai.Client()
    try:
        for chunk in client.models.generate_content_stream(
                model=model, contents=prompt,
                config=types.GenerateContentConfig(temperature=0.4)):
            if getattr(chunk, "text", None):
                yield chunk.text
    except Exception as exc:
        raise ScorerError(f"gemini stream failed: {exc}") from exc


def deep_dive_stream(conn, session, cfg, key):
    profile = load_profile(conn)
    if profile is None:
        raise ScorerError("profile is empty - fill it in the Profile screen first")
    job_row = conn.execute("SELECT * FROM jobs WHERE key=?", (key,)).fetchone()
    if job_row is None:
        raise ScorerError(f"unknown job key {key}")
    job = dict(job_row)
    jd_text = jd_fetch.get_jd(conn, session, cfg, key)
    lens = pick_lens(job["company"], cfg)
    score_row = conn.execute("SELECT fit, subscores, why, gaps, angle FROM job_scores WHERE key=?", (key,)).fetchone()
    batch_score = dict(score_row) if score_row and score_row["fit"] is not None else None
    evidence = [dict(r) for r in conn.execute(
        """SELECT title, salary_min, salary_max FROM jobs
           WHERE matched=1 AND closed_at IS NULL AND salary_min IS NOT NULL
             AND (company=? OR tier=?) AND key != ? LIMIT 12""",
        (job["company"], job["tier"], key)).fetchall()]
    model = cfg.get("app", {}).get("deep_dive_model", "gemini-pro-latest")
    prompt = build_deep_dive_prompt(profile, job, jd_text, lens, batch_score, evidence)
    parts = []
    for chunk in _stream_llm(cfg, model, prompt):
        parts.append(chunk)
        yield chunk
    conn.execute(
        """INSERT INTO job_scores(key, deep_dive_md, deep_dive_model, deep_dive_at)
           VALUES (?,?,?,?)
           ON CONFLICT(key) DO UPDATE SET deep_dive_md=excluded.deep_dive_md,
             deep_dive_model=excluded.deep_dive_model, deep_dive_at=excluded.deep_dive_at""",
        (key, "".join(parts), model, now_iso()))
    conn.commit()
