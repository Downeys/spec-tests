import { describe, it, expect } from 'vitest';
import { ulid } from '@/onebrain/ids';

describe('ulid (DATA-05)', () => {
  it('returns 26-char Crockford base32 string', () => {
    const id = ulid();
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it('returns unique values across 1000 calls', () => {
    const set = new Set<string>();
    for (let i = 0; i < 1000; i++) set.add(ulid());
    expect(set.size).toBe(1000);
  });

  it('successive ULIDs are approximately sorted by creation time', async () => {
    const a = ulid();
    await new Promise((r) => setTimeout(r, 5));
    const b = ulid();
    expect(a < b).toBe(true);
  });
});
