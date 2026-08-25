import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as api from "../lib/api";
import ProfilePage from "./ProfilePage";

vi.mock("../lib/api", () => ({
  getProfile: vi.fn(),
  putProfile: vi.fn(),
  extractResume: vi.fn(),
  getDimensions: vi.fn().mockResolvedValue({ dimensions: [], holistic_weight: 50 }),
  putDimensions: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ProfilePage />
    </QueryClientProvider>,
  );
}

describe("ProfilePage resume upload", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("fills the resume textarea with extracted text for review without saving", async () => {
    vi.mocked(api.getProfile).mockResolvedValue({
      resume_text: "old", rules_text: "", comp_floor_cad: null, comp_goal_cad: null,
      max_office_days: null, location_text: "", min_level: "", updated_at: null,
    });
    vi.mocked(api.extractResume).mockResolvedValue("EXTRACTED RESUME TEXT");
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Resume" })).toHaveValue("old"));

    const input = screen.getByLabelText("Upload resume file");
    fireEvent.change(input, {
      target: { files: [new File(["x"], "resume.docx")] },
    });

    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Resume" })).toHaveValue("EXTRACTED RESUME TEXT"));
    expect(api.putProfile).not.toHaveBeenCalled();
    expect(vi.mocked(toast.info).mock.calls[0][0]).toMatch(/review/i);
  });

  it("shows an error toast when extraction fails and keeps the old text", async () => {
    vi.mocked(api.getProfile).mockResolvedValue({
      resume_text: "old", rules_text: "", comp_floor_cad: null, comp_goal_cad: null,
      max_office_days: null, location_text: "", min_level: "", updated_at: null,
    });
    vi.mocked(api.extractResume).mockRejectedValue(new Error("no text found in file"));
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Resume" })).toHaveValue("old"));

    fireEvent.change(screen.getByLabelText("Upload resume file"), {
      target: { files: [new File(["x"], "resume.pdf")] },
    });

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("no text found in file"));
    expect(screen.getByRole("textbox", { name: "Resume" })).toHaveValue("old");
  });
});
