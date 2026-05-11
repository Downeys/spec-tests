import { describe, it, expect } from "vitest";
import { indexCompiler } from "./index.js";
import { getPool } from "../../db/pool.js";
import { createSource } from "../../openbrain/sources.js";
import { createClaim } from "../../openbrain/claims.js";
import { addClaimTag } from "../../openbrain/tags.js";

const ctx = () => ({
  runId: "00000000-0000-0000-0000-000000000001",
  generatedAt: new Date("2026-04-28T19:42:00Z"),
  pool: getPool(),
  vaultPath: "/tmp/unused"
});

describe("indexCompiler", () => {
  it("lists control pages and concept pages", async () => {
    const source = await createSource({ type: "manual", title: "x" });
    const c = await createClaim({
      statement: "x",
      type: "finding",
      sourceId: source.id
    });
    await addClaimTag(c.id, "alpha");

    const pages = await indexCompiler.render(ctx());
    const content = pages[0]!.content;
    expect(pages[0]?.path).toBe("index.md");
    expect(content).toContain("type: index");
    expect(content).toContain("## Control pages");
    expect(content).toContain("[[sources|");
    expect(content).toContain("[[contradictions|");
    expect(content).toContain("## Concepts");
    expect(content).toContain("[[concepts/alpha|");
  });
});
