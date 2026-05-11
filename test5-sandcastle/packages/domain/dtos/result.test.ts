import { describe, it, expect } from 'vitest';
import { ok, err, isOk, isErr } from './result.js';

describe('Result', () => {
  describe('ok', () => {
    it('creates a tagged ok value', () => {
      const result = ok(42);
      expect(result).toEqual({ tag: 'ok', value: 42 });
    });

    it('preserves complex values', () => {
      const value = { name: 'test', items: [1, 2, 3] };
      const result = ok(value);
      expect(result.tag).toBe('ok');
      expect(result).toEqual({ tag: 'ok', value });
    });
  });

  describe('err', () => {
    it('creates a tagged err value', () => {
      const result = err('something went wrong');
      expect(result).toEqual({ tag: 'err', error: 'something went wrong' });
    });

    it('preserves error objects', () => {
      const error = { code: 'NOT_FOUND', message: 'missing' };
      const result = err(error);
      expect(result.tag).toBe('err');
      expect(result).toEqual({ tag: 'err', error });
    });
  });

  describe('isOk', () => {
    it('returns true for ok values', () => {
      expect(isOk(ok(1))).toBe(true);
    });

    it('returns false for err values', () => {
      expect(isOk(err('fail'))).toBe(false);
    });
  });

  describe('isErr', () => {
    it('returns true for err values', () => {
      expect(isErr(err('fail'))).toBe(true);
    });

    it('returns false for ok values', () => {
      expect(isErr(ok(1))).toBe(false);
    });
  });
});
