// tests/integration/voyage-live.test.ts (DATA-08)
// Live Voyage API smoke test. Gated by RUN_VOYAGE_TESTS=1 so the regular test
// suite stays green without VOYAGE_API_KEY set.
import { describe, it, expect } from 'vitest';

const RUN = process.env.RUN_VOYAGE_TESTS === '1';

describe.skipIf(!RUN)('Voyage live API (DATA-08)', () => {
  it('returns a 1024-dim vector for valid input', async () => {
    // Dynamic import bypasses any vi.mock from unit suite
    const { embed, EMBEDDING_DIMENSION } = await import('@/onebrain/embed');
    const v = await embed('A test claim about pricing strategy.');
    expect(v).toHaveLength(EMBEDDING_DIMENSION);
    expect(v.every((x) => typeof x === 'number')).toBe(true);
  });
});
