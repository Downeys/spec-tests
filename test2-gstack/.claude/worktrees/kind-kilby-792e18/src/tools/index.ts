// Tool registry. Each Phase-N agent adds its tool here; the server walks
// this array and registers everything at startup. Keeping the list in one
// place means adding a tool is a one-line edit, not a multi-file dance.
//
// Conflict note (parallelization): if two parallel agents add tools at the
// same time, they may both touch this file. Resolution is trivial — both
// imports + both array entries. No real merge work.

import type { RegisteredTool } from '../lib/define-tool.js';
import { ping } from './ping.js';
import { tavilySearch } from './tavily-search.js';
import { storeEntry } from './store-entry.js';
import { queryEntries } from './query-entries.js';
import { getEntry } from './get-entry.js';
import { addUserObservation } from './add-user-observation.js';
import { traverseProvenance } from './traverse-provenance.js';
import { flagContradiction } from './flag-contradiction.js';
import { verifyCriticalPosture } from './verify-critical-posture.js';
import { fetchAndArchive } from './fetch-and-archive.js';
import { compileWiki } from './compile-wiki.js';

export const tools: RegisteredTool[] = [
  ping,
  // Phase 1 — landed.
  tavilySearch,
  storeEntry,
  queryEntries,
  getEntry,
  // Phase 2 — landed.
  addUserObservation,
  traverseProvenance,
  flagContradiction,
  verifyCriticalPosture,
  fetchAndArchive,
  // Phase 3 — landed.
  compileWiki,
];
