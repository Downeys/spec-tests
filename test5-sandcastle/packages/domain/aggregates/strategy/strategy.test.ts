import { describe, it, expect } from 'vitest';
import { Strategy } from './strategy.js';
import type { StrategyId } from './strategy-id.js';
import type { StrategyName } from './strategy-name.js';
import { createStrategyName } from './strategy-name.js';
import { isOk, isErr } from '../../dtos/result.js';

describe('Strategy', () => {
  describe('create', () => {
    it('creates an active strategy with a valid slug name', () => {
      const result = Strategy.create('my-first');
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const strategy = result.value;
        expect(strategy.name).toBe('my-first');
        expect(strategy.status).toEqual({ tag: 'active' });
        expect(strategy.id).toBeTruthy();
        expect(strategy.createdAt).toBeInstanceOf(Date);
      }
    });

    it('generates a unique id for each strategy', () => {
      const r1 = Strategy.create('alpha');
      const r2 = Strategy.create('bravo');
      expect(isOk(r1)).toBe(true);
      expect(isOk(r2)).toBe(true);
      if (isOk(r1) && isOk(r2)) {
        expect(r1.value.id).not.toBe(r2.value.id);
      }
    });

    it('rejects invalid slug names', () => {
      const result = Strategy.create('BAD NAME');
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.tag).toBe('NameInvalid');
      }
    });

    it('rejects names with whitespace', () => {
      const result = Strategy.create('has space');
      expect(isErr(result)).toBe(true);
    });

    it('rejects names with unsafe characters', () => {
      const result = Strategy.create('my@strategy!');
      expect(isErr(result)).toBe(true);
    });

    it('accepts minimum-length name', () => {
      const result = Strategy.create('ab');
      expect(isOk(result)).toBe(true);
    });

    it('accepts maximum-length name', () => {
      const result = Strategy.create('a'.repeat(64));
      expect(isOk(result)).toBe(true);
    });

    it('rejects single-character name', () => {
      const result = Strategy.create('a');
      expect(isErr(result)).toBe(true);
    });
  });

  describe('isArchived', () => {
    it('returns false for an active strategy', () => {
      const result = Strategy.create('active-one');
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.isArchived).toBe(false);
    });

    it('returns true for an archived strategy', () => {
      const archived = Strategy.reconstitute({
        id: '00000000-0000-4000-a000-000000000001' as StrategyId,
        name: 'old-one' as StrategyName,
        status: { tag: 'archived', archivedAt: new Date('2025-01-01') },
        createdAt: new Date('2024-01-01'),
      });
      expect(archived.isArchived).toBe(true);
    });
  });

  describe('rename', () => {
    it('renames an active strategy', () => {
      const result = Strategy.create('original');
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;

      const nameResult = createStrategyName('new-name');
      expect(isOk(nameResult)).toBe(true);
      if (!isOk(nameResult)) return;

      const renameResult = result.value.rename(nameResult.value);
      expect(isOk(renameResult)).toBe(true);
      expect(result.value.name).toBe('new-name');
    });

    it('refuses to rename an archived strategy with IllegalTransition', () => {
      const archived = Strategy.reconstitute({
        id: '00000000-0000-4000-a000-000000000001' as StrategyId,
        name: 'old-one' as StrategyName,
        status: { tag: 'archived', archivedAt: new Date('2025-01-01') },
        createdAt: new Date('2024-01-01'),
      });

      const nameResult = createStrategyName('new-name');
      expect(isOk(nameResult)).toBe(true);
      if (!isOk(nameResult)) return;

      const renameResult = archived.rename(nameResult.value);
      expect(isErr(renameResult)).toBe(true);
      if (!isErr(renameResult)) return;
      expect(renameResult.error.tag).toBe('IllegalTransition');
    });
  });

  describe('archive', () => {
    it('transitions an active strategy to archived', () => {
      const result = Strategy.create('to-archive');
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;

      const now = new Date('2025-06-01T00:00:00.000Z');
      const archiveResult = result.value.archive(undefined, () => now);
      expect(isOk(archiveResult)).toBe(true);
      expect(result.value.isArchived).toBe(true);
      expect(result.value.status).toEqual({
        tag: 'archived',
        archivedAt: now,
        reason: undefined,
      });
    });

    it('stores the reason when provided', () => {
      const result = Strategy.create('reason-test');
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;

      const now = new Date('2025-07-01T00:00:00.000Z');
      const archiveResult = result.value.archive('pivoting to new market', () => now);
      expect(isOk(archiveResult)).toBe(true);
      expect(result.value.status).toEqual({
        tag: 'archived',
        archivedAt: now,
        reason: 'pivoting to new market',
      });
    });

    it('refuses to archive an already-archived strategy', () => {
      const archived = Strategy.reconstitute({
        id: '00000000-0000-4000-a000-000000000001' as StrategyId,
        name: 'old-one' as StrategyName,
        status: { tag: 'archived', archivedAt: new Date('2025-01-01') },
        createdAt: new Date('2024-01-01'),
      });

      const archiveResult = archived.archive(undefined, () => new Date());
      expect(isErr(archiveResult)).toBe(true);
      if (!isErr(archiveResult)) return;
      expect(archiveResult.error.tag).toBe('IllegalTransition');
    });

    it('prevents rename after archive', () => {
      const result = Strategy.create('will-archive');
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;

      result.value.archive(undefined, () => new Date());

      const nameResult = createStrategyName('new-name');
      expect(isOk(nameResult)).toBe(true);
      if (!isOk(nameResult)) return;

      const renameResult = result.value.rename(nameResult.value);
      expect(isErr(renameResult)).toBe(true);
      if (!isErr(renameResult)) return;
      expect(renameResult.error.tag).toBe('IllegalTransition');
    });
  });

  describe('reconstitute', () => {
    it('reconstructs a strategy from persisted state', () => {
      const createResult = Strategy.create('test-strategy');
      expect(isOk(createResult)).toBe(true);
      if (!isOk(createResult)) return;

      const original = createResult.value;
      const snapshot = original.snapshot();
      const reconstituted = Strategy.reconstitute(snapshot);

      expect(reconstituted.id).toBe(original.id);
      expect(reconstituted.name).toBe(original.name);
      expect(reconstituted.status).toEqual(original.status);
      expect(reconstituted.createdAt.getTime()).toBe(original.createdAt.getTime());
    });
  });
});
