import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import * as api from "../lib/api";
import { GearDialog } from "./GearDialog";

vi.mock("../lib/api", () => ({
  getHealth: vi.fn(),
  getScoringStatus: vi.fn(),
  scoreUnscored: vi.fn(),
  rescoreStale: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const HEALTH = {
  key_present: true,
  batch_model: "gemini-flash-latest",
  deep_dive_model: "gemini-pro-latest",
  batch_scoring: true,
  last_run: null,
  unscored: 5,
  stale_shortlisted: 3,
};

function renderDialog(open: boolean, onClose: () => void, qc = new QueryClient()) {
  return render(
    <QueryClientProvider client={qc}>
      <GearDialog open={open} onClose={onClose} />
    </QueryClientProvider>,
  );
}

describe("GearDialog backfill polling", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("re-enables the button and shows an error toast when a poll request rejects, instead of staying stuck disabled", async () => {
    vi.mocked(api.getHealth).mockResolvedValue(HEALTH);
    vi.mocked(api.scoreUnscored).mockResolvedValue({ started: true, total: 5 });
    vi.mocked(api.getScoringStatus).mockRejectedValue(new Error("network blip"));

    renderDialog(true, vi.fn());

    const button = await screen.findByRole("button", { name: /score all unscored \(5\)/i });
    fireEvent.click(button);

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("network blip"));

    const revived = await screen.findByRole("button", { name: /score all unscored \(5\)/i });
    expect(revived).not.toBeDisabled();
  });

  it("resets progress when the dialog closes mid-backfill, so reopening shows an enabled button instead of a stuck 'Scoring…' state", async () => {
    vi.mocked(api.getHealth).mockResolvedValue(HEALTH);
    vi.mocked(api.scoreUnscored).mockResolvedValue({ started: true, total: 5 });
    // Never resolves running:false, so without the fix `progress` would stay set forever.
    vi.mocked(api.getScoringStatus).mockResolvedValue({ running: true, done: 1, total: 5, errors: 0 });

    const onClose = vi.fn();
    const qc = new QueryClient();
    const { rerender } = renderDialog(true, onClose, qc);

    const button = await screen.findByRole("button", { name: /score all unscored \(5\)/i });
    fireEvent.click(button);

    await screen.findByRole("button", { name: /scoring… 1\/5/i });

    // Radix closes the dialog (e.g. Escape) mid-backfill; the parent then flips `open` to false.
    fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
    expect(onClose).toHaveBeenCalled();

    rerender(
      <QueryClientProvider client={qc}>
        <GearDialog open={false} onClose={onClose} />
      </QueryClientProvider>,
    );
    rerender(
      <QueryClientProvider client={qc}>
        <GearDialog open={true} onClose={onClose} />
      </QueryClientProvider>,
    );

    const revived = await screen.findByRole("button", { name: /score all unscored \(5\)/i });
    expect(revived).not.toBeDisabled();
  });
});

describe("GearDialog Gemini disclosure", () => {
  afterEach(() => vi.clearAllMocks());

  it("states what the bulk scoring button sends, before it is pressed", async () => {
    vi.mocked(api.getHealth).mockResolvedValue(HEALTH);
    renderDialog(true, vi.fn());
    await screen.findByRole("button", { name: /score all unscored/i });
    expect(screen.getByText(/sends your profile, rubric, and .*description.* to gemini/i))
      .toBeInTheDocument();
  });
});

describe("GearDialog stale re-scoring", () => {
  afterEach(() => vi.clearAllMocks());

  it("offers to repair stale shortlisted scores, naming the exact count", async () => {
    vi.mocked(api.getHealth).mockResolvedValue(HEALTH);
    renderDialog(true, vi.fn());
    expect(await screen.findByRole("button", { name: /re-score stale shortlisted \(3\)/i }))
      .toBeInTheDocument();
  });

  it("spends nothing until the confirmation is accepted", async () => {
    vi.mocked(api.getHealth).mockResolvedValue(HEALTH);
    vi.mocked(api.rescoreStale).mockResolvedValue({ started: true, total: 3 });
    renderDialog(true, vi.fn());

    fireEvent.click(await screen.findByRole("button", { name: /re-score stale shortlisted \(3\)/i }));

    expect(api.rescoreStale).not.toHaveBeenCalled();
    // the confirmation's own wording, not merely any mention of Gemini on screen
    expect(await screen.findByText(/predate your current profile/i)).toBeInTheDocument();
  });

  it("re-scores once confirmed", async () => {
    vi.mocked(api.getHealth).mockResolvedValue(HEALTH);
    vi.mocked(api.rescoreStale).mockResolvedValue({ started: true, total: 3 });
    vi.mocked(api.getScoringStatus).mockResolvedValue({ running: false, done: 3, total: 3, errors: 0 });
    renderDialog(true, vi.fn());

    fireEvent.click(await screen.findByRole("button", { name: /re-score stale shortlisted \(3\)/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^re-score 3$/i }));

    await waitFor(() => expect(api.rescoreStale).toHaveBeenCalledWith(3));
  });

  it("abandons the run when the confirmation is dismissed", async () => {
    vi.mocked(api.getHealth).mockResolvedValue(HEALTH);
    renderDialog(true, vi.fn());

    fireEvent.click(await screen.findByRole("button", { name: /re-score stale shortlisted \(3\)/i }));
    fireEvent.click(await screen.findByRole("button", { name: /cancel/i }));

    await waitFor(() =>
      expect(screen.queryByText(/predate your current profile/i)).not.toBeInTheDocument());
    expect(api.rescoreStale).not.toHaveBeenCalled();
  });

  it("hides the repair button when nothing is stale", async () => {
    vi.mocked(api.getHealth).mockResolvedValue({ ...HEALTH, stale_shortlisted: 0 });
    renderDialog(true, vi.fn());
    await screen.findByRole("button", { name: /score all unscored/i });
    expect(screen.queryByRole("button", { name: /re-score stale/i })).not.toBeInTheDocument();
  });
});
