/** The dismissal vocabulary, mirroring the CHECK constraint on job_state.
 *  Order is the keyboard order: 1-6 while the reason picker is open. */
export const DISMISS_REASONS = [
  { key: "comp", label: "Comp" },
  { key: "rto", label: "RTO" },
  { key: "level", label: "Level" },
  { key: "domain", label: "Domain" },
  { key: "company", label: "Company" },
  { key: "other", label: "Other" },
] as const;

export type DismissReason = (typeof DISMISS_REASONS)[number]["key"];

const BY_KEY = new Map<string, string>(DISMISS_REASONS.map((r) => [r.key, r.label]));

export function dismissLabel(reason: string | null): string | null {
  return reason ? (BY_KEY.get(reason) ?? reason) : null;
}

/** '1'-'6' -> reason, anything else -> null. */
export function reasonForDigit(digit: string): DismissReason | null {
  const i = Number(digit) - 1;
  return Number.isInteger(i) && i >= 0 && i < DISMISS_REASONS.length
    ? DISMISS_REASONS[i].key
    : null;
}
