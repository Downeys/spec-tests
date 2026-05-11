// src/compilation/render/frontmatter.ts
// Build the YAML frontmatter for a topic page per D-15.
// content_hash is filled with 'PLACEHOLDER' here; topic-page.ts substitutes the real hash after computing it.

import type { Claim, Entity, ClaimStatus } from '@/onebrain/types.js';

const STALE_DAYS = 90;

export interface BuildFrontmatterInput {
  pageId: string;
  kind: 'topic' | 'framework' | 'entity' | 'decision' | 'source' | 'index' | 'log';
  title: string;
  slug: string;
  generatedAt: Date;
  compileRunId: string;
  claims: Claim[];
  entities: Entity[];
  contradictionCount: number;
}

export function buildFrontmatter(
  input: BuildFrontmatterInput,
): Record<string, unknown> {
  const claimIds = input.claims.map((c) => c.id).sort();
  const entityIds = input.entities.map((e) => e.id).sort();
  const topicTags = uniqSort(input.claims.flatMap((c) => c.topic_tags ?? []));
  const frameworkTags = uniqSort(input.claims.flatMap((c) => c.framework_tags ?? []));
  const confidences = input.claims.map((c) => Number(c.confidence));
  const lastEvidenceAt =
    input.claims.length > 0
      ? new Date(
          Math.max(...input.claims.map((c) => new Date(c.updated_at).getTime())),
        )
      : input.generatedAt;
  const ageDays =
    (input.generatedAt.getTime() - lastEvidenceAt.getTime()) / 86400000;
  const statusBreakdown = countBy(input.claims, (c) => c.status as ClaimStatus);

  return {
    id: input.pageId,
    kind: input.kind,
    title: input.title,
    slug: input.slug,
    generated_at: input.generatedAt.toISOString(), // EXCLUDED FROM HASH (D-18)
    generated_by: 'compilation-agent', // D-15 forward-compat
    compile_run_id: input.compileRunId, // EXCLUDED FROM HASH (D-18)
    content_hash: 'PLACEHOLDER', // EXCLUDED FROM HASH (substituted later)
    claim_ids: claimIds,
    entity_ids: entityIds,
    topic_tags: topicTags,
    framework_tags: frameworkTags,
    confidence_avg: confidences.length
      ? round(confidences.reduce((a, b) => a + b, 0) / confidences.length, 2)
      : 0,
    confidence_min: confidences.length ? Math.min(...confidences) : 0,
    contradictions: input.contradictionCount,
    last_evidence_at: lastEvidenceAt.toISOString(),
    stale: ageDays > STALE_DAYS, // CRIT-04 staleness flag
    status_breakdown: statusBreakdown,
  };
}

function uniqSort(arr: string[]): string[] {
  return Array.from(new Set(arr)).sort();
}
function countBy<T, K extends string>(arr: T[], fn: (x: T) => K): Record<K, number> {
  const out = {} as Record<K, number>;
  for (const x of arr) {
    const k = fn(x);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}
function round(n: number, d: number): number {
  return Math.round(n * 10 ** d) / 10 ** d;
}
