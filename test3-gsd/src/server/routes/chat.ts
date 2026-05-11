// src/server/routes/chat.ts
// POST /chat — Hono SSE handler bridging runCoordinatorTurn to AssistantChatTransport.
// RESEARCH §INFRA-04 + §3.2; AI-SPEC §3 lines 218-277.
//
// Three-hop pipeline (RESEARCH §3.2):
//   SDK event (from runCoordinatorTurn() async iterator)
//     → adaptToUIMessageChunk(ev)  // src/server/streaming.ts
//     → SSE frame                  // hono streamSSE
//     → AssistantChatTransport     // 02-07 UI consumer
//
// 02-08 smoke-check follow-up (Bug B fix): the body-parsing path now accepts
// the REAL AI SDK chat-protocol body shape that AssistantChatTransport
// (extending DefaultChatTransport from `ai`) sends:
//
//   {
//     id: "thread-id",
//     messages: [
//       { id, role: "user" | "assistant" | "system",
//         parts: [{ type: "text", text: "..." }] }    // AI SDK 5/6
//     ],
//     trigger: "submit-message" | "regenerate-message" | ...
//   }
//
// Older AI SDK versions used `content` (string) on the message instead of
// `parts` (array of typed part objects). We extract the LAST user message and
// concatenate all text parts (or fall back to `content`). The legacy
// `body.message` / `body.prompt` / `body.userMessage` fallback is kept so the
// chat-sse spec (and any other test/script that hits the route directly with
// a flat string body) keeps working — see extractUserMessage below.
//
// THREE LOAD-BEARING DISCIPLINES IN THIS FILE:
//
// 1. Tool-event matchers use FULL MCP-prefixed tool IDs (T-02-CHAT-02 mitigation).
//    The `tool` field is compared against the full literal `mcp__<server>__<tool>`
//    via EXACT EQUALITY. Substring matchers (`.includes('research')`,
//    `.endsWith('onebrain_write_claim')`) silently match unrelated tools added
//    in Phase 4+ (e.g., a hypothetical `mcp__legacy__onebrain_write_claim` from
//    a deprecated MCP server, or a Phase-4 sub-agent named `research_v2`).
//    Tested by tests/server/chat-sse.spec.ts negative case.
//
// 2. applyOutputGuard runs BEFORE the finish chunk flushes (T-02-AGENT-01 / D-06).
//    The guard from 02-05 detects 12+ contiguous-token overlap between the
//    coordinator reply and the most recent sub-agent summary; on violation it
//    REWRITES the reply to a citation-only fallback. The user sees the
//    rewritten content, never the original smuggled prose.
//
// 3. data-claim-id forwarding for onebrain_write_claim results — the chat
//    route extracts the claim ULID from the wrapper's JSON-shaped summary
//    (`{ claim: { id, ... }, claim_count_this_turn, elapsed_seconds }` per
//    src/agents/tools/onebrain.ts D-01 protocol) and emits a structured
//    data-claim-id chunk so 02-07's UI can render inline citations without
//    re-parsing tool-trace summaries.
//
//    Pre-CR-01 the route looked for a literal `claim:<ULID>` summary prefix
//    that the wrapper never emitted. The wrapper's response is structured
//    data, not a magic string; the route now JSON.parses the summary and
//    reads `parsed.claim.id` directly. See parseClaimIdFromSummary below.
//
// Iteration uses for-await per RESEARCH landmine #16 (do NOT collect via
// Promise.all — defeats streaming).

import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { runCoordinatorTurn } from '@/agents/coordinator.js';
import {
  adaptToUIMessageChunks,
  createClaimIdChunk,
  createStreamContext,
  createTextStartChunk,
  createTextEndChunk,
  createTextDeltaChunk,
} from '../streaming.js';
import { applyOutputGuard } from '@/agents/coordinator-output-guard.js';
import { logger } from '@/lib/log.js';

// ---------------------------------------------------------------------------
// Tool-ID and agent-ID constants — match against these LITERALS via exact
// equality. NEVER substring-match (T-02-CHAT-02 mitigation).
// The `mcp__<server>__<tool>` form is set by createSdkMcpServer + tool() in
// src/agents/tools/onebrain.ts.
// ---------------------------------------------------------------------------

const TOOL_ONEBRAIN_WRITE_CLAIM = 'mcp__onebrain__onebrain_write_claim';
// Sub-agent identifier on SDK tool-event payloads (when present).
const SUB_AGENT_RESEARCH = 'research';

/**
 * Parse the claim ULID out of an onebrain_write_claim tool-result summary.
 *
 * The wrapper at src/agents/tools/onebrain.ts emits its tool result as
 *   `JSON.stringify({ claim, claim_count_this_turn, elapsed_seconds, ... })`
 * where `claim` is a full ClaimRow with `id` set to the ULID. We JSON.parse
 * the summary and pull the id off the embedded claim row.
 *
 * The legacy `claim:<ULID>` literal-prefix form is also accepted so any
 * synthetic test event using that shorthand keeps working.
 *
 * Returns undefined on any parse failure (caller skips data-claim-id forward).
 */
export function parseClaimIdFromSummary(summary: string): string | undefined {
  const trimmed = summary.trim();
  if (!trimmed) return undefined;
  // Legacy literal-prefix shorthand.
  if (trimmed.startsWith('claim:')) {
    const id = trimmed.slice('claim:'.length).trim();
    return id || undefined;
  }
  // Production JSON-object shape from onebrain_write_claim wrapper.
  if (!trimmed.startsWith('{')) return undefined;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const claim = parsed.claim;
    if (claim && typeof claim === 'object') {
      const id = (claim as Record<string, unknown>).id;
      if (typeof id === 'string' && id.length > 0) return id;
    }
  } catch {
    // fall through
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// extractUserMessage — pulls the user's text from the request body, handling
// BOTH the AI SDK chat-protocol shape AND the legacy flat-string shapes.
// Exported so tests can drive it directly without standing up the route.
//
// Resolution order (first non-empty wins):
//   1. AI SDK shape — body.messages: Array<{ role, parts?, content? }>
//      Find the LAST message with role === 'user'. Extract text from:
//        a. parts[] — concatenate every entry where type === 'text'
//        b. content (string fallback for older AI SDK versions)
//   2. Legacy flat shapes — body.message / body.prompt / body.userMessage
//      (kept for the existing chat-sse spec and any one-off curl scripts that
//      post a flat `{ message: "..." }` body).
// ---------------------------------------------------------------------------

interface AiSdkTextPart {
  type?: string;
  text?: unknown;
}

interface AiSdkMessage {
  role?: unknown;
  parts?: unknown;
  content?: unknown;
}

export function extractUserMessage(body: unknown): string {
  if (!body || typeof body !== 'object') return '';
  const b = body as Record<string, unknown>;

  // (1) AI SDK chat-protocol shape — body.messages[].
  if (Array.isArray(b.messages) && b.messages.length > 0) {
    const messages = b.messages as AiSdkMessage[];
    // Iterate from the end to find the last user message — that's the one
    // the user just submitted in this turn.
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (m?.role !== 'user') continue;

      // (1a) parts[] with text entries — current AI SDK 5/6 shape.
      if (Array.isArray(m.parts)) {
        const text = (m.parts as AiSdkTextPart[])
          .filter((p) => p?.type === 'text' && typeof p.text === 'string')
          .map((p) => p.text as string)
          .join('');
        if (text.length > 0) return text;
      }

      // (1b) content string — older AI SDK shape.
      if (typeof m.content === 'string' && m.content.length > 0) {
        return m.content;
      }

      // Found a user message but couldn't extract text — fall through to the
      // legacy fallback rather than picking up an earlier-turn user message.
      break;
    }
  }

  // (2) Legacy flat shapes.
  const flat =
    (typeof b.message === 'string' ? b.message : undefined) ??
    (typeof b.prompt === 'string' ? b.prompt : undefined) ??
    (typeof b.userMessage === 'string' ? b.userMessage : undefined);
  return flat ?? '';
}

export const chatRoute = new Hono();

chatRoute.post('/chat', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const message = extractUserMessage(body);

  if (!message) {
    return c.json({ error: 'missing required body field: message (string)' }, 400);
  }

  logger.info({ messageLength: message.length }, 'POST /chat');

  return streamSSE(c, async (stream) => {
    let accumulatedReply = '';
    let lastSubAgentSummary: string | undefined;
    const claimIds: string[] = [];

    // Single text-stream identity for this turn — required by AI SDK 6's
    // UIMessageChunk shape. text-start / text-delta+ / text-end ALL share this
    // same id so assistant-ui's transport links them into one streamed block.
    // (node_modules/ai/dist/index.d.ts:2160-2170)
    const streamId = randomUUID();
    // Per-request adapter state (CR-01): tool_use_id → tool_name and
    // parent_tool_use_id → subagent_type are correlated across the iterator
    // so production user/tool_result events resolve to the canonical full
    // tool name and surface the originating sub-agent in agentId.
    const ctx = createStreamContext(streamId);
    let textStreamOpen = false;

    try {
      // Open the text stream BEFORE iterating — assistant-ui's transport
      // needs the text-start chunk before any text-delta to begin rendering.
      await stream.writeSSE({
        data: JSON.stringify(createTextStartChunk(streamId)),
      });
      textStreamOpen = true;

      for await (const ev of runCoordinatorTurn(message)) {
        for (const chunk of adaptToUIMessageChunks(ev, ctx)) {
          // Suppress in-stream `finish` chunks — message-end / done / result
          // events from the SDK iterator each map to {type: 'finish'} but the
          // canonical finish (with the matching text-end) is emitted ONCE
          // post-loop. Letting these slip through would close the UI's text
          // stream prematurely (before text-end lands) and assistant-ui's
          // transport would orphan any subsequent chunks.
          if (chunk.type === 'finish') continue;

          // Track text deltas for the output-guard accumulator
          if (chunk.type === 'text-delta') {
            accumulatedReply += chunk.delta;
          } else if (
            chunk.type === 'data-tool-trace' &&
            chunk.data.phase === 'result'
          ) {
            const tool = chunk.data.tool;
            const agentId = chunk.data.agentId;

            // Capture sub-agent summary if this result came from the research
            // sub-agent. Match on the EXACT agentId field — never on tool
            // substring. Production agentId is resolved by the adapter via
            // parent_tool_use_id → subagent_type chain (D-06).
            if (
              agentId === SUB_AGENT_RESEARCH &&
              typeof chunk.data.summary === 'string'
            ) {
              lastSubAgentSummary = chunk.data.summary;
            }

            // Capture written claim IDs from onebrain_write_claim results.
            // The tool ID match MUST be exact (full MCP prefix); the summary
            // parser handles BOTH the production JSON-object shape AND the
            // legacy `claim:<ULID>` literal-prefix shorthand for tests.
            if (
              tool === TOOL_ONEBRAIN_WRITE_CLAIM &&
              typeof chunk.data.summary === 'string'
            ) {
              const id = parseClaimIdFromSummary(chunk.data.summary);
              if (id) {
                claimIds.push(id);
                // Forward as a structured data-claim-id chunk so the UI can
                // render the inline citation without re-parsing the trace.
                await stream.writeSSE({
                  data: JSON.stringify(createClaimIdChunk(id, tool)),
                });
              }
            }
          }

          await stream.writeSSE({ data: JSON.stringify(chunk) });
        }
      }

      // Apply output guard over accumulated reply (D-06 last-line-of-defense).
      // Only fires when a sub-agent summary was captured this turn — turns
      // without sub-agent invocations skip the guard (no-op).
      if (lastSubAgentSummary) {
        const guard = applyOutputGuard(
          accumulatedReply,
          lastSubAgentSummary,
          claimIds,
        );
        if (guard.violation) {
          logger.warn(
            { maxOverlap: guard.maxOverlap, claimIds: claimIds.length },
            'chat route: output guard rewrite triggered',
          );
          // Emit a system trace chunk noting the rewrite, then the rewritten reply.
          await stream.writeSSE({
            data: JSON.stringify({
              type: 'data-tool-trace',
              data: {
                phase: 'result',
                tool: 'guardrail.prose_smuggling',
                summary: 'reply rewritten by output guard',
              },
            }),
          });
          await stream.writeSSE({
            data: JSON.stringify(
              createTextDeltaChunk(streamId, '\n\n' + guard.reply),
            ),
          });
        }
      }

      // Close the text stream with the matching id BEFORE the finish chunk
      // so assistant-ui's transport finalizes the rendered text block.
      await stream.writeSSE({
        data: JSON.stringify(createTextEndChunk(streamId)),
      });
      textStreamOpen = false;

      await stream.writeSSE({ data: JSON.stringify({ type: 'finish' }) });
    } catch (err) {
      logger.error({ err }, 'chat SSE error');
      // Best-effort close any open text stream so the UI doesn't render a
      // half-open block before the error chunk lands.
      if (textStreamOpen) {
        try {
          await stream.writeSSE({
            data: JSON.stringify(createTextEndChunk(streamId)),
          });
        } catch {
          // swallow — we're already in an error path
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
