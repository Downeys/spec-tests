# Phase 2 Research — Agents and Chat

**Status:** Draft
**Date:** 2026-04-26
**Domain:** Multi-agent orchestration (Claude Agent SDK) + streaming chat (Hono+SSE+assistant-ui+Vercel AI SDK 6) + hybrid search (PG full-text + pgvector + tag) + tool-permission gating
**Confidence:** HIGH (stack locked Phase 1; assistant-ui patterns idiomatic; Tavily/Anthropic SDKs well-documented). MEDIUM on Claude Agent SDK 0.x (rapidly evolving) and DATA-09 ranking choice (multiple valid).

## 1. Overview

Phase 2 stitches the agent layer onto the Phase 1 skeleton. The locked stack (Hono, `@anthropic-ai/claude-agent-sdk ~0.2.x`, `@assistant-ui/react ~0.12.x`, Vercel AI SDK 6, `@tavily/core`, `@ai-sdk/anthropic`) and the agent topology (coordinator + research sub-agent + compilation sub-agent) are decided in CONTEXT.md and AI-SPEC.md — research need only resolve **how**.

**Three load-bearing "how" questions** drive everything else:

1. **Tool-permission boundary** — the SDK's per-agent `tools[]` allowlist is the protocol-layer enforcement of single-writer-to-vault (COMP-10/Pitfall 5). `vault_write_atomic` appears only on the `compilation` sub-agent's allowlist. The coordinator and the research sub-agent have no path to the tool — the SDK reports tool-not-found before the implementation runs. Belt-and-braces: a runtime guard inside `tools/vault.ts` asserts caller-agent === 'compilation' (Section 3.1).
2. **Streaming pipeline** — Hono SSE handler iterates the SDK's async-iterator from `query()`, maps each event to a Vercel AI SDK 6 `UIMessageChunk`, forwards via SSE to assistant-ui's `AssistantChatTransport` in the browser. Tool events fan out to two sinks: the SSE stream (UI-03 trace) and optional Phoenix tracing (Section 3.2).
3. **Hybrid search (DATA-09)** — Postgres FTS `tsvector` over `claims.text + rationale`, plus pgvector cosine on the existing `embedding vector(1024)`, plus tag-array intersection on `topic_tags`/`framework_tags` (existing GIN indexes). Combine with weighted-sum or RRF on the small fixture; no need for `ts_rank_cd` tuning at single-user scale (Section 3.3).

**Primary recommendation — wave order:** Wave 0 — install + scaffold (`npx assistant-ui init`, env vars, Phoenix opt-in, Vitest fixtures dir). Wave 1 — `onebrain_search` (DATA-09) + the three quant/source guards in `repo.writeClaim()` and tool wrappers (these are coercive, must land before any agent code can call them). Wave 2 — agent definitions + tools + coordinator. Wave 3 — Hono routes + SSE adapter + `bsp serve`. Wave 4 — assistant-ui frontend (Thread, Composer, RecompileButton, ToolTrace, WikiCitation). Wave 5 — Vitest integration tests covering all 7 AI-SPEC eval dimensions.

**Phase-1 carry-forward landmines (do not re-discover):** `voyageai@0.2.1` ESM build is broken — `createRequire` workaround already in `embed.ts`; `commander` rejects `-vv` short flag; vitest integration files need `fileParallelism: false` on advisory-locked migrations; internal `@/*` imports require `.js` suffix under NodeNext+paths; `env.ts` uses Zod and `VOYAGE_API_KEY` allows empty (Phase 2 must require `ANTHROPIC_API_KEY` and `TAVILY_API_KEY` non-empty at `bsp serve` boot). Verify Tavily and Anthropic SDKs are ESM-clean at install — fall back to `createRequire` if not.

## 2. Per-Requirement Implementation Notes

### INFRA-04 — Hono backend with health check + streaming /chat
Hono 4.x + `@hono/node-server` boot from `src/server/index.ts`. Routes: `GET /health` (returns `{ status, version, db_ok }`), `POST /chat` (SSE stream — bridges coordinator), `POST /recompile` (SSE — invokes compilation sub-agent), optional `GET /onebrain/:id` for debug. SSE shape: emit `data: <UIMessageChunk JSON>\n\n` per event using Hono's `streamSSE` helper. CORS for Vite dev (port 5173 → Hono port 3000); none in production where Hono serves the built UI from `dist/ui`. New CLI subcommand `bsp serve` (Phase 1 D-03 carry-forward — same lib code reused).
```ts
// src/server/routes/chat.ts
app.post('/chat', async (c) => streamSSE(c, async (stream) => {
  const { message } = await c.req.json();
  for await (const ev of runCoordinatorTurn(message)) {
    await stream.writeSSE({ data: JSON.stringify(adaptToUIMessageChunk(ev)) });
  }
}));
```

### DATA-09 — Hybrid search (FTS + vector + tag)
New file `src/onebrain/search.ts`; new repo function `searchClaims({ q, embedding, tags?, limit=20 })`. Strategy: weighted-sum on the Phase 1 fixture (claim count <50 — RRF overkill). Inputs: query text → Voyage embed (reuse `embed()`); optional tag filter as `text[]`. SQL is one query (Section 3.3). Index needs to be added in a new migration: `CREATE INDEX claims_text_fts ON claims USING gin (to_tsvector('english', coalesce(text,'') || ' ' || coalesce(rationale,'')));` (existing HNSW on `embedding`, GIN on `topic_tags`/`framework_tags` already there from Phase 1). Tool wrapper `onebrain_search` exposes the same signature to agents.

### AGENT-01 — Coordinator agent + CLAUDE.md identity
`src/agents/coordinator.ts` exports `runCoordinatorTurn(userMessage): AsyncIterable<SDKEvent>`. Built on `query()` from `@anthropic-ai/claude-agent-sdk`. Model: `claude-opus-4-7`. Loads identity via `settingSources: ['./CLAUDE.md']`. **The Phase-1 CLAUDE.md must be expanded** with: (a) write protocol (research → OneBrain rows first, never vault), (b) sub-agent usage rules (when to invoke `research`, when to invoke `compilation`), (c) D-07 pushback template (rule + action + path-forward), (d) D-09 hypothesis framing (`"confidence X — [[claim:01J9X…]]"`), (e) D-06 never-quote-sub-agent clause. Coordinator's `allowedTools` lists ONLY: `mcp__onebrain__*` (search, write_source, write_claim, write_edge). Explicitly NO `mcp__vault__*`, NO `mcp__tavily__*` (tavily is research-only).

### AGENT-02 — Research sub-agent (Tavily → claims rows)
`src/agents/definitions/research.ts`. Model: `claude-sonnet-4-6`. `outputSchema: ResearchOutputSchema` (Zod, in `src/onebrain/types.ts` per D-21). Tools: `mcp__tavily__tavily_search`, `mcp__tavily__tavily_extract`, `mcp__tavily__tavily_crawl`, `mcp__onebrain__onebrain_search`, `mcp__onebrain__onebrain_write_source`, `mcp__onebrain__onebrain_write_claim`, `mcp__onebrain__onebrain_write_edge`. Prompt opens with role + JSON shape example + tool palette + hard stops (D-01: ≤10 claims, ≤120s) + forbidden behaviors (no vault tools). The tool wrapper for `onebrain_write_claim` returns elapsed-seconds + claim-count on every call so the model can self-stop.

### AGENT-06 — Compilation sub-agent (sole `vault_write_atomic`)
`src/agents/definitions/compilation.ts`. Model: `claude-sonnet-4-6`. Tools: `mcp__onebrain__onebrain_search`, `mcp__vault__vault_read`, `mcp__vault__vault_write_atomic`. Prompt: thin wrapper that says "call `vault_write_atomic` with no args; it invokes Phase 1's `runCompile()` which is deterministic." The actual orchestration is the existing Phase 1 `runCompile()` from `src/compilation/runner.ts` — the sub-agent is an enforcement seam, not new compile logic. Its `outputSchema` is small: `{ pages_written: number, pages_skipped: number, run_id: string, error?: string }`.

### AGENT-07 — Sub-agents communicate via OneBrain rows only
Architectural rule, not a code surface. Verified by absence: no peer-to-peer `subAgentToSubAgent()` API exists in our wrappers. Coordinator passes a sub-agent's `claim_ids_written: string[]` to a *next* sub-agent (Phase 4 pattern); even then, the second sub-agent re-fetches from OneBrain via `onebrain_search` rather than receiving raw rows in-context. Verification (Section 5): grep for any function in `src/agents/` that accepts an SDK message-list parameter — there should be exactly one (the SDK's own `query()`).

### AGENT-08 — Source-row-required-before-claim guard
**Two layers.** Layer 1 (schema, coercive): `repo.writeClaim()` in `src/onebrain/repo.ts` adds a precondition — if `text` matches the TAM-shaped / ≥$1M pattern AND `cites_source_ids[]` is empty, throw `QuantitativeClaimRequiresSourceError`. Pattern in `src/onebrain/quant-pattern.ts`: regex `/\$\s*[\d,]+(\.\d+)?\s*(M|B|T|million|billion|trillion)/i` OR `/\b(TAM|SAM|SOM)\b/i`. Layer 2 (protocol, agent tool wrapper): `onebrain_write_claim` wrapper checks each `cites_source_ids[]` entry resolves to a source written either earlier in this turn's tool-call sequence or pre-existing in OneBrain at turn start. Belt-and-braces — both must pass.

### UI-01 — assistant-ui Thread + Composer
First executor task: `npx assistant-ui init --yes` from repo root (per UI-SPEC §"Design System"). This installs Tailwind v4 + shadcn primitives + assistant-ui's bundled Thread/Composer under `src/ui/components/{assistant-ui,ui}/`. Replace Phase 1 placeholder `App.tsx` with `<ThreadPrimitive.Root>` wrapping `<HeaderBar /> + <ThreadPrimitive.Viewport /> + <Composer />`. Runtime configured in `src/ui/runtime.ts` via `AssistantChatTransport({ api: '/chat' })` from `@assistant-ui/react-ai-sdk`. Vite proxy: `/chat`, `/recompile`, `/health` → `http://localhost:3000`.

### UI-02 — Streaming message rendering
Provided by assistant-ui out of the box once `AssistantChatTransport` is consuming `UIMessageChunk` from the SSE stream. Visual contract per UI-SPEC IC-1: bubble appears on first chunk, blinking cursor at end of streamed text, fade on stream-end. No custom render code required for streaming — the work is in the *adapter* (Section 3.2) that maps SDK events to AI SDK 6 chunk shapes.

### UI-03 — Tool-call trace visible
`src/ui/components/ToolTrace.tsx` per UI-SPEC component #5. Source of events: SDK `onToolCall`/`onToolResult` hooks → `toolTraceSink.emit(e)` in coordinator → forwarded over SSE as a custom `UIMessageChunk` with `type: 'data-tool-trace'` (AI SDK 6 supports custom `data-*` chunks for sidecar payloads). Frontend stores per-message tool events keyed by message ID. Default collapsed (D-11) with summary `▸ N tool calls (research, M tavily_extract, K onebrain_write_claim)`. Expanded view per D-12: `tavily_extract(url="…/pricing") → 4823 chars`. The intent message (D-08) is a *separate* assistant message, not inside the trace.

### UI-04 — Inline wiki chunks + Obsidian deeplink
`src/ui/components/WikiCitation.tsx` per UI-SPEC component #6. Trigger (D-13): coordinator-prompt clause — if user query maps to a topic with an existing `compile_artifacts.page_path`, surface excerpt above prose answer. Coordinator returns a custom AI SDK 6 chunk `data-wiki-citation` carrying `{ topicSlug, excerpt, vaultRelPath }`. Excerpt = first ≤200 words from the page's body (truncate at paragraph boundary). Deeplink: `obsidian://open?vault=<vaultName>&file=<urlEncodedRelPath>`. Vault name from a config value (default = `path.basename(vaultPath)`). Fallback "Copy path" button always rendered alongside (silent fallback per D-14 — no error popup).

### UI-06 — Manual recompile button + status indicator
`RecompileButton.tsx` + `RecompileStatus.tsx` in `src/ui/components/`. Button kicks `POST /recompile` → SSE stream of progress events. Status pill polls `GET /recompile/status` every 5s when idle (or reuses the SSE channel during in-flight). Idle copy (D-16): `Last compiled: 14:32 • 3 claims unwritten`. Dirty count formula: `SELECT count(*) FROM claims WHERE updated_at > (SELECT max(finished_at) FROM compile_runs WHERE error IS NULL)`. Slash command `/recompile` parsed by composer before submit (D-15). Post-success chat system message (D-18): `Recompiled: 1 page written, 0 skipped (run 01J9X…)`. UI text verbatim from UI-SPEC Copywriting Contract.

### RES-01 — Tavily integration (`@tavily/core`, search/extract/crawl)
`@tavily/core` is the official TS SDK (verify on install — fall back to REST `https://api.tavily.com/search` if SDK has ESM issues like Phase 1's voyageai). Three tools in `src/agents/tools/tavily.ts`:
```ts
import { tavily } from '@tavily/core';
const client = tavily({ apiKey: env.TAVILY_API_KEY });
export const tavily_search = tool('tavily_search',
  z.object({ query: z.string(), max_results: z.number().max(10).default(5) }),
  async ({ query, max_results }) => client.search(query, { searchDepth: 'advanced', maxResults: max_results }));
export const tavily_extract = tool('tavily_extract',
  z.object({ urls: z.array(z.string().url()).max(5) }),
  async ({ urls }) => client.extract(urls));
// tavily_crawl wired but NOT default per D-03 — reserved for explicit user "deep research" signal (Phase 4)
```
Default per-turn: search + extract on top 3–5 hits (D-03). Free tier is 1k credits/month — fine for dev.

### RES-02 — Research lands in sources + claims before any wiki update
Architectural property — falls out of (a) tool-permission boundary (research has no `vault_*`), (b) coordinator's allowlist also has no `vault_*`, (c) D-05 source-first ordering at the wrapper, (d) the recompile is a separate user-triggered turn. Verified at runtime by Section 5 probe: any vault file mtime within a research turn → fail.

### COMP-10 — Single-writer enforced at tool-permission level
Pure tool-permission gating per Section 3.1. `src/agents/definitions/coordinator.ts` and `src/agents/definitions/research.ts` MUST NOT list `mcp__vault__vault_write_atomic` in tools. Pre-commit grep + Vitest static-membership test (Section 5). Runtime guard inside the tool implementation as belt-and-braces.

### COMP-11 — Manual `/recompile` from chat
`POST /recompile` route → invokes compilation sub-agent only (not via the coordinator). Implementation: a tiny `query()` invocation with ONLY the compilation agent definition exposed, no coordinator-prompt. Slash command parity: composer detects leading `/recompile`, intercepts before sending to `/chat`, hits `/recompile` instead. Inline system message in chat on completion (D-18).

### CRIT-01 — Coordinator pushback on weak/unsourced claims
Lives in CLAUDE.md as the D-07 pushback template — verbatim per UI-SPEC Copywriting Contract: `That claim is TAM-shaped or ≥$1M and has no source attached. I haven't logged it yet — give me a source, or want me to research it?`. Three required components per AI-SPEC dimension #4 rubric: rule named, action named, path-forward named. Phase 2 Vitest pre-gate is a regex smoke check (presence of "hypothesis", "confidence", "source"); LLM-judge (Opus) calibration runs manually during dev with the 15-example reference dataset (AI-SPEC §"Reference Dataset"). Mechanized as Promptfoo EVAL-02 in Phase 4.

## 3. Cross-Cutting Concerns

### 3.1 Tool-Permission Boundary (the keystone)

**Pattern: per-agent allowlist (primary) + runtime guard (belt-and-braces).** The Claude Agent SDK enforces per-agent tool allowlists via the `tools[]` field on each `AgentDefinition`. The full MCP-prefixed tool ID (`mcp__<server>__<tool>`) MUST appear in the agent's `tools[]` for it to be invocable; absence = SDK reports tool-not-found before the implementation runs. This is the protocol-layer guarantee.

| Agent | Has `vault_write_atomic`? | Has tavily? | Has onebrain writes? |
|-------|---------------------------|-------------|----------------------|
| coordinator | NO | NO | YES (write_source/claim/edge + search) |
| research | NO | YES | YES |
| compilation | **YES (only)** | NO | search only (no writes) |

```ts
// src/agents/tools/vault.ts — Layer 2 belt-and-braces
export const vault_write_atomic = tool('vault_write_atomic', z.object({}), async (_, ctx) => {
  if (ctx?.agentId !== 'compilation') {
    throw new ToolPermissionDenied(`vault_write_atomic invoked by ${ctx?.agentId}, only 'compilation' allowed`);
  }
  return await runCompile({ vaultPath: env.VAULT_PATH });
});
```

**Why both layers:** the SDK's tool-not-found error happens before the function runs but only catches misconfigured `tools[]`. The runtime guard catches a different failure mode — accidental direct import-and-call from non-agent code paths (e.g., a Phase-3 lint script forgetting it must go through the sub-agent). Two failure modes, two guards.

**Verification:** static membership test (Section 5 probe COMP-10) + a precommit grep that fails CI if `vault_write_atomic` appears in any agent definition file other than `compilation.ts`.

### 3.2 Streaming Pipeline (Hono ↔ AI SDK 6 ↔ assistant-ui)

**Three-hop adapter pattern:**
```
SDK event (from query() async iterator)
  → adaptToUIMessageChunk(ev)        // src/server/streaming.ts
  → SSE frame ("data: {...}\n\n")    // hono streamSSE
  → AssistantChatTransport (browser) // @assistant-ui/react-ai-sdk
  → assistant-ui Thread renders
```

Adapter responsibilities (`src/server/streaming.ts`):
- SDK `text-delta` → UIMessageChunk `{ type: 'text-delta', text }`
- SDK `tool-call-start` → custom `{ type: 'data-tool-trace', value: { phase: 'start', tool, args } }`
- SDK `tool-call-result` → custom `{ type: 'data-tool-trace', value: { phase: 'result', tool, summary } }`
- SDK `message-end` → `{ type: 'finish', ... }`
- Errors → `{ type: 'error', error }`

**Wiki-citation surfacing** (UI-04) reuses the same `data-*` chunk pattern: `data-wiki-citation` carrying `{ topicSlug, excerpt, vaultRelPath }`.

**Hooks must be non-blocking.** AI-SPEC pitfall: hooks are fire-and-forget; doing real work inside `onToolCall` blocks the SDK event loop and stalls SSE. The trace sink is a non-blocking `EventEmitter` — emit, return, done.

**Phoenix tracing** (Section 7 of AI-SPEC) is opt-in via `PHOENIX_ENABLED=1`; OpenTelemetry `AnthropicInstrumentation` hooks the SDK calls automatically. Span attributes per AI-SPEC §6: `guardrail.violation`, `pushback.triggered`, `subagent.retry_count`, `compile.error`.

### 3.3 Hybrid Search SQL

**One query.** Three lanes (FTS, vector, tag), weighted-sum the scores, tag filter is hard (intersect, not weighted).

```sql
-- src/onebrain/search.ts: searchClaims({ q, embedding, tags?, limit })
WITH fts AS (
  SELECT id, ts_rank(to_tsvector('english', text || ' ' || coalesce(rationale,'')),
                     plainto_tsquery('english', $1)) AS fts_score
  FROM claims
  WHERE to_tsvector('english', text || ' ' || coalesce(rationale,'')) @@ plainto_tsquery('english', $1)
    AND ($3::text[] IS NULL OR topic_tags && $3 OR framework_tags && $3)
  ORDER BY fts_score DESC LIMIT 50
),
vec AS (
  SELECT id, 1 - (embedding <=> $2::vector) AS vec_score
  FROM claims
  WHERE ($3::text[] IS NULL OR topic_tags && $3 OR framework_tags && $3)
  ORDER BY embedding <=> $2::vector LIMIT 50
)
SELECT c.id, c.text, c.confidence, c.status, c.topic_tags,
       coalesce(f.fts_score, 0) * 0.4 + coalesce(v.vec_score, 0) * 0.6 AS score
FROM claims c
LEFT JOIN fts f ON f.id = c.id
LEFT JOIN vec v ON v.id = c.id
WHERE f.id IS NOT NULL OR v.id IS NOT NULL
ORDER BY score DESC LIMIT $4;
```

Required new migration: `CREATE INDEX claims_text_fts ON claims USING gin (to_tsvector('english', coalesce(text,'') || ' ' || coalesce(rationale,'')));`. Existing pgvector HNSW + tag GINs are reused unchanged. The 0.4/0.6 weights are starting defaults — Phase 2 fixture is too small to tune; revisit when claim count > 200.

**Why weighted-sum, not RRF:** RRF (Reciprocal Rank Fusion) is the gold standard at scale, but on a 7-claim Porter fixture the rank distributions are too sparse for RRF's k=60 default to add value. Weighted-sum on normalized scores is simpler and easier to debug. Trivially swappable later.

### 3.4 Contradiction Handling (Phase 1 inheritance)

Inherited unchanged from Phase 1. Renderer (`src/compilation/render/topic-page.ts`) groups claims by `topic_tag`, surfaces `edges.kind='contradicts'` pairs as Obsidian `> [!warning] Contradiction` callouts. Phase 2 contributes nothing new here — research sub-agent's `notable_contradictions[]` schema field is informational (lets the coordinator chat about contradictions), it does NOT bypass the renderer. New contradictions land as `edges` rows; the next recompile surfaces them. **No smoothing, ever** — Pitfall in PROJECT.md, enforced by absence (no auto-resolve code path exists).

### 3.5 Quantitative-Claim Guard (Pitfall 19)

Two-layer enforcement (also documented under AGENT-08):

**Layer 1 — schema (coercive):** `src/onebrain/repo.ts` `writeClaim()` precondition.
```ts
const QUANT_PATTERN = /(\$\s*[\d,]+(\.\d+)?\s*(M|B|T|million|billion|trillion))|(\b(TAM|SAM|SOM)\b)/i;
export async function writeClaim(input: NewClaim): Promise<Claim> {
  if (QUANT_PATTERN.test(input.text) && (!input.cites_source_ids || input.cites_source_ids.length === 0)) {
    throw new QuantitativeClaimRequiresSourceError(input.text);
  }
  // ... existing append-only insert logic
}
```

**Layer 2 — agent tool wrapper:** `src/agents/tools/onebrain.ts` `onebrain_write_claim` wrapper rejects forward-references (a claim citing a source ULID not yet in OneBrain at this moment).

**Why both:** Layer 1 catches *any* code path attempting the write (including Phase 4+ ingest, financial sub-agents). Layer 2 catches the protocol-level ordering violation (D-05 source-row-first) which wouldn't trigger Layer 1 if the source happens to exist later in the same turn. Together they make the AGENT-08 commitment unbypassable.

Pattern lives in `src/onebrain/quant-pattern.ts` for unit testability and Phase 4 reuse.

## 4. Landmines and Gotchas

**Phase-1 carry-forward (verified, must inherit):**
1. **`voyageai@0.2.1` ESM build is broken.** `embed.ts` already uses `createRequire` (CJS). Phase 2 must NOT regress this. Run `npm run build:check` on every executor commit.
2. **`commander` rejects `-vv` short flag (≥1 char).** Use long-form `--very-verbose` if any new CLI flags are added.
3. **Vitest integration files need `fileParallelism: false`.** Multiple tests calling `resetSchemaAndMigrate()` collide on `node-pg-migrate`'s advisory lock and drop schemas mid-test. Already configured in `vitest.config.ts` for the integration project.
4. **Internal `@/*` imports MUST use `.js` suffix.** NodeNext + paths requires it. Phase 2 frontend imports types from `@/onebrain/types.js` (not `.ts`).
5. **`env.ts` allows empty `VOYAGE_API_KEY`.** Phase 2 must add `ANTHROPIC_API_KEY: z.string().min(1)` and `TAVILY_API_KEY: z.string().min(1)` validations — but only enforced at `bsp serve` boot, not at test time (so unit tests don't need real keys).

**Claude Agent SDK 0.x specific:**
6. **Pin EXACT version** (e.g., `0.2.4`, not `^0.2.0`). 0.x has churn between minors per STACK.md; v2 interface preview is unstable.
7. **MCP tool naming in `allowedTools`/`tools[]` is `mcp__<server>__<tool>`** — full prefix required. Mistyping silently disables the tool (no error, just invisible to the agent). The single-writer gate could break this way.
8. **Coordinator inheriting sub-agent tools is the most likely architectural break.** Code review must verify coordinator's `allowedTools` contains zero `mcp__vault__*`. Add a Vitest static-membership assertion (Section 5 probe COMP-10).
9. **Sub-agents cannot spawn sub-agents.** Compilation cannot invoke a "lint" sub-agent inside itself; that's a coordinator-level pattern (Phase 3+).
10. **`settingSources: ['./CLAUDE.md']` reads at process start, not per turn.** Editing CLAUDE.md does not hot-reload; restart `bsp serve`. Use `tsx watch` for dev.
11. **Hooks fire across all agents.** `onToolCall` triggers regardless of which agent invoked the tool. Read the agent identity off the event payload, don't assume.

**Tavily/Anthropic SDK install-time risks:**
12. **Verify `@tavily/core` is ESM-clean on install.** If broken (like voyageai), fall back to direct REST: `https://api.tavily.com/search` POST with `{ api_key, query, search_depth: 'advanced', max_results }`.
13. **Verify `@anthropic-ai/claude-agent-sdk` and `@anthropic-ai/sdk` are ESM-clean.** Both are official Anthropic packages and likely fine, but Phase 1 burned a day on voyageai. Spend 5 minutes confirming `import { query } from '@anthropic-ai/claude-agent-sdk'` works under NodeNext before building on it.

**Streaming-specific:**
14. **Don't pipe SDK events directly to the browser.** They are NOT AI SDK 6 `UIMessageChunk` shapes. The adapter in `src/server/streaming.ts` is mandatory.
15. **Hooks are non-blocking.** Doing real work in `onToolCall` blocks the SDK event loop and stalls SSE — emit-and-return only.
16. **Iterate the SDK iterator with `for await`, not `Promise.all`.** Hono `POST /chat` handler is `async (c) => { ... }`; consume the async iterator inline.

**UI-specific:**
17. **`npx assistant-ui init --yes` MUST be the first executor task.** It scaffolds Tailwind v4, shadcn primitives, and the assistant-ui component library under `src/ui/components/`. Hand-editing Tailwind base styles before init breaks the scaffold.
18. **`obsidian://` deeplink failure detection is fire-and-forget.** Browser doesn't notify the page if the OS scheme isn't registered. Always render the "Copy path" fallback alongside — never as a conditional.
19. **assistant-ui slash-command parsing is the composer's responsibility.** `/recompile` is intercepted in the composer before submit, routed to `POST /recompile` instead of `/chat`. Don't rely on the coordinator to detect slash commands — it'll waste an Opus turn.

**Test-infrastructure:**
20. **`RUN_AGENT_TESTS=1` gating** for any test that hits real Opus (mirrors Phase 1's `RUN_VOYAGE_TESTS` precedent). Default: stub the sub-agents in unit/integration tests; gated tests run in CI nightly only.

## 5. Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4 (Phase 1 EVAL-01, already configured) |
| Config file | `vitest.config.ts` (existing) — Phase 2 may add a new project for `tests/agents/` integration |
| Quick run command | `npm test -- --run tests/<file>` |
| Full suite command | `npm test -- --run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Probe | File |
|--------|----------|-----------|------------------|------|
| INFRA-04 | Hono `/health` returns 200 + JSON; `/chat` SSE stream emits ≥1 chunk for a stubbed coordinator | integration | `await fetch('http://localhost:3000/health'); expect(r.status).toBe(200);` plus SSE stream test | `tests/server/health.spec.ts`, `tests/server/chat-sse.spec.ts` ❌ Wave 0 |
| DATA-09 | Hybrid search returns expected claim ULID in top-5 for a known query against fixture; FTS-only and vector-only baselines also recorded | integration | Seed Porter fixture; `searchClaims({ q: 'operational effectiveness', embedding: voyageEmbed })` → assert top-5 contains the relevant claim ULID | `tests/onebrain/search-hybrid.spec.ts` ❌ Wave 0 |
| AGENT-01 | Coordinator boot loads CLAUDE.md and exposes the documented `allowedTools` set; `vault_write_atomic` not in coordinator's tool list | unit (static membership) | `expect(coordinatorDef.allowedTools).not.toContain('mcp__vault__vault_write_atomic');` | `tests/agents/coordinator-config.spec.ts` ❌ Wave 0 |
| AGENT-02 | Research sub-agent stub returns valid `ResearchOutputSchema`; SDK retries once on first malformed output, surfaces structured error on second | integration | Stub sub-agent with malformed-then-valid output; assert exactly 1 retry; assert second-failure produces structured error to chat | `tests/agents/schema-malformed-output.spec.ts` ❌ Wave 0 |
| AGENT-06 | Compilation sub-agent invokes `runCompile()` and writes vault file; `compile_runs.error IS NULL`; rendered frontmatter contains expected `claim_ids[]` | integration | Seed claims, fire `POST /recompile`, parse `vault/topics/<slug>.md` frontmatter, assert `claim_ids` ⊇ seeded ULIDs | `tests/agents/recompile-roundtrip.spec.ts` ❌ Wave 0 |
| AGENT-07 | No agent-to-agent in-context message passing; sub-agents only communicate via OneBrain rows | unit (grep) | grep test: `expect(grepFiles('src/agents/', 'subAgentToSubAgent')).toHaveLength(0);` plus assertion that coordinator re-fetches claims via `findClaim()` between sub-agent invocations | `tests/agents/no-peer-messaging.spec.ts` ❌ Wave 0 |
| AGENT-08 | Quantitative claim without source rejected; with source accepted; sub-million unsourced accepted (below noise floor); source-after-claim same-turn rejected | unit + integration | Five-case fixture per AI-SPEC dimension #2: (sourced ≥$1M → ok), (unsourced ≥$1M → throw), (sub-million unsourced → ok), (TAM keyword unsourced → throw), (forward-ref source → throw) | `tests/agents/quantitative-claim-guard.spec.ts` ❌ Wave 0 |
| UI-01 | Dev server boots; `App.tsx` renders Thread + Composer + HeaderBar without runtime error | unit (Vitest + jsdom) or smoke | `render(<App />)` → assert composer textarea + send button + recompile button present | `tests/ui/app-shell.spec.tsx` ❌ Wave 0 |
| UI-02 | Streaming chunks render incrementally; first chunk produces visible text within 100ms of arrival in test harness | integration (jsdom + mock SSE) | Mock `EventSource`; emit 3 `text-delta` chunks 50ms apart; assert assistant-message text grows on each | `tests/ui/streaming.spec.tsx` ❌ Wave 0 |
| UI-03 | Tool-trace renders collapsed by default; click expands; row format matches `tool(args) → result` | unit (Vitest + jsdom) | Render `<ToolTrace events={[…]} />`; assert summary + expanded list match D-11/D-12 contract | `tests/ui/tool-trace.spec.tsx` ❌ Wave 0 |
| UI-04 | Wiki-citation block renders excerpt + Open-in-Obsidian button; obsidian:// URL is correctly encoded | unit | Render `<WikiCitation topicSlug='pricing' excerpt='…' vaultRelPath='topics/pricing.md' />`; assert `href` matches `obsidian://open?vault=vault&file=topics%2Fpricing.md`; assert "Copy path" button present | `tests/ui/wiki-citation.spec.tsx` ❌ Wave 0 |
| UI-06 | Recompile button triggers `POST /recompile`; status pill flips to in-flight; on success flips to `Last compiled: now`; system message lands in chat | integration (jsdom + mock fetch) | Click button; assert fetch called with `/recompile`; mock SSE response; assert pill text transitions; assert chat receives D-18 system message | `tests/ui/recompile-button.spec.tsx` ❌ Wave 0 |
| RES-01 | `tavily_search` tool returns ≥1 result for a known query (gated by `RUN_TAVILY_TESTS=1`); without env, mocked client used | integration (gated) | `RUN_TAVILY_TESTS=1` → real call, assert `results.length >= 1`; default → mock returns canned response | `tests/agents/tavily.spec.ts` ❌ Wave 0 |
| RES-02 | After research turn that wrote N claims, `SELECT count(*) FROM sources WHERE retrieved_at > $turn_start >= 1` AND no vault file mtime > $turn_start | integration | Capture turn-start timestamp; run stubbed research turn; assert sources count and vault mtime invariants | `tests/agents/research-no-vault-write.spec.ts` ❌ Wave 0 |
| COMP-10 | Mock non-compilation agent calls `vault_write_atomic` → expect typed `ToolPermissionDenied` error; vault filesystem byte-identical before/after | unit + integration | Two probes: (a) static-membership: `expect(researchDef.tools).not.toContain('mcp__vault__vault_write_atomic')`; (b) runtime: invoke the tool with `ctx={agentId:'research'}` → assert throws `ToolPermissionDenied`; (c) end-to-end: snapshot `vault/` before, run research turn, assert snapshot equal after | `tests/agents/tool-permission.spec.ts`, `tests/agents/vault-writer-gate.spec.ts` ❌ Wave 0 |
| COMP-11 | `POST /recompile` invokes compilation sub-agent (only); `/recompile` slash command in composer routes identically | integration + unit | POST then assert `compile_runs` row exists with `trigger='on_demand'`; UI test that composer with `/recompile` calls `POST /recompile` not `/chat` | `tests/server/recompile-route.spec.ts`, `tests/ui/slash-command.spec.tsx` ❌ Wave 0 |
| CRIT-01 | For unsourced TAM-shaped user assertion, coordinator reply contains all three: rule-named token ("hypothesis"/"TAM"/"unsourced"), action-named token ("logging"/"confidence"/"claim:"), path-forward token ("source"/"research") | integration (gated by `RUN_AGENT_TESTS=1`) | Send fixture user message; capture coordinator reply; regex-assert all three token sets present (Phase 2 pre-gate); LLM-judge full rubric in Phase 4 | `tests/agents/pushback-substance.spec.ts` ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test -- --run tests/<modified-area>/` (fast subset, ≤30s)
- **Per wave merge:** `npm test -- --run` (full Vitest suite — unit + integration; ≤60s for unit, ≤90s for integration with `fileParallelism: false`)
- **Phase gate:** Full suite + `RUN_AGENT_TESTS=1 RUN_TAVILY_TESTS=1 RUN_VOYAGE_TESTS=1 npm test` green; coordinator pushback rubric hand-graded against the 15-example reference dataset by the user before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `tests/server/{health,chat-sse,recompile-route}.spec.ts` — Hono SSE harness + supertest-style probes
- [ ] `tests/agents/{coordinator-config,schema-malformed-output,recompile-roundtrip,no-peer-messaging,quantitative-claim-guard,tool-permission,vault-writer-gate,research-no-vault-write,pushback-substance,tavily}.spec.ts` — agent-layer integration suite
- [ ] `tests/onebrain/search-hybrid.spec.ts` — DATA-09 probe with Porter fixture
- [ ] `tests/ui/{app-shell,streaming,tool-trace,wiki-citation,recompile-button,slash-command}.spec.tsx` — assistant-ui scaffold via jsdom + `@testing-library/react`
- [ ] `src/lib/ngram-overlap.ts` — n-gram overlap helper for prose-smuggling detection (canonical path; reused by `tests/agents/prose-smuggling.spec.ts` via `@/lib/ngram-overlap.js`) (reused at runtime in `src/agents/coordinator-output-guard.ts`)
- [ ] `tests/fixtures/{quantitative-claims,sub-agent-stubs}.ts` — shared fixtures for the agent suite
- [ ] `.planning/eval/phase2-reference-dataset.{md,json}` — 15 user-labeled exemplars (AI-SPEC §"Reference Dataset")
- [ ] `.planning/eval/pushback-rubric.md` — LLM-judge rubric for CRIT-01 (mechanized in Phase 4 as Promptfoo EVAL-02)
- [ ] Vitest project add for `tests/ui/` (jsdom env) + `tests/agents/` (node env, integration)

## 6. Open Questions (RESOLVED)

All NON-BLOCKING; planner proceeded; resolutions documented inline.

**NON-BLOCKING (planner can proceed; resolve at executor time):**

1. **`@tavily/core` ESM build status.** Need to `npm view @tavily/core` at install + import-test under NodeNext. If broken (like Phase 1's voyageai), fall back to REST. Not blocking — fallback path is well-known.
2. **AI SDK 6 custom `data-*` chunk shape exact API.** AI SDK 6 supports custom chunks for tool-trace + wiki-citation sidecars, but the exact constructor/field names in the released version need to be confirmed at executor time against `ai@latest` types. The pattern is correct; the specific field is the open detail.
3. **`hono`'s `streamSSE` helper vs hand-rolled `c.body(stream)`.** Hono 4 ships `streamSSE` from `hono/streaming`; verify it handles assistant-ui's expected SSE format (some clients require `id:` and `retry:` fields). If not, hand-roll.
4. **Hybrid-search weight 0.4 FTS / 0.6 vector.** Starting default; Porter fixture is too small to tune. Revisit when claim count > 200 (Phase 4-ish).
5. **Where does `coordinator-output-guard.ts` actually live?** AI-SPEC mentions it; either a wrapper around the coordinator's output stream or a separate module the chat route calls before flushing. Planner may locate it inside `src/agents/` or `src/server/`. No structural difference; file location only.
6. **Phoenix Docker container — start it manually or via `npm run dev:phoenix`?** AI-SPEC has the Docker command; an npm script wrapper is convenience, not requirement. Phase 2 may ship without it (user runs the container themselves).

**BLOCKING (must resolve before planning):**

None. CONTEXT.md and AI-SPEC.md cover the locked decisions; UI-SPEC covers the visual contract; all open questions are executor-time investigations, not architectural unknowns.

---
*Phase: 02-agents-and-chat*
*Research drafted: 2026-04-26*
