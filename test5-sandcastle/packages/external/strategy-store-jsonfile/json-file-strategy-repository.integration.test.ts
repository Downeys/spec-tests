import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { JsonFileStrategyRepository } from './json-file-strategy-repository.js';
import { Strategy, isOk, isErr } from '@bp-agent/domain';
import type { StrategyId, StrategyName } from '@bp-agent/domain';

describe('JsonFileStrategyRepository', () => {
  let tmpDir: string;
  let filePath: string;
  let repo: JsonFileStrategyRepository;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-agent-test-'));
    filePath = path.join(tmpDir, 'strategies.json');
    repo = new JsonFileStrategyRepository(filePath);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('saves and loads a strategy by name', async () => {
    const createResult = Strategy.create('test-strategy');
    expect(isOk(createResult)).toBe(true);
    if (!isOk(createResult)) return;
    const strategy = createResult.value;

    const saveResult = await repo.save(strategy);
    expect(isOk(saveResult)).toBe(true);

    const loadResult = await repo.loadByName('test-strategy' as StrategyName);
    expect(isOk(loadResult)).toBe(true);
    if (isOk(loadResult) && loadResult.value !== null) {
      expect(loadResult.value.name).toBe('test-strategy');
      expect(loadResult.value.id).toBe(strategy.id);
    } else {
      expect.unreachable('Expected loaded strategy to be non-null');
    }
  });

  it('returns null for a name that does not exist', async () => {
    const result = await repo.loadByName('nonexistent' as StrategyName);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toBeNull();
    }
  });

  it('returns null when file does not exist', async () => {
    const emptyRepo = new JsonFileStrategyRepository(
      path.join(tmpDir, 'nonexistent', 'strategies.json'),
    );
    const result = await emptyRepo.loadByName('anything' as StrategyName);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toBeNull();
    }
  });

  it('auto-creates directories on first write', async () => {
    const nestedPath = path.join(tmpDir, 'deep', 'nested', 'strategies.json');
    const nestedRepo = new JsonFileStrategyRepository(nestedPath);
    const createResult = Strategy.create('nested-test');
    expect(isOk(createResult)).toBe(true);
    if (!isOk(createResult)) return;

    const saveResult = await nestedRepo.save(createResult.value);
    expect(isOk(saveResult)).toBe(true);
    expect(fs.existsSync(nestedPath)).toBe(true);
  });

  it('preserves existing strategies when saving new ones', async () => {
    const first = Strategy.create('alpha');
    const second = Strategy.create('bravo');
    expect(isOk(first)).toBe(true);
    expect(isOk(second)).toBe(true);
    if (!isOk(first) || !isOk(second)) return;

    await repo.save(first.value);
    await repo.save(second.value);

    const loadAlpha = await repo.loadByName('alpha' as StrategyName);
    const loadBravo = await repo.loadByName('bravo' as StrategyName);
    expect(isOk(loadAlpha) && loadAlpha.value !== null).toBe(true);
    expect(isOk(loadBravo) && loadBravo.value !== null).toBe(true);
  });

  it('returns RepositoryError for corrupted file', async () => {
    fs.writeFileSync(filePath, 'not valid json!!!');
    const result = await repo.loadByName('anything' as StrategyName);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.tag).toBe('RepositoryError');
    }
  });

  it('writes records with previousVersionId null for new strategies', async () => {
    const createResult = Strategy.create('check-shape');
    expect(isOk(createResult)).toBe(true);
    if (!isOk(createResult)) return;

    await repo.save(createResult.value);

    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as {
      strategies: { previousVersionId: string | null; versionId: string }[];
    };
    expect(raw.strategies[0]).toBeDefined();
    expect(raw.strategies[0]?.previousVersionId).toBeNull();
    expect(raw.strategies[0]?.versionId).toBeTruthy();
  });

  it('writes schemaVersion 2 with versionId', async () => {
    const createResult = Strategy.create('version-check');
    expect(isOk(createResult)).toBe(true);
    if (!isOk(createResult)) return;

    await repo.save(createResult.value);

    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as {
      schemaVersion: number;
      strategies: { versionId: string; previousVersionId: string | null }[];
    };
    expect(raw.schemaVersion).toBe(2);
    expect(raw.strategies[0]?.versionId).toBeTruthy();
    expect(raw.strategies[0]?.previousVersionId).toBeNull();
  });

  describe('rename (previousVersionId chain)', () => {
    it('produces two records with previousVersionId linking after rename', async () => {
      const createResult = Strategy.create('before-rename');
      expect(isOk(createResult)).toBe(true);
      if (!isOk(createResult)) return;
      const strategy = createResult.value;

      await repo.save(strategy);

      const nameResult = (await import('@bp-agent/domain')).createStrategyName('after-rename');
      expect(isOk(nameResult)).toBe(true);
      if (!isOk(nameResult)) return;

      strategy.rename(nameResult.value);
      await repo.save(strategy);

      const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as {
        strategies: {
          id: string;
          name: string;
          versionId: string;
          previousVersionId: string | null;
        }[];
      };
      expect(raw.strategies).toHaveLength(2);

      const first = raw.strategies[0];
      const second = raw.strategies[1];
      expect(first).toBeDefined();
      expect(second).toBeDefined();
      expect(first?.name).toBe('before-rename');
      expect(first?.previousVersionId).toBeNull();
      expect(second?.name).toBe('after-rename');
      expect(second?.previousVersionId).toBe(first?.versionId);
      expect(second?.id).toBe(first?.id);
    });

    it('loadByName returns the latest version after rename', async () => {
      const createResult = Strategy.create('old-slug');
      expect(isOk(createResult)).toBe(true);
      if (!isOk(createResult)) return;
      const strategy = createResult.value;

      await repo.save(strategy);

      const nameResult = (await import('@bp-agent/domain')).createStrategyName('new-slug');
      expect(isOk(nameResult)).toBe(true);
      if (!isOk(nameResult)) return;

      strategy.rename(nameResult.value);
      await repo.save(strategy);

      const loaded = await repo.loadByName('new-slug' as StrategyName);
      expect(isOk(loaded)).toBe(true);
      if (isOk(loaded) && loaded.value !== null) {
        expect(loaded.value.name).toBe('new-slug');
      } else {
        expect.unreachable('Expected loaded strategy to be non-null');
      }

      const oldLoaded = await repo.loadByName('old-slug' as StrategyName);
      expect(isOk(oldLoaded)).toBe(true);
      if (isOk(oldLoaded)) {
        expect(oldLoaded.value).toBeNull();
      }
    });
  });

  describe('v1 to v2 migration', () => {
    it('migrates v1 file (no versionId) to v2 with stable versionIds on first read', async () => {
      const v1Data = {
        schemaVersion: 1,
        strategies: [
          {
            id: '00000000-0000-4000-a000-000000000001',
            name: 'alpha',
            status: { tag: 'active' },
            createdAt: '2025-01-01T00:00:00.000Z',
            previousVersionId: null,
          },
          {
            id: '00000000-0000-4000-a000-000000000002',
            name: 'bravo',
            status: { tag: 'active' },
            createdAt: '2025-02-01T00:00:00.000Z',
            previousVersionId: null,
          },
        ],
      };
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(v1Data, null, 2), 'utf-8');

      const result = await repo.loadByName('alpha' as StrategyName);
      expect(isOk(result)).toBe(true);

      const migrated = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as {
        schemaVersion: number;
        strategies: { versionId: string; previousVersionId: string | null }[];
      };
      expect(migrated.schemaVersion).toBe(2);
      expect(migrated.strategies).toHaveLength(2);
      expect(migrated.strategies[0]?.versionId).toBeTruthy();
      expect(migrated.strategies[1]?.versionId).toBeTruthy();
      expect(migrated.strategies[0]?.previousVersionId).toBeNull();
      expect(migrated.strategies[1]?.previousVersionId).toBeNull();
    });

    it('second read of migrated file does not re-mutate', async () => {
      const v1Data = {
        schemaVersion: 1,
        strategies: [
          {
            id: '00000000-0000-4000-a000-000000000003',
            name: 'charlie',
            status: { tag: 'active' },
            createdAt: '2025-03-01T00:00:00.000Z',
            previousVersionId: null,
          },
        ],
      };
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(v1Data, null, 2), 'utf-8');

      await repo.loadByName('charlie' as StrategyName);
      const firstRead = fs.readFileSync(filePath, 'utf-8');

      await repo.loadByName('charlie' as StrategyName);
      const secondRead = fs.readFileSync(filePath, 'utf-8');

      expect(secondRead).toBe(firstRead);
    });
  });

  describe('listAll', () => {
    it('returns all strategies when includeArchived is true', async () => {
      const r1 = Strategy.create('alpha');
      if (!isOk(r1)) throw new Error('setup');
      await repo.save(r1.value);

      const archived = Strategy.reconstitute({
        id: '00000000-0000-4000-a000-000000000099' as StrategyId,
        name: 'old-one' as StrategyName,
        status: { tag: 'archived', archivedAt: new Date('2025-01-01') },
        createdAt: new Date('2024-01-01'),
      });
      await repo.save(archived);

      const result = await repo.listAll({ includeArchived: true });
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value).toHaveLength(2);
    });

    it('excludes archived strategies when includeArchived is false', async () => {
      const r1 = Strategy.create('alive');
      if (!isOk(r1)) throw new Error('setup');
      await repo.save(r1.value);

      const archived = Strategy.reconstitute({
        id: '00000000-0000-4000-a000-000000000098' as StrategyId,
        name: 'dead' as StrategyName,
        status: { tag: 'archived', archivedAt: new Date('2025-01-01') },
        createdAt: new Date('2024-01-01'),
      });
      await repo.save(archived);

      const result = await repo.listAll({ includeArchived: false });
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.name).toBe('alive');
    });

    it('returns empty array when no file exists', async () => {
      const result = await repo.listAll({ includeArchived: true });
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value).toHaveLength(0);
    });
  });
});
