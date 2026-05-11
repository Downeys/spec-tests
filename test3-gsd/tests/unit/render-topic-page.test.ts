import { describe, it, expect } from 'vitest';
import { renderTopicPage, type PageContext } from '@/compilation/render/topic-page';
import type { Claim, Edge } from '@/onebrain/types';
import matter from 'gray-matter';

function mkClaim(id: string, text: string, over: Partial<Claim> = {}): Claim {
  return {
    id,
    kind: 'fact',
    status: 'hypothesis',
    confidence: 0.7,
    text,
    rationale: null,
    topic_tags: ['pricing'],
    framework_tags: [],
    business_plan_id: 'default-plan',
    created_by: 'test',
    created_at: new Date('2026-04-25'),
    updated_at: new Date('2026-04-25'),
    superseded_by: null,
    embedding: [],
    embedding_model: 'voyage-3.5-1024',
    supporting_count: 0,
    contradicting_count: 0,
    ...over,
  };
}

function mkCtx(over: Partial<PageContext> = {}): PageContext {
  return {
    pageId: '01J9XPAGE0000000000000000FF',
    topicSlug: 'pricing',
    topicTitle: 'Pricing',
    generatedAt: new Date('2026-04-25T12:00:00Z'),
    compileRunId: '01J9XRUN00000000000000000F',
    claims: [mkClaim('01J9XCLAIM0000000000000001', 'Claim 1')],
    edges: [],
    entities: [],
    sources: [],
    ...over,
  };
}

describe('renderTopicPage (COMP-05, D-15, D-18)', () => {
  it('determinism: identical input produces identical hash AND identical markdown body', () => {
    const r1 = renderTopicPage(mkCtx());
    const r2 = renderTopicPage(mkCtx());
    expect(r1.hash).toBe(r2.hash);
    expect(r1.markdown).toBe(r2.markdown);
  });

  it('hash invariant under generatedAt change (COMP-07, D-18)', () => {
    const r1 = renderTopicPage(
      mkCtx({ generatedAt: new Date('2026-01-01T00:00:00Z') }),
    );
    const r2 = renderTopicPage(
      mkCtx({ generatedAt: new Date('2027-12-31T23:59:59Z') }),
    );
    expect(r1.hash).toBe(r2.hash);
  });

  it('hash invariant under compileRunId change (COMP-07, D-18)', () => {
    const r1 = renderTopicPage(
      mkCtx({ compileRunId: '01J9XRUN00000000000000000A' }),
    );
    const r2 = renderTopicPage(
      mkCtx({ compileRunId: '01J9XRUN00000000000000000B' }),
    );
    expect(r1.hash).toBe(r2.hash);
  });

  it('hash changes when claims change', () => {
    const r1 = renderTopicPage(mkCtx());
    const r2 = renderTopicPage(
      mkCtx({
        claims: [mkClaim('01J9XCLAIM0000000000000001', 'Different text')],
      }),
    );
    expect(r1.hash).not.toBe(r2.hash);
  });

  it('claims rendered in stable ULID order (D-18)', () => {
    const ctx = mkCtx({
      claims: [
        mkClaim('01J9XCLAIM00000000000000ZZ', 'Z claim'),
        mkClaim('01J9XCLAIM00000000000000AA', 'A claim'),
      ],
    });
    const { markdown } = renderTopicPage(ctx);
    const aIdx = markdown.indexOf('A claim');
    const zIdx = markdown.indexOf('Z claim');
    expect(aIdx).toBeGreaterThan(0);
    expect(aIdx).toBeLessThan(zIdx);
  });

  it('confidence shown on every claim (CRIT-04)', () => {
    const ctx = mkCtx({
      claims: [
        mkClaim('01J9XCLAIM0000000000000001', 'Claim 1', { confidence: 0.42 }),
      ],
    });
    const { markdown } = renderTopicPage(ctx);
    expect(markdown).toContain('confidence=0.42');
  });

  it('frontmatter has confidence_avg + confidence_min + stale (CRIT-04)', () => {
    const ctx = mkCtx({
      claims: [
        mkClaim('01J9XCLAIM0000000000000001', 'C1', { confidence: 0.4 }),
        mkClaim('01J9XCLAIM0000000000000002', 'C2', { confidence: 0.8 }),
      ],
    });
    const { markdown } = renderTopicPage(ctx);
    const fm = matter(markdown).data;
    expect(fm.confidence_avg).toBe(0.6);
    expect(fm.confidence_min).toBe(0.4);
    expect(fm).toHaveProperty('stale');
  });

  it('contradiction edge produces inline callout (CRIT-05, COMP-09)', () => {
    const a = mkClaim('01J9XCLAIM0000000000000001', 'Pricing should be $99.');
    const b = mkClaim('01J9XCLAIM0000000000000002', 'Pricing should be $49.');
    const edges: Edge[] = [
      {
        id: '01J9XEDGE0000000000000001',
        kind: 'contradicts',
        from_id: a.id,
        from_table: 'claims',
        to_id: b.id,
        to_table: 'claims',
        weight: 1.0,
        metadata: {},
        created_at: new Date(),
      },
    ];
    const { markdown } = renderTopicPage(mkCtx({ claims: [a, b], edges }));
    expect(markdown).toContain('> [!warning] Contradiction');
    expect(markdown).toContain('[[claim:01J9XCLAIM0000000000000001]]');
    expect(markdown).toContain('[[claim:01J9XCLAIM0000000000000002]]');
  });

  it('contradiction callout rendered EXACTLY ONCE per pair (not duplicated)', () => {
    const a = mkClaim('01J9XCLAIM0000000000000001', 'A');
    const b = mkClaim('01J9XCLAIM0000000000000002', 'B');
    const edges: Edge[] = [
      {
        id: '01J9XEDGE0000000000000001',
        kind: 'contradicts',
        from_id: a.id,
        from_table: 'claims',
        to_id: b.id,
        to_table: 'claims',
        weight: 1.0,
        metadata: {},
        created_at: new Date(),
      },
    ];
    const { markdown } = renderTopicPage(mkCtx({ claims: [a, b], edges }));
    const calloutCount = (markdown.match(/> \[!warning\] Contradiction/g) || [])
      .length;
    expect(calloutCount).toBe(1);
  });

  it('frontmatter content_hash matches the returned hash', () => {
    const r = renderTopicPage(mkCtx());
    const fm = matter(r.markdown).data;
    expect(fm.content_hash).toBe(r.hash);
  });
});
