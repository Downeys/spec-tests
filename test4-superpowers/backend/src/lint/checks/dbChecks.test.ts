import { describe, it, expect } from "vitest";
import { orphanClaims } from "./orphanClaims.js";
import { sourcesWithNoClaims } from "./sourcesWithNoClaims.js";
import { tagsWithZeroActiveClaims } from "./tagsWithZeroActiveClaims.js";
import { agingContradictions } from "./agingContradictions.js";
import { createSource } from "../../openbrain/sources.js";
import { createClaim, updateClaimStatus } from "../../openbrain/claims.js";
import { createRelation } from "../../openbrain/relations.js";
import { addClaimTag, findOrCreateTag } from "../../openbrain/tags.js";
import { getPool } from "../../db/pool.js";

const input = { vaultPath: "/tmp/unused" };

describe("orphanClaims", () => {
  it("flags claims with no source AND no tag AND no relations", async () => {
    await createClaim({
      statement: "lonely",
      type: "observation"
    });
    const findings = await orphanClaims.run(input);
    expect(findings.length).toBe(1);
    expect(findings[0]?.severity).toBe("warn");
  });

  it("does not flag claims with a source", async () => {
    const s = await createSource({ type: "manual", title: "x" });
    await createClaim({
      statement: "x",
      type: "finding",
      sourceId: s.id
    });
    const findings = await orphanClaims.run(input);
    expect(findings.length).toBe(0);
  });
});

describe("sourcesWithNoClaims", () => {
  it("info-flags a source that has no claims", async () => {
    await createSource({ type: "manual", title: "unused" });
    const findings = await sourcesWithNoClaims.run(input);
    expect(findings.length).toBe(1);
    expect(findings[0]?.severity).toBe("info");
  });
});

describe("tagsWithZeroActiveClaims", () => {
  it("info-flags tags that have no active claims", async () => {
    await findOrCreateTag("empty", "Empty");
    const findings = await tagsWithZeroActiveClaims.run(input);
    expect(findings.length).toBe(1);
  });

  it("does not flag tags with active claims", async () => {
    const s = await createSource({ type: "manual", title: "x" });
    const c = await createClaim({
      statement: "x",
      type: "finding",
      sourceId: s.id
    });
    await addClaimTag(c.id, "active");
    const findings = await tagsWithZeroActiveClaims.run(input);
    expect(findings.find((f) => f.subject === "active")).toBeUndefined();
  });
});

describe("agingContradictions", () => {
  it("info-flags contradicts relations older than 14 days where both claims still open", async () => {
    const s = await createSource({ type: "manual", title: "x" });
    const a = await createClaim({
      statement: "a",
      type: "finding",
      sourceId: s.id
    });
    const b = await createClaim({
      statement: "b",
      type: "finding",
      sourceId: s.id
    });
    await createRelation({
      fromClaim: a.id,
      toClaim: b.id,
      type: "contradicts"
    });
    // Backdate the relation
    await getPool().query(
      `UPDATE relations SET created_at = now() - interval '20 days'`
    );

    const findings = await agingContradictions.run(input);
    expect(findings.length).toBe(1);
    expect(findings[0]?.severity).toBe("info");
  });

  it("does not flag if either claim is no longer open", async () => {
    const s = await createSource({ type: "manual", title: "x" });
    const a = await createClaim({
      statement: "a",
      type: "finding",
      sourceId: s.id
    });
    const b = await createClaim({
      statement: "b",
      type: "finding",
      sourceId: s.id
    });
    await createRelation({
      fromClaim: a.id,
      toClaim: b.id,
      type: "contradicts"
    });
    await getPool().query(
      `UPDATE relations SET created_at = now() - interval '20 days'`
    );
    await updateClaimStatus(a.id, "validated", "fine");

    const findings = await agingContradictions.run(input);
    expect(findings.length).toBe(0);
  });
});
