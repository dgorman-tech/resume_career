import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_FILTERS, FilterBar, type Filters } from "./FilterBar";

function bar(over: Partial<Filters> = {}, setFilters = vi.fn()) {
  render(
    <FilterBar
      filters={{ ...DEFAULT_FILTERS, ...over }}
      setFilters={setFilters}
      count={3}
      searchRef={createRef<HTMLInputElement>()}
    />,
  );
  return setFilters;
}

describe("FilterBar JD-fact facets", () => {
  it("starts with every facet off, so the board is not silently narrowed", () => {
    expect(DEFAULT_FILTERS.remote).toBeNull();
    expect(DEFAULT_FILTERS.maxOfficeDays).toBeNull();
    expect(DEFAULT_FILTERS.jdSalaryOnly).toBe(false);
  });

  it("narrows to a remote policy", () => {
    const setFilters = bar();
    fireEvent.change(screen.getByLabelText(/location/i), { target: { value: "hybrid" } });
    expect(setFilters).toHaveBeenCalledWith(expect.objectContaining({ remote: "hybrid" }));
  });

  it("clears the location facet back to any", () => {
    const setFilters = bar({ remote: "hybrid" });
    fireEvent.change(screen.getByLabelText(/location/i), { target: { value: "" } });
    expect(setFilters).toHaveBeenCalledWith(expect.objectContaining({ remote: null }));
  });

  it("narrows to an office-day ceiling", () => {
    const setFilters = bar();
    fireEvent.change(screen.getByLabelText(/office days/i), { target: { value: "2" } });
    expect(setFilters).toHaveBeenCalledWith(expect.objectContaining({ maxOfficeDays: 2 }));
  });

  it("keeps a ceiling of zero distinct from no ceiling", () => {
    const setFilters = bar();
    fireEvent.change(screen.getByLabelText(/office days/i), { target: { value: "0" } });
    expect(setFilters).toHaveBeenCalledWith(expect.objectContaining({ maxOfficeDays: 0 }));
  });

  it("toggles the JD-salary facet", () => {
    const setFilters = bar();
    fireEvent.click(screen.getByRole("button", { name: /jd salary/i }));
    expect(setFilters).toHaveBeenCalledWith(expect.objectContaining({ jdSalaryOnly: true }));
  });

  it("shows the JD-salary facet as pressed while it is on", () => {
    bar({ jdSalaryOnly: true });
    expect(screen.getByRole("button", { name: /jd salary/i })).toHaveAttribute("aria-pressed", "true");
  });
});
