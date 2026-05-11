import { describe, it, expect } from "vitest";
import { sourcesCompiler } from "./sources.js";
import { getPool } from "../../db/pool.js";
import { createSource } from "../../openbrain/sources.js";

const ctx = () => ({
  runId: "00000000-0000-0000-0000-000000000001",
  generatedAt: new Date("2026-04-28T19:42:00Z"),
  pool: getPool(),
  vaultPath: "/tmp/unused"
});

describe("sourcesCompiler", () => {
  it("renders an empty source-index when there are no sources", async () => {
    const pages = await sourcesCompiler.render(ctx());
    expect(pages.length).toBe(1);
    expect(pages[0]?.path).toBe("sources.md");
    expect(pages[0]?.content).toContain("source_count: 0");
    expect(pages[0]?.content).toContain("# Sources");
  });

  it("renders one anchored stub per source, newest first", async () => {
    await createSource({
      type: "web",
      title: "First",
      url: "https://example.com/1"
    });
    await new Promise((r) => setTimeout(r, 5));
    await createSource({
      type: "pdf",
      title: "Second",
      author: "Bob"
    });

    const pages = await sourcesCompiler.render(ctx());
    const content = pages[0]!.content;
    expect(content).toContain("source_count: 2");
    const firstIdx = content.indexOf("First");
    const secondIdx = content.indexOf("Second");
    expect(secondIdx).toBeLessThan(firstIdx);
    expect(content).toContain("^src-");
    expect(content).toContain("**Type:** web");
    expect(content).toContain("**Type:** pdf");
    expect(content).toContain("**Author:** Bob");
  });
});
