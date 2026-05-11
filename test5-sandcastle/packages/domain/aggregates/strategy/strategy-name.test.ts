import { describe, it, expect } from 'vitest';
import { createStrategyName } from './strategy-name.js';
import { isOk, isErr } from '../../dtos/result.js';

describe('StrategyName', () => {
  it('accepts valid slug names', () => {
    const result = createStrategyName('my-strategy');
    expect(isOk(result)).toBe(true);
  });

  it('accepts two-character names', () => {
    const result = createStrategyName('ab');
    expect(isOk(result)).toBe(true);
  });

  it('accepts 64-character names', () => {
    const result = createStrategyName('a'.repeat(64));
    expect(isOk(result)).toBe(true);
  });

  it('accepts alphanumeric with hyphens', () => {
    const result = createStrategyName('my-strategy-2024');
    expect(isOk(result)).toBe(true);
  });

  it('rejects single-character names', () => {
    const result = createStrategyName('a');
    expect(isErr(result)).toBe(true);
  });

  it('rejects names longer than 64 characters', () => {
    const result = createStrategyName('a'.repeat(65));
    expect(isErr(result)).toBe(true);
  });

  it('rejects names with uppercase letters', () => {
    const result = createStrategyName('My-Strategy');
    expect(isErr(result)).toBe(true);
  });

  it('rejects names with whitespace', () => {
    const result = createStrategyName('my strategy');
    expect(isErr(result)).toBe(true);
  });

  it('rejects names with underscores', () => {
    const result = createStrategyName('my_strategy');
    expect(isErr(result)).toBe(true);
  });

  it('rejects names with special characters', () => {
    const result = createStrategyName('my@strategy');
    expect(isErr(result)).toBe(true);
  });

  it('rejects empty strings', () => {
    const result = createStrategyName('');
    expect(isErr(result)).toBe(true);
  });

  it('rejects names starting with a hyphen', () => {
    const result = createStrategyName('-abc');
    expect(isErr(result)).toBe(true);
  });

  it('rejects names ending with a hyphen', () => {
    const result = createStrategyName('abc-');
    expect(isErr(result)).toBe(true);
  });

  it('returns NameInvalid error with reason', () => {
    const result = createStrategyName('BAD NAME!');
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.tag).toBe('NameInvalid');
      expect(result.error.reason).toBeTruthy();
    }
  });
});
