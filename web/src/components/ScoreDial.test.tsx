import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScoreDial, scoreColor } from "./ScoreDial";

describe("ScoreDial", () => {
  it("shows the value", () => {
    render(<ScoreDial value={92} />);
    expect(screen.getByText("92")).toBeInTheDocument();
  });
  it("shows dash for null", () => {
    render(<ScoreDial value={null} />);
    expect(screen.getByText("–")).toBeInTheDocument();
  });
  it("color bands", () => {
    expect(scoreColor(92)).toBe("var(--color-teal)");
    expect(scoreColor(75)).toBe("var(--color-amber)");
    expect(scoreColor(40)).toBe("var(--color-ink-muted)");
  });
});
