import { fireEvent, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useKeyboard } from "./useKeyboard";

function opts(overrides = {}) {
  return {
    enabled: true,
    keys: ["a1", "a2", "a3"],
    selectedKey: "a1",
    setSelectedKey: vi.fn(),
    drawerOpen: false,
    setDrawerOpen: vi.fn(),
    setStatus: vi.fn(),
    toggleStar: vi.fn(),
    startDeepDive: vi.fn(),
    setFollowUp: vi.fn(),
    focusSearch: vi.fn(),
    toggleHelp: vi.fn(),
    ...overrides,
  };
}

describe("useKeyboard", () => {
  it("j moves selection down", () => {
    const o = opts();
    renderHook(() => useKeyboard(o));
    fireEvent.keyDown(window, { key: "j" });
    expect(o.setSelectedKey).toHaveBeenCalledWith("a2");
  });

  it("i marks interested", () => {
    const o = opts();
    renderHook(() => useKeyboard(o));
    fireEvent.keyDown(window, { key: "i" });
    expect(o.setStatus).toHaveBeenCalledWith("a1", "interested");
  });

  it("Escape closes the drawer", () => {
    const o = opts({ drawerOpen: true });
    renderHook(() => useKeyboard(o));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(o.setDrawerOpen).toHaveBeenCalledWith(false);
  });

  it("f opens the drawer on the selected job to set a follow-up", () => {
    const o = opts();
    renderHook(() => useKeyboard(o));
    fireEvent.keyDown(window, { key: "f" });
    expect(o.setDrawerOpen).toHaveBeenCalledWith(true);
    expect(o.setFollowUp).toHaveBeenCalledWith("a1");
  });

  it("f does nothing with no row selected", () => {
    const o = opts({ selectedKey: null });
    renderHook(() => useKeyboard(o));
    fireEvent.keyDown(window, { key: "f" });
    expect(o.setFollowUp).not.toHaveBeenCalled();
  });

  it("focuses the row it moves to, so closing the drawer can return the user there", () => {
    const table = document.createElement("table");
    const body = document.createElement("tbody");
    const tr = document.createElement("tr");
    tr.setAttribute("data-key", "a2");
    tr.tabIndex = -1;
    body.appendChild(tr);
    table.appendChild(body);
    document.body.appendChild(table);

    const o = opts();
    renderHook(() => useKeyboard(o));
    fireEvent.keyDown(window, { key: "j" });

    expect(document.activeElement).toBe(tr);
    table.remove();
  });

  it("ignores keys while typing in an input", () => {
    const o = opts();
    renderHook(() => useKeyboard(o));
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: "j" });
    expect(o.setSelectedKey).not.toHaveBeenCalled();
  });
});
