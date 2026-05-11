import { describe, it, expect } from 'vitest';
import { renderContradictionCallout } from '@/compilation/render/contradiction';
import type { Claim } from '@/onebrain/types';

function mkClaim(id: string, text: string, conf: number): Claim {
  return {
    id,
    kind: 'fact',
    status: 'hypothesis',
    confidence: conf,
    text,
    rationale: null,
    topic_tags: [],
    framework_tags: [],
    business_plan_id: 'default-plan',
    created_by: 'test',
    created_at: new Date(),
    updated_at: new Date(),
    superseded_by: null,
    embedding: [],
    embedding_model: 'voyage-3.5-1024',
    supporting_count: 0,
    contradicting_count: 0,
  };
}

const a = mkClaim('01J9XAAA00000000000000000A', 'Customers will accept $99/mo.', 0.8);
const b = mkClaim('01J9XBBB00000000000000000B', 'Customers will balk above $49/mo.', 0.65);

describe('renderContradictionCallout (CRIT-05, COMP-09 — never smoothed)', () => {
  it('starts with the exact Obsidian callout marker', () => {
    const md = renderContradictionCallout(a, b, []);
    expect(md.split('\n')[0]).toBe('> [!warning] Contradiction');
  });

  it('both claim ids appear in the output (CRIT-05 — both sides present)', () => {
    const md = renderContradictionCallout(a, b, []);
    expect(md).toContain('[[claim:01J9XAAA00000000000000000A]]');
    expect(md).toContain('[[claim:01J9XBBB00000000000000000B]]');
  });

  it('both claim texts appear in the output (no side dropped)', () => {
    const md = renderContradictionCallout(a, b, []);
    expect(md).toContain('Customers will accept $99/mo.');
    expect(md).toContain('Customers will balk above $49/mo.');
  });

  it('shows confidence and status for both claims (CRIT-04)', () => {
    const md = renderContradictionCallout(a, b, []);
    expect(md).toContain('confidence 0.8, hypothesis');
    expect(md).toContain('confidence 0.65, hypothesis');
  });

  it('embeds source citations when provided', () => {
    const md = renderContradictionCallout(
      a,
      b,
      [],
      ['01J9XSRC0000000000000000AA'],
      ['01J9XSRC0000000000000000BB'],
    );
    expect(md).toContain('[[source:01J9XSRC0000000000000000AA]]');
    expect(md).toContain('[[source:01J9XSRC0000000000000000BB]]');
  });

  it('renders "(no source)" placeholder when no source ids', () => {
    const md = renderContradictionCallout(a, b, []);
    expect(md).toContain('(no source)');
  });

  it('output is deterministic across calls', () => {
    expect(renderContradictionCallout(a, b, [])).toBe(
      renderContradictionCallout(a, b, []),
    );
  });
});
