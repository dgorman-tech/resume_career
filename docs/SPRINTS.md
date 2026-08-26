# Career HQ — Sprint Plan

Eight sprints (0 through 7), each sized for one focused Claude Code session and independently
shippable. Sprint numbers are stable identifiers; run them in the execution order below. Every
sprint ends the same way: tests pass (`pytest` + `npm test` in `web/`), `python scripts/privacy_scan.py`
is clean, and the change is a single reviewable PR. (`web/`'s `test` script was missing before
Sprint 1; wiring `"test": "vitest run"` was its first task — vitest, jsdom, and testing-library
were already devDependencies.)

**Execution order — history and what's left (updated 2026-08-26):** shipped, in order:
1 → 2 → 4 → 3 → 0. Remaining: 5 → 6 → 7.

The original plan (revised 2026-08-25) was 1 → 2 → 4 → 5 → 6 → 7 → 3, deferring Sprint 3
(supply) behind the Application Kit. Sprint 3 shipped early instead of last — see its entry
below for why. Sprint 0 (Guest Ready) didn't exist in that plan at all: partway through, the
project's goal changed from a personal tool to something a few friends self-host — one of them
in Dublin, on EUR, with his own resume and watchlist — and a copy that's hardcoded to CAD, ships
a rubric shaped around one person's role opinions, and dead-ends a fresh clone before first
launch isn't guest-ready regardless of where it sits in the queue. Sprint 0 jumped ahead of
everything still unshipped to close that gap before any of it reached a friend. Data
dependencies from the original plan still hold: 2 and 4 feed 5–7; 3 feeds nothing downstream.

**Standing constraints for every sprint** (repeat these to Claude verbatim):

- `jobs` and `runs` tables are watcher-owned. App features never alter their schema; new
  data goes in new, additive tables (`app/db.py` pattern: `SCHEMA` + `*_ADDED_COLUMNS`).
- No LinkedIn, no auto-apply, no authenticated endpoints, polite polling (see CLAUDE.md
  hard constraints).
- Nothing is ever auto-dismissed by an LLM or a heuristic. Machines may flag and demote;
  only the user dismisses.
- UI follows PRODUCT.md: rows are the interface, keyboard-first, no funnel metrics, no
  gamification, honest states.
- All Gemini calls go through `app/scorer.py`'s `_call_llm` / `_stream_llm`. Do not add a
  third SDK touchpoint.
- Lightweight AI provenance on every LLM write (this is about trust and reproducibility,
  not analytics — the cost ledger stays cut): record the model, a prompt version, and
  hashes of the inputs (profile/rubric/JD as applicable); every UI affordance that can
  trigger an LLM call carries a plain one-line disclosure of what gets sent to Gemini;
  extracted facts and coverage claims cite verbatim source quotes, machine-checked.
- `profile.currency` (default `CAD`) is a first-class column now; `comp_floor`/`comp_goal`
  are its renamed, unsuffixed columns (no more `_cad`). Anything that reads, displays, or
  prompts an LLM with a comp number must carry `profile.currency` alongside it — never assume CAD.
- `app/scorer.py`'s `PROMPT_VERSION` is `"batch/2"`. Bump it again the next time
  `build_batch_prompt`'s shape changes, so `score_history` rows stay attributable to the
  exact prompt that produced them.
- `watcher/watcher.py`'s `_strip_html` unescapes HTML entities to a fixed point *before*
  stripping tags, not after — required for Greenhouse's `content` field, which arrives HTML
  escaped as text and sometimes doubly. Any new JD-text helper must follow the same order or
  reintroduce the bug Sprint 3 shipped and fixed.
- `app/jd_fetch.py`'s on-demand `_FETCHERS` (used to refill `jd_cache` when it's empty) has
  no `greenhouse` entry — Greenhouse JD text only ever reaches `jd_cache` via the watcher's
  `inline_jd` path, captured once at poll time. A backfill or re-score call for a Greenhouse
  job whose cache row is missing silently falls back to no-JD scoring instead of refetching.
  Known gap, not fixed in Sprint 0 — Sprint 4/5's backlog loops should close it or account for it.
- `.env` at the repo root (loader: `app/envfile.py`, stdlib only) is how unattended runs get
  `GEMINI_API_KEY`; a real OS environment variable always wins. Use
  `app.envfile.gemini_key_configured()` to check whether a key is actually usable — a bare
  truthiness check on the env var also passes on the literal placeholder `scripts/setup.py`
  copies from `.env.example` into every fresh clone's `.env`.

---

## Sprint 0 — Guest Ready

**Why:** every sprint above and below was built and tested against the owner's own working
copy — a real `watcher/config.json`, a built `web/dist`, an installed environment, salary
numbers hardcoded to CAD, and a rubric shaped around one person's role opinions. None of that
exists for a friend running this from a fresh `git clone`, and the project's goal changed
mid-flight from a personal tool to something a few friends self-host — one of them in Dublin,
on EUR, with his own resume and his own watchlist. Sprint 0 closes that gap before anything
ships to a friend.

**Shipped in:** `f57d39e` (currency + neutral rubric), `11992e4` (Greenhouse adapter +
paste-a-URL detect — this is Sprint 3, pulled forward; see its entry below for why), `a0e59cf`
(launcher, `.env`, bootstrap script, setup docs), plus a fresh-clone acceptance pass that found
and fixed one more guest-facing bug (see Acceptance).

**Scope**

*Phase 1 — currency is a first-class setting, the rubric is neutral (`f57d39e`)*
- `profile.comp_floor_cad`/`comp_goal_cad` renamed to `comp_floor`/`comp_goal`;
  `profile.currency` (default `CAD`) added. A guarded, idempotent `ensure_schema` migration
  backfills the renamed columns from the old ones on an existing DB without ever dropping them.
- The scoring prompt labels comp floor/goal with the profile's configured currency instead of
  a hardcoded CAD, and prefers a posting's verbatim `salary_raw` over a numeric range guessed
  into the wrong currency; `PROMPT_VERSION` bumped to `batch/2` so score history stays honest
  about which prompt produced a number.
- Board, drawer, and stats bar render salary in the profile's currency
  (CA$/US$/€/£/A$/NZ$/CHF /kr /₹/S$, else `"CODE "`).
- `DEFAULT_DIMENSIONS` swapped player-coach/cost-center for five neutral dimensions (comp,
  level & scope, flexibility & work location, domain & skills fit, growth & trajectory) — only
  affects fresh installs, since seeding fires only when `score_dimensions` is empty.

*Phase 2 — more supply, less setup friction (`11992e4`, = Sprint 3)*
- Full scope in Sprint 3's entry below — the `fetch_greenhouse` adapter and
  `POST /api/companies/detect`.
- Also fixed a latent bug the Greenhouse work surfaced: the shared JD HTML-stripping helper
  decoded entities after stripping tags, backwards for Greenhouse's `content` field (HTML
  escaped as text, sometimes doubly) — it now unescapes to a fixed point first.

*Phase 3 — a fresh clone actually reaches a working launch (`a0e59cf`)*
- `career-hq.sh` (macOS/Linux launcher, mirrors `career-hq.bat`): starts the server if it
  isn't already listening, waits, opens the browser (`open`/`xdg-open`, else prints the URL).
  Both launchers read `app.port` from `watcher/config.json` via shared `scripts/read_port.py`
  instead of hardcoding `8765` twice.
- The app and the watcher both auto-create `watcher/config.json` from the checked-in example
  at startup if it's missing (one log line, never touches an existing file).
- The root URL before `npm run build` returns an honest, self-contained page naming the exact
  fix instead of a bare 404; the API keeps working underneath the whole time.
- `.env` at the repo root (loader: `app/envfile.py`, stdlib only) covers `GEMINI_API_KEY` for
  scheduled/unattended runs — a real environment variable, if set, still wins.
- `scripts/setup.py`: a stdlib-only, re-runnable bootstrap — checks Python/Node versions,
  installs dependencies, creates `config.json`/`.env` from their templates, builds the web
  app, and fails with a plain-language message (never a bare traceback) at every step.
- Encrypted-PDF resume uploads get a specific, actionable error instead of a generic one
  (investigated the reported pypdf/cryptography/cffi gap — a clean install already pulls in
  cryptography+cffi transitively via `google-genai`, so a heavier pin wasn't the actual fix
  needed).
- `SETUP.md` rewritten around the bootstrap script as the happy path, paste-a-URL as the
  primary way to add a company, Greenhouse/SuccessFactors added to the adapter table, and a
  new step for setting currency in Profile → Hard requirements.

**Acceptance**

Verified end to end against a real fresh clone, not the working copy — `git clone` of the
pushed branch into a scratch directory, no copying of the working tree:

- The clone contained none of `watcher/config.json`, `.env`, `web/dist`, `node_modules`,
  `watcher.db` — gitignore holds.
- `python3 scripts/setup.py`, run verbatim, completed with no bare traceback: dependencies
  installed, `config.json`/`.env` created from their templates, web app built.
- `./career-hq.sh` started the server; the root URL served the actual built board (not the
  not-built page); `/api/health`, `/api/settings`, and `/api/profile` all responded.
- `POST /api/companies/detect` on a real Dublin Greenhouse posting
  (`job-boards.greenhouse.io/intercom/jobs/...`) correctly returned `adapter: greenhouse`,
  `slug: intercom`; saved via `PUT /api/settings`, then `watcher/watcher.py --dry-run` in the
  clone polled the live Intercom board (116 jobs, 13 matched) with zero DB writes.
- `currency: "EUR"` and a comp floor round-tripped through `PUT`/`GET /api/profile`; the
  board's salary formatting (`web/src/lib/format.ts`'s `CURRENCY_SYMBOLS`, covered by the
  passing web test suite) renders EUR as `€`.
- Found one guest-facing bug this walkthrough didn't catch on the first pass: right after
  `scripts/setup.py` runs, `.env` holds `.env.example`'s literal placeholder
  (`GEMINI_API_KEY=your-gemini-api-key-here`), and `/api/health`'s `key_present` was a bare
  `bool(os.environ.get(...))` — so a friend's gear icon reports the key as present, and the
  first scoring attempt fails with an opaque Gemini auth error instead of the plain "add your
  key" message they'd get from no key at all. Fixed: `app.envfile.gemini_key_configured()`
  treats that exact placeholder as absent; wired into `/api/health` and both of `scorer.py`'s
  LLM touchpoints (`_call_llm`, `_stream_llm`).

**Out of scope**

- Windows was not re-tested end to end this phase (no Windows environment available in this
  session) — only the macOS/Linux launcher path was exercised against a real fresh clone.
- `app/jd_fetch.py`'s on-demand fetchers still lack a `greenhouse` entry (see Standing
  constraints) — not hit by this phase's walkthrough since no `GEMINI_API_KEY` was configured,
  but a real gap for Sprint 4/5 to account for.
- Making Python/Node installation itself friend-proof — `scripts/setup.py` checks versions and
  gives plain instructions, but the friend still installs both themselves per `SETUP.md`'s
  prerequisites.

---

## Sprint 1 — Nothing slips: pipeline-close alerts + next actions

**Why first:** the watcher already detects closed postings and `job_state` already knows
what you've applied to, but nothing connects them — a posting you applied to can close
silently. This sprint delivers the core "nothing slips through" promise with almost no
new machinery.

**Scope**

- Delivery gate first: add `"test": "vitest run"` to `web/package.json` so the standing
  `npm test` gate actually runs (vitest, jsdom, and testing-library are already installed;
  no config changes expected).
- Schema: add `next_action_at TEXT` and `next_action_note TEXT` to `job_state`
  (additive column migration, same pattern as `PROFILE_ADDED_COLUMNS`).
- Watcher: after `upsert_jobs`, join newly closed keys against
  `job_state.status IN ('interested','applied')`. Matches get their own section in the
  daily digest and their own ntfy push line ("Applied posting closed: {company} — {title}").
- API: `PATCH /api/jobs/{key}` accepts `next_action_at` / `next_action_note`.
- UI: a due/overdue chip on board rows; overdue-and-today items sort to a "Needs attention"
  group at the top of the board (or a dedicated filter in `FilterBar`); a keyboard shortcut
  in the existing `useKeyboard` layer to set a follow-up date from the drawer.
- Stale-score repair: today the UI flags stale scores but `/api/score-unscored` selects
  only never-scored jobs (`s.key IS NULL`), so a stale score can never be repaired. Add
  "Re-score stale shortlisted roles": an endpoint (sibling of or extension to
  `score-unscored`, reusing `_run_backfill` and its limit/pacing) scoped to open jobs that
  are stale AND (`status IN ('interested','applied')` OR starred). The UI affordance lives
  next to the existing backfill button in the health/scoring dialog, shows the exact count,
  and requires explicit confirmation before any call is made.
- Drawer accessibility: `JobDrawer` is a hand-rolled `motion.aside` overlay with no dialog
  semantics. Give it `role="dialog"`/`aria-modal`, trap focus while open, and return focus
  to the triggering row on close. `@radix-ui/react-dialog` is already a dependency —
  reusing it (keeping the motion styling) gets trapping and return for free.
- Narrow screens: no card stack (stays cut), but the fixed-layout board table hides key
  content at 390px. Add a column-priority treatment — collapse or drop low-priority columns
  at narrow widths so title, company, status, and fit stay readable; the page body must
  never scroll horizontally.

**Acceptance**

- A job with status `applied` whose `closed_at` gets set during a run appears in the digest
  and ntfy output (unit-test the join, don't hit real endpoints).
- Overdue next actions are visible without scrolling on app open.
- Closed-but-in-pipeline jobs remain visible in the app (they must not vanish from
  `JOBS_SQL` just because they closed).
- `npm test` in `web/` runs the vitest suite and passes.
- The stale re-score never fires without confirmation and touches only the bounded
  shortlisted set (unit-test the selection query).
- Drawer focus is trapped while open and returns to the triggering row on close
  (testing-library test).
- At 390px the board shows title, company, status, and fit without horizontal scrolling.

**Out of scope:** full CRM stages, contacts, interview journal.

**Prompt to hand Claude:**

> Read CLAUDE.md, PRODUCT.md, and docs/SPRINTS.md Sprint 1, then implement it exactly as
> scoped. Standing constraints apply. Wire the `npm test` script first. Write tests for the
> watcher join, the API changes (including the stale re-score selection), and the drawer
> focus behavior; run the full test suites and the privacy scan before committing.

---

## Sprint 2 — Start collecting taste: dismiss reasons + score history

**Why second:** dismissal reasons are labelled preference data whose value compounds with
time — every day this isn't shipped is training data lost. Score history makes rubric
edits measurable later. Both are tiny.

**Scope**

- Schema: add `dismiss_reason TEXT` to `job_state` with a CHECK on
  `('comp','rto','level','domain','company','other')`, nullable.
- API: `PATCH` validates the enum; setting status away from `dismissed` clears the reason.
- UI: pressing the dismiss shortcut opens a one-tap reason chip row (keyboard 1–6) before
  confirming; reason shows in the job drawer. Dismissing must stay a ≤2-keystroke flow.
- Schema: new `score_history` table `(key, fit, subscores, why, gaps, angle, lens, model,
  prompt_version, profile_hash, rubric_hash, jd_hash, scored_at)` — append-only. `score_job`
  in `app/scorer.py` inserts a history row alongside the existing `job_scores` upsert,
  hashing the exact profile/rubric/JD text it sent. No UI for history yet.
- Disclosure: every affordance that can start a scoring call (score-now, backfill, stale
  re-score) carries one plain line: "Scoring sends your profile, rubric, and this job's
  description to Gemini."

**Acceptance**

- Dismissing records a reason; re-scoring a job leaves prior history rows intact.
- Every new history row records model, prompt version, and input hashes.
- Triage speed unchanged: dismiss-with-reason works entirely from the keyboard.

**Out of scope:** any LLM use of the reasons (that's Sprint 7), history charts.

**Prompt to hand Claude:**

> Read CLAUDE.md, PRODUCT.md, and docs/SPRINTS.md Sprint 2, then implement it. Standing
> constraints apply. The dismiss flow must remain keyboard-first and ≤2 keystrokes;
> follow the existing ChipListInput / useKeyboard patterns. Tests + privacy scan before commit.

---

## Sprint 3 — More supply: Greenhouse adapter + paste-a-URL company add

**Why:** the hand-curated company list is the ceiling on the whole system. Greenhouse is
the most common public ATS not yet covered, and "paste any job URL, get the company
watched" removes the friction that keeps the list small.

**When:** shipped early, in `11992e4`, as the second phase of Sprint 0 — not deferred to last
as the 2026-08-25 plan called for. Two things pulled it forward: the Dublin friend's watchlist
leans on Greenhouse, a board this app had zero coverage of before this sprint; and paste-a-URL
removes the exact setup friction — knowing what a "slug" or "tenant" is and digging one out of
a careers URL by hand — that would otherwise stop a non-technical guest at the first step of
Settings. The original deferral reasoning still holds for the owner's own instance (supply is
adequate, conversion is the binding constraint); it just stopped being a reason to hold this
specific sprint back once a guest with a different watchlist entered the picture.

**Scope**

- Watcher: `fetch_greenhouse(session, cfg, company)` against
  `https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true`, registered in
  `ADAPTERS`, mapping title/location/url/posted_at and salary where present, matching the
  shape the other adapters return. Respect existing pacing and retry behavior.
- App: `POST /api/companies/detect` — given a pasted job or board URL, pattern-match
  ashby / lever / greenhouse / workable / workday hostnames and extract the slug/tenant.
  Settings tab gets a "paste a URL" affordance that pre-fills the existing add-company form
  (reuse `CompanyDialog`); the user confirms name/tier before saving. No fetching from the
  detect endpoint — it's pure URL parsing.
- `watcher/README.md` updated for the new adapter (`watcher/config.example.json` needed no
  change — its `companies` list ships empty).
- Shipped wider than originally scoped: `detect_company_url` also recognizes SuccessFactors
  hosts (host-only — feed URLs still get added by hand, since they aren't guessable from a
  single job URL), for six ATS shapes total.

**Acceptance**

- `python watcher/watcher.py --dry-run` succeeds against a real public Greenhouse board.
  Re-verified in Sprint 0's fresh-clone acceptance pass against Intercom's live board.
- URL detection has unit tests covering all six ATS URL shapes, including negatives.

**Out of scope:** automated company discovery, news feeds, directory crawling.

**Prompt to hand Claude:**

> Read CLAUDE.md, watcher/README.md, and docs/SPRINTS.md Sprint 3, then implement it.
> Standing constraints apply — match the existing adapter contract in watcher.py exactly,
> and keep the detect endpoint parse-only (no outbound requests). Tests + privacy scan.

---

## Sprint 4 — Structured JD facts

**Why:** one cheap extraction pass per job turns free-text JDs into queryable fields:
non-LLM board facets, salary/deadline backfill for the comp evidence base, and
hard-requirement flags. Sprints 5–7 all read from this table.

**Scope**

- Schema: new `job_facts` table:
  `(key PK REFERENCES jobs(key), years_min INTEGER, level TEXT, office_days INTEGER,
  remote_policy TEXT, must_haves TEXT /*JSON array*/, salary_min_jd REAL, salary_max_jd REAL,
  apply_deadline TEXT, visa_or_clearance TEXT, evidence TEXT /*JSON: field → verbatim JD
  quote*/, confidence INTEGER, model TEXT, prompt_version TEXT, jd_hash TEXT, extracted_at TEXT)`.
- Extraction: `extract_facts(...)` in a new `app/facts.py`, calling `_call_llm` with a JSON
  schema (mirror `build_batch_schema` / `_validate` patterns, clamp and bound everything).
  Runs in the daily watcher scoring step for new matches, plus
  `POST /api/jobs/{key}/extract-facts` for backfill; a bounded backlog loop like
  `SCORE_RETRY_CAP` handles history.
- Evidence, machine-checked: the schema requires a short verbatim JD quote per extracted
  non-null field (each `must_haves` entry included). The validator checks each quote is a
  substring of the cached JD (whitespace-normalized) and nulls any field whose quote is
  missing or not found — a wrong extraction must never become an opaque, highly influential
  badge. The drawer shows the quote under each fact and under each conflict badge.
- Conflict flags: pure-Python comparison of facts vs profile hard requirements
  (`max_office_days`, `min_level`, `comp_floor_cad`). Conflicts render as a warning badge
  on the row and sort the job down — never auto-dismiss (standing constraint).
- Facets: `FilterBar` gains filters for remote policy, office days, and "has JD salary".
- Salary display: where `jobs.salary_min` is null but `salary_min_jd` exists, the board
  shows the JD-sourced range, visibly marked as JD-sourced.

**Acceptance**

- Extraction is validated/clamped like scores; a malformed LLM response never writes a row.
- Every stored non-null fact carries a quote found verbatim in the cached JD; a fact whose
  quote fails the substring check is dropped, not stored (unit-test both directions).
- A job conflicting with a hard requirement is flagged and demoted but still visible and
  still scorable; the badge's evidence quote is one click away in the drawer.
- The extract-facts affordance discloses that the JD is sent to Gemini.
- `jobs` table untouched.

**Out of scope:** comp percentiles UI (Sprint 7), any change to the scoring prompt.

**Prompt to hand Claude:**

> Read CLAUDE.md, app/scorer.py, and docs/SPRINTS.md Sprint 4, then implement it. Standing
> constraints apply — especially: flags demote, they never dismiss, and jobs/runs schemas
> are untouched. Tests for validation, conflict logic, and the API; privacy scan before commit.

---

## Sprint 5 — Application Kit foundations: achievement bank + answer bank + coverage

**Why:** the anti-hallucination architecture for T3. The LLM will later *select and
rephrase* from an evidence bank, never invent. The coverage report alone is an apply/skip
decision tool.

**Scope**

- Schema: `achievements (id INTEGER PK, bullet TEXT NOT NULL, metric TEXT, tags TEXT /*JSON*/,
  project TEXT, date_range TEXT, archived INTEGER DEFAULT 0)` and
  `answers (id INTEGER PK, question_tag TEXT NOT NULL, question TEXT, answer TEXT NOT NULL,
  updated_at TEXT)` (question_tag examples: why_company, salary_expectation, notice_period).
- CRUD API + UI: a "Bank" tab (or Profile-page section — follow the existing read-first
  Profile layout) listing achievements and answers with add/edit/archive. Optional one-shot
  LLM assist: "propose achievements from my resume text" → user reviews and accepts each.
- Coverage report: `POST /api/jobs/{key}/coverage` — input is `job_facts.must_haves` +
  cached JD + the achievement bank; output per requirement:
  `{requirement, status: covered|adjacent|missing, achievement_ids[]}` via `_call_llm`
  with a schema. Each requirement row carries its JD evidence quote (inherited from the
  Sprint 4 `must_haves` evidence), and the stored report records model + prompt version.
  Rendered in the job drawer as a plain three-state list (label + color, never color
  alone). The coverage affordance discloses that the JD and achievement bank are sent
  to Gemini.

**Acceptance**

- Every `covered`/`adjacent` row cites real achievement IDs; the validator rejects IDs not
  in the bank.
- Bank CRUD works with an empty LLM environment (`GEMINI_API_KEY` unset) — only coverage
  needs the key.

**Out of scope:** resume/cover-letter generation (Sprint 6).

**Prompt to hand Claude:**

> Read CLAUDE.md, PRODUCT.md, docs/SPRINTS.md Sprint 5, and the existing Profile page
> code, then implement it. Standing constraints apply. The coverage validator must reject
> hallucinated achievement IDs. Tests + privacy scan before commit.

---

## Sprint 6 — Application Kit generation

**Why:** the actual T3 deliverable, on the rails Sprint 5 built.

**Scope**

- Schema: `application_kit (key REFERENCES jobs(key), resume_md TEXT, cover_md TEXT,
  source_achievements TEXT /*JSON id array*/, model TEXT, prompt_version TEXT, jd_hash TEXT,
  generated_at TEXT, sent_at TEXT, PRIMARY KEY (key, generated_at))` — versioned per
  generation, so you can always see which version went out (`sent_at` marks it).
- Generation: `POST /api/jobs/{key}/kit` streams like `deep_dive_stream` for progress, but
  the model's output is a structured envelope, not free markdown: schema-enforced JSON
  (mirror the scorer's schema/validate pattern) of
  `{resume_bullets: [{text, achievement_ids[]}], cover_md, cover_claims: [{claim, source}]}`.
  The prompt gets the JD, `job_facts`, the coverage report, and the achievement bank, with
  the hard instruction that every resume bullet rephrases its cited achievements and the
  cover letter may only claim facts present in the bank or resume text.
- Validation before anything renders or persists: the envelope is parsed and machine-checked
  — every bullet cites ≥1 achievement ID that exists in the bank (and isn't archived);
  "cited achievement IDs" is enforced in code, never merely requested in prose. Only a
  valid envelope is rendered to markdown and saved; a failed validation shows an honest
  error and saves nothing.
- UI: kit panel in the job drawer — generate, review with audit view (bullet ↔ source
  achievement side by side, driven by the envelope's citations), copy-to-clipboard as
  markdown, "mark as sent" (sets `sent_at`). Past versions listed, read-only. The generate
  affordance discloses that the resume text, achievement bank, JD, and coverage report are
  sent to Gemini.

**Acceptance**

- A generated bullet with no valid achievement citation fails envelope validation and is
  not saved; the check runs on parsed IDs against the bank, not on prose.
- Raw streamed output is never rendered as the kit; the saved kit and audit view are built
  only from the validated envelope.
- Marking sent never mutates the stored markdown; regeneration creates a new version.

**Out of scope:** docx/pdf export, auto-filling any external form.

**Prompt to hand Claude:**

> Read CLAUDE.md, docs/SPRINTS.md Sprint 6, and app/scorer.py's deep-dive streaming path,
> then implement it. Standing constraints apply — generation is grounded in the achievement
> bank with enforced citations; no auto-apply anything. Tests + privacy scan before commit.

---

## Sprint 7 — Close the loop: weekly calibration prompt + comp evidence

**Why:** turns the data from Sprints 2 and 4 into judgment. Half of this sprint is a
prompt, not code — the weekly scheduled Claude task is the natural home for reflection.

**Scope**

- `docs/weekly_review_prompt.md` — a checked-in, personal-data-free prompt for the weekly
  Claude task that reads the DB and produces: (a) proposed `rules_text` / dimension edits
  derived from recent dismiss reasons and stars, each with the evidence rows that justify
  it, for manual accept/reject; (b) a revealed-preference audit (stated weights vs actual
  star/dismiss behavior); (c) a short factual retro (applied, responses, stale
  next-actions). Tone per PRODUCT.md: honest, no cheerleading, no funnel language.
- Comp evidence API: `GET /api/comp-evidence?level=&title_like=` — percentile bands
  (p25/p50/p75, n) over accrued salary data, combining `jobs.salary_*` with Sprint 4's
  JD-sourced ranges, grouped by `job_facts.level`. Pure SQL/Python, no LLM.
- UI: in the job drawer, one line under salary: "p50 of {n} comparable postings: {range}"
  with a link to the evidence rows. The deep-dive prompt's salary-evidence query is
  upgraded to use the same source.
- Repost detection (small, fits here): on the board, a "reposted" badge where the same
  company+title closed and reappeared; computed in SQL from `first_seen`/`closed_at`
  history. Reposts feed the evidence view ("posting previously open {n} days").

**Acceptance**

- The weekly prompt file contains zero personal data (it instructs Claude to read the
  local DB; it does not embed resume, comp numbers, or company names) and passes the
  privacy scan.
- Comp percentiles return honest `n`; the UI shows nothing when `n < 5` rather than a
  misleading band.

**Out of scope:** automatic application of proposed rubric edits; embeddings; multi-model
ensembles (deliberately cut — see the review that produced this plan).

**Prompt to hand Claude:**

> Read CLAUDE.md, PRODUCT.md, and docs/SPRINTS.md Sprint 7, then implement it. Standing
> constraints apply. The weekly prompt proposes, the user disposes — nothing self-applies.
> Small-n comp bands are suppressed, not shown. Tests + privacy scan before commit.

---

## Deliberately not planned

Cut after review, with reasons, so future sessions don't re-propose them:

- **Embeddings / "more like this"** — corpus too small; FTS5 (candidate for a future
  sprint) covers search.
- **Flash-vs-Pro disagreement ensemble** — the on-demand Pro deep dive already is the
  second opinion.
- **Cost ledger table/UI** — a log line suffices at personal-watchlist volume.
- **Card-stack triage mode** — j/k on rows already is the triage flow; PRODUCT.md's "rows
  are the interface" cuts against a second UI.
- **Multi-profile / hosted multi-tenancy** — re-affirmed after Sprint 0, now with the friend
  use case actually in hand rather than hypothetical: each friend self-hosts their own
  instance, own DB, own `.env`; guest-proofing (Sprint 0) means good defaults, not
  multi-tenancy. Hosting everyone's data centrally was considered and rejected — it would make
  the owner a data controller for other people's CVs and comp expectations, and a
  Dublin-resident friend turns that into a real GDPR posture, not a hypothetical one.
- **Funnel conversion metrics** — explicit PRODUCT.md anti-reference.
- **Provider abstraction** — deferred until a second real user asks; the two-touchpoint
  isolation in scorer.py is enough for now.
