# resume_career

A personal job-search tooling project: a local job-posting watcher that's growing into a lightweight application CRM and LLM-assisted career agent.

## Architecture

- **watcher.py** (`watcher/`) — polls public, unauthenticated ATS endpoints (Ashby, Lever, Greenhouse, Workable, Workday CXS, SuccessFactors) for a configured company list, stores results in SQLite (`watcher.db`), and writes a searchable HTML job board plus a daily "what's new" digest.
- **Scheduling** — `watcher.py` runs once daily via Windows Task Scheduler (local, free, no LLM cost). A second scheduled task (Claude Code desktop) runs weekly to read the watcher's output and produce a scored summary — this is where automated judgment gets layered on top of the raw feed.
- **Storage** — single SQLite DB (`watcher/watcher.db`, gitignored) holds every job ever seen plus poll history. Salary data is captured where the source exposes it (e.g. Ontario pay-transparency listings).
- **Notifications** — optional push via [ntfy.sh](https://ntfy.sh) to a private topic, set locally in `config.json` and never committed.
- **Career HQ** (`app/` + `web/`) — local web app over `watcher.db`: FastAPI backend
  (`python -m uvicorn app.app:app --host 127.0.0.1 --port 8765`, or `career-hq.bat`) serving a
  Vite/React board with per-job status tracking (`job_state`), Gemini-based fit scoring
  (`job_scores`, profile + rules stored in the DB, `GEMINI_API_KEY` env var), and JD caching
  (`jd_cache`). The watcher batch-scores new matches at the end of each daily run; deep dives are
  on-demand from the UI. The `jobs`/`runs` tables remain watcher-owned; app tables are additive.

## Config

`watcher/config.json` (gitignored — contains the target company list and ntfy topic) defines:
- `companies`: name, adapter (`ashby` / `lever` / `greenhouse` / `workable` / `workday` / `successfactors`), and slug/tenant per company
- `filters`: title keywords, seniority, location include/exclude
- ntfy topic and request pacing

A scrubbed template, `watcher/config.example.json`, is checked in for anyone bootstrapping a fresh copy — see [SETUP.md](SETUP.md). Companies and filters can also be edited from the app's Settings tab instead of by hand.

## Build roadmap (in order)

1. **T1 — Job Watcher** — done. Poller + SQLite + HTML board + daily digest.
2. **T2 — Weekly Digest** — done. Scheduled Claude task scores new postings against personal criteria and flags CRM follow-ups.
3. **T3 — Application Kit** — on demand. JD → tailored resume/cover-letter generation.
4. **T4 — Application & Referral CRM** — extends the same SQLite DB with pipeline/contact tables.
5. **T5 — Comp Evidence Base** — free by-product of T1; salary data accrues into `watcher.db`.
6. **T6 — Pre-Interview Company Brief** — on demand.
7. **T7 — Interview Prep Kit** — on demand.
8. **T8 — PitchPick product analytics** — separate side-project track (see pitchpick.club).

## Hard constraints (do not violate)

- **No LinkedIn automation or scraping, ever** — account-ban risk.
- **No auto-apply bots** — every application is manually reviewed and submitted by hand.
- Public, unauthenticated ATS endpoints only — nothing behind a login.
- Polite polling: sequential requests, ~1.5s delay between companies, honest User-Agent, once-daily schedule, one retry with backoff on 429/5xx.

## What's gitignored, and why

This repo is public. Personal/sensitive material stays local-only and is never committed:
- `watcher/config.json` — target company list + ntfy topic
- `watcher/watcher.db`, `watcher.log`, `digests/`, generated HTML/board files — job data and salary data
- `__pycache__/`
- Personal strategy documents and resume files at the repo root — comp targets, negotiation strategy, resume drafts
- `docs/superpowers/`, `.superpowers/`, `scripts/seed_profile.py`, `node_modules/`, `web/dist/` — personal specs/mockups/seeder and build artifacts

Only the code, `watcher/README.md`, and this file are meant to be public.

Before pushing, run `python scripts/privacy_scan.py` — checks tracked files against
`scripts/privacy_patterns.json` (generic secrets/paths/emails) plus your own
`scripts/privacy_patterns.local.json` (gitignored; copy from the `.example` file to add your
name/employer/etc.). Exits non-zero on any high-severity match.
