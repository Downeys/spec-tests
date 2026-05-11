import { describe, it, expect } from 'vitest';
import { buildFrontmatter } from '@/compilation/render/frontmatter';
import type { Claim, Entity } from '@/onebrain/types';

function makeClaim(over: Partial<Claim> = {}): Claim {
  return {
    id: '01J9XCLAIM00000000000000FF',
    kind: 'fact',
    status: 'hypothesis',
    confidence: 0.7,
    text: 't',
    rationale: null,
    topic_tags: ['pricing'],
    framework_tags: ['swot'],
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

describe('buildFrontmatter (COMP-02, D-15)', () => {
  const base = {
    pageId: '01J9XPAGE0000000000000000FF',
    kind: 'topic' as const,
    title: 'Pricing',
    slug: 'topics/pricing',
    generatedAt: new Date('2026-04-25T12:00:00Z'),
    compileRunId: '01J9XRUN00000000000000000F',
    entities: [] as Entity[],
    contradictionCount: 1,
  };

  it('contains every D-15 required key', () => {
    const fm = buildFrontmatter({ ...base, claims: [makeClaim()] });
    const required = [
      'id',
      'kind',
      'title',
      'slug',
      'generated_at',
      'generated_by',
      'compile_run_id',
      'content_hash',
      'claim_ids',
      'entity_ids',
      'topic_tags',
      'framework_tags',
      'confidence_avg',
      'confidence_min',
      'contradictions',
      'last_evidence_at',
      'stale',
      'status_breakdown',
    ];
    for (const key of required) {
      expect(fm).toHaveProperty(key);
    }
  });

  it('generated_by is "compilation-agent" (D-15 forward-compat)', () => {
    const fm = buildFrontmatter({ ...base, claims: [makeClaim()] });
    expect(fm.generated_by).toBe('compilation-agent');
  });

  it('content_hash is PLACEHOLDER (substituted later)', () => {
    const fm = buildFrontmatter({ ...base, claims: [makeClaim()] });
    expect(fm.content_hash).toBe('PLACEHOLDER');
  });

  it('claim_ids is sorted ascending (D-18)', () => {
    const fm = buildFrontmatter({
      ...base,
      claims: [
        makeClaim({ id: '01J9XCLAIM00000000000000ZZ' }),
        makeClaim({ id: '01J9XCLAIM00000000000000AA' }),
      ],
    });
    expect(fm.claim_ids).toEqual([
      '01J9XCLAIM00000000000000AA',
      '01J9XCLAIM00000000000000ZZ',
    ]);
  });

  it('topic_tags deduped and sorted', () => {
    const fm = buildFrontmatter({
      ...base,
      claims: [
        makeClaim({ topic_tags: ['pricing', 'segmentation'] }),
        makeClaim({ topic_tags: ['pricing'] }),
      ],
    });
    expect(fm.topic_tags).toEqual(['pricing', 'segmentation']);
  });

  it('confidence_avg + confidence_min reflect claims (CRIT-04)', () => {
    const fm = buildFrontmatter({
      ...base,
      claims: [makeClaim({ confidence: 0.4 }), makeClaim({ confidence: 0.8 })],
    });
    expect(fm.confidence_avg).toBe(0.6);
    expect(fm.confidence_min).toBe(0.4);
  });

  it('stale=true when last_evidence_at > 90 days before generatedAt (CRIT-04)', () => {
    const fm = buildFrontmatter({
      ...base,
      claims: [
        makeClaim({
          updated_at: new Date('2025-12-01'),
          created_at: new Date('2025-12-01'),
        }),
      ],
    });
    expect(fm.stale).toBe(true);
  });

  it('stale=false for recent claims', () => {
    const fm = buildFrontmatter({
      ...base,
      claims: [
        makeClaim({
          updated_at: new Date('2026-04-20'),
          created_at: new Date('2026-04-20'),
        }),
      ],
    });
    expect(fm.stale).toBe(false);
  });

  it('status_breakdown counts each status (CRIT-04)', () => {
    const fm = buildFrontmatter({
      ...base,
      claims: [
        makeClaim({ status: 'hypothesis' }),
        makeClaim({ status: 'hypothesis' }),
        makeClaim({ status: 'validated' }),
      ],
    });
    expect(fm.status_breakdown).toEqual({ hypothesis: 2, validated: 1 });
  });

  it('contradictions count is the input value', () => {
    const fm = buildFrontmatter({
      ...base,
      claims: [makeClaim()],
      contradictionCount: 3,
    });
    expect(fm.contradictions).toBe(3);
  });

  // WARNING 3 fix: cover non-trivial confidence_avg rounding.
  // Mean of {0.45, 0.85, 0.65} = 0.65 exactly — but with three different inputs
  // the buggy implementations (truncation, no rounding, wrong precision) would diverge.
  // Using toBeCloseTo with 2-digit precision proves the round-to-2dp behavior.
  it('rounds confidence_avg to 2 decimals', () => {
    const fm = buildFrontmatter({
      ...base,
      claims: [
        makeClaim({ confidence: 0.45 }),
        makeClaim({ confidence: 0.85 }),
        makeClaim({ confidence: 0.65 }),
      ],
    });
    expect(fm.confidence_avg).toBeCloseTo(0.65, 2);
  });
});
