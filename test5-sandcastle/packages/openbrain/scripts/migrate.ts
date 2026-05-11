import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { runner } from 'node-pg-migrate';
import { loadOpenBrainConfig } from '../db/config.js';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(SCRIPT_DIR, '..', 'migrations');

type MigrateAction = 'up' | 'status';

async function main(): Promise<void> {
  const action = parseAction(process.argv[2]);
  const cfg = loadOpenBrainConfig();
  const dryRun = action === 'status';

  const applied = await runner({
    databaseUrl: cfg.OPENBRAIN_ADMIN_URL,
    dir: MIGRATIONS_DIR,
    migrationsTable: 'pgmigrations',
    direction: 'up',
    count: Number.POSITIVE_INFINITY,
    checkOrder: true,
    verbose: true,
    singleTransaction: true,
    dryRun,
    log: (msg: string) => {
      console.log(msg);
    },
  });

  if (dryRun) {
    if (applied.length === 0) {
      console.log('OpenBrain migrations: up to date.');
    } else {
      console.log(`OpenBrain migrations pending: ${String(applied.length)}`);
      for (const m of applied) console.log(`  - ${m.name}`);
    }
    return;
  }

  if (applied.length === 0) {
    console.log('OpenBrain migrations: nothing to apply.');
  } else {
    console.log(`OpenBrain migrations: applied ${String(applied.length)}.`);
    for (const m of applied) console.log(`  - ${m.name}`);
  }
}

function parseAction(arg: string | undefined): MigrateAction {
  if (arg === 'up' || arg === undefined) return 'up';
  if (arg === 'status') return 'status';
  throw new Error(`Unknown migrate action: ${String(arg)}. Expected one of: up, status.`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
