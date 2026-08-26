import type { Job, JobFacts } from "../lib/types";

/** A neutral Job for tests to override. Kept in one place because every sprint
 *  that adds a column to job_state would otherwise edit five fixtures. */
export function makeJob(over: Partial<Job> = {}): Job {
  return {
    key: "k", company: "c", tier: 1, title: "t", location: "l", url: "u",
    salary_min: null, salary_max: null, salary_raw: null, posted_at: "", first_seen: "", source: "s",
    closed_at: null, is_internal: false, is_new: false,
    status: "new", starred: false, note: "",
    next_action_at: null, next_action_note: "", dismiss_reason: null,
    fit: null, subscores: null, why: null, gaps: null, angle: null, lens: null,
    scored_at: null, stale: false, has_deep_dive: false,
    facts: null, conflicts: [],
    ...over,
  };
}

/** JobFacts with everything unset, for overriding one field at a time. */
export function makeFacts(over: Partial<JobFacts> = {}): JobFacts {
  return {
    years_min: null, level: null, office_days: null, remote_policy: null,
    must_haves: [], salary_min_jd: null, salary_max_jd: null, apply_deadline: null,
    visa_or_clearance: null, evidence: {}, confidence: 0, extracted_at: "2026-08-25T00:00:00Z",
    ...over,
  };
}
