import { describe, it, expect } from 'vitest';
import {
  listStrategiesQuery,
  createStrategyRequest,
  switchActiveStrategyRequest,
  patchStrategyRequest,
} from './request-schemas.js';

describe('listStrategiesQuery', () => {
  it('defaults all to false when omitted', () => {
    const result = listStrategiesQuery.parse({});
    expect(result).toEqual({ all: false });
  });

  it('parses all=true as boolean true', () => {
    const result = listStrategiesQuery.parse({ all: 'true' });
    expect(result).toEqual({ all: true });
  });

  it('parses all=false as boolean false', () => {
    const result = listStrategiesQuery.parse({ all: 'false' });
    expect(result).toEqual({ all: false });
  });

  it('rejects unexpected query params', () => {
    expect(() => listStrategiesQuery.parse({ all: 'true', extra: 'nope' })).toThrow();
  });
});

describe('createStrategyRequest', () => {
  it('parses a valid body', () => {
    expect(createStrategyRequest.parse({ name: 'my-strat' })).toEqual({ name: 'my-strat' });
  });

  it('rejects extra fields', () => {
    expect(() => createStrategyRequest.parse({ name: 'ok', extra: 'nope' })).toThrow();
  });

  it('rejects missing name', () => {
    expect(() => createStrategyRequest.parse({})).toThrow();
  });
});

describe('switchActiveStrategyRequest', () => {
  it('parses a valid body', () => {
    expect(switchActiveStrategyRequest.parse({ name: 'alpha' })).toEqual({ name: 'alpha' });
  });

  it('rejects extra fields', () => {
    expect(() => switchActiveStrategyRequest.parse({ name: 'ok', extra: 'nope' })).toThrow();
  });
});

describe('patchStrategyRequest', () => {
  it('parses rename body', () => {
    expect(patchStrategyRequest.parse({ newName: 'beta' })).toEqual({ newName: 'beta' });
  });

  it('parses archive body without reason', () => {
    expect(patchStrategyRequest.parse({ archived: true })).toEqual({ archived: true });
  });

  it('parses archive body with reason', () => {
    expect(patchStrategyRequest.parse({ archived: true, reason: 'pivoting' })).toEqual({
      archived: true,
      reason: 'pivoting',
    });
  });

  it('rejects body with both newName and archived', () => {
    expect(() => patchStrategyRequest.parse({ newName: 'beta', archived: true })).toThrow();
  });

  it('rejects empty body', () => {
    expect(() => patchStrategyRequest.parse({})).toThrow();
  });

  it('rejects archived: false', () => {
    expect(() => patchStrategyRequest.parse({ archived: false })).toThrow();
  });

  it('rejects extra fields on rename', () => {
    expect(() => patchStrategyRequest.parse({ newName: 'ok', extra: 'nope' })).toThrow();
  });
});
