import { describe, expect, it } from "vitest";
import { attentionReason, nextActionState, orderByAttention, partitionAttention, todayISO } from "./nextAction";
import { makeJob } from "../test-utils/job";
import type { Job } from "./types";

const TODAY = "2026-08-25";

const job = (over: Partial<Job> = {}): Job => makeJob({ company: "Wealthsimple", ...over });

describe("nextActionState", () => {
  it("has no state when no follow-up is set", () => {
    expect(nextActionState(job(), TODAY)).toBeNull();
  });

  it("reports a past date as overdue", () => {
    expect(nextActionState(job({ next_action_at: "2026-08-24" }), TODAY)).toBe("overdue");
  });

  it("reports today's date as due", () => {
    expect(nextActionState(job({ next_action_at: TODAY }), TODAY)).toBe("today");
  });

  it("reports a future date as upcoming", () => {
    expect(nextActionState(job({ next_action_at: "2026-08-26" }), TODAY)).toBe("upcoming");
  });
});

describe("attentionReason", () => {
  it("flags a posting that closed while you were still pursuing it", () => {
    const j = job({ status: "applied", closed_at: "2026-08-25T00:00:00Z" });
    expect(attentionReason(j, TODAY)).toBe("closed");
  });

  it("does not flag an open job you applied to", () => {
    expect(attentionReason(job({ status: "applied" }), TODAY)).toBeNull();
  });

  it("flags an overdue follow-up", () => {
    expect(attentionReason(job({ next_action_at: "2026-08-01" }), TODAY)).toBe("overdue");
  });

  it("flags a follow-up due today", () => {
    expect(attentionReason(job({ next_action_at: TODAY }), TODAY)).toBe("today");
  });

  it("leaves an upcoming follow-up alone", () => {
    expect(attentionReason(job({ next_action_at: "2026-09-30" }), TODAY)).toBeNull();
  });

  it("ranks a closed application above an overdue follow-up on the same job", () => {
    const j = job({ status: "applied", closed_at: "2026-08-25T00:00:00Z", next_action_at: "2026-08-01" });
    expect(attentionReason(j, TODAY)).toBe("closed");
  });
});

describe("partitionAttention", () => {
  it("lifts jobs needing attention out of the main list, preserving order within each", () => {
    const a = job({ key: "a" });
    const b = job({ key: "b", next_action_at: "2026-08-01" });
    const c = job({ key: "c" });
    const d = job({ key: "d", status: "applied", closed_at: "2026-08-25T00:00:00Z" });

    const { attention, rest } = partitionAttention([a, b, c, d], TODAY);

    expect(attention.map((j) => j.key)).toEqual(["b", "d"]);
    expect(rest.map((j) => j.key)).toEqual(["a", "c"]);
  });

  it("returns an empty attention list when nothing is pending", () => {
    expect(partitionAttention([job()], TODAY).attention).toEqual([]);
  });
});

describe("orderByAttention", () => {
  it("puts attention rows first so j/k walks the board in the order it is drawn", () => {
    const jobs = [job({ key: "a" }), job({ key: "b", next_action_at: "2026-08-01" }), job({ key: "c" })];
    expect(orderByAttention(jobs, TODAY).map((x) => x.key)).toEqual(["b", "a", "c"]);
  });

  it("is idempotent, so re-ordering an already-ordered list cannot shuffle it", () => {
    const jobs = [job({ key: "a" }), job({ key: "b", next_action_at: "2026-08-01" })];
    const once = orderByAttention(jobs, TODAY);
    expect(orderByAttention(once, TODAY).map((x) => x.key)).toEqual(once.map((x) => x.key));
  });
});

describe("todayISO", () => {
  it("formats the local calendar day, not a UTC instant", () => {
    // 11pm local on the 25th must read as the 25th even where UTC has ticked over
    const late = new Date(2026, 7, 25, 23, 30);
    expect(todayISO(late)).toBe("2026-08-25");
  });
});
