import { createClaim } from "../../openbrain/claims.js";
import { addClaimTag, getTagsForClaim } from "../../openbrain/tags.js";
import { createRelation } from "../../openbrain/relations.js";
import { runCompilation } from "../../compilation/runCompilation.js";
import { getPool } from "../../db/pool.js";
import { env } from "../../db/env.js";
import type { ToolHandler } from "./readers.js";
import type { ClaimType, RelationType } from "../../openbrain/types.js";

const VALID_AGENT_RELATION_TYPES = new Set<RelationType>([
  "supports",
  "contradicts",
  "refines",
  "related_to"
]);

export const WRITER_HANDLERS: Record<string, ToolHandler> = {
  async addClaim(args) {
    const statement = String(args["statement"] ?? "");
    const type = (args["type"] ?? "observation") as ClaimType;
    const sourceId = (args["sourceId"] as string | null) ?? null;
    const sourceExcerpt = (args["sourceExcerpt"] as string | null) ?? null;
    const sourceLocator = (args["sourceLocator"] as string | null) ?? null;
    const tagSlugs = Array.isArray(args["tags"]) ? (args["tags"] as string[]) : [];

    const claim = await createClaim({
      statement,
      type,
      sourceId,
      sourceExcerpt,
      sourceLocator,
      createdBy: "agent"
    });
    const tags: { slug: string }[] = [];
    for (const slug of tagSlugs) {
      await addClaimTagWithChatMarker(claim.id, slug, slug);
      tags.push({ slug });
    }
    return { claim, tags };
  },

  async tagClaim(args) {
    const claimId = String(args["claimId"] ?? "");
    const tagSlug = String(args["tagSlug"] ?? "");
    const displayHint = (args["displayHint"] as string) ?? tagSlug;
    const result = await addClaimTagWithChatMarker(claimId, tagSlug, displayHint);
    const tags = await getTagsForClaim(claimId);
    return { tag: result, tags };
  },

  async addRelation(args) {
    const type = String(args["type"]) as RelationType;
    if (!VALID_AGENT_RELATION_TYPES.has(type)) {
      throw new Error(
        `Relation type '${type}' is not callable from chat (use status promotion via CLI for 'supersedes').`
      );
    }
    const relation = await createRelation({
      fromClaim: String(args["fromClaim"]),
      toClaim: String(args["toClaim"]),
      type,
      note: (args["note"] as string | null) ?? null,
      createdBy: "agent"
    });
    return { relation };
  },

  async triggerCompilation() {
    const start = Date.now();
    const result = await runCompilation({
      pool: getPool(),
      vaultPath: env.vaultPath,
      trigger: "agent"
    });
    return {
      runId: result.run.id,
      status: result.run.status,
      pagesWritten: result.written.length,
      pagesSkipped: result.skipped.length,
      durationMs: Date.now() - start
    };
  }
};

async function addClaimTagWithChatMarker(
  claimId: string,
  slug: string,
  display: string
): Promise<{ slug: string; created: boolean }> {
  const pool = getPool();
  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM tags WHERE slug=$1`,
    [slug]
  );
  let created = false;
  if (existing.rows.length === 0) {
    await pool.query(
      `INSERT INTO tags (slug, display, metadata)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (slug) DO NOTHING`,
      [slug, display, JSON.stringify({ created_in_chat: true })]
    );
    created = true;
  }
  await addClaimTag(claimId, slug);
  return { slug, created };
}
