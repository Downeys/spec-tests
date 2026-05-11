import { createVoyageProvider } from "./voyage.js";
import { type EmbeddingProvider, EmbeddingError } from "./types.js";

export { type EmbeddingProvider, EmbeddingError };

let cached: EmbeddingProvider | undefined;

export function getEmbeddingProvider(): EmbeddingProvider {
  if (cached) return cached;
  const apiKey = process.env.VOYAGE_API_KEY;
  const model = process.env.VOYAGE_MODEL ?? "voyage-3";
  if (!apiKey) {
    throw new EmbeddingError("VOYAGE_API_KEY is not set");
  }
  cached = createVoyageProvider({ apiKey, model });
  return cached;
}

// Test seam: allow injecting a fake provider
export function setEmbeddingProvider(p: EmbeddingProvider | undefined): void {
  cached = p;
}
