---
phase: 02-agents-and-chat
reviewed: 2026-04-28T00:04:57Z
depth: deep
files_reviewed: 37
files_reviewed_list:
  - src/agents/coordinator-output-guard.ts
  - src/agents/coordinator.ts
  - src/agents/coordinator-identity.md
  - src/agents/definitions/compilation.ts
  - src/agents/definitions/research.ts
  - src/agents/hooks/vault-audit.ts
  - src/agents/prompts/compilation.md
  - src/agents/prompts/research.md
  - src/agents/tools/onebrain.ts
  - src/agents/tools/tavily.ts
  - src/agents/tools/vault.ts
  - src/cli/commands/serve.ts
  - src/cli/index.ts
  - src/lib/env.ts
  - src/lib/ngram-overlap.ts
  - src/lib/tracing.ts
  - src/onebrain/quant-pattern.ts
  - src/onebrain/repo.ts
  - src/onebrain/search.ts
  - src/onebrain/types.ts
  - src/server/index.ts
  - src/server/routes/chat.ts
  - src/server/routes/health.ts
  - src/server/routes/recompile.ts
  - src/server/streaming.ts
  - src/ui/App.tsx
  - src/ui/components/ClaimChip.tsx
  - src/ui/components/Composer.tsx
  - src/ui/components/HeaderBar.tsx
  - src/ui/components/RecompileButton.tsx
  - src/ui/components/RecompileStatus.tsx
  - src/ui/components/ToolTrace.tsx
  - src/ui/components/WikiCitation.tsx
  - src/ui/components/assistant-ui/thread.tsx
  - src/ui/components/ui/button.tsx
  - src/ui/components/ui/tooltip.tsx
  - src/ui/hooks/useRecompile.ts
  - src/ui/lib/utils.ts
  - src/ui/main.tsx
  - src/ui/runtime.ts
findings:
  blocking: 1
  warning: 5
  info: 6
  total: 12
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-04-28T00:04:57Z
**Depth:** deep
**Files Reviewed:** 37 source files (tests, planning artifacts, vault output, and lock files excluded per scope)
**Status:** issues_found

## Summary

The Phase 02 surface is structurally well-organized and the marquee security/correctness controls are in the right places: COMP-10 single-writer-to-vault is enforced as a Layer-1 allowlist (compilation.ts is the only definition that names `mcp__vault__vault_write_atomic`) plus a Layer-2 PreToolUse hook keyed off `agent_type` (the late-stage `agent_id` → `agent_type` fix landed correctly per `BaseHookInput` shape in sdk.d.ts:135). The vault read-vs-write split is correct (coordinator allowlist contains `vault_read` only). AGENT-08 schema-coercive guard at `repo.writeClaim` fires correctly on `QUANT_PATTERN.test(text) && !cites_source_ids?.length`. CRIT-01 pushback regex deferred to Phase 4 is documented honestly in coordinator-identity.md. Server boot binds 127.0.0.1 (T-02-05) and env.ts rejects empty `ANTHROPIC_API_KEY` / `TAVILY_API_KEY`. AI SDK 6 native chunk shapes (text-start/text-delta/text-end with shared id; data-* chunks with `data` field) are honored throughout. `permissionMode: 'bypassPermissions' + allowDangerouslySkipPermissions: true` is correct for the single-user-local-only deployment posture and the rationale comment blocks in coordinator.ts and recompile.ts cite the exact CLAUDE.md commitments.

However, there is a **production-path defect chain** in the SDK-event → UIMessageChunk adapter that propagates into the chat route's data-claim-id forwarding, the recompile route's D-18 system message capture, and the coordinator output-guard's sub-agent-summary detection. Three bugs interlock:

1. **Wrong tool ID on tool_result blocks.** The streaming.ts `user.message.content[].tool_result` branch (lines 302-323) puts `tool_use_id` (e.g., `toolu_xyz123`) into the chunk's `tool` field. This is the only path the production SDK iterator hits for tool results — there is NO separately-emitted `tool-call-result` event with `ev.tool` populated. The chat route's `tool === TOOL_ONEBRAIN_WRITE_CLAIM` and recompile route's `tool === TOOL_VAULT_WRITE_ATOMIC` matchers therefore NEVER fire in production.

2. **Wrong summary shape on `onebrain_write_claim`.** The wrapper at `src/agents/tools/onebrain.ts:130-138` returns `JSON.stringify({ claim, ...counters })`. The chat route at `src/server/routes/chat.ts:218-220` matches `summary.startsWith('claim:')` and slices `'claim:'.length`. Even if Bug #1 were fixed, the actual summary starts with `{"claim":{"id":...`, not `claim:`, so the slice would yield garbage.

3. **Recompile result truncated past parse-ability.** `summarizeResult` in streaming.ts:175-178 truncates summaries to 80 chars. The recompile route at `src/server/routes/recompile.ts:180` calls `parseRunCompileSummary(chunk.data.summary)` which JSON-parses that truncated text — a 26-char ULID alone makes the JSON unrecoverable past `{"runId":"01J..."`. `parseRunCompileSummary` swallows the parse error and returns `undefined`, so the `data-recompile-result` chunk and the D-18 system message are never emitted.

The synthetic events the chat-sse and recompile-route Wave 0 probes feed in (e.g., `{ type: 'tool-call-result', tool: 'mcp__onebrain__onebrain_write_claim', summary: 'claim:01J9X...' }`) take a different path through the adapter (lines 341-353, the shorthand branch) that DOES preserve `ev.tool` and DOES carry an un-truncated `claim:<ULID>` summary — so the tests pass. Production reality is materially different: the SDK emits user/tool_result blocks (no tool name) and the wrapper emits a JSON object (no `claim:` prefix) and `summarizeResult` truncates everything to 80 chars. The result is that data-claim-id forwarding (D-09 inline citations), the D-06 prose-smuggling guard (which keys off `agentId === 'research'` from the same broken path), and the D-18 recompile system message all silently no-op end-to-end.

I am marking this as a single BLOCKING finding (CR-01 — the chain is one architectural decision, not three) plus warnings on the related smaller defects. The phase verification gate should NOT pass without either (a) fixing the SDK tool-result correlation in the adapter and adjusting the wrapper's summary shape, or (b) explicitly downgrading data-claim-id / D-18 / D-06 acceptance to a follow-up plan with the test contracts re-anchored against the production-shape events.

## Blocking Issues

### CR-01: Production SDK tool_result events lose tool name and summary shape; data-claim-id, D-18 recompile message, and D-06 sub-agent capture all silently no-op

**Files:**
- `src/server/streaming.ts:302-323` (user/tool_result block — emits `tool_use_id` as `tool`)
- `src/server/streaming.ts:173-182` (summarizeResult — 80-char truncation)
- `src/agents/tools/onebrain.ts:130-138` (wrapper emits `JSON.stringify({claim,...})`, NOT `claim:<ULID>` prefix)
- `src/server/routes/chat.ts:215-229` (matches `tool === TOOL_ONEBRAIN_WRITE_CLAIM` and `summary.startsWith('claim:')` — both miss in production)
- `src/server/routes/chat.ts:204-209` (matches `agentId === SUB_AGENT_RESEARCH` to capture sub-agent summary for D-06 — `agentId` is undefined on the user/tool_result path)
- `src/server/routes/recompile.ts:174-181` (matches `tool === TOOL_VAULT_WRITE_ATOMIC` and JSON-parses truncated summary)

**Issue:**
The Claude Agent SDK 0.2.119 (verified in installed sdk.d.ts) does not emit any `tool-call-result` or `tool-call-start` event types — those are pure test-synthetic shapes. In production, tool-call lifecycle arrives via `SDKAssistantMessage.message.content[]` blocks of type `tool_use` (which DO carry `name`) and `SDKUserMessage.message.content[]` blocks of type `tool_result` (which carry ONLY `tool_use_id`, not the tool name). The streaming.ts user/tool_result branch (lines 302-323) acknowledges this with a code comment: "in production wiring the chat route correlates this id back to the earlier tool_use start event" — but the chat route does not implement that correlation. Instead it directly compares `chunk.data.tool === 'mcp__onebrain__onebrain_write_claim'`, which would have to be matching against `toolu_xyz123` (the tool_use_id) at runtime. So the data-claim-id chunk is never emitted; D-09 inline ClaimChips never get the ULID feed; the output guard's `lastSubAgentSummary` capture (which keys off `agentId === 'research'` on the same broken path) never runs and D-06 prose-smuggling protection silently no-ops.

Compounding: the `onebrain_write_claim` wrapper returns `JSON.stringify({ claim, ...counters })` (a JSON object, e.g., `{"claim":{"id":"01J9X..."`). The chat route's `summary.startsWith('claim:')` check expects a `claim:<ULID>` literal prefix that the wrapper never emits — so even if tool ID propagation were fixed, the slice extraction would still fail.

Compounding further: `summarizeResult` in streaming.ts truncates to 80 chars before any downstream code sees the summary. The recompile route's `parseRunCompileSummary(chunk.data.summary)` therefore receives invalid (truncated) JSON and silently returns `undefined`, so the `data-recompile-result` chunk and the D-18 system message ("Recompiled: N pages written…") are never emitted to the UI.

The Wave 0 probes (chat-sse.spec.ts, recompile-route.spec.ts) feed SYNTHETIC `{ type: 'tool-call-result', tool: 'mcp__...', summary: 'claim:<ULID>' }` events directly into the route. These take the shorthand branch in streaming.ts at lines 341-353 (which preserves `ev.tool` and `ev.summary` verbatim), so the tests pass. They do not exercise the user/tool_result block path that production runs through, and do not exercise the production wrapper's actual JSON-object summary shape, and do not exercise the 80-char truncation against an >80-char real result.

**Net production behavior:**
- D-09 inline ClaimChips never receive `data-claim-id` chunks → claim ULIDs render as raw `[[claim:...]]` text.
- D-06 prose-smuggling guard (coordinator-output-guard.ts) never sees a `lastSubAgentSummary` → guard is dormant; the only D-06 enforcement in production is the prompt-level "Never-Quote-Sub-Agent" instruction in coordinator-identity.md.
- D-18 recompile system message never appears after a successful recompile → the user sees the `data-tool-trace` chunks for the compilation sub-agent's progress but no "Recompiled: N page written, M skipped (run <ulid>)" verbatim message.

**Fix (sketch):**

1. In `streaming.ts`, maintain a `Map<tool_use_id, tool_name>` keyed on assistant `tool_use` blocks (line 285+) and consult it when synthesizing the result chunk on the user/tool_result branch (line 309+):
   ```typescript
   // Module-level (or per-stream) map; reset on stream start.
   const toolNameByUseId = new Map<string, string>();

   // In the assistant tool_use branch:
   if (toolUseBlock.id && toolUseBlock.name) {
     toolNameByUseId.set(toolUseBlock.id, toolUseBlock.name);
   }

   // In the user/tool_result branch:
   const toolName = toolResultBlock.tool_use_id
     ? toolNameByUseId.get(toolResultBlock.tool_use_id) ?? 'unknown'
     : 'unknown';
   return createToolTraceChunk('result', toolName, undefined, summarizeResult(toolResultBlock.content), /* agentId */ undefined);
   ```
   This needs to be per-stream (the chat route invocation), so the map should live in the route's closure or be passed into `adaptToUIMessageChunk` as a parameter. The current single-Map-per-process approach would leak entries and confuse concurrent streams (even though Phase 2 is single-user, the cleanup discipline matters).

2. In `streaming.ts:summarizeResult`, do NOT truncate when the result looks like JSON (`startsWith('{')`) — emit it whole or up to a much larger cap (e.g., 8 KB). The 80-char cap is fine for tool-trace UI display but breaks downstream JSON parsers. Better: separate "display summary" (truncated) from "raw payload" (untruncated), and put both on the chunk so the route can pick.

3. In `src/agents/tools/onebrain.ts`, change `onebrain_write_claim`'s response to either (a) emit `claim:<ULID>` as a literal text prefix the chat route can parse (matches the existing route comment at chat.ts:48), or (b) keep the JSON-object shape and update the chat route to JSON-parse and read `parsed.claim.id`. Option (b) is cleaner; option (a) preserves the existing route logic. Either way, document the contract once and lock with a unit test that drives a REAL `tool()` invocation (not a synthetic event).

4. Re-anchor `tests/server/chat-sse.spec.ts` data-claim-id positive case and `tests/server/recompile-route.spec.ts` D-18 case against PRODUCTION-shape events: feed `{ type: 'assistant', message: { content: [{ type: 'tool_use', id, name }] } }` followed by `{ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id, content }] } }`. The synthetic shorthand can stay as a smaller test of the adapter's tolerance; the route-level assertions must use the production shape.

Acceptance criterion: both routes' "result captured" branches MUST be reachable from a `runCoordinatorTurn` / compilation-route invocation that uses the real SDK iterator shapes. Current test coverage proves only the shorthand branch — the production branch is unverified.

## Warnings

### WR-01: AgentDefinition.outputSchema is not a real SDK field — schema validation is prompt-only

**Files:**
- `src/agents/definitions/research.ts:38` (`outputSchema: ResearchOutputSchema`)
- `src/agents/definitions/compilation.ts:31` (`outputSchema: CompilationOutputSchema`)
- `src/agents/coordinator.ts:122-126` + 164-166 (cast through `as unknown as never` to silence the TS error)

**Issue:**
The installed `@anthropic-ai/claude-agent-sdk@0.2.119` declares `AgentDefinition` (sdk.d.ts:38-92) with these fields and only these: `description, tools, disallowedTools, prompt, model, mcpServers, criticalSystemReminder_EXPERIMENTAL, skills, initialPrompt, maxTurns, background, memory, effort, permissionMode`. **There is no `outputSchema` field on AgentDefinition.** The `outputSchema` symbol IS used elsewhere in the SDK — but only on MCP `tool()` definitions, not on AgentDefinition. The cast `compilationDef as unknown as never` in coordinator.ts:164-166 silences the TS error but doesn't make the SDK consume the field. The sub-agent's `outputSchema` is therefore a structural decoration that the SDK quietly ignores at runtime: nothing validates the sub-agent's JSON output against `ResearchOutputSchema` or `CompilationOutputSchema` at the SDK boundary.

What this means for D-04 ("If your output does not parse against ResearchOutputSchema, the SDK retries you exactly once"): the prompt promises a retry that does not happen. If the research sub-agent emits malformed JSON, the coordinator simply receives malformed JSON and downstream parse code (e.g., chat route or future ResearchOutput consumers) sees the failure. There is no "exactly one SDK retry" — that contract is fictional.

**Fix:**
Either (a) parse the sub-agent's final assistant message against `ResearchOutputSchema` / `CompilationOutputSchema` in the coordinator turn handler and surface a structured error if parsing fails (with explicit one-shot retry logic if you want to preserve the D-04 contract), or (b) drop `outputSchema` from the AgentDefinition objects, drop the misleading retry sentence from the prompts, and document that the sub-agent output schema is enforced by prompt + downstream parser only. Option (a) is closer to the spec's intent but adds nontrivial coordinator complexity; option (b) is the honest minimum.

### WR-02: D-06 output guard fires only when the broken sub-agent capture path catches a summary — production fires never

**Files:**
- `src/server/routes/chat.ts:204-209` (sub-agent summary capture)
- `src/server/routes/chat.ts:238-266` (output guard application)

**Issue:**
The output guard at chat.ts:238-266 correctly fires once per turn (after the iterator drains, before the finish chunk — matches D-06 contract that the guard is end-of-turn, not per-chunk). However, it's gated on `lastSubAgentSummary` having been captured at lines 204-209, which keys off `chunk.data.agentId === SUB_AGENT_RESEARCH`. The agentId field on the chunk is set by `adaptToUIMessageChunk` only on the `tool-call-result` shorthand branch (streaming.ts line 351, `ev.agentId`) — but production SDK events do not carry `agentId` on `user/tool_result` blocks (the SDK emits them as flat user messages with no sub-agent attribution). The streaming.ts user/tool_result path explicitly passes `undefined` for the agentId field (line 319). So `lastSubAgentSummary` is never captured in production, the output guard's no-op branch (line 49-51 of coordinator-output-guard.ts) always wins, and the runtime D-06 layer is dormant.

This is a corollary of CR-01 — fixing CR-01's tool_use_id correlation should also propagate the sub-agent identity (the SDK does carry sub-agent identity in the wrapping message metadata, separate from the tool_use_id tracking). Documented separately because the coordinator-output-guard.ts file itself is correctly written; it just never receives a non-undefined `lastSubAgentSummary` in production.

**Fix:**
Track the active sub-agent across the iterator — when an SDK message indicates "subagent X started" (e.g., a system message or a parent message annotation), record it; emit it on subsequent tool-trace chunks until the subagent ends. The exact SDK event for this depends on the iterator shape; review sdk.d.ts:343-381 (SDKAssistantMessage / SDKUserMessage variants) for the field that carries the active subagent type. Once captured, set `agentId` on the tool-trace chunk so the chat route's `agentId === SUB_AGENT_RESEARCH` check fires correctly.

### WR-03: ToolTrace stripMcpPrefix regex over-eats on tool names with multiple underscores

**File:** `src/ui/components/ToolTrace.tsx:31-35`

**Issue:**
`tool.replace(/^mcp__[^_]+(?:_[^_]+)*?__/, '')` is greedy across the second `__` boundary in unexpected ways. For tool ID `mcp__onebrain__onebrain_write_claim`, the inner pattern `[^_]+(?:_[^_]+)*?__` allows the lazy quantifier to terminate at the FIRST `__` (after `onebrain`), correctly yielding `onebrain_write_claim`. But for a hypothetical future tool like `mcp__onebrain__write_claim` (no underscore in the suffix), the same regex still works. The risk: if a future tool ID introduces `_` in the server name (e.g., `mcp__one_brain__search`), the lazy quantifier could match beyond the intended server boundary. This is a pure UI display concern (no security impact), but the regex is fragile.

**Fix:**
Use a literal-anchored split:
```typescript
function stripMcpPrefix(tool: string): string {
  // Match `mcp__<server>__<rest>` where <server> may contain underscores;
  // the second literal `__` is the boundary.
  const m = /^mcp__(.+?)__(.+)$/.exec(tool);
  return m ? m[2] : tool;
}
```
The lazy `.+?` is bounded by the literal `__(.+)$` so server names with underscores are handled correctly.

### WR-04: globalToolTraceSink / ToolTraceSink class is dead exported code

**File:** `src/server/streaming.ts:407-413`

**Issue:**
`ToolTraceSink` and `globalToolTraceSink` are exported but no other source file imports them (verified via grep). The accompanying header comment block (lines 396-405) describes a non-blocking-hook pattern that never landed. The class adds bundle weight and confuses future readers about where tool-trace events flow.

**Fix:**
Either (a) remove both the class and the constant if they are not part of the spec, or (b) wire them into the actual hook surface and document the consumer. If they're held as scaffolding for Phase 3+, mark them with an explicit `// TODO Phase 3 — wire to PostToolUse hook` comment so the dead status is intentional.

### WR-05: SDKAssistantMessage handler returns one block per event; multi-block messages drop tool_use blocks when text is present

**File:** `src/server/streaming.ts:269-298`

**Issue:**
When the SDK emits a fully-buffered `SDKAssistantMessage` whose `content[]` array contains BOTH a text block and a tool_use block (a common shape — the model says "calling search now" then immediately invokes the tool), the adapter at lines 278-283 returns the FIRST text block as a single text-delta and falls out of the function. The tool_use block at lines 285-296 is unreachable in this case because the text-block path returned early. Conversely, a text-only message returns the text-delta correctly, and a tool_use-only message returns the tool-trace chunk correctly. Mixed-content messages lose the tool_use signal.

The SDK MAY emit each block as its own iterator event (in which case this is moot), but the code path defensively handles both — and the defense is incomplete.

**Fix:**
Iterate `content[]` and emit a separate chunk for each renderable block. Since the function signature is `→ UIMessageChunk | null` (single chunk), this is a structural change. Either (a) change the return shape to `UIMessageChunk[] | null` and adjust the chat/recompile routes' for-await loops to flatten, or (b) restructure as an async-iterator/generator. Verify against the SDK behavior first — if the SDK emits one block per iterator event, the current code is fine and this finding can be downgraded to INFO ("preemptive defense for multi-block messages"). Either way, document the assumption in the file header.

## Info

### IN-01: vault_read uses startsWith(root + sep) — correct on Windows; symlink traversal unchecked

**File:** `src/agents/tools/vault.ts:104-123`

**Issue:**
The path-traversal guard `safe.startsWith(root + path.sep) && safe !== root` correctly handles `..` segments on both POSIX (`/`) and Windows (`\`). Edge cases work: `relativePath = '../escape'` → `safe = C:\escape` (or `/escape`), `root + sep = C:\vault\` (or `/vault/`) → `startsWith` returns false, guard throws. `relativePath = ''` → `safe === root`, guard's `!== root` lets it through, but `fs.readFile(root, 'utf-8')` fails with EISDIR — acceptable.

The guard does NOT defend against **symlink traversal**: a file inside the vault that is a symlink pointing outside the vault would be followed by `fs.readFile`. This is generally accepted as out-of-scope for path-traversal guards (the single-user-local-only deployment posture per CLAUDE.md commits to trusting filesystem state), but worth noting if Phase 4+ ever loosens that posture (e.g., multi-user mode, network-attached vault). For the v1 Phase 2 scope, no action needed.

**Fix (deferred):**
If/when the deployment posture changes, add a follow-up `fs.realpath(safe)` and re-check that the resolved real path also begins with `root + sep`.

### IN-02: chat route comment block claims `claim:<ULID>` summary protocol the wrapper does not implement

**Files:**
- `src/server/routes/chat.ts:48-51` (header comment claims wrapper emits `claim:<ULID>` prefix)
- `src/server/routes/chat.ts:213-214` (inline comment repeats the claim)
- `src/agents/tools/onebrain.ts:130-138` (actual wrapper emits JSON object, not `claim:` prefix)

**Issue:**
The chat route's documentation refers to a "wrapper's `claim:<ULID>` summary prefix (set by src/agents/tools/onebrain.ts D-01 protocol)" — but the wrapper at onebrain.ts:130-138 emits `JSON.stringify({ claim, ...counters })`, which does not start with `claim:`. The comment misleads the reader and would not have been caught by the test suite (which feeds synthetic events with `summary: 'claim:<ULID>'`). This is rolled into CR-01 above; called out separately so it's fixed in the comment block too.

**Fix:**
After CR-01's resolution, update both comment blocks to describe the actually-implemented protocol (whether that's `claim:<ULID>` literal prefix or JSON-object summary parsing).

### IN-03: chat-sse "rejects empty messages" check also rejects whitespace-only — likely intentional but undocumented

**File:** `src/server/routes/chat.ts:152-156`

**Issue:**
After `extractUserMessage(body)`, the check `if (!message)` rejects empty strings. `extractUserMessage` returns parts joined without trimming, so `' '` (whitespace only) would be falsy-ish (the join is non-empty, but its content is whitespace). Actually `' '.length > 0` is true, so whitespace-only strings would be ACCEPTED and sent to `runCoordinatorTurn(' ')`. The coordinator's prompt then sees a whitespace-only user message — undefined behavior at the model layer. Likely benign (the model will respond to an empty turn) but not a guaranteed UX outcome.

**Fix:**
Trim before checking: `if (!message.trim())`. Tiny defensive improvement; not critical.

### IN-04: useRecompile error log uses a `console.error` swallowing — should surface to UI

**File:** `src/ui/hooks/useRecompile.ts:132-134`

**Issue:**
```typescript
} catch (err) {
  // eslint-disable-next-line no-console
  console.error('useRecompile:', err);
}
```
A failed POST /recompile (network drop, 500, etc.) leaves the user with a button that flips back to "Recompile" with no UI feedback that anything went wrong. The console log helps a developer but not the user. The pre-existing error path through `catch` in the recompile route does emit an SSE `{ type: 'error', errorText }` chunk — but useRecompile's parser does not surface it.

**Fix:**
Add a `data-error` chunk handler in the SSE parse loop (mirroring the `data-recompile-result` handler) and surface it via an optional `onError` callback in `UseRecompileOptions`. AppShell can pass an `onError` that calls `threadRuntime.append({ role: 'system', content: [{ type: 'text', text: 'Recompile failed: …' }] })`. Phase 2 may consider this out-of-scope; record as INFO for the verification gate to decide.

### IN-05: useEffect cleanup in RecompileStatus may emit setState after unmount during in-flight fetch

**File:** `src/ui/components/RecompileStatus.tsx:52-75`

**Issue:**
The `cancelled` flag protects against `setStatus` after unmount, but the `await fetch('/recompile/status')` itself is not aborted. If the component unmounts while a fetch is in flight, the response arrives, the `if (!cancelled)` check correctly prevents the setState, but the fetch handle and decoded body are wasted. Minor — does not cause warnings or memory leaks in practice. For consistency with modern React patterns:

**Fix (optional):**
Use an `AbortController` and pass `signal` to fetch; abort on cleanup. Cosmetic; not required.

### IN-06: ClaimChip CLAIM_TOKEN_RE module-level state correctly reset, but pattern accepts non-ULID `[0-9A-Z]+` characters

**File:** `src/ui/components/ClaimChip.tsx:119-130`

**Issue:**
`CLAIM_TOKEN_RE = /\[\[claim:([0-9A-Z]+)[…]?\]\]/g` matches any uppercase alphanumeric run, not strictly the Crockford base32 ULID alphabet (`[0-9A-HJKMNP-TV-Z]`). The regex accepts `[[claim:ILOU]]` (which is not a valid ULID) and the `lastIndex` reset on line 130 is correct (so the iterate-all loop is safe). Mismatch between this regex and the strict ULID regex in `src/onebrain/types.ts:74` (`UlidSchema = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/)`) is mostly cosmetic — the prefix-match against the chunk-known Map filters out garbage tokens — but worth noting for consistency.

**Fix:**
Either tighten the regex to the ULID alphabet (`[0-9A-HJKMNP-TV-Z]`) or document that the chip uses a relaxed regex specifically because the inline token may use the 8-char prefix form (which can theoretically include any base32 char depending on the ULID source).

---

_Reviewed: 2026-04-28T00:04:57Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
