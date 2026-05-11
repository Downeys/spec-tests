// src/compilation/vault-writer.ts
// Atomic file writes with content-hash diff (PITFALLS P14: don't roundtrip; full overwrite).

import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import matter from 'gray-matter';

export async function writeIfChanged(
  filePath: string,
  markdown: string,
  expectedHash: string,
): Promise<{ written: boolean }> {
  await fs.mkdir(dirname(filePath), { recursive: true });

  try {
    const existing = await fs.readFile(filePath, 'utf-8');
    const parsed = matter(existing);
    if (parsed.data.content_hash === expectedHash) {
      return { written: false };
    }
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }

  const tmpPath = filePath + '.tmp';
  await fs.writeFile(tmpPath, markdown, 'utf-8');
  await fs.rename(tmpPath, filePath);
  return { written: true };
}

export async function writeAtomic(filePath: string, content: string): Promise<void> {
  await fs.mkdir(dirname(filePath), { recursive: true });
  const tmpPath = filePath + '.tmp';
  await fs.writeFile(tmpPath, content, 'utf-8');
  await fs.rename(tmpPath, filePath);
}
