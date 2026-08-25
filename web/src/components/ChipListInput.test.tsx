import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChipListInput } from "./ChipListInput";

describe("ChipListInput", () => {
  it("renders existing values as chips", () => {
    render(<ChipListInput label="Domain keywords" values={["data", "risk"]} onChange={vi.fn()} />);
    expect(screen.getByText("data")).toBeInTheDocument();
    expect(screen.getByText("risk")).toBeInTheDocument();
  });

  it("adds a trimmed keyword on Enter and ignores duplicates", () => {
    const onChange = vi.fn();
    render(<ChipListInput label="Domain keywords" values={["data"]} onChange={onChange} />);
    const input = screen.getByRole("textbox", { name: "Domain keywords" });

    fireEvent.change(input, { target: { value: "  risk  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(["data", "risk"]);

    fireEvent.change(input, { target: { value: "data" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("removes a chip via its remove button", () => {
    const onChange = vi.fn();
    render(<ChipListInput label="Domain keywords" values={["data", "risk"]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove data" }));
    expect(onChange).toHaveBeenCalledWith(["risk"]);
  });
});
