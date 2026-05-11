// src/onebrain/embed.ts
// Voyage 3.5 embedding wrapper. Single named export for vi.mock seam (D-12).
// Vector size pinned to 1024 (matches migration column type per P5).
//
// Voyage SDK signature confirmed against voyageai@0.2.1:
//   class VoyageAIClient (constructor accepts { apiKey })
//   client.embed({ input, model, outputDimension }) -> EmbedResponse with .data[0].embedding
//
// Module loading note: voyageai@0.2.1 ships a broken ESM build (extension-less imports
// that violate NodeNext resolution; tsx fails with ERR_MODULE_NOT_FOUND on api/index.jsx).
// The package's CJS build at dist/cjs/extended/index.js works fine, so we load it via
// createRequire — bypasses the broken `import` exports condition while staying a single
// named export for vi.mock(). Vitest still resolves through its own loader and continues
// to mock @/onebrain/embed, so this change is transparent to the test suite.

import { createRequire } from 'node:module';
import { env } from '@/lib/env.js';

const require = createRequire(import.meta.url);
// Type-only import: pulled in for the type alone (no runtime side-effects).
type VoyageAIClientType = import('voyageai').VoyageAIClient;
// Runtime: resolves voyageai/dist/cjs/extended/index.js (the working build).
const { VoyageAIClient } = require('voyageai') as {
  VoyageAIClient: new (opts: { apiKey: string }) => VoyageAIClientType;
};

export const EMBEDDING_DIMENSION = 1024 as const;
const MODEL = 'voyage-3.5' as const;

let _client: VoyageAIClientType | undefined;
function client(): VoyageAIClientType {
  if (!_client) _client = new VoyageAIClient({ apiKey: env.VOYAGE_API_KEY });
  return _client;
}

/**
 * Generate a 1024-dim embedding for the given text.
 * Truncates input to 4000 chars to cap cost (P5/P23).
 * @throws if Voyage returns wrong dimension (P5 dimension-match guard)
 */
export async function embed(text: string): Promise<number[]> {
  const truncated = text.slice(0, 4000);
  const response = await client().embed({
    input: truncated,
    model: MODEL,
    outputDimension: EMBEDDING_DIMENSION,
  });
  const vector = response.data?.[0]?.embedding;
  if (vector?.length !== EMBEDDING_DIMENSION) {
    throw new Error(
      `Voyage embed mismatch: expected ${EMBEDDING_DIMENSION}d, got ${vector?.length ?? 'none'}`,
    );
  }
  return vector;
}
