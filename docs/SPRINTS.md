# Career HQ — Sprint Plan

Seven sprints, each sized for one focused Claude Code session and independently shippable.
Order matters: each sprint's data feeds the ones after it. Every sprint ends the same way:
tests pass (`pytest` + `npm test` in `web/`), `python scripts/privacy_scan.py` is clean,
and the change is a single reviewable PR.

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

---

## Sprint 1 — Nothing slips: pipeline-close alerts + next actions

**Why first:** the watcher already detects closed postings and `job_state` already knows
what you've applied to, but nothing connects them — a posting you applied to can close
silently. This sprint delivers the core "nothing slips through" promise with almost no
new machinery.

**Scope**

- Schema: add `next_action_at TEXT` and `next_action_note TEXT` to `job_state`
  (additive column migration, same pattern as `PROFILE_ADDED_COLUMNS`).
- Watcher: after `upsert_jobs`, join newly closed keys against
  `job_state.status IN ('interested','applied')`. Matches get their own section in the
  daily digest and their own ntfy push line ("Applied posting closed: {company} — {title}").
- API: `PATCH /api/jobs/{key}` accepts `next_action_at` / `next_action_note`.
- UI: a due/overdue chip on board rows; overdue-and-today items sort to a "Needs attention"
  group at the top of the board (or a dedicated filter in `FilterBar`); a keyboard shortcut
  in the existing `useKeyboard` layer to set a follow-up date from the drawer.

**Acceptance**

- A job with status `applied` whose `closed_at` gets set during a run appears in the digest
  and ntfy output (unit-test the join, don't hit real endpoints).
- Overdue next actions are visible without scrolling on app open.
- Closed-but-in-pipeline jobs remain visible in the app (they must not vanish from
  `JOBS_SQL` just because they closed).

**Out of scope:** full CRM stages, contacts, interview journal.

**Prompt to hand Claude:**

> Read CLAUDE.md, PRODUCT.md, and docs/SPRINTS.md Sprint 1, then implement it exactly as
> scoped. Standing constraints apply. Write tests for the watcher join and the API changes;
> run the full test suites and the privacy scan before committing.

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
  scored_at)` — append-only. `score_job` in `app/scorer.py` inserts a history row alongside
  the existing `job_scores` upsert. No UI for history yet.

**Acceptance**

- Dismissing records a reason; re-scoring a job leaves prior history rows intact.
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
- `watcher/config.example.json` and `watcher/README.md` updated for the new adapter.

**Acceptance**

- `python watcher/watcher.py --dry-run` succeeds against a real public Greenhouse board.
- URL detection has unit tests covering all five ATS URL shapes, including negatives.

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
  apply_deadline TEXT, visa_or_clearance TEXT, confidence INTEGER, model TEXT, extracted_at TEXT)`.
- Extraction: `extract_facts(...)` in a new `app/facts.py`, calling `_call_llm` with a JSON
  schema (mirror `build_batch_schema` / `_validate` patterns, clamp and bound everything).
  Runs in the daily watcher scoring step for new matches, plus
  `POST /api/jobs/{key}/extract-facts` for backfill; a bounded backlog loop like
  `SCORE_RETRY_CAP` handles history.
- Conflict flags: pure-Python comparison of facts vs profile hard requirements
  (`max_office_days`, `min_level`, `comp_floor_cad`). Conflicts render as a warning badge
  on the row and sort the job down — never auto-dismiss (standing constraint).
- Facets: `FilterBar` gains filters for remote policy, office days, and "has JD salary".
- Salary display: where `jobs.salary_min` is null but `salary_min_jd` exists, the board
  shows the JD-sourced range, visibly marked as JD-sourced.

**Acceptance**

- Extraction is validated/clamped like scores; a malformed LLM response never writes a row.
- A job conflicting with a hard requirement is flagged and demoted but still visible and
  still scorable.
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
  with a schema. Rendered in the job drawer as a plain three-state list (label + color,
  never color alone).

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
  source_achievements TEXT /*JSON id array*/, model TEXT, generated_at TEXT, sent_at TEXT,
  PRIMARY KEY (key, generated_at))` — versioned per generation, so you can always see
  which version went out (`sent_at` marks it).
- Generation: `POST /api/jobs/{key}/kit` streams like `deep_dive_stream`. The prompt gets
  the JD, `job_facts`, the coverage report, and the achievement bank, with the hard
  instruction that every resume bullet must be a rephrasing of a cited achievement ID and
  the cover letter may only claim facts present in the bank or resume text. Output includes
  the ID citations; the UI shows an audit view (bullet ↔ source achievement side by side).
- UI: kit panel in the job drawer — generate, review with audit view, copy-to-clipboard
  as markdown, "mark as sent" (sets `sent_at`). Past versions listed, read-only.

**Acceptance**

- A generated bullet with no valid achievement citation fails validation and is not saved.
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
- **Multi-profile** — friends run their own instance; guest-proofing means good defaults,
  not multi-tenancy.
- **Funnel conversion metrics** — explicit PRODUCT.md anti-reference.
- **Provider abstraction** — deferred until a second real user asks; the two-touchpoint
  isolation in scorer.py is enough for now.
