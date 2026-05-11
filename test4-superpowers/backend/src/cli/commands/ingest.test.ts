import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ingestSource } from "./ingest.js";

let tmp: string;
beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "ingest-"));
});
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe("ingestSource", () => {
  it("ingests a JSON manifest", async () => {
    const path = join(tmp, "manifest.json");
    await writeFile(
      path,
      JSON.stringify({
        type: "web",
        title: "Square 2026",
        url: "https://example.com",
        content: "the body"
      })
    );
    const source = await ingestSource(path);
    expect(source.title).toBe("Square 2026");
    expect(source.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("ingests a markdown file with frontmatter", async () => {
    const path = join(tmp, "article.md");
    await writeFile(
      path,
      `---
type: web
title: Toast Field Survey
url: https://toast.com
author: Toast Research
---
This is the body content.`
    );
    const source = await ingestSource(path);
    expect(source.title).toBe("Toast Field Survey");
    expect(source.author).toBe("Toast Research");
    expect(source.content).toContain("This is the body content");
  });

  it("dedups by content hash on re-ingest", async () => {
    const path = join(tmp, "manifest.json");
    await writeFile(
      path,
      JSON.stringify({ type: "web", title: "x", content: "same body" })
    );
    const a = await ingestSource(path);
    const b = await ingestSource(path);
    expect(b.id).toBe(a.id);
  });
});
