import type { MinLevel } from "./types";

export const LEVEL_OPTIONS: { value: MinLevel; label: string }[] = [
  { value: "", label: "Not set" },
  { value: "ic", label: "Individual contributor" },
  { value: "manager", label: "Manager" },
  { value: "senior_manager", label: "Senior Manager" },
  { value: "director", label: "Director" },
  { value: "vp_plus", label: "VP or above" },
];

/** The scorer's own label for a level (app/scorer.py `_LEVEL_LABELS`); "" means unset. */
export function levelLabel(level: MinLevel): string | null {
  return LEVEL_OPTIONS.find((o) => o.value === level && o.value !== "")?.label ?? null;
}

export function toIntOrNull(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Rough word count for the resume meta line. Good enough to spot a truncated extract. */
export function wordCount(text: string): number {
  const t = text.trim();
  return t === "" ? 0 : t.split(/\s+/).length;
}
