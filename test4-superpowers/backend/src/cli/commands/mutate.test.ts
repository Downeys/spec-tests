import { describe, it, expect } from "vitest";
import {
  addClaimCmd,
  tagClaimCmd,
  addRelationCmd,
  setClaimStatusCmd
} from "./mutate.js";
import { createSource } from "../../openbrain/sources.js";
import { getClaim } from "../../openbrain/claims.js";
import { getRelations } from "../../openbrain/relations.js";

describe("addClaimCmd", () => {
  it("creates a claim attached to a source", async () => {
    const s = await createSource({ type: "manual", title: "x" });
    const claim = await addClaimCmd({
      statement: "62%",
      type: "finding",
      sourceId: s.id
    });
    expect(claim.statement).toBe("62%");
  });
});

describe("tagClaimCmd", () => {
  it("tags a claim and creates the tag if missing", async () => {
    const s = await createSource({ type: "manual", title: "x" });
    const c = await addClaimCmd({
      statement: "x",
      type: "finding",
      sourceId: s.id
    });
    await tagClaimCmd(c.id, "smb");
    const tagged = await getClaim(c.id);
    expect(tagged).not.toBeNull();
  });
});

describe("addRelationCmd", () => {
  it("creates a relation", async () => {
    const s = await createSource({ type: "manual", title: "x" });
    const a = await addClaimCmd({
      statement: "a",
      type: "finding",
      sourceId: s.id
    });
    const b = await addClaimCmd({
      statement: "b",
      type: "finding",
      sourceId: s.id
    });
    await addRelationCmd(a.id, b.id, "supports", "validates");
    const rels = await getRelations({ fromClaim: a.id });
    expect(rels[0]?.type).toBe("supports");
    expect(rels[0]?.note).toBe("validates");
  });
});

describe("setClaimStatusCmd", () => {
  it("updates claim status with reason", async () => {
    const s = await createSource({ type: "manual", title: "x" });
    const c = await addClaimCmd({
      statement: "x",
      type: "finding",
      sourceId: s.id
    });
    const updated = await setClaimStatusCmd(
      c.id,
      "validated",
      "smoke check"
    );
    expect(updated.status).toBe("validated");
  });
});
