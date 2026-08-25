import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Job } from "../lib/types";
import { JobDrawer } from "./JobDrawer";

const BASE: Job = {
  key: "job-a",
  company: "Acme",
  tier: 1,
  title: "Engineer",
  location: "Remote",
  url: "https://example.com/a",
  salary_min: null,
  salary_max: null,
  posted_at: "",
  first_seen: "",
  source: "ashby",
  is_internal: false,
  is_new: false,
  status: "new",
  starred: false,
  note: "",
  fit: null,
  subscores: null,
  why: null,
  gaps: null,
  angle: null,
  lens: null,
  scored_at: null,
  stale: false,
  has_deep_dive: false,
};

const JOB_A: Job = { ...BASE, key: "job-a", note: "" };
const JOB_B: Job = { ...BASE, key: "job-b", title: "Manager", note: "existing b note" };

function noop() {}

function renderDrawer(job: Job, onNote: (key: string, note: string) => void) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <JobDrawer
        job={job}
        open
        onClose={noop}
        onStatus={noop}
        onStar={noop}
        onNote={onNote}
        onScoreNow={noop}
        deepDiveRequested={false}
        onDeepDiveHandled={noop}
        score={null}
        dimensions={[]}
      />
    </QueryClientProvider>,
  );
}

describe("JobDrawer note autosave", () => {
  it("flushes an unsaved edit for the previous job immediately when switching jobs, instead of dropping it", () => {
    const onNote = vi.fn();
    const { rerender, getByPlaceholderText } = renderDrawer(JOB_A, onNote);

    const textarea = getByPlaceholderText(/add note/i);
    fireEvent.change(textarea, { target: { value: "typed for job A" } });

    // Switch to job B before the 600ms debounce would have fired — this is
    // exactly the j/k-driven flow Task 12 exists to support.
    const qc = new QueryClient();
    rerender(
      <QueryClientProvider client={qc}>
        <JobDrawer
          job={JOB_B}
          open
          onClose={noop}
          onStatus={noop}
          onStar={noop}
          onNote={onNote}
          onScoreNow={noop}
          deepDiveRequested={false}
          onDeepDiveHandled={noop}
          score={null}
          dimensions={[]}
        />
      </QueryClientProvider>,
    );

    // The pending edit for job A must be flushed with the latest typed value,
    // not silently cancelled by the switch.
    expect(onNote).toHaveBeenCalledWith("job-a", "typed for job A");

    // The textarea should now show job B's own note.
    expect(screen.getByDisplayValue("existing b note")).toBeInTheDocument();
  });

  it("does not call onNote on mount when there is no pending edit", () => {
    const onNote = vi.fn();
    renderDrawer(JOB_A, onNote);
    expect(onNote).not.toHaveBeenCalled();
  });
});

describe("JobDrawer composite score display", () => {
  const DIMS = [
    { key: "comp", label: "Compensation", description: "d", weight: 10, position: 1, archived: false },
    { key: "team_culture", label: "Team culture", description: "d", weight: 10, position: 2, archived: false },
  ];
  const drawer = (job: Job, score: number | null, dimensions = DIMS) => {
    const qc = new QueryClient();
    return render(
      <QueryClientProvider client={qc}>
        <JobDrawer job={job} open onClose={noop} onStatus={noop} onStar={noop}
          onNote={noop} onScoreNow={noop} deepDiveRequested={false} onDeepDiveHandled={noop}
          score={score} dimensions={dimensions} />
      </QueryClientProvider>,
    );
  };

  it("shows composite dial, model chip, and dynamic labels with dash for missing", () => {
    drawer({ ...BASE, fit: 82, subscores: { comp: 95 } }, 88);
    expect(screen.getByText("88")).toBeInTheDocument();          // composite in the dial
    expect(screen.getByText(/MODEL 82/)).toBeInTheDocument();    // holistic chip
    expect(screen.getByText(/COMPENSATION 95/)).toBeInTheDocument();
    expect(screen.getByText(/TEAM CULTURE —/)).toBeInTheDocument();
  });

  it("widens the stale message to rubric changes", () => {
    drawer({ ...BASE, fit: 82, subscores: { comp: 95 }, stale: true }, 82, []);
    expect(screen.getByText(/profile or rubric changed since scoring/)).toBeInTheDocument();
  });
});
