import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as api from "../lib/api";
import type { Profile } from "../lib/types";
import ProfilePage from "./ProfilePage";

vi.mock("../lib/api", () => ({
  getProfile: vi.fn(),
  putProfile: vi.fn(),
  extractResume: vi.fn(),
  getJobs: vi.fn().mockResolvedValue([]),
  getDimensions: vi.fn().mockResolvedValue({ dimensions: [], holistic_weight: 50 }),
  putDimensions: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const profile = (over: Partial<Profile> = {}): Profile => ({
  resume_text: "old", rules_text: "", comp_floor: null, comp_goal: null, currency: "CAD",
  max_office_days: null, location_text: "", min_level: "", updated_at: null, ...over,
});

function renderPage() {
  vi.mocked(api.putProfile).mockResolvedValue(profile());
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ProfilePage />
    </QueryClientProvider>,
  );
}

/** The read view hides the editors; every assertion about a field opens its dialog first. */
async function openEditor(name: RegExp) {
  fireEvent.click(await screen.findByRole("button", { name }));
}

afterEach(() => vi.clearAllMocks());

describe("ProfilePage read view", () => {
  it("summarises hard requirements and marks unset ones instead of hiding them", async () => {
    vi.mocked(api.getProfile).mockResolvedValue(profile({
      comp_floor: 180000, location_text: "Toronto", min_level: "senior_manager",
    }));
    renderPage();

    expect(await screen.findByText("CA$180K")).toBeInTheDocument();
    expect(screen.getByText("Toronto")).toBeInTheDocument();
    expect(screen.getByText("Senior Manager")).toBeInTheDocument();
    // comp goal and office days are unset, and say so rather than rendering blank
    expect(screen.getAllByText("Not set")).toHaveLength(2);
  });

  it("does not mount the resume textarea until the editor is opened", async () => {
    vi.mocked(api.getProfile).mockResolvedValue(profile());
    renderPage();

    await screen.findByRole("button", { name: "Edit resume" });
    expect(screen.queryByRole("textbox", { name: "Resume" })).toBeNull();

    await openEditor(/^edit resume$/i);
    expect(await screen.findByRole("textbox", { name: "Resume" })).toHaveValue("old");
  });

  it("tells a new user what a missing resume costs them", async () => {
    vi.mocked(api.getProfile).mockResolvedValue(profile({ resume_text: "" }));
    renderPage();

    expect(await screen.findByText(/no resume saved/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add resume/i })).toBeInTheDocument();
  });

  it("reports stale scores against the profile and offers the re-score surface", async () => {
    const job = (over: object) => ({ key: "k", fit: 80, stale: false, ...over });
    vi.mocked(api.getJobs).mockResolvedValue([
      job({ key: "a" }), job({ key: "b", stale: true }), job({ key: "c", fit: null }),
    ] as never);
    vi.mocked(api.getProfile).mockResolvedValue(profile());
    const onOpenHealth = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ProfilePage onOpenHealth={onOpenHealth} />
      </QueryClientProvider>,
    );

    // two of three jobs carry a fit; one of those two is stale
    expect(await screen.findByText("2")).toBeInTheDocument();
    expect(screen.getByText(/rated against an older profile/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /health and scoring/i }));
    expect(onOpenHealth).toHaveBeenCalled();
  });
});

describe("ProfilePage resume upload", () => {
  it("fills the resume textarea with extracted text for review without saving", async () => {
    vi.mocked(api.getProfile).mockResolvedValue(profile());
    vi.mocked(api.extractResume).mockResolvedValue("EXTRACTED RESUME TEXT");
    renderPage();
    await openEditor(/^edit resume$/i);
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Resume" })).toHaveValue("old"));

    fireEvent.change(screen.getByLabelText("Upload resume file"), {
      target: { files: [new File(["x"], "resume.docx")] },
    });

    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Resume" })).toHaveValue("EXTRACTED RESUME TEXT"));
    expect(api.putProfile).not.toHaveBeenCalled();
    expect(vi.mocked(toast.info).mock.calls[0][0]).toMatch(/review/i);
  });

  it("shows an error toast when extraction fails and keeps the old text", async () => {
    vi.mocked(api.getProfile).mockResolvedValue(profile());
    vi.mocked(api.extractResume).mockRejectedValue(new Error("no text found in file"));
    renderPage();
    await openEditor(/^edit resume$/i);
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Resume" })).toHaveValue("old"));

    fireEvent.change(screen.getByLabelText("Upload resume file"), {
      target: { files: [new File(["x"], "resume.pdf")] },
    });

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("no text found in file"));
    expect(screen.getByRole("textbox", { name: "Resume" })).toHaveValue("old");
  });

  it("saves the edited resume without touching the other profile fields", async () => {
    vi.mocked(api.getProfile).mockResolvedValue(profile({ rules_text: "keep me", comp_floor: 180000 }));
    renderPage();
    await openEditor(/^edit resume$/i);
    fireEvent.change(await screen.findByRole("textbox", { name: "Resume" }),
      { target: { value: "new resume" } });
    fireEvent.click(screen.getByRole("button", { name: /save resume/i }));

    await waitFor(() => expect(api.putProfile).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.putProfile).mock.calls[0][0]).toEqual(
      expect.objectContaining({ resume_text: "new resume", rules_text: "keep me", comp_floor: 180000 }));
  });
});

describe("ProfilePage hard requirements", () => {
  it("blocks a save when the comp goal sits below the floor", async () => {
    vi.mocked(api.getProfile).mockResolvedValue(profile({ comp_floor: 180000, comp_goal: 220000 }));
    renderPage();
    await openEditor(/^edit hard requirements$/i);

    const goal = await screen.findByLabelText("Comp goal (CAD)");
    fireEvent.change(goal, { target: { value: "120000" } });

    expect(screen.getByText(/below your floor/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save requirements/i })).toBeDisabled();
  });

  it("labels the comp fields with the profile's configured currency", async () => {
    vi.mocked(api.getProfile).mockResolvedValue(profile({ currency: "EUR" }));
    renderPage();
    await openEditor(/^edit hard requirements$/i);

    expect(await screen.findByLabelText("Comp floor (EUR)")).toBeInTheDocument();
    expect(screen.getByLabelText("Comp goal (EUR)")).toBeInTheDocument();
  });

  it("saves the selected currency alongside the comp fields", async () => {
    vi.mocked(api.getProfile).mockResolvedValue(profile());
    renderPage();
    await openEditor(/^edit hard requirements$/i);

    fireEvent.change(await screen.findByLabelText("Currency"), { target: { value: "GBP" } });
    fireEvent.click(screen.getByRole("button", { name: /save requirements/i }));

    await waitFor(() => expect(api.putProfile).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.putProfile).mock.calls[0][0]).toEqual(
      expect.objectContaining({ currency: "GBP" }));
  });
});
