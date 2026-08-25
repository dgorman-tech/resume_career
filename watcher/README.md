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

## One manual step: phone notifications (optional, 3 minutes)

1. Install the **ntfy** app (Android/iOS) or use https://ntfy.sh in a browser.
2. Subscribe to a private, unguessable topic — e.g. `dg-watch-k4x9q2v7` (treat the name like a password; anyone who knows it can read the messages — they only ever contain public job titles).
3. Put that topic in `config.json` → `"ntfy_topic": "dg-watch-k4x9q2v7"`.

Until then, the daily digest files and Monday brief still work — you just won't get pushes.

## Common tweaks (all in `config.json`)

- **Add a company:** new entry under `companies` with `adapter` = `ashby`/`lever`/`workable` and its `slug` (find it in the careers-page URL: `jobs.ashbyhq.com/{slug}`, `jobs.lever.co/{slug}`), or `workday` with `tenant`/`wd`/`site`.
- **Too much noise / too quiet:** edit `filters.title_domain`, `title_seniority` (a title must hit one of each), `title_exclude`, and the location lists.
- **Run manually anytime:**
  `python C:\Users\Danie\Projects\resume_career\watcher\watcher.py`
  (`--dry-run` polls and prints without saving.)

## Etiquette built in

Sequential requests, 1.5s between companies, one retry with backoff on 429/5xx, honest User-Agent, once-daily schedule. Public endpoints only — no LinkedIn, nothing behind a login.

## Verified baseline (2026-08-24)

933 postings tracked across 16 companies · 203 matched filters (Tier 1: 63 · Tier 2: 97 · Tier 3: 43) · salary data captured on 153 — accruing into `watcher.db` as negotiation evidence (T5).
