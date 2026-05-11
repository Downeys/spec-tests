import { describe, it, expect } from "vitest";
import { showSource, showClaim } from "./show.js";
import { createSource } from "../../openbrain/sources.js";
import { createClaim } from "../../openbrain/claims.js";
import { addClaimTag } from "../../openbrain/tags.js";
import { NotFoundError } from "../../openbrain/types.js";

describe("showSource", () => {
  it("returns full source content for an id", async () => {
    const s = await createSource({
      type: "manual",
      title: "x",
      content: "the body"
    });
    const out = await showSource(s.id);
    expect(out).toContain("Title: x");
    expect(out).toContain("the body");
  });

  it("throws NotFoundError for unknown id", async () => {
    await expect(showSource("00000000-0000-0000-0000-000000000000"))
      .rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("showClaim", () => {
  it("returns claim with provenance", async () => {
    const s = await createSource({ type: "manual", title: "src" });
    const c = await createClaim({
      statement: "x",
      type: "finding",
      sourceId: s.id
    });
    await addClaimTag(c.id, "alpha");
    const out = await showClaim(c.id);
    expect(out).toContain("Statement: x");
    expect(out).toContain("Source: src");
    expect(out).toContain("Tags: alpha");
  });
});
