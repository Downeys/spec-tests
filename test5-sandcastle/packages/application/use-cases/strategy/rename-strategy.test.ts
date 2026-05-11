import { describe, it, expect } from 'vitest';
import { renameStrategy } from './rename-strategy.js';
import type { RenameStrategyDeps } from './rename-strategy.js';
import type { StrategyRepository } from '../../ports/strategy-repository.js';
import { Strategy, ok, isOk, isErr } from '@bp-agent/domain';
import type { StrategyId, StrategyName } from '@bp-agent/domain';

function makeRepo(strategies: Strategy[]): StrategyRepository {
  return {
    save: () => Promise.resolve(ok(undefined)),
    loadByName: (name: StrategyName) =>
      Promise.resolve(ok(strategies.find((s) => s.name === name) ?? null)),
    loadById: (id: StrategyId) => Promise.resolve(ok(strategies.find((s) => s.id === id) ?? null)),
    listAll: () => Promise.resolve(ok(strategies)),
  };
}

describe('renameStrategy', () => {
  it('renames an existing active strategy', async () => {
    const createResult = Strategy.create('old-name');
    if (!isOk(createResult)) throw new Error('setup failed');
    const strategy = createResult.value;

    const repo = makeRepo([strategy]);
    const deps: RenameStrategyDeps = { repo, oldRawName: 'old-name', newRawName: 'new-name' };

    const result = await renameStrategy(deps);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.name).toBe('new-name');
    }
  });

  it('fails when old strategy does not exist', async () => {
    const repo = makeRepo([]);
    const deps: RenameStrategyDeps = { repo, oldRawName: 'ghost', newRawName: 'new-name' };

    const result = await renameStrategy(deps);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.tag).toBe('StrategyNotFound');
    }
  });

  it('fails when old strategy is archived', async () => {
    const archived = Strategy.reconstitute({
      id: '00000000-0000-4000-a000-000000000001' as StrategyId,
      name: 'old-one' as StrategyName,
      status: { tag: 'archived', archivedAt: new Date('2025-01-01') },
      createdAt: new Date('2024-01-01'),
    });

    const repo = makeRepo([archived]);
    const deps: RenameStrategyDeps = { repo, oldRawName: 'old-one', newRawName: 'new-name' };

    const result = await renameStrategy(deps);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.tag).toBe('IllegalTransition');
    }
  });

  it('fails when new name already belongs to a different strategy', async () => {
    const createResult1 = Strategy.create('alpha');
    const createResult2 = Strategy.create('bravo');
    if (!isOk(createResult1) || !isOk(createResult2)) throw new Error('setup failed');

    const repo = makeRepo([createResult1.value, createResult2.value]);
    const deps: RenameStrategyDeps = { repo, oldRawName: 'alpha', newRawName: 'bravo' };

    const result = await renameStrategy(deps);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.tag).toBe('StrategyAlreadyExists');
    }
  });

  it('fails with NameInvalid for invalid old name', async () => {
    const repo = makeRepo([]);
    const deps: RenameStrategyDeps = { repo, oldRawName: 'BAD NAME', newRawName: 'new-name' };

    const result = await renameStrategy(deps);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.tag).toBe('NameInvalid');
    }
  });

  it('fails with NameInvalid for invalid new name', async () => {
    const createResult = Strategy.create('old-name');
    if (!isOk(createResult)) throw new Error('setup failed');

    const repo = makeRepo([createResult.value]);
    const deps: RenameStrategyDeps = { repo, oldRawName: 'old-name', newRawName: 'BAD NAME' };

    const result = await renameStrategy(deps);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.tag).toBe('NameInvalid');
    }
  });
});
