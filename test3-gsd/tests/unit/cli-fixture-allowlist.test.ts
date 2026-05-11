import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ingest } from '@/cli/commands/ingest';

describe('ingest --fixture allowlist (D-08 security)', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // process.exit is mocked to throw so we can assert it was called
    exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((code?: number | string | null | undefined) => {
        throw new Error(`process.exit(${code ?? 0})`);
      }) as ReturnType<typeof vi.spyOn>;
    stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true) as ReturnType<typeof vi.spyOn>;
  });
  afterEach(() => {
    exitSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it('rejects an unknown fixture name with available list (no path lookup attempted)', async () => {
    await expect(ingest(undefined, { fixture: 'does-not-exist' })).rejects.toThrow(
      /process\.exit\(1\)/,
    );
    const calls = stderrSpy.mock.calls.flat().join('');
    expect(calls).toContain("Unknown fixture 'does-not-exist'");
    expect(calls).toContain('strategic-positioning');
  });

  it('rejects path-traversal attempts as unknown fixture', async () => {
    await expect(
      ingest(undefined, { fixture: '../../../etc/passwd' }),
    ).rejects.toThrow(/process\.exit\(1\)/);
    const calls = stderrSpy.mock.calls.flat().join('');
    expect(calls).toContain('Unknown fixture');
  });

  it('rejects empty fixture name', async () => {
    await expect(ingest(undefined, { fixture: '' })).rejects.toThrow(
      /process\.exit\(1\)/,
    );
  });

  it('rejects when neither --fixture nor positional input is provided', async () => {
    await expect(ingest(undefined, {})).rejects.toThrow(/process\.exit\(1\)/);
    const calls = stderrSpy.mock.calls.flat().join('');
    expect(calls).toContain('Missing --fixture');
  });
});
