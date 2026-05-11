import { embedMissingClaims, reembedAllClaims } from "../../embeddings/pipeline.js";

export interface EmbedMissingArgs {
  batchSize?: number;
}

export async function runEmbedMissing(args: EmbedMissingArgs): Promise<void> {
  const batchSize = args.batchSize ?? 16;
  process.stdout.write(`Embedding missing claims (batch=${batchSize})...\n`);
  const n = await embedMissingClaims({ batchSize });
  process.stdout.write(`Embedded ${n} claim(s).\n`);
}

export interface EmbedAllArgs {
  batchSize?: number;
  yes?: boolean;
}

export async function runEmbedAll(args: EmbedAllArgs): Promise<void> {
  if (!args.yes) {
    process.stderr.write(
      `Refusing to re-embed every claim without --yes (this clears all current embeddings).\n`
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`Re-embedding ALL claims (batch=${args.batchSize ?? 16})...\n`);
  const n = await reembedAllClaims({ batchSize: args.batchSize ?? 16 });
  process.stdout.write(`Embedded ${n} claim(s).\n`);
}
