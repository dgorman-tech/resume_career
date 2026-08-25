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

const ntfyField = () => screen.getByRole("textbox", { name: "ntfy topic" });

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

  it("keeps Save inert until something changes, then names the dirty section", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(SETTINGS);
    renderPage();
    await screen.findByText("Acme");

    expect(screen.getByRole("button", { name: "Save settings" })).toBeDisabled();
    expect(screen.getByText(/everything saved/i)).toBeInTheDocument();

    fireEvent.change(ntfyField(), { target: { value: "topic-2" } });
    expect(screen.getByRole("button", { name: "Save settings" })).not.toBeDisabled();
    expect(screen.getByText(/changes in advanced/i)).toBeInTheDocument();
  });

  it("discards edits back to the last saved config", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(SETTINGS);
    renderPage();
    await screen.findByText("Acme");

    fireEvent.change(ntfyField(), { target: { value: "topic-2" } });
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));

    expect(ntfyField()).toHaveValue("topic-1");
    expect(screen.getByRole("button", { name: "Save settings" })).toBeDisabled();
  });

  it("saves edited settings and reminds that changes apply next watcher run", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(SETTINGS);
    vi.mocked(api.putSettings).mockResolvedValue(SETTINGS);
    renderPage();
    await screen.findByText("Acme");

    fireEvent.change(ntfyField(), { target: { value: "topic-2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() => expect(api.putSettings).toHaveBeenCalled());
    expect(vi.mocked(api.putSettings).mock.calls[0][0].ntfy_topic).toBe("topic-2");
    expect(vi.mocked(toast.success).mock.calls[0][0]).toMatch(/next watcher run/i);
  });

  it("saves on Ctrl+S", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(SETTINGS);
    vi.mocked(api.putSettings).mockResolvedValue(SETTINGS);
    renderPage();
    await screen.findByText("Acme");

    fireEvent.change(ntfyField(), { target: { value: "topic-3" } });
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });

    await waitFor(() => expect(api.putSettings).toHaveBeenCalled());
    expect(vi.mocked(api.putSettings).mock.calls[0][0].ntfy_topic).toBe("topic-3");
  });

  it("shows the server validation error when save fails", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(SETTINGS);
    vi.mocked(api.putSettings).mockRejectedValue(new Error("companies.0.slug: too short"));
    renderPage();
    await screen.findByText("Acme");

    fireEvent.change(ntfyField(), { target: { value: "topic-2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("companies.0.slug: too short"));
  });

  it("removes a company only after the confirm dialog is accepted", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(SETTINGS);
    renderPage();
    await screen.findByText("Acme");

    fireEvent.click(screen.getByRole("button", { name: "Delete Acme" }));
    expect(await screen.findByText("Remove Acme?")).toBeInTheDocument();
    expect(screen.getByText("Acme")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove company" }));
    await waitFor(() => expect(screen.queryByText("Acme")).not.toBeInTheDocument());
  });

  it("keeps the company when the confirm dialog is cancelled", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(SETTINGS);
    renderPage();
    await screen.findByText("Acme");

    fireEvent.click(screen.getByRole("button", { name: "Delete Acme" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByText("Remove Acme?")).not.toBeInTheDocument());
    expect(screen.getByText("Acme")).toBeInTheDocument();
  });

  it("tests a company from its row and leaves the result in the row", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(SETTINGS);
    vi.mocked(api.testCompany).mockResolvedValue({
      jobs_found: 37,
      sample_titles: ["Data Lead"],
    });
    renderPage();
    await screen.findByText("Acme");

    fireEvent.click(screen.getByRole("button", { name: "Test Acme" }));
    expect(await screen.findByText("37 jobs")).toBeInTheDocument();
    expect(vi.mocked(toast.success).mock.calls[0][0]).toMatch(/found 37 jobs/i);
  });

  it("marks a failed fetch in the row", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(SETTINGS);
    vi.mocked(api.testCompany).mockRejectedValue(new Error("fetch failed: 404"));
    renderPage();
    await screen.findByText("Acme");

    fireEvent.click(screen.getByRole("button", { name: "Test Acme" }));
    expect(await screen.findByText("fetch failed")).toBeInTheDocument();
  });
});
