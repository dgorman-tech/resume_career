"""Career HQ FastAPI backend. Run: python -m uvicorn app.app:app --host 127.0.0.1 --port 8765"""

import json
import os
import re
import statistics
import threading
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import requests
from fastapi import FastAPI
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app import db as appdb
from app import facts as facts_mod
from app import scorer, jd_fetch
from app.envfile import load_dotenv

# a friend's scheduled task never inherits a shell `export`; a gitignored
# .env at the repo root covers GEMINI_API_KEY without touching OS settings.
# A real environment variable already set always wins (see app/envfile.py).
load_dotenv(appdb.REPO_ROOT / ".env")

CONFIG_PATH = appdb.REPO_ROOT / "watcher" / "config.json"


NOT_BUILT_HTML = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Career HQ — frontend not built</title>
<style>
  body { font: 15px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
         max-width: 40rem; margin: 4rem auto; padding: 0 1.5rem; color: #1a1a1a; }
  h1 { font-size: 1.25rem; margin-bottom: 0.25rem; }
  code, pre { font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  pre { background: #f2f2f0; border: 1px solid #ddd; border-radius: 6px;
        padding: 0.75rem 1rem; overflow-x: auto; }
  p { color: #333; }
</style>
</head>
<body>
<h1>The frontend hasn't been built yet</h1>
<p>Career HQ's API is running fine, but <code>web/dist</code> doesn't exist, so
there's no board to serve at this address. This is a one-time step after
cloning the repo (or after pulling frontend changes).</p>
<p>Run this from the repo root, then reload this page:</p>
<pre>cd web &amp;&amp; npm install &amp;&amp; npm run build</pre>
<p>See <code>SETUP.md</code> for the full setup guide.</p>
</body>
</html>
"""


@asynccontextmanager
async def _lifespan(app: FastAPI):
    # first-ever launch: no watcher/config.json yet. Copy the checked-in
    # example so the Settings tab and the watcher both have something to
    # read instead of leaving the friend staring at an empty, confusing UI.
    # Never overwrites a config that's already there.
    cfg_path = app.state.config_path
    if not cfg_path.exists():
        from app.settings import EXAMPLE_PATH
        if EXAMPLE_PATH.exists():
            cfg_path.write_text(EXAMPLE_PATH.read_text(encoding="utf-8"), encoding="utf-8")
            print(f"no watcher/config.json found — created one from config.example.json at {cfg_path}")
    yield

VALID_STATUSES = {"new", "interested", "dismissed", "applied"}
VALID_LEVELS = {"", "ic", "manager", "senior_manager", "director", "vp_plus"}
# follow-up dates are plain calendar days (no time zone): the board compares them
# against the user's local "today", so storing an instant would only mislead
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

BACKFILL_DELAY = 1.5
# slightly above the resume-upload cap so multipart framing overhead still fits
MAX_BODY_BYTES = 11 * 1024 * 1024
_backfill = {"running": False, "done": 0, "total": 0, "errors": 0}
_backfill_lock = threading.Lock()


class JobStatePatch(BaseModel):
    status: Optional[str] = None
    starred: Optional[bool] = None
    note: Optional[str] = None
    next_action_at: Optional[str] = None
    next_action_note: Optional[str] = None
    dismiss_reason: Optional[str] = None


class ProfileBody(BaseModel):
    resume_text: str
    rules_text: str
    comp_floor: Optional[int] = None
    comp_goal: Optional[int] = None
    currency: str = "CAD"
    max_office_days: Optional[int] = None
    location_text: str = ""
    min_level: str = ""


class DimensionBody(BaseModel):
    key: Optional[str] = None
    label: str
    description: str
    position: int
    archived: bool = False


class DimensionsPut(BaseModel):
    dimensions: list[DimensionBody]


class WeightsPut(BaseModel):
    weights: dict[str, int] = {}
    holistic_weight: Optional[int] = None


def ok(data):
    return {"ok": True, "data": data, "error": None}


def err(msg, status=400):
    return JSONResponse(status_code=status,
                        content={"ok": False, "data": None, "error": str(msg)})


FACT_KEYS = ("years_min", "level", "office_days", "remote_policy", "must_haves",
             "salary_min_jd", "salary_max_jd", "apply_deadline", "visa_or_clearance",
             "evidence", "confidence", "extracted_at")


def _facts_by_key(conn):
    """Facts are fetched in one pass and merged in Python rather than joined:
    job_facts and job_scores share column names, and aliasing every one of them
    into JOBS_SQL costs more clarity than the extra query costs time."""
    return {r["key"]: facts_mod.row_to_facts(r)
            for r in conn.execute("SELECT * FROM job_facts").fetchall()}


def _facts_payload(f):
    return {k: f.get(k) for k in FACT_KEYS} if f else None


def _row_to_job(row, internal, stale_after, job_facts=None, profile=None):
    d = dict(row)
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%SZ")
    scored_at = d.get("scored_at")
    return {
        "key": d["key"], "company": d["company"], "tier": d["tier"], "title": d["title"],
        "location": d["location"], "url": d["url"],
        "salary_min": d["salary_min"], "salary_max": d["salary_max"],
        # the verbatim string from the posting, carrying its own currency symbol
        # where the source states one; empty/absent for adapters that don't capture it
        "salary_raw": d.get("salary_raw") or None,
        "posted_at": d["posted_at"], "first_seen": d["first_seen"], "source": d["source"],
        "closed_at": d.get("closed_at"),
        "is_internal": (d["company"] or "").lower() in internal,
        "is_new": (d["first_seen"] or "") >= week_ago,
        "status": d.get("status") or "new",
        "starred": bool(d.get("starred") or 0),
        "note": d.get("note") or "",
        "next_action_at": d.get("next_action_at"),
        "next_action_note": d.get("next_action_note") or "",
        "dismiss_reason": d.get("dismiss_reason"),
        "fit": d.get("fit"),
        "subscores": json.loads(d["subscores"]) if d.get("subscores") else None,
        "why": d.get("why"), "gaps": d.get("gaps"), "angle": d.get("angle"),
        "lens": d.get("lens"), "scored_at": scored_at,
        "stale": bool(scored_at and stale_after and stale_after > scored_at),
        "has_deep_dive": bool(d.get("deep_dive_md")),
        "facts": _facts_payload(job_facts),
        # machines flag and demote; only the user dismisses
        "conflicts": facts_mod.find_conflicts(job_facts, profile) if (job_facts and profile) else [],
    }


def _stale_cutoff(conn):
    """Scores written before this instant no longer reflect the profile/rubric.
    None means nothing can be stale yet — the user has never saved either."""
    prof = conn.execute("SELECT updated_at, rubric_updated_at FROM profile WHERE id=1").fetchone()
    cutoffs = [t for t in ((prof["updated_at"], prof["rubric_updated_at"]) if prof else ()) if t]
    return max(cutoffs) if cutoffs else None


# Stale scores are only worth spending tokens on for roles the user actually
# cares about: a shortlist, not the whole board.
STALE_SHORTLIST_SQL = """
SELECT j.key FROM jobs j
JOIN job_state s ON s.key = j.key
JOIN job_scores sc ON sc.key = j.key
WHERE j.matched = 1 AND j.closed_at IS NULL
  AND (s.status IN ('interested','applied') OR s.starred = 1)
  AND sc.scored_at IS NOT NULL AND sc.scored_at < ?
ORDER BY sc.scored_at
"""


def _stale_shortlist_keys(conn, limit=None):
    cutoff = _stale_cutoff(conn)
    if cutoff is None:
        return []
    sql = STALE_SHORTLIST_SQL + (" LIMIT ?" if limit is not None else "")
    params = (cutoff, limit) if limit is not None else (cutoff,)
    return [r[0] for r in conn.execute(sql, params).fetchall()]


def _dimensions_payload(conn):
    dims = appdb.load_dimensions(conn, include_archived=True)
    for d in dims:
        d["archived"] = bool(d["archived"])
    prof = conn.execute("SELECT holistic_weight FROM profile WHERE id=1").fetchone()
    return {"dimensions": dims,
            "holistic_weight": prof["holistic_weight"] if prof else 50}


def _bump_rubric(conn):
    conn.execute("INSERT OR IGNORE INTO profile(id) VALUES (1)")
    conn.execute("UPDATE profile SET rubric_updated_at=? WHERE id=1", (appdb.now_iso(),))


JOBS_SQL = """
SELECT j.*, s.status, s.starred, s.note, s.next_action_at, s.next_action_note, s.dismiss_reason,
       sc.fit, sc.subscores, sc.why, sc.gaps, sc.angle, sc.lens, sc.scored_at, sc.deep_dive_md
FROM jobs j
LEFT JOIN job_state s ON s.key = j.key
LEFT JOIN job_scores sc ON sc.key = j.key
WHERE j.matched = 1
  AND (j.closed_at IS NULL OR s.status IN ('interested','applied'))
"""


def create_app(db_path=None, cfg=None, config_path=None):
    app = FastAPI(title="Career HQ", lifespan=_lifespan)
    # reject non-loopback Host headers so DNS rebinding can't reach the API
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost"])

    @app.middleware("http")
    async def limit_body_size(request, call_next):
        length = request.headers.get("content-length", "")
        if length.isdigit() and int(length) > MAX_BODY_BYTES:
            return err("request too large", 413)
        return await call_next(request)
    app.state.db_path = db_path
    app.state.cfg = cfg
    app.state.config_path = Path(config_path) if config_path else CONFIG_PATH

    def get_cfg():
        if app.state.cfg is not None:
            return app.state.cfg
        from app.settings import read_base_cfg
        return read_base_cfg(app.state.config_path)

    def get_conn():
        conn = appdb.get_conn(app.state.db_path)
        appdb.ensure_schema(conn)
        return conn

    app.state.get_conn = get_conn
    app.state.get_cfg = get_cfg
    app.state.session = requests.Session()
    app.state.session.headers.update({"User-Agent": "personal-job-watcher/1.0 career-hq"})

    @app.get("/api/jobs")
    def list_jobs():
        cfg_ = get_cfg()
        internal = [c.lower() for c in cfg_.get("app", {}).get("internal_companies", [])]
        conn = get_conn()
        try:
            stale_after = _stale_cutoff(conn)
            by_key = _facts_by_key(conn)
            prof = conn.execute(
                "SELECT max_office_days, min_level, comp_floor FROM profile WHERE id=1").fetchone()
            profile = dict(prof) if prof else None
            rows = conn.execute(JOBS_SQL).fetchall()
            return ok([_row_to_job(r, internal, stale_after, by_key.get(r["key"]), profile)
                       for r in rows])
        finally:
            conn.close()

    @app.get("/api/stats")
    def stats():
        conn = get_conn()
        try:
            week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%SZ")
            q = lambda sql, *p: conn.execute(sql, p).fetchone()[0]
            open_n = q("SELECT COUNT(*) FROM jobs WHERE matched=1 AND closed_at IS NULL")
            new_week = q("SELECT COUNT(*) FROM jobs WHERE matched=1 AND closed_at IS NULL AND first_seen >= ?", week_ago)
            unreviewed = q("""SELECT COUNT(*) FROM jobs j LEFT JOIN job_state s ON s.key=j.key
                              WHERE j.matched=1 AND j.closed_at IS NULL
                              AND (s.status IS NULL OR s.status='new')""")
            interested = q("""SELECT COUNT(*) FROM jobs j JOIN job_state s ON s.key=j.key
                              WHERE j.matched=1 AND j.closed_at IS NULL AND s.status='interested'""")
            mids = [ (r[0] + r[1]) / 2 for r in conn.execute(
                """SELECT salary_min, salary_max FROM jobs WHERE matched=1 AND closed_at IS NULL
                   AND tier=1 AND salary_min IS NOT NULL AND salary_max IS NOT NULL""").fetchall()]
            return ok({"open": open_n, "new_this_week": new_week, "unreviewed": unreviewed,
                       "interested": interested,
                       "median_t1_salary": statistics.median(mids) if mids else None})
        finally:
            conn.close()

    @app.get("/api/health")
    def health():
        cfg_ = get_cfg()
        appc = cfg_.get("app", {})
        conn = get_conn()
        try:
            last = conn.execute("SELECT ts, company, status FROM runs ORDER BY ts DESC LIMIT 1").fetchone()
            unscored = conn.execute(
                """SELECT COUNT(*) FROM jobs j LEFT JOIN job_scores s ON s.key=j.key
                   WHERE j.matched=1 AND j.closed_at IS NULL AND s.key IS NULL""").fetchone()[0]
            return ok({
                "key_present": bool(os.environ.get("GEMINI_API_KEY")),
                "batch_model": appc.get("batch_model", "gemini-flash-latest"),
                "deep_dive_model": appc.get("deep_dive_model", "gemini-pro-latest"),
                "batch_scoring": appc.get("batch_scoring", True),
                "last_run": dict(last) if last else None,
                "unscored": unscored,
                "stale_shortlisted": len(_stale_shortlist_keys(conn)),
                "missing_facts": conn.execute(
                    """SELECT COUNT(*) FROM jobs j LEFT JOIN job_facts f ON f.key=j.key
                       WHERE j.matched=1 AND j.closed_at IS NULL AND f.key IS NULL""").fetchone()[0],
            })
        finally:
            conn.close()

    @app.patch("/api/jobs/{key:path}")
    def patch_job(key: str, body: JobStatePatch):
        if body.status is not None and body.status not in VALID_STATUSES:
            return err(f"invalid status {body.status!r}", 400)
        if body.dismiss_reason and body.dismiss_reason not in appdb.DISMISS_REASONS:
            return err(f"invalid dismiss_reason {body.dismiss_reason!r}", 400)
        if body.next_action_at:
            if not DATE_RE.match(body.next_action_at):
                return err("next_action_at must be a YYYY-MM-DD date", 400)
            try:
                datetime.strptime(body.next_action_at, "%Y-%m-%d")
            except ValueError:
                return err(f"{body.next_action_at!r} is not a real date", 400)
        conn = get_conn()
        try:
            if conn.execute("SELECT 1 FROM jobs WHERE key=?", (key,)).fetchone() is None:
                return err("unknown job key", 404)
            conn.execute("INSERT OR IGNORE INTO job_state(key) VALUES (?)", (key,))
            sets, params = ["updated_at=?"], [appdb.now_iso()]
            if body.status is not None:
                sets.append("status=?"); params.append(body.status)
            # a reason explains a dismissal, so moving off dismissed retires it —
            # and that wins over any reason sent in the same request
            if body.status is not None and body.status != "dismissed":
                sets.append("dismiss_reason=NULL")
            elif body.dismiss_reason is not None:
                sets.append("dismiss_reason=?"); params.append(body.dismiss_reason or None)
            if body.starred is not None:
                sets.append("starred=?"); params.append(int(body.starred))
            if body.note is not None:
                sets.append("note=?"); params.append(body.note)
            # empty string clears the reminder; None means "leave it alone"
            if body.next_action_at is not None:
                sets.append("next_action_at=?"); params.append(body.next_action_at or None)
            if body.next_action_note is not None:
                sets.append("next_action_note=?"); params.append(body.next_action_note or None)
            params.append(key)
            conn.execute(f"UPDATE job_state SET {', '.join(sets)} WHERE key=?", params)
            conn.commit()
            row = conn.execute(
                """SELECT key, status, starred, note, next_action_at, next_action_note,
                          dismiss_reason FROM job_state WHERE key=?""", (key,)).fetchone()
            return ok({**dict(row), "starred": bool(row["starred"])})
        finally:
            conn.close()

    @app.get("/api/profile")
    def get_profile():
        conn = get_conn()
        try:
            row = conn.execute(
                """SELECT resume_text, rules_text, comp_floor, comp_goal, currency, max_office_days,
                          location_text, min_level, updated_at FROM profile WHERE id=1""").fetchone()
            return ok(dict(row) if row else {
                "resume_text": "", "rules_text": "", "comp_floor": None, "comp_goal": None,
                "currency": "CAD", "max_office_days": None, "location_text": "", "min_level": "",
                "updated_at": None})
        finally:
            conn.close()

    @app.put("/api/profile")
    def put_profile(body: ProfileBody):
        if body.min_level not in VALID_LEVELS:
            return err(f"invalid min_level {body.min_level!r}", 400)
        if body.max_office_days is not None and not (0 <= body.max_office_days <= 5):
            return err("max_office_days must be between 0 and 5", 400)
        currency = (body.currency or "CAD").strip().upper()
        if not re.fullmatch(r"[A-Z]{3}", currency):
            return err(f"invalid currency {body.currency!r}", 400)
        conn = get_conn()
        try:
            ts = appdb.now_iso()
            conn.execute(
                """INSERT INTO profile(id, resume_text, rules_text, comp_floor, comp_goal, currency,
                                        max_office_days, location_text, min_level, updated_at)
                   VALUES (1,?,?,?,?,?,?,?,?,?)
                   ON CONFLICT(id) DO UPDATE SET resume_text=excluded.resume_text,
                     rules_text=excluded.rules_text, comp_floor=excluded.comp_floor,
                     comp_goal=excluded.comp_goal, currency=excluded.currency,
                     max_office_days=excluded.max_office_days,
                     location_text=excluded.location_text, min_level=excluded.min_level,
                     updated_at=excluded.updated_at""",
                (body.resume_text, body.rules_text, body.comp_floor, body.comp_goal, currency,
                 body.max_office_days, body.location_text, body.min_level, ts))
            conn.commit()
            return ok({"resume_text": body.resume_text, "rules_text": body.rules_text,
                       "comp_floor": body.comp_floor, "comp_goal": body.comp_goal,
                       "currency": currency,
                       "max_office_days": body.max_office_days, "location_text": body.location_text,
                       "min_level": body.min_level, "updated_at": ts})
        finally:
            conn.close()

    @app.get("/api/dimensions")
    def get_dimensions():
        conn = get_conn()
        try:
            return ok(_dimensions_payload(conn))
        finally:
            conn.close()

    @app.put("/api/dimensions")
    def put_dimensions(body: DimensionsPut):
        conn = get_conn()
        try:
            existing = {d["key"]: d for d in appdb.load_dimensions(conn, include_archived=True)}
            keyed = [d for d in body.dimensions if d.key is not None]
            if len({d.key for d in keyed}) != len(keyed):
                return err("duplicate dimension keys in payload")
            unknown = [d.key for d in keyed if d.key not in existing]
            if unknown:
                return err(f"unknown dimension keys: {', '.join(unknown)}")
            missing = sorted(set(existing) - {d.key for d in keyed})
            if missing:
                return err("payload must include every existing dimension "
                           f"(missing: {', '.join(missing)}); archive instead of omitting")
            active = [d for d in body.dimensions if not d.archived]
            if not 1 <= len(active) <= 8:
                return err("must have between 1 and 8 active dimensions")
            labels = [d.label.strip() for d in active]
            if any(not 1 <= len(l) <= 40 for l in labels):
                return err("labels must be 1-40 characters")
            if len({l.lower() for l in labels}) != len(labels):
                return err("active dimension labels must be unique")
            if any(not d.description.strip() or len(d.description) > 500 for d in body.dimensions):
                return err("descriptions must be non-empty and at most 500 characters")

            rubric_changed = False
            keys = set(existing)
            for d in body.dimensions:
                if d.key is None:
                    key = appdb.slugify_label(d.label.strip(), keys)
                    keys.add(key)
                    conn.execute(
                        """INSERT INTO score_dimensions(key, label, description, weight, position, archived)
                           VALUES (?,?,?,10,?,?)""",
                        (key, d.label.strip(), d.description.strip(), d.position, int(d.archived)))
                    rubric_changed = True
                else:
                    old = existing[d.key]
                    text_changed = (d.label.strip() != old["label"]
                                    or d.description.strip() != old["description"])
                    if (text_changed and not d.archived) or bool(old["archived"]) != d.archived:
                        rubric_changed = True
                    conn.execute(
                        "UPDATE score_dimensions SET label=?, description=?, position=?, archived=? WHERE key=?",
                        (d.label.strip(), d.description.strip(), d.position, int(d.archived), d.key))
            if rubric_changed:
                _bump_rubric(conn)
            conn.commit()
            return ok(_dimensions_payload(conn))
        finally:
            conn.close()

    @app.put("/api/dimensions/weights")
    def put_weights(body: WeightsPut):
        conn = get_conn()
        try:
            dims = appdb.load_dimensions(conn)  # active only
            by_key = {d["key"]: d for d in dims}
            bad = sorted(set(body.weights) - set(by_key))
            if bad:
                return err(f"unknown or archived dimension keys: {', '.join(bad)}")
            candidates = list(body.weights.values())
            if body.holistic_weight is not None:
                candidates.append(body.holistic_weight)
            if any(not 0 <= v <= 100 for v in candidates):
                return err("weights must be integers 0-100")
            prof = conn.execute("SELECT holistic_weight FROM profile WHERE id=1").fetchone()
            holistic = (body.holistic_weight if body.holistic_weight is not None
                        else (prof["holistic_weight"] if prof else 50))
            final = {d["key"]: body.weights.get(d["key"], d["weight"]) for d in dims}
            if holistic + sum(final.values()) <= 0:
                return err("at least one weight must be greater than zero")
            for k, v in body.weights.items():
                conn.execute("UPDATE score_dimensions SET weight=? WHERE key=?", (v, k))
            if body.holistic_weight is not None:
                conn.execute("INSERT OR IGNORE INTO profile(id) VALUES (1)")
                conn.execute("UPDATE profile SET holistic_weight=? WHERE id=1",
                             (body.holistic_weight,))
            conn.commit()
            return ok(_dimensions_payload(conn))
        finally:
            conn.close()

    @app.post("/api/jobs/{key:path}/score")
    def score_now(key: str):
        conn = get_conn()
        try:
            d = scorer.score_job(conn, app.state.session, get_cfg(), key)
            return ok(d)
        except scorer.ScorerError as exc:
            return err(str(exc), 400)
        finally:
            conn.close()

    @app.post("/api/jobs/{key:path}/extract-facts")
    def extract_facts(key: str):
        conn = get_conn()
        try:
            return ok(facts_mod.extract_facts(conn, app.state.session, get_cfg(), key))
        except scorer.ScorerError as exc:
            return err(str(exc), 400)
        finally:
            conn.close()

    @app.post("/api/jobs/{key:path}/deep-dive")
    def deep_dive(key: str):
        conn = get_conn()
        try:
            gen = scorer.deep_dive_stream(conn, app.state.session, get_cfg(), key)
            first = next(gen)  # trigger ScorerError before committing to a stream
        except scorer.ScorerError as exc:
            conn.close()
            return err(str(exc), 400)
        except StopIteration:
            conn.close()
            return err("empty deep dive", 400)
        except Exception as exc:
            conn.close()
            return err(str(exc), 500)

        def relay():
            try:
                yield first
                yield from gen
            finally:
                conn.close()
        return StreamingResponse(relay(), media_type="text/plain; charset=utf-8")

    class BackfillBody(BaseModel):
        limit: int = 50

    def _run_backfill(keys, cfg_):
        import time as _t
        for k in keys:
            conn = get_conn()
            try:
                scorer.score_job(conn, app.state.session, cfg_, k)
            except Exception:
                with _backfill_lock:
                    _backfill["errors"] += 1
            finally:
                conn.close()
            with _backfill_lock:
                _backfill["done"] += 1
            _t.sleep(BACKFILL_DELAY)
        with _backfill_lock:
            _backfill["running"] = False

    def _start_backfill(select_keys):
        """Run `select_keys` against a fresh connection and score whatever it
        returns, one job at a time. Both scoring backfills share one slot."""
        with _backfill_lock:
            if _backfill["running"]:
                return err("a backfill is already running", 409)
            conn = get_conn()
            try:
                keys = select_keys(conn)
            finally:
                conn.close()
            _backfill.update({"running": bool(keys), "done": 0, "total": len(keys), "errors": 0})
        if keys:
            threading.Thread(target=_run_backfill, args=(keys, get_cfg()), daemon=True).start()
        return ok({"started": bool(keys), "total": len(keys)})

    @app.post("/api/score-unscored")
    def score_unscored(body: BackfillBody):
        return _start_backfill(lambda conn: [r[0] for r in conn.execute(
            """SELECT j.key FROM jobs j LEFT JOIN job_scores s ON s.key=j.key
               WHERE j.matched=1 AND j.closed_at IS NULL AND s.key IS NULL
               LIMIT ?""", (body.limit,)).fetchall()])

    @app.post("/api/rescore-stale")
    def rescore_stale(body: BackfillBody):
        """Repair scores the profile/rubric has outgrown. Deliberately bounded to
        the shortlist: re-scoring the whole board on every rubric tweak would
        spend tokens on roles the user has already scrolled past."""
        return _start_backfill(lambda conn: _stale_shortlist_keys(conn, body.limit))

    @app.get("/api/scoring-status")
    def scoring_status():
        with _backfill_lock:
            return ok(dict(_backfill))

    from app import extract as extract_api
    from app import settings as settings_api
    app.include_router(settings_api.router)
    app.include_router(extract_api.router)

    dist = appdb.REPO_ROOT / "web" / "dist"
    if dist.exists():
        app.mount("/", StaticFiles(directory=str(dist), html=True), name="spa")
    else:
        @app.get("/", include_in_schema=False)
        def _not_built():
            return HTMLResponse(NOT_BUILT_HTML)

    return app


app = create_app()
