import { describe, it, expect } from "vitest";
import { contradictionsCompiler } from "./contradictions.js";
import { getPool } from "../../db/pool.js";
import { createSource } from "../../openbrain/sources.js";
import { createClaim, updateClaimStatus } from "../../openbrain/claims.js";
import { createRelation } from "../../openbrain/relations.js";

const ctx = () => ({
  runId: "00000000-0000-0000-0000-000000000001",
  generatedAt: new Date("2026-04-28T19:42:00Z"),
  pool: getPool(),
  vaultPath: "/tmp/unused"
});

describe("contradictionsCompiler", () => {
  it("renders an empty page when there are no contradictions", async () => {
    const pages = await contradictionsCompiler.render(ctx());
    expect(pages.length).toBe(1);
    expect(pages[0]?.content).toContain("No unresolved contradictions");
  });

  it("renders pairs with both sources and an unresolved-since date", async () => {
    const sa = await createSource({ type: "manual", title: "Source A" });
    const sb = await createSource({ type: "manual", title: "Source B" });
    const a = await createClaim({
      statement: "claim A",
      type: "finding",
      sourceId: sa.id
    });
    const b = await createClaim({
      statement: "claim B",
      type: "finding",
      sourceId: sb.id
    });
    await createRelation({
      fromClaim: a.id,
      toClaim: b.id,
      type: "contradicts"
    });

    const pages = await contradictionsCompiler.render(ctx());
    const content = pages[0]!.content;
    expect(content).toContain("claim A");
    expect(content).toContain("claim B");
    expect(content).toContain("Source A");
    expect(content).toContain("Source B");
    expect(content).toMatch(/Unresolved since: \d{4}-\d{2}-\d{2}/);
    expect(content).toMatch(/### Pair [0-9a-f]{8}/);
  });

  it("excludes pairs where either side is retired", async () => {
    const sa = await createSource({ type: "manual", title: "x" });
    const a = await createClaim({
      statement: "a",
      type: "finding",
      sourceId: sa.id
    });
    const b = await createClaim({
      statement: "b",
      type: "finding",
      sourceId: sa.id
    });
    await createRelation({
      fromClaim: a.id,
      toClaim: b.id,
      type: "contradicts"
    });
    await updateClaimStatus(a.id, "retired", "stale");

    const pages = await contradictionsCompiler.render(ctx());
    expect(pages[0]!.content).toContain("No unresolved contradictions");
  });
});
