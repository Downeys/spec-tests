import { describe, it, expect } from "vitest";
import {
  createSource,
  upsertSourceByHash,
  getSource,
  getSourceMeta,
  getSourceByHash,
  listSourcesByIngestedAt
} from "./sources.js";
import { ValidationError } from "./types.js";

describe("createSource", () => {
  it("inserts a row and returns the full source", async () => {
    const source = await createSource({
      type: "web",
      title: "Square 2026",
      url: "https://square.com/state-of-restaurants",
      content: "long article body",
      contentHash: "abc123",
      ingestedBy: "cli"
    });

    expect(source.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(source.title).toBe("Square 2026");
    expect(source.content).toBe("long article body");
    expect(source.ingestedAt).toBeInstanceOf(Date);
  });

  it("rejects empty title", async () => {
    await expect(
      createSource({ type: "web", title: "" })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("accepts a source with no url (manual note)", async () => {
    const source = await createSource({
      type: "note",
      title: "Conversation with Alice"
    });
    expect(source.url).toBeNull();
  });
});

describe("upsertSourceByHash", () => {
  it("creates a new row when hash is unseen", async () => {
    const source = await upsertSourceByHash({
      type: "web",
      title: "First",
      contentHash: "h1"
    });
    expect(source.title).toBe("First");
  });

  it("returns the existing row when hash matches", async () => {
    const a = await upsertSourceByHash({
      type: "web",
      title: "First",
      contentHash: "h1"
    });
    const b = await upsertSourceByHash({
      type: "web",
      title: "Second (ignored)",
      contentHash: "h1"
    });
    expect(b.id).toBe(a.id);
    expect(b.title).toBe("First");
  });

  it("requires contentHash", async () => {
    await expect(
      upsertSourceByHash({ type: "web", title: "x" } as never)
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("getSource / getSourceMeta", () => {
  it("getSource returns full content; getSourceMeta omits it", async () => {
    const created = await createSource({
      type: "pdf",
      title: "Whitepaper",
      content: "the body"
    });
    const full = await getSource(created.id);
    const meta = await getSourceMeta(created.id);
    expect(full?.content).toBe("the body");
    expect(meta && "content" in meta).toBe(false);
  });

  it("returns null when not found", async () => {
    expect(await getSource("00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});

describe("getSourceByHash", () => {
  it("returns matching source", async () => {
    await createSource({ type: "web", title: "x", contentHash: "fff" });
    const found = await getSourceByHash("fff");
    expect(found?.title).toBe("x");
  });

  it("returns null for unknown hash", async () => {
    expect(await getSourceByHash("none")).toBeNull();
  });
});

describe("listSourcesByIngestedAt", () => {
  it("returns sources newest-first as metadata only", async () => {
    await createSource({ type: "web", title: "First" });
    await new Promise((r) => setTimeout(r, 5));
    await createSource({ type: "web", title: "Second" });

    const list = await listSourcesByIngestedAt();
    expect(list[0]?.title).toBe("Second");
    expect(list[1]?.title).toBe("First");
    expect(list[0] && "content" in list[0]).toBe(false);
  });
});
