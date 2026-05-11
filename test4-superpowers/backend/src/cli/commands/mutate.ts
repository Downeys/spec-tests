import {
  createClaim,
  updateClaimStatus
} from "../../openbrain/claims.js";
import { addClaimTag } from "../../openbrain/tags.js";
import { createRelation } from "../../openbrain/relations.js";
import {
  type Claim,
  type ClaimStatus,
  type ClaimType,
  type Relation,
  type RelationType
} from "../../openbrain/types.js";

export interface AddClaimInput {
  statement: string;
  type: ClaimType;
  sourceId?: string | null;
  sourceExcerpt?: string;
  sourceLocator?: string;
  confidence?: number;
}

export async function addClaimCmd(input: AddClaimInput): Promise<Claim> {
  return createClaim({
    statement: input.statement,
    type: input.type,
    sourceId: input.sourceId ?? null,
    sourceExcerpt: input.sourceExcerpt ?? null,
    sourceLocator: input.sourceLocator ?? null,
    confidence: input.confidence ?? null,
    createdBy: "cli"
  });
}

export async function tagClaimCmd(
  claimId: string,
  tagSlug: string
): Promise<void> {
  await addClaimTag(claimId, tagSlug);
}

export async function addRelationCmd(
  fromClaim: string,
  toClaim: string,
  type: RelationType,
  note?: string
): Promise<Relation> {
  return createRelation({
    fromClaim,
    toClaim,
    type,
    note: note ?? null,
    createdBy: "cli"
  });
}

export async function setClaimStatusCmd(
  id: string,
  status: ClaimStatus,
  reason: string
): Promise<Claim> {
  return updateClaimStatus(id, status, reason);
}
