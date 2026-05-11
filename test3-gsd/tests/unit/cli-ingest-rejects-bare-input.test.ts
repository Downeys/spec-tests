import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ingest } from '@/cli/commands/ingest';

describe('ingest bare positional input rejection (D-08)', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
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

  it('rejects a bare URL with a Phase 2 hint (D-08)', async () => {
    await expect(ingest('https://example.com/article', {})).rejects.toThrow(
      /process\.exit\(1\)/,
    );
    const calls = stderrSpy.mock.calls.flat().join('');
    expect(calls).toContain('Bare URL/file input is not supported in Phase 1');
    expect(calls).toContain('Phase 2');
    expect(calls).toContain('--fixture');
  });

  it('rejects a bare file path with a Phase 2 hint (D-08)', async () => {
    await expect(ingest('./some/file.md', {})).rejects.toThrow(
      /process\.exit\(1\)/,
    );
    const calls = stderrSpy.mock.calls.flat().join('');
    expect(calls).toContain('Bare URL/file input is not supported');
  });
});
