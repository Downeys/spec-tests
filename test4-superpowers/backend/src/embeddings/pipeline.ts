import { getPool } from "../db/pool.js";
import { getEmbeddingProvider } from "./index.js";

function vectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}

export async function embedClaim(claimId: string): Promise<void> {
  const pool = getPool();
  const result = await pool.query<{ statement: string }>(
    `SELECT statement FROM claims WHERE id=$1`,
    [claimId]
  );
  if (result.rows.length === 0) return;
  const statement = result.rows[0]!.statement;

  const provider = getEmbeddingProvider();
  const [vec] = await provider.embed([statement]);
  if (!vec) return;

  await pool.query(
    `UPDATE claims
       SET embedding = $2::vector,
           embedded_at = now(),
           embedding_model = $3
     WHERE id = $1`,
    [claimId, vectorLiteral(vec), provider.model]
  );
}

export interface EmbedMissingOptions {
  batchSize?: number;
}

export async function embedMissingClaims(
  opts: EmbedMissingOptions = {}
): Promise<number> {
  const batchSize = opts.batchSize ?? 16;
  const pool = getPool();
  const provider = getEmbeddingProvider();
  let processed = 0;

  while (true) {
    const batch = await pool.query<{ id: string; statement: string }>(
      `SELECT id, statement FROM claims
        WHERE embedding IS NULL
        ORDER BY created_at ASC
        LIMIT $1`,
      [batchSize]
    );
    if (batch.rows.length === 0) break;

    const vectors = await provider.embed(batch.rows.map((r) => r.statement));
    for (let i = 0; i < batch.rows.length; i++) {
      const row = batch.rows[i]!;
      const vec = vectors[i];
      if (!vec) continue;
      await pool.query(
        `UPDATE claims SET embedding=$2::vector, embedded_at=now(), embedding_model=$3 WHERE id=$1`,
        [row.id, vectorLiteral(vec), provider.model]
      );
      processed++;
    }
    if (batch.rows.length < batchSize) break;
  }

  return processed;
}

export async function reembedAllClaims(
  opts: EmbedMissingOptions = {}
): Promise<number> {
  const pool = getPool();
  await pool.query(
    `UPDATE claims SET embedding=NULL, embedded_at=NULL, embedding_model=NULL`
  );
  return embedMissingClaims(opts);
}
