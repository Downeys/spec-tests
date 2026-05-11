// CMT4 — Postgres backup. The DB is the source of truth; losing it loses
// everything. Backup = `git push` covers code + wiki, but NOT the database.
//
// Usage: `pnpm backup-db`
//
// Behavior: spawns `docker compose exec -T postgres pg_dump -U <user> -d <db>`
// inside the running postgres container, gzips the output stream on the host,
// and writes to `backup-${VENTURE_NAME}/onebrain-<ISO timestamp>.sql.gz`.
//
// Why through Docker: the user runs Postgres in a container; pg_dump on the
// host wouldn't have the right version anyway (mismatched pg_dump vs server
// versions can fail). Using `docker compose exec` guarantees they match.

import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createGzip } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { config as dotenvConfig } from 'dotenv';

// Same .env-resolution pattern as src/server.ts (works regardless of cwd).
const __script_dir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__script_dir, '..');
dotenvConfig({ path: resolve(projectRoot, '.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  process.stderr.write('backup-db: DATABASE_URL is not set in .env. Aborting.\n');
  process.exit(1);
}

// Parse user + database from DATABASE_URL.
let user: string;
let database: string;
try {
  const u = new URL(databaseUrl);
  user = decodeURIComponent(u.username || '');
  database = u.pathname.replace(/^\//, '');
  if (!user || !database) throw new Error('username or database missing');
} catch (err) {
  process.stderr.write(
    `backup-db: could not parse DATABASE_URL: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
}

const ventureName = process.env.VENTURE_NAME ?? 'unknown-venture';
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = resolve(projectRoot, `backup-${ventureName}`);
const backupPath = resolve(backupDir, `onebrain-${timestamp}.sql.gz`);

await mkdir(backupDir, { recursive: true });

process.stderr.write(
  `backup-db: dumping ${database} as ${user} via 'docker compose exec postgres' → ${backupPath}\n`,
);

// `docker compose exec -T` disables TTY allocation so the stdout pipe stays
// clean for binary data. The pg_dump output is plain SQL; we gzip on the host.
const dumpProcess = spawn(
  'docker',
  ['compose', 'exec', '-T', 'postgres', 'pg_dump', '-U', user, '-d', database, '--no-owner', '--no-privileges'],
  { cwd: projectRoot, stdio: ['ignore', 'pipe', 'inherit'] },
);

const gzip = createGzip();
const fileStream = createWriteStream(backupPath);

dumpProcess.stdout.pipe(gzip).pipe(fileStream);

const dumpExitCode = await new Promise<number>((resolveExit) => {
  dumpProcess.on('exit', (code) => resolveExit(code ?? 1));
});

await new Promise<void>((resolveClose, rejectClose) => {
  fileStream.on('close', () => resolveClose());
  fileStream.on('error', rejectClose);
});

if (dumpExitCode !== 0) {
  process.stderr.write(
    `backup-db: pg_dump exited with code ${dumpExitCode}. Backup may be incomplete: ${backupPath}\n`,
  );
  process.exit(dumpExitCode);
}

process.stderr.write(`backup-db: ok — ${backupPath}\n`);
