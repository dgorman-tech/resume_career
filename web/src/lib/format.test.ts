import { describe, expect, it } from "vitest";
import { fmtSalary } from "./format";

describe("fmtSalary", () => {
  it("formats a range, defaulting to CAD", () => expect(fmtSalary(156000, 195000)).toBe("CA$156K–CA$195K"));
  it("formats single value", () => expect(fmtSalary(170000, null)).toBe("CA$170K"));
  it("dash when absent", () => expect(fmtSalary(null, null)).toBe("—"));
  it("labels a range in the given currency", () =>
    expect(fmtSalary(70000, 90000, "EUR")).toBe("€70K–€90K"));
  it("uses a space-separated label for word-like currency codes", () => {
    expect(fmtSalary(500000, null, "SEK")).toBe("kr 500K");
    expect(fmtSalary(150000, null, "CHF")).toBe("CHF 150K");
  });
  it("falls back to the code itself for an unmapped currency", () =>
    expect(fmtSalary(100000, null, "JPY")).toBe("JPY 100K"));
});
