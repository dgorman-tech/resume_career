# -*- coding: utf-8 -*-
"""Personal job watcher: polls public ATS JSON endpoints for a curated company
watchlist, diffs against SQLite, writes a markdown digest, optionally pushes
new matches to ntfy.sh.

Surfaces postings only — never applies, never automates any account.
Run:  python watcher.py            (normal poll)
      python watcher.py --dry-run  (poll + print, no DB writes, no ntfy)
"""

import html
import json
import re
import sqlite3
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

BASE_DIR = Path(__file__).resolve().parent
CONFIG_PATH = BASE_DIR / "config.json"
CONFIG_EXAMPLE_PATH = BASE_DIR / "config.example.json"
LOG_PATH = BASE_DIR / "watcher.log"
LOG_MAX_LINES = 2000
NTFY_MAX_TITLES = 6
SCORE_RETRY_CAP = 30
FACTS_RETRY_CAP = 30

# a scheduled task never inherits a shell `export` — the repo's own
# troubleshooting notes call this out as the #1 reason scoring silently
# fails on unattended runs. A gitignored .env at the repo root covers
# GEMINI_API_KEY without touching OS-level settings. A real environment
# variable already set always wins (see app/envfile.py for the loader).
try:
    sys.path.insert(0, str(BASE_DIR.parent))
    from app.envfile import load_dotenv as _load_dotenv
    _load_dotenv(BASE_DIR.parent / ".env")
except ImportError:
    pass


# ---------------------------------------------------------------- utilities

def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def today_local():
    return datetime.now().strftime("%Y-%m-%d")


def log(msg):
    line = f"{now_iso()} {msg}"
    print(line)
    try:
        prior = LOG_PATH.read_text(encoding="utf-8").splitlines() if LOG_PATH.exists() else []
        trimmed = prior[-(LOG_MAX_LINES - 1):]
        LOG_PATH.write_text("\n".join(trimmed + [line]) + "\n", encoding="utf-8")
    except OSError:
        pass


def load_config():
    # first-ever run on a fresh clone: no config.json yet. Copy the
    # checked-in example so a friend who skipped the manual setup step
    # still gets a working (if empty) config instead of a crash. Never
    # overwrites a config that's already there.
    if not CONFIG_PATH.exists() and CONFIG_EXAMPLE_PATH.exists():
        CONFIG_PATH.write_text(CONFIG_EXAMPLE_PATH.read_text(encoding="utf-8"), encoding="utf-8")
        log("no config.json found — created one from config.example.json")
    cfg = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    for key in ("companies", "filters"):
        if key not in cfg:
            raise ValueError(f"config.json missing required key: {key}")
    return cfg


def http_session(cfg):
    s = requests.Session()
    s.headers.update({"User-Agent": cfg.get("user_agent", "personal-job-watcher/1.0"),
                      "Accept": "application/json"})
    return s


def fetch(session, cfg, method, url, **kwargs):
    """One retry on 429/5xx with backoff; raises on final failure."""
    timeout = cfg.get("request_timeout_seconds", 20)
    for attempt in (1, 2):
        resp = session.request(method, url, timeout=timeout, **kwargs)
        if resp.status_code == 200:
            return resp
        if attempt == 1 and (resp.status_code == 429 or resp.status_code >= 500):
            time.sleep(10)
            continue
        resp.raise_for_status()
    raise RuntimeError(f"unreachable fetch state for {url}")


# ---------------------------------------------------------- salary parsing

MONEY_RE = re.compile(r"(?:CA?\$|\$)\s*(\d{1,3}(?:,\d{3})+|\d{2,3}(?:\.\d+)?)\s*([Kk])?")


def parse_salary_text(text):
    """Extract (min, max) CAD-ish annual figures from a compensation string."""
    if not text:
        return None, None
    values = []
    for amount, k_suffix in MONEY_RE.findall(text):
        value = float(amount.replace(",", ""))
        if k_suffix:
            value *= 1000
        if 20000 <= value <= 1000000:
            values.append(value)
    if not values:
        return None, None
    return min(values), max(values)


# ------------------------------------------------------------------ filters

def _kw_match(kw, text):
    if len(kw) <= 3:
        return re.search(rf"\b{re.escape(kw)}\b", text) is not None
    return kw in text


def title_matches(title, filters):
    t = title.lower()
    if any(_kw_match(kw, t) for kw in filters.get("title_exclude", [])):
        return False
    has_domain = any(_kw_match(kw, t) for kw in filters.get("title_domain", []))
    has_seniority = any(_kw_match(kw, t) for kw in filters.get("title_seniority", []))
    return has_domain and has_seniority


def location_matches(location, filters):
    if not location:
        return True  # unknown location: keep, flag downstream
    loc = location.lower()
    if any(kw in loc for kw in filters.get("location_exclude", [])):
        return False
    include = filters.get("location_include", [])
    return not include or any(kw in loc for kw in include)


# ----------------------------------------------------------------- adapters
# Each adapter returns a list of dicts:
# {job_id, title, location, url, posted_at, salary_min, salary_max, salary_raw}
# Some (greenhouse, successfactors_rmk) also include "jd_text": the full JD came
# free with the listing, so scoring/fact-extraction can use it inline with no
# extra fetch.

def fetch_ashby(session, cfg, company):
    url = f"https://api.ashbyhq.com/posting-api/job-board/{company['slug']}?includeCompensation=true"
    data = fetch(session, cfg, "GET", url).json()
    jobs = []
    for j in data.get("jobs", []):
        if j.get("isListed") is False:
            continue
        comp = j.get("compensation") or {}
        comp_text = (comp.get("scrapeableCompensationSalarySummary")
                     or comp.get("compensationTierSummary") or "")
        lo, hi = parse_salary_text(comp_text)
        location = j.get("location") or ""
        secondary = [s.get("location", "") for s in j.get("secondaryLocations", []) if isinstance(s, dict)]
        if j.get("isRemote"):
            secondary.append("Remote")
        full_location = "; ".join([p for p in [location] + secondary if p])
        jobs.append({
            "job_id": str(j.get("id", j.get("jobUrl", ""))),
            "title": j.get("title", ""),
            "location": full_location,
            "url": j.get("jobUrl") or j.get("applyUrl") or "",
            "posted_at": (j.get("publishedAt") or "")[:10],
            "salary_min": lo, "salary_max": hi, "salary_raw": comp_text,
        })
    return jobs


def fetch_lever(session, cfg, company):
    url = f"https://api.lever.co/v0/postings/{company['slug']}?mode=json"
    data = fetch(session, cfg, "GET", url).json()
    jobs = []
    for j in data if isinstance(data, list) else []:
        cats = j.get("categories") or {}
        rng = j.get("salaryRange") or {}
        lo, hi = rng.get("min"), rng.get("max")
        raw = f"{lo}-{hi} {rng.get('currency', '')}".strip("- ") if (lo or hi) else ""
        created = j.get("createdAt")
        posted = datetime.fromtimestamp(created / 1000, tz=timezone.utc).strftime("%Y-%m-%d") if created else ""
        location = "; ".join(p for p in [cats.get("location", ""), j.get("workplaceType", "")] if p)
        jobs.append({
            "job_id": str(j.get("id", "")),
            "title": j.get("text", ""),
            "location": location,
            "url": j.get("hostedUrl", ""),
            "posted_at": posted,
            "salary_min": lo, "salary_max": hi, "salary_raw": raw,
        })
    return jobs


def fetch_workable(session, cfg, company):
    url = f"https://apply.workable.com/api/v1/widget/accounts/{company['slug']}"
    data = fetch(session, cfg, "GET", url).json()
    jobs = []
    for j in data.get("jobs", []):
        loc = j.get("location") or {}
        location = ", ".join(p for p in [loc.get("city", ""), loc.get("country", "")] if p)
        if j.get("remote"):
            location = f"{location}; Remote" if location else "Remote"
        jobs.append({
            "job_id": str(j.get("shortcode", j.get("id", ""))),
            "title": j.get("title", ""),
            "location": location,
            "url": j.get("url") or j.get("shortlink") or "",
            "posted_at": (j.get("published_on") or j.get("created_at") or "")[:10],
            "salary_min": None, "salary_max": None, "salary_raw": "",
        })
    return jobs


def fetch_greenhouse(session, cfg, company):
    url = f"https://boards-api.greenhouse.io/v1/boards/{company['slug']}/jobs?content=true"
    data = fetch(session, cfg, "GET", url).json()
    jobs = []
    for j in data.get("jobs", []):
        jd_text = _strip_html(j.get("content") or "")
        lo, hi = parse_salary_text(jd_text)
        loc = j.get("location") or {}
        jobs.append({
            "job_id": str(j.get("id", "")),
            "title": j.get("title", ""),
            "location": loc.get("name", "") if isinstance(loc, dict) else "",
            "url": j.get("absolute_url", ""),
            "posted_at": (j.get("updated_at") or "")[:10],
            # content is the full JD, not a short compensation blurb — the parsed
            # figures are trustworthy (parse_salary_text), a verbatim raw quote isn't
            "salary_min": lo, "salary_max": hi, "salary_raw": "",
            "jd_text": jd_text,
        })
    return jobs


def fetch_workday(session, cfg, company):
    tenant, wd, site = company["tenant"], company["wd"], company["site"]
    base = f"https://{tenant}.{wd}.myworkdayjobs.com"
    api = f"{base}/wday/cxs/{tenant}/{site}/jobs"
    seen, jobs = set(), []
    for term in company.get("search_terms", [""]):
        max_jobs = company.get("max_per_term", 100)
        offset = 0
        while offset < max_jobs:
            body = {"appliedFacets": {}, "limit": 20, "offset": offset, "searchText": term}
            data = fetch(session, cfg, "POST", api, json=body).json()
            postings = data.get("jobPostings", [])
            if not postings:
                break
            for j in postings:
                path = j.get("externalPath", "")
                if not path or path in seen:
                    continue
                seen.add(path)
                bullets = " ".join(str(b) for b in (j.get("bulletFields") or []))
                lo, hi = parse_salary_text(bullets)
                jobs.append({
                    "job_id": path,
                    "title": j.get("title", ""),
                    "location": j.get("locationsText", ""),
                    "url": f"{base}/en-US/{site}{path}",
                    "posted_at": j.get("postedOn", ""),
                    "salary_min": lo, "salary_max": hi, "salary_raw": "",
                })
            offset += 20
            if offset >= int(data.get("total", 0)):
                break
            time.sleep(cfg.get("delay_between_requests_seconds", 1.5))
    return jobs


def _strip_html(raw):
    # Decode entities first, then strip tags: SF RMK's RSS <description> is
    # already real HTML with a few entities in it, but Greenhouse's `content`
    # field is HTML *escaped* as text (literal "&lt;h2&gt;") — and, in practice,
    # sometimes escaped twice (a literal "&amp;nbsp;" for what was "&nbsp;" in
    # the underlying HTML). Unescape to a fixed point so either case comes out
    # clean, then strip the now-real tags.
    text = raw or ""
    for _ in range(3):
        unescaped = html.unescape(text)
        if unescaped == text:
            break
        text = unescaped
    text = text.replace("\xa0", " ")
    text = re.sub(r"<img[^>]*>", " ", text)
    text = re.sub(r"</(p|li|ul|ol|div|br|h\d)>", "\n", text)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"[ \t]+", " ", text).strip()


def fetch_successfactors_rmk(session, cfg, company):
    """SAP SuccessFactors RMK career sites (e.g. jobs.scotiabank.com): public RSS,
    capped at 20 items/feed -> poll several narrow keyword feeds, dedup on numeric id."""
    from email.utils import parsedate_to_datetime
    from urllib.parse import quote
    from xml.etree import ElementTree

    host, location = company["host"], company.get("location", "")
    seen, jobs = set(), []
    for i, feed_kw in enumerate(company.get("feeds", [])):
        query = f"{feed_kw} AND locationSearch:({location})" if location else feed_kw
        url = f"https://{host}/services/rss/job/?locale=en_US&keywords={quote(query)}"
        root = ElementTree.fromstring(fetch(session, cfg, "GET", url,
            headers={"Accept": "application/rss+xml, application/xml, text/xml, */*"}).text)
        for item in root.iter("item"):
            link = (item.findtext("link") or "").strip()
            m = re.search(r"/(\d+)/?(?:\?|$)", link)
            if not m or m.group(1) in seen:
                continue
            seen.add(m.group(1))
            raw_title = (item.findtext("title") or "").strip()
            tm = re.match(r"^(.*)\((.*?)\)\s*$", raw_title)
            title, loc = (tm.group(1).strip(), tm.group(2).strip()) if tm else (raw_title, "")
            posted = ""
            try:
                posted = parsedate_to_datetime(item.findtext("pubDate") or "").strftime("%Y-%m-%d")
            except (ValueError, TypeError):
                pass
            jobs.append({
                "job_id": m.group(1), "title": title, "location": loc,
                "url": link.split("?")[0], "posted_at": posted,
                "salary_min": None, "salary_max": None, "salary_raw": "",
                "jd_text": _strip_html(item.findtext("description") or ""),
            })
        if i < len(company.get("feeds", [])) - 1:
            time.sleep(cfg.get("delay_between_requests_seconds", 1.5))
    return jobs


ADAPTERS = {"ashby": fetch_ashby, "lever": fetch_lever, "greenhouse": fetch_greenhouse,
            "workable": fetch_workable, "workday": fetch_workday,
            "successfactors_rmk": fetch_successfactors_rmk}


# ---------------------------------------------------------------- database

def open_db(cfg):
    conn = sqlite3.connect(BASE_DIR / cfg.get("db_path", "watcher.db"))
    conn.row_factory = sqlite3.Row
    conn.execute("""CREATE TABLE IF NOT EXISTS jobs(
        key TEXT PRIMARY KEY, company TEXT, tier INTEGER, source TEXT, job_id TEXT,
        title TEXT, location TEXT, url TEXT,
        salary_min REAL, salary_max REAL, salary_raw TEXT,
        posted_at TEXT, first_seen TEXT, last_seen TEXT, closed_at TEXT,
        matched INTEGER)""")
    conn.execute("""CREATE TABLE IF NOT EXISTS runs(
        ts TEXT, company TEXT, source TEXT, status TEXT,
        jobs_found INTEGER, matched INTEGER, error TEXT)""")
    conn.commit()
    return conn


def upsert_jobs(conn, company, jobs, filters):
    """Insert/refresh jobs for one company. Returns (new_matched, all_matched_count)."""
    ts = now_iso()
    new_matched = []
    matched_count = 0
    current_keys = set()
    for j in jobs:
        key = f"{company['adapter']}:{company['name']}:{j['job_id']}"
        current_keys.add(key)
        is_match = int(title_matches(j["title"], filters) and location_matches(j["location"], filters))
        matched_count += is_match
        row = conn.execute("SELECT key FROM jobs WHERE key=?", (key,)).fetchone()
        if row is None:
            conn.execute(
                """INSERT INTO jobs(key, company, tier, source, job_id, title, location, url,
                   salary_min, salary_max, salary_raw, posted_at, first_seen, last_seen, closed_at, matched)
                   VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,?)""",
                (key, company["name"], company.get("tier", 9), company["adapter"], j["job_id"],
                 j["title"], j["location"], j["url"], j["salary_min"], j["salary_max"],
                 j["salary_raw"], j["posted_at"], ts, ts, is_match))
            if is_match:
                new_matched.append({**j, "company": company["name"],
                                    "tier": company.get("tier", 9), "key": key})
        else:
            conn.execute("UPDATE jobs SET last_seen=?, closed_at=NULL WHERE key=?", (ts, key))
    # anything previously open for this company but absent now -> closed
    open_rows = conn.execute(
        "SELECT key, title FROM jobs WHERE company=? AND closed_at IS NULL", (company["name"],)).fetchall()
    closed = [(k, t) for k, t in open_rows if k not in current_keys]
    for k, _ in closed:
        conn.execute("UPDATE jobs SET closed_at=? WHERE key=?", (ts, k))
    return new_matched, matched_count, closed


def pipeline_closures(conn, closed_keys):
    """Of the postings that just closed, the ones the user has a stake in.

    Answers the question the watcher could not answer before: did anything I
    applied to or shortlisted disappear today? Filtering happens in Python
    because job_state only ever holds jobs the user actually triaged."""
    keys = set(closed_keys)
    if not keys:
        return []
    rows = conn.execute(
        """SELECT j.key, j.company, j.title, s.status
           FROM job_state s JOIN jobs j ON j.key = s.key
           WHERE s.status IN ('interested','applied')
           ORDER BY s.status, j.company""").fetchall()
    return [dict(r) for r in rows if r["key"] in keys]


# ------------------------------------------------------------------ digest

def fmt_salary(j):
    lo, hi = j.get("salary_min"), j.get("salary_max")
    if lo and hi and lo != hi:
        return f"${lo / 1000:.0f}K–${hi / 1000:.0f}K"
    if lo or hi:
        return f"${(lo or hi) / 1000:.0f}K"
    return ""


def _esc(text):
    return (str(text).replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))


def build_html(is_first_run, new_by_tier, closed_by_company, run_stats,
               pipeline_closures=None):
    total_new = sum(len(v) for v in new_by_tier.values())
    total_closed = sum(len(v) for v in closed_by_company.values())
    parts = [f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Job Watcher — {today_local()}</title>
<style>
  :root {{ --bg:#fafaf9; --card:#fff; --text:#1c1917; --muted:#78716c; --border:#e7e5e4; --accent:#0f766e; }}
  @media (prefers-color-scheme: dark) {{
    :root {{ --bg:#1c1917; --card:#292524; --text:#f5f5f4; --muted:#a8a29e; --border:#44403c; --accent:#5eead4; }}
  }}
  body {{ background:var(--bg); color:var(--text); font-family:-apple-system,Segoe UI,Roboto,sans-serif;
          max-width:760px; margin:0 auto; padding:24px 16px 60px; line-height:1.5; }}
  h1 {{ font-size:1.4rem; margin-bottom:4px; }}
  .sub {{ color:var(--muted); font-size:.9rem; margin-bottom:24px; }}
  h2 {{ font-size:1.1rem; margin:28px 0 10px; border-bottom:1px solid var(--border); padding-bottom:6px; }}
  h3 {{ font-size:.95rem; color:var(--accent); margin:16px 0 8px; text-transform:uppercase; letter-spacing:.03em; }}
  .job {{ background:var(--card); border:1px solid var(--border); border-radius:8px;
          padding:12px 14px; margin-bottom:8px; }}
  .job a {{ color:var(--accent); font-weight:600; text-decoration:none; }}
  .job a:hover {{ text-decoration:underline; }}
  .meta {{ color:var(--muted); font-size:.85rem; margin-top:2px; }}
  .company {{ font-weight:700; }}
  .closed {{ color:var(--muted); font-size:.9rem; padding:4px 0; }}
  .stats {{ color:var(--muted); font-size:.8rem; font-family:ui-monospace,Consolas,monospace; }}
  .empty {{ color:var(--muted); font-style:italic; }}
</style></head><body>
<h1>Job Watcher</h1>
<div class="sub">{today_local()}</div>"""]
    if is_first_run:
        parts.append('<p class="empty">First run: baseline seeded. Everything matching your filters is '
                     'listed once below; future digests show only changes.</p>')
    if pipeline_closures:
        parts.append(f"<h2>Needs attention ({len(pipeline_closures)})</h2>")
        for hit in pipeline_closures:
            parts.append(
                f'<div class="job"><span class="company">{_esc(hit["company"])}</span> — '
                f'{_esc(hit["title"])}<div class="meta">closed while '
                f'{_esc(hit["status"])}</div></div>')
    parts.append(f"<h2>New matches ({total_new})</h2>")
    if total_new == 0:
        parts.append('<p class="empty">Nothing new since last run.</p>')
    for tier in sorted(new_by_tier):
        jobs = new_by_tier[tier]
        if not jobs:
            continue
        parts.append(f"<h3>Tier {tier}</h3>")
        for j in sorted(jobs, key=lambda x: x["company"]):
            meta_bits = [p for p in [j.get("location", ""), fmt_salary(j),
                                     f"posted {j['posted_at']}" if j.get("posted_at") else ""] if p]
            parts.append(
                f'<div class="job"><span class="company">{_esc(j["company"])}</span> — '
                f'<a href="{_esc(j["url"])}" target="_blank" rel="noopener">{_esc(j["title"])}</a>'
                f'<div class="meta">{_esc(" · ".join(meta_bits))}</div></div>')
    if total_closed and not is_first_run:
        parts.append(f"<h2>Closed since last run ({total_closed})</h2>")
        for company, titles in sorted(closed_by_company.items()):
            for t in titles:
                parts.append(f'<div class="closed">{_esc(company)} — {_esc(t)}</div>')
    parts.append("<h2>Run stats</h2><div class=\"stats\">")
    parts.append("<br>".join(_esc(s) for s in run_stats))
    parts.append("</div></body></html>")
    return "\n".join(parts)


def build_board_html(rows):
    """Full scrollable/sortable/searchable table of every currently open matched job."""
    n = len(rows)
    trs = []
    for r in rows:
        company, tier, title, location, url, smin, smax, posted, first_seen = r
        salary_disp = fmt_salary({"salary_min": smin, "salary_max": smax})
        salary_sort = smax or smin or 0
        trs.append(
            f'<tr><td data-sort="{tier}">T{tier}</td>'
            f'<td data-sort="{_esc(company.lower())}">{_esc(company)}</td>'
            f'<td data-sort="{_esc(title.lower())}"><a href="{_esc(url)}" target="_blank" '
            f'rel="noopener">{_esc(title)}</a></td>'
            f'<td data-sort="{_esc(location.lower())}">{_esc(location)}</td>'
            f'<td data-sort="{salary_sort}">{_esc(salary_disp)}</td>'
            f'<td data-sort="{_esc(posted or "")}">{_esc(posted or "")}</td>'
            f'<td data-sort="{_esc(first_seen or "")}">{_esc((first_seen or "")[:10])}</td></tr>')
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Job Board — {n} open matches</title>
<style>
  :root {{ --bg:#fafaf9; --card:#fff; --text:#1c1917; --muted:#78716c; --border:#e7e5e4; --accent:#0f766e; --hover:#f0fdfa; }}
  @media (prefers-color-scheme: dark) {{
    :root {{ --bg:#1c1917; --card:#292524; --text:#f5f5f4; --muted:#a8a29e; --border:#44403c; --accent:#5eead4; --hover:#0c4a41; }}
  }}
  body {{ background:var(--bg); color:var(--text); font-family:-apple-system,Segoe UI,Roboto,sans-serif;
          max-width:1100px; margin:0 auto; padding:24px 16px 60px; }}
  h1 {{ font-size:1.4rem; margin-bottom:4px; }}
  .sub {{ color:var(--muted); font-size:.9rem; margin-bottom:16px; }}
  .toolbar {{ display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px; }}
  input, select {{ background:var(--card); color:var(--text); border:1px solid var(--border);
          border-radius:6px; padding:8px 10px; font-size:.9rem; }}
  #search {{ flex:1; min-width:200px; }}
  .tablewrap {{ max-height:78vh; overflow:auto; border:1px solid var(--border); border-radius:8px; }}
  table {{ border-collapse:collapse; width:100%; font-size:.88rem; }}
  th, td {{ text-align:left; padding:9px 10px; border-bottom:1px solid var(--border); white-space:nowrap; }}
  td:nth-child(3), td:nth-child(4) {{ white-space:normal; }}
  th {{ position:sticky; top:0; background:var(--card); cursor:pointer; user-select:none; z-index:1; }}
  th:hover {{ color:var(--accent); }}
  tr:hover td {{ background:var(--hover); }}
  a {{ color:var(--accent); font-weight:600; text-decoration:none; }}
  a:hover {{ text-decoration:underline; }}
  .count {{ color:var(--muted); font-size:.85rem; margin-top:8px; }}
</style></head><body>
<h1>Job Board</h1>
<div class="sub">All open matches, generated {today_local()} — click a column header to sort</div>
<div class="toolbar">
  <input id="search" type="text" placeholder="Search company, title, location...">
  <select id="tierFilter"><option value="">All tiers</option><option value="T1">Tier 1</option>
    <option value="T2">Tier 2</option><option value="T3">Tier 3</option><option value="T9">Tier 9</option></select>
</div>
<div class="tablewrap"><table id="board">
<thead><tr><th data-i="0">Tier</th><th data-i="1">Company</th><th data-i="2">Title</th>
<th data-i="3">Location</th><th data-i="4">Salary</th><th data-i="5">Posted</th><th data-i="6">First seen</th></tr></thead>
<tbody>{"".join(trs)}</tbody>
</table></div>
<div class="count" id="count"></div>
<script>
const table = document.getElementById('board');
const tbody = table.tBodies[0];
const rows = Array.from(tbody.rows);
const countEl = document.getElementById('count');
function updateCount() {{
  const visible = rows.filter(r => r.style.display !== 'none').length;
  countEl.textContent = visible + ' of ' + rows.length + ' roles shown';
}}
document.getElementById('search').addEventListener('input', e => {{
  const q = e.target.value.toLowerCase();
  const tier = document.getElementById('tierFilter').value;
  rows.forEach(r => {{
    const text = r.textContent.toLowerCase();
    const tierOk = !tier || r.cells[0].textContent === tier;
    r.style.display = (text.includes(q) && tierOk) ? '' : 'none';
  }});
  updateCount();
}});
document.getElementById('tierFilter').addEventListener('change', e => {{
  document.getElementById('search').dispatchEvent(new Event('input'));
}});
let sortState = {{}};
table.querySelectorAll('th').forEach(th => {{
  th.addEventListener('click', () => {{
    const i = th.dataset.i;
    const dir = sortState[i] === 'asc' ? 'desc' : 'asc';
    sortState = {{}}; sortState[i] = dir;
    const sorted = rows.slice().sort((a, b) => {{
      const av = a.cells[i].dataset.sort, bv = b.cells[i].dataset.sort;
      const an = parseFloat(av), bn = parseFloat(bv);
      let cmp = (!isNaN(an) && !isNaN(bn)) ? an - bn : av.localeCompare(bv);
      return dir === 'asc' ? cmp : -cmp;
    }});
    sorted.forEach(r => tbody.appendChild(r));
  }});
}});
updateCount();
</script>
</body></html>"""


def write_board(cfg, conn):
    rows = conn.execute(
        """SELECT company, tier, title, location, url, salary_min, salary_max, posted_at, first_seen
           FROM jobs WHERE matched=1 AND closed_at IS NULL
           ORDER BY tier, company, title""").fetchall()
    html = build_board_html(rows)
    (BASE_DIR / "job-board.html").write_text(html, encoding="utf-8")
    return len(rows)


def write_digest(cfg, is_first_run, new_by_tier, closed_by_company, run_stats,
                 pipeline_closures=None):
    digest_dir = BASE_DIR / cfg.get("digest_dir", "digests")
    digest_dir.mkdir(exist_ok=True)
    lines = [f"# Job Watcher — {today_local()}", ""]
    if is_first_run:
        lines += ["*First run: baseline seeded. Everything matching the filters is listed once below;",
                  "future digests show only changes.*", ""]
    # first, above the new matches: a posting you are chasing closing is the one
    # thing in this digest that may need action today
    if pipeline_closures:
        lines.append(f"## Needs attention ({len(pipeline_closures)})")
        for hit in pipeline_closures:
            lines.append(f"- **{hit['company']}** — {hit['title']} · closed while `{hit['status']}`")
        lines.append("")
    total_new = sum(len(v) for v in new_by_tier.values())
    lines.append(f"## New matches ({total_new})")
    if total_new == 0:
        lines.append("Nothing new since last run.")
    for tier in sorted(new_by_tier):
        jobs = new_by_tier[tier]
        if not jobs:
            continue
        lines.append(f"\n### Tier {tier}")
        for j in sorted(jobs, key=lambda x: x["company"]):
            parts = [p for p in [j.get("location", ""), fmt_salary(j),
                                 f"posted {j['posted_at']}" if j.get("posted_at") else ""] if p]
            lines.append(f"- **{j['company']}** — [{j['title']}]({j['url']}) · {' · '.join(parts)}")
    total_closed = sum(len(v) for v in closed_by_company.values())
    if total_closed and not is_first_run:
        lines.append(f"\n## Closed since last run ({total_closed})")
        for company, titles in sorted(closed_by_company.items()):
            for t in titles:
                lines.append(f"- {company} — {t}")
    lines.append("\n## Run stats")
    for s in run_stats:
        lines.append(f"- {s}")
    content = "\n".join(lines) + "\n"
    (digest_dir / f"digest-{today_local()}.md").write_text(content, encoding="utf-8")
    (BASE_DIR / "latest-digest.md").write_text(content, encoding="utf-8")

    html = build_html(is_first_run, new_by_tier, closed_by_company, run_stats,
                      pipeline_closures)
    (digest_dir / f"digest-{today_local()}.html").write_text(html, encoding="utf-8")
    (BASE_DIR / "latest-digest.html").write_text(html, encoding="utf-8")

    return total_new


def push_ntfy(cfg, new_jobs, fits=None, pipeline_closures=None):
    topic = cfg.get("ntfy_topic", "").strip()
    closures = pipeline_closures or []
    if not topic or (not new_jobs and not closures):
        return
    fits = fits or {}
    # closures lead: they are the only lines here that can be time-critical
    lines = [f"{h['status'].capitalize()} posting closed: {h['company']} — {h['title']}"
             for h in closures[:NTFY_MAX_TITLES]]
    for j in new_jobs[:NTFY_MAX_TITLES]:
        line = f"{j['company']}: {j['title']}"
        fit = fits.get(j.get("key"))
        if fit is not None:
            line += f" (fit {fit})"
        lines.append(line)
    extra = f" (+{len(new_jobs) - NTFY_MAX_TITLES} more)" if len(new_jobs) > NTFY_MAX_TITLES else ""
    headline = f"{len(new_jobs)} new match(es){extra}" if new_jobs else ""
    if closures:
        closed_bit = f"{len(closures)} tracked posting(s) closed"
        headline = f"{closed_bit}, {headline}" if headline else closed_bit
    try:
        requests.post(f"https://ntfy.sh/{topic}",
                      data="\n".join(lines).encode("utf-8"),
                      headers={"Title": f"Job Watcher: {headline}",
                               "Tags": "briefcase"},
                      timeout=15)
    except requests.RequestException as exc:
        log(f"ntfy push failed: {exc}")


def run_scoring_step(conn, session, cfg, new_matched):
    """Batch-score new matches (+ bounded unscored backlog). Never raises."""
    result = {"scored": 0, "failed": 0, "fits": {}}
    if not cfg.get("app", {}).get("batch_scoring", True):
        return result
    try:
        sys.path.insert(0, str(BASE_DIR.parent))
        from app import db as appdb, scorer
    except ImportError as exc:
        log(f"scoring skipped (app package unavailable: {exc})")
        return result
    appdb.ensure_schema(conn)
    todo = {j["key"]: j.get("jd_text") for j in new_matched}
    backlog = conn.execute(
        """SELECT j.key FROM jobs j LEFT JOIN job_scores s ON s.key = j.key
           WHERE j.matched = 1 AND j.closed_at IS NULL AND s.key IS NULL
           LIMIT ?""", (SCORE_RETRY_CAP,)).fetchall()
    for row in backlog:
        todo.setdefault(row[0], None)
    for key, inline_jd in todo.items():
        try:
            d = scorer.score_job(conn, session, cfg, key, inline_jd=inline_jd)
            result["scored"] += 1
            result["fits"][key] = d["fit"]
        except Exception as exc:
            result["failed"] += 1
            log(f"score failed for {key}: {exc}")
        time.sleep(cfg.get("delay_between_requests_seconds", 1.5))
    return result


def run_facts_step(conn, session, cfg, new_matched):
    """Read structured facts out of each new JD (+ a bounded backlog). Never raises:
    a posting with no fetchable description must not fail the whole run."""
    result = {"extracted": 0, "failed": 0}
    if not cfg.get("app", {}).get("extract_facts", True):
        return result
    try:
        sys.path.insert(0, str(BASE_DIR.parent))
        from app import db as appdb, facts
    except ImportError as exc:
        log(f"fact extraction skipped (app package unavailable: {exc})")
        return result
    appdb.ensure_schema(conn)
    todo = {j["key"]: j.get("jd_text") for j in new_matched}
    backlog = conn.execute(
        """SELECT j.key FROM jobs j LEFT JOIN job_facts f ON f.key = j.key
           WHERE j.matched = 1 AND j.closed_at IS NULL AND f.key IS NULL
           LIMIT ?""", (FACTS_RETRY_CAP,)).fetchall()
    for row in backlog:
        todo.setdefault(row[0], None)
    for key, inline_jd in todo.items():
        try:
            facts.extract_facts(conn, session, cfg, key, inline_jd=inline_jd)
            result["extracted"] += 1
        except Exception as exc:
            result["failed"] += 1
            log(f"fact extraction failed for {key}: {exc}")
        time.sleep(cfg.get("delay_between_requests_seconds", 1.5))
    return result


# -------------------------------------------------------------------- main

def run(dry_run=False):
    cfg = load_config()
    filters = cfg["filters"]
    session = http_session(cfg)
    conn = open_db(cfg)
    is_first_run = conn.execute("SELECT COUNT(*) FROM jobs").fetchone()[0] == 0

    all_new, new_by_tier, closed_by_company, run_stats = [], {}, {}, []
    all_closed_keys = []
    for company in cfg["companies"]:
        name, adapter_name = company.get("name", "?"), company.get("adapter", "")
        adapter = ADAPTERS.get(adapter_name)
        if adapter is None:
            run_stats.append(f"{name}: SKIPPED (unknown adapter '{adapter_name}')")
            continue
        try:
            jobs = adapter(session, cfg, company)
        except Exception as exc:  # one company failing must not kill the run
            log(f"{name}: ERROR {exc}")
            run_stats.append(f"{name}: ERROR {exc}")
            if not dry_run:
                conn.execute("INSERT INTO runs VALUES(?,?,?,?,?,?,?)",
                             (now_iso(), name, adapter_name, "error", 0, 0, str(exc)[:300]))
                conn.commit()
            continue
        if dry_run:
            matched = [j for j in jobs
                       if title_matches(j["title"], filters) and location_matches(j["location"], filters)]
            run_stats.append(f"{name}: ok, {len(jobs)} jobs, {len(matched)} match filters")
            for j in matched[:5]:
                log(f"  [match] {name} — {j['title']} ({j['location']})")
        else:
            new_matched, matched_count, closed = upsert_jobs(conn, company, jobs, filters)
            conn.execute("INSERT INTO runs VALUES(?,?,?,?,?,?,?)",
                         (now_iso(), name, adapter_name, "ok", len(jobs), matched_count, None))
            conn.commit()
            all_new.extend(new_matched)
            new_by_tier.setdefault(company.get("tier", 9), []).extend(new_matched)
            if closed:
                closed_by_company[name] = [t for _, t in closed]
                all_closed_keys.extend(k for k, _ in closed)
            run_stats.append(f"{name}: ok, {len(jobs)} jobs, {matched_count} match filters, "
                             f"{len(new_matched)} new, {len(closed)} closed")
        log(run_stats[-1])
        time.sleep(cfg.get("delay_between_requests_seconds", 1.5))

    if dry_run:
        log("dry run complete — no DB writes, no digest, no push")
        return 0

    try:
        closures = pipeline_closures(conn, all_closed_keys)
    except sqlite3.Error as exc:  # job_state is app-owned and may not exist yet
        log(f"pipeline closure check skipped: {exc}")
        closures = []
    total_new = write_digest(cfg, is_first_run, new_by_tier, closed_by_company, run_stats,
                             pipeline_closures=closures)
    board_count = write_board(cfg, conn)
    scoring = {"scored": 0, "failed": 0, "fits": {}}
    try:
        scoring = run_scoring_step(conn, session, cfg, all_new)
    except Exception as exc:
        log(f"scoring step error (non-fatal): {exc}")
    extraction = {"extracted": 0, "failed": 0}
    try:
        extraction = run_facts_step(conn, session, cfg, all_new)
    except Exception as exc:
        log(f"fact extraction step error (non-fatal): {exc}")
    if not is_first_run:
        push_ntfy(cfg, all_new, fits=scoring["fits"], pipeline_closures=closures)
    log(f"run complete: {total_new} new matches{' (baseline seed)' if is_first_run else ''}, "
        f"{board_count} total open matches on board, "
        f"{scoring['scored']} scored / {scoring['failed']} score-failed, "
        f"{extraction['extracted']} facts / {extraction['failed']} fact-failed, "
        f"{len(closures)} tracked posting(s) closed")
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(run(dry_run="--dry-run" in sys.argv))
