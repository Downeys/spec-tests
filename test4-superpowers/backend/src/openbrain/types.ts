export type SourceType = "web" | "pdf" | "transcript" | "note" | "manual";

export interface Source {
  id: string;
  type: SourceType;
  url: string | null;
  title: string;
  author: string | null;
  publishedAt: Date | null;
  content: string | null;
  contentHash: string | null;
  ingestedAt: Date;
  ingestedBy: string | null;
  metadata: Record<string, unknown> | null;
}

export type SourceMeta = Omit<Source, "content">;

export type ClaimType = "finding" | "hypothesis" | "decision" | "observation" | "estimate";
export type ClaimStatus = "open" | "validated" | "refuted" | "superseded" | "retired";

export interface Claim {
  id: string;
  statement: string;
  type: ClaimType;
  status: ClaimStatus;
  confidence: number | null;
  sourceId: string | null;
  sourceExcerpt: string | null;
  sourceLocator: string | null;
  createdAt: Date;
  createdBy: string | null;
  statusChangedAt: Date | null;
  statusReason: string | null;
  metadata: Record<string, unknown> | null;
}

export type RelationType = "supports" | "contradicts" | "refines" | "supersedes" | "related_to";

export interface Relation {
  id: string;
  fromClaim: string;
  toClaim: string;
  type: RelationType;
  note: string | null;
  createdAt: Date;
  createdBy: string | null;
}

export interface Tag {
  id: string;
  slug: string;
  display: string;
  description: string | null;
  createdAt: Date;
}

export interface ClaimDetail {
  claim: Claim;
  source: SourceMeta | null;
  tags: Tag[];
  outgoing: Relation[];
  incoming: Relation[];
}

export interface ContradictionPair {
  relation: Relation;
  claimA: Claim;
  claimB: Claim;
  sourceA: SourceMeta | null;
  sourceB: SourceMeta | null;
}

export type CompilationTrigger = "cli" | "api" | "cron" | "agent";
export type CompilationStatus = "running" | "success" | "error";

export interface CompilationRun {
  id: string;
  trigger: CompilationTrigger;
  startedAt: Date;
  finishedAt: Date | null;
  status: CompilationStatus;
  pagesWritten: number;
  pagesSkipped: number;
  notes: string | null;
  errorMessage: string | null;
}

// Named errors used by the API and CLI
export class ValidationError extends Error {
  constructor(public readonly field: string, message: string) {
    super(`${field}: ${message}`);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends Error {
  constructor(public readonly entity: string, public readonly id: string) {
    super(`${entity} not found: ${id}`);
    this.name = "NotFoundError";
  }
}

export class DuplicateError extends Error {
  constructor(public readonly entity: string, public readonly key: string) {
    super(`${entity} already exists: ${key}`);
    this.name = "DuplicateError";
  }
}
