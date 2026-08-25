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
