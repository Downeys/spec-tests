import { describe, it, expect } from 'vitest';
import {
  listStrategiesResponse,
  createStrategyResponse,
  switchActiveStrategyResponse,
  patchStrategyResponse,
} from './response-schemas.js';

describe('listStrategiesResponse', () => {
  it('parses a valid response with active and archived items', () => {
    const input = {
      items: [
        { name: 'alpha', status: 'active', isActive: true },
        { name: 'bravo', status: 'archived', isActive: false },
      ],
    };
    const result = listStrategiesResponse.parse(input);
    expect(result).toEqual(input);
  });

  it('parses an empty items list', () => {
    const result = listStrategiesResponse.parse({ items: [] });
    expect(result).toEqual({ items: [] });
  });

  it('rejects an item with invalid status', () => {
    expect(() =>
      listStrategiesResponse.parse({
        items: [{ name: 'bad', status: 'unknown', isActive: false }],
      }),
    ).toThrow();
  });

  it('rejects missing isActive field', () => {
    expect(() =>
      listStrategiesResponse.parse({
        items: [{ name: 'bad', status: 'active' }],
      }),
    ).toThrow();
  });

  it('rejects missing items key', () => {
    expect(() => listStrategiesResponse.parse({})).toThrow();
  });
});

describe('createStrategyResponse', () => {
  it('parses a valid response', () => {
    const input = { strategy: { name: 'alpha', status: 'active', isActive: true } };
    expect(createStrategyResponse.parse(input)).toEqual(input);
  });

  it('rejects missing isActive', () => {
    expect(() =>
      createStrategyResponse.parse({ strategy: { name: 'alpha', status: 'active' } }),
    ).toThrow();
  });
});

describe('switchActiveStrategyResponse', () => {
  it('parses a valid response', () => {
    const input = { strategy: { name: 'bravo' } };
    expect(switchActiveStrategyResponse.parse(input)).toEqual(input);
  });

  it('rejects missing name', () => {
    expect(() => switchActiveStrategyResponse.parse({ strategy: {} })).toThrow();
  });
});

describe('patchStrategyResponse', () => {
  it('parses a valid response', () => {
    const input = { strategy: { name: 'renamed', status: 'active' } };
    expect(patchStrategyResponse.parse(input)).toEqual(input);
  });

  it('rejects invalid status', () => {
    expect(() =>
      patchStrategyResponse.parse({ strategy: { name: 'x', status: 'unknown' } }),
    ).toThrow();
  });
});
