// src/compilation/runner.ts
// bsp compile -> runCompile() entry. Reads OneBrain, renders topic page(s) + index + log,
// writes vault/, records compile_runs + compile_artifacts.

import * as path from 'node:path';
import { eq } from 'drizzle-orm';
import { db } from '@/onebrain/db.js';
import * as schema from '@/onebrain/schema.js';
import { ulid } from '@/onebrain/ids.js';
import {
  findAllClaims,
  findAllSources,
  findAllEntities,
  findAllEdges,
  logEvent,
} from '@/onebrain/repo.js';
import { renderTopicPage } from './render/topic-page.js';
import { renderIndexMd, type IndexedPage } from './render/index-md.js';
import { appendLogEntry } from './render/log-md.js';
import { writeIfChanged, writeAtomic } from './vault-writer.js';
import { logger } from '@/lib/log.js';

export interface RunCompileOptions {
  vaultPath?: string;
  now?: Date;
}

export interface RunCompileResult {
  runId: string;
  pagesPlanned: number;
  pagesWritten: number;
  pagesSkipped: number;
  topicPages: Array<{ path: string; hash: string; written: boolean }>;
}

export async function runCompile(
  opts: RunCompileOptions = {},
): Promise<RunCompileResult> {
  const vaultPath = opts.vaultPath ?? path.resolve(process.cwd(), 'vault');
  const now = opts.now ?? new Date();
  const runId = ulid();

  logger.info({ runId, vaultPath }, 'compile started');

  // 1. Read everything
  // reads are parallel-safe; P16 sequential-write discipline governs writes only
  const [claims, sources, entities, edges] = await Promise.all([
    findAllClaims(),
    findAllSources(),
    findAllEntities(),
    findAllEdges(),
  ]);

  // 2. Insert compile_runs row (started)
  await db.insert(schema.compile_runs).values({
    id: runId,
    trigger: 'on_demand',
  });

  // 3. Friendly empty case (RESEARCH.md Open Questions #5)
  if (claims.length === 0) {
    logger.warn('No claims in OneBrain. Run `bsp ingest --fixture <name>` first.');
    await db
      .update(schema.compile_runs)
      .set({
        finished_at: new Date(),
        pages_planned: 0,
        pages_written: 0,
        pages_skipped: 0,
      })
      .where(eq(schema.compile_runs.id, runId));
    return {
      runId,
      pagesPlanned: 0,
      pagesWritten: 0,
      pagesSkipped: 0,
      topicPages: [],
    };
  }

  // 4. Determine the primary topic from the fixture's claim set (D-13)
  const tagCounts = new Map<string, number>();
  for (const c of claims) {
    for (const t of c.topic_tags ?? [])
      tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  }
  const primaryTag =
    [...tagCounts.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    )[0]?.[0] ?? 'untagged';
  const slug = primaryTag;
  const title = slug
    .split('-')
    .map((w) => (w[0]?.toUpperCase() ?? '') + w.slice(1))
    .join(' ');

  // 5. Render the topic page
  const pageId = await getOrCreatePageId(vaultPath, slug);
  const { markdown, hash } = renderTopicPage({
    pageId,
    topicSlug: slug,
    topicTitle: title,
    generatedAt: now,
    compileRunId: runId,
    claims,
    edges,
    entities,
    sources,
  });

  const topicPagePath = path.join(vaultPath, 'topics', `${slug}.md`);
  const { written: topicWritten } = await writeIfChanged(topicPagePath, markdown, hash);

  await db.insert(schema.compile_artifacts).values({
    id: ulid(),
    run_id: runId,
    page_path: `topics/${slug}.md`,
    page_kind: 'topic',
    source_claim_ids: claims.map((c) => c.id).sort(),
    content_hash: hash,
    written: topicWritten,
  });

  // 6. Rebuild index.md (D-16)
  const indexedPages: IndexedPage[] = [
    {
      kind: 'topic',
      title,
      slug: `topics/${slug}`,
      claimCount: claims.length,
      contradictionCount: edges.filter((e) => e.kind === 'contradicts').length,
      lastUpdated: now,
    },
  ];
  const indexMd = renderIndexMd(indexedPages, sources);
  const indexPath = path.join(vaultPath, 'index.md');
  await writeAtomic(indexPath, indexMd);

  // 7. Append log entry (D-17, COMP-04)
  await appendLogEntry(
    vaultPath,
    'compile',
    `wrote ${topicWritten ? 1 : 0} of 1 page (run ${runId.slice(0, 8)}…)`,
    now,
  );

  // 8. Finalize compile_runs row
  await db
    .update(schema.compile_runs)
    .set({
      finished_at: new Date(),
      pages_planned: 1,
      pages_written: topicWritten ? 1 : 0,
      pages_skipped: topicWritten ? 0 : 1,
    })
    .where(eq(schema.compile_runs.id, runId));

  await logEvent(
    'compile',
    'compilation-agent',
    `wrote ${topicWritten ? 1 : 0} pages`,
    { runId, pagesWritten: topicWritten ? 1 : 0 },
  );

  logger.info(
    { runId, pagesWritten: topicWritten ? 1 : 0 },
    'compile finished',
  );

  return {
    runId,
    pagesPlanned: 1,
    pagesWritten: topicWritten ? 1 : 0,
    pagesSkipped: topicWritten ? 0 : 1,
    topicPages: [{ path: topicPagePath, hash, written: topicWritten }],
  };
}

async function getOrCreatePageId(vaultPath: string, slug: string): Promise<string> {
  const fs = await import('node:fs/promises');
  const matter = (await import('gray-matter')).default;
  const filePath = path.join(vaultPath, 'topics', `${slug}.md`);
  try {
    const existing = await fs.readFile(filePath, 'utf-8');
    const parsed = matter(existing);
    if (
      typeof parsed.data.id === 'string' &&
      /^[0-9A-HJKMNP-TV-Z]{26}$/.test(parsed.data.id)
    ) {
      return parsed.data.id;
    }
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
  return ulid();
}
