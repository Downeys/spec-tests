import { describe, it, expect } from 'vitest';
import { newStrategyId, StrategyIdSchema } from './strategy-id.js';

describe('StrategyId', () => {
  it('newStrategyId returns a valid UUID', () => {
    const id = newStrategyId();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    expect(id).toMatch(uuidRegex);
  });

  it('generates unique ids', () => {
    const a = newStrategyId();
    const b = newStrategyId();
    expect(a).not.toBe(b);
  });

  it('schema parses valid UUID', () => {
    const result = StrategyIdSchema.safeParse('550e8400-e29b-41d4-a716-446655440000');
    expect(result.success).toBe(true);
  });

  it('schema rejects non-UUID strings', () => {
    const result = StrategyIdSchema.safeParse('not-a-uuid');
    expect(result.success).toBe(false);
  });
});
