"""Fetch and cache job-description text, one polite request per new matched job."""

import re

from app.db import now_iso

JD_TRIM = 8000
TIMEOUT = 20


def strip_html(html):
    text = re.sub(r"<img[^>]*>", " ", html or "")
    text = re.sub(r"</(p|li|ul|ol|div|br|h\d)>", "\n", text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = text.replace("&nbsp;", " ").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
    return re.sub(r"[ \t]+", " ", text).strip()


def _get_json(session, url):
    resp = session.request("GET", url, timeout=TIMEOUT)
    if resp.status_code != 200:
        return None
    return resp.json()


def _jd_ashby(session, company, job):
    data = _get_json(session, f"https://api.ashbyhq.com/posting-api/job-board/{company['slug']}?includeCompensation=true")
    for j in (data or {}).get("jobs", []):
        if str(j.get("id")) == job["job_id"]:
            return j.get("descriptionHtml") or j.get("descriptionPlain") or ""
    return ""


def _jd_lever(session, company, job):
    data = _get_json(session, f"https://api.lever.co/v0/postings/{company['slug']}/{job['job_id']}?mode=json")
    return (data or {}).get("descriptionPlain") or (data or {}).get("description") or ""


def _jd_workable(session, company, job):
    data = _get_json(session, f"https://apply.workable.com/api/v1/widget/accounts/{company['slug']}/jobs/{job['job_id']}")
    return (data or {}).get("description") or ""


def _jd_workday(session, company, job):
    base = f"https://{company['tenant']}.{company['wd']}.myworkdayjobs.com"
    data = _get_json(session, f"{base}/wday/cxs/{company['tenant']}/{company['site']}{job['job_id']}")
    return ((data or {}).get("jobPostingInfo") or {}).get("jobDescription") or ""


_FETCHERS = {"ashby": _jd_ashby, "lever": _jd_lever,
             "workable": _jd_workable, "workday": _jd_workday}


def _store(conn, key, text):
    conn.execute("INSERT OR REPLACE INTO jd_cache(key, jd_text, fetched_at) VALUES (?,?,?)",
                 (key, text, now_iso()))
    conn.commit()


def get_jd(conn, session, cfg, key, inline_jd=None):
    row = conn.execute("SELECT jd_text FROM jd_cache WHERE key=?", (key,)).fetchone()
    if row and row["jd_text"]:
        return row["jd_text"]
    if inline_jd:
        text = inline_jd[:JD_TRIM]
        _store(conn, key, text)
        return text
    job = conn.execute("SELECT * FROM jobs WHERE key=?", (key,)).fetchone()
    if job is None:
        return None
    company = next((c for c in cfg.get("companies", []) if c.get("name") == job["company"]), None)
    fetcher = _FETCHERS.get(job["source"]) if company else None
    if fetcher is None:
        return None
    try:
        html = fetcher(session, company, dict(job))
    except Exception:
        return None
    text = strip_html(html)[:JD_TRIM]
    if not text:
        return None
    _store(conn, key, text)
    return text
