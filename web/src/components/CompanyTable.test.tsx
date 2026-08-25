import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Company } from "../lib/types";
import { CompanyTable } from "./CompanyTable";

const COMPANIES: Company[] = [
  { name: "Zeta", tier: 1, adapter: "ashby", slug: "zeta-co" },
  { name: "Acme", tier: 3, adapter: "lever", slug: "acme-co" },
  { name: "Mid", tier: 1, adapter: "workable", slug: "mid-co" },
];

function renderTable(props: Partial<Parameters<typeof CompanyTable>[0]> = {}) {
  const handlers = {
    onAdd: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(), onTest: vi.fn(),
  };
  render(<CompanyTable companies={COMPANIES} tests={{}} {...handlers} {...props} />);
  return handlers;
}

const names = () =>
  screen.getAllByRole("button", { name: /^Edit / }).map((b) => b.textContent);

describe("CompanyTable", () => {
  it("sorts by tier first so the list groups the way it is triaged", () => {
    renderTable();
    expect(names()).toEqual(["Mid", "Zeta", "Acme"]);
  });

  it("re-sorts by company name and back", () => {
    renderTable();
    fireEvent.click(screen.getByRole("button", { name: /^COMPANY/ }));
    expect(names()).toEqual(["Acme", "Mid", "Zeta"]);

    fireEvent.click(screen.getByRole("button", { name: /^COMPANY/ }));
    expect(names()).toEqual(["Zeta", "Mid", "Acme"]);
  });

  it("edits the config-array entry the row came from, not its sorted position", () => {
    const { onEdit } = renderTable();
    fireEvent.click(screen.getByRole("button", { name: "Edit Acme" }));
    expect(onEdit).toHaveBeenCalledWith(1);
  });

  it("filters by name, adapter, or endpoint", () => {
    renderTable();
    const search = screen.getByRole("textbox", { name: "Search companies" });

    fireEvent.change(search, { target: { value: "zeta" } });
    expect(names()).toEqual(["Zeta"]);

    fireEvent.change(search, { target: { value: "workable" } });
    expect(names()).toEqual(["Mid"]);

    fireEvent.change(search, { target: { value: "acme-co" } });
    expect(names()).toEqual(["Acme"]);
  });

  it("narrows to one tier from the count chips and clears on a second click", () => {
    renderTable();
    const t1 = screen.getByRole("button", { name: "T1 2" });

    fireEvent.click(t1);
    expect(names()).toEqual(["Mid", "Zeta"]);

    fireEvent.click(t1);
    expect(names()).toEqual(["Mid", "Zeta", "Acme"]);
  });

  it("shows the last test result per row", () => {
    renderTable({
      tests: {
        "ashby:Zeta": { kind: "ok", jobs: 12, sample: "Data Lead" },
        "lever:Acme": { kind: "failed", error: "fetch failed: 404" },
      },
    });
    expect(screen.getByText("12 jobs")).toBeInTheDocument();
    expect(screen.getByText("fetch failed")).toBeInTheDocument();
    expect(screen.getAllByText("not tested")).toHaveLength(1);
  });

  it("says what is missing when nothing matches the search", () => {
    renderTable();
    fireEvent.change(screen.getByRole("textbox", { name: "Search companies" }),
                     { target: { value: "nope" } });
    expect(screen.getByText(/No company matches/)).toBeInTheDocument();
  });

  it("teaches the empty table instead of leaving it blank", () => {
    renderTable({ companies: [] });
    expect(screen.getByText(/Add one to start watching/)).toBeInTheDocument();
  });

  it("routes row actions without triggering the row edit", () => {
    const { onEdit, onDelete, onTest } = renderTable();
    const row = screen.getByRole("button", { name: "Edit Mid" }).closest("tr")!;

    fireEvent.click(within(row).getByRole("button", { name: "Test Mid" }));
    fireEvent.click(within(row).getByRole("button", { name: "Delete Mid" }));

    expect(onTest).toHaveBeenCalledWith(2);
    expect(onDelete).toHaveBeenCalledWith(2);
    expect(onEdit).not.toHaveBeenCalled();
  });
});
