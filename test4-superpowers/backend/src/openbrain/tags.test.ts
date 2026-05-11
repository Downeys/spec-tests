import { describe, it, expect } from "vitest";
import {
  findOrCreateTag,
  getTagBySlug,
  listTags,
  addClaimTag,
  getTagsForClaim
} from "./tags.js";
import { createSource } from "./sources.js";
import { getPool } from "../db/pool.js";
import { ValidationError } from "./types.js";

async function makeClaim(): Promise<string> {
  const source = await createSource({ type: "manual", title: "x" });
  const result = await getPool().query<{ id: string }>(
    `INSERT INTO claims (statement, type, source_id) VALUES ($1, $2, $3) RETURNING id`,
    ["the sky is blue", "finding", source.id]
  );
  return result.rows[0]!.id;
}

describe("findOrCreateTag", () => {
  it("creates a new tag", async () => {
    const tag = await findOrCreateTag("smb-restaurants", "SMB Restaurants");
    expect(tag.slug).toBe("smb-restaurants");
    expect(tag.display).toBe("SMB Restaurants");
  });

  it("returns existing tag when slug already exists", async () => {
    const a = await findOrCreateTag("pricing", "Pricing");
    const b = await findOrCreateTag("pricing", "different display");
    expect(b.id).toBe(a.id);
    expect(b.display).toBe("Pricing"); // first write wins
  });

  it("rejects empty slug", async () => {
    await expect(findOrCreateTag("", "x")).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects slugs with whitespace or capitals", async () => {
    await expect(findOrCreateTag("Bad Slug", "x")).rejects.toBeInstanceOf(
      ValidationError
    );
    await expect(findOrCreateTag("Bad", "x")).rejects.toBeInstanceOf(
      ValidationError
    );
  });
});

describe("addClaimTag / getTagsForClaim", () => {
  it("tags a claim", async () => {
    const claimId = await makeClaim();
    await addClaimTag(claimId, "smb-restaurants");
    const tags = await getTagsForClaim(claimId);
    expect(tags.map((t) => t.slug)).toEqual(["smb-restaurants"]);
  });

  it("is idempotent on repeat", async () => {
    const claimId = await makeClaim();
    await addClaimTag(claimId, "pricing");
    await addClaimTag(claimId, "pricing");
    const tags = await getTagsForClaim(claimId);
    expect(tags.length).toBe(1);
  });

  it("auto-creates tag from slug, using slug as display fallback", async () => {
    const claimId = await makeClaim();
    await addClaimTag(claimId, "auto-created");
    const tag = await getTagBySlug("auto-created");
    expect(tag?.display).toBe("auto-created");
  });
});

describe("listTags", () => {
  it("returns tags ordered by slug", async () => {
    await findOrCreateTag("z", "Z");
    await findOrCreateTag("a", "A");
    const tags = await listTags();
    expect(tags.map((t) => t.slug)).toEqual(["a", "z"]);
  });
});
