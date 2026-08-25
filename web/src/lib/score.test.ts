import { describe, expect, it } from "vitest";
import type { Dimension, Job } from "./types";
import { computeScore, scoreMap } from "./score";

const dim = (key: string, weight: number, archived = false): Dimension =>
  ({ key, label: key, description: "d", weight, position: 1, archived });

const job = (fit: number | null, subscores: Record<string, number> | null): Job =>
  ({ key: "k", company: "c", tier: 1, title: "t", location: "l", url: "u",
     salary_min: null, salary_max: null, posted_at: "", first_seen: "", source: "s",
     is_internal: false, is_new: false, status: "new", starred: false, note: "",
     fit, subscores, why: null, gaps: null, angle: null, lens: null, scored_at: null,
     stale: false, has_deep_dive: false });

describe("computeScore", () => {
  it("weights holistic fit and subscores", () => {
    // (50*80 + 10*100 + 10*50) / 70 = 5500/70 = 78.57 -> 79
    const j = job(80, { comp: 100, flex: 50 });
    expect(computeScore(j, [dim("comp", 10), dim("flex", 10)], 50)).toBe(79);
  });
  it("returns null for unscored jobs", () => {
    expect(computeScore(job(null, null), [dim("comp", 10)], 50)).toBeNull();
  });
  it("renormalizes over missing subscore keys", () => {
    // 'newdim' absent from this job's JSON drops out: (50*80 + 10*100) / 60 = 83.33 -> 83
    const j = job(80, { comp: 100 });
    expect(computeScore(j, [dim("comp", 10), dim("newdim", 40)], 50)).toBe(83);
  });
  it("ignores archived dims and unknown subscore keys", () => {
    // archived 'old' (weight 90, sub 0) must not drag the score to 10
    const j = job(null, { comp: 100, old: 0, stray: 0 });
    expect(computeScore(j, [dim("comp", 10), dim("old", 90, true)], 0)).toBe(100);
  });
  it("null when all present weights are zero", () => {
    expect(computeScore(job(80, { comp: 90 }), [dim("comp", 0)], 0)).toBeNull();
  });
  it("scoreMap keys by job key", () => {
    const m = scoreMap([{ ...job(80, null), key: "a" }], [], 50);
    expect(m.get("a")).toBe(80);
  });
});
