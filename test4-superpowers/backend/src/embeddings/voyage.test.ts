import { describe, it, expect, vi, beforeEach } from "vitest";
import { createVoyageProvider } from "./voyage.js";
import { EmbeddingError } from "./types.js";

const embedMock = vi.fn();

vi.mock("./voyage-client.js", () => ({
  VoyageAIClient: vi.fn().mockImplementation(() => ({
    embed: embedMock
  }))
}));

beforeEach(() => {
  embedMock.mockReset();
});

describe("createVoyageProvider", () => {
  it("returns a provider with model + dimensions", () => {
    const p = createVoyageProvider({ apiKey: "k", model: "voyage-3" });
    expect(p.model).toBe("voyage-3");
    expect(p.dimensions).toBe(1024);
  });

  it("calls Voyage and returns the embeddings", async () => {
    embedMock.mockResolvedValueOnce({
      data: [{ embedding: new Array(1024).fill(0.1) }]
    });
    const p = createVoyageProvider({ apiKey: "k", model: "voyage-3" });
    const out = await p.embed(["hello"]);
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1024);
  });

  it("wraps Voyage errors as EmbeddingError", async () => {
    embedMock.mockRejectedValueOnce(new Error("boom"));
    const p = createVoyageProvider({ apiKey: "k", model: "voyage-3" });
    await expect(p.embed(["x"])).rejects.toBeInstanceOf(EmbeddingError);
  });

  it("rejects malformed dimensions", async () => {
    embedMock.mockResolvedValueOnce({
      data: [{ embedding: new Array(512).fill(0) }]
    });
    const p = createVoyageProvider({ apiKey: "k", model: "voyage-3" });
    await expect(p.embed(["x"])).rejects.toBeInstanceOf(EmbeddingError);
  });
});
