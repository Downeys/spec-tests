import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { rm, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { platform } from "node:os";
import { getPool } from "../../db/pool.js";
import { env } from "../../db/env.js";

const exec = promisify(execFile);

export type ResetTarget = "db" | "vault" | "all";

export interface ResetCmdInput {
  target: ResetTarget;
  vaultPath: string;
  yes: boolean;
  snapshot?: string;
  confirmInput?: string;
}

const APP_TABLES = [
  "messages",
  "conversations",
  "claim_tags",
  "relations",
  "claims",
  "tags",
  "sources",
  "compilation_runs"
];

const VAULT_GENERATED_FILES = [
  "sources.md",
  "index.md",
  "log.md",
  "contradictions.md"
];

const VAULT_GENERATED_DIRS = ["concepts"];

function normalizeTarget(s: string | undefined): ResetTarget | null {
  const v = (s ?? "").trim().toLowerCase();
  if (v === "db" || v === "vault" || v === "all") return v;
  return null;
}

// Convert Windows path to POSIX path for compatibility with tar and other POSIX tools
function toPosixPath(p: string): string {
  if (platform() !== "win32") return p;
  // C:\path\to\dir -> /c/path/to/dir
  const driveMatch = p.match(/^([a-zA-Z]):(.*)$/);
  if (driveMatch) {
    const drive = driveMatch[1]!;
    const rest = driveMatch[2]!;
    return `/${drive.toLowerCase()}${rest.replace(/\\/g, "/")}`;
  }
  return p.replace(/\\/g, "/");
}

export async function resetCmd(input: ResetCmdInput): Promise<void> {
  if (!input.yes) {
    const got = normalizeTarget(input.confirmInput);
    if (got !== input.target) {
      throw new Error(
        `Reset aborted: confirmation does not match target '${input.target}'`
      );
    }
  }

  if (input.snapshot) {
    await snapshotVault(input.vaultPath, input.snapshot);
    await snapshotDatabase(input.snapshot);
  }

  if (input.target === "db" || input.target === "all") {
    await getPool().query(
      `TRUNCATE TABLE ${APP_TABLES.join(", ")} RESTART IDENTITY CASCADE`
    );
  }
  if (input.target === "vault" || input.target === "all") {
    await wipeVaultGenerated(input.vaultPath);
  }
}

async function wipeVaultGenerated(vaultPath: string): Promise<void> {
  for (const f of VAULT_GENERATED_FILES) {
    await rm(join(vaultPath, f), { force: true });
  }
  for (const dir of VAULT_GENERATED_DIRS) {
    let entries: string[] = [];
    try {
      entries = await readdir(join(vaultPath, dir));
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e === ".gitkeep") continue;
      await rm(join(vaultPath, dir, e), { force: true, recursive: true });
    }
  }
  await rm(join(vaultPath, ".compile.lock"), { force: true });
}

async function snapshotVault(
  vaultPath: string,
  snapshotPrefix: string
): Promise<void> {
  try {
    await stat(vaultPath);
  } catch {
    return;
  }
  const tarPath = `${snapshotPrefix}.vault.tar`;
  // Convert to POSIX paths for tar compatibility on Windows
  const posixVaultPath = toPosixPath(vaultPath);
  const posixTarPath = toPosixPath(tarPath);
  await exec("tar", ["-cf", posixTarPath, "-C", posixVaultPath, "."]);
}

async function snapshotDatabase(snapshotPrefix: string): Promise<void> {
  const dumpPath = `${snapshotPrefix}.db.sql`;
  // Use docker compose exec to run pg_dump inside the postgres container.
  // -T disables TTY so output can be redirected to a file.
  const { stdout } = await exec("docker", [
    "compose",
    "exec",
    "-T",
    "postgres",
    "pg_dump",
    "-U",
    "postgres",
    "--no-owner",
    "business_plan"
  ], { maxBuffer: 100 * 1024 * 1024 });
  await writeFile(dumpPath, stdout);
}
