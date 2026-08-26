import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as api from "../lib/api";
import { CompanyDialog } from "./CompanyDialog";

vi.mock("../lib/api", () => ({
  testCompany: vi.fn(),
  detectCompany: vi.fn(),
}));

function renderDialog(props: Partial<Parameters<typeof CompanyDialog>[0]> = {}) {
  return render(
    <CompanyDialog open initial={null} onSave={vi.fn()} onClose={vi.fn()} {...props} />,
  );
}

describe("CompanyDialog", () => {
  it("shows slug field for ashby and switches to workday fields", () => {
    renderDialog();
    expect(screen.getByRole("textbox", { name: "Slug" })).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "Adapter" }),
                     { target: { value: "workday" } });
    expect(screen.queryByRole("textbox", { name: "Slug" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Tenant" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Workday instance" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Site" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Search terms" })).toBeInTheDocument();
  });

  it("disables Save until required fields are filled, then saves the built company", () => {
    const onSave = vi.fn();
    renderDialog({ onSave });
    const save = screen.getByRole("button", { name: "Save company" });
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByRole("textbox", { name: "Company name" }),
                     { target: { value: "Acme" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Slug" }),
                     { target: { value: "acme" } });
    expect(save).not.toBeDisabled();

    fireEvent.click(save);
    expect(onSave).toHaveBeenCalledWith({ name: "Acme", tier: 2, adapter: "ashby", slug: "acme" });
  });

  it("builds workday search_terms from comma-separated input", () => {
    const onSave = vi.fn();
    renderDialog({ onSave });
    fireEvent.change(screen.getByRole("combobox", { name: "Adapter" }),
                     { target: { value: "workday" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Company name" }),
                     { target: { value: "BigCo" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Tenant" }),
                     { target: { value: "bigco" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Workday instance" }),
                     { target: { value: "wd3" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Site" }),
                     { target: { value: "External" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Search terms" }),
                     { target: { value: "data, analytics" } });

    fireEvent.click(screen.getByRole("button", { name: "Save company" }));
    expect(onSave).toHaveBeenCalledWith({
      name: "BigCo", tier: 2, adapter: "workday", tenant: "bigco", wd: "wd3",
      site: "External", search_terms: ["data", "analytics"],
    });
  });

  it("shows the live-fetch result after Test succeeds", async () => {
    vi.mocked(api.testCompany).mockResolvedValue({
      jobs_found: 7,
      sample_titles: ["Data Lead", "Risk Manager"],
    });
    renderDialog();
    fireEvent.change(screen.getByRole("textbox", { name: "Company name" }),
                     { target: { value: "Acme" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Slug" }),
                     { target: { value: "acme" } });
    fireEvent.click(screen.getByRole("button", { name: "Test fetch" }));

    await waitFor(() => expect(screen.getByText(/found 7 jobs/i)).toBeInTheDocument());
    expect(screen.getByText(/Data Lead/)).toBeInTheDocument();
  });

  it("shows the error when Test fails", async () => {
    vi.mocked(api.testCompany).mockRejectedValue(new Error("fetch failed: 404"));
    renderDialog();
    fireEvent.change(screen.getByRole("textbox", { name: "Company name" }),
                     { target: { value: "Acme" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Slug" }),
                     { target: { value: "nope" } });
    fireEvent.click(screen.getByRole("button", { name: "Test fetch" }));

    await waitFor(() => expect(screen.getByText(/fetch failed: 404/)).toBeInTheDocument());
  });

  it("offers greenhouse as a slug-based adapter", () => {
    renderDialog();
    fireEvent.change(screen.getByRole("combobox", { name: "Adapter" }),
                     { target: { value: "greenhouse" } });
    expect(screen.getByRole("textbox", { name: "Slug" })).toBeInTheDocument();
  });

  it("pre-fills fields from a recognized pasted URL, without saving", async () => {
    const onSave = vi.fn();
    vi.mocked(api.detectCompany).mockResolvedValue({
      recognized: true, adapter: "greenhouse", slug: "acme", tenant: null, wd: null,
      site: null, host: null, suggested_name: "Acme", message: "recognized as greenhouse",
    });
    renderDialog({ onSave });

    fireEvent.change(screen.getByRole("textbox", { name: "Paste a job posting or careers-page URL" }),
                     { target: { value: "https://boards.greenhouse.io/acme/jobs/123" } });
    fireEvent.click(screen.getByRole("button", { name: "Detect" }));

    await waitFor(() => expect(screen.getByText(/Recognized as greenhouse/)).toBeInTheDocument());
    expect(api.detectCompany).toHaveBeenCalledWith("https://boards.greenhouse.io/acme/jobs/123");
    expect(screen.getByRole("combobox", { name: "Adapter" })).toHaveValue("greenhouse");
    expect(screen.getByRole("textbox", { name: "Slug" })).toHaveValue("acme");
    expect(screen.getByRole("textbox", { name: "Company name" })).toHaveValue("Acme");
    // detecting only pre-fills the form; the user still has to hit Save
    expect(onSave).not.toHaveBeenCalled();
  });

  it("says plainly when a pasted URL isn't recognized, and leaves the form alone", async () => {
    vi.mocked(api.detectCompany).mockResolvedValue({
      recognized: false, adapter: null, slug: null, tenant: null, wd: null,
      site: null, host: null, suggested_name: null,
      message: "couldn't recognize that as a known job board URL",
    });
    renderDialog();

    fireEvent.change(screen.getByRole("textbox", { name: "Paste a job posting or careers-page URL" }),
                     { target: { value: "https://example.com/careers" } });
    fireEvent.click(screen.getByRole("button", { name: "Detect" }));

    await waitFor(() =>
      expect(screen.getByText(/couldn't recognize that as a known job board URL/)).toBeInTheDocument());
    expect(screen.getByRole("combobox", { name: "Adapter" })).toHaveValue("ashby");
    expect(screen.getByRole("textbox", { name: "Slug" })).toHaveValue("");
  });

  it("pressing Enter in the paste-url field detects instead of submitting the form", () => {
    const onSave = vi.fn();
    vi.mocked(api.detectCompany).mockResolvedValue({
      recognized: false, adapter: null, slug: null, tenant: null, wd: null,
      site: null, host: null, suggested_name: null, message: "not recognized",
    });
    renderDialog({ onSave });
    // fill enough that the form would be saveable, to prove Enter here doesn't submit it
    fireEvent.change(screen.getByRole("textbox", { name: "Company name" }),
                     { target: { value: "Acme" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Slug" }), { target: { value: "acme" } });

    const urlInput = screen.getByRole("textbox", { name: "Paste a job posting or careers-page URL" });
    fireEvent.change(urlInput, { target: { value: "https://jobs.lever.co/acme" } });
    fireEvent.keyDown(urlInput, { key: "Enter", code: "Enter" });

    expect(api.detectCompany).toHaveBeenCalledWith("https://jobs.lever.co/acme");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("hides the paste-url affordance when editing an existing company", () => {
    renderDialog({ initial: { name: "Acme", tier: 1, adapter: "ashby", slug: "acme" } });
    expect(screen.queryByRole("textbox", { name: "Paste a job posting or careers-page URL" }))
      .not.toBeInTheDocument();
  });
});
