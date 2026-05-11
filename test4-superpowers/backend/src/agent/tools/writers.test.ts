import { describe, it, expect, beforeEach } from "vitest";

import { WRITER_HANDLERS } from "./writers.js";
import { setEmbeddingProvider } from "../../embeddings/index.js";
import { getPool } from "../../db/pool.js";
import { createSource } from "../../openbrain/sources.js";
import { createClaim } from "../../openbrain/claims.js";

const provider = {
  model: "fake",
  dimensions: 1024,
  embed: async (texts: string[]) => texts.map(() => new Array(1024).fill(0))
};

beforeEach(() => {
  setEmbeddingProvider(provider);
});

describe("WRITER_HANDLERS.addClaim", () => {
  it("creates a claim with created_by='agent'", async () => {
    const result = (await WRITER_HANDLERS.addClaim({
      statement: "we decided to focus on SMB",
      type: "decision"
    })) as { claim: { id: string; createdBy: string | null } };
    expect(result.claim.createdBy).toBe("agent");
  });

  it("attaches tags inline if provided", async () => {
    const r = (await WRITER_HANDLERS.addClaim({
      statement: "a finding",
      type: "finding",
      tags: ["pricing", "smb"]
    })) as { claim: { id: string }; tags: { slug: string }[] };
    expect(r.tags.map((t) => t.slug).sort()).toEqual(["pricing", "smb"]);
  });
});

describe("WRITER_HANDLERS.tagClaim", () => {
  it("creates a missing tag with created_in_chat=true and attaches it", async () => {
    const src = await createSource({ type: "manual", title: "s" });
    const c = await createClaim({
      statement: "x",
      type: "finding",
      sourceId: src.id
    });
    await WRITER_HANDLERS.tagClaim({ claimId: c.id, tagSlug: "fresh-tag" });

    const r = await getPool().query<{ metadata: Record<string, unknown> | null }>(
      `SELECT metadata FROM tags WHERE slug='fresh-tag'`
    );
    expect(r.rows[0]?.metadata).toMatchObject({ created_in_chat: true });
  });

  it("is idempotent on second invocation", async () => {
    const src = await createSource({ type: "manual", title: "s" });
    const c = await createClaim({
      statement: "x",
      type: "finding",
      sourceId: src.id
    });
    await WRITER_HANDLERS.tagClaim({ claimId: c.id, tagSlug: "x" });
    await expect(
      WRITER_HANDLERS.tagClaim({ claimId: c.id, tagSlug: "x" })
    ).resolves.toBeDefined();
  });
});

describe("WRITER_HANDLERS.addRelation", () => {
  it("rejects type='supersedes' (not callable from chat)", async () => {
    const src = await createSource({ type: "manual", title: "s" });
    const a = await createClaim({ statement: "a", type: "finding", sourceId: src.id });
    const b = await createClaim({ statement: "b", type: "finding", sourceId: src.id });
    await expect(
      WRITER_HANDLERS.addRelation({
        fromClaim: a.id,
        toClaim: b.id,
        type: "supersedes"
      })
    ).rejects.toThrow();
  });

  it("creates a 'contradicts' relation", async () => {
    const src = await createSource({ type: "manual", title: "s" });
    const a = await createClaim({ statement: "a", type: "finding", sourceId: src.id });
    const b = await createClaim({ statement: "b", type: "finding", sourceId: src.id });
    const r = (await WRITER_HANDLERS.addRelation({
      fromClaim: a.id,
      toClaim: b.id,
      type: "contradicts",
      note: "directly opposed"
    })) as { relation: { type: string } };
    expect(r.relation.type).toBe("contradicts");
  });
});
