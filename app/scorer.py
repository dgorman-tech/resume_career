"""All Gemini calls for Career HQ. Batch scoring here; deep dive added in Task 9."""

import hashlib
import json
import os

from app import jd_fetch
from app.db import load_dimensions, now_iso


class ScorerError(Exception):
    pass


# Bump whenever build_batch_prompt changes shape, so a stored score can be told
# apart from one the current prompt would produce.
# batch/2: comp floor/goal are labelled with the profile's configured currency
# instead of a hardcoded CAD, and posted salary prefers the posting's verbatim
# salary_raw (or drops the currency label entirely) instead of mislabelling it.
PROMPT_VERSION = "batch/2"


def input_hash(text):
    """Short digest identifying an exact prompt input. Stored instead of the text
    itself: enough to prove two scores saw the same resume, without keeping a
    second copy of personal data in an append-only table."""
    if text is None:
        return None
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def profile_fingerprint(profile):
    """The candidate-side text that actually reaches the model."""
    return "\n".join([format_structured_facts(profile),
                      profile["rules_text"] or "", profile["resume_text"] or ""])


_EXTERNAL_PREAMBLE = """You are scoring an EXTERNAL job posting for this candidate. Score 0-100 overall (fit)
and per dimension (subscores):"""

_INTERNAL_PREAMBLE = """You are scoring an INTERNAL mobility posting at the candidate's current employer.
Ignore external comp floors; weigh step-up in level/scope, promotion path, and the leverage value
for an external negotiation (note leverage in "angle"). Score 0-100 overall (fit) and per
dimension (subscores), reading each dimension through this internal lens:"""

_CLOSING = "fit is your holistic judgment, not an average. Be blunt."


def build_rubric(dimensions, lens):
    preamble = _INTERNAL_PREAMBLE if lens == "internal" else _EXTERNAL_PREAMBLE
    bullets = "\n".join(f"- {d['key']}: {d['description']}" for d in dimensions)
    return f"{preamble}\n{bullets}\n{_CLOSING}"


def build_batch_schema(keys):
    return {
        "type": "object",
        "properties": {
            "fit": {"type": "integer"},
            "subscores": {
                "type": "object",
                "properties": {k: {"type": "integer"} for k in keys},
                "required": list(keys),
            },
            "why": {"type": "string"}, "gaps": {"type": "string"}, "angle": {"type": "string"},
        },
        "required": ["fit", "subscores", "why", "gaps", "angle"],
    }


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
    floor, goal = profile["comp_floor"], profile["comp_goal"]
    currency = profile["currency"] or "CAD"
    if floor or goal:
        lines.append(f"Comp: floor ${floor:,} {currency}, goal ${goal:,} {currency}" if floor and goal
                      else f"Comp floor: ${floor:,} {currency}" if floor else f"Comp goal: ${goal:,} {currency}")
    if profile["max_office_days"] is not None:
        lines.append(f"Max office days/week: {profile['max_office_days']}")
    if profile["location_text"]:
        lines.append(f"Location: {profile['location_text']}")
    if profile["min_level"]:
        lines.append(f"Minimum level: {_LEVEL_LABELS.get(profile['min_level'], profile['min_level'])}")
    return "\n".join(lines) or "(none set)"


def build_batch_prompt(profile, job, jd_text, lens, dimensions):
    rubric = build_rubric(dimensions, lens)
    # The posting's currency is the ATS's, not the candidate's configured currency,
    # so it must never borrow the candidate's currency label. salary_raw is the
    # verbatim string from the posting (e.g. "€70,000 - €90,000") and is preferred
    # whenever it's available; otherwise the bare numbers go in with no currency
    # label at all rather than a currency that might be wrong.
    salary = ""
    if job.get("salary_raw"):
        salary = f"Posted salary: {job['salary_raw']}\n"
    elif job.get("salary_min") or job.get("salary_max"):
        salary = f"Posted salary: {job.get('salary_min')} - {job.get('salary_max')}\n"
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


def _validate(raw, keys):
    try:
        d = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ScorerError(f"malformed score JSON: {exc}") from exc
    if (not isinstance(d, dict) or "fit" not in d or "subscores" not in d
            or not isinstance(d["subscores"], dict)):
        raise ScorerError("score JSON missing required keys")
    d["fit"] = _clamp(d["fit"])
    subs = d["subscores"]
    d["subscores"] = {k: _clamp(subs.get(k)) for k in keys}
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
    dims = load_dimensions(conn)
    keys = [x["key"] for x in dims]
    model = cfg.get("app", {}).get("batch_model", "gemini-flash-latest")
    d = _validate(
        _call_llm(cfg, model, build_batch_prompt(profile, job, jd_text, lens, dims),
                  build_batch_schema(keys)),
        keys)
    scored_at = now_iso()
    conn.execute(
        """INSERT INTO score_history(key, fit, subscores, why, gaps, angle, lens, model,
                                     prompt_version, profile_hash, rubric_hash, jd_hash, scored_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (key, d["fit"], json.dumps(d["subscores"]), d["why"], d["gaps"], d["angle"], lens, model,
         PROMPT_VERSION, input_hash(profile_fingerprint(profile)),
         input_hash(build_rubric(dims, lens)), input_hash(jd_text), scored_at))
    conn.execute(
        """INSERT INTO job_scores(key, fit, subscores, why, gaps, angle, lens, model, scored_at)
           VALUES (?,?,?,?,?,?,?,?,?)
           ON CONFLICT(key) DO UPDATE SET fit=excluded.fit, subscores=excluded.subscores,
             why=excluded.why, gaps=excluded.gaps, angle=excluded.angle, lens=excluded.lens,
             model=excluded.model, scored_at=excluded.scored_at""",
        (key, d["fit"], json.dumps(d["subscores"]), d["why"], d["gaps"], d["angle"],
         lens, model, scored_at))
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


def build_deep_dive_prompt(profile, job, jd_text, lens, batch_score, salary_evidence, dimensions):
    rubric = build_rubric(dimensions, lens)
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
    dims = load_dimensions(conn)
    score_row = conn.execute("SELECT fit, subscores, why, gaps, angle FROM job_scores WHERE key=?", (key,)).fetchone()
    batch_score = dict(score_row) if score_row and score_row["fit"] is not None else None
    evidence = [dict(r) for r in conn.execute(
        """SELECT title, salary_min, salary_max FROM jobs
           WHERE matched=1 AND closed_at IS NULL AND salary_min IS NOT NULL
             AND (company=? OR tier=?) AND key != ? LIMIT 12""",
        (job["company"], job["tier"], key)).fetchall()]
    model = cfg.get("app", {}).get("deep_dive_model", "gemini-pro-latest")
    prompt = build_deep_dive_prompt(profile, job, jd_text, lens, batch_score, evidence, dims)
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
