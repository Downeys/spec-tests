import type { Compiler, CompilationContext, RenderedPage } from "../types.js";
import {
  type Claim,
  type ClaimStatus,
  type Relation,
  type Tag
} from "../../openbrain/types.js";
import { listTags, getTagsForClaim } from "../../openbrain/tags.js";
import { getClaims } from "../../openbrain/claims.js";
import { getRelations } from "../../openbrain/relations.js";
import { getSourceMeta } from "../../openbrain/sources.js";
import { serializeFrontmatter } from "../render/frontmatter.js";
import {
  claimAnchor,
  renderClaimQuote
} from "../render/citation.js";

const STATUS_HEADINGS: Record<ClaimStatus, string> = {
  validated: "## Validated findings",
  open: "## Open hypotheses",
  refuted: "## Refuted",
  superseded: "## Superseded",
  retired: ""
};

const STATUS_ORDER: ClaimStatus[] = [
  "validated",
  "open",
  "refuted",
  "superseded"
];

async function renderRelationHint(rel: Relation): Promise<string> {
  // Render relation type + target claim short-id. If the target claim has at
  // least one tag, emit a wiki-link to the first concept page (sorted by slug
  // ASC) with a deep-link to the claim's block anchor. If the target has zero
  // tags, fall back to plain text (no concept page exists to link to).
  const verb = rel.type.replace("_", " ");
  const Verb = (verb[0]?.toUpperCase() ?? "") + verb.slice(1);
  const targetTags = await getTagsForClaim(rel.toClaim);
  const targetSlug = targetTags[0]?.slug;
  const anchor = claimAnchor(rel.toClaim);
  if (targetSlug) {
    return `  - ${Verb}: [[concepts/${targetSlug}#${anchor}|claim ${anchor.slice(1)}]]`;
  }
  return `  - ${Verb}: claim ${anchor.slice(1)}`;
}

async function renderClaimWithRelations(
  claim: Claim
): Promise<string> {
  const source = claim.sourceId ? await getSourceMeta(claim.sourceId) : null;
  const lines: string[] = [];
  lines.push(
    renderClaimQuote({
      claimId: claim.id,
      statement: claim.statement,
      sourceId: claim.sourceId,
      sourceTitle: source?.title ?? null,
      status: claim.status
    })
  );
  const outgoing = await getRelations({ fromClaim: claim.id });
  for (const rel of outgoing) {
    lines.push(await renderRelationHint(rel));
  }
  return lines.join("\n");
}

async function renderConceptPage(
  ctx: CompilationContext,
  tag: Tag
): Promise<RenderedPage> {
  const allClaims = await getClaims({ tag: tag.slug });
  const active = allClaims.filter((c) => c.status !== "retired");

  const counts: Record<ClaimStatus, number> = {
    open: 0,
    validated: 0,
    refuted: 0,
    superseded: 0,
    retired: 0
  };
  for (const c of active) counts[c.status]++;

  const frontmatter = serializeFrontmatter({
    type: "concept",
    slug: tag.slug,
    display: tag.display,
    generated_at: ctx.generatedAt.toISOString(),
    compilation_run: ctx.runId,
    claim_count: active.length,
    status_summary: {
      open: counts.open,
      validated: counts.validated,
      refuted: counts.refuted,
      superseded: counts.superseded
    }
  });

  const sections: string[] = [];
  sections.push(`# ${tag.display}`);

  if (active.length === 0) {
    sections.push("");
    sections.push("_No active claims tagged with this concept._");
  } else {
    for (const status of STATUS_ORDER) {
      const inStatus = active.filter((c) => c.status === status);
      if (inStatus.length === 0) continue;
      sections.push("");
      sections.push(STATUS_HEADINGS[status]);
      for (const claim of inStatus) {
        sections.push(await renderClaimWithRelations(claim));
      }
    }
  }

  const body = sections.join("\n") + "\n";
  return {
    path: `concepts/${tag.slug}.md`,
    content: frontmatter + "\n" + body
  };
}

export const conceptsCompiler: Compiler = {
  name: "concepts",
  async render(ctx) {
    const tags = await listTags();
    const pages: RenderedPage[] = [];
    for (const tag of tags) {
      pages.push(await renderConceptPage(ctx, tag));
    }
    return pages;
  }
};

export { renderConceptPage };
