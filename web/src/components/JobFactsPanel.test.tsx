import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { makeFacts, makeJob } from "../test-utils/job";
import type { Job } from "../lib/types";
import { JobFactsPanel } from "./JobFactsPanel";

function noop() {}

const panel = (job: Job, over = {}) =>
  render(<JobFactsPanel job={job} onExtract={noop} extracting={false} {...over} />);

describe("JobFactsPanel before extraction", () => {
  it("offers to read the description, saying what that sends", () => {
    panel(makeJob({ facts: null }));
    expect(screen.getByRole("button", { name: /read the description/i })).toBeInTheDocument();
    expect(screen.getByText(/sends this job's description to gemini/i)).toBeInTheDocument();
  });

  it("passes the job key up when asked to extract", () => {
    const onExtract = vi.fn();
    panel(makeJob({ key: "job-a", facts: null }), { onExtract });
    fireEvent.click(screen.getByRole("button", { name: /read the description/i }));
    expect(onExtract).toHaveBeenCalledWith("job-a");
  });

  it("says so while it is working", () => {
    panel(makeJob({ facts: null }), { extracting: true });
    expect(screen.getByRole("button", { name: /reading/i })).toBeDisabled();
  });
});

describe("JobFactsPanel evidence", () => {
  const withFacts = () => makeJob({
    facts: makeFacts({
      office_days: 2,
      remote_policy: "hybrid",
      years_min: 8,
      must_haves: ["expert SQL", "dbt"],
      evidence: {
        office_days: "2 days per week in the office",
        remote_policy: "This role is hybrid",
        years_min: "8+ years of experience",
        must_haves: ["Required: expert SQL", "production Python, and dbt"],
      },
    }),
  });

  it("shows each fact with the sentence it came from", () => {
    panel(withFacts());
    expect(screen.getByText(/2 days\/week/i)).toBeInTheDocument();
    expect(screen.getByText(/"2 days per week in the office"/)).toBeInTheDocument();
    expect(screen.getByText(/"8\+ years of experience"/)).toBeInTheDocument();
  });

  it("quotes every requirement it listed", () => {
    panel(withFacts());
    // the requirement itself, then the sentence it was read from
    expect(screen.getByText("expert SQL")).toBeInTheDocument();
    expect(screen.getByText("dbt")).toBeInTheDocument();
    expect(screen.getByText(/"Required: expert SQL"/)).toBeInTheDocument();
    expect(screen.getByText(/"production Python, and dbt"/)).toBeInTheDocument();
  });

  it("marks a fact with no recorded quote instead of letting it pass as sourced", () => {
    // extraction cannot produce this, but a hand-edited or pre-evidence row can;
    // an unsourced number must not sit there looking like a measurement
    panel(makeJob({ facts: makeFacts({ years_min: 6, evidence: {} }) }));
    expect(screen.getByText(/6\+ years/)).toBeInTheDocument();
    expect(screen.getByText(/no quote recorded/i)).toBeInTheDocument();
  });

  it("does not cry unsourced when every fact has its quote", () => {
    panel(withFacts());
    expect(screen.queryByText(/no quote recorded/i)).not.toBeInTheDocument();
  });

  it("omits a field the description never stated", () => {
    panel(makeJob({ facts: makeFacts({ office_days: 2, evidence: { office_days: "2 days" } }) }));
    expect(screen.queryByText(/years of experience/i)).not.toBeInTheDocument();
  });

  it("lets the facts be re-read after a JD changes", () => {
    panel(withFacts());
    expect(screen.getByRole("button", { name: /re-read/i })).toBeInTheDocument();
  });
});

describe("JobFactsPanel conflicts", () => {
  const conflicted = () => makeJob({
    facts: makeFacts({ office_days: 4, evidence: { office_days: "4 days per week onsite" } }),
    conflicts: [{ field: "office_days", message: "4 office days/week vs your limit of 2",
                  quote: "4 days per week onsite" }],
  });

  it("states the conflict and the sentence behind it", () => {
    panel(conflicted());
    expect(screen.getByText(/4 office days\/week vs your limit of 2/)).toBeInTheDocument();
    expect(screen.getAllByText(/"4 days per week onsite"/).length).toBeGreaterThan(0);
  });

  it("frames it as a warning, not a verdict", () => {
    panel(conflicted());
    expect(screen.getByText(/still yours to judge|does not dismiss/i)).toBeInTheDocument();
  });

  it("says nothing when the facts agree with the profile", () => {
    panel(makeJob({ facts: makeFacts({ office_days: 1 }), conflicts: [] }));
    expect(screen.queryByText(/vs your limit/i)).not.toBeInTheDocument();
  });
});
