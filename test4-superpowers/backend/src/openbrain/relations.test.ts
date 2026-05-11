import { describe, it, expect } from "vitest";
import {
  createRelation,
  getRelations,
  getContradictionPairs
} from "./relations.js";
import { createSource } from "./sources.js";
import { createClaim, updateClaimStatus } from "./claims.js";
import { DuplicateError, ValidationError } from "./types.js";

async function makeClaim(label: string): Promise<string> {
  const source = await createSource({ type: "manual", title: `s-${label}` });
  const claim = await createClaim({
    statement: label,
    type: "finding",
    sourceId: source.id
  });
  return claim.id;
}

describe("createRelation", () => {
  it("inserts a relation", async () => {
    const a = await makeClaim("a");
    const b = await makeClaim("b");
    const rel = await createRelation({
      fromClaim: a,
      toClaim: b,
      type: "supports"
    });
    expect(rel.type).toBe("supports");
  });

  it("rejects self-loops", async () => {
    const a = await makeClaim("a");
    await expect(
      createRelation({ fromClaim: a, toClaim: a, type: "supports" })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects invalid type", async () => {
    const a = await makeClaim("a");
    const b = await makeClaim("b");
    await expect(
      createRelation({ fromClaim: a, toClaim: b, type: "foo" as never })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects duplicate edges", async () => {
    const a = await makeClaim("a");
    const b = await makeClaim("b");
    await createRelation({ fromClaim: a, toClaim: b, type: "supports" });
    await expect(
      createRelation({ fromClaim: a, toClaim: b, type: "supports" })
    ).rejects.toBeInstanceOf(DuplicateError);
  });

  it("normalizes contradicts relations so smaller UUID is always from_claim", async () => {
    // Create two claims and pick the larger UUID as the "from" intentionally
    const x = await makeClaim("x");
    const y = await makeClaim("y");
    const [smaller, larger] = x < y ? [x, y] : [y, x];

    const rel = await createRelation({
      fromClaim: larger,
      toClaim: smaller,
      type: "contradicts"
    });
    expect(rel.fromClaim).toBe(smaller);
    expect(rel.toClaim).toBe(larger);
  });

  it("does NOT normalize directional relation types", async () => {
    const x = await makeClaim("x");
    const y = await makeClaim("y");
    const [smaller, larger] = x < y ? [x, y] : [y, x];

    const rel = await createRelation({
      fromClaim: larger,
      toClaim: smaller,
      type: "supports"
    });
    expect(rel.fromClaim).toBe(larger);
    expect(rel.toClaim).toBe(smaller);
  });
});

describe("getRelations", () => {
  it("filters by from-claim", async () => {
    const a = await makeClaim("a");
    const b = await makeClaim("b");
    const c = await makeClaim("c");
    await createRelation({ fromClaim: a, toClaim: b, type: "supports" });
    await createRelation({ fromClaim: a, toClaim: c, type: "refines" });

    const out = await getRelations({ fromClaim: a });
    expect(out.length).toBe(2);
  });

  it("filters by type", async () => {
    const a = await makeClaim("a");
    const b = await makeClaim("b");
    const c = await makeClaim("c");
    await createRelation({ fromClaim: a, toClaim: b, type: "supports" });
    await createRelation({ fromClaim: b, toClaim: c, type: "contradicts" });

    const supports = await getRelations({ type: "supports" });
    expect(supports.length).toBe(1);
  });
});

describe("getContradictionPairs", () => {
  it("returns active contradicting pairs", async () => {
    const a = await makeClaim("a");
    const b = await makeClaim("b");
    await createRelation({ fromClaim: a, toClaim: b, type: "contradicts" });
    const pairs = await getContradictionPairs();
    expect(pairs.length).toBe(1);
    expect(new Set([pairs[0]?.claimA.id, pairs[0]?.claimB.id])).toEqual(
      new Set([a, b])
    );
  });

  it("excludes pairs where either side is retired or superseded", async () => {
    const a = await makeClaim("a");
    const b = await makeClaim("b");
    await createRelation({ fromClaim: a, toClaim: b, type: "contradicts" });
    await updateClaimStatus(a, "retired", "stale");

    const pairs = await getContradictionPairs();
    expect(pairs.length).toBe(0);
  });
});
