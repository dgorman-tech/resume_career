import type { Job } from "./types";

export type NextActionState = "overdue" | "today" | "upcoming";

/** Why a job is being surfaced above the rest of the board. */
export type AttentionReason = "closed" | "overdue" | "today";

const PURSUING = new Set(["interested", "applied"]);

/** Local calendar day. Follow-ups are days on a calendar, so comparing them
 *  against a UTC instant would move the deadline for anyone west of London. */
export function todayISO(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function nextActionState(job: Job, today: string): NextActionState | null {
  if (!job.next_action_at) return null;
  if (job.next_action_at < today) return "overdue";
  if (job.next_action_at === today) return "today";
  return "upcoming";
}

export function attentionReason(job: Job, today: string): AttentionReason | null {
  // a posting closing under you outranks a follow-up: the window may be gone
  if (job.closed_at && PURSUING.has(job.status)) return "closed";
  const state = nextActionState(job, today);
  return state === "overdue" || state === "today" ? state : null;
}

export function partitionAttention(jobs: Job[], today: string): { attention: Job[]; rest: Job[] } {
  const attention: Job[] = [];
  const rest: Job[] = [];
  for (const j of jobs) (attentionReason(j, today) ? attention : rest).push(j);
  return { attention, rest };
}

/** Flattened display order. Keyboard navigation walks this so j/k follows the
 *  rows as drawn rather than the pre-grouping sort. */
export function orderByAttention(jobs: Job[], today: string): Job[] {
  const { attention, rest } = partitionAttention(jobs, today);
  return [...attention, ...rest];
}
