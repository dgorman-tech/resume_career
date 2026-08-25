import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as api from "../lib/api";
import { CompanyDialog } from "./CompanyDialog";

vi.mock("../lib/api", () => ({
  testCompany: vi.fn(),
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
});
