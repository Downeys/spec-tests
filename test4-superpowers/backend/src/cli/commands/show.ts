import {
  getSource,
  getSourceByHash
} from "../../openbrain/sources.js";
import { getClaimWithProvenance } from "../../openbrain/claims.js";
import { NotFoundError } from "../../openbrain/types.js";

export async function showSource(idOrHash: string): Promise<string> {
  const source =
    (await getSource(idOrHash)) ?? (await getSourceByHash(idOrHash));
  if (!source) throw new NotFoundError("source", idOrHash);
  const lines = [
    `ID: ${source.id}`,
    `Title: ${source.title}`,
    `Type: ${source.type}`,
    `URL: ${source.url ?? "(none)"}`,
    `Author: ${source.author ?? "(none)"}`,
    `Published: ${source.publishedAt?.toISOString() ?? "(none)"}`,
    `Ingested: ${source.ingestedAt.toISOString()}`,
    `Hash: ${source.contentHash ?? "(none)"}`,
    "",
    "--- content ---",
    source.content ?? "(no content stored)"
  ];
  return lines.join("\n");
}

export async function showClaim(id: string): Promise<string> {
  const detail = await getClaimWithProvenance(id);
  const tagSlugs = detail.tags.map((t) => t.slug).join(", ") || "(none)";
  const out = detail.outgoing
    .map((r) => `  -[${r.type}]-> ${r.toClaim.slice(0, 8)}`)
    .join("\n");
  const inb = detail.incoming
    .map((r) => `  ${r.fromClaim.slice(0, 8)} -[${r.type}]->`)
    .join("\n");
  return [
    `ID: ${detail.claim.id}`,
    `Statement: ${detail.claim.statement}`,
    `Type: ${detail.claim.type}`,
    `Status: ${detail.claim.status}${detail.claim.statusReason ? ` (${detail.claim.statusReason})` : ""}`,
    `Confidence: ${detail.claim.confidence ?? "(none)"}`,
    `Source: ${detail.source?.title ?? "(none)"}`,
    `Source excerpt: ${detail.claim.sourceExcerpt ?? "(none)"}`,
    `Source locator: ${detail.claim.sourceLocator ?? "(none)"}`,
    `Tags: ${tagSlugs}`,
    `Created: ${detail.claim.createdAt.toISOString()}`,
    "",
    "Outgoing relations:",
    out || "  (none)",
    "",
    "Incoming relations:",
    inb || "  (none)"
  ].join("\n");
}
