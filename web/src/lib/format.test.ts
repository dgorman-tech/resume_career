import { describe, expect, it } from "vitest";
import { fmtSalary } from "./format";

describe("fmtSalary", () => {
  it("formats a range", () => expect(fmtSalary(156000, 195000)).toBe("$156K–$195K"));
  it("formats single value", () => expect(fmtSalary(170000, null)).toBe("$170K"));
  it("dash when absent", () => expect(fmtSalary(null, null)).toBe("—"));
});
