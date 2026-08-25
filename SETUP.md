# Setup guide

Run your own copy of Career HQ: a local job watcher that polls public company
career pages (Ashby, Lever, Workable, Workday, SuccessFactors) and a small
web app on top for triage, AI-assisted fit scoring, and a resume profile.
Nothing here touches LinkedIn, and nothing auto-applies to jobs — see
[Hard constraints](CLAUDE.md#hard-constraints-do-not-violate) in `CLAUDE.md`.

Everything runs locally on your own machine, on your own data, at zero cost
unless you turn on AI scoring (which uses a free-tier Gemini API key).

## 1. Prerequisites

- **Python 3.11+** — [python.org/downloads](https://www.python.org/downloads/)
- **Node.js 20+** — [nodejs.org](https://nodejs.org/) (only needed once, to build the web app)
- **Git**

Check what you have:

```bash
python --version
node --version
git --version
```

## 2. Clone and install

```bash
git clone <this-repo-url>
cd resume_career
pip install -r requirements.txt
```

## 3. Bootstrap your config

The repo ships a scrubbed template, `watcher/config.example.json`, with no
companies and generic filters. Copy it to the real config file the app and
watcher both read:

```bash
cp watcher/config.example.json watcher/config.json
```

`watcher/config.json` is gitignored — it's yours alone, never committed. You
won't hand-edit it further; the rest of setup happens in the browser.

## 4. Build the web app

```bash
cd web
npm install
npm run build
cd ..
```

You only need to redo this if you later pull frontend changes — not on every launch.

## 5. Launch Career HQ

- **Windows:** double-click [`career-hq.bat`](career-hq.bat) at the repo root — it starts the
  server if it isn't already running and opens the board in your browser.
- **Any OS:** `python -m uvicorn app.app:app --host 127.0.0.1 --port 8765`, then open
  `http://127.0.0.1:8765`.

The board will be empty — you haven't told it which companies to watch yet.

## 6. Add companies and filters (Settings tab)

Open the **Settings** tab and add a company. Each ATS needs different info,
and the dialog's fields switch automatically based on the adapter you pick:

| Adapter | What you need | Where to find it |
|---|---|---|
| Ashby / Lever / Workable | a **slug** | in the careers URL — `jobs.ashbyhq.com/{slug}`, `jobs.lever.co/{slug}`, `apply.workable.com/{slug}` |
| Workday | **tenant**, **wd instance**, **site** | careers URL looks like `{tenant}.{wd}.myworkdayjobs.com/{site}` — e.g. `acme.wd3.myworkdayjobs.com/External` → tenant `acme`, wd `wd3`, site `External` |
| SuccessFactors | **host** | the domain the employer's careers page runs on, e.g. `jobs.company.com` |

After filling in a company, hit **Test fetch** before saving — it does one
live poll through the real adapter and shows you how many jobs it found (or
a clear error if the slug/tenant is wrong), so you're not guessing whether
tomorrow's run will actually work.

Then set your **filters**: a job title has to match at least one *domain*
keyword (e.g. "data", "risk") **and** at least one *seniority* keyword (e.g.
"manager", "senior") to count as a match; anything hitting an *exclude*
keyword is vetoed regardless. Location filters work the same way. Keywords
are matched case-insensitively.

Hit **Save settings** — this writes `watcher/config.json` for you; you never
need to touch the JSON directly. Changes take effect on the *next* watcher
run, not instantly.

## 7. Add your resume (Profile tab)

Open the **Profile** tab and either paste your resume as plain text, or hit
**Upload file** and pick a `.docx`, `.pdf`, `.txt`, or `.md`. Uploads are
extracted to text and dropped into the textarea for you to review — nothing
saves until you review the text and hit **Save profile**. Add your rules and
preferences below it (comp targets, role shape, flexibility, anything you
want the AI scorer to weigh).

## 8. (Optional) Turn on AI fit scoring

Without an API key the app still works fully — poll, filter, browse, triage
by hand — you just won't get the 0-100 fit scores or deep-dive analysis.

1. Get a free key at [aistudio.google.com](https://aistudio.google.com/apikey).
2. Set it as a **user environment variable** named `GEMINI_API_KEY` (not just
   a one-off shell `export`/`$env:` — a scheduled task won't inherit those).
   - Windows: Settings → System → About → Advanced system settings →
     Environment Variables → New (User variables).
   - macOS/Linux: add `export GEMINI_API_KEY=...` to your shell profile
     (`.zshrc`, `.bashrc`), then open a new terminal.
3. Restart the app so it picks up the new variable. The gear icon in the app
   header shows whether the key is detected.

## 9. Schedule daily polling

The watcher is meant to run once a day unattended, politely (sequential
requests, ~1.5s apart, one retry on failure) — see the etiquette section of
[`watcher/README.md`](watcher/README.md). Pick your platform:

**Windows (Task Scheduler):**
1. Open Task Scheduler → *Create Basic Task*.
2. Trigger: **Daily**, pick a time.
3. Action: **Start a program** — program `python`, arguments
   `watcher\watcher.py`, "start in" the repo root folder.
4. In the task's Properties, check *"Run whether user is logged on or
   not"* if you want it to run even when locked, and confirm it will run
   under the same user account whose environment variable you set in step 8.

**macOS/Linux (cron):**
```bash
crontab -e
# add a line like:
0 8 * * * cd /path/to/resume_career && /usr/bin/python3 watcher/watcher.py >> watcher/cron.log 2>&1
```

You can always run it manually any time: `python watcher/watcher.py`
(add `--dry-run` to poll and print without saving anything).

## 10. (Optional) Phone push notifications

1. Install the **ntfy** app (Android/iOS), or use [ntfy.sh](https://ntfy.sh) in a browser.
2. Subscribe to a private, unguessable topic name — treat it like a password;
   anyone who knows it can read your notifications (job titles only, nothing
   more sensitive).
3. In the app's **Settings → Advanced**, set that topic name and save.

## Troubleshooting

- **Root page 404s, but `/api/...` works fine** — you skipped step 4; the
  backend only serves the built frontend from `web/dist`.
- **Scheduled runs don't score jobs even though manual runs do** — the
  scheduled task's user account doesn't have `GEMINI_API_KEY` set as a
  *user* environment variable; a variable set only in your interactive
  terminal session doesn't carry over.
- **A company you added finds 0 jobs** — re-check the slug/tenant/host
  against the careers page URL and hit **Test fetch** again; a small typo
  is the usual cause.
- **Settings tab looks empty on first launch** — make sure you completed
  step 3 (copying `config.example.json`); the app can run without a real
  `config.json` but starts you from the same empty template either way.

## What's yours, what's shared

Everything under `watcher/config.json`, `watcher/watcher.db`,
`watcher/digests/`, and your resume/profile text is local to your machine
and gitignored — never pushed anywhere by this project. If you fork this
repo publicly, run `python scripts/privacy_scan.py` before pushing; it
checks tracked files for accidentally-committed secrets or personal details.
