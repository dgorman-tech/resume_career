import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeFacts, makeJob } from "../test-utils/job";
import type { Job } from "../lib/types";
import { BoardTable, COLS, DEFAULT_SORT, sortJobs } from "./BoardTable";

const TODAY = "2026-08-25";

const j = (key: string, tier = 1, over: Partial<Job> = {}): Job =>
  makeJob({ key, tier, ...over });

function noop() {}

function renderBoard(jobs: Job[]) {
  return render(
    <BoardTable
      jobs={jobs}
      selectedKey={null}
      onSelect={noop}
      sort={DEFAULT_SORT}
      setSort={noop}
      onStatus={noop}
      scores={new Map()}
      today={TODAY}
    />,
  );
}

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

describe("needs-attention grouping", () => {
  it("lifts an overdue follow-up into a labelled group above the rest", () => {
    renderBoard([j("a"), j("b", 1, { next_action_at: "2026-08-01" })]);

    expect(screen.getByText(/needs attention/i)).toBeInTheDocument();
    const rows = screen.getAllByRole("row").filter((r) => r.getAttribute("data-key"));
    expect(rows[0].getAttribute("data-key")).toBe("b");
  });

  it("shows no group header when nothing is pending", () => {
    renderBoard([j("a"), j("b")]);
    expect(screen.queryByText(/needs attention/i)).not.toBeInTheDocument();
  });

  it("counts the jobs in the group so the size is visible without counting rows", () => {
    renderBoard([j("a", 1, { next_action_at: "2026-08-01" }), j("b", 1, { next_action_at: TODAY })]);
    expect(screen.getByText(/needs attention \(2\)/i)).toBeInTheDocument();
  });
});

describe("conflict flags", () => {
  const conflicted = (key: string, over: Partial<Job> = {}) =>
    j(key, 1, { conflicts: [{ field: "office_days", message: "4 office days/week vs your limit of 2", quote: "4 days onsite" }], ...over });

  it("labels a conflicting row rather than hiding it", () => {
    renderBoard([conflicted("a")]);
    const row = screen.getAllByRole("row").find((r) => r.getAttribute("data-key") === "a")!;
    expect(within(row).getByText(/conflict/i)).toBeInTheDocument();
  });

  it("sorts a conflicting job below an equal one, without removing it", () => {
    const scores = new Map<string, number | null>([["a", 80], ["b", 80]]);
    const out = sortJobs([conflicted("a"), j("b")], DEFAULT_SORT, scores);
    expect(out.map((x) => x.key)).toEqual(["b", "a"]);
  });

  it("does not let a conflict outrank a genuinely better score", () => {
    const scores = new Map<string, number | null>([["a", 95], ["b", 40]]);
    const out = sortJobs([conflicted("a"), j("b")], DEFAULT_SORT, scores);
    expect(out.map((x) => x.key)).toEqual(["a", "b"]);
  });

  it("leaves an unflagged row unlabelled", () => {
    renderBoard([j("a")]);
    expect(screen.queryByText(/conflict/i)).not.toBeInTheDocument();
  });
});

describe("JD-sourced salary", () => {
  it("falls back to the range stated in the description, marked as such", () => {
    renderBoard([j("a", 1, {
      salary_min: null, salary_max: null,
      facts: makeFacts({ salary_min_jd: 170000, salary_max_jd: 210000 }),
    })]);
    const row = screen.getAllByRole("row").find((r) => r.getAttribute("data-key") === "a")!;
    expect(within(row).getByText(/170K/)).toBeInTheDocument();
    expect(within(row).getByTitle(/from the job description/i)).toBeInTheDocument();
  });

  it("prefers the posted range when the board already has one", () => {
    renderBoard([j("a", 1, {
      salary_min: 150000, salary_max: 160000,
      facts: makeFacts({ salary_min_jd: 170000, salary_max_jd: 210000 }),
    })]);
    const row = screen.getAllByRole("row").find((r) => r.getAttribute("data-key") === "a")!;
    expect(within(row).getByText(/150K/)).toBeInTheDocument();
    expect(within(row).queryByTitle(/from the job description/i)).not.toBeInTheDocument();
  });
});

describe("narrow screens", () => {
  // jsdom applies no media queries, so the contract under test is which columns
  // are declared droppable — the four that must survive 390px, and the rest.
  const labels = (pred: (c: (typeof COLS)[number]) => boolean) =>
    COLS.filter(pred).map((c) => c.label);

  it("keeps score, company, title, and status at every width", () => {
    expect(labels((c) => !c.hideNarrow)).toEqual(["SCORE", "COMPANY", "TITLE", "STATUS"]);
  });

  it("drops the secondary columns rather than scrolling them out of reach", () => {
    expect(labels((c) => !!c.hideNarrow)).toEqual(["TIER", "LOCATION", "SALARY", "POSTED"]);
  });

  it("marks the droppable cells in the body too, so headers and cells stay aligned", () => {
    renderBoard([j("a")]);
    const row = screen.getAllByRole("row").find((r) => r.getAttribute("data-key") === "a")!;
    const droppable = Array.from(row.querySelectorAll("td"))
      .filter((c) => c.className.includes("hidden"));
    expect(droppable).toHaveLength(4);
  });
});

describe("follow-up chips", () => {
  it("marks a past follow-up as overdue", () => {
    renderBoard([j("a", 1, { next_action_at: "2026-08-01" })]);
    expect(screen.getByText(/overdue/i)).toBeInTheDocument();
  });

  it("marks a follow-up due today as due, not overdue", () => {
    renderBoard([j("a", 1, { next_action_at: TODAY })]);
    expect(screen.getByText(/due today/i)).toBeInTheDocument();
    expect(screen.queryByText(/overdue/i)).not.toBeInTheDocument();
  });

  it("says a tracked posting closed, which is the whole point of keeping it listed", () => {
    renderBoard([j("a", 1, { status: "applied", closed_at: "2026-08-25T00:00:00Z" })]);
    const row = screen.getAllByRole("row").find((r) => r.getAttribute("data-key") === "a")!;
    expect(within(row).getByText(/closed/i)).toBeInTheDocument();
  });

  it("leaves an upcoming follow-up unchipped so the board stays quiet", () => {
    renderBoard([j("a", 1, { next_action_at: "2026-12-01" })]);
    expect(screen.queryByText(/overdue|due today/i)).not.toBeInTheDocument();
  });
});
