"""Settings API: read/edit the watcher's config.json from the browser.

Only a friend-safe subset is exposed. Pacing, user-agent, and file paths stay
file-only so the polite-polling constraints can't be changed from the UI.
"""

import json
import os
import re
import tempfile
from typing import Annotated, Literal, Optional, Union
from urllib.parse import unquote, urlsplit

from fastapi import APIRouter, Request
from pydantic import (BaseModel, ConfigDict, Field, TypeAdapter, ValidationError,
                      field_validator)

from app import db as appdb

EXAMPLE_PATH = appdb.REPO_ROOT / "watcher" / "config.example.json"
EDITABLE_APP_KEYS = ("batch_model", "deep_dive_model", "batch_scoring", "internal_companies")

router = APIRouter()


# single URL-path/subdomain token: no "/", ":", "@", "?" or whitespace, so a value
# can't break out of the URL the watcher builds around it
URL_TOKEN = r"^[A-Za-z0-9_-]+$"
HOSTNAME = (r"^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?"
            r"(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$")
PRIVATE_HOST = re.compile(
    r"^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)", re.IGNORECASE)


class SlugCompany(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1)
    tier: int = Field(ge=1, le=9)
    adapter: Literal["ashby", "lever", "greenhouse", "workable"]
    slug: str = Field(pattern=URL_TOKEN)


class WorkdayCompany(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1)
    tier: int = Field(ge=1, le=9)
    adapter: Literal["workday"]
    tenant: str = Field(pattern=URL_TOKEN)
    wd: str = Field(pattern=r"^wd\d+$")
    site: str = Field(pattern=URL_TOKEN)
    search_terms: list[str] = Field(min_length=1)
    max_per_term: int = Field(default=100, ge=1, le=500)


class SuccessFactorsCompany(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1)
    tier: int = Field(ge=1, le=9)
    adapter: Literal["successfactors_rmk"]
    host: str = Field(pattern=HOSTNAME)
    feeds: list[str] = Field(min_length=1)
    location: Optional[str] = None

    @field_validator("host")
    @classmethod
    def reject_private_hosts(cls, v):
        if PRIVATE_HOST.match(v):
            raise ValueError("loopback/private hosts are not allowed")
        return v


Company = Annotated[Union[SlugCompany, WorkdayCompany, SuccessFactorsCompany],
                    Field(discriminator="adapter")]


def _clean_keywords(kws):
    # watcher matches keywords against lowercased titles/locations,
    # so anything saved with capitals would silently never match
    return [k.strip().lower() for k in kws if k.strip()]


class Filters(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title_domain: list[str]
    title_seniority: list[str]
    title_exclude: list[str]
    location_include: list[str]
    location_exclude: list[str]

    normalize = field_validator("title_domain", "title_seniority", "title_exclude",
                                "location_include", "location_exclude")(_clean_keywords)


class AppSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")
    batch_model: str = Field(min_length=1)
    deep_dive_model: str = Field(min_length=1)
    batch_scoring: bool
    internal_companies: list[str]


class SettingsBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ntfy_topic: str = ""
    filters: Filters
    companies: list[Company]
    app: AppSettings


def read_base_cfg(config_path):
    """Full on-disk config; falls back to the checked-in example on first run."""
    path = config_path if config_path.exists() else EXAMPLE_PATH
    return json.loads(path.read_text(encoding="utf-8"))


# same defaults health() assumes for configs predating the app/ scoring era
APP_DEFAULTS = {"batch_model": "gemini-flash-latest", "deep_dive_model": "gemini-pro-latest",
                "batch_scoring": True, "internal_companies": []}
FILTERS_DEFAULTS = {"title_domain": [], "title_seniority": [], "title_exclude": [],
                    "location_include": [], "location_exclude": []}


def editable_view(cfg):
    appc = cfg.get("app", {})
    return {
        "ntfy_topic": cfg.get("ntfy_topic", ""),
        "filters": {**FILTERS_DEFAULTS, **cfg.get("filters", {})},
        "companies": cfg.get("companies", []),
        "app": {k: appc.get(k, APP_DEFAULTS[k]) for k in EDITABLE_APP_KEYS},
    }


def merge_editable(base, body: SettingsBody):
    """New config dict: editable keys from body, everything else from base."""
    incoming_app = body.app.model_dump()
    return {
        **base,
        "ntfy_topic": body.ntfy_topic,
        "filters": body.filters.model_dump(),
        "companies": [c.model_dump(exclude_none=True) for c in body.companies],
        "app": {**base.get("app", {}), **incoming_app},
    }


def atomic_write(path, cfg):
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2, ensure_ascii=False)
            f.write("\n")
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def _validation_message(exc: ValidationError):
    first = exc.errors()[0]
    loc = ".".join(str(p) for p in first["loc"])
    return f"{loc}: {first['msg']}"


@router.get("/api/settings")
def get_settings(request: Request):
    from app.app import ok
    cfg = read_base_cfg(request.app.state.config_path)
    return ok(editable_view(cfg))


COMPANY_ADAPTER = TypeAdapter(Company)


def _load_watcher():
    # watcher.py lives in watcher/ without a package __init__; import it the same
    # way the test suite does
    import sys
    wdir = str(appdb.REPO_ROOT / "watcher")
    if wdir not in sys.path:
        sys.path.insert(0, wdir)
    import watcher
    return watcher


# ------------------------------------------------------- paste-a-URL detection
# Pure string/regex parsing of a pasted job-posting or careers-board URL into an
# adapter + slug/tenant/host guess. No network call, ever — the user reviews and
# hits the existing "Test fetch" button (test_company, below) for a live check.

GREENHOUSE_HOSTS = ("boards.greenhouse.io", "job-boards.greenhouse.io")
SLUG_HOSTS = {"jobs.ashbyhq.com": "ashby", "jobs.lever.co": "lever",
              "apply.workable.com": "workable",
              **{host: "greenhouse" for host in GREENHOUSE_HOSTS}}
WORKDAY_HOST_RE = re.compile(r"^([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com$")
LOCALE_SEGMENT_RE = re.compile(r"^[a-z]{2}(-[a-z]{2})?$", re.IGNORECASE)
# SuccessFactors RMK career sites live on arbitrary customer domains — there's no
# shared hostname to key off, so the only honest signal is the distinctive
# /job/<slug>/<numeric-id>/ path their postings (and RSS feed links) both use.
SF_JOB_PATH_RE = re.compile(r"^/job/[^/]+/\d+/?$", re.IGNORECASE)
_TOKEN_RE = re.compile(URL_TOKEN)
_HOSTNAME_RE = re.compile(HOSTNAME)


class DetectResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    recognized: bool
    adapter: Optional[str] = None
    slug: Optional[str] = None
    tenant: Optional[str] = None
    wd: Optional[str] = None
    site: Optional[str] = None
    host: Optional[str] = None
    suggested_name: Optional[str] = None
    message: str


def _unrecognized(message="couldn't recognize that as a known job board URL"):
    return DetectResult(recognized=False, message=message)


def _titleize(token):
    words = [w for w in re.split(r"[-_]+", token) if w]
    return " ".join(w[:1].upper() + w[1:] for w in words) if words else None


def detect_company_url(raw_url):
    """Best-effort adapter/slug guess from a pasted URL. Pure parsing: no
    network access, and a host that fails reject_private_hosts's own check
    is never proposed, even if its path happens to look like a known shape."""
    if not isinstance(raw_url, str):
        return _unrecognized("paste a job posting or careers-page URL")
    raw = raw_url.strip()
    if not raw:
        return _unrecognized("paste a job posting or careers-page URL")
    candidate = raw if "://" in raw else f"https://{raw}"
    try:
        parsed = urlsplit(candidate)
        host = (parsed.hostname or "").lower()
    except (ValueError, UnicodeError):
        return _unrecognized("that doesn't look like a valid URL")
    if not host:
        return _unrecognized("that doesn't look like a valid URL")
    if PRIVATE_HOST.match(host):
        return _unrecognized("private/internal hosts aren't supported")

    segments = [unquote(p) for p in parsed.path.split("/") if p]

    if host in SLUG_HOSTS:
        adapter = SLUG_HOSTS[host]
        slug = segments[0] if segments else ""
        if not _TOKEN_RE.match(slug):
            return _unrecognized(f"recognized {adapter}, but couldn't find a company slug in that URL")
        return DetectResult(recognized=True, adapter=adapter, slug=slug,
                            suggested_name=_titleize(slug), message=f"recognized as {adapter}")

    m = WORKDAY_HOST_RE.match(host)
    if m:
        tenant, wd = m.group(1), m.group(2)
        segs = segments[1:] if (segments and LOCALE_SEGMENT_RE.match(segments[0])
                                and len(segments) > 1) else segments
        site = segs[0] if segs else ""
        if not _TOKEN_RE.match(tenant) or not _TOKEN_RE.match(site):
            return _unrecognized("recognized workday, but couldn't find a site name in that URL")
        return DetectResult(recognized=True, adapter="workday", tenant=tenant, wd=wd, site=site,
                            suggested_name=_titleize(tenant), message="recognized as workday")

    if _HOSTNAME_RE.match(host) and SF_JOB_PATH_RE.match(parsed.path or ""):
        return DetectResult(recognized=True, adapter="successfactors_rmk", host=host,
                            message="recognized as a SuccessFactors (RMK) career site — "
                                    "its RSS search feeds still need to be added by hand")

    return _unrecognized()


@router.post("/api/companies/detect")
def detect_company(body: dict):
    from app.app import ok
    result = detect_company_url(body.get("url", ""))
    return ok(result.model_dump())


@router.post("/api/settings/test-company")
def test_company(request: Request, body: dict):
    from app.app import err, ok
    try:
        company = COMPANY_ADAPTER.validate_python(body).model_dump(exclude_none=True)
    except ValidationError as exc:
        return err(_validation_message(exc), 400)
    watcher = _load_watcher()
    cfg = read_base_cfg(request.app.state.config_path)
    try:
        jobs = watcher.ADAPTERS[company["adapter"]](request.app.state.session, cfg, company)
    except Exception as exc:
        return err(f"fetch failed: {exc}", 502)
    return ok({"jobs_found": len(jobs),
               "sample_titles": [j["title"] for j in jobs[:5]]})


@router.put("/api/settings")
def put_settings(request: Request, body: dict):
    from app.app import err, ok
    try:
        parsed = SettingsBody.model_validate(body)
    except ValidationError as exc:
        return err(_validation_message(exc), 400)
    config_path = request.app.state.config_path
    merged = merge_editable(read_base_cfg(config_path), parsed)
    atomic_write(config_path, merged)
    return ok(editable_view(merged))
