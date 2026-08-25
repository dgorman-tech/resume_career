import { describe, expect, it } from "vitest";
import type { Job } from "../lib/types";
import { DEFAULT_SORT, sortJobs } from "./BoardTable";

const j = (key: string, tier = 1): Job =>
  ({ key, company: "c", tier, title: "t", location: "l", url: "u",
     salary_min: null, salary_max: null, posted_at: "", first_seen: "", source: "s",
     is_internal: false, is_new: false, status: "new", starred: false, note: "",
     fit: null, subscores: null, why: null, gaps: null, angle: null, lens: null,
     scored_at: null, stale: false, has_deep_dive: false });

describe("sortJobs by score", () => {
  it("defaults to score descending with unscored last", () => {
    expect(DEFAULT_SORT).toEqual({ col: "score", dir: "desc" });
    const scores = new Map<string, number | null>([["a", 70], ["b", 90], ["c", null]]);
    const out = sortJobs([j("a"), j("b"), j("c")], DEFAULT_SORT, scores);
    expect(out.map((x) => x.key)).toEqual(["b", "a", "c"]);
  });
  it("still sorts non-score columns", () => {
    const out = sortJobs([j("a", 3), j("b", 1)], { col: "tier", dir: "asc" }, new Map());
    expect(out.map((x) => x.key)).toEqual(["b", "a"]);
  });
});
