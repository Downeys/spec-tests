import { describe, expect, it } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import type { ProjectId } from '@bp/shared';
import { isReservedNamespace, namespaceFor, RESERVED_NAMESPACES } from './pinecone.js';

describe('isReservedNamespace', () => {
  it('returns true for __wiki__', () => {
    expect(isReservedNamespace('__wiki__')).toBe(true);
  });

  it('returns true for any name starting with __', () => {
    expect(isReservedNamespace('__system')).toBe(true);
    expect(isReservedNamespace('__')).toBe(true);
  });

  it('returns false for a fresh UUID v4', () => {
    expect(isReservedNamespace(uuidv4())).toBe(false);
  });

  it('RESERVED_NAMESPACES exposes __wiki__', () => {
    expect(RESERVED_NAMESPACES.has('__wiki__')).toBe(true);
  });
});

describe('namespaceFor', () => {
  it('returns the projectId verbatim', () => {
    const id = uuidv4() as unknown as ProjectId;
    expect(namespaceFor(id)).toBe(id);
  });
});
