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
