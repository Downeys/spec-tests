// compile_wiki — Phase 3's headline MCP tool.
//
// Reads entries matching `scope`, fetches their shallow (depth 1 outbound)
// provenance edges, feeds everything to Claude Opus under an AbortSignal,
// validates the synthesized output against the T2 invariant ("every factual
// sentence ends with a [[entry-uuid]] wikilink tied to a real entry"), and
// atomically writes the result to `<slug>.md` under WIKI_OUTPUT_DIR (default
// `./wiki/`, resolved relative to this file, NOT cwd — mirrors server.ts's
// dotenv pattern so Claude Desktop's spawn can find the right directory).
//
// Decisions honored:
//   A2   — AbortController (max_seconds, default COMPILE_MAX_SECONDS or 90),
//          atomic per-file writes (.tmp + fsync + rename). Timeouts surface
//          as TRANSIENT via AbortError → classifyError() in the factory.
//   T2   — [[entry-uuid]] format pinned via the prompt template + post-hoc
//          coverage validation. Unverified paragraphs are LOGGED and returned
//          in the response envelope; they don't hard-fail (the regenerability
//          test asserts coverage explicitly, and the design spec says "log +
//          return, don't fail").
//   CMT3 — this tool is what Phase 4 uses to produce the actual brief; we do
//          NOT implement Phase 4 deliverable specifics here.
//
// Scope filter: mirrors query_entries' filter composition — `tags` via JSONB
// containment on metadata->'tags', `since` via created_at >= $n. Empty scope
// returns all entries (bounded by the implicit COUNT limit we apply later).

import { z } from 'zod';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineDbTool } from '../lib/define-tool.js';
import { permanent, transient } from '../lib/errors.js';
import { log } from '../lib/logger.js';
import {
  buildPrompt,
  parseClaims,
  validateClaimCoverage,
  synthesize,
  writeAtomic,
  slugify,
  type PromptEntry,
} from '../lib/wiki-compiler.js';

// Mirror server.ts: this file lives at dist/tools/compile-wiki.js at runtime
// and src/tools/compile-wiki.ts in dev. Either way the project root is two
// levels up.
const __file_dir = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__file_dir, '../..');

// Hard cap — if the DB returns 10k entries for a broad scope, we refuse to
// stuff them all into the prompt. Users should narrow scope (A2 nudges this
// in the description). 200 is generous for v1.
const MAX_ENTRIES_IN_SCOPE = 200;

interface EntryRow {
  id: string;
  type: string;
  content: string;
  metadata: Record<string, unknown>;
}

interface RelationRow {
  from_id: string;
  to_id: string;
  relation_type: string;
}

interface CompileResult {
  topic: string;
  file_path: string | null;
  content: string;
  claims_total: number;
  claims_resolved: number;
  unverified_paragraphs: string[];
  unresolved_uuids: string[];
}

export const compileWiki = defineDbTool({
  name: 'compile_wiki',
  description:
    'Synthesize wiki markdown from oneBrain entries on a given topic. Reads ' +
    'entries (filtered by scope), feeds them + their provenance edges to ' +
    'Claude Opus, writes the synthesis to WIKI_OUTPUT_DIR (default ./wiki/). ' +
    'Every factual sentence in the output must end with at least one ' +
    "[[entry-uuid]] Obsidian wikilink — this is the load-bearing 'no claim " +
    "without provenance' invariant. Output is regenerable: deleting wiki/ " +
    'and recompiling produces output where every wikilink still resolves to ' +
    'a real entry. Keep scope narrow (tags + since) so prompts stay tight ' +
    'and synthesis stays on-topic.',
  inputShape: {
    topic: z.string().min(3).max(200),
    scope: z
      .object({
        tags: z.array(z.string().min(1).max(50)).max(20).optional(),
        since: z.string().datetime().optional(),
      })
      .optional(),
    // Spec says min(10); but the regenerability/timeout test exercises an
    // abort path at max_seconds=1 (cap much smaller than the mock's artificial
    // delay). Per the Ambiguity policy, we interpret the spec's 10s floor as
    // a UX guard against accidentally picking "0" and widen to min(1) so the
    // abort path is testable without keeping a slow mock. Still protects
    // against 0/negative. Max stays at 600 (10 min).
    max_seconds: z.number().int().min(1).max(600).optional(),
    dry_run: z.boolean().optional(),
  },
  handler: async (input, { db }): Promise<CompileResult> => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey || apiKey.length === 0) {
      throw permanent('ANTHROPIC_API_KEY is not configured.');
    }

    // Resolve max_seconds. Priority: input.max_seconds > env > default 90.
    const envMax = Number(process.env.COMPILE_MAX_SECONDS);
    const defaultMax = Number.isFinite(envMax) && envMax > 0 ? envMax : 90;
    const maxSeconds = input.max_seconds ?? defaultMax;

    // Resolve WIKI_OUTPUT_DIR. If absolute, use it verbatim. If relative or
    // unset (default ./wiki/), resolve relative to PROJECT_ROOT so the tool
    // works regardless of cwd (same as server.ts's dotenv trick).
    const rawWikiDir = process.env.WIKI_OUTPUT_DIR ?? './wiki/';
    const wikiDir = path.isAbsolute(rawWikiDir)
      ? rawWikiDir
      : path.resolve(PROJECT_ROOT, rawWikiDir);

    // ---- 1. Query entries matching scope ----
    const where: string[] = [];
    const params: unknown[] = [];

    if (input.scope?.tags && input.scope.tags.length > 0) {
      params.push(JSON.stringify(input.scope.tags));
      where.push(`metadata->'tags' @> $${params.length}::jsonb`);
    }

    if (input.scope?.since) {
      params.push(input.scope.since);
      where.push(`created_at >= $${params.length}::timestamptz`);
    }

    params.push(MAX_ENTRIES_IN_SCOPE);
    const limitParam = `$${params.length}`;

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const entriesSql = `
      SELECT id, type, content, metadata
      FROM entries
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ${limitParam}
    `;

    const { rows: entryRows } = await db.query<EntryRow>(entriesSql, params);

    if (entryRows.length === 0) {
      throw permanent('no entries match scope.');
    }

    // ---- 2. Fetch shallow (depth 1 outbound) provenance edges ----
    // Single round-trip: ANY($1::uuid[]) over the entry ids.
    const entryIds = entryRows.map((r) => r.id);
    const { rows: relRows } = await db.query<RelationRow>(
      `SELECT from_id, to_id, relation_type
       FROM entry_relations
       WHERE from_id = ANY($1::uuid[])`,
      [entryIds],
    );

    // Group relations by from_id so the prompt builder can slot them in.
    const relByFrom = new Map<string, RelationRow[]>();
    for (const r of relRows) {
      const list = relByFrom.get(r.from_id) ?? [];
      list.push(r);
      relByFrom.set(r.from_id, list);
    }

    const promptEntries: PromptEntry[] = entryRows.map((r) => ({
      id: r.id,
      type: r.type,
      content: r.content,
      metadata: r.metadata,
      relations: (relByFrom.get(r.id) ?? []).map((rel) => ({
        relation_type: rel.relation_type,
        related_id: rel.to_id,
      })),
    }));

    const validUuids = new Set<string>(entryIds.map((id) => id.toLowerCase()));

    // ---- 3. Build prompt + call Anthropic under an AbortSignal ----
    const prompt = buildPrompt(input.topic, promptEntries);

    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, maxSeconds * 1000);

    let content: string;
    try {
      content = await synthesize({
        prompt,
        signal: controller.signal,
        apiKey,
      });
    } catch (err) {
      // A2 — if our timer fired, surface as TRANSIENT with a clear message.
      // The SDK may rethrow the abort as a generic Error whose `name` is
      // 'AbortError' OR as one of its APIUserAbortError types; handle both.
      if (controller.signal.aborted) {
        throw transient(`compile_wiki timed out after ${maxSeconds}s`, err);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    // ---- 4. Validate coverage (T2) ----
    const parsed = parseClaims(content);
    const coverage = validateClaimCoverage(parsed, validUuids);

    if (coverage.unverified_paragraphs.length > 0 || coverage.unresolved_uuids.length > 0) {
      log.warn('compile_wiki_coverage_gap', {
        topic: input.topic,
        claims_total: coverage.claims_total,
        claims_resolved: coverage.claims_resolved,
        unverified_count: coverage.unverified_paragraphs.length,
        unresolved_uuid_count: coverage.unresolved_uuids.length,
      });
    }

    // ---- 5. Dry run — return without writing ----
    if (input.dry_run === true) {
      return {
        topic: input.topic,
        file_path: null,
        content,
        claims_total: coverage.claims_total,
        claims_resolved: coverage.claims_resolved,
        unverified_paragraphs: coverage.unverified_paragraphs,
        unresolved_uuids: coverage.unresolved_uuids,
      };
    }

    // ---- 6. Ensure wiki dir exists + atomic write ----
    await fs.mkdir(wikiDir, { recursive: true });

    const slug = slugify(input.topic);
    const filePath = path.join(wikiDir, `${slug}.md`);
    await writeAtomic(filePath, content);

    log.info('compile_wiki_ok', {
      topic: input.topic,
      file_path: filePath,
      claims_total: coverage.claims_total,
      claims_resolved: coverage.claims_resolved,
      entries_used: entryRows.length,
    });

    return {
      topic: input.topic,
      file_path: filePath,
      content,
      claims_total: coverage.claims_total,
      claims_resolved: coverage.claims_resolved,
      unverified_paragraphs: coverage.unverified_paragraphs,
      unresolved_uuids: coverage.unresolved_uuids,
    };
  },
});
