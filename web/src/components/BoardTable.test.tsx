import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Job } from "../lib/types";
import { BoardTable, COLS, DEFAULT_SORT, sortJobs } from "./BoardTable";

const TODAY = "2026-08-25";

const j = (key: string, tier = 1, over: Partial<Job> = {}): Job =>
  ({ key, company: "c", tier, title: "t", location: "l", url: "u",
     salary_min: null, salary_max: null, posted_at: "", first_seen: "", source: "s",
     closed_at: null, is_internal: false, is_new: false, status: "new", starred: false, note: "",
     next_action_at: null, next_action_note: "",
     fit: null, subscores: null, why: null, gaps: null, angle: null, lens: null,
     scored_at: null, stale: false, has_deep_dive: false, ...over });

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
