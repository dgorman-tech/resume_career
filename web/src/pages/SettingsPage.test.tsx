import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as api from "../lib/api";
import type { Settings } from "../lib/types";
import SettingsPage from "./SettingsPage";

vi.mock("../lib/api", () => ({
  getSettings: vi.fn(),
  putSettings: vi.fn(),
  testCompany: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const SETTINGS: Settings = {
  ntfy_topic: "topic-1",
  filters: {
    title_domain: ["data"],
    title_seniority: ["manager"],
    title_exclude: ["intern"],
    location_include: ["toronto"],
    location_exclude: [],
  },
  companies: [{ name: "Acme", tier: 1, adapter: "ashby", slug: "acme" }],
  app: {
    batch_model: "m-flash",
    deep_dive_model: "m-pro",
    batch_scoring: true,
    internal_companies: [],
  },
};

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <SettingsPage />
    </QueryClientProvider>,
  );
}

describe("SettingsPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders companies and filter chips after load", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(SETTINGS);
    renderPage();
    expect(await screen.findByText("Acme")).toBeInTheDocument();
    expect(screen.getByText("data")).toBeInTheDocument();
    expect(screen.getByText("manager")).toBeInTheDocument();
  });

  it("saves edited settings and reminds that changes apply next watcher run", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(SETTINGS);
    vi.mocked(api.putSettings).mockResolvedValue(SETTINGS);
    renderPage();
    await screen.findByText("Acme");

    const ntfy = screen.getByRole("textbox", { name: "ntfy topic" });
    fireEvent.change(ntfy, { target: { value: "topic-2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() => expect(api.putSettings).toHaveBeenCalled());
    expect(vi.mocked(api.putSettings).mock.calls[0][0].ntfy_topic).toBe("topic-2");
    expect(vi.mocked(toast.success).mock.calls[0][0]).toMatch(/next watcher run/i);
  });

  it("shows the server validation error when save fails", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(SETTINGS);
    vi.mocked(api.putSettings).mockRejectedValue(new Error("companies.0.slug: too short"));
    renderPage();
    await screen.findByText("Acme");

    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("companies.0.slug: too short"));
  });

  it("removes a company after confirmation", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.mocked(api.getSettings).mockResolvedValue(SETTINGS);
    renderPage();
    await screen.findByText("Acme");

    fireEvent.click(screen.getByRole("button", { name: "Delete Acme" }));
    expect(screen.queryByText("Acme")).not.toBeInTheDocument();
  });

  it("tests a company from its row and toasts the result", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(SETTINGS);
    vi.mocked(api.testCompany).mockResolvedValue({
      jobs_found: 37,
      sample_titles: ["Data Lead"],
    });
    renderPage();
    await screen.findByText("Acme");

    fireEvent.click(screen.getByRole("button", { name: "Test Acme" }));
    await waitFor(() =>
      expect(vi.mocked(toast.success).mock.calls[0][0]).toMatch(/found 37 jobs/i));
  });
});
