import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DimensionsPayload } from "../lib/types";
import * as api from "../lib/api";
import { TuneControl } from "./TuneControl";

vi.mock("../lib/api", () => ({ putWeights: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const PAYLOAD: DimensionsPayload = {
  holistic_weight: 50,
  dimensions: [
    { key: "comp", label: "Compensation", description: "d", weight: 10, position: 1, archived: false },
    { key: "old", label: "Old", description: "d", weight: 10, position: 2, archived: true },
  ],
};

describe("TuneControl", () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); });
  afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

  function setup(setTune = vi.fn()) {
    vi.mocked(api.putWeights).mockResolvedValue(PAYLOAD);
    render(<TuneControl tune={PAYLOAD} setTune={setTune} onError={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /tune/i }));
    return setTune;
  }

  it("renders a slider per active dimension plus model judgment, with numerals", () => {
    setup();
    expect(screen.getByRole("slider", { name: "Model judgment" })).toHaveValue("50");
    expect(screen.getByRole("slider", { name: "Compensation" })).toHaveValue("10");
    expect(screen.queryByRole("slider", { name: "Old" })).toBeNull();
    expect(screen.getByText("50")).toBeInTheDocument();
  });

  it("updates tune immediately and persists once after the debounce", async () => {
    const setTune = setup();
    fireEvent.change(screen.getByRole("slider", { name: "Compensation" }), { target: { value: "40" } });
    expect(setTune).toHaveBeenCalledWith(expect.objectContaining({
      dimensions: expect.arrayContaining([expect.objectContaining({ key: "comp", weight: 40 })]),
    }));
    expect(api.putWeights).not.toHaveBeenCalled();
    vi.advanceTimersByTime(600);
    await waitFor(() => expect(api.putWeights).toHaveBeenCalledTimes(1));
    expect(api.putWeights).toHaveBeenCalledWith({ comp: 40 }, 50);
  });

  it("reset restores defaults and persists them", async () => {
    const setTune = setup();
    fireEvent.click(screen.getByRole("button", { name: /reset to defaults/i }));
    expect(setTune).toHaveBeenCalledWith(expect.objectContaining({ holistic_weight: 50 }));
    vi.advanceTimersByTime(600);
    await waitFor(() => expect(api.putWeights).toHaveBeenCalledWith({ comp: 10 }, 50));
  });

  it("closes on Escape", async () => {
    setup();
    const slider = screen.getByRole("slider", { name: "Compensation" });
    fireEvent.keyDown(slider, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("slider", { name: "Compensation" })).toBeNull());
  });
});
