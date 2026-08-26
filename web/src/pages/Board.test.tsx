import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS, type Filters } from "../components/FilterBar";
import { makeFacts, makeJob } from "../test-utils/job";
import type { Job } from "../lib/types";
import { applyFilters } from "./Board";

const TODAY = "2026-08-25";

const job = (over: Partial<Job> = {}): Job => makeJob({ company: "Wealthsimple", ...over });

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

describe("applyFilters over JD facts", () => {
  const withFacts = (key: string, over: Parameters<typeof makeFacts>[0]) =>
    job({ key, facts: makeFacts(over) });

  it("filters to a remote policy", () => {
    const jobs = [withFacts("a", { remote_policy: "remote" }),
                  withFacts("b", { remote_policy: "onsite" })];
    const out = applyFilters(jobs, filters({ status: "all", remote: "remote" }), TODAY);
    expect(out.map((j) => j.key)).toEqual(["a"]);
  });

  it("hides jobs whose description was never read, rather than guessing", () => {
    const jobs = [job({ key: "a", facts: null })];
    expect(applyFilters(jobs, filters({ status: "all", remote: "remote" }), TODAY)).toEqual([]);
  });

  it("filters to an office-day ceiling, inclusive", () => {
    const jobs = [withFacts("a", { office_days: 2 }), withFacts("b", { office_days: 4 })];
    const out = applyFilters(jobs, filters({ status: "all", maxOfficeDays: 2 }), TODAY);
    expect(out.map((j) => j.key)).toEqual(["a"]);
  });

  it("treats an office-day ceiling of zero as a real filter, not an absent one", () => {
    const jobs = [withFacts("a", { office_days: 0 }), withFacts("b", { office_days: 1 })];
    const out = applyFilters(jobs, filters({ status: "all", maxOfficeDays: 0 }), TODAY);
    expect(out.map((j) => j.key)).toEqual(["a"]);
  });

  it("filters to jobs whose description stated a salary", () => {
    const jobs = [withFacts("a", { salary_min_jd: 170000 }), withFacts("b", {})];
    const out = applyFilters(jobs, filters({ status: "all", jdSalaryOnly: true }), TODAY);
    expect(out.map((j) => j.key)).toEqual(["a"]);
  });

  it("leaves the board alone when no facet is set", () => {
    const jobs = [job({ key: "a", facts: null }), withFacts("b", { office_days: 5 })];
    const out = applyFilters(jobs, filters({ status: "all" }), TODAY);
    expect(out.map((j) => j.key)).toEqual(["a", "b"]);
  });

  it("does not let an overdue follow-up smuggle a job past an explicit facet", () => {
    // status is a lens attention breaks through; a facet is a deliberate narrowing
    const jobs = [job({ key: "a", next_action_at: "2026-08-01", facts: null })];
    expect(applyFilters(jobs, filters({ remote: "remote" }), TODAY)).toEqual([]);
  });
});
