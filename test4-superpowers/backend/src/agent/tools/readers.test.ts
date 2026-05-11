import { describe, it, expect, beforeEach, vi } from "vitest";
import { READER_HANDLERS } from "./readers.js";
import { setEmbeddingProvider } from "../../embeddings/index.js";
import { embedClaim } from "../../embeddings/pipeline.js";
import { createSource } from "../../openbrain/sources.js";
import { createClaim } from "../../openbrain/claims.js";
import { findOrCreateTag, addClaimTag } from "../../openbrain/tags.js";
import { env } from "../../db/env.js";
import fs from "fs/promises";
import path from "path";

const provider = {
  model: "fake",
  dimensions: 1024,
  embed: async (texts: string[]) =>
    texts.map(() => new Array(1024).fill(0.1))
};

beforeEach(() => {
  setEmbeddingProvider(provider);
});

describe("READER_HANDLERS", () => {
  it("searchClaims returns ranked results", async () => {
    const src = await createSource({ type: "manual", title: "s" });
    const c = await createClaim({
      statement: "pricing pain",
      type: "finding",
      sourceId: src.id
    });
    await embedClaim(c.id);

    const out = await READER_HANDLERS.searchClaims({ query: "pricing", topK: 3 });
    expect(Array.isArray(out)).toBe(true);
    expect((out as { claim: { id: string } }[])[0]?.claim.id).toBe(c.id);
  });

  it("listTags returns tag slugs with claim counts", async () => {
    await findOrCreateTag("smb", "SMB");
    const src = await createSource({ type: "manual", title: "s" });
    const c = await createClaim({ statement: "x", type: "finding", sourceId: src.id });
    await addClaimTag(c.id, "smb");

    const tags = (await READER_HANDLERS.listTags({})) as {
      slug: string;
      claimCount: number;
    }[];
    const smb = tags.find((t) => t.slug === "smb");
    expect(smb?.claimCount).toBe(1);
  });

  it("getConcept reads the vault file when present", async () => {
    const conceptsDir = path.resolve(env.vaultPath, "concepts");
    await fs.mkdir(conceptsDir, { recursive: true });
    const file = path.join(conceptsDir, "test-concept.md");
    await fs.writeFile(file, "# Test concept\n\nbody", "utf-8");

    const out = (await READER_HANDLERS.getConcept({
      slug: "test-concept"
    })) as { found: boolean; content: string };
    expect(out.found).toBe(true);
    expect(out.content).toContain("Test concept");

    await fs.unlink(file);
  });

  it("getConcept reports not-found cleanly", async () => {
    const out = (await READER_HANDLERS.getConcept({
      slug: "nope-no-such-slug"
    })) as { found: boolean; message?: string };
    expect(out.found).toBe(false);
    expect(out.message).toContain("run");
  });

  it("getConcept rejects path traversal attempts", async () => {
    const cases = [
      "../../../etc/passwd",
      "../../.env",
      "concepts/../sources",
      "..",
      "/absolute/path",
      "with spaces",
      "UPPER",
      ""
    ];
    for (const slug of cases) {
      const out = (await READER_HANDLERS.getConcept({ slug })) as {
        found: boolean;
        message?: string;
      };
      expect(out.found, `slug=${slug}`).toBe(false);
      expect(out.message ?? "", `slug=${slug}`).toMatch(/Invalid slug/);
    }
  });
});
