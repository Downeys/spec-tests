// src/lib/hash.ts
// Canonical content hash for diff-based recompile (COMP-07).
// Excludes volatile fields (generated_at, compile_run_id, content_hash).
// Sorts frontmatter keys before hashing for stability across re-renders (D-18).

import { createHash } from 'node:crypto';

// Volatile = derived from when the compile ran, NOT from the underlying OneBrain rows.
// `stale` is volatile because it's computed from generated_at vs last_evidence_at; including
// it in the hash would break determinism whenever a compile crosses the staleness boundary
// (CRIT-04 staleness flag is for human display, not part of the canonical content identity).
const VOLATILE_FIELDS = new Set([
  'generated_at',
  'compile_run_id',
  'content_hash',
  'stale',
]);

export function hashCanonical(frontmatter: Record<string, unknown>, body: string): string {
  // Strip volatile fields before hashing
  const stable: Record<string, unknown> = {};
  for (const key of Object.keys(frontmatter).sort()) {
    // sort for key-order stability
    if (!VOLATILE_FIELDS.has(key)) stable[key] = frontmatter[key];
  }
  // Canonical JSON serialization (sorted keys, no whitespace variance) + body
  const canonical = JSON.stringify(stable) + '\n---\n' + body.trimEnd();
  return 'sha256:' + createHash('sha256').update(canonical).digest('hex');
}

/** Hash raw source text for dedupe (D-04). Returns hex without prefix. */
export function hashRawText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}
