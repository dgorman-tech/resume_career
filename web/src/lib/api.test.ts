import { afterEach, describe, expect, it, vi } from "vitest";
import { extractResume } from "./api";

describe("extractResume", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the file as multipart form data without a JSON content-type", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, data: { text: "extracted" }, error: null }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const text = await extractResume(new File(["hello"], "resume.txt", { type: "text/plain" }));

    expect(text).toBe("extracted");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/profile/extract");
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.headers).toBeUndefined();
  });

  it("throws the server error message on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ ok: false, data: null, error: "unsupported file type" }),
      }),
    );
    await expect(extractResume(new File(["x"], "r.rtf"))).rejects.toThrow("unsupported file type");
  });
});
