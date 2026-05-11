// src/agents/tools/onebrain.ts
// Four MCP tools wrapping Phase 1 OneBrain repo + Phase 2 hybrid search:
//   - onebrain_write_source : delegates to repo.writeSource (idempotent on raw_text_hash)
//   - onebrain_write_claim  : delegates to repo.writeClaim, with D-05 protocol-layer
//                             source-row-first guard layered on top
//   - onebrain_write_edge   : delegates to repo.writeEdge
//   - onebrain_search       : embed(q) → searchClaims(q, embedding, tags?, limit?)
//
// Layer 1 / Layer 2 split for AGENT-08 / Pitfall 19 (per RESEARCH §3.5):
//   - Layer 1 (schema-coercive guard): ships in plan 02-05 inside repo.writeClaim itself.
//     QUANT_PATTERN.test(text) AND empty cites_source_ids → throw
//     QuantitativeClaimRequiresSourceError (catches ANY code path attempting the
//     write — agent, ingest, financial, etc.).
//   - Layer 2 (protocol-layer ordering guard, this file): the wrapper iterates
//     `cites_source_ids[]` and calls findSource() on each ULID. Any forward-reference
//     (a ULID not yet in OneBrain at call time) → throw SourceRowNotFoundError.
//     Catches D-05 ordering violations the schema guard cannot see.
//
// Per-turn counters (D-01 stop criteria) — RESEARCH §AGENT-02:
//   onebrain_write_claim returns `{ claim, elapsed_seconds, claim_count_this_turn }`.
//   The sub-agent reads these counters from each tool-result and self-stops at
//   ~10 claims or ~120 seconds. The coordinator (plan 02-05) MUST call
//   resetTurnCounter() at the top of each turn so counters reflect this turn only.

import {
  tool,
  createSdkMcpServer,
} from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

import {
  writeSource,
  writeClaim,
  writeEdge,
  findSource,
} from '@/onebrain/repo.js';
import { searchClaims } from '@/onebrain/search.js';
import { embed } from '@/onebrain/embed.js';
import {
  NewClaimSchema,
  NewEdgeSchema,
  NewSourceSchema,
  SourceKindSchema,
} from '@/onebrain/types.js';
import { logger } from '@/lib/log.js';

/**
 * Thrown by onebrain_write_claim when cites_source_ids contains a ULID not in
 * OneBrain at call time (D-05 forward-reference). Caught at the SDK boundary;
 * the sub-agent can re-issue an `onebrain_write_source` call first then retry.
 */
export class SourceRowNotFoundError extends Error {
  constructor(public readonly missingId: string) {
    super(
      `onebrain_write_claim: cites_source_ids contains ULID not in OneBrain: ${missingId}`,
    );
    this.name = 'SourceRowNotFoundError';
  }
}

// ─── D-01 per-turn counters ────────────────────────────────────────────────────
// Module-level state. The Phase 2 single-user-no-concurrency invariant makes
// this safe; each chat turn corresponds to one query() invocation, and the
// coordinator (02-05) calls resetTurnCounter() before invoking sub-agents.
let _turnStart: number = Date.now();
let _claimCount: number = 0;

/**
 * Reset per-turn D-01 counters. Coordinator calls this at the top of each chat turn.
 */
export function resetTurnCounter(): void {
  _turnStart = Date.now();
  _claimCount = 0;
}

function getCounters(): {
  elapsed_seconds: number;
  claim_count_this_turn: number;
} {
  return {
    elapsed_seconds: (Date.now() - _turnStart) / 1000,
    claim_count_this_turn: _claimCount,
  };
}

// ─── Tools ─────────────────────────────────────────────────────────────────────
// `tool()` arity per @anthropic-ai/claude-agent-sdk@0.2.119 sdk.d.ts:5279 is
// (name, description, inputSchema, handler). The schema must be an AnyZodRawShape
// (raw key→type map) per sdk.d.ts:114.
//
// Bug R-B fix (2026-04-26 smoke check): we CANNOT pass NewSourceSchema.shape
// directly because it inherits `published_at: z.coerce.date().nullable()` from
// SourceSchema, and `z.coerce.date()` cannot be represented in JSON Schema.
// The Claude Agent SDK serializes inputSchema → JSON Schema via the underlying
// MCP server's listTools handler (mcp.js:67 normalizeObjectSchema +
// toJsonSchemaCompat). When that conversion throws, the ENTIRE listTools
// response errors out and the model sees ZERO tools from this server —
// asymmetric with vault (which has no Date fields), reproducing the user's
// "I can see vault tools but no onebrain tools" symptom.
//
// Fix: define MCP-input shapes that use ISO-8601 strings (z.string().datetime())
// for date fields. The repo layer (writeSource) re-validates with
// NewSourceSchema.parse, and z.coerce.date() coerces ISO strings to Date
// downstream — so the contract with the DB layer is preserved. The wire shape
// the agent sees is plain strings; everything else is unchanged.

/**
 * MCP wire-shape for onebrain_write_source. Mirrors NewSourceSchema field-for-
 * field EXCEPT `published_at`, which is a JSON-Schema-friendly ISO-8601 string
 * (nullable, optional) instead of `z.coerce.date()`. The handler passes the
 * input straight through to writeSource(), whose internal NewSourceSchema.parse
 * re-coerces the string back to a Date.
 *
 * Keep this shape in lock-step with NewSourceSchema — if a new field is added
 * to NewSourceSchema, mirror it here (or accept that the agent cannot set it).
 */
const OnebrainWriteSourceMcpInput = {
  kind: SourceKindSchema,
  url: z.string().url().nullable(),
  title: z.string().min(1),
  author: z.string().nullable(),
  // ISO-8601 string instead of z.coerce.date() — JSON Schema can represent
  // strings; cannot represent Date. writeSource re-coerces via z.coerce.date()
  // in NewSourceSchema.parse.
  published_at: z.string().datetime().nullable().optional(),
  raw_text: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  raw_text_hash: z.string().optional(),
};

export const onebrain_write_source = tool(
  'onebrain_write_source',
  'Write a Source row to OneBrain. Idempotent on raw_text_hash; returns { source, skipped }.',
  OnebrainWriteSourceMcpInput,
  async (input, _extra) => {
    // The MCP wire-shape uses ISO strings for published_at (so JSON Schema
    // can represent it). NewSourceSchema.parse re-validates with z.coerce.date()
    // which coerces those strings back into Date instances — handing the
    // repo a properly-typed NewSource. The repo also re-parses internally,
    // so this double-parse is intentional belt-and-braces.
    const validated = NewSourceSchema.parse(input);
    const result = await writeSource(validated);
    return {
      content: [
        { type: 'text' as const, text: JSON.stringify(result) },
      ],
    };
  },
);

export const onebrain_write_claim = tool(
  'onebrain_write_claim',
  'Write a Claim to OneBrain. D-05 enforced: every cites_source_ids[] ULID must already exist; throws SourceRowNotFoundError otherwise. Returns { claim, elapsed_seconds, claim_count_this_turn } (per-turn counters carry the D-01 stop signal).',
  NewClaimSchema.shape,
  async (input, _extra) => {
    // D-05 / AGENT-08 Layer 2: every cites_source_ids[] ULID must already exist
    // in OneBrain at the moment of the call. findSource() returns undefined for
    // missing ULIDs (Phase 1 contract at src/onebrain/repo.ts:250-253).
    for (const sourceId of input.cites_source_ids ?? []) {
      const existing = await findSource(sourceId);
      if (!existing) {
        throw new SourceRowNotFoundError(sourceId);
      }
    }
    // Note: tag canonicalization is already done inside writeClaim
    // (src/onebrain/repo.ts:99-100). Do NOT re-canonicalize here.
    const claim = await writeClaim(input);
    _claimCount += 1;
    const counters = getCounters();
    logger.info(
      { claimId: claim.id, ...counters },
      'onebrain_write_claim ok',
    );
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({ claim, ...counters }),
        },
      ],
    };
  },
);

export const onebrain_write_edge = tool(
  'onebrain_write_edge',
  'Write an Edge between two OneBrain rows (claims/entities/sources/decisions). Append-only; supersedes is the only mutation pattern.',
  NewEdgeSchema.shape,
  async (input, _extra) => {
    const edge = await writeEdge(input);
    return {
      content: [
        { type: 'text' as const, text: JSON.stringify(edge) },
      ],
    };
  },
);

export const onebrain_search = tool(
  'onebrain_search',
  'Hybrid search across claims (FTS + pgvector cosine, 0.4/0.6 weighted-sum). Embeds the query text first, then calls searchClaims. Returns up to `limit` ClaimSearchResult rows ranked by score.',
  {
    q: z.string().min(1),
    tags: z.array(z.string()).optional(),
    limit: z.number().int().min(1).max(50).optional(),
  },
  async ({ q, tags, limit }, _extra) => {
    const queryEmbedding = await embed(q);
    const results = await searchClaims({ q, embedding: queryEmbedding, tags, limit });
    return {
      content: [
        { type: 'text' as const, text: JSON.stringify(results) },
      ],
    };
  },
);

/**
 * Bundle the four onebrain tools into an MCP server. Coordinator + sub-agents wire
 * this into `query()`'s mcpServers map. Tool IDs exposed to agents:
 *   mcp__onebrain__onebrain_write_source
 *   mcp__onebrain__onebrain_write_claim
 *   mcp__onebrain__onebrain_write_edge
 *   mcp__onebrain__onebrain_search
 */
export function createOnebrainMcpServer() {
  return createSdkMcpServer({
    name: 'onebrain',
    tools: [
      onebrain_write_source,
      onebrain_write_claim,
      onebrain_write_edge,
      onebrain_search,
    ],
  });
}
