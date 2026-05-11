// Integration tests for verify_critical_posture (A5). No DB needed —
// the tool only reads process.env. Tests mutate CRITICAL_POSTURE_SENTINEL
// per case and restore the original value in afterAll so other suites
// aren't polluted.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { verifyCriticalPosture } from '../../src/tools/verify-critical-posture.js';

const ENV_KEY = 'CRITICAL_POSTURE_SENTINEL';

let originalSentinel: string | undefined;

beforeAll(() => {
  originalSentinel = process.env[ENV_KEY];
});

afterAll(() => {
  if (originalSentinel === undefined) {
    delete process.env[ENV_KEY];
  } else {
    process.env[ENV_KEY] = originalSentinel;
  }
});

beforeEach(() => {
  delete process.env[ENV_KEY];
});

interface PostureResponse {
  sentinel: string | null;
  configured: boolean;
  hint: string;
}

function parseSuccess(
  result: Awaited<ReturnType<typeof verifyCriticalPosture.invoke>>,
): PostureResponse {
  if ('isError' in result) {
    throw new Error(`expected success, got error: ${result.content[0]?.text}`);
  }
  const text = result.content[0]?.text ?? '';
  return JSON.parse(text) as PostureResponse;
}

describe('verify_critical_posture', () => {
  it('sentinel set: returns the value, configured=true, agent-match hint', async () => {
    process.env[ENV_KEY] = 'test-sentinel-xyz';

    const parsed = parseSuccess(await verifyCriticalPosture.invoke({}));

    expect(parsed.sentinel).toBe('test-sentinel-xyz');
    expect(parsed.configured).toBe(true);
    expect(parsed.hint).toMatch(/ONEBRAIN-CRITICAL-POSTURE\.md/);
  });

  it('sentinel unset: returns null, configured=false, setup hint', async () => {
    // beforeEach already deleted the var, but assert it for clarity.
    expect(process.env[ENV_KEY]).toBeUndefined();

    const parsed = parseSuccess(await verifyCriticalPosture.invoke({}));

    expect(parsed.sentinel).toBeNull();
    expect(parsed.configured).toBe(false);
    expect(parsed.hint).toMatch(/not set/);
    expect(parsed.hint).toMatch(/ONEBRAIN-CRITICAL-POSTURE\.md/);
  });

  it('sentinel set to empty string: treated as unset (configured=false)', async () => {
    process.env[ENV_KEY] = '';

    const parsed = parseSuccess(await verifyCriticalPosture.invoke({}));

    expect(parsed.sentinel).toBeNull();
    expect(parsed.configured).toBe(false);
    expect(parsed.hint).toMatch(/not set/);
  });
});
