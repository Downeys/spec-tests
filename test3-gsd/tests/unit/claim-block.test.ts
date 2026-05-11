import { describe, it, expect } from 'vitest';
import {
  renderClaimBlock,
  renderClaimBlockWithSources,
} from '@/compilation/render/claim-block';
import type { Claim } from '@/onebrain/types';

const claim: Claim = {
  id: '01J9XCLAIM00000000000000FF',
  kind: 'fact',
  status: 'hypothesis',
  confidence: 0.85,
  text: 'Test claim text.',
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

describe('renderClaimBlock', () => {
  it('renders text + claim wikilink + confidence + status', () => {
    const md = renderClaimBlock(claim, []);
    expect(md).toContain('> Test claim text.');
    expect(md).toContain('[[claim:01J9XCLAIM00000000000000FF]]');
    expect(md).toContain('confidence=0.85');
    expect(md).toContain('status=hypothesis');
  });

  it('is deterministic across calls', () => {
    expect(renderClaimBlock(claim, [])).toBe(renderClaimBlock(claim, []));
  });
});

describe('renderClaimBlockWithSources', () => {
  it('appends sources line when ids provided', () => {
    const md = renderClaimBlockWithSources(claim, [
      '01J9XSRC00000000000000FF1',
      '01J9XSRC00000000000000FF2',
    ]);
    expect(md).toContain(
      '— sources: [[source:01J9XSRC00000000000000FF1]], [[source:01J9XSRC00000000000000FF2]]',
    );
  });
  it('omits sources line when no ids', () => {
    const md = renderClaimBlockWithSources(claim, []);
    expect(md).not.toContain('sources:');
  });
});
