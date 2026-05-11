// src/compilation/render/topic-page.ts
// The deterministic topic-page renderer (D-13/D-15). NO LLM in Phase 1.
// Stable ULID ordering + canonical hash → success criterion #4 (COMP-07).

import matter from 'gray-matter';
import { hashCanonical } from '@/lib/hash.js';
import { renderClaimBlockWithSources } from './claim-block.js';
import { renderContradictionCallout } from './contradiction.js';
import { buildFrontmatter } from './frontmatter.js';
import type { Claim, Edge, Entity, Source } from '@/onebrain/types.js';

export interface PageContext {
  pageId: string;
  topicSlug: string;
  topicTitle: string;
  generatedAt: Date;
  compileRunId: string;
  claims: Claim[];
  edges: Edge[];
  entities: Entity[];
  sources: Source[];
}

export function renderTopicPage(ctx: PageContext): {
  markdown: string;
  hash: string;
} {
  const grouped = groupByPrimaryTopicTag(ctx.claims);
  for (const claims of grouped.values()) {
    claims.sort((a, b) => a.id.localeCompare(b.id));
  }

  const claimIdSet = new Set(ctx.claims.map((c) => c.id));
  const contradictionEdges = ctx.edges.filter(
    (e) =>
      e.kind === 'contradicts' &&
      e.from_table === 'claims' &&
      e.to_table === 'claims' &&
      claimIdSet.has(e.from_id) &&
      claimIdSet.has(e.to_id),
  );

  const partnerOf = new Map<string, string>();
  const renderedPairs = new Set<string>();
  for (const e of contradictionEdges) {
    partnerOf.set(e.from_id, e.to_id);
    partnerOf.set(e.to_id, e.from_id);
  }

  const citedSourcesOf = new Map<string, string[]>();
  for (const e of ctx.edges) {
    if (
      e.kind === 'cites_source' &&
      e.from_table === 'claims' &&
      e.to_table === 'sources'
    ) {
      const arr = citedSourcesOf.get(e.from_id) ?? [];
      arr.push(e.to_id);
      citedSourcesOf.set(e.from_id, arr);
    }
  }
  for (const [k, v] of citedSourcesOf) citedSourcesOf.set(k, v.sort());

  const sections: string[] = [];
  for (const tag of Array.from(grouped.keys()).sort()) {
    const claims = grouped.get(tag)!;
    sections.push(`## ${tag}`);
    sections.push('');
    for (const claim of claims) {
      const cites = citedSourcesOf.get(claim.id) ?? [];
      sections.push(renderClaimBlockWithSources(claim, cites));

      const partnerId = partnerOf.get(claim.id);
      if (partnerId) {
        const pairKey = [claim.id, partnerId].sort().join(':');
        if (!renderedPairs.has(pairKey) && claim.id < partnerId) {
          const partner = ctx.claims.find((c) => c.id === partnerId);
          if (partner) {
            const partnerCites = citedSourcesOf.get(partner.id) ?? [];
            sections.push(
              renderContradictionCallout(
                claim,
                partner,
                ctx.sources,
                cites,
                partnerCites,
              ),
            );
            renderedPairs.add(pairKey);
          }
        }
      }
    }
  }
  const body = sections.join('\n').trimEnd() + '\n';

  const fm = buildFrontmatter({
    pageId: ctx.pageId,
    kind: 'topic',
    title: ctx.topicTitle,
    slug: `topics/${ctx.topicSlug}`,
    generatedAt: ctx.generatedAt,
    compileRunId: ctx.compileRunId,
    claims: ctx.claims,
    entities: ctx.entities,
    contradictionCount: renderedPairs.size,
  });

  const hash = hashCanonical(fm, body);
  fm.content_hash = hash;

  const markdown = matter.stringify(body, fm);
  return { markdown, hash };
}

function groupByPrimaryTopicTag(claims: Claim[]): Map<string, Claim[]> {
  const grouped = new Map<string, Claim[]>();
  for (const c of claims) {
    const tag = (c.topic_tags ?? []).slice().sort()[0] ?? 'untagged';
    const arr = grouped.get(tag) ?? [];
    arr.push(c);
    grouped.set(tag, arr);
  }
  return grouped;
}
