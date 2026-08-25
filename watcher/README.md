# Job Watcher — ops manual

*Built 2026-08-24. Surfaces postings only — never applies, never touches any account.*

## What runs when

| Piece | Schedule | Runs where | Needs |
|---|---|---|---|
| **T1 — watcher.py** | Daily 7:53 AM (Windows Task Scheduler, task `PersonalJobWatcher`; catches up on wake if the laptop was asleep) | Locally, no Claude, no cost | Python + internet |
| **T2 — Monday brief** | Mondays ~8:30 AM (Claude scheduled task `monday-career-digest`) | Claude desktop app — **runs while the app is open**, else on next launch | Watcher data present |

## Files

- `watcher.py` — the poller (Ashby / Lever / Workable / Workday adapters)
- `config.json` — companies, filters, ntfy topic
- `watcher.db` — SQLite: every job ever seen (`jobs`), poll history (`runs`)
- **`job-board.html`** — **the full catalog.** Every currently open matched job, searchable and sortable. This is your desktop shortcut "Job Board" — open it any time to browse.
- `digests/digest-YYYY-MM-DD.md` / `.html` + `latest-digest.md` / `.html` — a **changelog**, not a catalog: only jobs new since the *previous* run. Desktop shortcut "Job Watcher - What's New". Usually near-empty day to day — that's expected, not broken.
- `weekly-brief-YYYY-MM-DD.md` — Monday's scored brief (written by T2, delivered in chat)
- `watcher.log` — rolling log (last ~2,000 lines)

**Which one to open:** "Job Board" for "show me everything," "What's New" for "what changed since yesterday." The board regenerates fresh every run — always current, no history to scroll past.

## Career HQ (the app)

A local FastAPI + React app (`app/` + `web/`) that layers per-job triage, Gemini-based fit
scoring, and a profile editor on top of `watcher.db`. It's a richer alternative to `job-board.html`
for day-to-day use, not a replacement — `job-board.html` still works standalone with zero
dependencies if you just want a quick browse.

**Launch:**
- Double-click `career-hq.bat` at the repo root (starts the server if it isn't already running,
  then opens the board in your browser), or
- Run it manually: `python -m uvicorn app.app:app --host 127.0.0.1 --port 8765`, then open
  `http://127.0.0.1:8765`.
- **First-time / fresh checkout:** build the React frontend before launching —
  `cd web && npm install && npm run build`. The backend only serves `/` from the built
  `web/dist` folder; without it the root page 404s (though `/api/*` still works fine). You only
  need to rebuild after pulling frontend changes, not on every launch.

**Scoring:** set `GEMINI_API_KEY` as a **user environment variable** (not just a shell session
export) so the 7:53 AM scheduled task inherits it — without it, the watcher still polls, matches,
and writes the digest/board normally (scoring is just skipped/failed for that run), and the app's
on-demand "Score now" / deep-dive calls return a clean error rather than succeeding. The models
used for batch scoring and deep dives are configured in `config.json` → `"app"` (`batch_model`,
`deep_dive_model`); the gear/health dialog in the app shows which models are active and whether
the key is present.

**Data:** the app adds `job_state`, `job_scores`, `jd_cache`, and `profile` tables to the same
`watcher.db` — the watcher's own `jobs`/`runs` tables are untouched and remain the source of truth
for what postings exist.

## One manual step: phone notifications (optional, 3 minutes)

1. Install the **ntfy** app (Android/iOS) or use https://ntfy.sh in a browser.
2. Subscribe to a private, unguessable topic — e.g. `myname-watch-k4x9q2v7` (treat the name like a password; anyone who knows it can read the messages — they only ever contain public job titles).
3. Put that topic in `config.json` → `"ntfy_topic": "myname-watch-k4x9q2v7"`.

Until then, the daily digest files and Monday brief still work — you just won't get pushes.

## Common tweaks (all in `config.json`)

- **Add a company:** new entry under `companies` with `adapter` = `ashby`/`lever`/`workable` and its `slug` (find it in the careers-page URL: `jobs.ashbyhq.com/{slug}`, `jobs.lever.co/{slug}`), or `workday` with `tenant`/`wd`/`site`.
- **Too much noise / too quiet:** edit `filters.title_domain`, `title_seniority` (a title must hit one of each), `title_exclude`, and the location lists.
- **Run manually anytime:**
  `python watcher/watcher.py` (from the repo root; add `--dry-run` to poll and print without saving)

## Etiquette built in

Sequential requests, 1.5s between companies, one retry with backoff on 429/5xx, honest User-Agent, once-daily schedule. Public endpoints only — no LinkedIn, nothing behind a login.

## Verified baseline (2026-08-24)

933 postings tracked across 16 companies · 203 matched filters (Tier 1: 63 · Tier 2: 97 · Tier 3: 43) · salary data captured on 153 — accruing into `watcher.db` as negotiation evidence (T5).
