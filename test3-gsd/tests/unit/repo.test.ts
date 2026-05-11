// tests/unit/repo.test.ts — runs in unit project (mocked embed; mocked db).
// The reflective-export check is the architectural keystone of DATA-06.
import { describe, it, expect, vi } from 'vitest';

// Mock db for unit suite (we don't want to hit Postgres here)
vi.mock('@/onebrain/db', () => {
  const fakeQuery = vi.fn().mockResolvedValue({ rows: [] });
  const fakeRow = {
    id: '01J9X0000000000000000000FF',
    kind: 'fact',
    status: 'hypothesis',
    confidence: '0.50',
    text: 't',
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
  return {
    db: {
      transaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
        fn({
          insert: () => ({
            values: () => ({ returning: () => Promise.resolve([fakeRow]) }),
          }),
          update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
          select: () => ({
            from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
          }),
        }),
      ),
      insert: () => ({
        values: () => ({ returning: () => Promise.resolve([fakeRow]) }),
      }),
      select: () => ({
        from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
      }),
      update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
    },
    pool: { query: fakeQuery, end: vi.fn() },
  };
});

import * as repo from '@/onebrain/repo';

describe('repo append-only API surface (DATA-06 — architectural keystone)', () => {
  it('exports no delete/remove/drop/destroy functions', () => {
    const exportNames = Object.keys(repo);
    for (const name of exportNames) {
      expect(name.toLowerCase()).not.toMatch(/^(delete|remove|drop|destroy)/);
    }
  });

  it('exports the expected write functions', () => {
    expect(typeof repo.writeClaim).toBe('function');
    expect(typeof repo.writeSource).toBe('function');
    expect(typeof repo.writeEdge).toBe('function');
    expect(typeof repo.writeEntity).toBe('function');
    expect(typeof repo.supersede).toBe('function');
    expect(typeof repo.promoteClaimStatus).toBe('function');
  });

  it('exports the expected read functions', () => {
    expect(typeof repo.findClaim).toBe('function');
    expect(typeof repo.findSource).toBe('function');
    expect(typeof repo.findAllClaims).toBe('function');
  });
});

describe('writeClaim defaults (CRIT-02)', () => {
  it('defaults status to hypothesis when omitted from input', async () => {
    const claim = await repo.writeClaim({
      kind: 'fact',
      text: 'A claim.',
      confidence: 0.7,
      created_by: 'test',
    });
    expect(claim.status).toBe('hypothesis');
  });
});

describe('promoteClaimStatus (CRIT-06)', () => {
  it('throws when evidenceEdgeId is empty string', async () => {
    await expect(
      repo.promoteClaimStatus('01J9X0000000000000000000FF', 'validated', ''),
    ).rejects.toThrow(/evidenceEdgeId/);
  });

  it('throws when edge does not exist', async () => {
    await expect(
      repo.promoteClaimStatus(
        '01J9X0000000000000000000FF',
        'validated',
        '01J9X9999999999999999999XX',
      ),
    ).rejects.toThrow(/does not exist/);
  });
});
