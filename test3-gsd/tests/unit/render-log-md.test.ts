import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { appendLogEntry, resetLog } from '@/compilation/render/log-md';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

let tmpDir: string;
beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'log-md-test-'));
});
afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('appendLogEntry (COMP-04, D-17)', () => {
  it('creates log.md with the correct prefix when missing', async () => {
    await appendLogEntry(
      tmpDir,
      'compile',
      'wrote 1 page',
      new Date('2026-04-25T14:32:00Z'),
    );
    const content = await fs.readFile(path.join(tmpDir, 'log.md'), 'utf-8');
    expect(content).toMatch(/^## \[2026-04-25 14:32\] compile \| wrote 1 page\n$/);
  });

  it('appends without truncating', async () => {
    await appendLogEntry(tmpDir, 'ingest', 'first');
    await appendLogEntry(tmpDir, 'compile', 'second');
    const content = await fs.readFile(path.join(tmpDir, 'log.md'), 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/ingest \| first$/);
    expect(lines[1]).toMatch(/compile \| second$/);
  });

  it('handles all three kinds (D-17)', async () => {
    await appendLogEntry(tmpDir, 'ingest', 'i');
    await appendLogEntry(tmpDir, 'compile', 'c');
    await appendLogEntry(tmpDir, 'reset', 'r');
    const content = await fs.readFile(path.join(tmpDir, 'log.md'), 'utf-8');
    expect(content).toMatch(/ingest/);
    expect(content).toMatch(/compile/);
    expect(content).toMatch(/reset/);
  });
});

describe('resetLog (D-07/D-17 — wipes on db reset)', () => {
  it('removes log.md if exists', async () => {
    await appendLogEntry(tmpDir, 'compile', 'x');
    await resetLog(tmpDir);
    await expect(fs.access(path.join(tmpDir, 'log.md'))).rejects.toThrow();
  });

  it('is no-op when log.md absent', async () => {
    await expect(resetLog(tmpDir)).resolves.toBeUndefined();
  });
});
