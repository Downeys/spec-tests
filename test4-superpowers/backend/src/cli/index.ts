#!/usr/bin/env node
import { cac } from "cac";
import { closePool } from "../db/pool.js";
import { showSource, showClaim } from "./commands/show.js";
import { ingestSource } from "./commands/ingest.js";
import {
  addClaimCmd,
  tagClaimCmd,
  addRelationCmd,
  setClaimStatusCmd
} from "./commands/mutate.js";
import { compileCmd } from "./commands/compile.js";
import { lintCmd } from "./commands/lint.js";
import { resetCmd, type ResetTarget } from "./commands/reset.js";
import { runEmbedMissing, runEmbedAll } from "./commands/embed.js";
import { runServe } from "./commands/serve.js";
import { createInterface } from "node:readline/promises";
import { env } from "../db/env.js";
import {
  type ClaimStatus,
  type ClaimType,
  type RelationType
} from "../openbrain/types.js";

const cli = cac("business-plan-cli");

cli.command("show-source <idOrHash>", "Print full source content").action(
  async (idOrHash: string) => {
    console.log(await showSource(idOrHash));
  }
);

cli.command("show-claim <id>", "Print claim with full provenance").action(
  async (id: string) => {
    console.log(await showClaim(id));
  }
);

cli
  .command("ingest-source <path>", "Ingest a source from JSON or markdown")
  .action(async (path: string) => {
    const s = await ingestSource(path);
    console.log(`Ingested: ${s.id} (${s.title})`);
  });

cli
  .command(
    "add-claim",
    "Create a claim. Use --statement and --type."
  )
  .option("--statement <text>", "Claim statement")
  .option("--type <type>", "finding|hypothesis|decision|observation|estimate")
  .option("--source <id>", "Optional source id")
  .option("--excerpt <text>", "Optional source excerpt")
  .option("--locator <text>", "Optional source locator")
  .option("--confidence <n>", "Optional confidence 0-100")
  .action(
    async (opts: {
      statement: string;
      type: ClaimType;
      source?: string;
      excerpt?: string;
      locator?: string;
      confidence?: string;
    }) => {
      const claim = await addClaimCmd({
        statement: opts.statement,
        type: opts.type,
        sourceId: opts.source ?? null,
        ...(opts.excerpt !== undefined && { sourceExcerpt: opts.excerpt }),
        ...(opts.locator !== undefined && { sourceLocator: opts.locator }),
        ...(opts.confidence !== undefined && { confidence: Number(opts.confidence) })
      });
      console.log(`Created claim: ${claim.id}`);
    }
  );

cli
  .command("tag-claim <claimId> <tagSlug>", "Add a tag to a claim")
  .action(async (claimId: string, tagSlug: string) => {
    await tagClaimCmd(claimId, tagSlug);
    console.log(`Tagged claim ${claimId} with ${tagSlug}`);
  });

cli
  .command(
    "add-relation <from> <to> <type>",
    "Add a relation between two claims"
  )
  .option("--note <text>", "Optional note")
  .action(async (from: string, to: string, type: RelationType, opts: { note?: string }) => {
    const rel = await addRelationCmd(from, to, type, opts.note);
    console.log(`Created relation: ${rel.id}`);
  });

cli
  .command(
    "set-claim-status <id> <status>",
    "Promote or retire a claim"
  )
  .option("--reason <text>", "Required for validated/refuted/superseded")
  .action(
    async (id: string, status: ClaimStatus, opts: { reason?: string }) => {
      const updated = await setClaimStatusCmd(id, status, opts.reason ?? "");
      console.log(`${updated.id} -> ${updated.status}`);
    }
  );

cli
  .command("compile", "Run the compilation agent")
  .option("--vault <path>", "Override vault path")
  .action(async (opts: { vault?: string }) => {
    const result = await compileCmd({ vaultPath: opts.vault ?? env.vaultPath });
    console.log(
      `compile: written=${result.written.length} skipped=${result.skipped.length} run=${result.run.id}`
    );
    for (const p of result.written) console.log(`  + ${p}`);
  });

cli
  .command("lint", "Lint the vault and DB")
  .option("--vault <path>", "Override vault path")
  .option("--json", "Emit JSON")
  .action(async (opts: { vault?: string; json?: boolean }) => {
    const result = await lintCmd({
      vaultPath: opts.vault ?? env.vaultPath,
      json: !!opts.json
    });
    if (opts.json) {
      console.log(result.json);
    } else {
      process.stdout.write(result.text);
    }
    process.exitCode = result.exitCode;
  });

cli
  .command("reset", "Wipe dev data (db, vault, or both)")
  .option("--db", "Wipe DB tables only")
  .option("--vault", "Wipe generated vault pages only")
  .option("--all", "Wipe both")
  .option("--snapshot <prefix>", "Write vault tarball + db dump before resetting")
  .option("--yes", "Skip confirmation")
  .action(
    async (opts: {
      db?: boolean;
      vault?: boolean;
      all?: boolean;
      snapshot?: string;
      yes?: boolean;
    }) => {
      const flags = [opts.db, opts.vault, opts.all].filter(Boolean).length;
      if (flags !== 1) {
        throw new Error("Specify exactly one of --db, --vault, --all");
      }
      const target: ResetTarget = opts.all ? "all" : opts.vault ? "vault" : "db";

      let confirmInput: string | undefined;
      if (!opts.yes) {
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        confirmInput = await rl.question(
          `Type the literal target to confirm reset (${target}): `
        );
        rl.close();
      }
      await resetCmd({
        target,
        vaultPath: env.vaultPath,
        yes: !!opts.yes,
        ...(opts.snapshot !== undefined && { snapshot: opts.snapshot }),
        ...(confirmInput !== undefined && { confirmInput })
      });
      console.log(`reset --${target} complete`);
    }
  );

cli
  .command("embed-missing", "Embed claims with missing embeddings")
  .option("--batch-size <n>", "Batch size", { default: 16 })
  .action(async (opts: { batchSize: number }) => {
    await runEmbedMissing({ batchSize: Number(opts.batchSize) });
  });

cli
  .command("embed-all", "Re-embed every claim (destructive — requires --yes)")
  .option("--batch-size <n>", "Batch size", { default: 16 })
  .option("--yes", "Confirm destructive operation")
  .action(async (opts: { batchSize: number; yes?: boolean }) => {
    await runEmbedAll({ batchSize: Number(opts.batchSize), yes: !!opts.yes });
  });

cli
  .command("serve", "Start the backend HTTP service")
  .option("--host <host>", "Bind interface (default 127.0.0.1; use 0.0.0.0 to expose on LAN)")
  .action(async (opts: { host?: string }) => {
    await runServe(opts.host !== undefined ? { host: opts.host } : {});
  });

cli.help();
cli.version("0.0.0");

(async () => {
  try {
    cli.parse(process.argv, { run: false });
    await cli.runMatchedCommand();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`error: ${message}`);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
})();
