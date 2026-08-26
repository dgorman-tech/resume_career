/**
 * What every LLM affordance tells the user before it spends anything.
 *
 * Kept in one module so the wording cannot drift between the four places that
 * can call Gemini, and so a change to what is actually sent is a one-line edit
 * that updates every disclosure at once.
 */

export const SCORING_DISCLOSURE =
  "Sends your profile, rubric, and this job's description to Gemini.";

export const DEEP_DIVE_DISCLOSURE =
  "Deep dive sends your profile, rubric, this job's description, and comparable salary rows to Gemini.";

export const BULK_SCORING_DISCLOSURE =
  "Sends your profile, rubric, and each job's description to Gemini, one job at a time.";
