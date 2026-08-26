import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { makeJob } from "../test-utils/job";
import type { Job } from "../lib/types";
import { JobDrawer } from "./JobDrawer";

const BASE: Job = makeJob({
  key: "job-a", company: "Acme", title: "Engineer", location: "Remote",
  url: "https://example.com/a", source: "ashby",
});

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
      onExtractFacts={noop}
      extractingFacts={false}
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

describe("JobDrawer Gemini disclosure", () => {
  it("says what leaves the machine before an unscored job can be scored", () => {
    renderDrawer({ ...BASE, fit: null });
    expect(screen.getByRole("button", { name: /score now/i })).toBeInTheDocument();
    expect(screen.getByText(/sends your profile, rubric, and this job's description to gemini/i))
      .toBeInTheDocument();
  });

  it("says the same before a deep dive, which sends the same material", () => {
    renderDrawer({ ...BASE, fit: 80 });
    expect(screen.getByText(/deep dive sends .*to gemini/i)).toBeInTheDocument();
  });
});

describe("JobDrawer dismissal", () => {
  it("says why a job was dismissed, so a past call can be re-examined", () => {
    renderDrawer({ ...BASE, status: "dismissed", dismiss_reason: "rto" });
    expect(screen.getByText(/dismissed: RTO/i)).toBeInTheDocument();
  });

  it("says nothing when a dismissal carries no reason", () => {
    renderDrawer({ ...BASE, status: "dismissed", dismiss_reason: null });
    expect(screen.queryByText(/dismissed:/i)).not.toBeInTheDocument();
  });

  it("does not show a reason for a job that is not dismissed", () => {
    renderDrawer({ ...BASE, status: "interested", dismiss_reason: "comp" });
    expect(screen.queryByText(/dismissed:/i)).not.toBeInTheDocument();
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

describe("JobDrawer layout", () => {
  // The drawer is portalled now that Radix owns the modal semantics, so it lands
  // in document.body rather than inside the render container.
  const aside = () => document.querySelector("aside")!;

  // The panel slides in by a percentage of its own width, so a width change can no
  // longer strand it off-screen the way a hard-coded 480px translate could.
  it("settles the panel flush against the right edge rather than parked off-screen", async () => {
    renderDrawer(BASE);
    expect(aside().style.transform).toContain("100%");
    await act(() => new Promise((r) => setTimeout(r, 600)));
    expect(aside().style.transform).toBe("none");
  });

  // Closing must take the whole layer with it. An exit that finishes without
  // unmounting leaves the scrim over the board, eating every click on it.
  it("takes its scrim with it when it closes, leaving nothing over the board", async () => {
    const { rerenderWith } = renderDrawer(BASE);
    expect(document.querySelector("aside")).toBeTruthy();

    rerenderWith(BASE, { open: false });

    await act(() => new Promise((r) => setTimeout(r, 600)));
    expect(document.querySelector("aside")).toBeNull();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // The deep dive runs to six sections; if it scrolls inside its own box the drawer
  // shows a sliver of it, and if the header scrolls away the triage buttons go with it.
  it("scrolls the body only, keeping the header and its status actions pinned", () => {
    renderDrawer(BASE);
    const panel = aside();
    const header = panel.querySelector("header")!;

    expect(header.className).toContain("shrink-0");
    expect(screen.getByRole("button", { name: "Interested" }).closest("header")).toBe(header);
    expect(panel.className).toContain("overflow-hidden");
    expect(panel.querySelectorAll(".overflow-y-auto")).toHaveLength(1);
  });
});
