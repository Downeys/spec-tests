// tests/integration/append-only.test.ts
// P2 + DATA-06 verification: provenance chain must never break, supersede preserves the original.

import { describe, it, expect, beforeEach, vi } from 'vitest';

// This integration test uses a vi.mock of embed at the top of the file (Vitest hoists
// vi.mock to module top). The integration project does NOT register the unit-suite
// voyage-mock setup file, so we mock here explicitly to keep CI self-contained.
vi.mock('@/onebrain/embed', () => ({
  embed: vi.fn(async () => Array.from({ length: 1024 }, () => Math.random())),
  EMBEDDING_DIMENSION: 1024,
}));

import * as repo from '@/onebrain/repo';
import { resetSchemaAndMigrate } from '../setup/db-setup.js';

beforeEach(async () => {
  await resetSchemaAndMigrate();
});

describe('Append-only repo (DATA-06, PITFALLS P2)', () => {
  it('repo exports no delete-shaped functions (reflective)', () => {
    const names = Object.keys(repo);
    for (const n of names) {
      expect(n.toLowerCase()).not.toMatch(/^(delete|remove|drop|destroy)/);
    }
  });

  it('writeClaim inserts a row with status hypothesis (CRIT-02)', async () => {
    const c = await repo.writeClaim({
      kind: 'fact',
      text: 'TestClaim1',
      confidence: 0.6,
      created_by: 'append-only-test',
    });
    expect(c.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(c.status).toBe('hypothesis');
    const found = await repo.findClaim(c.id);
    expect(found).toBeDefined();
    expect(found?.text).toBe('TestClaim1');
  });

  it('supersede preserves the original row (DATA-06)', async () => {
    const original = await repo.writeClaim({
      kind: 'fact',
      text: 'OriginalText',
      confidence: 0.5,
      created_by: 'append-only-test',
    });
    const replacement = await repo.supersede(original.id, {
      kind: 'fact',
      text: 'ReplacementText',
      confidence: 0.7,
      created_by: 'append-only-test',
    });

    const oldRow = await repo.findClaim(original.id);
    expect(oldRow).toBeDefined();
    expect(oldRow?.text).toBe('OriginalText'); // text preserved
    expect(oldRow?.status).toBe('superseded');
    expect(oldRow?.superseded_by).toBe(replacement.id);

    const newRow = await repo.findClaim(replacement.id);
    expect(newRow?.text).toBe('ReplacementText');
    expect(newRow?.status).toBe('hypothesis');

    const edges = await repo.findEdgesFrom('claims', replacement.id);
    expect(edges.some((e) => e.kind === 'supersedes' && e.to_id === original.id)).toBe(true);
  });

  it('writeSource is idempotent on raw_text (D-04)', async () => {
    const first = await repo.writeSource({
      kind: 'web_article',
      url: 'https://example.com/a',
      title: 'Test',
      author: null,
      published_at: null,
      raw_text: 'identical content',
      metadata: {},
    });
    expect(first.skipped).toBe(false);

    const second = await repo.writeSource({
      kind: 'web_article',
      url: 'https://example.com/a',
      title: 'Test',
      author: null,
      published_at: null,
      raw_text: 'identical content',
      metadata: {},
    });
    expect(second.skipped).toBe(true);
    expect(second.source.id).toBe(first.source.id); // same row returned
  });

  it('canonicalizes tags at write time (DATA-10)', async () => {
    const c = await repo.writeClaim({
      kind: 'fact',
      text: 'TagTest',
      confidence: 0.5,
      created_by: 'test',
      topic_tags: ['Pricing Strategy', 'SWOT.Weakness'],
      framework_tags: ["Porter's 5 Forces"],
    });
    const found = await repo.findClaim(c.id);
    expect(found?.topic_tags).toEqual(['pricing-strategy', 'swot-weakness']);
    expect(found?.framework_tags).toEqual(['porter-s-5-forces']);
  });

  it('promoteClaimStatus requires existing evidence edge (CRIT-06)', async () => {
    const c = await repo.writeClaim({
      kind: 'hypothesis',
      text: 'TestClaim',
      confidence: 0.4,
      created_by: 'test',
    });
    await expect(
      repo.promoteClaimStatus(c.id, 'validated', '01J9X9999999999999999999XX'),
    ).rejects.toThrow(/does not exist/);
  });
});
