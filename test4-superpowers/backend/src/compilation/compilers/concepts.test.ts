import { describe, it, expect } from "vitest";
import { conceptsCompiler } from "./concepts.js";
import { getPool } from "../../db/pool.js";
import { createSource } from "../../openbrain/sources.js";
import { createClaim, updateClaimStatus } from "../../openbrain/claims.js";
import { createRelation } from "../../openbrain/relations.js";
import { addClaimTag } from "../../openbrain/tags.js";

const ctx = () => ({
  runId: "00000000-0000-0000-0000-000000000001",
  generatedAt: new Date("2026-04-28T19:42:00Z"),
  pool: getPool(),
  vaultPath: "/tmp/unused"
});

describe("conceptsCompiler", () => {
  it("returns no pages when there are no tags", async () => {
    const pages = await conceptsCompiler.render(ctx());
    expect(pages).toEqual([]);
  });

  it("renders a concept page per tag with claims grouped by status", async () => {
    const source = await createSource({ type: "manual", title: "Square 2026" });
    const validated = await createClaim({
      statement: "62% manage scheduling manually",
      type: "finding",
      sourceId: source.id
    });
    const open = await createClaim({
      statement: "SMBs prefer SMS over email",
      type: "hypothesis",
      sourceId: source.id
    });
    await addClaimTag(validated.id, "smb-restaurants");
    await addClaimTag(open.id, "smb-restaurants");
    await updateClaimStatus(validated.id, "validated", "smoke check");

    const pages = await conceptsCompiler.render(ctx());
    expect(pages.length).toBe(1);
    expect(pages[0]?.path).toBe("concepts/smb-restaurants.md");

    const content = pages[0]!.content;
    expect(content).toContain("type: concept");
    expect(content).toContain("slug: smb-restaurants");
    expect(content).toContain("## Validated findings");
    expect(content).toContain("62% manage scheduling manually");
    expect(content).toContain("## Open hypotheses");
    expect(content).toContain("SMBs prefer SMS over email");
    expect(content).toContain("[[sources#^src-");
  });

  it("renders a stub for tags with zero active claims", async () => {
    const source = await createSource({ type: "manual", title: "x" });
    const c = await createClaim({
      statement: "x",
      type: "finding",
      sourceId: source.id
    });
    await addClaimTag(c.id, "stale");
    await updateClaimStatus(c.id, "retired", "no longer relevant");

    const pages = await conceptsCompiler.render(ctx());
    const stale = pages.find((p) => p.path === "concepts/stale.md");
    expect(stale).toBeDefined();
    expect(stale!.content).toContain("claim_count: 0");
    expect(stale!.content).toContain("No active claims");
  });

  it("includes outgoing relation hints under each claim", async () => {
    const source = await createSource({ type: "manual", title: "x" });
    const a = await createClaim({
      statement: "claim a",
      type: "finding",
      sourceId: source.id
    });
    const b = await createClaim({
      statement: "claim b",
      type: "finding",
      sourceId: source.id
    });
    await addClaimTag(a.id, "topic");
    await addClaimTag(b.id, "topic");
    await createRelation({ fromClaim: a.id, toClaim: b.id, type: "supports" });

    const pages = await conceptsCompiler.render(ctx());
    const topic = pages.find((p) => p.path === "concepts/topic.md")!;
    expect(topic.content).toMatch(/supports.*claim-/i);
    expect(topic.content).toMatch(/\[\[concepts\/topic#\^claim-[0-9a-f]{8}\|claim claim-[0-9a-f]{8}\]\]/);
  });

  it("wraps refuted claims in strikethrough on the concept page", async () => {
    const source = await createSource({ type: "manual", title: "S" });
    const refuted = await createClaim({
      statement: "this turned out to be wrong",
      type: "finding",
      sourceId: source.id
    });
    await addClaimTag(refuted.id, "refuted-topic");
    await updateClaimStatus(refuted.id, "refuted", "evidence emerged");

    const pages = await conceptsCompiler.render(ctx());
    const page = pages.find((p) => p.path === "concepts/refuted-topic.md")!;
    expect(page.content).toContain('~~"this turned out to be wrong"~~');
  });
});
