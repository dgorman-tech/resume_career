import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DismissReasonBar } from "./DismissReasonBar";

function noop() {}

const bar = (over: Partial<React.ComponentProps<typeof DismissReasonBar>> = {}) =>
  render(
    <DismissReasonBar open title="Manager, Analytics Engineering" company="Wealthsimple"
      onPick={noop} onCancel={noop} {...over} />,
  );

describe("DismissReasonBar", () => {
  it("stays out of the way until a dismissal is pending", () => {
    bar({ open: false });
    expect(screen.queryByRole("group", { name: /dismiss/i })).not.toBeInTheDocument();
  });

  it("names the job being dismissed, so a mistimed x is obvious", () => {
    bar();
    expect(screen.getByText(/Manager, Analytics Engineering/)).toBeInTheDocument();
    expect(screen.getByText(/Wealthsimple/)).toBeInTheDocument();
  });

  it("offers every reason with the digit that picks it", () => {
    bar();
    for (const [digit, label] of [["1", "Comp"], ["2", "RTO"], ["3", "Level"],
                                  ["4", "Domain"], ["5", "Company"], ["6", "Other"]] as const) {
      const btn = screen.getByRole("button", { name: new RegExp(`${digit}.*${label}`, "i") });
      expect(btn).toBeInTheDocument();
    }
  });

  it("reports the reason that was clicked", () => {
    const onPick = vi.fn();
    bar({ onPick });
    fireEvent.click(screen.getByRole("button", { name: /2.*RTO/i }));
    expect(onPick).toHaveBeenCalledWith("rto");
  });

  it("can dismiss with no reason at all", () => {
    const onPick = vi.fn();
    bar({ onPick });
    fireEvent.click(screen.getByRole("button", { name: /no reason/i }));
    expect(onPick).toHaveBeenCalledWith(null);
  });

  it("can be abandoned", () => {
    const onCancel = vi.fn();
    bar({ onCancel });
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("announces itself for anyone not watching the bottom of the screen", () => {
    bar();
    expect(screen.getByRole("group", { name: /dismiss/i })).toHaveAttribute("aria-live", "polite");
  });
});
