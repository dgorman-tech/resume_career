import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StatusPill } from "./StatusPill";

describe("StatusPill", () => {
  it("renders current status and fires onChange", async () => {
    const onChange = vi.fn();
    render(<StatusPill status="new" onChange={onChange} />);
    const trigger = screen.getByRole("button", { name: /new/i });
    // Radix's DropdownMenuTrigger opens on native `pointerdown`, not `click` —
    // jsdom's fireEvent.click alone never dispatches that, so it's fired first.
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByText(/interested/i));
    expect(onChange).toHaveBeenCalledWith("interested");
  });
});
