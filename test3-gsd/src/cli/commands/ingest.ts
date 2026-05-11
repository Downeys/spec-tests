// src/cli/commands/ingest.ts
// D-04: duplicate-source skip on raw_text_hash (idempotent re-ingest).
// D-08: bare URL/file input rejected — fixtures only in Phase 1.
// D-11: walk source → entities → claims → edges in dependency order (P16 prevention).

import * as path from 'node:path';
import {
  writeSource,
  writeClaim,
  writeEntity,
  writeEdge,
  logEvent,
} from '@/onebrain/repo.js';
import { appendLogEntry } from '@/compilation/render/log-md.js';
import { logger } from '@/lib/log.js';
import { getFixture, listFixtures } from '../fixtures/index.js';

export interface IngestOptions {
  fixture?: string;
  json?: boolean;
  verbose?: boolean;
  veryVerbose?: boolean;
}

/**
 * `bsp ingest [input] [--fixture <name>] [--json] [-v|-vv]`
 *
 * Phase 1 only supports `--fixture <name>`. Bare URL/file paths are rejected per D-08.
 */
export async function ingest(
  input: string | undefined,
  opts: IngestOptions,
): Promise<void> {
  // D-08: bare positional input is not supported in Phase 1
  if (input && !opts.fixture) {
    process.stderr.write(
      `Bare URL/file input is not supported in Phase 1.\n` +
        `Use --fixture <name>. Real source ingestion lands in Phase 2 (research sub-agent).\n` +
        `Available fixtures: ${listFixtures().join(', ')}\n`,
    );
    process.exit(1);
    return;
  }
  if (!opts.fixture) {
    process.stderr.write(
      `Missing --fixture <name>. Available: ${listFixtures().join(', ')}\n`,
    );
    process.exit(1);
    return;
  }

  // Allowlist check (security: only registry keys accepted — no fs/path operations)
  const fixture = getFixture(opts.fixture);
  if (!fixture) {
    process.stderr.write(
      `Unknown fixture '${opts.fixture}'. Available: ${listFixtures().join(', ')}\n`,
    );
    process.exit(1);
    return;
  }

  logger.info({ fixture: opts.fixture }, 'ingest started');

  // 1. Source first — and check D-04 dedupe outcome
  const { source, skipped } = await writeSource(fixture.source);

  if (skipped) {
    // D-04: print human-readable skip message; exit 0; write NO further rows.
    const ingestedDate = source.ingested_at.toISOString().slice(0, 10);
    const message = `already ingested as ${source.id} on ${ingestedDate} (title: ${source.title})`;
    if (opts.json) {
      process.stdout.write(
        JSON.stringify({
          skipped: true,
          source_id: source.id,
          ingested_at: source.ingested_at.toISOString(),
          title: source.title,
          claim_count: 0,
          edge_count: 0,
          entity_count: 0,
        }) + '\n',
      );
    } else {
      process.stdout.write(message + '\n');
    }
    await logEvent(
      'ingest',
      'cli-fixture',
      `skipped duplicate source ${source.id}`,
      { fixture: opts.fixture },
    );
    return;
  }

  // 2. Entities — write each, build localId → realId map.
  // Explicitly pick the entity input fields so localId never reaches Zod
  //   (immune to future zod strict-mode changes that would reject the unknown localId key).
  const entityIdMap = new Map<string, string>();
  for (const e of fixture.entities) {
    const entityInput = {
      kind: e.kind,
      name: e.name,
      aliases: e.aliases,
      description: e.description,
      metadata: e.metadata,
    };
    const written = await writeEntity(entityInput);
    entityIdMap.set(e.localId, written.id);
  }

  // 3. Claims — write each, build claim localId → realId map
  const claimIdMap = new Map<string, string>();
  for (const c of fixture.claims) {
    const { localId, ...claimInput } = c;
    const written = await writeClaim(claimInput);
    claimIdMap.set(localId, written.id);
  }

  // 4. Edges — resolve localIds → realIds and call writeEdge
  //    Reference resolution: source = the just-written source.id; entity = entityIdMap; claim = claimIdMap
  let edgeCount = 0;
  for (const e of fixture.edges) {
    const fromId = claimIdMap.get(e.fromLocalId);
    if (!fromId) {
      throw new Error(
        `fixture edge references unknown claim localId '${e.fromLocalId}'`,
      );
    }

    let toId: string | undefined;
    let toTable: 'sources' | 'claims' | 'entities';
    if (e.toLocalRef.kind === 'source') {
      toId = source.id;
      toTable = 'sources';
    } else if (e.toLocalRef.kind === 'claim') {
      toId = claimIdMap.get(e.toLocalRef.localId);
      toTable = 'claims';
    } else {
      // entity
      toId = entityIdMap.get(e.toLocalRef.localId);
      toTable = 'entities';
    }
    if (!toId) {
      throw new Error(
        `fixture edge target unresolved: ${JSON.stringify(e.toLocalRef)}`,
      );
    }

    await writeEdge({
      kind: e.kind,
      from_id: fromId,
      from_table: 'claims',
      to_id: toId,
      to_table: toTable,
      weight: e.weight ?? 1.0,
      metadata: {},
    });
    edgeCount++;
  }

  // 5. Append vault/log.md entry (D-17, COMP-04)
  const vaultPath = path.resolve(process.cwd(), 'vault');
  await appendLogEntry(
    vaultPath,
    'ingest',
    `loaded fixture '${opts.fixture}': source=${source.id} claims=${claimIdMap.size} edges=${edgeCount}`,
  );

  await logEvent(
    'ingest',
    'cli-fixture',
    `loaded fixture '${opts.fixture}'`,
    {
      fixture: opts.fixture,
      source_id: source.id,
      claim_count: claimIdMap.size,
      edge_count: edgeCount,
    },
  );

  // 6. Output
  if (opts.json) {
    process.stdout.write(
      JSON.stringify({
        skipped: false,
        source_id: source.id,
        title: source.title,
        ingested_at: source.ingested_at.toISOString(),
        claim_count: claimIdMap.size,
        edge_count: edgeCount,
        entity_count: entityIdMap.size,
      }) + '\n',
    );
  } else {
    process.stdout.write(
      `Ingested fixture '${opts.fixture}':\n` +
        `  source:   ${source.id}  ${source.title}\n` +
        `  claims:   ${claimIdMap.size}\n` +
        `  edges:    ${edgeCount}\n` +
        `  entities: ${entityIdMap.size}\n`,
    );
  }
}
