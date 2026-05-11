import type { ClaimStatus } from "../../openbrain/types.js";
import { shortId } from "./shortId.js";

export function claimAnchor(claimId: string): string {
  return `^claim-${shortId(claimId)}`;
}

export function sourceAnchor(sourceId: string): string {
  return `^src-${shortId(sourceId)}`;
}

function escapePipes(s: string): string {
  return s.replace(/\|/g, "\\|");
}

export function sourceLink(sourceId: string, title: string): string {
  return `[[sources#${sourceAnchor(sourceId)}|${escapePipes(title)}]]`;
}

export function conceptLink(slug: string, display: string): string {
  return `[[concepts/${slug}|${escapePipes(display)}]]`;
}

export interface RenderClaimQuoteInput {
  claimId: string;
  statement: string;
  sourceId: string | null;
  sourceTitle: string | null;
  status?: ClaimStatus;
}

export function renderClaimQuote(input: RenderClaimQuoteInput): string {
  const citation =
    input.sourceId && input.sourceTitle
      ? sourceLink(input.sourceId, input.sourceTitle)
      : "*(user statement)*";
  const wrapped =
    input.status === "refuted"
      ? `~~"${input.statement}"~~`
      : `"${input.statement}"`;
  return `- ${wrapped} ${citation} ${claimAnchor(input.claimId)}`;
}
