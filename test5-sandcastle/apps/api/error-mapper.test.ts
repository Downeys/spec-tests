import { describe, it, expect } from 'vitest';
import { mapUseCaseError } from './error-mapper.js';

describe('mapUseCaseError', () => {
  it('maps NameInvalid to 400 with body', () => {
    const error = { tag: 'NameInvalid' as const, reason: 'too short' };
    const result = mapUseCaseError(error);
    expect(result).toEqual({ status: 400, body: { tag: 'NameInvalid', reason: 'too short' } });
  });

  it('maps StrategyNotFound to 404 with body', () => {
    const error = { tag: 'StrategyNotFound' as const, name: 'ghost' };
    const result = mapUseCaseError(error);
    expect(result).toEqual({ status: 404, body: { tag: 'StrategyNotFound', name: 'ghost' } });
  });

  it('maps StrategyAlreadyExists to 409 with body', () => {
    const error = { tag: 'StrategyAlreadyExists' as const, name: 'dupe' };
    const result = mapUseCaseError(error);
    expect(result).toEqual({ status: 409, body: { tag: 'StrategyAlreadyExists', name: 'dupe' } });
  });

  it('maps StrategyIsArchived to 409 with body', () => {
    const error = { tag: 'StrategyIsArchived' as const, name: 'old' };
    const result = mapUseCaseError(error);
    expect(result).toEqual({ status: 409, body: { tag: 'StrategyIsArchived', name: 'old' } });
  });

  it('maps CannotArchiveActive to 409 with body', () => {
    const error = { tag: 'CannotArchiveActive' as const, name: 'current' };
    const result = mapUseCaseError(error);
    expect(result).toEqual({
      status: 409,
      body: { tag: 'CannotArchiveActive', name: 'current' },
    });
  });

  it('maps IllegalTransition to 409 with body', () => {
    const error = { tag: 'IllegalTransition' as const, reason: 'already archived' };
    const result = mapUseCaseError(error);
    expect(result).toEqual({
      status: 409,
      body: { tag: 'IllegalTransition', reason: 'already archived' },
    });
  });

  it('maps RepositoryError to 500 with body', () => {
    const error = { tag: 'RepositoryError' as const, kind: 'io' as const, message: 'disk full' };
    const result = mapUseCaseError(error);
    expect(result).toEqual({
      status: 500,
      body: { tag: 'RepositoryError', kind: 'io', message: 'disk full' },
    });
  });

  it('maps ConfigError to 500 with body', () => {
    const error = { tag: 'ConfigError' as const, message: 'missing file' };
    const result = mapUseCaseError(error);
    expect(result).toEqual({
      status: 500,
      body: { tag: 'ConfigError', message: 'missing file' },
    });
  });

  it('throws on unknown error tag (exhaustiveness guard)', () => {
    const bogus = { tag: 'BogusTag' } as never;
    expect(() => mapUseCaseError(bogus)).toThrow('Unexpected error tag');
  });
});
