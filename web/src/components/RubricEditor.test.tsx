import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as api from "../lib/api";
import { RubricEditor } from "./RubricEditor";

vi.mock("../lib/api", () => ({ getDimensions: vi.fn(), putDimensions: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const dim = (key: string, label: string, position: number, archived = false) =>
  ({ key, label, description: `${label} desc`, weight: 10, position, archived });

function setup(dims = [dim("comp", "Compensation", 1), dim("flex", "Flexibility", 2)]) {
  vi.mocked(api.getDimensions).mockResolvedValue({ dimensions: dims, holistic_weight: 50 });
  vi.mocked(api.putDimensions).mockResolvedValue({ dimensions: dims, holistic_weight: 50 });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RubricEditor />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.clearAllMocks());

describe("RubricEditor", () => {
  it("renders a card per active dimension and an archived section", async () => {
    setup([dim("comp", "Compensation", 1), dim("old", "Old", 2, true)]);
    expect(await screen.findByDisplayValue("Compensation")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Old")).toBeNull();
    expect(screen.getByRole("button", { name: /restore old/i })).toBeInTheDocument();
  });

  it("saves the full set with reindexed positions", async () => {
    setup();
    fireEvent.change(await screen.findByDisplayValue("Compensation"), { target: { value: "Pay" } });
    fireEvent.click(screen.getByRole("button", { name: /save rubric/i }));
    await waitFor(() => expect(api.putDimensions).toHaveBeenCalledTimes(1));
    const sent = vi.mocked(api.putDimensions).mock.calls[0][0];
    expect(sent).toEqual([
      expect.objectContaining({ key: "comp", label: "Pay", position: 1, archived: false }),
      expect.objectContaining({ key: "flex", position: 2 }),
    ]);
  });

  it("adds a new dimension with null key and disables add at 8 active", async () => {
    setup([1, 2, 3, 4, 5, 6, 7].map((i) => dim(`d${i}`, `Dim ${i}`, i)));
    fireEvent.click(await screen.findByRole("button", { name: /add dimension/i }));
    expect(screen.getByRole("button", { name: /add dimension/i })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("New dimension name"), { target: { value: "Culture" } });
    fireEvent.change(screen.getByLabelText("New dimension description"), { target: { value: "signals" } });
    fireEvent.click(screen.getByRole("button", { name: /save rubric/i }));
    await waitFor(() => expect(api.putDimensions).toHaveBeenCalled());
    const sent = vi.mocked(api.putDimensions).mock.calls[0][0];
    expect(sent[sent.length - 1]).toEqual(
      expect.objectContaining({ key: null, label: "Culture", description: "signals", archived: false }));
  });

  it("archive removes the card and keeps it in the save payload", async () => {
    setup();
    fireEvent.click((await screen.findAllByRole("button", { name: /archive/i }))[0]);
    expect(screen.queryByDisplayValue("Compensation")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /save rubric/i }));
    await waitFor(() => expect(api.putDimensions).toHaveBeenCalled());
    expect(vi.mocked(api.putDimensions).mock.calls[0][0]).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: "comp", archived: true })]));
  });
});
