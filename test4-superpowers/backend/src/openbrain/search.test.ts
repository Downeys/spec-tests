import { describe, it, expect, beforeEach, vi } from "vitest";
import { searchClaims } from "./search.js";
import { createClaim } from "./claims.js";
import { createSource } from "./sources.js";
import { addClaimTag } from "./tags.js";
import { setEmbeddingProvider } from "../embeddings/index.js";
import { embedClaim } from "../embeddings/pipeline.js";

const PROVIDER = {
  model: "fake",
  dimensions: 1024,
  // Distinct vectors per text so similarity is meaningful in tests
  embed: async (texts: string[]) =>
    texts.map((t) => {
      const v = new Array(1024).fill(0);
      const seed = [...t].reduce((a, c) => a + c.charCodeAt(0), 0);
      for (let i = 0; i < 1024; i++) v[i] = Math.sin(seed + i);
      // L2 normalize
      const norm = Math.sqrt(v.reduce((a, n) => a + n * n, 0));
      return v.map((n) => n / norm);
    })
};

beforeEach(() => {
  setEmbeddingProvider(PROVIDER);
});

async function seed(statement: string, opts: { tag?: string } = {}) {
  const src = await createSource({ type: "manual", title: "s" });
  const c = await createClaim({ statement, type: "finding", sourceId: src.id });
  await embedClaim(c.id);
  if (opts.tag) await addClaimTag(c.id, opts.tag);
  return c;
}

describe("searchClaims", () => {
  it("returns claims ordered by vector similarity", async () => {
    const a = await seed("pricing pain in restaurants");
    const b = await seed("scheduling pain in restaurants");
    await seed("unrelated topic about manufacturing");

    const results = await searchClaims("pricing strategy", { topK: 2 });
    expect(results.length).toBeLessThanOrEqual(2);
    expect(results.map((r) => r.claim.id)).toContain(a.id);
    expect(results[0]?.similarity).toBeTypeOf("number");
  });

  it("respects topK", async () => {
    for (let i = 0; i < 5; i++) await seed(`topic ${i}`);
    const results = await searchClaims("anything", { topK: 3 });
    expect(results.length).toBe(3);
  });

  it("filters by tag", async () => {
    await seed("pricing pain", { tag: "pricing" });
    await seed("scheduling pain", { tag: "scheduling" });
    const results = await searchClaims("pain", {
      topK: 5,
      filter: { tags: ["pricing"] }
    });
    expect(results.every((r) => r.tags.some((t) => t.slug === "pricing"))).toBe(true);
  });

  it("excludes claims with NULL embedding", async () => {
    const src = await createSource({ type: "manual", title: "s" });
    await createClaim({
      statement: "no embedding yet",
      type: "finding",
      sourceId: src.id
    });
    // do not call embedClaim
    const results = await searchClaims("no embedding", { topK: 5 });
    expect(results.find((r) => r.claim.statement === "no embedding yet")).toBeUndefined();
  });
});
