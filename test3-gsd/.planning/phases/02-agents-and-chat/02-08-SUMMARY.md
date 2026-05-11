---
phase: 02-agents-and-chat
plan: 08
subsystem: server+ui
tags: [recompile-loop, sse, hono-streaming, ai-sdk-6, ui-message-chunk, slash-command, vault-write-atomic, vault-audit-hook, idempotency, comp-11, ui-06, d-15, d-16, d-17, d-18, t-02-01, permission-mode-bypass]
status: complete

# Dependency graph
requires:
  - phase: 02-agents-and-chat
    provides: "02-04 — compilationDef AgentDefinition (claude-sonnet-4-6, allowedTools=[mcp__onebrain__onebrain_search, mcp__vault__vault_read, mcp__vault__vault_write_atomic], outputSchema=CompilationOutputSchema) + vault-audit PreToolUse hook (refactored agent_id → agent_type in 02-08); 02-05 — coordinator wiring + coordinator-identity.md + permissionMode-bypass pattern (extended to recompile route in 02-08); 02-06 — Hono streamSSE pattern + adaptToUIMessageChunk adapter (refactored to AI SDK 6 native chunk shapes in 02-08); 02-07 — RecompileButton + RecompileStatus + Composer placeholder onClick / polling / slash-stub (replaced with real fetch + SSE consumption in 02-08)"
provides:
  - "src/server/routes/recompile.ts NEW — POST /recompile streamSSE handler invokes compilation sub-agent ONLY (agents map: { compilation: compilationDef }; agents.research === undefined); GET /recompile/status returns JSON {lastCompiledAt, dirtyClaimsCount, inFlight} per D-16 dirty-count formula; permissionMode: 'bypassPermissions' added in fix 0c0e2fa (single-user-local-only architecture per CLAUDE.md treats allowedTools as the real gate); finish-chunk dedup in 15677cd"
  - "src/server/index.ts MODIFIED — createApp mounts recompileRoute alongside healthRoute + chatRoute"
  - "src/ui/hooks/useRecompile.ts NEW — lifted to AppShell in fix b3213cd; single source of truth for `inFlight` shared across RecompileButton + Composer slash-command path; idempotency invariant (1 POST per click+slash, not 2) holds via lifted state"
  - "src/ui/components/RecompileButton.tsx MODIFIED — placeholder onClick replaced with real fetch + SSE consumption via useRecompile hook; D-18 system message via onCompleted callback; refactored in 7d33b5c (slash-Composer wrapping) + b3213cd (lift to AppShell)"
  - "src/ui/components/RecompileStatus.tsx MODIFIED — placeholder useEffect replaced with real 5s polling of /recompile/status; idle copy `Last compiled: HH:MM • N claims unwritten` (D-16) / in-flight copy `⟿ Compiling… 1 of 1 page` (D-17)"
  - "src/ui/components/Composer.tsx NEW — slash-command-aware wrapper; intercepts `/recompile` BEFORE ComposerPrimitive sends to /chat (D-15 + IC-5); calls onRecompile prop instead of falling through to chat path"
  - "src/ui/components/assistant-ui/thread.tsx MODIFIED in 7d33b5c — Composer wrapper integrated into Thread; D-18 wiring complete"
  - "src/ui/App.tsx MODIFIED — useRecompile hook wired at AppShell level in b3213cd; D-18 system message rendering on onCompleted (renders `Recompiled: <n> page written, <s> skipped (run <run-ulid>).` verbatim per D-18)"
  - "src/ui/components/HeaderBar.tsx MODIFIED — accepts useRecompile state via props (lifted from RecompileButton internal state)"
  - "src/agents/hooks/vault-audit.ts MODIFIED in fix 9f4195d (CRITICAL — vault was unwritable until this fix) — hook now reads `BaseHookInput.agent_type` (the registered subagent TYPE NAME — `'compilation'` literal) instead of `agent_id` (a runtime UUID per @anthropic-ai/claude-agent-sdk sdk.d.ts:135). Pre-fix: every vault_write_atomic call was blocked because agent_id is a UUID, not the string 'compilation'."
  - "src/agents/coordinator.ts MODIFIED in fix 0c0e2fa — `mcp__vault__vault_read` added to coordinatorAllowedTools (READ-only; vault_write_atomic remains compilation-only per COMP-10); permissionMode: 'bypassPermissions' added (pairs with allowedTools as the real gate)"
  - "src/server/routes/chat.ts MODIFIED in fix 9c3d0cb — accepts AI SDK chat-protocol body shape (messages[].parts[].text); legacy flat-string body fallback retained; extractUserMessage helper exported for testability"
  - "src/server/streaming.ts MODIFIED in fix 2164492 — UIMessageChunk emits AI SDK 6 NATIVE shapes (`text-start { type, id }` + `text-delta { type, id, delta }` + `text-end { type, id }` with shared id across all three; `data-* { type, id?, data, transient? }` with `data` field per dist/index.d.ts:2151). Replaces 02-06's spec-shorthand shapes (`text-delta {text}`, `data-* {value}`) which AI SDK 6's chat protocol silently drops."
  - "8 new test files (server/recompile-route, server/chat-sse [extended], ui/recompile-button, ui/slash-command, ui/thread-composer-integration, ui/recompile-system-message, ui/use-recompile, ui/app-shell-recompile-shared-state) + ui/streaming.spec.tsx replaced with real DOM-rendering test in 50d2f44 + agents/vault-read-live.spec.ts in 0c0e2fa + agents/vault-writer-gate.spec.ts extended in 9f4195d"
affects:
  - Phase 3 (Full Compilation): runCompile only writes ONE topic page per compile and OVERWRITES index.md — orphan topic files accumulate when primary topic shifts between compiles. The smoke check surfaced two artifacts in vault/topics/ (strategic-positioning.md from one compile, untagged.md from another). Phase 3 multi-topic index aggregation + orphan-page reaping is the resolution. Reference: src/compilation/runner.ts from commit 204c970 (Phase 1 plan 01-04). Authority: coordinator's own chat response during the smoke check (verbatim, surfaced via vault_read) — the coordinator correctly identified the limitation when asked.
  - Phase 2 verification (`/gsd-verify-work 02`): all 9 plans now executed; the verifier scopes its checks to the deferred items aggregated below (8 items across 02-04, 02-07, 02-08, 02-09).
  - Future plans adding routes that invoke any agent via the SDK: must include `permissionMode: 'bypassPermissions'` in options if running headless (no interactive permission prompts). The pattern is now established at coordinator.ts AND src/server/routes/recompile.ts.
  - Future tests that fabricate hook events: must use the SDK's REAL field shape (`agent_type: 'compilation'`, snake_case, registered type name) — NOT invented field names like `agent_id: 'compilation'`. The 02-04 vault-writer-gate.spec.ts had this wrong; corrected in 9f4195d.

# Tech tracking
tech-stack:
  added:
    - "(none — no new deps; this plan composes 02-04..02-07 surfaces)"
  patterns:
    - "Lifted-hook pattern for cross-component shared state — when two UI surfaces (RecompileButton + Composer slash-command) MUST share `inFlight` to satisfy idempotency invariants, hoist the hook to the shared parent (AppShell) and pass {state, callbacks} as props. Documented in fix b3213cd. Test surface: tests/ui/app-shell-recompile-shared-state.spec.tsx + tests/ui/use-recompile.spec.tsx prove single POST per click+slash (not 2)."
    - "permissionMode: 'bypassPermissions' as the standard config for headless SDK invocations in this single-user-local-only deployment. The SDK's default 'default' mode would block any tool call that isn't on a per-session permission allowlist (which doesn't exist in headless mode). allowedTools is the real gate. Documented in coordinator.ts comment block + recompile.ts comment block."
    - "AI SDK 6 native UIMessageChunk emission discipline (FULL shape, not shorthand) — `text-start { id }` + `text-delta { id, delta }` + `text-end { id }` with SAME id across the trio; `data-* { id?, data, transient? }` with `data` field (NOT `value` like 02-06's shorthand). AI SDK 6's chat protocol parser silently drops shorthand; the only diagnostic is the chat output never rendering. Captured in src/server/streaming.ts header comments."
    - "Real-DOM rendering test for streaming chunk shapes — fix 50d2f44 replaced the original tests/ui/streaming.spec.tsx (which only tested transport SETUP, not chunk rendering) with a test that drives an actual UIMessage stream through the assistant-ui Thread and asserts the rendered DOM. Process lesson: when a deviation note says 'may need a thin client-side adapter,' the test for that deviation must EXERCISE the adapter contract, not just the transport wiring."

key-files:
  created:
    - "src/server/routes/recompile.ts (256 lines after 7884a0d + 15677cd dedup + 9c3d0cb chat-protocol extras + 2164492 native chunk refactor + 0c0e2fa bypassPermissions) — POST /recompile (SSE) + GET /recompile/status (JSON)"
    - "src/ui/hooks/useRecompile.ts (134 lines after 7d33b5c lift + b3213cd AppShell lift + 2164492 chunk-shape refactor) — single source of truth for recompile state + onCompleted callback"
    - "src/ui/components/Composer.tsx (105 lines) — slash-command-aware ComposerPrimitive wrapper"
    - "tests/server/recompile-route.spec.ts — Wave 0 probe COMP-11 route half (3 it() cases)"
    - "tests/ui/recompile-button.spec.tsx — Wave 0 probe UI-06 (3 it() cases; refactored in b3213cd to consume useRecompile from props)"
    - "tests/ui/slash-command.spec.tsx — Wave 0 probe COMP-11 composer half (4 it() cases)"
    - "tests/ui/thread-composer-integration.spec.tsx — D-18 wiring (Composer integrated into Thread)"
    - "tests/ui/recompile-system-message.spec.tsx — D-18 system message rendering"
    - "tests/ui/use-recompile.spec.tsx — useRecompile hook isolation tests (lifted-hook contract; 178 lines)"
    - "tests/ui/app-shell-recompile-shared-state.spec.tsx — idempotency invariant (button + slash share inFlight; 1 POST not 2; 178 lines)"
    - "tests/agents/vault-read-live.spec.ts — coordinator can READ vault (vault_read added to allowedTools in 0c0e2fa)"
  modified:
    - "src/server/index.ts (createApp mounts recompileRoute)"
    - "src/server/routes/chat.ts (extractUserMessage helper + AI SDK chat-protocol body shape acceptance)"
    - "src/server/streaming.ts (AI SDK 6 native UIMessageChunk shapes — text-start/text-delta/text-end with shared id; data field on data-* chunks)"
    - "src/ui/components/RecompileButton.tsx (real fetch + SSE; onCompleted callback; refactored to props-driven state in b3213cd)"
    - "src/ui/components/RecompileStatus.tsx (real 5s polling of /recompile/status; D-16/D-17 copy)"
    - "src/ui/components/HeaderBar.tsx (props-driven recompile state; lifted from internal in b3213cd)"
    - "src/ui/components/assistant-ui/thread.tsx (Composer wrapper integrated; D-18 wiring)"
    - "src/ui/App.tsx (useRecompile lifted to AppShell; D-18 system message rendering on onCompleted)"
    - "src/agents/hooks/vault-audit.ts (CRITICAL FIX 9f4195d — agent_id → agent_type field name; vault was unwritable pre-fix)"
    - "src/agents/coordinator.ts (vault_read added to coordinatorAllowedTools; permissionMode: 'bypassPermissions')"
    - "tests/server/chat-sse.spec.ts (extended for AI SDK chat-protocol body acceptance)"
    - "tests/ui/streaming.spec.tsx (REPLACED in 50d2f44 with real-DOM rendering test driving a UIMessage stream)"
    - "tests/agents/vault-writer-gate.spec.ts (corrected synthetic events to use SDK's real agent_type field shape)"
    - "tests/agents/coordinator-config.spec.ts (asserts vault_read in allowedTools + bypassPermissions present)"

key-decisions:
  - "vault-audit hook reads agent_type (registered subagent type NAME), NOT agent_id (runtime UUID). Pre-02-08 the hook checked agent_id === 'compilation' which never matched any production invocation — vault was structurally unwritable. The 02-04 vault-writer-gate.spec.ts test fabricated `{ agent_id: 'compilation' }` directly which is why the bug went undetected until the live smoke check. Fix in 9f4195d corrects both the hook and the test fixtures to use the real SDK shape per @anthropic-ai/claude-agent-sdk sdk.d.ts:135 BaseHookInput.agent_type (snake_case)."
  - "useRecompile lifted to AppShell — single source of truth for `inFlight` shared across RecompileButton + Composer slash-command path. Pre-fix b3213cd: clicking the button AND typing /recompile fired TWO POST requests because each surface had its own internal hook state. Post-fix: 1 POST per user action regardless of entry point. Idempotency invariant proven by tests/ui/app-shell-recompile-shared-state.spec.tsx."
  - "Chat route accepts AI SDK chat-protocol body shape (messages[].parts[].text + legacy flat-string fallback). Pre-fix 9c3d0cb the chat endpoint 400'd because assistant-ui sends `{messages: [{parts: [{type:'text', text:'...'}]}]}` (per AI SDK 6 spec) and the route only handled `{message: '...'}`. extractUserMessage helper centralizes the body parsing for testability."
  - "UIMessageChunk emits AI SDK 6 NATIVE shapes (text-start/text-delta/text-end with shared id; data field on data-* chunks). Pre-fix 2164492 the route emitted 02-06's spec-shorthand shapes (`{type:'text-delta', text:'...'}`, `{type:'data-claim-id', value:{...}}`) which AI SDK 6's parser silently drops — chat output never rendered. The 02-06 deviation note (\"may need a thin client-side adapter\") was technical debt; the proper fix is server-side native shapes throughout. Test 50d2f44 verifies via actual DOM rendering."
  - "permissionMode: 'bypassPermissions' on both coordinator AND recompile route. The single-user-local-only architecture per CLAUDE.md treats allowedTools as the real gate (Layer 1 + Layer 2 hook). The SDK's default 'default' permissionMode requires interactive per-session approval which is structurally impossible in headless mode. Documented in both files' header comments."
  - "Coordinator allowed to READ vault (mcp__vault__vault_read added to coordinatorAllowedTools). WRITES remain compilation-only per COMP-10 (vault_write_atomic NOT in coordinator's allowedTools; vault-audit hook would block it as a defense-in-depth Layer 2). Rationale: coordinator must be able to QUOTE compiled wiki content with claim citations to fulfill its citation-pushback role per CRIT-01."

patterns-established:
  - "Lifted-hook pattern for cross-surface idempotency (b3213cd) — when two UI surfaces must share async state, hoist the hook to the shared parent and pass {state, callbacks} via props."
  - "permissionMode: 'bypassPermissions' as standard for headless SDK invocations in this deployment (single-user-local-only)."
  - "AI SDK 6 native UIMessageChunk emission — full shape (text-start/text-delta/text-end with shared id, data field on data-*), no shorthand. The chat-protocol parser silently drops shorthand chunks."
  - "Synthetic test events for SDK hooks must use the SDK's REAL field shape (agent_type snake_case, registered type name string) — NOT invented field names. Document the SDK source-of-truth (sdk.d.ts line ref) in the test fixture."
  - "Live smoke checks catch contract mismatches that unit tests miss because they exercise the actual transport layer end-to-end. Process lesson: when a deviation note says 'may need a thin client-side adapter,' schedule the adapter as a real task — not a comment."

requirements-completed:
  - COMP-11
  - UI-06
  - AGENT-06  # Re-confirmed end-to-end (compilation sub-agent invokes runCompile via the recompile route — was 'complete' on the source-tree level after 02-04; 02-08 proves the live invocation path)
  - RES-02   # Re-confirmed end-to-end (research sub-agent doesn't touch vault mtime; verified live during smoke check chat turn)

# Metrics
duration: ~7h wall (most of which was the smoke-check pause + 7 in-smoke fix cycles); ~25min auto exec across 5 build tasks; ~2h fix work (4 critical fixes + 1 test rewrite + 1 cleanup + 1 architectural fix)
completed: 2026-04-27
---

# Phase 02 Plan 08: Recompile Feedback Loop Summary

**End-to-end recompile loop wired (POST /recompile + GET /recompile/status + RecompileButton/Composer/RecompileStatus integrations) with 7 in-smoke-check fix commits resolving (1) vault-audit hook field-name bug that made the vault structurally unwritable, (2) useRecompile cross-surface idempotency, (3) AI SDK chat-protocol body acceptance, (4) AI SDK 6 native chunk shape emission, (5) coordinator vault_read access, and (6) headless permissionMode — UI-06 + COMP-11 close; Phase 2 functional gates 1-4 all met.**

## Performance

- **Duration:** ~7h wall (start 2026-04-27T14:01:02Z plan-task commit; end 2026-04-27T21:09:13Z final fix). Most of that wall time was the user smoke check + 7 fix cycles. Auto-execution time across the 5 build tasks: ~25min.
- **Started:** 2026-04-27T14:01:02Z (commit 7884a0d — Task 1)
- **Completed:** 2026-04-27T21:09:13Z (commit 0c0e2fa — final smoke-check fix; user "approved")
- **Tasks:** 6 (5 build tasks + 1 human-verify checkpoint at Task 6)
- **Plan-task commits:** 5 (Tasks 1–5)
- **Pre-smoke gap fixes:** 2 (between Task 5 and the smoke check)
- **In-smoke-check fix commits:** 7 (during Task 6)
- **Total commits in 02-08:** 14 (5 plan + 2 pre-smoke + 7 in-smoke)
- **Files created:** 11 (1 src/server route + 1 src/ui hook + 1 src/ui Composer + 8 test files)
- **Files modified:** 14 (server: index.ts, chat.ts, streaming.ts; ui: App.tsx, HeaderBar.tsx, RecompileButton.tsx, RecompileStatus.tsx, assistant-ui/thread.tsx; agents: coordinator.ts, hooks/vault-audit.ts; tests: chat-sse, vault-writer-gate, coordinator-config, streaming)

## User Approval

**Smoke check approved 2026-04-27** — User ran the Task 6 end-to-end recompile-loop verification protocol. After SEVEN in-smoke-check fix cycles (vault-audit hook bug + useRecompile idempotency lift + chat-route body acceptance + AI SDK 6 chunk shapes + cleanup + DOM-driving test rewrite + final architectural fixes), all critical paths verified working end-to-end. Resume signal: explicit "approved".

Verified during the smoke check:

- POST /recompile fires from button click + /recompile slash command
- vault_write_atomic invocation succeeds (vault-audit hook fix in 9f4195d)
- compile_run row written to OneBrain
- Status pill updates within the 5s poll window
- D-18 system message renders inline in the Thread (`Recompiled: 1 page written, 0 skipped (run <ulid>).`)
- Slash command short-circuits the chat path (POST /recompile, NOT POST /chat)
- Chat sends real Anthropic-backed responses with vault_read tool calls visible in tool trace
- Coordinator can quote vault content with claim citations (vault_read added in 0c0e2fa)
- AI SDK 6 native chunk shapes throughout (text-start/delta/end with shared id; data field on data-* chunks)
- Idempotency: button click + slash command share `inFlight` via lifted useRecompile (1 POST, not 2)

## Accomplishments

- **COMP-11 (manual /recompile from chat) SHIPPED:** POST /recompile invokes compilation sub-agent ONLY (agents map: { compilation: compilationDef }; agents.research === undefined per the spec). GET /recompile/status returns JSON with the D-16 dirty-claims-count formula. Slash command interception in Composer.tsx routes `/recompile` to POST /recompile instead of POST /chat.
- **UI-06 FULL CLOSURE:** RecompileButton onClick + RecompileStatus polling both wired to real endpoints (replaces 02-07's placeholder onClick / TODO useEffect). HeaderBar consumes the lifted useRecompile state via props; D-18 system message rendering on onCompleted in App.tsx.
- **AGENT-06 + RES-02 LIVE-PATH RE-CONFIRMED:** Both were 'complete' on the source-tree level after 02-04, but 02-08's smoke check proves the live invocation path (compilation sub-agent invokes runCompile through the recompile route; research sub-agent doesn't touch vault mtime — verified during the smoke-check chat turn).
- **Critical vault-audit hook bug FIXED:** Pre-02-08 the hook checked `agent_id === 'compilation'` which never matched any production invocation (agent_id is a runtime UUID per BaseHookInput.agent_id sdk.d.ts:131; the registered type name lives at agent_type sdk.d.ts:135). Vault was structurally unwritable until fix 9f4195d. The 02-04 vault-writer-gate.spec.ts test had fabricated `{ agent_id: 'compilation' }` synthetic events which is why the bug went undetected for 4 plans. Test fixtures corrected to use the real SDK shape.
- **Idempotency invariant ESTABLISHED:** useRecompile lifted to AppShell (b3213cd) — single source of truth for `inFlight` shared across RecompileButton + Composer slash-command path. Click + slash now produce 1 POST, not 2. Proven by tests/ui/app-shell-recompile-shared-state.spec.tsx.
- **AI SDK 6 native chunk shapes RESTORED:** Pre-fix 2164492 the streaming adapter emitted 02-06's spec-shorthand shapes which AI SDK 6's chat protocol parser silently drops — chat output never rendered. The fix updates src/server/streaming.ts to emit `text-start { type, id }` + `text-delta { type, id, delta }` + `text-end { type, id }` with shared id, and `data-* { type, id?, data, transient? }` with the `data` field per AI SDK 6 dist/index.d.ts:2151.
- **Chat route AI SDK 6 body acceptance:** assistant-ui sends `{messages: [{parts: [{type: 'text', text: '...'}]}]}`; pre-fix 9c3d0cb the chat route only handled flat strings and 400'd. extractUserMessage helper centralizes the body parsing.
- **Coordinator vault_read RESTORED:** mcp__vault__vault_read added to coordinatorAllowedTools in fix 0c0e2fa — coordinator can now QUOTE compiled wiki content with claim citations (required for CRIT-01 citation-pushback role). vault_write_atomic remains compilation-only per COMP-10 (defense in depth: not in allowedTools + vault-audit hook would block it).
- **permissionMode: 'bypassPermissions' STANDARDIZED:** Added to both coordinator.ts AND src/server/routes/recompile.ts in 0c0e2fa. Single-user-local-only architecture per CLAUDE.md treats allowedTools as the real gate. SDK's default 'default' mode requires interactive per-session approval which is structurally impossible in headless mode.
- **Test counts:** ui 38/38 (12 files), unit 136/136 (19 files), agents 57/57 (13 files). Build clean (npm run build + npm run tsc:web both exit 0). No regressions of any prior plan.

## Task Commits

The plan tasks committed atomically, then 7 fix commits during the smoke check resolved discovered contract bugs. Listed in chronological git order:

### Plan tasks (5 commits)

1. **Task 1: POST /recompile (SSE) + GET /recompile/status (JSON) + mount** — `7884a0d` (feat)
2. **Task 2: tests/server/recompile-route.spec.ts (Wave 0 COMP-11 route half) + finish-chunk dedup** — `15677cd` (test)
3. **Task 3: Wire RecompileButton + RecompileStatus + Composer slash** — `9c293b6` (feat)
4. **Task 4: tests/ui/recompile-button.spec.tsx (Wave 0 UI-06)** — `1492415` (test)
5. **Task 5: tests/ui/slash-command.spec.tsx (Wave 0 COMP-11 composer half)** — `5713a58` (test)

### Pre-smoke gap fixes (2 commits)

6. **Composer wrapper integrated into Thread (D-18 wiring)** — `7d33b5c` (feat) — also lifted useRecompile to a hook for the first time (later re-lifted to AppShell in b3213cd)
7. **RecompileButton.onCompleted wired to D-18 system message in App** — `f163bac` (feat)

### In-smoke-check fix commits (7 commits)

8. **CRITICAL: vault-audit hook checks agent_type, not runtime agent_id** — `9f4195d` (fix) — vault was unwritable pre-fix; Layer 2 hook + test fixtures both corrected to BaseHookInput.agent_type per sdk.d.ts:135
9. **Lift useRecompile to AppShell — share inFlight across button and slash (Bug A + C)** — `b3213cd` (fix) — idempotency invariant; 1 POST per click+slash, not 2
10. **chat route accepts AI SDK chat-protocol body (Bug B — chat was 400ing)** — `9c3d0cb` (fix) — extractUserMessage helper handles messages[].parts[].text + legacy flat-string
11. **Emit AI SDK 6 native UIMessageChunk shapes (chat was silently dropping chunks)** — `2164492` (fix on 02-06) — text-start/delta/end with shared id; data field on data-* chunks
12. **Real chat rendering test that drives a UIMessage stream** — `50d2f44` (test on 02-07) — replaces the structurally insufficient streaming.spec.tsx that tested transport setup not actual rendering
13. **Remove placeholder verification files used during AI SDK 6 fix** — `ee4da94` (chore)
14. **Two architectural fixes from end-to-end smoke check (permissionMode bypassPermissions + coordinator vault_read)** — `0c0e2fa` (fix)

**Plan metadata:** _final commit will land with SUMMARY + STATE + ROADMAP + REQUIREMENTS_

## Files Created/Modified

**Created (11 files):**

- `src/server/routes/recompile.ts` — POST /recompile (SSE) + GET /recompile/status (JSON); permissionMode: 'bypassPermissions'; finish-chunk dedup
- `src/ui/hooks/useRecompile.ts` — lifted hook; single source of truth for inFlight + onCompleted
- `src/ui/components/Composer.tsx` — slash-command-aware ComposerPrimitive wrapper
- `tests/server/recompile-route.spec.ts` — Wave 0 COMP-11 route half
- `tests/ui/recompile-button.spec.tsx` — Wave 0 UI-06
- `tests/ui/slash-command.spec.tsx` — Wave 0 COMP-11 composer half
- `tests/ui/thread-composer-integration.spec.tsx` — D-18 wiring
- `tests/ui/recompile-system-message.spec.tsx` — D-18 system message rendering
- `tests/ui/use-recompile.spec.tsx` — useRecompile hook isolation tests
- `tests/ui/app-shell-recompile-shared-state.spec.tsx` — idempotency invariant
- `tests/agents/vault-read-live.spec.ts` — coordinator vault_read live path

**Modified (14 files):**

- `src/server/index.ts` — createApp mounts recompileRoute
- `src/server/routes/chat.ts` — extractUserMessage helper + AI SDK chat-protocol body shape
- `src/server/streaming.ts` — AI SDK 6 native UIMessageChunk shapes (text-start/delta/end with shared id; data field on data-* chunks)
- `src/ui/components/RecompileButton.tsx` — real fetch + SSE; onCompleted callback; props-driven state
- `src/ui/components/RecompileStatus.tsx` — real 5s polling; D-16/D-17 copy
- `src/ui/components/HeaderBar.tsx` — props-driven recompile state
- `src/ui/components/assistant-ui/thread.tsx` — Composer wrapper integrated; D-18 wiring
- `src/ui/App.tsx` — useRecompile lifted to AppShell; D-18 system message on onCompleted
- `src/agents/hooks/vault-audit.ts` — agent_id → agent_type field name (CRITICAL bug fix)
- `src/agents/coordinator.ts` — vault_read added to coordinatorAllowedTools; permissionMode: 'bypassPermissions'
- `tests/server/chat-sse.spec.ts` — extended for AI SDK chat-protocol body acceptance
- `tests/ui/streaming.spec.tsx` — REPLACED with real-DOM rendering test
- `tests/agents/vault-writer-gate.spec.ts` — synthetic events corrected to use SDK's real agent_type field
- `tests/agents/coordinator-config.spec.ts` — asserts vault_read in allowedTools + bypassPermissions present

## Decisions Made

The 6 key decisions from this plan (extracted from key-decisions frontmatter, surfaced here for STATE.md ingestion):

1. **vault-audit hook reads agent_type (registered subagent type NAME), NOT agent_id (runtime UUID).** Pre-02-08 the hook checked `agent_id === 'compilation'` which never matched any production invocation. Vault was structurally unwritable. Test fixtures corrected to use SDK's real shape per sdk.d.ts:135 BaseHookInput.agent_type (snake_case).
2. **useRecompile lifted to AppShell — single source of truth for `inFlight`.** Click + slash now produce 1 POST, not 2. Idempotency invariant proven by tests/ui/app-shell-recompile-shared-state.spec.tsx.
3. **Chat route accepts AI SDK chat-protocol body shape.** assistant-ui sends `{messages: [{parts: [{type: 'text', text: '...'}]}]}` per AI SDK 6; route now handles that + legacy flat-string fallback. extractUserMessage helper centralizes the parsing for testability.
4. **UIMessageChunk emits AI SDK 6 NATIVE shapes throughout.** text-start/text-delta/text-end with shared id; `data` field (not `value`) on data-* chunks per AI SDK 6 dist/index.d.ts:2151. The 02-06 deviation note ("may need a thin client-side adapter") was technical debt; the proper fix is server-side native shapes.
5. **permissionMode: 'bypassPermissions' on both coordinator AND recompile route.** Single-user-local-only architecture per CLAUDE.md treats allowedTools as the real gate. SDK's default 'default' mode requires interactive per-session approval which is structurally impossible in headless mode.
6. **Coordinator allowed to READ vault (mcp__vault__vault_read added to coordinatorAllowedTools).** WRITES remain compilation-only per COMP-10 (vault_write_atomic NOT in allowedTools; vault-audit hook would block as Layer 2). Required for the coordinator's CRIT-01 citation-pushback role.

## Lessons Learned (Process)

- **Deviation notes that say "may need a thin client-side adapter" are technical debt, not annotations.** The 02-06 SUMMARY documented that AI SDK 6's native chunk shapes might need a client-side adapter. That note was a code-smell — the correct response is to schedule the adapter as a real task, not leave it as a comment. Two fix cycles in the smoke check (2164492 + 50d2f44) were the bill for not scheduling that work.
- **Synthetic test events MUST match the SDK's real event shape.** The 02-04 vault-writer-gate.spec.ts test fabricated `{ agent_id: 'compilation' }` events. The SDK actually emits `{ agent_type: 'compilation', agent_id: '<uuid>' }` per sdk.d.ts:131,135. The fabricated shape caused the test to PASS while production was BROKEN. Process fix: when writing hook test fixtures, document the SDK source-of-truth (sdk.d.ts line ref) in the test file and assert on the same field name the production code reads.
- **Live curl/browser smoke checks catch contract mismatches that unit tests miss.** All 5 plan-task tests passed cleanly. The smoke check found 7 bugs that span layers (vault-audit field name, idempotency, chat body shape, chunk shapes, coordinator permissions, headless permissionMode). The take-away is not "more unit tests" — it's that contract tests at the transport boundary (curl + DOM-driving rendering tests) are a different category of test that catches different bugs. tests/ui/streaming.spec.tsx pre-50d2f44 illustrates the failure mode: it tested transport SETUP (does the URL match?) not actual chunk rendering (do the chunks render in the DOM?).
- **The chunk-shape regression-guard test had structural insufficiency** (now closed by commit 50d2f44 but worth flagging). Original tests/ui/streaming.spec.tsx tested transport SETUP not actual rendering. Replaced with real DOM-rendering test that drives a UIMessage stream through the Thread.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug, CRITICAL] vault-audit hook field-name bug — vault was unwritable**

- **Found during:** Task 6 smoke check (Step 6 — Recompile button click)
- **Issue:** Hook checked `evt.agent_id === 'compilation'` but agent_id is a runtime UUID per @anthropic-ai/claude-agent-sdk sdk.d.ts:131. The registered subagent TYPE NAME ('compilation' literal) lives at `evt.agent_type` per sdk.d.ts:135 (snake_case). EVERY vault_write_atomic invocation was being blocked by the Layer 2 hook in production. The bug went undetected for 4 plans because the 02-04 vault-writer-gate.spec.ts test fabricated synthetic events using the wrong field name (`{ agent_id: 'compilation' }`), causing the test to PASS while production was BROKEN.
- **Fix:** Updated src/agents/hooks/vault-audit.ts to read `evt.agent_type`. Updated tests/agents/vault-writer-gate.spec.ts synthetic events to use the real SDK shape. Documented the field choice in vault-audit.ts header comment block citing sdk.d.ts:135.
- **Files modified:** src/agents/hooks/vault-audit.ts, tests/agents/vault-writer-gate.spec.ts
- **Verification:** Smoke check Step 6 now passes — clicking Recompile produces a vault_write_atomic call that the hook permits; vault file written; compile_run row written; status pill updates.
- **Committed in:** `9f4195d` (in-smoke fix)

**2. [Rule 1 — Bug] Cross-surface idempotency violation (Bug A + C)**

- **Found during:** Task 6 smoke check (Step 7 — Slash command typed after button click)
- **Issue:** RecompileButton + Composer's slash-command path each had their own `useRecompile` hook instance with independent `inFlight` state. Click + slash produced TWO POST /recompile requests instead of one. Visual state was also out of sync between the button and the status pill.
- **Fix:** Lifted useRecompile to AppShell (App.tsx); RecompileButton + HeaderBar + Composer all consume the shared {state, callbacks} via props. Single source of truth for inFlight.
- **Files modified:** src/ui/App.tsx, src/ui/components/HeaderBar.tsx, src/ui/components/RecompileButton.tsx, src/ui/hooks/useRecompile.ts, tests/ui/app-shell-recompile-shared-state.spec.tsx (NEW), tests/ui/recompile-button.spec.tsx (refactored), tests/ui/use-recompile.spec.tsx (NEW)
- **Verification:** tests/ui/app-shell-recompile-shared-state.spec.tsx asserts 1 POST per click+slash (not 2); smoke check Step 7 passes.
- **Committed in:** `b3213cd` (in-smoke fix)

**3. [Rule 1 — Bug] Chat route 400'd on AI SDK 6 chat-protocol body (Bug B)**

- **Found during:** Task 6 smoke check (Step 8 — Hello chat message)
- **Issue:** assistant-ui sends `{messages: [{parts: [{type: 'text', text: '...'}]}]}` per AI SDK 6 chat protocol. The 02-06 chat route only handled `{message: '...'}` flat-string and returned 400 Bad Request.
- **Fix:** Added extractUserMessage helper in src/server/routes/chat.ts that handles AI SDK 6 messages[].parts[].text shape AND retains legacy flat-string fallback. Helper exported for testability.
- **Files modified:** src/server/routes/chat.ts, tests/server/chat-sse.spec.ts (extended)
- **Verification:** Smoke check Step 8 passes — chat sends real Anthropic-backed responses with vault_read tool calls visible.
- **Committed in:** `9c3d0cb` (in-smoke fix)

**4. [Rule 1 — Bug, on 02-06] AI SDK 6 chat protocol silently drops shorthand chunks**

- **Found during:** Task 6 smoke check (Step 8 — Chat message sent successfully but assistant response never rendered in DOM)
- **Issue:** src/server/streaming.ts (built in 02-06) emitted spec-shorthand chunk shapes (`{type: 'text-delta', text: '...'}`, `{type: 'data-claim-id', value: {...}}`) per RESEARCH §3.2 + AI-SPEC §3.2. AI SDK 6's chat protocol parser silently drops these — text-delta needs `delta` field + matching id + text-start/text-end bookends; data-* needs `data` field. The 02-06 SUMMARY had documented this as a deviation ("may need a thin client-side adapter") but no adapter was scheduled.
- **Fix:** Refactored src/server/streaming.ts to emit AI SDK 6 NATIVE shapes per dist/index.d.ts:2151 — text-start/text-delta/text-end with shared id; data field on data-* chunks. Refactored src/server/routes/chat.ts + src/server/routes/recompile.ts to use the new helpers (textStart/textDelta/textEnd helpers). src/ui/App.tsx + src/ui/hooks/useRecompile.ts updated to consume the new shapes.
- **Files modified:** src/server/streaming.ts, src/server/routes/chat.ts, src/server/routes/recompile.ts, src/ui/App.tsx, src/ui/hooks/useRecompile.ts
- **Verification:** Smoke check Step 8 now passes (chat output renders); commit 50d2f44 added a real-DOM rendering test (tests/ui/streaming.spec.tsx replaced) that drives an actual UIMessage stream through the Thread.
- **Committed in:** `2164492` (fix on 02-06) + `50d2f44` (test on 02-07; real DOM-rendering replacement) + `ee4da94` (chore — cleanup of placeholder verification scripts)

**5. [Rule 2 — Missing Critical] Coordinator could not READ vault (vault_read missing from allowedTools)**

- **Found during:** Task 6 smoke check (Step 8 — coordinator asked to quote vault content with claim citation; failed)
- **Issue:** coordinatorAllowedTools omitted mcp__vault__vault_read. Coordinator could not fulfill its CRIT-01 citation-pushback role (which requires QUOTING compiled wiki content with claim ULIDs). The 02-05 plan defined the coordinator's identity around citation-pushback but the allowedTools array was incomplete.
- **Fix:** Added `'mcp__vault__vault_read'` to coordinatorAllowedTools in src/agents/coordinator.ts. WRITES remain compilation-only per COMP-10 (vault_write_atomic still NOT in coordinator's allowedTools; defense in depth via vault-audit hook).
- **Files modified:** src/agents/coordinator.ts, tests/agents/coordinator-config.spec.ts (asserts vault_read present), tests/agents/vault-read-live.spec.ts (NEW — live coordinator vault_read invocation)
- **Verification:** Smoke check Step 8 passes — coordinator quotes vault content with claim citations.
- **Committed in:** `0c0e2fa` (in-smoke fix)

**6. [Rule 2 — Missing Critical] permissionMode default 'default' blocks all tool calls in headless mode**

- **Found during:** Task 6 smoke check (Step 6 + Step 8 — every tool call would be blocked by SDK's default permissionMode='default' which requires interactive per-session permission approval)
- **Issue:** SDK default permissionMode is 'default' (sdk.d.ts:1447) which requires interactive approval for every tool call. In headless mode (no terminal prompt available) this blocks ALL tool invocations even when allowedTools is properly configured. The single-user-local-only architecture per CLAUDE.md treats allowedTools as the real gate (Layer 1 + Layer 2 hook); 'bypassPermissions' is the correct mode for this deployment.
- **Fix:** Added `permissionMode: 'bypassPermissions'` to options in both src/agents/coordinator.ts AND src/server/routes/recompile.ts. Documented the rationale + safety analysis in header comment blocks of both files.
- **Files modified:** src/agents/coordinator.ts, src/server/routes/recompile.ts
- **Verification:** Smoke check Steps 6 + 8 pass.
- **Committed in:** `0c0e2fa` (in-smoke fix; co-located with vault_read fix as "two architectural fixes from end-to-end smoke check")

---

**Total deviations:** 6 auto-fixed (4 Rule 1 bugs incl. the CRITICAL vault-audit field-name bug; 2 Rule 2 missing critical functionality).

**Impact on plan:** All 6 deviations were necessary to satisfy Phase 2 functional gates 1–4 (chat works; vault writes succeed; compilation invokes vault_write_atomic; coordinator quotes vault content). Plus 1 chore (ee4da94) cleaning up placeholder verification scripts. No scope creep — every fix was a contract-correctness requirement surfaced by the live smoke check that unit tests structurally could not catch.

## Issues Encountered

**Pre-existing test infrastructure issues (NOT introduced by 02-08):** All carried from prior plans, tracked in deferred-items.md.

- `tests/unit/env.test.ts` — times out under parallel load (5s subprocess spawn); passes 6/6 in isolation. Pre-existing pattern from 02-02.
- `tests/agents/recompile-roundtrip.spec.ts` — temp-dir race in mkdtempSync. Pre-existing pattern from 02-04.
- `tests/integration/*` — 23 pre-existing failures in chdir/vmThreads-incompatible files (carried from 02-03 vmThreads workaround).

All passed cleanly in isolation; tracked in `.planning/phases/02-agents-and-chat/deferred-items.md`. None caused by 02-08.

**Pre-existing top-level test invocation error (NOT caused by 02-08):** `npm test -- --run` (no project filter) still fails with `Projects "integration" and "unit" have different 'maxWorkers' but same 'sequence.groupOrder'`. Per-project invocations all work. Pre-existing infrastructure issue from 02-01/02-03; surfaced by 02-06; out of scope for 02-08.

## User Setup Required

None — no new external services or keys required. The recompile loop uses Anthropic + Voyage + Postgres which were already configured in 02-01 + 01-03. To smoke test: `bsp serve` (one terminal) + `npm run dev` (another terminal) → visit http://localhost:5173 → click Recompile or type `/recompile`.

## Next Phase Readiness

**Phase 2 is functionally complete.** All four ROADMAP success criteria for Phase 2 are satisfied (verified live during the 02-08 smoke check):

1. ✓ User opens the React app, types into chat, sees streamed responses + tool-call trace shows research sub-agent invoking Tavily.
2. ✓ Research turn lands findings as sources/claims rows before any wiki write; coordinator pushes back on quantitative-shaped unsourced claims.
3. ✓ User clicks Recompile (or types `/recompile`) and the compilation sub-agent — the only agent holding `vault_write_atomic` — updates the vault.
4. ✓ Chat surfaces wiki markdown chunks inline with claim citations (coordinator quotes vault content via vault_read); hybrid search returns sensible results for queries against existing claims.

**Ready for `/gsd-verify-work 02` (Phase 2 verification).** The verifier scopes its checks to the deferred items aggregated below.

**Blockers for next plan:** None. Phase 3 (Full Compilation) is the next phase per ROADMAP.

## Deferred Items (Aggregated for Phase 2 Verifier)

These 8 items span 02-04, 02-07, 02-08, 02-09. Aggregated here because 02-08 is the last plan close-out before Phase 2 verification. STATE.md Verification Debt section also tracks these.

1. **02-09 — 12 user-labeling slots deferred** (already tracked since 02-09 close)
   - Resolution: user runs `/gsd-verify-work 02` after labeling
   - Blocks closing CRIT-01 dimension #4 gate

2. **02-07 — ToolTrace + WikiCitation inline integration into Thread message renderer**
   - Components ship standalone; integration into `<MessagePrimitive.Content components={...}>` deferred to polish round
   - Note: chat works without it (user confirmed Step 8 of smoke check); this is a UX enhancement

3. **02-07 — ClaimChip live-runtime subscription seam**
   - Hook + helper wired; subscription to assistant-ui's chunk stream pending (5 unit probes verify the contract)

4. **02-07 — `obsidian://` deeplink end-to-end**
   - URL construction unit-tested in tests/ui/wiki-citation.spec.tsx
   - Live verification gated behind WikiCitation Thread integration (item #2)

5. **02-08 — Multi-topic index aggregation + orphan-page reaping (NEW from this smoke check)**
   - runCompile only ever writes ONE topic page per compile and OVERWRITES index.md
   - Old topic files left on disk when primary topic shifts (smoke check produced both vault/topics/strategic-positioning.md AND vault/topics/untagged.md as orphans)
   - Resolution: Phase 3 "Full Compilation"
   - Reference: src/compilation/runner.ts from commit 204c970 (Phase 1 plan 01-04)
   - Authority hook: coordinator's own chat response (verbatim), surfaced during 02-08 Task 6 smoke check via vault_read

6. **02-08 — chunk-shape regression-guard test had structural insufficiency** (now closed by commit 50d2f44 but worth noting for lessons-learned)
   - Original tests/ui/streaming.spec.tsx tested transport SETUP not actual rendering
   - Replaced with real DOM-rendering test that drives a UIMessage stream
   - Process lesson: when a deviation note says "may need a thin client-side adapter," the test for that deviation needs to actually exercise the adapter contract — not just the wiring

7. **02-08 — Pre-existing test flakes (NOT introduced by this plan)**
   - tests/unit/env.test.ts — times out under parallel load (5s subprocess spawn)
   - tests/agents/recompile-roundtrip.spec.ts — temp-dir race in mkdtempSync
   - tests/integration/* — 23 pre-existing failures in chdir/vmThreads-incompatible files (carried from 02-03 vmThreads workaround)
   - All passed cleanly in isolation; tracked in deferred-items.md

8. **02-04 — Layer-2 hook test had wrong contract** (now closed by commit 9f4195d)
   - Original test fabricated agent_id: 'compilation' literal — SDK actually emits a UUID at agent_id and the registered TYPE NAME at agent_type
   - Process lesson: synthetic test events should match the SDK's real shape (cite the sdk.d.ts line ref in the test fixture), not invented field names

## Threat Surface Scan

No new security-relevant surface beyond the plan's `<threat_model>`. The two declared threats:

- **T-02-01 (carry-forward)** (Elevation of Privilege — recompile route → compilation only): mitigated. The agents map passed to query() in src/server/routes/recompile.ts contains ONLY `compilation: compilationDef`. Asserted by tests/server/recompile-route.spec.ts (`opts.options.agents.research === undefined`). Single-writer-to-vault invariant preserved.
- **T-02-RECOMPILE-01** (Denial of Service — unlimited recompile invocations): accepted per plan. Phase 2 single-user dev tool; no rate limit on POST /recompile. Phase 1's deterministic runCompile short-circuits on hash-equal pages.

Plus a derived note: the vault-audit hook fix (9f4195d) is itself a security correctness improvement. Pre-fix the hook was structurally bypassable by every legitimate caller (vault was unwritable, but the failure mode was "Layer 2 always blocks" not "Layer 2 always allows"). Post-fix the hook correctly enforces compilation-only writes via agent_type comparison. Defense in depth restored.

No threat flags this plan.

## Known Stubs

None. All stubs documented in 02-07 SUMMARY were resolved or carried forward as documented deferred items above. Specifically:

- ✓ RecompileButton onClick — resolved (real fetch + SSE)
- ✓ RecompileStatus polling — resolved (real 5s polling)
- ✓ Composer slash-command — resolved (intercepts /recompile)
- ✓ useRecompile hook + AppShell wiring — resolved (lifted; idempotency invariant)
- ↦ ToolTrace/WikiCitation inline integration — DEFERRED (item #2)
- ↦ ClaimChip live subscription seam — DEFERRED (item #3)
- ↦ /api/claims/:id lazy-fetch endpoint — DEFERRED (not addressed; ClaimChip silent fallback retained)
- ↦ obsidian:// deeplink end-to-end — DEFERRED (item #4)

## TDD Gate Compliance

This plan is `type: execute` (not `type: tdd`); per-task TDD gates do not apply. Tasks 4 + 5 ship tests AFTER the corresponding implementation (Task 3). Standard for non-TDD execute plans. Smoke-check fix commits include their own targeted tests (vault-writer-gate corrections, app-shell-recompile-shared-state, use-recompile, recompile-system-message, vault-read-live, real DOM streaming test).

## Self-Check: PASSED

Files created (all present):
- `src/server/routes/recompile.ts` — FOUND
- `src/ui/hooks/useRecompile.ts` — FOUND
- `src/ui/components/Composer.tsx` — FOUND
- `tests/server/recompile-route.spec.ts` — FOUND
- `tests/ui/recompile-button.spec.tsx` — FOUND
- `tests/ui/slash-command.spec.tsx` — FOUND
- `tests/ui/thread-composer-integration.spec.tsx` — FOUND
- `tests/ui/recompile-system-message.spec.tsx` — FOUND
- `tests/ui/use-recompile.spec.tsx` — FOUND
- `tests/ui/app-shell-recompile-shared-state.spec.tsx` — FOUND
- `tests/agents/vault-read-live.spec.ts` — FOUND

Files modified (verified by grep + commit hashes):
- `src/server/index.ts` — recompileRoute mount present
- `src/server/routes/chat.ts` — extractUserMessage helper present (line 107)
- `src/server/streaming.ts` — text-start/text-delta/text-end with shared id present (line 39-41)
- `src/ui/components/RecompileButton.tsx` — useRecompile consumed via props
- `src/ui/components/RecompileStatus.tsx` — /recompile/status polling present
- `src/ui/components/HeaderBar.tsx` — props-driven recompile state
- `src/ui/components/assistant-ui/thread.tsx` — Composer wrapper integrated
- `src/ui/App.tsx` — useRecompile lifted; D-18 system message
- `src/agents/hooks/vault-audit.ts` — agent_type field present (line 12, 100, 107, 111, 119, 125)
- `src/agents/coordinator.ts` — vault_read in allowedTools (line 87); permissionMode bypassPermissions (line 161)

Vault artifacts on disk:
- `vault/topics/strategic-positioning.md` — FOUND (content_hash sha256:dcbcda... compile_run 01KQ817M5SHBDK9DTWETJ8DH9D)
- `vault/topics/untagged.md` — FOUND (orphan from second compile — Phase 1 limitation, deferred to Phase 3 per item #5)

Commits exist (all 14 present in git log):
- `7884a0d` — feat(02-08): POST /recompile (SSE) + GET /recompile/status (JSON)
- `15677cd` — test(02-08): recompile-route Wave 0 probe (COMP-11) + finish-chunk dedup
- `9c293b6` — feat(02-08): wire RecompileButton + RecompileStatus + Composer slash
- `1492415` — test(02-08): RecompileButton Wave 0 probe (UI-06) — 3 cases
- `5713a58` — test(02-08): Composer slash-command Wave 0 probe (COMP-11) — 4 cases
- `7d33b5c` — feat(02-08): integrate slash-command Composer wrapper into Thread (D-18 wiring)
- `f163bac` — feat(02-08): wire RecompileButton.onCompleted to D-18 system message in App
- `9f4195d` — fix(02-08): vault-audit hook checks subagent_type, not runtime agent_id
- `b3213cd` — fix(02-08): lift useRecompile to AppShell — share inFlight across button and slash
- `9c3d0cb` — fix(02-08): chat route accepts AI SDK chat-protocol body
- `2164492` — fix(02-06): emit AI SDK 6 native UIMessageChunk shapes
- `50d2f44` — test(02-07): real chat rendering test that drives a UIMessage stream
- `ee4da94` — chore(02-08): remove placeholder verification files used during AI SDK 6 fix
- `0c0e2fa` — fix(02-08): two architectural fixes from end-to-end smoke check

Test results re-verified at close-out:
- `npm test -- --run --project ui` → 12/12 files / 38/38 cases green in 7.13s
- `npm test -- --run --project unit` → 19/19 files / 136/136 cases green in 14.85s
- `npm test -- --run --project agents` → 13/13 files / 57/57 cases green in 10.73s
- `npm run build` → exits 0 (clean tsc -p tsconfig.node.json)
- `npm run tsc:web` → exits 0 (clean tsc --noEmit -p tsconfig.web.json)

## References

- AI-SPEC §3 (recompile loop) — POST /recompile invokes compilation sub-agent ONLY
- 02-CONTEXT D-15 (slash-command interception) / D-16 (dirty-claims-count formula) / D-17 (in-flight copy) / D-18 (post-success system message verbatim)
- 02-RESEARCH §COMP-11 (route invokes compilation sub-agent only — no research, no coordinator)
- 02-VALIDATION row COMP-11 + UI-06
- @anthropic-ai/claude-agent-sdk sdk.d.ts:131 (BaseHookInput.agent_id) + sdk.d.ts:135 (BaseHookInput.agent_type) + sdk.d.ts:1447 (PermissionMode default) — authority for vault-audit field name + permissionMode fixes
- ai package dist/index.d.ts:2151 (DataUIMessageChunk shape: `{type, id?, data, transient?}`) — authority for AI SDK 6 native chunk shapes
- CLAUDE.md project doctrine — single-user-local-only architecture justifies permissionMode: 'bypassPermissions'

---
*Phase: 02-agents-and-chat*
*Plan: 08*
*Completed: 2026-04-27 (smoke check approved 2026-04-27 after 7 in-smoke fix cycles)*
