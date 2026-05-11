import { describe, it, expect } from 'vitest';
import { archiveStrategy } from './archive-strategy.js';
import type { ArchiveStrategyDeps } from './archive-strategy.js';
import type { StrategyRepository } from '../../ports/strategy-repository.js';
import type { RuntimeConfig } from '../../ports/runtime-config.js';
import { Strategy, ok, isOk, isErr } from '@bp-agent/domain';
import type { StrategyId, StrategyName } from '@bp-agent/domain';

function makeRepo(strategies: Strategy[]): StrategyRepository & { saved: Strategy[] } {
  const saved: Strategy[] = [];
  return {
    saved,
    save: (s: Strategy) => {
      saved.push(s);
      return Promise.resolve(ok(undefined));
    },
    loadByName: (name: StrategyName) =>
      Promise.resolve(ok(strategies.find((s) => s.name === name) ?? null)),
    loadById: (id: StrategyId) => Promise.resolve(ok(strategies.find((s) => s.id === id) ?? null)),
    listAll: () => Promise.resolve(ok(strategies)),
  };
}

function makeConfig(activeId: StrategyId | null = null): RuntimeConfig {
  return {
    getActiveStrategyId: () => Promise.resolve(ok(activeId)),
    setActiveStrategyId: () => Promise.resolve(ok(undefined)),
  };
}

describe('archiveStrategy', () => {
  it('archives an existing non-active strategy', async () => {
    const createResult = Strategy.create('to-archive');
    if (!isOk(createResult)) throw new Error('setup');
    const strategy = createResult.value;

    const repo = makeRepo([strategy]);
    const config = makeConfig('00000000-0000-4000-a000-000000000099' as StrategyId);
    const deps: ArchiveStrategyDeps = {
      repo,
      config,
      rawName: 'to-archive',
      now: () => new Date('2025-06-01'),
    };

    const result = await archiveStrategy(deps);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.status).toEqual({
        tag: 'archived',
        archivedAt: new Date('2025-06-01'),
        reason: undefined,
      });
    }
    expect(repo.saved).toHaveLength(1);
  });

  it('archives with a reason', async () => {
    const createResult = Strategy.create('with-reason');
    if (!isOk(createResult)) throw new Error('setup');
    const strategy = createResult.value;

    const repo = makeRepo([strategy]);
    const config = makeConfig('00000000-0000-4000-a000-000000000099' as StrategyId);
    const deps: ArchiveStrategyDeps = {
      repo,
      config,
      rawName: 'with-reason',
      reason: 'pivoting',
      now: () => new Date('2025-06-01'),
    };

    const result = await archiveStrategy(deps);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.status).toEqual({
        tag: 'archived',
        archivedAt: new Date('2025-06-01'),
        reason: 'pivoting',
      });
    }
  });

  it('refuses when strategy is currently active', async () => {
    const createResult = Strategy.create('active-one');
    if (!isOk(createResult)) throw new Error('setup');
    const strategy = createResult.value;

    const repo = makeRepo([strategy]);
    const config = makeConfig(strategy.id);
    const deps: ArchiveStrategyDeps = { repo, config, rawName: 'active-one' };

    const result = await archiveStrategy(deps);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.tag).toBe('CannotArchiveActive');
    }
  });

  it('refuses when strategy is already archived', async () => {
    const archived = Strategy.reconstitute({
      id: '00000000-0000-4000-a000-000000000001' as StrategyId,
      name: 'old-one' as StrategyName,
      status: { tag: 'archived', archivedAt: new Date('2025-01-01') },
      createdAt: new Date('2024-01-01'),
    });

    const repo = makeRepo([archived]);
    const config = makeConfig('00000000-0000-4000-a000-000000000099' as StrategyId);
    const deps: ArchiveStrategyDeps = { repo, config, rawName: 'old-one' };

    const result = await archiveStrategy(deps);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.tag).toBe('IllegalTransition');
    }
  });

  it('refuses when strategy does not exist', async () => {
    const repo = makeRepo([]);
    const config = makeConfig(null);
    const deps: ArchiveStrategyDeps = { repo, config, rawName: 'ghost' };

    const result = await archiveStrategy(deps);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.tag).toBe('StrategyNotFound');
    }
  });

  it('refuses with NameInvalid for invalid slug', async () => {
    const repo = makeRepo([]);
    const config = makeConfig(null);
    const deps: ArchiveStrategyDeps = { repo, config, rawName: 'BAD NAME' };

    const result = await archiveStrategy(deps);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.tag).toBe('NameInvalid');
    }
  });
});
