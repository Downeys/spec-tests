import { describe, it, expect, vi } from "vitest";
import { getOrientationMap } from "./orientation.js";
import { createSource } from "./sources.js";
import { createClaim, updateClaimStatus } from "./claims.js";
import { addClaimTag } from "./tags.js";
import { getPool } from "../db/pool.js";

describe("getOrientationMap", () => {
  it("returns zero-state on an empty database", async () => {
    const m = await getOrientationMap();
    expect(m.totals).toEqual({
      sources: 0,
      claims: 0,
      openHypotheses: 0,
      unresolvedContradictions: 0
    });
    expect(m.tags).toEqual([]);
    expect(m.recentEvents).toEqual([]);
    expect(m.lastCompilationAt).toBeNull();
  });

  it("counts tags with claim counts and totals", async () => {
    const src = await createSource({ type: "manual", title: "s" });
    const c1 = await createClaim({
      statement: "x",
      type: "hypothesis",
      sourceId: src.id
    });
    const c2 = await createClaim({
      statement: "y",
      type: "finding",
      sourceId: src.id
    });
    await addClaimTag(c1.id, "pricing");
    await addClaimTag(c2.id, "pricing");
    await addClaimTag(c2.id, "smb");

    const m = await getOrientationMap();
    expect(m.totals.sources).toBe(1);
    expect(m.totals.claims).toBe(2);
    expect(m.totals.openHypotheses).toBe(1); // c1 is hypothesis & open

    const pricing = m.tags.find((t) => t.slug === "pricing");
    expect(pricing?.claimCount).toBe(2);
    const smb = m.tags.find((t) => t.slug === "smb");
    expect(smb?.claimCount).toBe(1);
  });

  it("counts unresolved contradictions", async () => {
    const src = await createSource({ type: "manual", title: "s" });
    const a = await createClaim({ statement: "a", type: "finding", sourceId: src.id });
    const b = await createClaim({ statement: "b", type: "finding", sourceId: src.id });
    await getPool().query(
      `INSERT INTO relations (from_claim, to_claim, type) VALUES ($1, $2, 'contradicts')`,
      [a.id, b.id]
    );

    const m = await getOrientationMap();
    expect(m.totals.unresolvedContradictions).toBe(1);

    await updateClaimStatus(a.id, "retired", "");
    const m2 = await getOrientationMap();
    expect(m2.totals.unresolvedContradictions).toBe(0);
  });
});
