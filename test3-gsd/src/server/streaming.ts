// src/server/streaming.ts
// SDK event → AI SDK 6 native UIMessageChunk adapter.
//
// Spec authority:
//   - .planning/phases/02-agents-and-chat/02-RESEARCH.md §3.2 (lines 122-144) — five event-mapping rules
//   - .planning/phases/02-agents-and-chat/02-AI-SPEC.md §3.2 (lines 122-144) — UIMessageChunk shape contract
//   - .planning/phases/02-agents-and-chat/02-AI-SPEC.md "Common Pitfalls" #8 (line 300) — adapter is mandatory
//   - .planning/phases/02-agents-and-chat/02-RESEARCH.md landmine #14 (don't pipe SDK events directly)
//   - .planning/phases/02-agents-and-chat/02-RESEARCH.md landmine #15 (hooks must be non-blocking)
//   - .planning/phases/02-agents-and-chat/02-RESEARCH.md landmine #16 (for await, not Promise.all)
//   - node_modules/ai/dist/index.d.ts lines 2151-2278 — AI SDK 6 UIMessageChunk + DataUIMessageChunk
//
// Field-shape contract — AI SDK 6 native (the ESCAPE from 02-06's deviation):
//   - text-delta: { type: 'text-delta', id: string, delta: string }
//     MUST be bookended with text-start { type: 'text-start', id } and
//     text-end { type: 'text-end', id } using the SAME id across all three.
//     The route owns the id (one per turn) and emits the bookends; the adapter
//     emits text-delta chunks tagged with the route-supplied id.
//   - error: { type: 'error', errorText: string }
//   - data-* (DataUIMessageChunk per dist/index.d.ts:2151):
//       { type: `data-${NAME}`, id?: string, data: T, transient?: boolean }
//   - finish: { type: 'finish', finishReason?, messageMetadata? } (existing
//     bare {type: 'finish'} is a valid subset)
//
// 02-06 shipped a Phase-2-spec shorthand ({type, text} / {type, value}) and
// documented the AI SDK 6 native shape as a follow-up. This file IS that
// follow-up — assistant-ui's transport silently dropped chunks that didn't
// match the native UIMessageChunk discriminated union, so chat replies never
// rendered in the browser despite the SSE stream working end-to-end.

import { EventEmitter } from 'node:events';
import { logger } from '@/lib/log.js';

// UIMessageChunk shapes per AI SDK 6 (node_modules/ai/dist/index.d.ts:2159).
// Only the variants this app emits are typed here — assistant-ui's transport
// validates the type string against the SDK's full union, so as long as the
// type literal + required fields match, the chunk is accepted.
export type UIMessageChunk =
  | { type: 'text-start'; id: string }
  | { type: 'text-delta'; id: string; delta: string }
  | { type: 'text-end'; id: string }
  | {
      type: 'data-tool-trace';
      id?: string;
      data: {
        phase: 'start' | 'result';
        tool: string;
        args?: unknown;
        summary?: string;
        agentId?: string;
      };
    }
  | {
      type: 'data-wiki-citation';
      id?: string;
      data: { topicSlug: string; excerpt: string; vaultRelPath: string };
    }
  | {
      type: 'data-claim-id';
      id?: string;
      data: { claimId: string; sourceTool: string };
    }
  | {
      type: 'data-recompile-result';
      id?: string;
      data: {
        pages_written: number;
        pages_skipped: number;
        run_id: string;
        error?: string;
      };
    }
  | { type: 'finish'; finishReason?: string; messageMetadata?: unknown }
  | { type: 'error'; errorText: string };

// ---------------------------------------------------------------------------
// Custom-chunk constructors (DataUIMessageChunk shape — `data` field, not `value`)
// Used by the chat route AND by any in-stream injection point (e.g., the chat
// route forwards a `data-claim-id` chunk when an onebrain_write_claim tool
// result lands).
// ---------------------------------------------------------------------------

export function createToolTraceChunk(
  phase: 'start' | 'result',
  tool: string,
  args?: unknown,
  summary?: string,
  agentId?: string,
): UIMessageChunk {
  return {
    type: 'data-tool-trace',
    data: { phase, tool, args, summary, agentId },
  };
}

export function createWikiCitationChunk(
  topicSlug: string,
  excerpt: string,
  vaultRelPath: string,
): UIMessageChunk {
  return {
    type: 'data-wiki-citation',
    data: { topicSlug, excerpt, vaultRelPath },
  };
}

export function createClaimIdChunk(
  claimId: string,
  sourceTool: string,
): UIMessageChunk {
  return {
    type: 'data-claim-id',
    data: { claimId, sourceTool },
  };
}

export function createRecompileResultChunk(result: {
  pages_written: number;
  pages_skipped: number;
  run_id: string;
  error?: string;
}): UIMessageChunk {
  return {
    type: 'data-recompile-result',
    data: result,
  };
}

// ---------------------------------------------------------------------------
// text-delta constructor — emits the AI SDK 6 native shape with the
// route-supplied stream id.
// ---------------------------------------------------------------------------
export function createTextDeltaChunk(id: string, delta: string): UIMessageChunk {
  return { type: 'text-delta', id, delta };
}

export function createTextStartChunk(id: string): UIMessageChunk {
  return { type: 'text-start', id };
}

export function createTextEndChunk(id: string): UIMessageChunk {
  return { type: 'text-end', id };
}

// ---------------------------------------------------------------------------
// Helpers for SDK content-block extraction
// The Claude Agent SDK 0.2.119 emits `SDKAssistantMessage { type: 'assistant',
// message: BetaMessage }` whose `content[]` array contains text/tool_use blocks.
// `SDKPartialAssistantMessage { type: 'stream_event', event: BetaRawMessageStreamEvent }`
// carries content-block deltas. Tool results arrive in user messages with
// content blocks of `type: 'tool_result'` (or `mcp_tool_result`).
//
// Per the installed SDK's underlying @anthropic-ai/sdk types
// (node_modules/.../resources/beta/messages/messages.d.ts):
//   - BetaToolUseBlock      { id, input, name, type: 'tool_use' }
//   - BetaMCPToolUseBlock   { id, input, name, server_name, type: 'mcp_tool_use' }
//   - BetaToolResultBlockParam      { tool_use_id, content, is_error, type: 'tool_result' }
//   - BetaMCPToolResultBlock        { tool_use_id, content, is_error, type: 'mcp_tool_result' }
// ---------------------------------------------------------------------------

interface ToolUseBlock {
  type: 'tool_use' | 'mcp_tool_use';
  id?: string;
  name?: string;
  server_name?: string;
  input?: unknown;
}

interface TextBlock {
  type: 'text';
  text?: string;
}

interface ToolResultBlock {
  type: 'tool_result' | 'mcp_tool_result';
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
}

/**
 * CR-01 Bug 3 fix: do NOT truncate the summary in the adapter. Downstream
 * parsers (e.g., parseRunCompileSummary in src/server/routes/recompile.ts)
 * need the full JSON to extract pages_written / pages_skipped / run_id for the
 * D-18 system message. UI display truncation (e.g., src/ui/components/ToolTrace.tsx
 * uses `summary.slice(0, 80)`) happens at render time, not in the event adapter.
 */
function summarizeResult(result: unknown): string | undefined {
  if (result === undefined || result === null) return undefined;
  if (typeof result === 'string') return result;
  // SDK MCP tool results often arrive as Array<BetaTextBlock> shaped like
  //   [ { type: 'text', text: '...' } ]
  // Flatten that down to the text payload so downstream parsers see the
  // wrapper's actual JSON instead of `[{"type":"text","text":"..."}]`.
  if (Array.isArray(result)) {
    const parts = result
      .filter(
        (b): b is { type: 'text'; text: string } =>
          b !== null &&
          typeof b === 'object' &&
          (b as { type?: unknown }).type === 'text' &&
          typeof (b as { text?: unknown }).text === 'string',
      )
      .map((b) => b.text);
    if (parts.length > 0) return parts.join('');
  }
  try {
    const json = JSON.stringify(result);
    return json ? json : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Compose the canonical full tool name as it appears in `allowedTools` and on
 * downstream chunk consumers (chat.ts / recompile.ts). MCP tools are surfaced
 * to the SDK as `mcp__<server>__<tool>`; standard tool_use blocks already
 * carry the canonical name.
 */
function fullToolName(block: ToolUseBlock): string {
  if (block.type === 'mcp_tool_use' && block.server_name && block.name) {
    return `mcp__${block.server_name}__${block.name}`;
  }
  return block.name ?? 'unknown';
}

// ---------------------------------------------------------------------------
// StreamContext — per-request state used to correlate SDK events.
//
// CR-01 Bug 1 fix: production SDK tool_result blocks carry only `tool_use_id`,
// not the originating tool name. We therefore maintain a per-request map
// (id → name) populated when the assistant emits tool_use blocks, and consult
// that map when the user message ferries the tool_result back. The map is
// per-request (not module-level) so concurrent chat/recompile streams cannot
// leak entries into each other (Phase 2 is single-user but the discipline
// matters; future Phase 4 multi-tenant work would have to refactor module
// state regardless).
//
// WR-02 (D-06 sub-agent attribution): the SDK does not stamp `agentId` on
// tool_result events. Instead, sub-agent invocations show up as the coordinator
// emitting a `tool_use` block whose name is the SDK's Agent/Task tool with
// `input.subagent_type` set; subsequent assistant/user messages from inside
// that sub-agent carry `parent_tool_use_id` referring back to that id. We
// record `parent_tool_use_id → subagent_type` so the chat route's D-06 capture
// gate (agentId === SUB_AGENT_RESEARCH) actually fires in production.
// ---------------------------------------------------------------------------

export interface StreamContext {
  /**
   * Stable text-stream id for AI SDK 6 native text-delta chunks. The route
   * generates this once per turn (crypto.randomUUID()) and emits matching
   * text-start / text-end bookends.
   */
  streamId: string;
  /**
   * tool_use_id → canonical tool name. Populated by the adapter when assistant
   * tool_use / mcp_tool_use blocks are seen; consulted when the matching
   * tool_result / mcp_tool_result arrives.
   */
  toolNameMap: Map<string, string>;
  /**
   * parent_tool_use_id → sub-agent type (e.g., 'research', 'compilation').
   * Populated when the coordinator invokes the SDK Agent/Task tool with
   * input.subagent_type set; consulted when subsequent messages bear a
   * matching parent_tool_use_id so the chunk's `agentId` is set correctly.
   */
  subAgentByParentId: Map<string, string>;
}

export function createStreamContext(streamId: string): StreamContext {
  return {
    streamId,
    toolNameMap: new Map(),
    subAgentByParentId: new Map(),
  };
}

/**
 * Resolve the active sub-agent type for a given parent_tool_use_id chain.
 * Returns undefined if no Agent/Task tool_use was recorded.
 */
function resolveAgentId(
  ctx: StreamContext,
  parentToolUseId: string | null | undefined,
): string | undefined {
  if (!parentToolUseId) return undefined;
  return ctx.subAgentByParentId.get(parentToolUseId);
}

/**
 * Best-effort extraction of subagent_type from a tool_use block invoking the
 * SDK Agent/Task tool. The SDK accepts both `Task` (legacy) and `Agent` (new)
 * tool names; both carry `input.subagent_type` per AgentDefinition wiring.
 */
function extractSubAgentType(block: ToolUseBlock): string | undefined {
  if (block.type !== 'tool_use') return undefined;
  if (block.name !== 'Agent' && block.name !== 'Task') return undefined;
  const input = block.input;
  if (!input || typeof input !== 'object') return undefined;
  const subType = (input as Record<string, unknown>).subagent_type;
  return typeof subType === 'string' ? subType : undefined;
}

// ---------------------------------------------------------------------------
// adaptToUIMessageChunks (plural — production-shape correctness, CR-01)
//
// Maps a Claude Agent SDK event (or the spec-flavor shorthand the chat-sse
// tests use) to ZERO OR MORE UIMessageChunks. The plural return shape lets a
// single fully-buffered SDKAssistantMessage with mixed content (e.g., a text
// block AND a tool_use block) surface both as separate chunks — the previous
// "first block wins" implementation silently dropped tool_use signals that
// landed alongside text.
//
// `ctx` (optional) is per-request state — the chat/recompile route creates one
// via createStreamContext(streamId) and threads it through every call so the
// adapter can:
//
//   - Resolve `tool_use_id → tool_name` on user/tool_result branches
//     (production tool_result blocks carry only the id — CR-01 Bug 1).
//   - Resolve `parent_tool_use_id → subagent_type` so the D-06 prose-smuggling
//     guard's agentId capture (chat.ts: agentId === SUB_AGENT_RESEARCH) fires
//     in production (WR-02).
//
// Returns [] for events with no UI surfacing (internal SDK lifecycle messages —
// system, control_response, auth_status, etc.). Routes flatten and SSE-send.
//
// Five mapping rules per RESEARCH §3.2:
//   1. text-delta passthrough (also handles content_block_delta + assistant text)
//   2. tool-call-start → data-tool-trace { phase: 'start', tool, args, agentId }
//   3. tool-call-result → data-tool-trace { phase: 'result', tool, summary, agentId }
//   4. message-end / done / finish → finish
//   5. error → error { errorText: string }
// ---------------------------------------------------------------------------

const DEFAULT_STREAM_ID = 'default-stream';

/**
 * Per-event entrypoint that returns ZERO OR MORE UIMessageChunks. Use this
 * in the route's for-await loop when you've allocated a per-request
 * StreamContext (recommended for production).
 */
export function adaptToUIMessageChunks(
  sdkEvent: unknown,
  ctx?: StreamContext,
): UIMessageChunk[] {
  if (!sdkEvent || typeof sdkEvent !== 'object') return [];
  const ev = sdkEvent as Record<string, unknown>;
  const streamId = ctx?.streamId ?? DEFAULT_STREAM_ID;
  const out: UIMessageChunk[] = [];

  // -----------------------------------------------------------------------
  // Rule 1: text-delta — chat-sse spec shorthand AND SDK partial message events
  // -----------------------------------------------------------------------

  // Spec shorthand emitted by tests + the simplified plan stub:
  //   { type: 'text-delta', text: '...' }  (legacy shorthand — adapt to native)
  //   { type: 'text-delta', delta: '...' } (already-native — passthrough)
  if (ev.type === 'text-delta') {
    const delta =
      typeof ev.delta === 'string'
        ? ev.delta
        : typeof ev.text === 'string'
          ? ev.text
          : undefined;
    if (delta !== undefined) {
      out.push({ type: 'text-delta', id: streamId, delta });
      return out;
    }
  }

  // SDK 0.2.119 partial assistant message (stream_event with content_block_delta):
  //   { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: '...' } } }
  if (ev.type === 'stream_event' && ev.event && typeof ev.event === 'object') {
    const innerEv = ev.event as Record<string, unknown>;
    if (innerEv.type === 'content_block_delta' && innerEv.delta && typeof innerEv.delta === 'object') {
      const delta = innerEv.delta as Record<string, unknown>;
      if (delta.type === 'text_delta' && typeof delta.text === 'string') {
        out.push({ type: 'text-delta', id: streamId, delta: delta.text });
        return out;
      }
    }
    // Other stream_event subtypes (message_start, message_stop, etc.) — see Rule 4 below
    if (innerEv.type === 'message_stop') {
      out.push({ type: 'finish' });
      return out;
    }
  }

  // Some SDK versions emit a bare content_block_delta event:
  if (
    ev.type === 'content_block_delta' &&
    ev.delta &&
    typeof ev.delta === 'object' &&
    (ev.delta as Record<string, unknown>).type === 'text_delta' &&
    typeof (ev.delta as Record<string, unknown>).text === 'string'
  ) {
    out.push({
      type: 'text-delta',
      id: streamId,
      delta: (ev.delta as Record<string, unknown>).text as string,
    });
    return out;
  }

  // SDK 0.2.119 SDKAssistantMessage with fully-buffered content blocks:
  //   { type: 'assistant', message: { content: [{ type: 'text', text }, { type: 'tool_use', id, name }] },
  //     parent_tool_use_id: '<id>' | null }
  //
  // Iterate ALL content blocks (WR-05 fix) and emit one chunk per renderable
  // block. Track `parent_tool_use_id` for sub-agent attribution (WR-02), and
  // populate the toolNameMap on every tool_use / mcp_tool_use block so the
  // matching tool_result lookup later succeeds (CR-01 Bug 1).
  if (ev.type === 'assistant' && ev.message && typeof ev.message === 'object') {
    const msg = ev.message as Record<string, unknown>;
    const parentId = ev.parent_tool_use_id as string | null | undefined;
    const agentId = ctx ? resolveAgentId(ctx, parentId) : undefined;

    const content = msg.content;
    if (Array.isArray(content) && content.length > 0) {
      for (const block of content as Array<TextBlock | ToolUseBlock>) {
        if (!block || typeof block !== 'object') continue;
        if (
          block.type === 'text' &&
          typeof (block as TextBlock).text === 'string' &&
          ((block as TextBlock).text ?? '').length > 0
        ) {
          out.push({
            type: 'text-delta',
            id: streamId,
            delta: (block as TextBlock).text as string,
          });
          continue;
        }
        if (block.type === 'tool_use' || block.type === 'mcp_tool_use') {
          const toolBlock = block as ToolUseBlock;
          const toolName = fullToolName(toolBlock);

          // Record id → name so the future tool_result event (which only carries
          // tool_use_id) can resolve back to the canonical tool name.
          if (ctx && toolBlock.id && toolName !== 'unknown') {
            ctx.toolNameMap.set(toolBlock.id, toolName);
          }

          // If this is the SDK Agent/Task tool launching a sub-agent, record
          // the id → subagent_type mapping so subsequent messages with
          // matching parent_tool_use_id surface their agentId (WR-02).
          if (ctx && toolBlock.id) {
            const subType = extractSubAgentType(toolBlock);
            if (subType) {
              ctx.subAgentByParentId.set(toolBlock.id, subType);
            }
          }

          out.push(
            createToolTraceChunk(
              'start',
              toolName,
              toolBlock.input,
              undefined,
              agentId,
            ),
          );
        }
      }
      if (out.length > 0) return out;
    }
  }

  // SDK user message carrying tool_result blocks:
  //   { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id, content }] },
  //     parent_tool_use_id: '<id>' | null, tool_use_result?: unknown }
  //
  // Iterate ALL tool_result blocks. Resolve tool_use_id → real tool name from
  // the per-request map (CR-01 Bug 1) and surface agentId from
  // parent_tool_use_id chain (WR-02).
  if (ev.type === 'user' && ev.message && typeof ev.message === 'object') {
    const msg = ev.message as Record<string, unknown>;
    const parentId = ev.parent_tool_use_id as string | null | undefined;
    const agentId = ctx ? resolveAgentId(ctx, parentId) : undefined;

    const content = msg.content;
    if (Array.isArray(content) && content.length > 0) {
      for (const block of content as ToolResultBlock[]) {
        if (
          !block ||
          typeof block !== 'object' ||
          (block.type !== 'tool_result' && block.type !== 'mcp_tool_result')
        ) {
          continue;
        }
        const toolUseId = block.tool_use_id;
        let resolvedName: string | undefined;
        if (ctx && toolUseId) {
          resolvedName = ctx.toolNameMap.get(toolUseId);
        }
        if (!resolvedName) {
          // Graceful degradation — log a warning so we can spot escapes from
          // the production correlation path. Routes match on full tool name
          // so an unmapped id will silently miss any data-claim-id /
          // data-recompile-result forwarding, which we want surfaced in pino.
          if (toolUseId) {
            logger.warn(
              { toolUseId },
              'streaming: tool_result has no matching tool_use in toolNameMap — emitting raw id as tool name (downstream matchers will miss)',
            );
          }
          resolvedName = toolUseId ?? 'unknown';
        }
        out.push(
          createToolTraceChunk(
            'result',
            resolvedName,
            undefined,
            summarizeResult(block.content),
            agentId,
          ),
        );
      }
      if (out.length > 0) return out;
    }
  }

  // -----------------------------------------------------------------------
  // Rule 2: tool-call-start (spec shorthand + SDK tool_use shorthand)
  // -----------------------------------------------------------------------
  if (ev.type === 'tool-call-start' || ev.type === 'tool_use') {
    out.push(
      createToolTraceChunk(
        'start',
        (ev.tool as string | undefined) ?? (ev.name as string | undefined) ?? 'unknown',
        ev.args ?? ev.input,
        undefined,
        ev.agentId as string | undefined,
      ),
    );
    return out;
  }

  // -----------------------------------------------------------------------
  // Rule 3: tool-call-result (spec shorthand + SDK tool_result shorthand)
  // -----------------------------------------------------------------------
  if (ev.type === 'tool-call-result' || ev.type === 'tool_result') {
    const summary =
      typeof ev.summary === 'string'
        ? ev.summary
        : summarizeResult(ev.result ?? ev.content);
    out.push(
      createToolTraceChunk(
        'result',
        (ev.tool as string | undefined) ?? (ev.name as string | undefined) ?? 'unknown',
        undefined,
        summary,
        ev.agentId as string | undefined,
      ),
    );
    return out;
  }

  // -----------------------------------------------------------------------
  // Rule 4: message-end / done / finish
  // -----------------------------------------------------------------------
  if (
    ev.type === 'message-end' ||
    ev.type === 'message_stop' ||
    ev.type === 'done' ||
    ev.type === 'finish' ||
    // SDK 0.2.119 result message marks the end of the query() turn
    (ev.type === 'result' && (ev.subtype === 'success' || ev.subtype === 'error'))
  ) {
    out.push({ type: 'finish' });
    return out;
  }

  // -----------------------------------------------------------------------
  // Rule 5: errors
  // -----------------------------------------------------------------------
  if (ev.type === 'error' || ev.error) {
    const errSource = ev.type === 'error' ? ev.error ?? ev.message : ev.error;
    let errMsg: string;
    if (typeof errSource === 'string') {
      errMsg = errSource;
    } else if (errSource && typeof errSource === 'object' && 'message' in errSource) {
      errMsg = String((errSource as { message: unknown }).message);
    } else {
      try {
        errMsg = JSON.stringify(errSource) ?? 'unknown SDK error';
      } catch {
        errMsg = 'unknown SDK error';
      }
    }
    out.push({ type: 'error', errorText: errMsg });
    return out;
  }

  // Unrecognized event — log debug, return [] (filtered out before SSE send).
  // System messages, control responses, auth_status, prompt_suggestion, etc.
  // all fall through here intentionally — the UI does not surface them.
  logger.debug({ evType: ev.type }, 'streaming.adaptToUIMessageChunks: event unmapped');
  return out;
}

/**
 * Backward-compatible wrapper that returns the FIRST chunk produced by
 * adaptToUIMessageChunks (or null if none). Existing callers + tests that
 * assert single-chunk behavior continue to work; new callers in production
 * routes use adaptToUIMessageChunks directly so they can flatten arrays.
 *
 * The legacy second-arg signature (streamId: string) is preserved for the
 * test suite. Production routes pass a StreamContext instead.
 */
export function adaptToUIMessageChunk(
  sdkEvent: unknown,
  streamIdOrCtx: string | StreamContext = DEFAULT_STREAM_ID,
): UIMessageChunk | null {
  const ctx: StreamContext =
    typeof streamIdOrCtx === 'string'
      ? { streamId: streamIdOrCtx, toolNameMap: new Map(), subAgentByParentId: new Map() }
      : streamIdOrCtx;
  const chunks = adaptToUIMessageChunks(sdkEvent, ctx);
  return chunks.length > 0 ? chunks[0] : null;
}

// ---------------------------------------------------------------------------
// ToolTraceSink (non-blocking per RESEARCH landmine #15)
// EventEmitter is the canonical Node primitive for this pattern. Hooks call
// `globalToolTraceSink.emit('event', payload)` and return immediately; the
// chat route attaches `.on('event', listener)` to forward over SSE.
//
// EventEmitter.emit is synchronous in Node.js but listeners that call into
// async work resolve on their own microtasks — emit-and-return semantics hold
// for the caller (the SDK hook returns immediately).
// ---------------------------------------------------------------------------

export class ToolTraceSink extends EventEmitter {
  emit(event: string | symbol, ...args: unknown[]): boolean {
    return super.emit(event, ...args);
  }
}

export const globalToolTraceSink = new ToolTraceSink();
