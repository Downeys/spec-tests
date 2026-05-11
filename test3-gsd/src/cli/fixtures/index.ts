// src/cli/fixtures/index.ts
// D-08/D-10: fixtures live in src/cli/fixtures/. The exported FIXTURES object is the
// ONLY way to load a fixture by name (security: prevents path traversal — only registry keys are valid).

import type { NewSource, NewClaim, NewEntity } from '@/onebrain/types.js';
import { fixture as strategicPositioning } from './strategic-positioning.js';

/**
 * A test fixture (D-10/D-11): one source + claims + edges + entities.
 * Edges use `localId` references because real ULIDs are minted at write time
 * (the loader rewrites localIds → ULIDs as it walks the fixture in dependency order).
 */
export interface Fixture {
  slug: string;
  source: Omit<NewSource, 'id'>;
  entities: Array<Omit<NewEntity, 'id'> & { localId: string }>;
  claims: Array<Omit<NewClaim, 'id'> & { localId: string }>;
  edges: Array<{
    kind: 'cites_source' | 'about_entity' | 'contradicts';
    fromLocalId: string;
    toLocalRef: { kind: 'source' | 'entity' | 'claim'; localId: string };
    weight?: number;
  }>;
}

export const FIXTURES = Object.freeze({
  'strategic-positioning': strategicPositioning,
} as const);

export type FixtureName = keyof typeof FIXTURES;

/** Allowlist check used by `bsp ingest --fixture <name>`. Returns the fixture or undefined. */
export function getFixture(name: string): Fixture | undefined {
  // Plain object-key lookup; if `name` is not a literal key, returns undefined.
  // We do NOT use dynamic import / fs / path operations — only registry keys are valid.
  return Object.prototype.hasOwnProperty.call(FIXTURES, name)
    ? FIXTURES[name as FixtureName]
    : undefined;
}

export function listFixtures(): string[] {
  return Object.keys(FIXTURES);
}
