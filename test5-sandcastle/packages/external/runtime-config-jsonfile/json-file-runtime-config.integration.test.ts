import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { JsonFileRuntimeConfig } from './json-file-runtime-config.js';
import { isOk, isErr, newStrategyId } from '@bp-agent/domain';

describe('JsonFileRuntimeConfig', () => {
  let tmpDir: string;
  let filePath: string;
  let config: JsonFileRuntimeConfig;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-agent-config-test-'));
    filePath = path.join(tmpDir, 'runtime.json');
    config = new JsonFileRuntimeConfig(filePath);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns null when no file exists', async () => {
    const result = await config.getActiveStrategyId();
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toBeNull();
    }
  });

  it('saves and retrieves active strategy id', async () => {
    const id = newStrategyId();
    const setResult = await config.setActiveStrategyId(id);
    expect(isOk(setResult)).toBe(true);

    const getResult = await config.getActiveStrategyId();
    expect(isOk(getResult)).toBe(true);
    if (isOk(getResult)) {
      expect(getResult.value).toBe(id);
    }
  });

  it('overwrites previous active strategy id', async () => {
    const first = newStrategyId();
    const second = newStrategyId();

    await config.setActiveStrategyId(first);
    await config.setActiveStrategyId(second);

    const result = await config.getActiveStrategyId();
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toBe(second);
    }
  });

  it('auto-creates directories on first write', async () => {
    const nestedPath = path.join(tmpDir, 'deep', 'nested', 'runtime.json');
    const nestedConfig = new JsonFileRuntimeConfig(nestedPath);

    const id = newStrategyId();
    const result = await nestedConfig.setActiveStrategyId(id);
    expect(isOk(result)).toBe(true);
    expect(fs.existsSync(nestedPath)).toBe(true);
  });

  it('returns ConfigError for corrupted file', async () => {
    fs.writeFileSync(filePath, 'not valid json!!!');
    const result = await config.getActiveStrategyId();
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.tag).toBe('ConfigError');
    }
  });

  it('writes schemaVersion 1', async () => {
    const id = newStrategyId();
    await config.setActiveStrategyId(id);

    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as { schemaVersion: number };
    expect(raw.schemaVersion).toBe(1);
  });
});
