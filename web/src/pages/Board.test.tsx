import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS, type Filters } from "../components/FilterBar";
import type { Job } from "../lib/types";
import { applyFilters } from "./Board";

const TODAY = "2026-08-25";

const job = (over: Partial<Job> = {}): Job => ({
  key: "k", company: "Wealthsimple", tier: 1, title: "Manager, AE", location: "Toronto",
  url: "", salary_min: null, salary_max: null, posted_at: "", first_seen: "", source: "ashby",
  closed_at: null, is_internal: false, is_new: false, status: "new", starred: false, note: "",
  next_action_at: null, next_action_note: "", fit: null, subscores: null, why: null, gaps: null,
  angle: null, lens: null, scored_at: null, stale: false, has_deep_dive: false, ...over,
});

const filters = (over: Partial<Filters> = {}): Filters => ({ ...DEFAULT_FILTERS, ...over });

describe("applyFilters", () => {
  it("still hides reviewed jobs behind the default unreviewed lens", () => {
    const jobs = [job({ key: "a" }), job({ key: "b", status: "applied" })];
    expect(applyFilters(jobs, filters(), TODAY).map((j) => j.key)).toEqual(["a"]);
  });

  it("keeps an overdue follow-up visible under the default lens, which is the whole promise", () => {
    // the board opens on 'unreviewed', so an applied job with a lapsed follow-up
    // would otherwise be invisible exactly when it matters
    const jobs = [job({ key: "a" }), job({ key: "b", status: "applied", next_action_at: "2026-08-01" })];
    expect(applyFilters(jobs, filters(), TODAY).map((j) => j.key)).toEqual(["a", "b"]);
  });

  it("keeps a closed posting you applied to visible under any status lens", () => {
    const jobs = [job({ key: "b", status: "applied", closed_at: "2026-08-25T00:00:00Z" })];
    expect(applyFilters(jobs, filters({ status: "dismissed" }), TODAY).map((j) => j.key)).toEqual(["b"]);
  });

  it("still honours an explicit search, so attention rows cannot ignore the query", () => {
    const jobs = [job({ key: "b", company: "Koho", status: "applied", next_action_at: "2026-08-01" })];
    expect(applyFilters(jobs, filters({ q: "shopify" }), TODAY)).toEqual([]);
  });

  it("still honours an explicit tier filter", () => {
    const jobs = [job({ key: "b", tier: 3, status: "applied", next_action_at: "2026-08-01" })];
    expect(applyFilters(jobs, filters({ tier: 1 }), TODAY)).toEqual([]);
  });

  it("does not exempt a merely upcoming follow-up", () => {
    const jobs = [job({ key: "b", status: "applied", next_action_at: "2026-12-01" })];
    expect(applyFilters(jobs, filters(), TODAY)).toEqual([]);
  });
});
