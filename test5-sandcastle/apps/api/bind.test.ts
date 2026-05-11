import { describe, it, expect } from 'vitest';
import { validateHost } from './bind.js';

describe('validateHost', () => {
  it('accepts 127.0.0.1', () => {
    const result = validateHost('127.0.0.1');
    expect(result).toEqual({ tag: 'ok', value: '127.0.0.1' });
  });

  it('accepts localhost', () => {
    const result = validateHost('localhost');
    expect(result).toEqual({ tag: 'ok', value: 'localhost' });
  });

  it('rejects 0.0.0.0 with a typed error', () => {
    const result = validateHost('0.0.0.0');
    expect(result).toEqual({
      tag: 'err',
      error: {
        tag: 'HostNotAllowed',
        host: '0.0.0.0',
      },
    });
  });

  it('rejects an arbitrary host', () => {
    const result = validateHost('192.168.1.1');
    expect(result).toEqual({
      tag: 'err',
      error: {
        tag: 'HostNotAllowed',
        host: '192.168.1.1',
      },
    });
  });
});
