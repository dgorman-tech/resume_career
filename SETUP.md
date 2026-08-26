# Setup guide

Run your own copy of Career HQ: a local job watcher that polls public company
career pages (Ashby, Lever, Greenhouse, Workable, Workday, SuccessFactors)
and a small web app on top for triage, AI-assisted fit scoring, and a resume
profile. Nothing here touches LinkedIn, and nothing auto-applies to jobs —
see [Hard constraints](CLAUDE.md#hard-constraints-do-not-violate) in
`CLAUDE.md`.

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

## 2. Clone and bootstrap

```bash
git clone <this-repo-url>
cd resume_career
python3 scripts/setup.py
```

The bootstrap script checks your Python/Node versions, installs Python
dependencies, creates `watcher/config.json` and `.env` from their checked-in
templates (only if you don't already have them — it never overwrites), and
builds the web app. It prints what it's doing at each step, and if something
is genuinely missing (Node not installed, `pip install` failing, and so on)
it says so in plain language instead of dying with a traceback. It's safe to
run again any time, including after pulling updates.

When it finishes, skip ahead to [step 5](#5-launch-career-hq).

### Prefer to do it by hand?

```bash
pip install -r requirements.txt
cp watcher/config.example.json watcher/config.json    # if you haven't already
cp .env.example .env                                   # if you haven't already
cd web && npm install && npm run build && cd ..
```

`watcher/config.json` and `.env` are both gitignored — yours alone, never
committed. You won't hand-edit `config.json` further; the rest of setup
happens in the browser (see step 6).

## 3. (Skippable) First launch without setup

Even if you skip step 2 entirely, launching the app (step 5) auto-creates a
blank `watcher/config.json` from the checked-in template on first start, so
the Settings tab always has something real to read instead of looking
broken. You'll still need to build the web app by hand at some point — see
step 4 — since that's the one step the app can't do for itself at startup.

## 4. Build the web app

Only needed if you skipped the bootstrap script, or later pull frontend
changes:

```bash
cd web
npm install
npm run build
cd ..
```

If you open Career HQ before this has ever run, you'll get a plain page
explaining that the frontend isn't built yet and the exact command to fix
it — not a bare 404. The API underneath is working the whole time.

## 5. Launch Career HQ

- **macOS/Linux:** `./career-hq.sh` — starts the server if it isn't already
  running and opens the board in your default browser.
- **Windows:** double-click [`career-hq.bat`](career-hq.bat) at the repo root — does the same.
- **Any OS:** `python -m uvicorn app.app:app --host 127.0.0.1 --port 8765`, then open
  `http://127.0.0.1:8765`.

The board will be empty — you haven't told it which companies to watch yet.

## 6. Add companies and filters (Settings tab)

Open the **Settings** tab and add a company. The fastest way is to **paste a
job posting or careers-page URL** — the app detects the adapter for you
automatically, filling in the slug for Ashby/Lever/Greenhouse/Workable and
the tenant/wd/site for most Workday sites. SuccessFactors sites are
recognized too, but only get you the host — you'll still add the RSS search
feed(s) by hand, since those aren't guessable from a single URL. If a URL
isn't recognized at all, fill in the fields by hand using the table below:

| Adapter | What you need | Where to find it |
|---|---|---|
| Ashby / Lever / Workable | a **slug** | in the careers URL — `jobs.ashbyhq.com/{slug}`, `jobs.lever.co/{slug}`, `apply.workable.com/{slug}` |
| Greenhouse | a **slug** | in the careers URL — `boards.greenhouse.io/{slug}` or `job-boards.greenhouse.io/{slug}` |
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

## 7. Add your resume and requirements (Profile tab)

Open the **Profile** tab and either paste your resume as plain text, or hit
**Upload file** and pick a `.docx`, `.pdf`, `.txt`, or `.md`. Uploads are
extracted to text and dropped into the textarea for you to review — nothing
saves until you review the text and hit **Save profile**. Add your rules and
preferences below it (role shape, flexibility, anything you want the AI
scorer to weigh).

Then edit **Hard requirements** and set your **currency** — this matters
even if you never touch anything else on this screen: whatever you pick is
the currency your comp floor and goal are sent to the scoring model in, and
the currency the board's salary column displays. If you're not paid in CAD
(the default), set this before relying on any fit score or salary display —
otherwise a floor of "150000" gets treated as CAD when you meant EUR or GBP,
and every score built on it is wrong.

## 8. (Optional) Turn on AI fit scoring

Without an API key the app still works fully — poll, filter, browse, triage
by hand — you just won't get the 0-100 fit scores or deep-dive analysis.

1. Get a free key at [aistudio.google.com](https://aistudio.google.com/apikey).
2. Set it as `GEMINI_API_KEY`, using whichever of these fits how you'll run
   the watcher:
   - **Recommended: a `.env` file.** Put `GEMINI_API_KEY=your-key` in `.env`
     at the repo root (created for you by `scripts/setup.py`, or copy
     `.env.example` by hand). Both the app and the watcher load it
     automatically at startup — including a scheduled/unattended run, which
     is the case that actually matters here (see the note below).
   - **Alternative: a persistent OS environment variable.** Only needed if
     you'd rather not use a file. It must be a *user* environment variable,
     not a one-off shell `export`/`$env:` — a scheduled task won't inherit
     those.
     - Windows: Settings → System → About → Advanced system settings →
       Environment Variables → New (User variables).
     - macOS/Linux: add `export GEMINI_API_KEY=...` to your shell profile
       (`.zshrc`, `.bashrc`), then open a new terminal.
   - A real environment variable, if one is already set, always takes
     priority over the `.env` file.
3. Restart the app so it picks up the new key. The gear icon in the app
   header shows whether the key is detected.

**Why this matters for scheduling:** a shell `export` only exists for your
current terminal session — the process that runs your daily scheduled task
never sees it, so scoring silently fails on unattended runs even though it
works fine when you test manually. `.env` sidesteps this entirely, which is
why it's the recommended path.

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
   not"* if you want it to run even when locked.

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

- **A company you added finds 0 jobs** — re-check the slug/tenant/host
  against the careers page URL and hit **Test fetch** again; a small typo
  is the usual cause.
- **Scheduled runs don't score jobs even though manual runs do** — you're
  relying on an OS-level environment variable rather than `.env`, and the
  scheduled task's user account doesn't have `GEMINI_API_KEY` set as a
  *persistent user* variable (a variable set only in your interactive
  terminal session doesn't carry over). Switch to a `.env` file (step 8) to
  sidestep this entirely.
- **PDF resume upload fails** — a plain PDF always works with no extra
  setup. If yours is password-protected, remove the password and re-export
  before uploading; the app tells you which of the two happened rather than
  a generic error.

## What's yours, what's shared

Everything under `watcher/config.json`, `.env`, `watcher/watcher.db`,
`watcher/digests/`, and your resume/profile text is local to your machine
and gitignored — never pushed anywhere by this project. If you fork this
repo publicly, run `python scripts/privacy_scan.py` before pushing; it
checks tracked files for accidentally-committed secrets or personal details.
