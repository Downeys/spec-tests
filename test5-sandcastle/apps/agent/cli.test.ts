import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PassThrough } from 'node:stream';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { startRepl } from './cli.js';
import type { ReplDeps } from './cli.js';
import { ok, err, Strategy } from '@bp-agent/domain';
import type { StrategyId, StrategyName } from '@bp-agent/domain';
import { JsonFileStrategyRepository, JsonFileRuntimeConfig } from '@bp-agent/external';
import type { RepositoryError } from '@bp-agent/application';

function inMemoryDeps(): ReplDeps {
  return {
    repo: {
      save() {
        return Promise.resolve(ok(undefined));
      },
      loadByName() {
        return Promise.resolve(ok(null));
      },
      loadById() {
        return Promise.resolve(ok(null));
      },
      listAll() {
        return Promise.resolve(ok([]));
      },
    },
    config: {
      getActiveStrategyId() {
        return Promise.resolve(ok(null));
      },
      setActiveStrategyId() {
        return Promise.resolve(ok(undefined));
      },
    },
  };
}

async function createTestRepl(
  deps?: ReplDeps,
): Promise<{ input: PassThrough; output: PassThrough; getOutput: () => string }> {
  const input = new PassThrough();
  const output = new PassThrough();
  let collected = '';

  output.on('data', (chunk: Buffer) => {
    collected += chunk.toString();
  });

  await startRepl(deps ?? inMemoryDeps(), input, output);

  return {
    input,
    output,
    getOutput: () => collected,
  };
}

function sendLine(input: PassThrough, line: string): Promise<void> {
  return new Promise((resolve) => {
    input.write(`${line}\n`);
    setTimeout(resolve, 50);
  });
}

describe('REPL', () => {
  it('prints no-active-strategy greeting on fresh start', async () => {
    const { getOutput } = await createTestRepl();
    expect(getOutput()).toContain('No active strategy');
    expect(getOutput()).toContain('/strategy create');
  });

  it('/help lists available commands including /strategy create', async () => {
    const { input, getOutput } = await createTestRepl();

    await sendLine(input, '/help');

    const out = getOutput();
    expect(out).toContain('/help');
    expect(out).toContain('/exit');
    expect(out).toContain('/strategy create');
    expect(out).toContain('Available commands');
  });

  it('/exit closes the REPL', async () => {
    const rl = await startRepl(inMemoryDeps(), new PassThrough(), new PassThrough());

    await new Promise<void>((resolve) => {
      rl.on('close', resolve);
      rl.write('/exit\n');
    });
  });

  it('unknown slash commands print clear error', async () => {
    const { input, getOutput } = await createTestRepl();

    await sendLine(input, '/foo');

    expect(getOutput()).toContain('Unknown command: /foo');
  });

  it('non-command input prints no-agent message', async () => {
    const { input, getOutput } = await createTestRepl();

    await sendLine(input, 'hello world');

    expect(getOutput()).toContain('no agent yet');
    expect(getOutput()).toContain('/help');
  });
});

describe('REPL integration: /strategy create', () => {
  let tmpDir: string;
  let deps: ReplDeps;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-agent-cli-test-'));
    deps = {
      repo: new JsonFileStrategyRepository(path.join(tmpDir, 'strategies.json')),
      config: new JsonFileRuntimeConfig(path.join(tmpDir, 'runtime.json')),
    };
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('/strategy create <slug> creates and activates a strategy', async () => {
    const { input, getOutput } = await createTestRepl(deps);

    await sendLine(input, '/strategy create my-first');

    const out = getOutput();
    expect(out).toContain('my-first');
    expect(out).toContain('created and set as active');

    const runtimeRaw = JSON.parse(fs.readFileSync(path.join(tmpDir, 'runtime.json'), 'utf-8')) as {
      activeStrategyId: string | null;
    };
    expect(runtimeRaw.activeStrategyId).toBeTruthy();

    const strategiesRaw = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'strategies.json'), 'utf-8'),
    ) as { strategies: { name: string }[] };
    expect(strategiesRaw.strategies).toHaveLength(1);
    expect(strategiesRaw.strategies[0]).toBeDefined();
    expect(strategiesRaw.strategies[0]?.name).toBe('my-first');
  });

  it('/strategy create rejects invalid names', async () => {
    const { input, getOutput } = await createTestRepl(deps);

    await sendLine(input, '/strategy create BAD NAME');

    const out = getOutput();
    expect(out).toContain('Unknown command');
  });

  it('/strategy create rejects duplicate names', async () => {
    const { input, getOutput } = await createTestRepl(deps);

    await sendLine(input, '/strategy create dupe-test');
    await sendLine(input, '/strategy create dupe-test');

    const out = getOutput();
    expect(out).toContain('already exists');
  });

  it('greeting shows active strategy name after creation', async () => {
    const { input } = await createTestRepl(deps);
    await sendLine(input, '/strategy create active-one');

    const { getOutput: getOutput2 } = await createTestRepl(deps);
    expect(getOutput2()).toContain('Active strategy: active-one');
  });
});

describe('REPL integration: /strategy switch', () => {
  let tmpDir: string;
  let deps: ReplDeps;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-agent-switch-test-'));
    deps = {
      repo: new JsonFileStrategyRepository(path.join(tmpDir, 'strategies.json')),
      config: new JsonFileRuntimeConfig(path.join(tmpDir, 'runtime.json')),
    };
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('/strategy switch changes active strategy', async () => {
    const { input, getOutput } = await createTestRepl(deps);

    await sendLine(input, '/strategy create alpha');
    await sendLine(input, '/strategy create bravo');
    await sendLine(input, '/strategy switch alpha');

    const out = getOutput();
    expect(out).toContain('Switched to: alpha');
  });

  it('/strategy switch fails for nonexistent strategy', async () => {
    const { input, getOutput } = await createTestRepl(deps);

    await sendLine(input, '/strategy switch ghost');

    const out = getOutput();
    expect(out).toContain('does not exist');
  });

  it('/strategy switch fails for archived strategy', async () => {
    const { input, getOutput } = await createTestRepl(deps);

    const archived = Strategy.reconstitute({
      id: '00000000-0000-4000-a000-000000000050' as StrategyId,
      name: 'old-one' as StrategyName,
      status: { tag: 'archived', archivedAt: new Date('2025-01-01') },
      createdAt: new Date('2024-01-01'),
    });
    await deps.repo.save(archived);

    await sendLine(input, '/strategy switch old-one');

    const out = getOutput();
    expect(out).toContain('is archived');
  });
});

describe('REPL integration: /strategy list', () => {
  let tmpDir: string;
  let deps: ReplDeps;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-agent-list-test-'));
    deps = {
      repo: new JsonFileStrategyRepository(path.join(tmpDir, 'strategies.json')),
      config: new JsonFileRuntimeConfig(path.join(tmpDir, 'runtime.json')),
    };
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('/strategy list shows strategies with active marker', async () => {
    const { input, getOutput } = await createTestRepl(deps);

    await sendLine(input, '/strategy create alpha');
    await sendLine(input, '/strategy create bravo');
    await sendLine(input, '/strategy list');

    const out = getOutput();
    expect(out).toContain('bravo (active)');
    expect(out).toContain('alpha');
    expect(out).not.toContain('alpha (active)');
  });

  it('/strategy list after switch moves active marker', async () => {
    const { input, getOutput } = await createTestRepl(deps);

    await sendLine(input, '/strategy create alpha');
    await sendLine(input, '/strategy create bravo');
    await sendLine(input, '/strategy switch alpha');
    await sendLine(input, '/strategy list');

    const out = getOutput();
    expect(out).toContain('alpha (active)');
  });

  it('/strategy list omits archived strategies', async () => {
    const { input, getOutput } = await createTestRepl(deps);

    await sendLine(input, '/strategy create alive');

    const archived = Strategy.reconstitute({
      id: '00000000-0000-4000-a000-000000000060' as StrategyId,
      name: 'dead' as StrategyName,
      status: { tag: 'archived', archivedAt: new Date('2025-01-01') },
      createdAt: new Date('2024-01-01'),
    });
    await deps.repo.save(archived);

    await sendLine(input, '/strategy list');

    const out = getOutput();
    expect(out).toContain('alive');
    expect(out).not.toContain('dead');
  });

  it('/strategy list --all includes archived strategies tagged', async () => {
    const { input, getOutput } = await createTestRepl(deps);

    await sendLine(input, '/strategy create alive');

    const archived = Strategy.reconstitute({
      id: '00000000-0000-4000-a000-000000000070' as StrategyId,
      name: 'dead' as StrategyName,
      status: { tag: 'archived', archivedAt: new Date('2025-01-01') },
      createdAt: new Date('2024-01-01'),
    });
    await deps.repo.save(archived);

    await sendLine(input, '/strategy list --all');

    const out = getOutput();
    expect(out).toContain('alive');
    expect(out).toContain('dead');
    expect(out).toContain('[archived]');
  });

  it('/strategy list shows message when no strategies exist', async () => {
    const { input, getOutput } = await createTestRepl(deps);

    await sendLine(input, '/strategy list');

    const out = getOutput();
    expect(out).toContain('No strategies found');
  });
});

describe('REPL integration: /strategy archive', () => {
  let tmpDir: string;
  let deps: ReplDeps;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-agent-archive-test-'));
    deps = {
      repo: new JsonFileStrategyRepository(path.join(tmpDir, 'strategies.json')),
      config: new JsonFileRuntimeConfig(path.join(tmpDir, 'runtime.json')),
    };
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('/strategy archive refuses the currently-active strategy', async () => {
    const { input, getOutput } = await createTestRepl(deps);

    await sendLine(input, '/strategy create alpha');
    await sendLine(input, '/strategy archive alpha');

    const out = getOutput();
    expect(out).toContain('currently active');
    expect(out).toContain('Switch to another strategy first');
  });

  it('/strategy archive succeeds after switching away', async () => {
    const { input, getOutput } = await createTestRepl(deps);

    await sendLine(input, '/strategy create alpha');
    await sendLine(input, '/strategy create bravo');
    await sendLine(input, '/strategy switch bravo');
    await sendLine(input, '/strategy archive alpha');

    const out = getOutput();
    expect(out).toContain('Strategy "alpha" archived');
  });

  it('/strategy list omits archived, /strategy list --all shows it', async () => {
    const { input, getOutput } = await createTestRepl(deps);

    await sendLine(input, '/strategy create alpha');
    await sendLine(input, '/strategy create bravo');
    await sendLine(input, '/strategy switch bravo');
    await sendLine(input, '/strategy archive alpha');
    await sendLine(input, '/strategy list');

    const afterList = getOutput();
    expect(afterList).toContain('bravo');
    expect(afterList).not.toContain('alpha [archived]');

    await sendLine(input, '/strategy list --all');
    const afterAll = getOutput();
    expect(afterAll).toContain('alpha');
    expect(afterAll).toContain('[archived]');
  });

  it('/strategy archive refuses an already-archived strategy', async () => {
    const { input, getOutput } = await createTestRepl(deps);

    await sendLine(input, '/strategy create alpha');
    await sendLine(input, '/strategy create bravo');
    await sendLine(input, '/strategy switch bravo');
    await sendLine(input, '/strategy archive alpha');
    await sendLine(input, '/strategy archive alpha');

    const out = getOutput();
    expect(out).toContain('Cannot archive');
  });

  it('/strategy archive with --reason stores the reason', async () => {
    const { input, getOutput } = await createTestRepl(deps);

    await sendLine(input, '/strategy create alpha');
    await sendLine(input, '/strategy create bravo');
    await sendLine(input, '/strategy switch bravo');
    await sendLine(input, '/strategy archive alpha --reason pivoting to new market');

    const out = getOutput();
    expect(out).toContain('Strategy "alpha" archived');
  });
});

describe('REPL integration: /strategy rename', () => {
  let tmpDir: string;
  let deps: ReplDeps;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-agent-rename-test-'));
    deps = {
      repo: new JsonFileStrategyRepository(path.join(tmpDir, 'strategies.json')),
      config: new JsonFileRuntimeConfig(path.join(tmpDir, 'runtime.json')),
    };
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('/strategy rename changes the name and list shows new name', async () => {
    const { input, getOutput } = await createTestRepl(deps);

    await sendLine(input, '/strategy create old-name');
    await sendLine(input, '/strategy rename old-name new-name');

    const out = getOutput();
    expect(out).toContain('Renamed: old-name');
    expect(out).toContain('new-name');

    await sendLine(input, '/strategy list');
    const afterList = getOutput();
    expect(afterList).toContain('new-name');
    expect(afterList).not.toContain('old-name (active)');
  });

  it('/strategy rename fails for nonexistent strategy', async () => {
    const { input, getOutput } = await createTestRepl(deps);

    await sendLine(input, '/strategy rename ghost new-name');

    const out = getOutput();
    expect(out).toContain('does not exist');
  });

  it('/strategy rename fails when new name already taken', async () => {
    const { input, getOutput } = await createTestRepl(deps);

    await sendLine(input, '/strategy create alpha');
    await sendLine(input, '/strategy create bravo');
    await sendLine(input, '/strategy rename alpha bravo');

    const out = getOutput();
    expect(out).toContain('already exists');
  });

  it('/strategy rename fails with invalid new name', async () => {
    const { input, getOutput } = await createTestRepl(deps);

    await sendLine(input, '/strategy create good-name');
    await sendLine(input, '/strategy rename good-name B');

    const out = getOutput();
    expect(out).toContain('Invalid strategy name');
  });
});

describe('buildGreeting error surfacing', () => {
  it('surfaces parse/IO errors from repo instead of "No active strategy"', async () => {
    const repoError: RepositoryError = {
      tag: 'RepositoryError',
      kind: 'parse',
      message: 'Unexpected token at position 0',
    };
    const deps: ReplDeps = {
      repo: {
        save: () => Promise.resolve(ok(undefined)),
        loadByName: () => Promise.resolve(err(repoError)),
        loadById: () => Promise.resolve(err(repoError)),
        listAll: () => Promise.resolve(err(repoError)),
      },
      config: {
        getActiveStrategyId: () =>
          Promise.resolve(ok('00000000-0000-4000-a000-000000000001' as StrategyId)),
        setActiveStrategyId: () => Promise.resolve(ok(undefined)),
      },
    };

    const { getOutput } = await createTestRepl(deps);
    const out = getOutput();
    expect(out).toContain('Could not read strategies file');
    expect(out).not.toContain('No active strategy');
  });

  it('shows "No active strategy" only when config has no activeStrategyId', async () => {
    const { getOutput } = await createTestRepl(inMemoryDeps());
    const out = getOutput();
    expect(out).toContain('No active strategy');
  });
});
