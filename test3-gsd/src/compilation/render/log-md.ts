// src/compilation/render/log-md.ts
// D-17: log.md is append-only with `## [YYYY-MM-DD HH:MM] <kind> | <summary>` prefix.
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export type LogKind = 'ingest' | 'compile' | 'reset';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function timestamp(d: Date = new Date()): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export async function appendLogEntry(
  vaultPath: string,
  kind: LogKind,
  summary: string,
  when: Date = new Date(),
): Promise<void> {
  await fs.mkdir(vaultPath, { recursive: true });
  const logPath = path.join(vaultPath, 'log.md');
  const entry = `## [${timestamp(when)}] ${kind} | ${summary}\n`;
  await fs.appendFile(logPath, entry, 'utf-8');
}

export async function resetLog(vaultPath: string): Promise<void> {
  const logPath = path.join(vaultPath, 'log.md');
  try {
    await fs.unlink(logPath);
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
}
