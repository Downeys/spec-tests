import { describe, it, expect, vi, beforeEach } from "vitest";
import { embedClaim, embedMissingClaims } from "./pipeline.js";
import { setEmbeddingProvider } from "./index.js";
import { createClaim } from "../openbrain/claims.js";
import { createSource } from "../openbrain/sources.js";
import { getPool } from "../db/pool.js";

const fakeProvider = {
  model: "voyage-3-fake",
  dimensions: 1024,
  embed: async (texts: string[]) =>
    texts.map(() => new Array(1024).fill(0.5))
};

beforeEach(() => {
  setEmbeddingProvider(fakeProvider);
});

describe("embedClaim", () => {
  it("populates embedding, embedded_at, and embedding_model", async () => {
    const src = await createSource({ type: "manual", title: "s" });
    const c = await createClaim({
      statement: "test claim",
      type: "finding",
      sourceId: src.id
    });

    await embedClaim(c.id);

    const r = await getPool().query<{
      embedding: number[] | string | null;
      embedded_at: Date | null;
      embedding_model: string | null;
    }>(
      `SELECT embedding, embedded_at, embedding_model FROM claims WHERE id=$1`,
      [c.id]
    );
    expect(r.rows[0]?.embedded_at).toBeInstanceOf(Date);
    expect(r.rows[0]?.embedding_model).toBe("voyage-3-fake");
    expect(r.rows[0]?.embedding).not.toBeNull();
  });
});

describe("embedMissingClaims", () => {
  it("processes only NULL-embedding rows and returns the count", async () => {
    const src = await createSource({ type: "manual", title: "s" });
    const a = await createClaim({ statement: "a", type: "finding", sourceId: src.id });
    const b = await createClaim({ statement: "b", type: "finding", sourceId: src.id });
    // createClaim now fire-and-forgets embedClaim; wait for those to settle
    // before establishing the baseline state we want to test.
    await new Promise((r) => setTimeout(r, 50));
    // Reset both to NULL so we control exactly which ones are missing
    await getPool().query(
      `UPDATE claims SET embedding=NULL, embedded_at=NULL, embedding_model=NULL WHERE id=ANY($1)`,
      [[a.id, b.id]]
    );
    // Now embed only a — b should be the single missing row
    await embedClaim(a.id);

    const processed = await embedMissingClaims({ batchSize: 16 });
    expect(processed).toBe(1);

    const left = await getPool().query<{ count: string }>(
      `SELECT count(*)::text AS count FROM claims WHERE embedding IS NULL`
    );
    expect(Number(left.rows[0]!.count)).toBe(0);
  });

  it("is idempotent (second run processes 0)", async () => {
    const src = await createSource({ type: "manual", title: "s" });
    await createClaim({ statement: "x", type: "finding", sourceId: src.id });
    await embedMissingClaims({ batchSize: 16 });
    const second = await embedMissingClaims({ batchSize: 16 });
    expect(second).toBe(0);
  });
});
