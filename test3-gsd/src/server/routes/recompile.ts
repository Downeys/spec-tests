// src/server/routes/recompile.ts
// POST /recompile (SSE) + GET /recompile/status (JSON) — Phase 2 plan 02-08.
//
// Spec authority:
//   - .planning/phases/02-agents-and-chat/02-RESEARCH.md §COMP-11 (lines 90-91)
//     "POST /recompile route → invokes compilation sub-agent only (not via the
//     coordinator). Implementation: a tiny query() invocation with ONLY the
//     compilation agent definition exposed, no coordinator-prompt."
//   - .planning/phases/02-agents-and-chat/02-CONTEXT.md D-16/D-17/D-18
//   - .planning/phases/02-agents-and-chat/02-AI-SPEC.md §3 ("Recompile round-trip
//     integrity" — COMP-11 grading rubric)
//
// THREE LOAD-BEARING DISCIPLINES IN THIS FILE:
//
// 1. T-02-01 (carry-forward): the agents map passed to query() contains ONLY
//    `compilation: compilationDef`. No research, no coordinator. The vault-audit
//    PreToolUse hook fires regardless and would crash loud if a different sub-
//    agent were spawned. Tested by tests/server/recompile-route.spec.ts which
//    asserts `opts.options.agents.research === undefined`.
//
// 2. The mcpServers map carries ONLY { onebrain, vault } — NO tavily. The
//    compilation sub-agent does not search the web; it reads OneBrain rows and
//    writes vault pages. Excluding tavily structurally prevents accidental web
//    calls during recompile.
//
// 3. GET /recompile/status returns a safe empty-state JSON `{ lastCompiledAt:
//    null, dirtyClaimsCount: 0, inFlight: false }` on any DB error and logs via
//    pino. The status endpoint is polled every 5s by the UI (D-16); failing
//    closed (200 with empty state) keeps the pill rendering instead of crashing
//    the UI on a transient DB blip.

import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { sql } from 'drizzle-orm';
import { query } from '@anthropic-ai/claude-agent-sdk';

import {
  adaptToUIMessageChunks,
  createRecompileResultChunk,
  createStreamContext,
  createTextStartChunk,
  createTextEndChunk,
  type UIMessageChunk,
} from '../streaming.js';
import { compilationDef } from '@/agents/definitions/compilation.js';
import { vaultAuditHook } from '@/agents/hooks/vault-audit.js';
import { createOnebrainMcpServer } from '@/agents/tools/onebrain.js';
import { createVaultMcpServer } from '@/agents/tools/vault.js';
import { db } from '@/onebrain/db.js';
import { logger } from '@/lib/log.js';

// ---------------------------------------------------------------------------
// Tool/agent ID literals — match against these via EXACT EQUALITY.
// The vault_write_atomic result is the trigger for capturing the
// CompilationOutputSchema-shaped finalResult that the UI renders as the D-18
// system message.
// ---------------------------------------------------------------------------

const TOOL_VAULT_WRITE_ATOMIC = 'mcp__vault__vault_write_atomic';

export const recompileRoute = new Hono();

interface CompilationResult {
  pages_written: number;
  pages_skipped: number;
  run_id: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// POST /recompile — SSE stream of progress + final D-18-shaped result chunk
// ---------------------------------------------------------------------------

recompileRoute.post('/recompile', async (c) => {
  logger.info('POST /recompile');

  return streamSSE(c, async (stream) => {
    // Capture the final compilation result so the UI can render the D-18
    // system message verbatim per AI-SPEC §3 + 02-CONTEXT D-18:
    //   `Recompiled: <n> page written, <s> skipped (run <run-ulid>).`
    let finalResult: CompilationResult | undefined;

    // Single text-stream identity for this turn (AI SDK 6 native shape).
    // Bookends every text-delta chunk forwarded from the SDK iterator.
    const streamId = randomUUID();
    // Per-request adapter state (CR-01) — vault_write_atomic invokes are
    // identified by tool_use_id on the matching tool_result block; the
    // adapter resolves id → real tool name via this context map.
    const ctx = createStreamContext(streamId);
    let textStreamOpen = false;

    try {
      // Open the text stream BEFORE iterating. The recompile flow rarely emits
      // text-delta chunks (it mostly emits tool-trace + the recompile-result),
      // but assistant-ui's transport requires the start/end bookends if any
      // text-delta chunks land in between.
      await stream.writeSSE({
        data: JSON.stringify(createTextStartChunk(streamId)),
      });
      textStreamOpen = true;
      // T-02-01 mitigation: agents map contains ONLY compilation. No research,
      // no coordinator. The compilationDef + vault-audit hook combination
      // structurally enforces single-writer-to-vault per COMP-10.
      const onebrain = createOnebrainMcpServer();
      const vault = createVaultMcpServer();

      // PERMISSION MODE — bypassPermissions (CORRECT for this deployment) ----
      // The SDK defaults `permissionMode` to 'default' (sdk.d.ts:1447,
      // sdk.d.ts:3230, PermissionMode union sdk.d.ts:1757), which prompts a
      // HUMAN for permission on every tool call. In this Hono SSE handler
      // there is no interactive prompter — every tool call (including
      // vault_write_atomic) is silently rejected, runCompile() never executes,
      // and the recompile pill in the UI hangs forever.
      //
      // For this project's deployment posture — single-user, local-only, no
      // auth (PROJECT.md §"Out of scope" lines 36-38; CLAUDE.md project-
      // instructions header) — the `allowedTools` allowlist + the
      // vault-audit PreToolUse hook ARE the real authorization gates. The
      // recompile route's allowlist is the minimal compilation set
      // (onebrain_search, vault_read, vault_write_atomic), the agents map
      // contains ONLY compilation (T-02-01 / COMP-11), and the vault-audit
      // hook still asserts the calling subagent is 'compilation' before any
      // vault_write_atomic call goes through. Interactive permission prompts
      // add no additional security in this single-user-local-only model and
      // break the server runtime by design.
      //
      // `allowDangerouslySkipPermissions: true` is a required acknowledgment
      // per sdk.d.ts:1456-1459 + sdk.d.ts:3199-3202: "Must be set to `true`
      // when using `permissionMode: 'bypassPermissions'`. This is a safety
      // measure to ensure intentional bypassing of permissions." The
      // acknowledgment is intentional here — see CLAUDE.md hard
      // architectural commitments.
      // ------------------------------------------------------------------
      const result = query({
        prompt:
          'Recompile the vault from current OneBrain state. Invoke the vault_write_atomic tool exactly once and return its result.',
        options: {
          model: 'claude-sonnet-4-6',
          // Only compilation in the agents map. Tested by recompile-route.spec.
          agents: {
            compilation: compilationDef as unknown as never,
          },
          // No tavily — compilation doesn't search the web.
          mcpServers: { onebrain, vault },
          // The four tools compilationDef itself can invoke. Anything else
          // is structurally blocked at the SDK boundary.
          allowedTools: [
            'mcp__onebrain__onebrain_search',
            'mcp__vault__vault_read',
            'mcp__vault__vault_write_atomic',
          ],
          // See PERMISSION MODE comment block above for rationale.
          permissionMode: 'bypassPermissions',
          allowDangerouslySkipPermissions: true,
          // Layer-2 audit — fires on every tool call. For vault_write_atomic
          // it asserts the calling sub-agent is 'compilation'; otherwise blocks.
          hooks: {
            PreToolUse: [{ hooks: [vaultAuditHook] }],
          },
        } as never,
      });

      // for-await drains the SDK iterator one event at a time per RESEARCH
      // pitfall #16 (do NOT collect via Promise.all — defeats streaming).
      // We SUPPRESS in-stream `finish` chunks (some SDK events map to
      // `{type: 'finish'}` mid-iteration); the canonical finish is emitted
      // exactly once after the post-loop data-recompile-result so the UI's
      // SSE reader does not exit before seeing the result chunk.
      for await (const ev of result as AsyncIterable<unknown>) {
        for (const chunk of adaptToUIMessageChunks(ev, ctx)) {
          if (chunk.type === 'finish') continue;

          // Capture the vault_write_atomic result — its `summary` field is the
          // JSON-stringified runCompile() return value. We parse and forward it
          // as the D-18-shaped CompilationResult so the UI can render the
          // system message after the stream drains. The adapter now resolves
          // tool_use_id → real tool name via the per-request StreamContext, so
          // this exact-equality match fires on production user/tool_result
          // events (CR-01).
          if (
            chunk.type === 'data-tool-trace' &&
            chunk.data.phase === 'result' &&
            chunk.data.tool === TOOL_VAULT_WRITE_ATOMIC &&
            typeof chunk.data.summary === 'string'
          ) {
            finalResult = parseRunCompileSummary(chunk.data.summary);
          }

          await stream.writeSSE({ data: JSON.stringify(chunk) });
        }
      }

      // Emit the D-18 result chunk so the UI can render the system message.
      // AI SDK 6 native DataUIMessageChunk shape: `data` field, not `value`.
      if (finalResult) {
        const resultChunk: UIMessageChunk = {
          type: 'data-tool-trace',
          data: {
            phase: 'result',
            tool: 'recompile.result',
            summary: JSON.stringify(finalResult),
          },
        };
        // Emit the structured recompile-result chunk in the format the UI
        // consumes (useRecompile's onCompleted handler reads
        // chunk.type === 'data-recompile-result' and chunk.data).
        await stream.writeSSE({
          data: JSON.stringify(createRecompileResultChunk(finalResult)),
        });
        // Also emit it as a tool-trace chunk so ToolTrace surfaces the
        // recompile in the trace timeline.
        await stream.writeSSE({ data: JSON.stringify(resultChunk) });
      }

      // Close the text stream BEFORE the finish chunk.
      await stream.writeSSE({
        data: JSON.stringify(createTextEndChunk(streamId)),
      });
      textStreamOpen = false;

      await stream.writeSSE({ data: JSON.stringify({ type: 'finish' }) });
    } catch (err) {
      logger.error({ err }, 'POST /recompile failed');
      // Best-effort close any open text stream so the UI doesn't render a
      // half-open block before the error chunk lands.
      if (textStreamOpen) {
        try {
          await stream.writeSSE({
            data: JSON.stringify(createTextEndChunk(streamId)),
          });
        } catch {
          // swallow — already in error path
        }
      }
      await stream.writeSSE({
        data: JSON.stringify({
          type: 'error',
          errorText: String((err as Error).message ?? err),
        }),
      });
    }
  });
});

// ---------------------------------------------------------------------------
// GET /recompile/status — JSON snapshot of dirty-count + last compile time
// ---------------------------------------------------------------------------
// D-16 dirty-count formula:
//   SELECT count(*) FROM claims
//   WHERE updated_at > (SELECT MAX(finished_at) FROM compile_runs WHERE error IS NULL)
//
// On any DB error: log via pino + return empty-state JSON with status 200.
// The UI polls this every 5s (D-16); failing closed keeps the pill rendering
// instead of crashing the UI on transient DB connectivity blips.
// ---------------------------------------------------------------------------

recompileRoute.get('/recompile/status', async (c) => {
  try {
    // Last successful compile timestamp.
    const lastCompiledRow = await db.execute(
      sql`SELECT MAX(finished_at) AS last_compiled FROM compile_runs WHERE error IS NULL`,
    );
    const lastCompiledRaw =
      (lastCompiledRow.rows?.[0] as { last_compiled?: string | Date | null } | undefined)
        ?.last_compiled ?? null;
    const lastCompiledAt =
      lastCompiledRaw === null
        ? null
        : lastCompiledRaw instanceof Date
          ? lastCompiledRaw.toISOString()
          : new Date(lastCompiledRaw).toISOString();

    // D-16 dirty-count formula. COALESCE guards against the no-prior-compile
    // case (NULL MAX → epoch → all claims count as dirty).
    const dirtyRow = await db.execute(
      sql`SELECT count(*)::int AS n FROM claims WHERE updated_at > COALESCE((SELECT MAX(finished_at) FROM compile_runs WHERE error IS NULL), 'epoch'::timestamp)`,
    );
    const dirtyClaimsCount = Number(
      (dirtyRow.rows?.[0] as { n?: number | string } | undefined)?.n ?? 0,
    );

    return c.json({
      lastCompiledAt,
      dirtyClaimsCount,
      inFlight: false,
    });
  } catch (err) {
    logger.warn({ err }, 'GET /recompile/status: DB error — returning empty state');
    return c.json({
      lastCompiledAt: null,
      dirtyClaimsCount: 0,
      inFlight: false,
    });
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse the JSON summary that vault_write_atomic emits as its tool-result
 * content. Phase 1's runCompile returns camelCase fields; we normalize to
 * snake_case for the UI contract (CompilationOutputSchema in 02-04).
 *
 * Defensive: returns undefined on any parse failure so the SSE stream still
 * completes with a `finish` chunk.
 */
function parseRunCompileSummary(summary: string): CompilationResult | undefined {
  try {
    const trimmed = summary.trim();
    if (!trimmed.startsWith('{')) return undefined;
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    return {
      pages_written: Number(parsed.pagesWritten ?? parsed.pages_written ?? 0),
      pages_skipped: Number(parsed.pagesSkipped ?? parsed.pages_skipped ?? 0),
      run_id: String(parsed.runId ?? parsed.run_id ?? ''),
      error: parsed.error as string | undefined,
    };
  } catch {
    return undefined;
  }
}
