import { describe, it, expect, vi } from "vitest";
import {
  createClaim,
  getClaim,
  getClaims,
  updateClaimStatus,
  getClaimWithProvenance
} from "./claims.js";
import { createSource } from "./sources.js";
import { addClaimTag } from "./tags.js";
import { getPool } from "../db/pool.js";
import { NotFoundError, ValidationError } from "./types.js";
import { setEmbeddingProvider } from "../embeddings/index.js";

async function makeSource(title = "src") {
  return createSource({ type: "manual", title });
}

async function insertRelation(
  fromClaim: string,
  toClaim: string,
  type: string
): Promise<void> {
  await getPool().query(
    `INSERT INTO relations (from_claim, to_claim, type) VALUES ($1, $2, $3)`,
    [fromClaim, toClaim, type]
  );
}

describe("createClaim", () => {
  it("inserts with default status 'open'", async () => {
    const source = await makeSource();
    const claim = await createClaim({
      statement: "62% manage scheduling manually",
      type: "finding",
      sourceId: source.id
    });
    expect(claim.status).toBe("open");
  });

  it("rejects empty statement", async () => {
    await expect(
      createClaim({ statement: "", type: "finding" })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects invalid type", async () => {
    await expect(
      createClaim({ statement: "x", type: "bogus" as never })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("allows null sourceId for user-stated decisions", async () => {
    const claim = await createClaim({
      statement: "we will target SMB restaurants",
      type: "decision"
    });
    expect(claim.sourceId).toBeNull();
  });
});

describe("getClaims (filter)", () => {
  it("filters by status", async () => {
    const source = await makeSource();
    const a = await createClaim({
      statement: "a",
      type: "finding",
      sourceId: source.id
    });
    await createClaim({
      statement: "b",
      type: "hypothesis",
      sourceId: source.id
    });
    await updateClaimStatus(a.id, "validated", "smoke test");

    const validated = await getClaims({ status: "validated" });
    expect(validated.length).toBe(1);
    expect(validated[0]?.statement).toBe("a");
  });

  it("filters by tag slug", async () => {
    const source = await makeSource();
    const c = await createClaim({
      statement: "tagged",
      type: "finding",
      sourceId: source.id
    });
    await createClaim({
      statement: "untagged",
      type: "finding",
      sourceId: source.id
    });
    await addClaimTag(c.id, "smb");
    const tagged = await getClaims({ tag: "smb" });
    expect(tagged.length).toBe(1);
    expect(tagged[0]?.statement).toBe("tagged");
  });
});

describe("updateClaimStatus", () => {
  it("requires non-empty reason for validated/refuted", async () => {
    const source = await makeSource();
    const claim = await createClaim({
      statement: "x",
      type: "finding",
      sourceId: source.id
    });
    await expect(
      updateClaimStatus(claim.id, "validated", "")
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("sets status_reason and status_changed_at", async () => {
    const source = await makeSource();
    const claim = await createClaim({
      statement: "x",
      type: "finding",
      sourceId: source.id
    });
    const updated = await updateClaimStatus(
      claim.id,
      "refuted",
      "newer report supersedes"
    );
    expect(updated.status).toBe("refuted");
    expect(updated.statusReason).toBe("newer report supersedes");
    expect(updated.statusChangedAt).toBeInstanceOf(Date);
  });

  it("requires a 'supersedes' relation when promoting to 'superseded'", async () => {
    const source = await makeSource();
    const a = await createClaim({
      statement: "old",
      type: "finding",
      sourceId: source.id
    });
    await expect(
      updateClaimStatus(a.id, "superseded", "stale")
    ).rejects.toBeInstanceOf(ValidationError);

    const b = await createClaim({
      statement: "new",
      type: "finding",
      sourceId: source.id
    });
    // 'supersedes' edge: from new → to old
    await insertRelation(b.id, a.id, "supersedes");

    const updated = await updateClaimStatus(a.id, "superseded", "stale");
    expect(updated.status).toBe("superseded");
  });

  it("throws NotFoundError for unknown id", async () => {
    await expect(
      updateClaimStatus(
        "00000000-0000-0000-0000-000000000000",
        "validated",
        "x"
      )
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("getClaimWithProvenance", () => {
  it("returns claim, source meta, tags, relations", async () => {
    const source = await makeSource("Square 2026");
    const a = await createClaim({
      statement: "a",
      type: "finding",
      sourceId: source.id
    });
    const b = await createClaim({
      statement: "b",
      type: "finding",
      sourceId: source.id
    });
    await addClaimTag(a.id, "smb");
    await insertRelation(a.id, b.id, "supports");

    const detail = await getClaimWithProvenance(a.id);
    expect(detail.claim.statement).toBe("a");
    expect(detail.source?.title).toBe("Square 2026");
    expect(detail.tags.map((t) => t.slug)).toEqual(["smb"]);
    expect(detail.outgoing.length).toBe(1);
    expect(detail.outgoing[0]?.type).toBe("supports");
  });
});

describe("getClaim", () => {
  it("returns null for unknown id", async () => {
    expect(
      await getClaim("00000000-0000-0000-0000-000000000000")
    ).toBeNull();
  });
});

describe("createClaim — embedding side effect", () => {
  it("kicks off embedding asynchronously without blocking the insert", async () => {
    const calls: string[][] = [];
    setEmbeddingProvider({
      model: "fake",
      dimensions: 1024,
      embed: async (texts: string[]) => {
        calls.push(texts);
        return texts.map(() => new Array(1024).fill(0));
      }
    });

    const src = await makeSource();
    const c = await createClaim({
      statement: "embed me",
      type: "finding",
      sourceId: src.id
    });
    expect(c.id).toBeTruthy();

    // Embedding may not be done synchronously — wait briefly
    await new Promise((r) => setTimeout(r, 50));
    expect(calls.flat()).toContain("embed me");
  });

  it("does not fail when the provider throws", async () => {
    setEmbeddingProvider({
      model: "fake",
      dimensions: 1024,
      embed: async (_texts: string[]) => {
        throw new Error("voyage down");
      }
    });
    const src = await makeSource();
    const c = await createClaim({
      statement: "still inserts",
      type: "finding",
      sourceId: src.id
    });
    expect(c.id).toBeTruthy();
    // embedding stays null; not asserting timing — implementation is fire-and-forget
  });
});
