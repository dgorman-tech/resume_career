import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  closed_at: null,
  is_internal: false,
  is_new: false,
  status: "new",
  starred: false,
  note: "",
  next_action_at: null,
  next_action_note: "",
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

type Overrides = Partial<React.ComponentProps<typeof JobDrawer>>;

function drawerEl(job: Job | null, over: Overrides = {}) {
  return (
    <JobDrawer
      job={job}
      open
      onClose={noop}
      onStatus={noop}
      onStar={noop}
      onNote={noop}
      onNextAction={noop}
      onScoreNow={noop}
      deepDiveRequested={false}
      onDeepDiveHandled={noop}
      followUpRequested={false}
      onFollowUpHandled={noop}
      score={null}
      dimensions={[]}
      {...over}
    />
  );
}

function renderDrawer(job: Job, over: Overrides = {}) {
  const qc = new QueryClient();
  const utils = render(<QueryClientProvider client={qc}>{drawerEl(job, over)}</QueryClientProvider>);
  const rerenderWith = (j: Job | null, o: Overrides = {}) =>
    utils.rerender(
      <QueryClientProvider client={qc}>{drawerEl(j, { ...over, ...o })}</QueryClientProvider>,
    );
  return { ...utils, rerenderWith };
}

describe("JobDrawer note autosave", () => {
  it("flushes an unsaved edit for the previous job immediately when switching jobs, instead of dropping it", () => {
    const onNote = vi.fn();
    const { rerenderWith, getByPlaceholderText } = renderDrawer(JOB_A, { onNote });

    const textarea = getByPlaceholderText(/add note/i);
    fireEvent.change(textarea, { target: { value: "typed for job A" } });

    // Switch to job B before the 600ms debounce would have fired — this is
    // exactly the j/k-driven flow Task 12 exists to support.
    rerenderWith(JOB_B);

    // The pending edit for job A must be flushed with the latest typed value,
    // not silently cancelled by the switch.
    expect(onNote).toHaveBeenCalledWith("job-a", "typed for job A");

    // The textarea should now show job B's own note.
    expect(screen.getByDisplayValue("existing b note")).toBeInTheDocument();
  });

  it("does not call onNote on mount when there is no pending edit", () => {
    const onNote = vi.fn();
    renderDrawer(JOB_A, { onNote });
    expect(onNote).not.toHaveBeenCalled();
  });
});

describe("JobDrawer composite score display", () => {
  const DIMS = [
    { key: "comp", label: "Compensation", description: "d", weight: 10, position: 1, archived: false },
    { key: "team_culture", label: "Team culture", description: "d", weight: 10, position: 2, archived: false },
  ];

  it("shows composite dial, model chip, and dynamic labels with dash for missing", () => {
    renderDrawer({ ...BASE, fit: 82, subscores: { comp: 95 } }, { score: 88, dimensions: DIMS });
    expect(screen.getByText("88")).toBeInTheDocument();          // composite in the dial
    expect(screen.getByText(/MODEL 82/)).toBeInTheDocument();    // holistic chip
    expect(screen.getByText(/COMPENSATION 95/)).toBeInTheDocument();
    expect(screen.getByText(/TEAM CULTURE —/)).toBeInTheDocument();
  });

  it("widens the stale message to rubric changes", () => {
    renderDrawer({ ...BASE, fit: 82, subscores: { comp: 95 }, stale: true }, { score: 82 });
    expect(screen.getByText(/profile or rubric changed since scoring/)).toBeInTheDocument();
  });
});

describe("JobDrawer as a modal dialog", () => {
  it("announces itself as a modal dialog named after the role", () => {
    renderDrawer(JOB_A);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName(/engineer/i);
  });

  it("moves focus into the drawer when it opens, so the keyboard lands somewhere useful", async () => {
    renderDrawer(JOB_A);
    await waitFor(() =>
      expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true));
  });

  it("returns focus to whatever opened it, instead of dumping the user at the top of the page", async () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();

    const { rerenderWith } = renderDrawer(JOB_A);
    await waitFor(() =>
      expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true));

    rerenderWith(JOB_A, { open: false });

    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});

describe("JobDrawer follow-up", () => {
  it("shows an existing follow-up date", () => {
    renderDrawer({ ...BASE, next_action_at: "2026-09-01" });
    expect(screen.getByDisplayValue("2026-09-01")).toBeInTheDocument();
  });

  it("saves a follow-up date as soon as it is picked", () => {
    const onNextAction = vi.fn();
    renderDrawer(JOB_A, { onNextAction });
    fireEvent.change(screen.getByLabelText(/follow up/i), { target: { value: "2026-09-15" } });
    expect(onNextAction).toHaveBeenCalledWith("job-a", { next_action_at: "2026-09-15" });
  });

  it("clears the follow-up when the date is emptied", () => {
    const onNextAction = vi.fn();
    renderDrawer({ ...BASE, next_action_at: "2026-09-01" }, { onNextAction });
    fireEvent.change(screen.getByLabelText(/follow up/i), { target: { value: "" } });
    expect(onNextAction).toHaveBeenCalledWith("job-a", { next_action_at: "" });
  });

  it("focuses the date field when opened via the follow-up shortcut", async () => {
    renderDrawer(JOB_A, { followUpRequested: true });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(/follow up/i)));
  });

  it("reports the shortcut was handled so it does not re-fire on the next render", async () => {
    const onFollowUpHandled = vi.fn();
    renderDrawer(JOB_A, { followUpRequested: true, onFollowUpHandled });
    await waitFor(() => expect(onFollowUpHandled).toHaveBeenCalled());
  });
});
