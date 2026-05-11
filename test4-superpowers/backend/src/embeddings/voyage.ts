import { VoyageAIClient } from "./voyage-client.js";
import { type EmbeddingProvider, EmbeddingError } from "./types.js";

const MODEL_DIMS: Record<string, number> = {
  "voyage-3": 1024,
  "voyage-3-large": 2048,
  "voyage-3-lite": 512
};

export interface VoyageOptions {
  apiKey: string;
  model: string;
}

export function createVoyageProvider(opts: VoyageOptions): EmbeddingProvider {
  const dimensions = MODEL_DIMS[opts.model];
  if (!dimensions) {
    throw new EmbeddingError(`Unknown Voyage model: ${opts.model}`);
  }
  const client = new VoyageAIClient({ apiKey: opts.apiKey });

  return {
    model: opts.model,
    dimensions,
    async embed(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) return [];
      let resp;
      try {
        resp = await client.embed({ input: texts, model: opts.model });
      } catch (err) {
        throw new EmbeddingError("Voyage call failed", err);
      }
      const rawVectors = resp.data?.map((d) => d.embedding) ?? [];
      const vectors: number[][] = [];
      for (const v of rawVectors) {
        if (!Array.isArray(v) || v.length !== dimensions) {
          throw new EmbeddingError(
            `Voyage returned malformed embedding (expected ${dimensions} dims, got ${v?.length ?? "n/a"})`
          );
        }
        for (const n of v) {
          if (!Number.isFinite(n)) {
            throw new EmbeddingError("Voyage returned a non-finite embedding value");
          }
        }
        vectors.push(v);
      }
      return vectors;
    }
  };
}
