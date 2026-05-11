---
stepsCompleted:
  [step-01-validate-prerequisites, step-02-design-epics, step-03-create-stories]
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/ux-design-specification.md
  - _bmad-output/planning-artifacts/product-brief-business-planner-bmad-distillate.md
---

# business-planner-bmad - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for business-planner-bmad, decomposing the requirements from the PRD, UX Design Specification, and Architecture decisions into implementable stories.

## Requirements Inventory

### Functional Requirements

**Chat & Conversation**

- **FR1:** User can send messages to the agent via a chat interface.
- **FR2:** User can view agent responses streaming token-by-token in real time.
- **FR3:** User can view the agent's thinking and reasoning process during response generation.
- **FR4:** User can view tool calls the agent is making and their results as they occur.
- **FR5:** User can expand and collapse agent thinking and tool call details.
- **FR6:** User can view the full conversation history within a session.

**Research & Evidence**

- **FR7:** Agent can perform web searches to research a topic and return sourced findings.
- **FR8:** Agent can collect and store evidence with original source URLs for every research finding.
- **FR9:** User can view the source citation for any research finding the agent presents.
- **FR10:** Agent can perform multiple sequential research queries to build depth on a topic.
- **FR11:** Agent can distinguish between findings with strong evidence and findings with weak or insufficient evidence, and communicate confidence levels.

**Critical Thinking & Challenge**

- **FR12:** Skeptic sub-agent can independently challenge the primary agent's findings and recommendations with evidence-based pushback.
- **FR13:** Skeptic sub-agent's challenges are displayed inline in the chat, visually distinct from the primary agent's responses.
- **FR14:** Skeptic sub-agent can calibrate pushback intensity based on evidence strength and decision stakes.
- **FR15:** Agent can enter steelmanning mode when the user disagrees — actively searching for evidence supporting the user's opposing position.
- **FR16:** Agent can present both sides of a disagreement with supporting evidence and sources for each.
- **FR17:** User can make a final decision after reviewing both sides of a challenged position.
- **FR18:** Agent can preserve intelligence findings independently of user decisions — findings persist unchanged even when the user decides against them.
- **FR19:** User can review past decisions and see what evidence existed on both sides at the time of the decision.

**Knowledge Management**

- **FR20:** Agent can store research findings, evidence, and decision logs in a durable knowledge repository scoped to the current project.
- **FR21:** Agent can retrieve relevant prior findings from the knowledge repository when a related topic is discussed.
- **FR22:** User can ask questions about previously researched topics and receive informed answers with source citations.
- **FR23:** Agent can identify when retrieved context may be stale or contradictory and flag it to the user.
- **FR24:** Agent can store session checkpoint data to the knowledge repository for later resume.
- **FR25:** Agent can identify and surface information gaps — "this data doesn't exist" is a valid finding, not a failure.

**Methodology Wiki**

- **FR26:** Agent can propose new wiki articles based on research or work completed.
- **FR27:** User can approve, reject, or modify agent-proposed wiki content.
- **FR28:** User can direct the agent to create or modify specific wiki articles.
- **FR29:** Agent can read and reference wiki articles to inform its behavior and responses.
- **FR30:** Agent can suggest wiki improvements at natural stopping points based on work completed.
- **FR31:** Wiki content persists across projects — available to the agent regardless of which project is active.
- **FR32:** Agent can guide the user through an initial wiki bootstrapping experience on first launch.

**Session Management**

- **FR33:** User can view a context health gauge showing remaining context capacity with graduated indication (not binary).
- **FR34:** User can trigger a session checkpoint to save current state.
- **FR35:** Agent can resume a prior session by loading checkpoint data and relevant intelligence from the knowledge repository.
- **FR36:** After resume, agent can answer questions about prior session topics, key decisions, and open questions without the user re-explaining context.
- **FR37:** Agent can identify and suggest natural stopping points in the current work.
- **FR38:** User can view a summary of what was saved during the last checkpoint.

**Project Management**

- **FR39:** User can create a new project with a unique identifier.
- **FR40:** User can switch between projects.
- **FR41:** Each project maintains its own isolated intelligence store.
- **FR42:** Agent can reference wiki-stored learnings from prior projects when working on a new project.
- **FR43:** User can view approximate API cost information for the current session or project.

### NonFunctional Requirements

**Integration**

- **NFR1:** The application must handle Claude API errors (rate limits, timeouts, 5xx) gracefully — display a clear error message and allow retry without losing the current message draft or conversation state.
- **NFR2:** The application must handle Tavily API failures without crashing the agent's response flow — the agent reports the failure and continues reasoning with available information.
- **NFR3:** The application must handle Pinecone API failures without data loss — writes must be confirmed before "checkpoint saved" is shown; retrieval failures surface as explicit warnings, not silent gaps.
- **NFR4:** All third-party API keys must be stored in environment variables (`.env`), never committed to source control or exposed in the UI.
- **NFR5:** The application must function correctly when Tavily or Pinecone are temporarily unreachable — the chat remains usable with degraded research/memory capabilities clearly indicated.

**Data Integrity & Reliability**

- **NFR6:** Intelligence data written to Pinecone must be confirmed via API response before the UI reports success. No fire-and-forget writes for checkpoint or intelligence storage.
- **NFR7:** Wiki files must be written atomically — a crash or error mid-write must not corrupt existing wiki content.
- **NFR8:** Decision logs that preserve intelligence on both sides of a disagreement must be stored as immutable records — subsequent decisions cannot overwrite the original evidence capture.
- **NFR9:** Session checkpoint data must include enough context for reconstruction — at minimum: conversation summary, key decisions, open questions, and an intelligence manifest.
- **NFR10:** The Postgres database (Phase 2) must run in a Docker container with a named volume, ensuring data persists across container restarts.

**Performance**

- **NFR11:** UI interactions must remain responsive during agent processing — no UI-thread blocking while waiting for API responses.
- **NFR12:** Streaming token display must begin within 3 seconds of the user sending a message (to first visible token), excluding research-heavy queries where tool calls execute first.
- **NFR13:** Session resume (checkpoint load + Pinecone retrieval + context reconstruction) should complete within 15 seconds with a loading indicator visible.
- **NFR14:** The chat UI must handle conversations of 200+ messages within a single session without significant rendering degradation.

### Additional Requirements

**Starter Template (Epic 1 Story 1 anchor):**

- **AR-STARTER:** Architecture specifies the project MUST be initialized as an assembled pnpm monorepo using official templates: Vite + React + TS SPA at `apps/web`, Fastify + TS backend at `apps/server`, and a shared TypeScript types package at `packages/shared`. Wiki directory at repo root (`wiki/`). Docker Compose stub for Postgres + pgAdmin at `docker/` (Phase 2 stub, not built). Turborepo optional for build caching. Full directory tree defined in architecture doc.

**Runtime & Tooling Baseline:**

- Node 22 LTS, pnpm 9.x workspaces, TypeScript `strict` + `noUncheckedIndexedAccess` on both apps.
- ESLint flat config (`@typescript-eslint/recommended-strict`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`) + Prettier; pre-commit hook via husky + lint-staged running `pnpm lint && pnpm typecheck && pnpm test`.
- Turborepo topological build ensures `packages/shared` compiles before either app.
- Vitest on both sides; integration tests gated behind `INTEGRATION=1`.

**Environment & Secrets:**

- `.env` at repo root, `.env.example` committed with placeholders, `.env` gitignored.
- Server config validates env with `zod` at boot and fails fast on missing keys.
- Required API keys: `ANTHROPIC_API_KEY`, `TAVILY_API_KEY`, `PINECONE_API_KEY`, `VOYAGE_API_KEY`.
- Backend binds to `127.0.0.1`; `@fastify/cors` for `http://localhost:5173` in dev; `@fastify/static` serves built SPA from same origin in prod.

**Orchestration & Agent Topology:**

- Claude Agent SDK for TypeScript (v1 stable) as the orchestration framework.
- Orchestrator + a single isolated skeptic sub-agent (research is a TOOL, not a sub-agent).
- Skeptic receives only an explicit "claims + evidence" bundle from orchestrator — no ambient access to main history.
- Every external side-effect is an explicit Claude SDK tool in `apps/server/src/tools/`.
- `PreToolUse` / `PostToolUse` hooks wire cost metering + audit-log events.

**Transport & API:**

- Server-Sent Events (SSE) via `@fastify/sse-v2` for all agent streams; REST + JSON for non-streaming CRUD (projects, sessions, checkpoints, costs).
- `packages/shared` is the single source of truth for `AgentEvent` discriminated union, `ErrorCode` union, domain types, request/response envelopes, and cost event shapes.
- Wire format: `snake_case` JSON on the wire, TS shapes mirror exactly (no camel/snake translation layer).
- ISO-8601 UTC dates everywhere; UUID v4 for all IDs (server-generated).
- Error envelope: `{ error: { code, message, retryable } }`.

**Data Architecture:**

- Single Pinecone Serverless index `business-planner-intelligence` via `@pinecone-database/pinecone` v4.x.
- Namespace per project (`projectId`), metadata filter on `record_type` across 5 record types: `research_finding`, `evidence`, `decision_log` (immutable), `session_checkpoint`, `intelligence_brief`.
- Voyage AI `voyage-3-large` (1024-d) for embeddings via `voyageai` SDK; embed + write in same tool call.
- Staleness signaling: `created_at` + `superseded_by` + `last_verified_at`; records older than 90 days surface a "verify freshness" hint.
- Research findings are append-only; updates create new records with `supersedes` pointer.
- Postgres + pgAdmin Docker Compose file committed in `docker/` but Phase 2 — no migrations or schema yet.

**Methodology Wiki (Karpathy three-layer pattern):**

- `wiki/` at repo root, git-versioned, usable as a vanilla Obsidian vault (user's editor; no in-app wiki editor).
- Three layers: raw sources (`wiki/sources/`), LLM-owned pages (`wiki/pages/`), schema file (`wiki/SCHEMA.md`).
- `wiki/index.md` is primary navigation — agent reads it first every turn.
- `wiki/log.md` append-only; every ingest/query/lint pass timestamped.
- `[[wikilink]]` canonical cross-reference format (Obsidian-native + Karpathy pattern); parsed by `apps/server/src/wiki/links.ts`.
- All wiki writes go through `apps/server/src/wiki/writer.ts` — single atomic choke point (temp + `fs.rename`); no other module may write to `wiki/`.
- No vector DB for wiki at Phase 1 scale; no Obsidian plugins required.

**Runtime Data Root (`./data/`, gitignored):**

- `data/costs/{projectId}.jsonl` — append-only cost events (one JSON per line).
- `data/sessions/{projectId}/{sessionId}.jsonl` — full agent-event transcript for replay/debug.
- `data/logs/server.jsonl` — Pino structured backend log.

**Frontend Stack:**

- React 19 + Vite 5.x + TypeScript strict.
- Tailwind CSS (Vite plugin) + shadcn/ui (copy-in) + Lucide icons.
- Dark mode default and only (no toggle, no light-mode styles).
- State management: Zustand (streaming/session/cost/context state with `immer` middleware globally) + TanStack Query (HTTP reads).
- No React Router (single SPA view; project/session is state not URL); no form library (controlled inputs only).
- react-virtuoso for conversation message list (NFR14).
- react-markdown + remark-gfm + rehype-highlight for agent/skeptic markdown; user messages are plain text.
- Feature-folder organization under `apps/web/src/features/*`.

**Resilience & Error Handling:**

- Backend throws typed `AppError { code: ErrorCode; retryable: boolean }`; single Fastify error hook maps to JSON envelope; stack traces never leak to the client.
- Per-dependency retry policy: Claude exponential backoff ×3 on rate-limit/5xx; Tavily single retry then "research degraded"; Pinecone write blocks until ack then surfaces retry; Pinecone read falls back to in-memory session cache; Wiki write atomic temp+rename, git as rollback; Voyage treated like Claude (backoff ×3), terminal failure surfaces as `pinecone_write_failure`.
- Every error emits an `error` SSE event AND logs to Pino with structured context.
- Pinecone write failure is the ONLY class that blocks UI progress — all others degrade gracefully.

**Observability (5 log streams, in-UI only):**

1. Backend app log — Pino JSON lines to stdout + `data/logs/server.jsonl`.
2. Agent event transcript — SSE mirror to `data/sessions/{projectId}/{sessionId}.jsonl`.
3. Wiki activity log — `wiki/log.md` append-only markdown (Karpathy pattern).
4. Cost events — `data/costs/{projectId}.jsonl`.
5. Decision log — Pinecone `record_type=decision_log` (immutable, RAG-queryable).

No external APM (Sentry, Datadog, analytics).

**Cost Meter:**

- Per-provider breakdown (Claude input/output tokens, Tavily queries, Pinecone ops, Voyage embeddings) stored per event in JSONL.
- Per-session and per-project aggregation surfaced through SSE `cost.update` events and `GET /api/projects/:projectId/costs` REST endpoint.
- `CostBreakdown` shape lives in `packages/shared/src/costs.ts`.

**Naming & Structure Patterns (enforced):**

- `PascalCase.tsx` for React components; `camelCase.ts` for hooks/services/utilities; `kebab-case` for non-code assets and root config; tests co-located (`Foo.tsx` + `Foo.test.tsx`).
- Event naming: `namespace.action` lowercase dot-separated segments; only variants present in the `AgentEvent` union may be emitted.
- Endpoints plural-noun-nested: `/api/projects/:projectId/sessions/:sessionId/messages`; path params in `:camelCase`.
- Backend bounded-context folders with barrel `index.ts`: `agent/`, `tools/`, `clients/`, `domain/`, `routes/`, `config/`, `events/`, `wiki/`, `errors/`, `logging/` — cross-folder imports via barrels only.
- SSE events emitted only via typed builders in `apps/server/src/events/` — no raw `res.write` of string literals.
- `projectId` passed explicitly through every data-access call — never ambient.

**ProjectId as Cross-Cutting Boundary:**

- `projectId` threads through Pinecone namespace, cost file path, session file path, URL path param, Zustand store.
- Project-switch must be atomic: orchestrator drains in-flight events, flushes Zustand slices, swaps `projectId`, remounts affected features. Half-swapped state is an explicitly-called-out bug class.

**Deployment:**

- 100% local. `pnpm dev` runs Vite (`:5173`) and Fastify (`:3000`) in parallel via Turborepo; Vite proxies `/api` → `:3000`. `pnpm start` boots Fastify in prod and serves `apps/web/dist` via `@fastify/static` from same origin.
- No CI/CD for Phase 1; no cloud; no container for the app itself in Phase 1 (Postgres containers come online in Phase 2).

### UX Design Requirements

**Design System Foundation:**

- **UX-DR1:** Install Tailwind CSS + shadcn/ui in dark-mode-only configuration. No light-mode styles, no theme toggle, no dual palette.
- **UX-DR2:** Define dark neutral base palette: background `#18181b`–`#1e293b` (zinc-900/slate-900), surface `#27272a` (zinc-800), primary text `#e4e4e7` (zinc-200), secondary text `#a1a1aa` (zinc-400), border `#3f3f46` (zinc-700). No pure black backgrounds, no pure white text.
- **UX-DR3:** Define semantic color assignments: primary accent blue-400/500 (links, user highlights); skeptic voice amber-400/500 (warm, not warning); citations/sources cyan-400; confidence/context gauge gradient green→yellow→red; success emerald-400; error red-400; tool calls/thinking muted zinc-500.
- **UX-DR4:** System font stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`) for body; monospace stack (`"Fira Code", "Cascadia Code", "JetBrains Mono", "Consolas", monospace`) for code/JSON/technical content. No custom font loading.
- **UX-DR5:** Tight IDE-like type scale: page title 20/600/1.3, section header 16/600/1.3, body and skeptic 15/400/1.5, tool calls/thinking 13/400/1.4, citations/status bar 12/500/1.3.
- **UX-DR6:** 4px base spacing unit. 8px between chat messages, 12px message bubble padding, 12px sidebar/input padding, 32px status bar height.
- **UX-DR7:** Chat message max-width 800px centered in the stream; fluid within the desktop viewport.

**Layout (Direction B — overlay sidebar + bottom status bar):**

- **UX-DR8:** Overlay sidebar 320px left-positioned, z-indexed above chat with shadow for depth. Does NOT reflow chat content. Opens from left; closes on ✕ button or outside click.
- **UX-DR9:** Bottom status bar (32px fixed, full width) containing: sidebar toggle (hamburger), active project name, `ContextHealthGauge` with percentage label, session cost, `CheckpointButton`.
- **UX-DR10:** Fixed-bottom input area with auto-expanding textarea + primary send button.
- **UX-DR11:** Sidebar five tabs — Intelligence | Skeptic | Wiki | Decisions | History — using shadcn/ui Tabs with minimal blue-underline active indicator. Projects is not a tab; project switching is a `ProjectSwitcher` dropdown per UX-DR35.

**Custom Components (beyond shadcn/ui primitives):**

- **UX-DR12:** `ChatMessage` component with six variants rendered in-stream: `user` (blue-tinted `#1e3a5f` background + blue border + rounded), `agent` (no container, default text on page background), `skeptic` (amber-tint `#78350f18` + subtle amber border `#f59e0b30` + rounded + "Skeptic" label in `#f59e0b`), `steelman` (agent-like with "Steelmanning your position" label, renders For/Against sections), `decision` (blue-tinted `#1a1a2e` + blue border + clipboard icon + amber warning line if decision went against evidence), `system` (centered muted no-container — used for "Resuming session..." and loading indicators). Messages are immutable once rendered; no hover/selection/edit.
- **UX-DR13:** `ToolCallRow` collapsed-by-default: chevron icon + single-line summary text (e.g., "Searching Tavily for: ...") in muted `#71717a`. Click anywhere on row to toggle; expanded panel shows query details, result count, timing, status on dark background `#1a1a1e` in monospace.
- **UX-DR14:** `CitationTag` — numbered inline tag (cyan `#22d3ee` on dark cyan `#164e63`), clickable opens source URL in a new tab. Native `title` attribute carries source description (no custom tooltip for MVP).
- **UX-DR15:** `ConfidenceBadge` — inline badge with three levels rendered after finding text: high (`#14532d` bg / `#4ade80` text / "high confidence"), medium (`#713f12` bg / `#fbbf24` text / "medium confidence"), low (`#7f1d1d` bg / `#f87171` text / "low confidence").
- **UX-DR16:** `ContextHealthGauge` — 120px × 6px progress bar in status bar with gradient fill transitioning green (100–50%) → yellow (50–25%) → red (<25%) plus percentage label. Passive indicator (no alerts, no popups).
- **UX-DR17:** `CheckpointButton` — ghost-style button with save icon in status bar. States: default (muted ghost), hover (slightly highlighted), saving (spinner replaces icon), saved (toast appears bottom-right with topic summary, e.g., "Checkpoint saved — competitive analysis"). Single-click action; no confirmation dialog; no options dialog.
- **UX-DR18:** `StreamingTokenDisplay` — appends tokens to current message as SSE events arrive, renders cursor/caret at end of streaming text, auto-scroll keeps latest content visible; when streaming completes, message finalizes into a standard `ChatMessage`.

**Interaction Patterns:**

- **UX-DR19:** Inline-citation interaction — clicking any `CitationTag` opens the source URL in a new browser tab; title attribute shows source description (native browser tooltip for MVP).
- **UX-DR20:** Tool calls and thinking sections collapsed by default; user expands on demand. Final response always visible.
- **UX-DR21:** Chat auto-scroll — sticks to bottom on new content; pauses automatically when the user has scrolled up; surfaces a "scroll to bottom" indicator when new content arrives while scrolled up.
- **UX-DR22:** Steelmanning triggered conversationally from user's natural-language disagreement (no button, no command). Agent labels its response "Steelmanning your position" and presents For/Against sections each with citations and confidence levels.
- **UX-DR23:** Skeptic selectivity rules (when skeptic speaks up vs. stays silent): speaks on unsupported claims, assumption leaps, contradictions with prior intelligence, high-stakes decisions with low-confidence data, and pattern repetition recognized via wiki cross-project memory; silent during well-sourced high-confidence output, user-posed questions, and procedural conversation (wiki/checkpoint/project-switch).
- **UX-DR24:** Markdown rendering applies to agent and skeptic messages (headers, bold, italic, lists, code blocks with monospace + dark `#1a1a1e` background; links in blue accent, open in new tab). User messages are plain text only — no markdown rendering.
- **UX-DR25:** Chat-first single-stream interaction — skeptic appears inline in the same stream (not in a side panel or popup); all critical interactions (tool calls, decisions, wiki proposals, steelmanning, checkpoints confirmations) happen through the chat stream or toasts.

**Feedback Patterns:**

- **UX-DR26:** Success toast — bottom-right, green tint (`#14532d` bg / `#4ade80` text), auto-dismiss 4s, context-specific message (e.g., "Checkpoint saved — competitive analysis", not generic "Saved"). Applied to checkpoint saves, wiki writes, project creates.
- **UX-DR27:** Error toast — bottom-right, red tint (`#7f1d1d` bg / `#f87171` text), persists until dismissed, actionable message with retry affordance (e.g., "Tavily search failed — retry?"). If error is inside the agent's response flow, agent ALSO reports it inline in chat.
- **UX-DR28:** Stale/contradictory intelligence surfaced inline by the agent in natural language (not a toast, not a separate notification) — e.g., "Note: this finding was stored 3 weeks ago and may be outdated."
- **UX-DR29:** No info/notification pattern — no badges, no unread counts, no attention magnets; tool waits for user attention, does not compete for it.

**Empty & Loading States:**

- **UX-DR30:** First-launch empty state — no special UI, no tour, no wizard. Chat stream shows only the agent's opening message, which drives wiki bootstrap conversationally.
- **UX-DR31:** Session-resume loading — centered "Resuming session..." system message with subtle spinner while checkpoint + Pinecone retrieval complete (<15s per NFR13); transitions into the agent's structured orientation briefing (progress · decisions · open questions · next priority).
- **UX-DR32:** Sidebar empty states — single-line prompt per tab: "No wiki articles yet. Start a conversation to build the wiki." / "No decisions logged yet." / "No projects yet. Create one to get started." No illustrations, no CTAs, no getting-started guides.
- **UX-DR33:** Tool-call-in-progress state — `ToolCallRow` appears immediately when the agent initiates a tool call, summary text visible in-flight ("Searching Tavily for: [query]"), no separate loading spinner; row finalizes with result count/timing when complete.

**Navigation:**

- **UX-DR34:** Sidebar toggle — hamburger icon (☰) in status bar single-click opens/closes overlay; overlay opens from left with shadow; close via ✕ button or click-outside. No keyboard shortcut required for MVP.
- **UX-DR35:** Project switching — Projects tab in sidebar shows project list with active indicator; click switches (status bar updates, chat clears, agent loads new context); "New Project" inline text input at top of list (Enter to create); no confirmation dialog for switching.

**Button Hierarchy:**

- **UX-DR36:** Only one primary button (Send message, blue filled). All other clickable elements are ghost actions (checkpoint, sidebar toggle, tool-call expand/collapse, sidebar close). No secondary buttons, no destructive buttons, no button groups.

**Markdown & Scrolling:**

- **UX-DR37:** Thin, dark, unobtrusive scrollbar via shadcn/ui ScrollArea for both chat stream and sidebar. Independent scroll between the two surfaces.

**Accessibility (long-session usability, not compliance):**

- **UX-DR38:** WCAG AA contrast ratio (4.5:1) on dark backgrounds for body text — chosen for eye-strain prevention over hours of use, not for compliance.
- **UX-DR39:** Semantic HTML throughout so native keyboard navigation works without custom implementation; default Chrome focus indicators are sufficient; clickable elements have adequate hit targets.

**Out-of-scope clarifications (documented to prevent inadvertent implementation):**

- No responsive design, no mobile/tablet layouts, no media queries beyond the fluid chat max-width.
- No screen-reader optimization, no WCAG AAA formal compliance, no color-blind palette overrides, no reduced-motion support, no skip-links, no ARIA beyond semantic-HTML defaults.
- No in-chat wiki editor surface — Obsidian is the user's editor for `wiki/`.

### FR Coverage Map

Each functional requirement is mapped to the epic(s) that deliver it. NFR and UX-DR coverage is tracked in the epic descriptions below and will be refined at story granularity in Step 3.

| FR   | Epic                                        | Area                                              |
| ---- | ------------------------------------------- | ------------------------------------------------- |
| FR1  | Epic 1                                      | Send messages to agent via chat interface         |
| FR2  | Epic 1                                      | Streaming token-by-token responses                |
| FR3  | Epic 1                                      | Visible thinking / reasoning                      |
| FR4  | Epic 1 (shell) + Epic 2 (first real tools)  | Visible tool calls + results                      |
| FR5  | Epic 1                                      | Expand/collapse thinking & tool-call detail       |
| FR6  | Epic 1                                      | Full session conversation history                 |
| FR7  | Epic 2                                      | Web-search research with sourced findings         |
| FR8  | Epic 2                                      | Evidence + original source URL persistence        |
| FR9  | Epic 2                                      | Source citations for every finding                |
| FR10 | Epic 2                                      | Multi-step sequential research                    |
| FR11 | Epic 2                                      | Confidence levels on findings                     |
| FR12 | Epic 3                                      | Skeptic sub-agent evidence-based pushback         |
| FR13 | Epic 3                                      | Inline skeptic display, visually distinct         |
| FR14 | Epic 3                                      | Calibrated pushback intensity                     |
| FR15 | Epic 3                                      | Steelmanning mode on disagreement                 |
| FR16 | Epic 3                                      | Both-sides presentation with sources              |
| FR17 | Epic 3                                      | User-final-decision on challenged positions       |
| FR18 | Epic 3                                      | Intelligence preservation independent of decision |
| FR19 | Epic 3                                      | Past-decision review with evidence                |
| FR20 | Epic 2                                      | Durable storage (project-scoped)                  |
| FR21 | Epic 2                                      | Retrieval of relevant prior findings              |
| FR22 | Epic 2                                      | Cited recall on user probe                        |
| FR23 | Epic 2                                      | Staleness / contradiction flagging                |
| FR24 | Epic 5                                      | Checkpoint write to knowledge repository          |
| FR25 | Epic 2                                      | "No data is a finding" surfacing                  |
| FR26 | Epic 4                                      | Agent proposes wiki articles                      |
| FR27 | Epic 4                                      | Approve / reject / modify proposed content        |
| FR28 | Epic 4                                      | User-directed wiki article creation/modification  |
| FR29 | Epic 4                                      | Wiki-influenced agent behavior                    |
| FR30 | Epic 4                                      | Wiki improvement suggestions at stopping points   |
| FR31 | Epic 4                                      | Cross-project wiki persistence                    |
| FR32 | Epic 4                                      | First-launch wiki bootstrapping experience        |
| FR33 | Epic 5                                      | Context health gauge (graduated)                  |
| FR34 | Epic 5                                      | User-triggered session checkpoint                 |
| FR35 | Epic 5                                      | Session resume via checkpoint + retrieval         |
| FR36 | Epic 5                                      | Post-resume Q&A without re-explaining context     |
| FR37 | Epic 5                                      | Natural stopping-point detection                  |
| FR38 | Epic 5                                      | Last-checkpoint summary                           |
| FR39 | Epic 1                                      | Create project with unique ID                     |
| FR40 | Epic 1                                      | Switch between projects                           |
| FR41 | Epic 1                                      | Isolated per-project intelligence store           |
| FR42 | Epic 4                                      | Cross-project wiki-learning reference             |
| FR43 | Epic 1 (Claude baseline); extended per epic | Approximate API cost visibility                   |

**NFR coverage summary:**

- Epic 1: NFR1, NFR4, NFR5 (framework), NFR10 (Postgres Docker stub), NFR11, NFR12, NFR14
- Epic 2: NFR2, NFR3, NFR5 (research-degraded mode), NFR6
- Epic 3: NFR8
- Epic 4: NFR7
- Epic 5: NFR9, NFR13

## Epic List

### Epic 1: Foundation & Project-Scoped Chat

**Goal:** Deliver a shippable personal AI chat workbench — the user can scaffold the monorepo, create a project, and hold a streaming conversation with Claude Opus through a dark-mode UI that shows the agent's thinking, tool-call scaffolding, conversation history, and accruing cost. No research, skeptic, wiki, or memory yet — but every surface is in place for future epics to light up.

**FRs covered:** FR1, FR2, FR3, FR4 (shell only — no real tools yet), FR5, FR6, FR39, FR40, FR41 (namespace isolation via Pinecone bootstrap), FR43 (Claude-only baseline; extends in later epics)

**NFRs covered:** NFR1 (Claude error handling), NFR4 (env-var secrets), NFR5 (degraded-mode framework), NFR10 (Postgres Docker Compose stub for Phase 2), NFR11 (UI responsive during processing), NFR12 (first-token <3s), NFR14 (200+ message history via react-virtuoso)

**Key implementation notes:**

- Starter story MUST scaffold the pnpm monorepo per Architecture (`apps/web`, `apps/server`, `packages/shared`, `wiki/`, `docker/`) — this is an explicit architectural prerequisite for every downstream story.
- `packages/shared` ships with `AgentEvent` discriminated union, `ErrorCode` union, and core domain types so every subsequent epic extends rather than invents.
- Pinecone client module is bootstrapped (idempotent index creation + namespace-on-project-create) even though no intelligence records are written yet — sets up Epic 2.
- Cost meter ships for Claude tokens only; Epic 2+ extend it per new provider (Tavily, Voyage, Pinecone ops).
- Sidebar ships with all five tab slots (Intelligence / Skeptic / Wiki / Decisions / History) present — each slot renders a placeholder empty-state until later epics populate it. Project switching is a `ProjectSwitcher` dropdown (per UX-DR35), not a tab, and is functional from Epic 1.

---

### Epic 2: Web Research & Evidence-Backed Intelligence

**Goal:** The agent transforms from a conversationalist into a researcher — it performs sourced Tavily web searches, surfaces findings with inline citations and confidence levels, persists evidence to project-scoped durable memory, and on follow-up turns recalls prior findings with citations while flagging staleness. After Epic 2 the tool is a "Perplexity with project memory" — useful on its own even without adversarial challenge.

**FRs covered:** FR7, FR8, FR9, FR10, FR11, FR20, FR21, FR22, FR23, FR25

**NFRs covered:** NFR2 (Tavily failure handling), NFR3 (Pinecone failure handling, no data loss), NFR5 (research-degraded mode), NFR6 (confirmed Pinecone writes)

**Key implementation notes:**

- Tavily client + research tool registered with Claude Agent SDK (PreToolUse/PostToolUse hooks wire cost metering).
- Voyage `voyage-3-large` embedding client added; embed + Pinecone write happen in the same tool call with confirmed-write discipline (NFR6).
- Pinecone schema: `research_finding`, `evidence`, `intelligence_brief` record types (decision_log + session_checkpoint deferred to Epic 3 and 5 respectively).
- Staleness policy: `created_at` + `superseded_by` + `last_verified_at`; 90-day threshold surfaces freshness hint via agent natural-language warning (UX-DR28).
- `CitationTag` (cyan numbered inline) + `ConfidenceBadge` (3-level green/yellow/red) components built here.
- Tavily: single retry then surface `tavily_failure` + "research degraded" banner without blocking the turn.
- Pinecone: write blocks until ack (with retry affordance on failure); read falls back to session-local cache with warning.

---

### Epic 3: Adversarial Skeptic & Decision Accountability

**Goal:** The agent is no longer alone. An always-on, selectively-speaking skeptic sub-agent challenges findings with evidence-based pushback. When the user disagrees, the agent enters steelmanning mode — actively searching for the strongest evidence supporting the user's position — and presents both sides with citations. The user decides. The decision is logged immutably with full evidence context on both sides, including a marker when the decision goes against the stronger evidence. Past decisions are reviewable.

**FRs covered:** FR12, FR13, FR14, FR15, FR16, FR17, FR18, FR19

**NFRs covered:** NFR8 (immutable decision logs)

**Key implementation notes:**

- Skeptic sub-agent runs in an isolated Claude Agent SDK sub-agent context; receives an explicit "claims + evidence" bundle from the orchestrator — never ambient access to main history.
- Bundle-pass contract is the tightest coupling in the system; prompt + bundle schema co-evolve as a pair.
- `subagent.*` and `skeptic.challenge` events added to `AgentEvent` union; `ChatMessage` variants `skeptic`, `steelman`, `decision` ship here (per UX-DR12). Skeptic renders inline in the stream AND mirrors to `SkepticPanel` log entry.
- `decision_log` Pinecone record type added with immutability enforced at the tool level — `tools/decisionLog.ts` is the sole writer.
- Steelmanning is triggered conversationally from natural-language disagreement (no button).
- Skeptic selectivity rules per UX-DR23 (speaks on unsupported claims, assumption leaps, contradictions with prior intelligence, high-stakes low-confidence, cross-project pattern repetition once wiki ships in Epic 4; silent on well-sourced output, user questions, procedural conversation).
- Decisions sidebar tab populated (empty-state was shipped in Epic 1).

---

### Epic 4: Methodology Wiki (Karpathy pattern + Obsidian integration)

**Goal:** The agent acquires durable, cross-project methodology. On first launch, the agent guides the user through wiki bootstrap — researching foundational frameworks, proposing articles, receiving approve/modify/reject decisions through natural language. Downe edits pages directly in Obsidian; changes round-trip to the agent on the next read. Wiki-influenced responses become visibly different — the agent applies methodology without being reminded. Across projects, the wiki persists, enabling cross-project pattern recognition (Journey 4's second-venture payoff).

**FRs covered:** FR26, FR27, FR28, FR29, FR30, FR31, FR32, FR42

**NFRs covered:** NFR7 (atomic wiki writes)

**Key implementation notes:**

- Karpathy three-layer pattern implemented literally: `wiki/sources/` (immutable raw), `wiki/pages/` (LLM-owned markdown with `[[wikilinks]]`), `wiki/SCHEMA.md` (human-curated conventions).
- `wiki/index.md` is primary navigation — agent reads it FIRST every turn. `wiki/log.md` append-only records every ingest/query/lint pass.
- `apps/server/src/wiki/writer.ts` is the sole write choke point — atomic temp + `fs.rename` on same filesystem (NFR7). ESLint rule (if needed) or architectural convention prevents other modules from calling `fs.writeFile` into `wiki/`.
- Wiki tools: `read` (index + linked pages), `ingest` (source → summary + xrefs), `lint` (contradictions, stale claims, orphans). Agent invokes; user can also trigger `ingest` / `lint` via chat.
- Wiki proposal flow: agent proposes article content in a regular chat message; user approves/rejects/modifies in natural language; agent writes on approval; toast confirms (UX-DR26).
- Obsidian is the user's editor — no in-app wiki editor surface; Wiki sidebar tab shows article list + last-modified timestamps only.
- Cross-project behavior: agent reads wiki on every turn regardless of active project; `projectId` does NOT namespace the wiki; new-project Pinecone namespace is fresh but wiki carries forward.
- Skeptic gains access to wiki-based cross-project pattern recognition (the "you're making the same assumption twice" moment — Journey 4).

---

### Epic 5: Session Continuity — Context Gauge, Checkpoint, Resume

**Goal:** Multi-day workflows become first-class. The context health gauge provides graduated feedback on remaining capacity (green/yellow/red). A one-click checkpoint summarizes the session (conversation summary, key decisions, open questions, intelligence manifest) and writes it to Pinecone with confirmed-write discipline. On return — hours or days later — resume loads the checkpoint within 15 seconds and the agent leads with a structured orientation briefing (progress · decisions · open questions · next priority). Probing prior findings works: the user can ask "what did we find about X?" and get cited recall. The agent suggests natural stopping points.

**FRs covered:** FR24, FR33, FR34, FR35, FR36, FR37, FR38

**NFRs covered:** NFR9 (checkpoint content sufficient for reconstruction), NFR13 (resume <15s)

**Key implementation notes:**

- Context gauge: token-usage calculation + threshold logic in `apps/server/src/domain/contextGauge.ts`; SSE `context.update` events keep the UI bar live (green 100–50%, yellow 50–25%, red <25% per UX-DR16).
- `session_checkpoint` Pinecone record type added: prose `conversation_summary` (used as embedding source), open-questions list, intelligence-topic manifest, decision-count, context stats. NFR9 fields locked.
- `checkpointService` composes summary + manifest + emits `checkpoint.saved` + success toast with topic label (UX-DR26).
- Resume protocol: load checkpoint record by `session_id` → reconstruct orientation briefing via RAG over the project namespace → emit `system` `ChatMessage` with structured sections (progress / decisions / open questions / next priority per UX-DR31) → release input.
- Stopping-point detection: agent surfaces a suggestion at natural boundaries (e.g., completed a research thread, decision logged) — user chooses whether to checkpoint.
- `CheckpointButton` + `ContextGauge` + `SessionControls` features built here (status-bar slots reserved in Epic 1).
- Resume-fidelity probes: agent can answer "where did we land on X?" with cited Pinecone recall.

---

### Epic Sequencing & Independence

Each epic is independently valuable and shippable on its own merits:

1. **Epic 1** ships a usable "project-scoped AI chat client" — Claude Opus in a clean dark-mode UI with project isolation. Valuable as-is.
2. **Epic 2** adds Perplexity-grade research with project memory — useful without adversarial challenge.
3. **Epic 3** adds the skeptic + steelmanning + decision log — rigor without requiring methodology wiki.
4. **Epic 4** adds the Karpathy wiki and cross-project compounding — depth without requiring session resume.
5. **Epic 5** completes the multi-day workflow by making checkpoint/resume durable.

Epics build on prior epics but do NOT require future epics to function. The ordering matches the PRD's user journeys:

- Epic 1 + 4 unlock Journey 1 (first launch + wiki bootstrap)
- Epic 2 + 3 unlock Journey 2 (deep research with skeptic)
- Epic 5 unlocks Journey 3 (resume after days away)
- Epic 4's cross-project wiki + Epic 3's skeptic pattern-recognition unlock Journey 4 (new venture).

---

## Epic 1: Foundation & Project-Scoped Chat

**Goal:** Stand up the monorepo, runtime, and a project-scoped Claude Opus chat experience end-to-end — the baseline "usable AI chat client" that every later epic extends.

### Story 1.1: Monorepo scaffold & dev loop

As Downe (sole developer), I want a working pnpm monorepo with the locked directory layout and tooling, So that every later story can add features into a stable foundation instead of fighting setup.

**Acceptance Criteria:**

**Given** a clean repository root,
**When** I run the scaffold commands prescribed by the architecture document,
**Then** the top-level structure contains `apps/web`, `apps/server`, `packages/shared`, `wiki/`, `docker/`, `.env.example`, `pnpm-workspace.yaml`, `package.json`, `tsconfig.base.json`, `.eslintrc.cjs`, `.prettierrc`, `.gitignore`, and a root README describing the dev loop.

**Given** the scaffold is in place,
**When** I run `pnpm install` from the repo root,
**Then** all workspace dependencies resolve with zero peer-dependency warnings and a single top-level `pnpm-lock.yaml` is produced.

**Given** the workspaces are installed,
**When** I run `pnpm --filter @bp/web dev` and `pnpm --filter @bp/server dev` in separate terminals,
**Then** the Vite dev server starts on its configured port and the Fastify server starts on its configured port, each watching for file changes and hot-reloading on save.

**Given** both apps are running,
**When** I edit a TypeScript file in either app,
**Then** the affected app rebuilds within 2 seconds without losing the other app's process.

**Given** the repo is installed,
**When** I run `pnpm typecheck`, `pnpm lint`, and `pnpm test`,
**Then** each command exits with code 0 on an empty project, with ESLint configured for TypeScript + React, Prettier configured with project conventions, and Vitest configured to discover `*.test.ts` in both apps.

**Given** I attempt to commit a file with a lint error,
**When** the pre-commit hook runs,
**Then** husky + lint-staged reject the commit and print the offending rule, preventing unclean code from entering history.

**Given** a fresh clone of the repository,
**When** a reader opens `.env.example`,
**Then** they see placeholder entries for `ANTHROPIC_API_KEY`, `TAVILY_API_KEY`, `PINECONE_API_KEY`, `PINECONE_INDEX`, `VOYAGE_API_KEY`, `DATABASE_URL`, `DATA_ROOT`, `PORT`, `WEB_PORT`, and `NODE_ENV` with inline comments describing each.

---

### Story 1.2: Shared types package

As Downe, I want a `packages/shared` TypeScript package that owns the wire contract (REST envelopes, SSE event types, domain DTOs), So that the web and server apps cannot drift on field names, casing, or shape.

**Acceptance Criteria:**

**Given** the monorepo is scaffolded,
**When** I create `packages/shared` with its own `package.json`, `tsconfig.json`, and `src/index.ts`,
**Then** it builds as a workspace package consumable as `@bp/shared` from both `apps/web` and `apps/server` via `pnpm` workspace protocol, with strict TS enabled (`strict: true`, `noUncheckedIndexedAccess: true`).

**Given** the package exists,
**When** I inspect `src/`,
**Then** I find typed modules: `http.ts` (success/error envelopes, `ApiError`, `ErrorCode` union), `sse.ts` (`AgentEvent` discriminated union covering `message.delta`, `tool_call.start`, `tool_call.end`, `thinking.delta`, `cost.update`, `context.update`, `error`, `done`, and an extension point for future epics), `domain.ts` (Project, ChatMessage, ToolCall, Citation, ConfidenceLevel, DecisionRecord, Checkpoint skeletons), and `ids.ts` (branded UUID types).

**Given** a consumer imports `AgentEvent`,
**When** they write a `switch` over `event.type`,
**Then** TypeScript narrows each branch exhaustively and refuses to compile on a missing case, enforcing the enforcement rule from architecture.

**Given** the shared types define wire DTOs,
**When** I audit any field name,
**Then** every field is `snake_case` and every timestamp is typed as a branded `IsoUtcTimestamp` string alias — matching the architecture's end-to-end snake_case mandate.

**Given** either app depends on `@bp/shared`,
**When** the shared package is edited,
**Then** TypeScript project references cascade the change so both apps fail typecheck immediately if the contract is violated.

---

### Story 1.3: Fastify server bootstrap

As Downe, I want the Fastify server running with structured logging, typed errors, env loading, and a health route, So that every later server story adds handlers to a hardened runtime rather than re-solving boilerplate.

**Acceptance Criteria:**

**Given** `apps/server` exists,
**When** I run `pnpm --filter @bp/server dev`,
**Then** Fastify 5 boots, loads environment variables via a typed config module (Zod-validated, fails fast on missing required keys), and logs a startup banner via Pino with `level`, `time`, `pid`, `hostname`, and `git_sha` fields.

**Given** the server is running,
**When** I `GET /healthz`,
**Then** the response is `200 OK` with a JSON body `{ "status": "ok", "uptime_seconds": N, "version": "<pkg.version>" }` and the wire fields are snake_case.

**Given** a handler throws an `AppError` with `code: 'rate_limited'` and `status: 429`,
**When** the request completes,
**Then** the single Fastify error hook serializes the error into the shared envelope `{ error: { code, message, retryable, details? } }` and logs the error at Pino `warn` or `error` level based on severity — no handler writes an error response directly.

**Given** an unexpected exception escapes a handler,
**When** the error hook runs,
**Then** it returns a generic `{ error: { code: 'internal', message: 'internal_error', retryable: false } }` envelope with status 500, logs the full stack at `error` level, and does NOT leak stack traces to the client.

**Given** the server is running,
**When** I request a route that does not exist,
**Then** the 404 response uses the same envelope format with `code: 'not_found'`.

**Given** the env file is missing `ANTHROPIC_API_KEY`,
**When** I start the server,
**Then** it exits with a non-zero code within 100ms and prints a clear message naming the missing key — no partial startup.

---

### Story 1.4: Frontend shell — dark theme + Direction B layout

As Downe, I want the web app's empty shell rendering the Direction B layout in dark mode, So that later stories drop features into fixed regions instead of re-arguing layout.

**Acceptance Criteria:**

**Given** `apps/web` is scaffolded,
**When** I open the app in Chrome on a 1440×900 viewport,
**Then** I see the Direction B layout per UX-DR8: a 320px left overlay sidebar (hidden by default, collapsible), a centered 800px chat column, a fixed-bottom input bar, and a 32px status bar pinned to the viewport bottom.

**Given** the app has loaded,
**When** I inspect any element,
**Then** the entire interface renders dark-only (UX-DR1, UX-DR2): no light-mode toggle exists, Tailwind is configured with the locked dark palette, shadcn/ui is initialized with dark defaults, and system fonts + the IDE-like type scale (20/16/15/13/12 per UX-DR3) are loaded.

**Given** the layout is rendered,
**When** I click the sidebar toggle in the top-left corner,
**Then** the sidebar slides in as an overlay (not a push) with five tab slots labeled "Intelligence", "Skeptic", "Wiki", "Decisions", and "History" (in that left-to-right order, per UX-DR11), each showing a placeholder empty-state copy block (UX-DR17 pattern) since content ships in later epics.

**Given** the sidebar is open,
**When** I click outside it or press `Esc`,
**Then** the sidebar collapses.

**Given** the shell is rendered,
**When** I inspect the bottom,
**Then** the status bar shows placeholder slots for project name, context gauge, and cost meter — each a static skeleton that later stories wire to live data.

**Given** the shell is rendered,
**When** I inspect the input bar,
**Then** a multi-line textarea with Shift+Enter = newline and Enter = submit semantics is present (UX-DR22), initially disabled until a project is selected (Story 1.5 enables it).

**Given** the shell is mounted,
**When** I run `pnpm --filter @bp/web test`,
**Then** Vitest + React Testing Library render the root layout and assert the presence of sidebar toggle, status bar, chat column, and input bar.

---

### Story 1.5: Project CRUD + ProjectSwitcher + Pinecone namespace bootstrap

As Downe, I want to create, list, switch between, and soft-delete projects, each with its own Pinecone namespace, So that project isolation — the hard boundary underlying every later epic — works from day one.

**Acceptance Criteria:**

**Given** the server is running and Pinecone credentials are configured,
**When** I `POST /api/projects` with `{ "name": "radio-app", "description": "..." }`,
**Then** the server creates a project record with a server-generated UUID v4, persists it to the configured store (Postgres via migration if live; JSON fallback behind a feature flag for pre-DB development), ensures the Pinecone index `business-planner-intelligence` exists (creating serverless 1024-d cosine if absent), and returns `{ data: { project_id, name, description, namespace, created_at } }` where `namespace === project_id`.

**Given** projects exist,
**When** I `GET /api/projects`,
**Then** the response contains every non-deleted project as a `data: Project[]` array sorted by `created_at` descending.

**Given** I `DELETE /api/projects/:project_id`,
**When** the handler runs,
**Then** the project is marked `deleted_at` (soft delete) and excluded from subsequent `GET /api/projects` responses — Pinecone namespace is retained for historical reference per the product brief's "older corpora remain accessible" requirement.

**Given** the web app is loaded with no project selected,
**When** the app mounts,
**Then** a modal prompts me to create or select a project and the chat input remains disabled until I do (UX-DR17 empty state).

**Given** at least one project exists,
**When** I click the `ProjectSwitcher` in the top-left header area,
**Then** a dropdown lists all active projects, a "New project…" entry at the bottom, and selecting a project stores the `project_id` in the Zustand session slice, re-enables the chat input, and scopes every subsequent API/SSE request to that `project_id`.

**Given** I am in project A,
**When** I switch to project B via the ProjectSwitcher,
**Then** the chat history, sidebar tabs, status-bar gauges, and in-flight state reset to project B's scope — no project A data is visible, and the URL or stored session state persists the selection across page reloads.

**Given** a Pinecone namespace is bootstrapped for a new project,
**When** I inspect the Pinecone index,
**Then** the namespace exists under `business-planner-intelligence` keyed by `project_id` and is empty — ready for later epics to write research/decision/checkpoint records.

---

### Story 1.6: SSE infrastructure + typed event emitters

As Downe, I want a reusable SSE transport on the server and client with typed event emitters, So that the Claude orchestrator (Story 1.7) and every later streaming feature send/receive events through one hardened channel.

**Acceptance Criteria:**

**Given** `@fastify/sse-v2` is installed,
**When** I register the SSE plugin and open a test route `GET /api/sse/echo?token=<uuid>`,
**Then** the server responds with `Content-Type: text/event-stream`, keeps the connection open, and emits a heartbeat `: keep-alive` comment every 15 seconds to prevent proxy timeout.

**Given** the server exposes a domain SSE emitter helper,
**When** a handler calls `emit(reply, { type: 'message.delta', data: { message_id, delta } })`,
**Then** the event is serialized via the `AgentEvent` discriminated union from `@bp/shared`, rejected at compile time if the shape is wrong, and written as a single `event: message.delta\ndata: <json>\n\n` frame.

**Given** a connected SSE client,
**When** the server emits any `AgentEvent`,
**Then** the client's Zustand-backed SSE subscriber parses the JSON, narrows via the discriminator, and dispatches into the appropriate store slice (message, tool_call, thinking, cost, context, error) — unknown `type` values are logged and ignored, not thrown.

**Given** a client disconnects mid-stream,
**When** the server detects the closed socket,
**Then** it aborts any in-flight Claude/tool/RAG work attached to that stream, frees resources within 500ms, and logs a `stream.cancelled` event with `session_id` and `reason: 'client_disconnect'`.

**Given** an error occurs mid-stream,
**When** the emitter publishes an `error` event,
**Then** the client dispatches it into the toast framework (Story 1.12) and closes the stream cleanly without throwing — followed by a terminal `done` event.

**Given** the SSE infrastructure is in place,
**When** I run the test suite,
**Then** unit tests cover: emitter type safety, client parser narrowing, client reconnection on transient network drop (one retry with backoff), heartbeat emission, and graceful teardown on client disconnect.

---

### Story 1.7: Claude Agent SDK orchestrator + message route

As Downe, I want the server to route a user message through the Claude Agent SDK orchestrator and stream the response back over SSE, So that the chat becomes end-to-end live.

**Acceptance Criteria:**

**Given** the Claude Agent SDK v1 (TypeScript) is installed,
**When** I inspect `apps/server/src/agents/orchestrator.ts`,
**Then** a single orchestrator is defined with `claude-opus-4-7` as the primary model, a system prompt loaded from `apps/server/src/agents/prompts/orchestrator.md`, no sub-agents attached yet (skeptic lands in Epic 3), and an empty tool array (research tools land in Epic 2).

**Given** a project is selected,
**When** I `POST /api/projects/:project_id/messages` with `{ "content": "Hello", "sse_token": "<uuid>" }`,
**Then** the server persists the user message to the session store, opens the caller's SSE stream via the `sse_token`, invokes the orchestrator with the project-scoped context, and streams assistant output as `message.delta` events followed by a terminal `done` event.

**Given** the orchestrator is streaming,
**When** Claude emits token deltas,
**Then** each delta is forwarded as a `message.delta` event within 150ms of receipt (NFR11 responsiveness target), the assistant message is persisted incrementally, and the final assembled message is saved with `message_id`, `role: 'assistant'`, `created_at`, and token-usage metadata.

**Given** the Anthropic API returns a transient error (5xx / rate limit),
**When** the orchestrator catches it,
**Then** it retries with exponential backoff up to 3 attempts per the architecture's resilience policy, emits a `cost.update` event unchanged, and only surfaces an `error` SSE event after the final retry fails — the user-facing message uses the `AppError` envelope with `code: 'upstream_claude'` and `retryable: true`.

**Given** the orchestrator completes,
**When** I inspect the SSE transcript,
**Then** the emitted event sequence is: `message.delta*`, optional `thinking.delta*` (wired but empty until Story 1.10 renders them), `cost.update` (Story 1.11 renders), and finally `done` with `{ message_id, usage: { input_tokens, output_tokens } }`.

**Given** the route is wired,
**When** I run integration tests with a mocked Anthropic client,
**Then** a recorded fixture streams tokens, assertions verify SSE event ordering and shape, the user+assistant messages land in the session store, and cancellation mid-stream (client disconnect) aborts the SDK invocation.

---

### Story 1.8: Chat send + basic streaming display

As Downe, I want to type a message, send it, and see Claude's response stream back into the chat column, So that the foundational chat loop is functional end-to-end.

**Acceptance Criteria:**

**Given** a project is selected and the chat input is enabled,
**When** I type a message and press Enter,
**Then** the message renders immediately as a `ChatMessage` with `variant: 'user'` at the bottom of the chat column (UX-DR10), the input clears, the app opens an SSE stream, and the assistant's reply begins streaming into a new `ChatMessage` with `variant: 'assistant'` within 1 second (NFR11 responsiveness target).

**Given** the assistant is streaming,
**When** each `message.delta` event arrives,
**Then** the assistant `ChatMessage` appends the delta in place with a blinking caret at the streaming edge (UX-DR24 `StreamingTokenDisplay`), and the chat column auto-scrolls to keep the active message in view.

**Given** I press Shift+Enter in the input,
**When** the keystroke is captured,
**Then** a newline is inserted without submitting (UX-DR22), preserving multi-line composition.

**Given** a message is streaming,
**When** I click the "Stop" affordance shown in the input area during streaming,
**Then** the client sends a cancellation signal, the server aborts the orchestrator invocation, and the assistant message finalizes with a `[interrupted]` marker inline — the input re-enables immediately.

**Given** the `done` event arrives,
**When** the stream closes cleanly,
**Then** the caret disappears, the assistant `ChatMessage` is marked finalized, and the input re-enables for the next turn.

**Given** I refresh the page,
**When** the app reloads,
**Then** the prior conversation for the selected project reloads from the session store and renders in order — durable history survives page refresh.

---

### Story 1.9: Virtualized history + markdown rendering + scroll-pause

As Downe, I want long chat histories to render fast with proper markdown, and I want to pause auto-scroll when I scroll up to read past context, So that deep sessions don't degrade UX or fight me when reviewing.

**Acceptance Criteria:**

**Given** a project has 200+ messages,
**When** I open the chat,
**Then** `react-virtuoso` virtualizes the list (NFR12) and the view renders within 500ms with smooth scroll, no visible jank, and consistent row heights for dynamic content.

**Given** an assistant message contains markdown,
**When** it renders,
**Then** `react-markdown` + `remark-gfm` + `rehype-highlight` render headings, lists, tables, blockquotes, inline code, fenced code blocks with syntax highlighting, and GFM task lists — matching UX-DR11 copy-richness expectations.

**Given** a fenced code block is rendered,
**When** I hover it,
**Then** a copy-to-clipboard button appears in the top-right corner of the block; clicking it copies the raw code and briefly shows a "Copied" confirmation.

**Given** the assistant is streaming and I am at the bottom of the chat,
**When** new deltas arrive,
**Then** the view auto-scrolls to follow the stream.

**Given** the assistant is streaming and I scroll up more than 80px from the bottom,
**When** new deltas arrive,
**Then** auto-scroll pauses (UX-DR23), a "New messages ↓" pill appears anchored to the bottom-right, and clicking it or scrolling back to the bottom re-enables auto-follow.

**Given** a long assistant message exceeds the viewport during streaming,
**When** I scroll up mid-stream,
**Then** my scroll position is preserved relative to the content I was reading — the streaming tail does not drag my viewport.

---

### Story 1.10: Visible thinking + tool-call row shell

As Downe, I want to see the orchestrator's thinking tokens and any tool invocations render inline with the assistant's reply, So that the agent's reasoning is observable from the first usable build — even before tools exist in Epic 2.

**Acceptance Criteria:**

**Given** the orchestrator emits `thinking.delta` events,
**When** they arrive,
**Then** a collapsible "Thinking…" block renders above the assistant's final output with dimmed text (per UX-DR10 `ChatMessage` `variant: 'thinking'`), deltas stream into it in real time, and a chevron toggles expand/collapse; the block defaults to expanded during streaming and collapsed when the message finalizes.

**Given** the orchestrator emits `tool_call.start` and `tool_call.end` events,
**When** they arrive,
**Then** a `ToolCallRow` renders inline in the assistant message stream (UX-DR12) showing tool name, pending/running/success/error status icon, elapsed time, and an expand affordance — even though no real tools are registered yet, the row renders correctly against synthetic test events.

**Given** a `ToolCallRow` is expanded,
**When** I click the expand chevron,
**Then** the row reveals `input` (formatted JSON) and `output` (formatted JSON or text) in collapsible panels, with long payloads truncated with a "Show more" control.

**Given** the orchestrator produces no thinking or tool output for a turn,
**When** the assistant message finalizes,
**Then** the `ChatMessage` renders without empty thinking/tool panels — empty state is no state, not a visible stub.

**Given** tests cover the rendering,
**When** I run the web test suite,
**Then** snapshot and interaction tests verify thinking block stream/collapse, ToolCallRow status transitions (start → end with success and with error), and the expand/collapse interactions.

---

### Story 1.11: Cost meter (Claude baseline) + status-bar wiring

As Downe, I want the status bar to show running cost for the current session and project, So that FR43's cost visibility is satisfied from Epic 1 baseline (Tavily/Pinecone/Voyage meters extend in later epics).

**Acceptance Criteria:**

**Given** the orchestrator consumes Claude tokens,
**When** the SDK returns usage metadata per turn,
**Then** the server computes cost in USD using the configured Claude Opus price table (loaded from env or a code constant module), appends a line to `data/cost.jsonl` with `{ timestamp, project_id, session_id, provider: 'anthropic', model, input_tokens, output_tokens, cost_usd }`, and emits a `cost.update` SSE event with `{ session_cost_usd, project_cost_usd_cumulative }`.

**Given** the client receives `cost.update`,
**When** the status bar renders,
**Then** it displays "Session: $X.XX • Project: $Y.YY" right-aligned in the status bar (UX-DR15) with tabular-num formatting, the value increments smoothly, and hovering shows a tooltip breaking down by provider (only Anthropic for now; Tavily/Voyage slots reserved).

**Given** cumulative project cost is computed,
**When** I switch projects,
**Then** the status bar updates immediately to reflect the newly selected project's cumulative total read from `cost.jsonl`.

**Given** the server restarts,
**When** it reloads state,
**Then** cumulative project cost is re-derived from `cost.jsonl` — the log is the source of truth per the architecture's observability model, not an in-memory counter.

**Given** the cost module exists,
**When** I inspect `apps/server/src/domain/cost.ts`,
**Then** pricing constants are centralized (one place to update when Anthropic changes prices), the module exports a pure `computeCost(usage, provider, model)` function, and the unit tests verify math against sample usage records.

---

### Story 1.12: Error toast framework + degraded-mode banner pattern

As Downe, I want consistent error toasts and a degraded-mode banner pattern ready to go, So that every later epic's failure surfaces (API outage, Pinecone down, cost spike) use the same channel and I'm not silently confused.

**Acceptance Criteria:**

**Given** the shadcn/ui Toast primitive is installed,
**When** a component calls `toast.error({ code, message, retryable })` or `toast.success({ message })`,
**Then** the toast renders bottom-right (UX-DR26) with matching variant styling (error = red accent, success = green accent, warning = amber), auto-dismisses after 5 seconds for success and 8 seconds for error, stacks up to 3 simultaneously, and is dismissible by clicking an `×` affordance.

**Given** a toast has `retryable: true`,
**When** it renders,
**Then** an inline "Retry" button is shown; clicking it re-invokes the last action's retry handler (wired per call site) and dismisses the toast.

**Given** the orchestrator emits an SSE `error` event,
**When** the client receives it,
**Then** the toast framework receives the `AppError` envelope and renders an error toast with the mapped human-readable message for the `ErrorCode` — unknown codes fall back to a generic "Something went wrong" with `code` shown in a small monospace tag.

**Given** the architecture's degraded-mode pattern is wired,
**When** any dependency (Pinecone, Tavily, Anthropic, Voyage) is marked unavailable by the server health check,
**Then** a `DegradedModeBanner` component renders at the top of the chat column (above the chat list, below the header) with the affected capability named ("Research offline", "Memory writes paused", etc.) and a "Retry connection" action — even though Epic 1 has no Pinecone/Tavily/Voyage writes yet, the banner pattern is exercised via a synthetic health-check endpoint to prove the wiring.

**Given** the degraded banner is showing,
**When** the underlying service recovers (subsequent health check returns healthy),
**Then** the banner auto-dismisses with a brief "Connection restored" success toast.

**Given** tests cover the framework,
**When** I run the web test suite,
**Then** unit tests verify toast stacking, dismissal, retry invocation, variant styling, and banner show/hide on health-state transitions.

---

## Epic 2: Web Research & Evidence-Backed Intelligence

**Goal:** Transform the chat from a conversationalist into a researcher — sourced Tavily searches, inline citations, confidence tagging, durable project-scoped memory, RAG-backed follow-ups with staleness hints, and intelligence briefs. After Epic 2 the tool is "Perplexity with project memory."

### Story 2.1: Voyage + Pinecone client foundation

As Downe, I want typed Voyage embedding and Pinecone data-plane clients with a confirmed-write helper and shared record-type schema, So that every Epic 2+ writer and reader talks to memory through one hardened, test-doubled layer.

**Acceptance Criteria:**

**Given** `@bp/shared` exists,
**When** I add `src/memory.ts`,
**Then** it defines a `RecordType` discriminated union covering `research_finding`, `evidence`, `intelligence_brief`, `decision_log`, and `session_checkpoint` (later epics wire decision_log and session_checkpoint, but the union is declared here so readers narrow exhaustively), with each record's metadata shape (wire-snake_case) — `source_url`, `title`, `retrieved_at`, `confidence`, `created_at`, `last_verified_at`, `superseded_by`, `topic`, `project_id`, `record_type` — typed and documented.

**Given** `apps/server/src/memory/voyage.ts` exists,
**When** I call `embed(text: string)` or `embedBatch(texts: string[])`,
**Then** it POSTs to the Voyage `voyage-3-large` endpoint, returns `number[]` vectors of length 1024, retries transient 5xx with exponential backoff up to 3 attempts matching the Claude policy, fails fast on auth errors, and writes Voyage token-usage rows to `data/cost.jsonl` via the cost module.

**Given** `apps/server/src/memory/pinecone.ts` exists,
**When** I call `upsert(namespace, records)`, `query(namespace, vector, options)`, `fetch(namespace, ids)`, or `deleteMany(namespace, ids)`,
**Then** each helper wraps the Pinecone SDK, targets the `business-planner-intelligence` index, narrows metadata via the shared `RecordType` types on query results, and returns typed results rather than SDK opaques.

**Given** FR43 requires Pinecone operation cost visibility,
**When** any of the four Pinecone helpers above completes (success or failure),
**Then** a cost row is appended to `data/cost.jsonl` with `{ timestamp, project_id, session_id, provider: 'pinecone', operation: 'upsert' | 'query' | 'fetch' | 'delete', namespace, record_count, cost_usd }` using pricing constants centralized in the cost module (Pinecone Serverless per-operation pricing — read units and write units priced separately per the published rate card), and a `cost.update` SSE event is emitted when the emit is in a streaming turn context so the status-bar meter and its per-provider breakdown tooltip reflect Pinecone ops alongside Anthropic / Tavily / Voyage without manual refresh.

**Given** the status-bar cost meter tooltip from Story 1.11 already surfaces per-provider rows,
**When** Pinecone operations accrue,
**Then** a "Pinecone: $Z.ZZ" row appears in the tooltip breakdown, ordered by cumulative cost descending alongside the other providers, shown only when non-zero — visually identical to the Tavily and Voyage rows so FR43's "approximate API cost visibility" holds with no provider missing.

**Given** the confirmed-write discipline (NFR6) must hold,
**When** any writer calls `confirmedWrite(namespace, record)`,
**Then** the helper upserts, then issues a `fetch` by id to verify the record is retrievable, and only returns success once the fetch succeeds — failures throw `AppError` with `code: 'pinecone_write_unconfirmed'` and `retryable: true`.

**Given** the clients are in place,
**When** I run the server test suite,
**Then** unit tests cover: Voyage retry/backoff behavior, Voyage auth-error short-circuit, Pinecone upsert/query/fetch result typing, confirmed-write success path, confirmed-write failure on fetch-not-found, and cost-row emission for Voyage — all with mocked HTTP clients (no live API calls in unit tests).

---

### Story 2.2: `research_finding` + `evidence` write path

As Downe, I want domain writers that embed and persist research findings and supporting evidence with locked metadata, So that later stories can register the research tool without re-solving the write contract.

**Acceptance Criteria:**

**Given** the foundation from Story 2.1 exists,
**When** I inspect `apps/server/src/memory/writers/researchFinding.ts` and `apps/server/src/memory/writers/evidence.ts`,
**Then** each exports a single writer function that accepts a typed input (claim text + source metadata for `research_finding`; quote excerpt + parent-finding id + source metadata for `evidence`), embeds via Voyage, composes the Pinecone record with a server-generated UUID v4 id, `record_type`, `project_id`, `created_at` (ISO-8601 UTC), `last_verified_at = created_at`, `superseded_by = null`, and calls `confirmedWrite`.

**Given** a caller writes a `research_finding`,
**When** the writer composes the record,
**Then** the embedding source is the claim text plus its top-3 evidence excerpts concatenated (to keep claim and its support semantically co-located), and the metadata includes `topic` (caller-provided tag used later by sidebar grouping) plus `confidence` from the orchestrator's self-assessment.

**Given** a caller writes an `evidence` record,
**When** the writer composes the record,
**Then** the embedding source is the quote excerpt, the metadata links the parent finding via `parent_finding_id`, and source URL, publication title, and retrieved date are required — the writer rejects writes missing any of these fields at the type level.

**Given** a write succeeds,
**When** I call the writer a second time with the same input,
**Then** a new record is created with a new id — the writer never silently deduplicates; deduplication is a later concern (either caller-side or a separate compaction tool).

**Given** tests cover the writers,
**When** I run `pnpm --filter @bp/server test`,
**Then** unit tests verify: embedding source composition for both record types, metadata field presence, `confirmedWrite` invocation, id generation, and rejection of malformed inputs.

---

### Story 2.3: Tavily client + research tool + cost extension

As Downe, I want a Tavily web-search client exposed to the orchestrator as a `web_search` tool with per-call cost accounting, So that the agent can retrieve sourced evidence from the live web within a chat turn.

**Acceptance Criteria:**

**Given** `apps/server/src/research/tavily.ts` exists,
**When** I call `search({ query, max_results, search_depth })`,
**Then** it POSTs to the Tavily API with the configured key, parses the response into typed `TavilyResult[]` (each with `url`, `title`, `content`, `score`, `published_date?`), performs a single retry on transient 5xx or timeout per NFR2, and throws `AppError` with `code: 'tavily_failure'` and `retryable: true` after the retry fails.

**Given** the orchestrator from Epic 1 exists,
**When** I inspect `apps/server/src/agents/tools/webSearch.ts`,
**Then** a tool is defined in the Claude Agent SDK tool interface with name `web_search`, a description prompting the model to use it for factual claims, and an input schema accepting `query: string` and optional `max_results: number` (default 5) and `search_depth: "basic" | "advanced"` (default `basic`) — the tool invokes `tavily.search` and returns a structured result array to the model.

**Given** the tool is registered,
**When** the orchestrator invokes `web_search` during a turn,
**Then** a `tool_call.start` SSE event fires with `tool: 'web_search'` and the serialized input, followed by a `tool_call.end` event with the result preview and elapsed milliseconds — the Epic 1 `ToolCallRow` shell now renders real data.

**Given** the PreToolUse/PostToolUse hook wiring,
**When** `web_search` completes,
**Then** a cost row is appended to `data/cost.jsonl` with `{ timestamp, project_id, session_id, provider: 'tavily', operation: 'search', search_depth, request_count: 1, cost_usd }` using a price constant from the cost module (Tavily per-request pricing), and a `cost.update` SSE event is emitted with the updated session and project totals.

**Given** the status bar cost meter from Story 1.11,
**When** I hover it after a Tavily call,
**Then** the tooltip now shows a per-provider breakdown: "Anthropic: $X.XX • Tavily: $Y.YY" — each appearing only when non-zero, sorted descending, with a project-total line at the bottom.

**Given** Tavily fails after retry,
**When** the tool returns,
**Then** the tool's output is a typed error result `{ ok: false, code: 'tavily_failure' }` that the orchestrator surfaces as a `tool_call.end` event with error status (red icon in `ToolCallRow`) — the turn continues with the model responding from its own knowledge, flagged via a natural-language degraded-mode note (Story 2.8 wires the banner).

---

### Story 2.4: Inline citations + `CitationTag` UI + source popover

As Downe, I want claims in the assistant's reply to carry numbered `[N]` citation markers that render as clickable chips linked to the source details, So that every factual claim is traceable to its evidence without leaving the chat.

**Acceptance Criteria:**

**Given** the `web_search` tool returns results to the orchestrator,
**When** the orchestrator produces its assistant reply,
**Then** the system prompt instructs the model to emit inline `[N]` markers after claims derived from tool output, and to emit a structured `citations` block at message end (machine-readable JSON in a dedicated fenced section parsed server-side) mapping each `N` to `{ source_url, title, retrieved_at, quote }` — the model is instructed not to fabricate citations.

**Given** the orchestrator finalizes an assistant turn,
**When** the citations block is parsed,
**Then** the server writes one `research_finding` per distinct claim and one `evidence` record per distinct quote via the Story 2.2 writers (confirmed-write discipline enforced), attaches the resulting record ids back to each citation, and emits a `message.citations` SSE event with the typed citation array keyed to the message id.

**Given** the client receives `message.citations`,
**When** the assistant `ChatMessage` re-renders,
**Then** every `[N]` substring in the rendered markdown is replaced by a `CitationTag` React component — cyan (#22d3ee foreground on #164e63 background per UX-DR13), numbered, tabular-num, with a subtle hover lift.

**Given** I click a `CitationTag`,
**When** the popover opens,
**Then** it shows: source title (clickable, opens in new tab), source URL (truncated middle with copy button), retrieved date in human format, quoted excerpt (italicized, max 4 lines before truncation with "Show more"), and confidence badge (Story 2.5 provides the component — here it renders "—" if absent).

**Given** the popover is open,
**When** I press `Esc` or click outside,
**Then** the popover dismisses; focus returns to the chip per UX-DR21 keyboard accessibility.

**Given** the citations block is malformed or missing,
**When** the server parses,
**Then** inline `[N]` markers render as plain text (no chip), a `warn`-level log entry is emitted with the message id, and no findings or evidence are written — the conversation continues without corruption.

**Given** tests cover the flow,
**When** I run both test suites,
**Then** server tests verify citation parsing, writer invocation, and SSE emission; web tests verify `CitationTag` rendering, popover open/close, keyboard dismiss, and graceful fallback on missing citation data.

---

### Story 2.5: `ConfidenceBadge` + inline confidence tagging

As Downe, I want assistant claims to surface a visible confidence level so I can tell at a glance which statements are well-supported and which are tentative, Satisfying FR9 and aligning the agent's self-assessment with the adversarial framework's evidence-grading stance.

**Acceptance Criteria:**

**Given** the orchestrator produces a reply with citations,
**When** it emits the structured citations block (from Story 2.4),
**Then** each citation entry includes a `confidence: "high" | "medium" | "low"` field the model is instructed to assign per claim based on source quality, source count, and recency — the citations parser writes this onto the `research_finding` record's metadata and includes it in the `message.citations` SSE payload.

**Given** `apps/web/src/components/ConfidenceBadge.tsx` exists,
**When** it renders with `level: "high" | "medium" | "low"`,
**Then** it shows a compact pill with green/yellow/red semantic colors per UX-DR14 — accessible contrast, icon + short label ("High", "Med", "Low"), tabular-num sizing, and an `aria-label` like "Confidence: high — well-sourced" for screen readers.

**Given** a `CitationTag` popover is open,
**When** the citation has a confidence level,
**Then** the popover displays the `ConfidenceBadge` near the title with a short tooltip explaining the basis ("3 corroborating sources, retrieved within 30 days" style) — when absent, the badge slot shows "—".

**Given** the assistant reply contains claims with no citations,
**When** the model assigns a confidence level to such a claim (its own synthesis or reasoning),
**Then** the orchestrator may emit an inline confidence marker `{conf: low}` pattern parsed server-side into a `message.inline_confidence` payload, and the client renders a `ConfidenceBadge` inline next to the relevant span — this is used sparingly; the primary surface is citation-popover confidence.

**Given** tests cover the badge,
**When** I run the web test suite,
**Then** snapshot tests verify all three levels render correctly, accessibility tests verify aria-labels, and integration tests verify the badge appears inside citation popovers when confidence is present.

---

### Story 2.6: RAG retrieval on follow-ups + staleness hints

As Downe, I want the agent to semantically retrieve prior project findings before responding to a follow-up question, and to flag when retrieved intelligence is stale, So that the agent compounds knowledge across turns instead of re-researching — and is honest when recalled information may be outdated.

**Acceptance Criteria:**

**Given** the orchestrator is preparing a turn,
**When** the user message is non-trivial (more than a greeting/meta message),
**Then** a pre-turn retrieval step embeds the user message via Voyage, queries the project's Pinecone namespace with `top_k: 8` filtered to `record_type IN ('research_finding', 'evidence', 'intelligence_brief')`, and injects the retrieved records as a structured "Prior intelligence in this project" section into the orchestrator's system context for that turn.

**Given** retrieved records are injected,
**When** the model composes its reply,
**Then** the system prompt instructs it to prefer citing prior intelligence over re-searching the web when relevant, to cite prior records using the same `[N]` citation format (the citations block distinguishes `source: "project_memory" | "web"`), and the sidebar Intelligence tab's "recent recall" indicator highlights which records were used this turn.

**Given** a retrieved record's `last_verified_at` is older than 90 days,
**When** the record is injected,
**Then** a `stale_since_days` field is computed and included in the context; the model is instructed to surface a natural-language freshness hint per UX-DR28 ("This finding is from over 90 days ago — worth reverifying?") inline with the cited claim, and the `CitationTag` popover displays an amber "Stale" pill next to the date.

**Given** the model determines during a turn that a prior finding is superseded by new research,
**When** it emits a `{supersedes: [finding_id_1, finding_id_2], with: new_finding_id}` directive in the citations block,
**Then** the server updates the superseded records' `superseded_by` metadata via a Pinecone upsert (preserving id/vector, updating metadata), and logs a `finding.superseded` Pino entry — superseded findings are excluded from future retrieval.

**Given** retrieval returns no relevant records (all scores below a configured threshold, default 0.5),
**When** the context is assembled,
**Then** the "Prior intelligence" section is omitted rather than injecting irrelevant matches — avoiding noise-poisoning of the model's context.

**Given** a Pinecone read fails,
**When** the retrieval step runs,
**Then** the failure is caught, retrieval is skipped for this turn, a `memory_degraded` banner is triggered via the health signal (wired in Story 2.8), and the turn proceeds without prior-intelligence injection — the user sees an agent natural-language note that memory recall is offline.

**Given** tests cover retrieval,
**When** I run the server test suite,
**Then** tests verify: embedding of the user message, Pinecone query with the right filter, threshold-based filtering, stale-record flagging, context assembly with and without results, `superseded_by` write path, and graceful fallback on Pinecone read failure.

---

### Story 2.7: Intelligence sidebar tab + brief generation

As Downe, I want the Intelligence sidebar tab to show accumulated findings for the current project and let me request a structured intelligence brief, Satisfying FR25 and exposing Pinecone-backed memory out of the chat transcript and into a scannable surface.

**Acceptance Criteria:**

**Given** the sidebar Intelligence tab from Story 1.4 currently shows an empty state,
**When** the current project has at least one `research_finding` in its namespace,
**Then** the tab replaces the empty state with a list view grouped by `topic` (from record metadata), each group collapsible, each finding row showing: claim text (truncated to 2 lines), confidence badge, source count, retrieved-date relative format, and a stale pill if `last_verified_at > 90d`.

**Given** findings exist,
**When** I open the tab,
**Then** the server exposes `GET /api/projects/:project_id/intelligence?topic=&confidence=&include_stale=` returning `{ data: { topics: Topic[], total_findings, total_evidence, last_updated } }`; the client uses TanStack Query with `staleTime: 30_000` and invalidates on `message.citations` SSE events to stay live as new findings are written.

**Given** I click a finding row,
**When** the detail pane opens,
**Then** it shows the full claim, all linked `evidence` records with their quotes and source chips, the confidence badge with basis, staleness info, and a "Mark verified today" action that updates `last_verified_at` via `PATCH /api/findings/:id/verify` (Pinecone metadata upsert).

**Given** I click a "Generate intelligence brief" button in the Intelligence tab header (or a per-topic brief button per group),
**When** the action runs,
**Then** the orchestrator is invoked with a dedicated `intelligence_brief` system prompt that summarizes findings for the selected scope (whole project or one topic) into a structured brief — sections: Key claims, Strongest evidence, Confidence summary, Open questions, Recommended next research — with inline citations to the underlying findings.

**Given** a brief finalizes,
**When** the server persists it,
**Then** a new `intelligence_brief` Pinecone record is written via the writer pattern from Story 2.2 with `topic`, `scope: 'project' | topic-name, `generated_at`, and a `source_finding_ids`metadata array; the embedding source is the brief body; the brief is also persisted to the session transcript so it renders inline as a`ChatMessage` variant (reusing existing markdown + citation rendering) and appears in the Intelligence tab's "Briefs" sub-section at the top.

**Given** briefs accumulate,
**When** the sidebar renders,
**Then** older briefs are collapsible and a "Compare to latest brief" affordance shows a diff-style view of claim changes — out of scope if it grows too large; minimum viable is a chronological list with timestamps and scope labels.

**Given** tests cover the tab,
**When** I run the test suites,
**Then** server tests verify the intelligence endpoint's filters and response shape, brief generation persists correctly, and `last_verified_at` updates write back; web tests verify list rendering, grouping, detail pane, brief trigger, and TanStack Query invalidation on SSE citation events.

---

### Story 2.8: Research-degraded + memory-degraded modes

As Downe, I want Tavily and Pinecone failures to surface honestly through the degraded-mode banner and toast framework from Epic 1, So that the agent never silently fails and I always know when memory or research is offline.

**Acceptance Criteria:**

**Given** the Epic 1 degraded-mode banner pattern exists,
**When** `web_search` fails after its single retry (Story 2.3),
**Then** the server emits a `dependency.unhealthy` SSE event with `{ dependency: 'tavily', since: timestamp }`, the client renders the `DegradedModeBanner` with "Research offline — the agent is responding from its own knowledge only", an error toast fires with `code: 'tavily_failure'` and a Retry action, and the current turn completes without blocking.

**Given** the banner is showing for Tavily,
**When** a subsequent `web_search` call succeeds,
**Then** a `dependency.healthy` event dismisses the banner, a success toast fires ("Research restored"), and the `/healthz` endpoint reflects the recovery for the server-level health signal.

**Given** a Pinecone write fails (confirmed-write not confirmed after retry),
**When** the failure surfaces,
**Then** the server emits `dependency.unhealthy` with `dependency: 'pinecone_write'`, the banner shows "Memory writes paused — new findings are not persisted", an error toast offers a Retry action that re-invokes the failed writer, and the assistant reply still renders inline (user doesn't lose the turn) but the Intelligence tab shows a non-intrusive "pending" indicator for any unpersisted findings.

**Given** a Pinecone read (retrieval) fails,
**When** the turn runs,
**Then** the banner shows "Memory recall offline — the agent is responding from this session only", retrieval is skipped gracefully per Story 2.6, a session-local LRU cache of the last 50 retrieved records is consulted as a best-effort fallback, and when the cache hits the popover notes "recalled from session cache".

**Given** multiple dependencies fail simultaneously,
**When** banners would stack,
**Then** the banner component renders a single consolidated banner listing all unhealthy dependencies (comma-separated) rather than stacking vertically — keeps the layout stable.

**Given** a failure persists,
**When** the user submits another turn,
**Then** the banner remains visible without re-toasting on every turn (debounced to once per 60 seconds) — the chat stays usable even in prolonged outages.

**Given** tests cover the degraded flows,
**When** I run both suites,
**Then** tests verify: Tavily single-retry then degraded path, Pinecone write retry + banner, Pinecone read skip + cache fallback, consolidated banner when multiple deps fail, toast debounce, and automatic recovery on dependency restoration.

---

## Epic 3: Adversarial Skeptic & Decision Accountability

**Goal:** Introduce a selectively-speaking skeptic sub-agent that challenges claims with evidence-based pushback, a conversational steelman mode that actively seeks evidence for the user's opposing view, and an immutable decision log that preserves both sides of every resolved disagreement — including a marker when the user decides against the stronger evidence. After Epic 3 the tool enforces the critical-thinking discipline the product brief centers on.

### Story 3.1: Skeptic sub-agent + bundle-pass contract

As Downe, I want an isolated skeptic sub-agent that the orchestrator invokes with an explicit claims-plus-evidence bundle, So that the skeptic sees exactly what the orchestrator chose to surface — never ambient access to the whole session — and every skeptic turn is a structured function call rather than a tone adjustment.

**Acceptance Criteria:**

**Given** `@bp/shared` currently defines the `AgentEvent` union,
**When** I add skeptic event types,
**Then** the union gains `subagent.start`, `subagent.end`, `skeptic.challenge`, and `skeptic.silent` variants — each with typed `data` shapes (`sub_agent_name`, `bundle_id`, `challenges[]` with claim reference + evidence links + severity, or the silent reason) — and every existing `switch (event.type)` site is updated to handle them exhaustively.

**Given** `apps/server/src/agents/skeptic/bundle.ts` exists,
**When** I inspect the `SkepticBundle` type,
**Then** it is a frozen schema v1 with fields: `bundle_id` (UUID v4), `project_id`, `session_id`, `stakes` (`"high" | "medium" | "low"`), `claims` (array of `{ claim_id, text, confidence, citation_ids[] }`), `evidence` (array of `{ evidence_id, quote, source_url, confidence, retrieved_at }`), `context_summary` (short prose summarizing the current thread — never the raw transcript), and `schema_version: 1` — later epics extend by adding optional fields, never by mutating v1.

**Given** `apps/server/src/agents/skeptic/subagent.ts` exists,
**When** the orchestrator completes its draft reply before surfacing it,
**Then** it composes a `SkepticBundle` from the turn's claims, citations, and evidence (Epic 2 writers supply the sources), invokes the Claude Agent SDK sub-agent with `claude-opus-4-7`, a system prompt loaded from `apps/server/src/agents/skeptic/prompt.md`, zero inherited context, and the bundle as the user message.

**Given** the skeptic sub-agent runs,
**When** it returns a response,
**Then** the response is parsed as structured output: either a `challenges[]` array (each challenge referencing a claim_id with severity, natural-language critique, and optional evidence_ids it draws on) or an explicit `silent` verdict with a brief reason — malformed output is retried once then downgraded to `silent: 'parse_failure'` with a `warn` log entry.

**Given** the skeptic returns challenges or silence,
**When** the server relays the result,
**Then** `subagent.start` and `subagent.end` SSE events bracket the call, a `skeptic.challenge` event fires per non-silent verdict (with full challenge payload), and a `skeptic.silent` event fires for the silent case — the orchestrator decides whether to surface each challenge inline (Story 3.2 renders) before the assistant's reply is finalized.

**Given** the skeptic's sub-agent context is isolated,
**When** I audit the call,
**Then** no part of the main conversation history, prior tool outputs, or prior assistant messages leak into the skeptic invocation except what the bundle explicitly contains — enforced by constructing a fresh sub-agent instance per call rather than sharing the orchestrator's conversation state.

**Given** tests cover the plumbing,
**When** I run the server test suite,
**Then** tests verify: bundle composition from a turn fixture, skeptic invocation with isolated context, structured-output parsing (valid, invalid + retry, silent), SSE event ordering, and exhaustive `AgentEvent` narrowing at every existing consumer.

---

### Story 3.2: Skeptic selectivity rules + `skeptic` `ChatMessage` variant

As Downe, I want the skeptic to speak only when it has something rigorous to say and to render inline in the chat with a distinct amber tint, So that challenges earn attention without the skeptic devolving into obstructionist noise.

**Acceptance Criteria:**

**Given** `apps/server/src/agents/skeptic/prompt.md` exists,
**When** I read it,
**Then** it encodes selectivity rules matching the product brief and UX-DR23: SPEAK on unsupported claims (no citations or low-confidence citations), assumption leaps (logical gap between claim and cited evidence), contradictions with prior project intelligence (evidence_ids include superseded or conflicting findings), and high-stakes + low-confidence situations (`stakes: "high"` AND average claim confidence `< "medium"`); SILENT on well-sourced output, user-asked questions, and procedural conversation — with examples of each case.

**Given** the skeptic's pushback intensity should scale,
**When** the bundle arrives with `stakes: "high"` and high-confidence evidence,
**Then** the prompt instructs the skeptic to produce maximum pushback (challenge each claim individually if warranted); with `stakes: "low"` and moderate evidence, the skeptic defaults toward silence unless a clear contradiction exists — matching the product brief's "pushback calibration" requirement.

**Given** `apps/web/src/components/ChatMessage.tsx` exists,
**When** I extend it with a `skeptic` variant,
**Then** the variant renders with a background tint of `#78350f18` (amber 18% alpha per UX-DR12), a left border accent in a stronger amber, a small "Skeptic" label chip in the top-left, and the challenge text with inline references to the challenged claim (e.g., "regarding claim [2]…") — references are clickable and scroll to the referenced citation chip in the preceding assistant message.

**Given** a `skeptic.challenge` SSE event arrives,
**When** the client dispatches it,
**Then** the chat column inserts a `ChatMessage` with `variant: 'skeptic'` between the assistant's reply and the next user message, each challenge rendering as its own message block if multiple — ordered by severity descending — with full markdown support including citation chips to evidence the skeptic references.

**Given** a `skeptic.silent` event arrives,
**When** the client dispatches it,
**Then** no visible chat message is inserted (silence is the default signal), but a muted dot indicator briefly pulses in the `SkepticPanel` badge (Story 3.3) so I can tell the skeptic ran and chose not to speak — accountability for the sub-agent's presence without visual pollution.

**Given** the skeptic surfaces a challenge inline,
**When** I read it,
**Then** the tone is rigorous, not combative — the prompt explicitly instructs against combative language, personal framing ("you're wrong"), or obstructionism, and instead models challenges as evidence-anchored observations ("claim [2] asserts X but the cited source only supports Y, and finding [5] in project memory directly contradicts X").

**Given** tests cover selectivity,
**When** I run the server test suite with fixture bundles,
**Then** tests verify: SPEAK cases produce challenges, SILENT cases return silent verdicts, pushback intensity scales with stakes, challenge output parses into the structured schema, and the web snapshot tests verify the skeptic variant renders correctly in isolation and interleaved with assistant/user messages.

---

### Story 3.3: `SkepticPanel` sidebar tab + challenge log

As Downe, I want a chronological log of every skeptic intervention in the current session available in a dedicated sidebar tab, So that I can scan all challenges at a glance, see how often the skeptic stayed silent, and jump to any inline challenge.

**Acceptance Criteria:**

**Given** Epic 1's Story 1.4 already scaffolded the "Skeptic" tab slot (second position, between Intelligence and Wiki, per UX-DR11) with a placeholder empty-state,
**When** this story activates the tab,
**Then** the tab's content is replaced by the `SkepticPanel` component, a small numeric badge renders on the tab label showing the count of un-viewed challenges this session (resets to zero when I open the tab), and until any `skeptic.*` event fires in the session the tab's panel continues to render the empty-state ("No challenges yet this session").

**Given** `skeptic.challenge` or `skeptic.silent` events fire during a session,
**When** the tab is open,
**Then** the panel renders a reverse-chronological list where each entry shows a timestamp, a severity icon (red/amber/blue for high/medium/low) or a muted dot for silent, a one-line summary (first line of challenge text or "skeptic silent"), and a click affordance that scrolls the chat column to the corresponding inline `ChatMessage` and briefly highlights it.

**Given** an entry is expanded in the panel,
**When** I click it,
**Then** the full challenge text renders in a detail pane below the entry (or as a popover) including any evidence chips the skeptic cited, with the same markdown + citation chip rendering as the inline variant — silent entries show the silent reason ("well-sourced output" / "procedural" / "parse_failure" / etc.).

**Given** the session spans multiple turns,
**When** skeptic entries accumulate,
**Then** the panel groups them by turn using light dividers labeled with the user's message preview (first 60 chars), so I can see which turns triggered challenges and which ran silent.

**Given** I switch projects or refresh the page,
**When** the tab re-renders,
**Then** the skeptic history for the current session persists from the server's session store (skeptic events are logged alongside chat messages per-session), and the list renders from that store via `GET /api/sessions/:session_id/skeptic` — not re-derived from Pinecone.

**Given** tests cover the panel,
**When** I run the web test suite,
**Then** tests verify: empty-state rendering, chronological ordering, challenge-to-chat scroll-and-highlight interaction, silent-entry dot rendering, turn grouping, badge counter increment and reset, and server endpoint shape.

---

### Story 3.4: Disagreement detection → steelman trigger

As Downe, I want the orchestrator to recognize when I push back against a skeptic challenge or an assistant claim and route the next turn into steelman mode automatically, So that I never have to remember a keyword or press a button to invoke the protocol (FR15).

**Acceptance Criteria:**

**Given** `apps/server/src/agents/orchestrator.ts` handles an incoming user message,
**When** the prior turn in the session contains a `skeptic.challenge` or a claim the user might be disputing,
**Then** a pre-turn intent classification step invokes Claude (short, cheap call with a dedicated classifier prompt) returning `{ intent: "agreement" | "disagreement" | "clarification" | "neutral", target_claim_id?, confidence }`, and the result is attached to the turn state.

**Given** the classifier returns `intent: "disagreement"` with `confidence >= 0.7`,
**When** the turn state is assembled,
**Then** a `user.disagreement` internal event is emitted, the orchestrator sets `mode: 'steelman'` for this turn, the `target_claim_id` is resolved from the preceding assistant or skeptic output (via citation id or skeptic challenge reference), and Story 3.5's steelman branch runs.

**Given** the classifier returns `clarification` or low-confidence `disagreement`,
**When** the turn runs,
**Then** the orchestrator does NOT enter steelman mode but emits a one-line inline clarifying question first ("Are you pushing back on claim [2]'s conclusion, or asking me to explain it differently?") to disambiguate before committing to a mode — cost-optimized because the classifier is a short call and the clarifying question avoids unnecessary steelman work.

**Given** there is no prior skeptic challenge or disputed claim in the session,
**When** the user's message contains pushback-shaped phrasing ("I don't think that's right", "actually, no"),
**Then** the classifier can still trigger `disagreement` but the orchestrator resolves the target as the most recent assistant claim — if none, it falls back to the clarifying-question path rather than guessing.

**Given** tests cover the classifier,
**When** I run the server test suite with fixture message histories,
**Then** tests verify: clear-disagree messages trigger steelman mode with target resolution; clear-agree messages do not; ambiguous messages trigger the clarifying-question path; classifier retry-once-on-parse-failure behavior; and classifier cost rows are written to `cost.jsonl` with `provider: 'anthropic'` and `operation: 'classify_disagreement'` for observability.

**Given** the classifier itself fails (API error after retry),
**When** the turn runs,
**Then** the orchestrator falls back to NOT entering steelman mode (safe default — no work done on unclear signal), logs the failure at `warn`, and proceeds with the normal response path so the user never sees a failed turn.

**Given** the classifier is called pre-turn and stacks onto NFR12's 3-second first-token target,
**When** the classifier round-trip runs,
**Then** it enforces a p95 latency budget of ≤1000ms measured server-side (Claude call + parse); if the call exceeds `CLASSIFIER_TIMEOUT_MS` (default 1500ms, configurable via env), the orchestrator aborts the classifier, assumes `intent: "neutral"` (equivalent to the classifier-failure fallback above — no steelman entry), logs a `classifier_timeout` entry at `warn` level with the elapsed ms, and continues the turn without blocking — NFR12's first-token target is protected by treating the classifier as best-effort enrichment rather than a gating call.

**Given** the classifier latency budget must be verifiable,
**When** the server test suite runs,
**Then** an integration-style test exercises the classifier under a simulated slow Claude response (injected delay >`CLASSIFIER_TIMEOUT_MS`), asserts the timeout fires, asserts `intent: "neutral"` is the assumed result, asserts the main orchestrator response begins streaming within NFR12's 3-second window from user-message receipt, and asserts the `classifier_timeout` log entry is emitted.

---

### Story 3.5: Steelman mode: evidence search for user's view (FR15, FR16)

As Downe, I want the orchestrator in steelman mode to actively search for the strongest evidence supporting my opposing view and present both sides with citations, So that my disagreement becomes a research prompt rather than a dead-end — and I can decide from evidence rather than vibes.

**Acceptance Criteria:**

**Given** Story 3.4 triggered `mode: 'steelman'` with a resolved `target_claim_id`,
**When** the orchestrator runs the turn,
**Then** a steelman system prompt is loaded from `apps/server/src/agents/prompts/steelman.md` instructing the model to formulate `web_search` queries explicitly seeking evidence FOR the user's position (the opposite of the target claim), execute up to 3 searches with adversarial query framing, and collect findings via the existing Epic 2 research pipeline — citations flow through the same `research_finding`/`evidence` writers.

**Given** steelman research completes,
**When** the assistant composes the reply,
**Then** the reply is structured with three clearly-delimited sections rendered via the `steelman` `ChatMessage` variant: (1) "Evidence for your position" with inline citations and confidence badges, (2) "Evidence for the original claim" summarizing the citations already in project memory for the target claim, (3) "Where the evidence lands" — a neutral assessment of which side currently has stronger support, with confidence.

**Given** `apps/web/src/components/ChatMessage.tsx` is extended with a `steelman` variant,
**When** the reply renders,
**Then** the variant shows a two-column layout on wide viewports (your-side on left, original-side on right, assessment spanning below) and stacks vertically on narrow ones, with a "Steelman" label chip in the top-left and a subtle indigo accent — visually distinct from both `assistant` and `skeptic` variants so I can tell at a glance the agent is in this mode.

**Given** steelman research returns no supporting evidence for the user's position,
**When** the assessment section runs,
**Then** the agent states this honestly ("I searched for X, Y, and Z framings — none of the sources I found support your position; the strongest contrary finding is [N]") and offers alternate framings the user might mean — the product brief's intelligence-preservation rule applies: the research findings (including the null result) are preserved in project memory regardless of what the user decides next.

**Given** steelman mode completes,
**When** the turn finalizes,
**Then** the `message.citations` SSE payload marks each citation's `source_side: "user_position" | "original_claim"` so the `CitationTag` popover can render a small side indicator, and the orchestrator transitions out of steelman mode (next turn is normal unless another disagreement is detected).

**Given** steelman mode requires web_search but Tavily is in degraded mode (Story 2.8 banner active),
**When** the turn runs,
**Then** the orchestrator emits an inline note ("Research is offline — I can present both sides from project memory only") and steelmans using only prior intelligence, with the assessment flagging reduced confidence from lack of fresh research.

**Given** tests cover steelman flow,
**When** I run both suites,
**Then** tests verify: steelman prompt loads the right template, web_search queries are framed adversarially (input includes opposition framing keywords), both-sides structure renders, `source_side` metadata propagates through the citation pipeline, null-evidence case renders honestly, and degraded-mode fallback works.

---

### Story 3.6: Decision protocol + immutable `decision_log` write path (FR17, FR18, FR19, NFR8)

As Downe, I want my final decision after a steelman presentation captured in an immutable Pinecone record with both sides' evidence preserved, including a marker when I choose the weaker-evidence side, So that past decisions are an audit trail I can trust rather than rewritable prose (NFR8).

**Acceptance Criteria:**

**Given** a steelman turn has concluded and both sides are on the table,
**When** my next message contains decision-shaped phrasing ("let's go with X", "I'm deciding to Y", "sticking with the original"),
**Then** the orchestrator's intent classifier (extending Story 3.4's classifier) returns `intent: "decision"` with the chosen side and rationale (if stated), and the orchestrator enters decision-capture mode — if the phrasing is ambiguous it asks a confirming question ("Confirming: you're deciding [X] over [Y] — want me to log this?") rather than guessing.

**Given** `apps/server/src/memory/writers/decisionLog.ts` exists,
**When** I inspect it,
**Then** it is the SOLE writer for `record_type: 'decision_log'` — no other module in the codebase imports the Pinecone upsert with this record type (enforced by a module-boundary pattern and verified by a test that greps for violations), the exported function accepts a `DecisionInput` (chosen_side, rejected_side, rationale, project_id, session_id, target_claim_id, user_position_finding_ids[], original_claim_finding_ids[], stakes), and it composes a record with `created_at` (ISO-8601 UTC), server-generated UUID v4 id, `immutable: true` metadata tag, and `against_evidence: boolean`.

**Given** the `against_evidence` marker must be accurate,
**When** the writer computes it,
**Then** a helper function compares the average confidence + citation count on each side's findings (from the structured steelman assessment); if the user's chosen side has measurably weaker evidence than the rejected side (below a documented threshold: lower average confidence OR fewer corroborating sources), `against_evidence` is set `true` — the decision record stores both sides' evidence snapshots inline so the marker is reproducible later without re-computation.

**Given** the writer composes a record,
**When** it calls `confirmedWrite`,
**Then** the embedding source is a composite of the chosen side's claim + rationale + rejected side's claim (so retrieval surfaces the decision on semantically-related future questions), and the record is persisted — and the writer has no exported update or delete function; the `decisionLog` module exports only `write`.

**Given** the decision is logged,
**When** the server emits `decision.logged`,
**Then** a new `decision` `ChatMessage` variant renders inline: a dark-navy `#1a1a2e` block per the UX spec with a "Decision" label chip, chosen-side claim in the header, rejected-side claim below in dimmer text, rationale as a blockquote, both sides' citation chips, and — when `against_evidence: true` — an amber "Decided against stronger evidence" pill prominently placed.

**Given** a module other than `decisionLog.ts` attempts to write a `decision_log` record,
**When** the server starts or runs tests,
**Then** a boundary-enforcement test fails with a clear error message identifying the violating module — the enforcement is code-level, not just convention.

**Given** tests cover the protocol,
**When** I run both suites,
**Then** tests verify: decision-intent classification, confirming-question path on ambiguity, `against_evidence` computation across several fixture scenarios, immutability (no update/delete exports), confirmed-write, `decision` variant rendering with and without the against-evidence pill, and the boundary-enforcement test.

---

### Story 3.7: Decisions sidebar tab + past-decision review

As Downe, I want the Decisions sidebar tab to show every logged decision with full evidence context and against-evidence markers, and I want to revisit any decision in chat, So that the decision log is genuinely retrievable — "you decided X despite evidence for Y" works on demand.

**Acceptance Criteria:**

**Given** Epic 1's Decisions sidebar tab shows an empty state,
**When** the current project has at least one `decision_log` record,
**Then** the empty state is replaced by a reverse-chronological list where each row shows: short decision summary (chosen claim truncated to one line), decision date, stakes pill (high/medium/low), and an amber "Against evidence" pill when applicable — no search bar required at MVP; simple chronological scanning is sufficient.

**Given** the server exposes decision data,
**When** the client fetches `GET /api/projects/:project_id/decisions`,
**Then** the response is `{ data: DecisionRecord[] }` sorted `created_at desc` with each record including chosen + rejected claims, rationale, both sides' finding ids, `against_evidence`, stakes, and `session_id` — findings are hydrated by a separate call or embedded as summaries in the response (choice made for performance; story settles on embedded summaries for MVP).

**Given** I click a decision row,
**When** the detail pane opens,
**Then** it shows: full chosen-side claim + rationale, full rejected-side claim, both sides' `research_finding`/`evidence` cards (reusing Intelligence-tab components from Story 2.7) with their source chips and confidence badges, the against-evidence marker with an explanation of why it was assigned (confidence delta + source-count delta), and a "Revisit in chat" action.

**Given** I click "Revisit in chat",
**When** the action runs,
**Then** the chat column focuses, a fresh turn is seeded with a system-generated user message ("Revisit decision from [date]: [chosen claim] over [rejected claim]") that invokes the orchestrator to load the decision record via RAG and produce a contextual summary including current staleness of the underlying findings — nothing about the decision record itself is mutated (NFR8 holds).

**Given** a decision's underlying findings have been superseded since the decision was logged,
**When** the detail pane renders,
**Then** superseded findings show a muted "superseded by [N]" badge with a link to the replacement — the decision record still stores the original finding snapshots inline (immutable), but the UI surfaces that the underlying evidence has evolved since the decision was made.

**Given** the Decisions tab is open,
**When** a new `decision.logged` event fires in the current session,
**Then** the list refreshes via TanStack Query invalidation (same pattern as Intelligence tab in Story 2.7) and the newly-added row briefly highlights to draw attention.

**Given** tests cover the tab,
**When** I run both suites,
**Then** tests verify: list rendering with and without against-evidence pill, detail pane shows both sides correctly, "Revisit in chat" seeds the right turn without mutating the record, superseded-finding badging, TanStack Query invalidation on new decisions, and the server endpoint's shape and ordering.

---

## Epic 4: Methodology Wiki (Karpathy pattern + Obsidian integration)

**Goal:** Give the agent durable, cross-project methodology via a Karpathy-style three-layer wiki edited in Obsidian, with a sole-writer choke point for atomic safety, semantic retrieval against a dedicated wiki namespace, an agent-proposes-article flow with graduated-trust phases (co-build → collaborative → autonomous), and a first-launch bootstrap workflow (PRD Journey 1).

### Story 4.1: Wiki directory scaffold + `writer.ts` choke point + `log.md`

As Downe, I want the `wiki/` directory scaffolded with Karpathy's three-layer structure and a sole-writer module enforcing atomic writes and an append-only log, So that every subsequent wiki story writes through one hardened choke point and file corruption from partial writes is impossible (NFR7).

**Acceptance Criteria:**

**Given** the repo root has no `wiki/` directory,
**When** I run the wiki scaffold script (or it runs on first server start),
**Then** the following structure is created: `wiki/sources/` (empty; holds immutable raw material later), `wiki/pages/` (empty; LLM-owned markdown), `wiki/SCHEMA.md` (human-curated conventions document — seeded with a starter template explaining file naming, `[[wikilink]]` syntax, frontmatter fields, and editorial norms), `wiki/index.md` (primary navigation, seeded with a placeholder "No pages yet" section that the bootstrap story populates), and `wiki/log.md` (empty append-only log).

**Given** `apps/server/src/wiki/writer.ts` exists,
**When** I call `writer.writePage(relativePath, content)` or `writer.writeIndex(content)` or `writer.writeSchema(content)`,
**Then** the writer validates the target path stays inside `wiki/pages/`, `wiki/index.md`, or `wiki/SCHEMA.md` respectively (path traversal rejected), writes to a temp file in the same filesystem (`<target>.tmp.<uuid>`) with UTF-8 encoding, flushes, and atomically renames via `fs.promises.rename` — NFR7 is satisfied because `rename` is atomic on same-filesystem writes.

**Given** `writer.ts` is the sole writer,
**When** I run a module-boundary test,
**Then** the test greps the `apps/server/src/**` tree for `fs.writeFile`, `fs.writeFileSync`, `fs.appendFile`, `fs.appendFileSync`, and `fs.rename` targeting paths under `wiki/`, and fails with a clear error listing any violating module — only `apps/server/src/wiki/writer.ts` and `apps/server/src/wiki/log.ts` (the `log.md` appender, Story 4.1 scope) may match.

**Given** `apps/server/src/wiki/log.ts` exists,
**When** I call `log.append(entry)` with a typed `WikiLogEntry` (`timestamp`, `operation: "write_page" | "write_index" | "write_schema" | "ingest_source" | "embed_pages" | "proposal_approved" | "proposal_rejected" | "autonomous_write"`, `actor: "user" | "agent"`, `path?`, `summary`, `phase?`),
**Then** the entry is serialized as a single markdown bullet line with ISO-8601 UTC timestamp prefix and appended to `wiki/log.md` via the atomic temp-read-append-rename pattern — concurrent appends serialize through a single in-process queue so entries never interleave mid-line.

**Given** every write through `writer.ts` completes,
**When** the write returns success,
**Then** a `log.append` call is made automatically (writer composes the log entry from its arguments) so every wiki mutation is traceable — writes that bypass logging are a bug, not a feature.

**Given** a write fails mid-operation (disk full, permission error),
**When** the writer's `try/catch` handles it,
**Then** the temp file is cleaned up, the target file is unchanged, an `AppError` with `code: 'wiki_write_failed'` and `retryable: true` bubbles up, and no log entry is appended — partial writes never corrupt the target and never leave stale log entries.

**Given** tests cover the scaffold and writer,
**When** I run the server test suite,
**Then** tests verify: scaffold creates the expected directory tree, writer atomic-write path, writer path-traversal rejection, `log.append` serialization under concurrent calls, cleanup on write failure, and the module-boundary grep test.

---

### Story 4.2: Wiki read layer + `index.md`-first orientation + cross-project access

As Downe, I want the orchestrator to load `wiki/index.md` as part of its orientation context on every turn and to navigate `[[wikilinks]]` correctly, So that methodology is available to every response without per-turn prompting — and available identically across every project (FR31).

**Acceptance Criteria:**

**Given** `apps/server/src/wiki/reader.ts` exists,
**When** I call `reader.loadIndex()`,
**Then** it reads `wiki/index.md` from disk, parses the markdown into a structured `WikiIndex` type (`title`, `sections[]` with `heading` and `page_refs[]`), resolves `[[page-slug]]` and `[[page-slug|display-text]]` wikilinks into `{ slug, display, exists }` records (`exists` set by checking `wiki/pages/<slug>.md` on disk), and returns the structure — the raw markdown is also returned so the orchestrator can include it verbatim in orientation context.

**Given** a page is referenced via `[[wikilink]]`,
**When** I call `reader.loadPage(slug)`,
**Then** the reader resolves `wiki/pages/<slug>.md`, parses YAML frontmatter if present (`title`, `tags`, `last_reviewed`), returns `{ slug, frontmatter, content, backlinks: slug[] }` where `backlinks` is precomputed from an index of all pages referencing this one, and returns `null` if the page does not exist (caller decides how to handle).

**Given** the reader caches parsed pages,
**When** a page file changes on disk (Obsidian edit or writer.ts write),
**Then** a `chokidar` file-watcher debounced 500ms invalidates the affected page's cache entry, invalidates the index cache when `index.md` changes, and emits an internal `wiki.invalidated` event so downstream consumers (Story 4.3's embedder, sidebar tab's client) re-read — in-memory cache never returns stale content past the debounce window.

**Given** the orchestrator is running a turn,
**When** it assembles its system context,
**Then** `reader.loadIndex().raw_markdown` is prepended to the system prompt under a clearly-delimited "Methodology wiki (cross-project)" section, along with a one-line instruction telling the model to reference wiki pages via `[[slug]]` when applying methodology, and retrieval from Story 4.3 supplements with relevant page bodies.

**Given** the wiki is cross-project (FR31),
**When** I switch between projects in the ProjectSwitcher,
**Then** the wiki content loaded into orientation is identical across projects — the wiki lives at the repo root `wiki/`, not under any project scope, so a foundational article written while working on "radio-app" is available to "next-venture" without copying.

**Given** an Obsidian-style `[[Page Title]]` link appears in a page,
**When** the reader parses it,
**Then** case-insensitive slug resolution applies (`[[Market Research]]` → `market-research.md`) matching Obsidian's default "auto-slug" behavior, and broken links are surfaced both in the returned structure (`exists: false`) and in a periodic `log.append` entry during file-watch-triggered re-parsing so stale links are observable rather than silent.

**Given** tests cover the reader,
**When** I run the server test suite,
**Then** tests verify: `index.md` parsing, wikilink resolution (existing, broken, case-insensitive), frontmatter parsing, backlinks indexing, file-watcher invalidation debounce, cross-project identical-content assertion across projectIds, and the orchestrator orientation-injection format.

---

### Story 4.3: Wiki semantic retrieval pipeline

As Downe, I want wiki pages embedded and retrievable semantically alongside project findings, So that the agent recalls and applies methodology contextually rather than only when a `[[wikilink]]` happens to appear in `index.md`.

**Acceptance Criteria:**

**Given** the Pinecone client from Story 2.1 exists,
**When** a wiki page is written (via `writer.ts`) or detected as changed (via file-watcher),
**Then** an embedder (`apps/server/src/wiki/embedder.ts`) generates a Voyage `voyage-3-large` embedding with the page's title + content as source, upserts into Pinecone index `business-planner-intelligence` under the reserved namespace `__wiki__` with id `wiki:<slug>`, and metadata `{ record_type: 'wiki_page', slug, title, tags[], last_indexed_at }` — the namespace `__wiki__` is reserved and rejected from project-CRUD operations (Story 1.5's handler guards against it).

**Given** multiple page changes happen in quick succession,
**When** the embedder processes them,
**Then** a debounced batch-embed queue (default 1 second window, configurable via env `WIKI_EMBED_DEBOUNCE_MS`) aggregates changes and embeds in one `voyage.embedBatch` call when possible, with retries on transient failures per Story 2.1's Voyage client policy, and every successful re-embed is logged to `wiki/log.md` via `log.append` with operation `embed_pages`.

**Given** a page is deleted from `wiki/pages/`,
**When** the file-watcher emits `unlink`,
**Then** the embedder calls `pinecone.deleteMany('__wiki__', [<wiki:slug>])` so the retrieval index stays consistent with disk — orphaned vectors do not linger.

**Given** Story 2.6's pre-turn retrieval runs,
**When** the user message is embedded,
**Then** retrieval queries TWO namespaces: the current project's namespace (findings, evidence, intelligence briefs, decisions, session checkpoints) AND `__wiki__` (methodology pages), with `top_k` split (default 8 project + 4 wiki, configurable), and both sets are merged into the orchestrator's context under separately-labeled sections ("Prior intelligence in this project" and "Relevant methodology from wiki").

**Given** a wiki page is cited in an assistant reply,
**When** the citations block is parsed (Epic 2 Story 2.4),
**Then** `source_type` is extended to include `"wiki"`, citations pointing at wiki pages carry `{ source_type: "wiki", slug, title, last_indexed_at }` metadata rather than a URL, and `CitationTag` popover renders a small book icon + "Wiki: <page title>" with a link that opens the Wiki sidebar tab focused on that page (Story 4.4 implements the focus).

**Given** the `__wiki__` namespace is cross-project (single shared corpus),
**When** I work in project A and then project B,
**Then** the same wiki pages are retrievable from both projects with identical results — the namespace is NOT projectId-scoped, validating FR31.

**Given** tests cover the pipeline,
**When** I run the server test suite,
**Then** tests verify: page-change → embed-and-upsert, batch debounce aggregation, delete-on-unlink, merged two-namespace retrieval in Story 2.6's pipeline, `source_type: "wiki"` propagation through the citation flow, `__wiki__` namespace rejection in project CRUD, and cross-project identical-retrieval assertion.

---

### Story 4.4: Wiki sidebar tab + read-only page rendering + "Open in Obsidian"

As Downe, I want the sidebar Wiki tab to show my methodology pages in a navigable, read-only view with an "Open in Obsidian" affordance per page, So that I can scan the wiki in-app during research but always edit in Obsidian (the single source of truth editor).

**Acceptance Criteria:**

**Given** Epic 1's Wiki sidebar tab shows an empty state,
**When** `wiki/pages/` contains at least one page,
**Then** the empty state is replaced by a page tree grouped by folder/tag, with `index.md` rendered at the top as a scannable table of contents and pages listed below — when the wiki is genuinely empty, a CTA surface shows "Start wiki bootstrap" that triggers Story 4.6's flow.

**Given** the Wiki tab loads,
**When** the client calls `GET /api/wiki/pages`,
**Then** the response is `{ data: { index: WikiIndex, pages: PageSummary[] } }` where `PageSummary` includes `{ slug, title, tags[], last_modified, backlink_count }`, and the client renders the tree with each page row showing title, tag pills, and backlink count — sorted alphabetically within each group with a mode toggle for recent-first.

**Given** I click a page in the tree,
**When** the page detail loads via `GET /api/wiki/pages/:slug`,
**Then** the page renders as markdown (reusing react-markdown + remark-gfm + rehype-highlight from Epic 1) in a read-only container, `[[wikilinks]]` within the content are clickable and navigate to the target page within the sidebar (not opening popups), broken wikilinks render with a strikethrough + dim color + hover tooltip "Page does not exist", and a backlinks footer lists pages that reference the current one.

**Given** I want to edit a page,
**When** I click the "Open in Obsidian" button in the page header,
**Then** the browser invokes the `obsidian://open?vault=business-planner-bmad&file=<slug>` URI (the vault name is configurable via env `OBSIDIAN_VAULT_NAME`, defaults to the repo folder name), which Obsidian handles by opening the page in the desktop app — no in-app editor is shipped (explicit design decision).

**Given** the Wiki sidebar is open and a page is being edited in Obsidian,
**When** Obsidian saves the file,
**Then** the server's file-watcher fires Story 4.2's invalidation and Story 4.3's re-embed, the client's TanStack Query cache invalidates (SSE heartbeat carries a `wiki.invalidated` event from Story 4.2 that triggers the invalidation), and the open page re-renders with the new content within ~1 second — no manual refresh needed.

**Given** a citation popover references a wiki page (Story 4.3),
**When** I click the "Open in wiki" link in the popover,
**Then** the sidebar Wiki tab opens and focuses on the referenced page with the tab scrolling the page into view — the main chat remains where it was so context is not lost.

**Given** tests cover the tab,
**When** I run the web test suite,
**Then** tests verify: empty-state CTA vs. populated tree rendering, page detail rendering with wikilink resolution, broken-link styling, backlinks footer, "Open in Obsidian" URI construction, TanStack Query invalidation on file-watcher events, and cross-sidebar focus when arriving from a citation popover.

---

### Story 4.5: Agent-proposes-article flow (Phase B) (FR26, FR27, FR30)

As Downe, I want the agent to propose wiki article additions or modifications at natural stopping points with an approve / modify / reject flow, So that methodology accumulates from lived work rather than requiring me to write it all upfront — and every addition is reviewed before landing.

**Acceptance Criteria:**

**Given** `@bp/shared` AgentEvent union exists,
**When** I add wiki event types,
**Then** the union gains `wiki.proposal` (with `{ proposal_id, operation: "create" | "modify", target_slug, current_content?, proposed_content, rationale, triggered_by: "stopping_point" | "explicit_request" }`), `wiki.proposal_decision` (`{ proposal_id, decision: "approved" | "modified" | "rejected", final_content? }`), and `wiki.written` (`{ slug, operation, actor }`) — each typed and narrowed at every consumer.

**Given** `apps/server/src/agents/wiki/proposalDetector.ts` exists,
**When** the orchestrator completes a turn,
**Then** a post-turn hook runs a detector that evaluates natural stopping points: (a) a methodology pattern emerged from the conversation that is not yet captured in any wiki page (checked via semantic query against `__wiki__`), (b) an existing wiki page is contradicted or refined by conclusions reached this turn, or (c) the user said something like "we should write that down" — when any trigger fires, the detector invokes a wiki-proposal Claude call with a dedicated prompt that drafts the proposed page content and rationale.

**Given** the detector produces a proposal,
**When** the server emits `wiki.proposal`,
**Then** a `wiki_proposal` `ChatMessage` variant renders inline in the chat stream: a bordered block with a "Wiki proposal" label chip, the target path (`wiki/pages/<slug>.md` with "(new)" or "(modify)" suffix), a diff view (for modifications) or full preview (for creates) with markdown rendered, the rationale as a blockquote, and three action buttons: Approve, Modify, Reject.

**Given** I click "Approve",
**When** the client sends `POST /api/wiki/proposals/:proposal_id/approve`,
**Then** the server validates the proposed content against `wiki/SCHEMA.md` conventions (frontmatter presence, valid wikilinks, no path traversal), invokes `writer.writePage(target_slug, proposed_content)`, the resulting write cascades through Story 4.1's log entry + Story 4.3's re-embed, emits `wiki.written` SSE, and the inline proposal block updates to show "Approved — wiki/pages/<slug>.md" with a link to the Wiki tab.

**Given** I click "Modify",
**When** the action triggers,
**Then** an inline textarea expands pre-filled with the proposed content, I edit freely (with markdown-aware preview), and clicking Save sends `POST /api/wiki/proposals/:proposal_id/approve` with the edited content as the final_content payload — the modification is what actually writes, and the log entry notes `actor: "user"` for the final content (even though the agent drafted the initial version, the user made the edits).

**Given** I click "Reject",
**When** the client sends `POST /api/wiki/proposals/:proposal_id/reject`,
**Then** no wiki write occurs, a `wiki.proposal_decision` event emits with `decision: "rejected"`, the proposal block updates to show "Rejected" in dim text, a log entry is appended noting the rejection with the proposal's target_slug and rationale (so the rejection signal is observable in Story 4.7's trust counter), and the proposal is cleared from the server-side pending-proposals store.

**Given** the agent is in Phase B (collaborative) per Story 4.7's phase state,
**When** a proposal is generated,
**Then** it always requires explicit user decision — the server blocks auto-approval in Phase B; Phase C's autonomous writes are Story 4.7's concern.

**Given** the user initiates a wiki article directly in chat (FR28 — "please write an article about X", "update the market-research page with what we just learned", "create a wiki page for Y framework"),
**When** the orchestrator's intent classifier (extending Story 3.4's classifier with a `wiki_request` intent covering both `create` and `modify` operations) catches it,
**Then** the orchestrator bypasses the post-turn stopping-point detector for this turn and directly invokes the wiki-proposal Claude call with `triggered_by: "explicit_request"` in the resulting `wiki.proposal` event — the same `wiki_proposal` `ChatMessage` variant renders with Approve / Modify / Reject actions, and the user-directed path is therefore identical to the agent-proposed path from the point of the proposal block onward (single review surface, single write path, single log entry).

**Given** a user-directed wiki request targets an existing page,
**When** the proposal is generated,
**Then** `operation: "modify"` is set, `current_content` is populated from Story 4.2's reader, the diff view renders in the proposal block, and the rationale section states the user-directed origin ("You asked me to update wiki/pages/<slug>.md with …") so the provenance is unambiguous in the chat transcript.

**Given** a user-directed wiki request targets a page that does not yet exist,
**When** the proposal is generated,
**Then** `operation: "create"` is set, the slug is derived from the user's phrasing (normalized via the same slug rules Story 4.2 uses for `[[wikilink]]` resolution), the full preview renders, and if the derived slug collides with an existing page the orchestrator asks a one-line disambiguating question before committing to the proposal.

**Given** tests cover the flow,
**When** I run both suites,
**Then** tests verify: stopping-point detection triggers on fixture conversations, proposal event emits with correct shape, variant renders approve/modify/reject, SCHEMA validation rejects malformed proposals with an error toast, approve path writes + logs + re-embeds, modify path writes user-edited content with correct actor, reject path records rejection without writing, the pending-proposals store is cleared on any decision, user-directed `create` and `modify` requests emit proposals with `triggered_by: "explicit_request"` and correct operation + slug, and slug-collision disambiguation fires when a user-directed create targets an existing slug.

---

### Story 4.6: Wiki bootstrap workflow (Phase A) (Journey 1)

As Downe, I want the very first session after tool setup to be a guided wiki bootstrap where the agent proposes foundational methodology articles and I approve them one by one, So that I start with a populated wiki grounded in my approval (PRD Journey 1).

**Acceptance Criteria:**

**Given** the server starts and `wiki/pages/` exists,
**When** the server evaluates wiki-phase state on any new session,
**Then** it counts approved pages in `wiki/pages/` (excluding `index.md` and `SCHEMA.md`); if the count is below the configurable threshold `WIKI_BOOTSTRAP_MIN_PAGES` (default 6), the phase is `"A"` (bootstrap); if at or above but below the autonomous threshold, phase is `"B"`; phase `"C"` is set explicitly by Story 4.7 — the phase value is included in every `/api/sessions/:id` response so the client can adapt.

**Given** the phase is `"A"`,
**When** the user opens the app and selects (or creates) their first project,
**Then** the chat column shows a system-generated welcome `ChatMessage` explaining Phase A and proposing to start wiki bootstrap — the welcome offers "Start bootstrap" and "Skip for now" buttons, and the chat input is usable either way.

**Given** I click "Start bootstrap",
**When** the orchestrator is invoked in bootstrap mode,
**Then** the system prompt loaded from `apps/server/src/agents/wiki/bootstrap.md` instructs the model to conduct a conversation covering foundational topics — market research methodology, competitive analysis frameworks, business model canvas, customer discovery, financial-modeling approaches, decision frameworks — proposing one article at a time via Story 4.5's proposal flow, asking clarifying questions to tailor content to Downe's preferences (role, prior experience, domain).

**Given** a bootstrap proposal is generated,
**When** it renders inline,
**Then** it uses the same `wiki_proposal` variant from Story 4.5 but with an additional "Bootstrap" accent tag on the label chip, and the orchestrator waits for my decision before proposing the next article (sequential, not parallel — avoids overwhelming me).

**Given** bootstrap is in progress,
**When** I close the app or switch projects,
**Then** the bootstrap state persists in the session store; on next session the welcome message adjusts to "Resume bootstrap — N articles approved so far" with a list of proposed-but-not-decided articles still pending decision.

**Given** I've approved enough articles,
**When** the approved count reaches `WIKI_BOOTSTRAP_MIN_PAGES`,
**Then** the phase transitions to `"B"`, a congratulatory system message renders ("Bootstrap complete — wiki now has N foundational articles. I'll propose refinements as we work."), the welcome-on-session-start no longer fires, and Story 4.7's autonomous-offer is gated on further approval activity from here.

**Given** I skip bootstrap,
**When** I click "Skip for now",
**Then** the welcome is dismissed for the current session but re-surfaces on the next new session until bootstrap is completed (or explicitly marked "never" via a setting) — bootstrap is important enough to keep nudging without being modal.

**Given** tests cover bootstrap,
**When** I run both suites,
**Then** tests verify: phase detection at various page counts, welcome render in Phase A, bootstrap system-prompt load, sequential proposal flow, cross-session state persistence, phase A→B transition on threshold cross, skip-and-resume behavior, and the congratulatory transition message.

---

### Story 4.7: Phase transitions + autonomous permissions (Phase C)

As Downe, I want the agent to offer autonomous wiki update permissions once it has demonstrated consistent editorial judgment — and I want to grant, revoke, or configure that permission naturally, So that the graduated-trust model actually graduates over time (product brief's Phase C) rather than staying permanently in collaborative mode.

**Acceptance Criteria:**

**Given** a trust counter tracks wiki proposal decisions,
**When** any `wiki.proposal_decision` event fires,
**Then** the server increments counters in a durable store (`data/wiki-trust.json` or equivalent): `approved_count`, `modified_count` (counts the agent's draft was useful but needed editing — partial credit), `rejected_count`, `total_count` — the store is a JSON file read/written atomically via the same temp+rename pattern as `writer.ts`.

**Given** the counter updates,
**When** approved + modified together crosses `WIKI_AUTONOMOUS_THRESHOLD` (default 10, configurable via env) AND rejection-rate (`rejected_count / total_count`) is below `WIKI_AUTONOMOUS_MAX_REJECTION_RATE` (default 0.2, configurable via env) AND the current phase is `"B"`,
**Then** the orchestrator surfaces a one-time autonomous-offer inline `ChatMessage` with a "Phase C — autonomous mode" label chip, a short explanation of what changes (agent writes without explicit approval; still logged and revocable), and "Grant autonomous mode" / "Keep reviewing proposals" buttons.

**Given** I click "Grant autonomous mode",
**When** the client sends `POST /api/wiki/phase` with `{ phase: "C" }`,
**Then** the server writes phase `"C"` into the trust store, all subsequent sessions run in Phase C until revoked, and a confirmation system message explains the new behavior and how to revoke ("Say 'switch back to reviewing' anytime or toggle in settings").

**Given** I click "Keep reviewing proposals",
**When** the offer is dismissed,
**Then** phase remains `"B"`, the offer is suppressed for the next `WIKI_AUTONOMOUS_OFFER_COOLDOWN_APPROVALS` (default 10, configurable) additional approvals before re-surfacing, and a log entry records the deferral so the cadence is observable.

**Given** phase is `"C"`,
**When** Story 4.5's proposal detector fires,
**Then** the flow bypasses the approve/modify/reject UI: the agent directly invokes `writer.writePage` with the proposed content (still going through SCHEMA validation and the choke point), a muted `wiki_autonomous_write` notification `ChatMessage` renders inline (dim text, "Wiki autonomously updated: wiki/pages/<slug>.md — click to view"), and the `log.append` entry records `phase: "autonomous"` and `actor: "agent"`.

**Given** I want to revoke autonomous mode,
**When** I send a natural-language revocation ("switch back to reviewing", "I want approvals again") OR toggle a setting in the app (a settings panel is added — scope TBD; minimum viable is a kebab menu in the Wiki tab with "Switch to review mode"),
**Then** the intent classifier (extending Story 3.4's classifier with a `phase_revocation` intent) catches it, the server writes phase `"B"` into the trust store, a confirmation message renders, and subsequent proposals require explicit decision again.

**Given** I dislike an autonomous write after the fact,
**When** I say "undo that last wiki change" or edit/delete the page in Obsidian,
**Then** for the natural-language path, the orchestrator identifies the most recent `wiki_autonomous_write` event for the current session, invokes `writer.writePage` with the prior content (loaded from git if available, otherwise from `wiki/log.md`'s recorded previous state), logs the rollback, and confirms — Obsidian edits are handled naturally by the file-watcher and re-embed pipeline.

**Given** tests cover phase transitions,
**When** I run both suites,
**Then** tests verify: trust counter increments correctly for each decision type, autonomous offer triggers at threshold + rejection-rate gates, offer suppression cooldown, phase C autonomous write path skips UI + logs correctly, revocation via natural language and via toggle both work, the intent classifier's `phase_revocation` detection, and the last-autonomous-write rollback path.

---

## Epic 5: Session Continuity (Context Gauge + Checkpoint/Resume)

**Goal:** Close the multi-day workflow loop: a live context gauge warns before the window fills, structured checkpoints capture enough state to reconstruct work days later, resume reloads orientation via RAG against the project namespace in under 15 seconds, and an emergency auto-checkpoint guards against context-exhaustion data loss.

### Story 5.1: Context gauge domain + SSE events + `ContextHealthGauge` widget (FR33)

As Downe, I want the status bar to show a live context-remaining gauge that transitions from green to yellow to red as the window fills, So that I know when to checkpoint before the window runs out — and the agent has the same signal to drive its own behavior.

**Acceptance Criteria:**

**Given** `apps/server/src/domain/contextGauge.ts` exists,
**When** a turn completes,
**Then** it computes total token usage for the session including: system prompt + orientation-context injections (wiki + retrieval) + full conversation history to date + the just-completed turn's input/output, expressed as both an absolute token count and a percentage of the configured model window (`CLAUDE_OPUS_CONTEXT_TOKENS`, default 200000), and caches the result keyed by `session_id`.

**Given** the gauge domain computes usage,
**When** thresholds are evaluated,
**Then** two coexisting frames are exposed: a **UI frame** for colors (green when ≥50% remaining, yellow when 25–50% remaining, red when <25% remaining per UX-DR16) and an **agent-behavior frame** for orchestrator decisions (`healthy` <60% used, `warning` 60–80% used, `urgent` 80–92% used, `emergency` ≥92% used) — both are derivable from the same percentage and emitted together in the SSE event so consumers don't re-compute.

**Given** a turn finishes or a checkpoint is saved,
**When** the server emits `context.update`,
**Then** the SSE payload is `{ session_id, tokens_used, tokens_remaining, percent_used, ui_zone: "green" | "yellow" | "red", behavior_zone: "healthy" | "warning" | "urgent" | "emergency", turn_count }` and the client's Zustand store replaces its current gauge state atomically.

**Given** `apps/web/src/components/ContextHealthGauge.tsx` exists,
**When** it renders in the status bar,
**Then** it shows a compact horizontal bar filling right-to-left as usage grows, colored by `ui_zone` with smooth transitions on zone change, a numeric "NN% left" label with tabular-num, and a hover tooltip showing "`<tokens_remaining>` tokens remaining • `<turn_count>` turns • Used: `<tokens_used>` / `<total>`".

**Given** the gauge crosses from green into yellow or yellow into red,
**When** the transition happens,
**Then** a one-shot muted toast fires ("Context at 50% — still plenty of room" for green→yellow; "Context at 25% — consider checkpointing soon" for yellow→red) — never on recovery transitions (usage only goes up within a session), and debounced so rapid re-fires from near-threshold fluctuation don't stack.

**Given** the status bar already has Epic 1's placeholder gauge slot,
**When** this story lands,
**Then** the placeholder is replaced by `ContextHealthGauge` with no layout shift, and the Session cost + Project cost widgets from Story 1.11 remain in their status-bar positions unchanged.

**Given** tests cover the gauge,
**When** I run both suites,
**Then** tests verify: server-side threshold computation at boundary values (49%, 50%, 51%, 74%, 75%, 76%, 79%, 80%, 81%, 91%, 92%, 93%), zone-mapping correctness for both frames, `context.update` SSE shape, component rendering at all three zones, zone-transition toast fires exactly once per transition, and tooltip accuracy.

---

### Story 5.2: `session_checkpoint` Pinecone writer + schema (NFR9)

As Downe, I want a locked `session_checkpoint` record schema with a dedicated writer that captures enough structured state to reconstruct work days later, So that checkpoint content is never ambiguous or under-specified — resume quality depends on this schema being right.

**Acceptance Criteria:**

**Given** Story 2.1's `RecordType` union exists,
**When** I finalize the `session_checkpoint` variant,
**Then** its metadata schema is frozen with fields: `session_id` (UUID), `project_id` (UUID), `created_at` (ISO-8601 UTC), `conversation_summary` (prose string, required — used as embedding source), `open_questions` (array of `{ question, context, priority: "high" | "medium" | "low" }`), `intelligence_topic_manifest` (array of `{ topic, finding_count, evidence_count, last_updated }`), `decision_count` (integer — count of `decision_log` records in this session), `context_stats` (`{ tokens_used, percent_used, turn_count }` snapshot at save time), `topic_label` (short human-readable label user/agent assigned, used for History tab display), and `resumed_from` (optional prior `session_checkpoint` id forming a chain).

**Given** `apps/server/src/memory/writers/sessionCheckpoint.ts` exists,
**When** I inspect it,
**Then** it exports a single `write(input: CheckpointInput)` function, generates a server-side UUID v4 id, composes the Pinecone record with `record_type: 'session_checkpoint'` and the metadata schema above, embeds `conversation_summary` via Voyage (the summary prose is the semantic key used to find the checkpoint during RAG retrieval), calls Story 2.1's `confirmedWrite`, and rejects writes missing `conversation_summary` or `topic_label` at the type level.

**Given** a session has an existing checkpoint chain (user has resumed multiple times),
**When** a new checkpoint writes with `resumed_from: <prior_checkpoint_id>`,
**Then** the chain metadata is preserved so History tab (Story 5.6) can render the lineage, and subsequent retrieval queries surface the most recent checkpoint first (via `created_at desc` secondary sort on equal scores).

**Given** checkpoint writer behavior matches Story 2.2's writer pattern,
**When** checkpoint write succeeds,
**Then** the checkpoint record is queryable via project namespace retrieval (it's just another record in the project namespace with `record_type: 'session_checkpoint'`) — no new namespace, no special storage, full reuse of Epic 2's memory plumbing.

**Given** a checkpoint is written,
**When** it is retrieved,
**Then** the returned record's metadata fully round-trips — no field loss, no type drift; schema completeness is verified by a test that writes a maximal fixture, fetches it, and asserts deep equality on every field.

**Given** tests cover the writer,
**When** I run the server test suite,
**Then** tests verify: write-then-fetch schema round-trip, rejection on missing required fields, embedding source is the summary prose (not the whole input), `resumed_from` chain preservation, and confirmed-write invocation.

---

### Story 5.3: Checkpoint creation flow + `CheckpointButton` (FR24, FR34)

As Downe, I want to click a checkpoint button (or respond to the agent's suggestion) and have the agent compose a high-fidelity checkpoint that actually lets me pick up where I left off, So that saving is a one-action habit rather than a prose-writing chore.

**Acceptance Criteria:**

**Given** a `CheckpointButton` component is added to the status bar between `ContextHealthGauge` and the cost meter,
**When** I click it,
**Then** an inline input (not a modal) appears in the chat column prompting for an optional topic label with placeholder "What were we working on? (e.g., 'Competitive landscape pass 2')", pressing Enter or clicking Save triggers the checkpoint composition, and Esc cancels — if the user submits empty, the agent generates a topic label from the conversation summary automatically.

**Given** checkpoint composition is triggered,
**When** the orchestrator runs with a dedicated `checkpoint_compose` system prompt,
**Then** the model returns structured output containing: a prose `conversation_summary` covering what was worked on this session (progress, conclusions, unresolved threads), an `open_questions[]` array prioritized by importance, an `intelligence_topic_manifest[]` listing topics the session touched with counts, and a suggested `topic_label` if the user didn't provide one — structured output is parsed and validated before writing.

**Given** the composition completes,
**When** the server calls Story 5.2's writer,
**Then** `decision_count` is derived by counting `decision_log` records in this project namespace with matching `session_id`, `context_stats` is snapshotted from Story 5.1's gauge, `resumed_from` is set if the current session was started via resume (Story 5.5 propagates this), and the write confirms via `confirmedWrite`.

**Given** the checkpoint write succeeds,
**When** the server emits `checkpoint.saved`,
**Then** the SSE payload is `{ checkpoint_id, session_id, topic_label, created_at }`, a success toast fires with the topic label ("Checkpoint saved: 'Competitive landscape pass 2'"), and an inline `system` `ChatMessage` renders confirming the save with a "View checkpoint" link opening the History tab (Story 5.6) focused on the new entry.

**Given** the session transcript must survive resume,
**When** the checkpoint writes,
**Then** the full ordered turn history for `session_id` is confirmed persisted to the session store (Postgres or JSON fallback per Epic 1) before the `checkpoint.saved` event fires — if the store write fails, the checkpoint is NOT written to Pinecone; both must succeed or neither does.

**Given** checkpoint composition fails (Claude error, parse failure after retry),
**When** the failure surfaces,
**Then** an error toast fires with `code: 'checkpoint_compose_failed'` and a Retry action, the cost incurred so far IS recorded in `cost.jsonl` (the call happened), and no partial checkpoint is written — the user can retry without duplicating content.

**Given** tests cover the flow,
**When** I run both suites,
**Then** tests verify: button click opens inline input, composition system prompt produces structured output matching the schema, parse-failure retry path, topic-label auto-generation when empty, decision count derivation correctness, session-store-write-before-checkpoint-write ordering, both-or-neither atomicity, and toast + inline confirmation message rendering.

---

### Story 5.4: Stopping-point detection + auto-suggest (FR37)

As Downe, I want the agent to detect natural stopping points and proactively suggest checkpointing, So that I don't have to remember to save and the tool nudges me at good moments rather than mid-thought.

**Acceptance Criteria:**

**Given** `apps/server/src/agents/session/stoppingPointDetector.ts` exists,
**When** a turn completes,
**Then** a post-turn evaluation checks signals: (a) a research thread reached a natural conclusion (detector: last turn finalized multiple findings without opening new questions), (b) a decision was logged this turn (detector: `decision.logged` event fired), (c) the user expressed wrap-up intent ("let's pick this up later", "good place to pause", "we'll come back to this"), or (d) the session has accumulated significant state without a checkpoint (default >20 turns since last checkpoint, configurable via `CHECKPOINT_SUGGEST_TURN_THRESHOLD`).

**Given** a stopping-point trigger fires,
**When** the server evaluates suggest-eligibility,
**Then** a debounce gate blocks if any `checkpoint.suggestion` event has fired within the last `CHECKPOINT_SUGGEST_COOLDOWN_MS` (default 3600000 — one hour) for the same session, preventing suggestion nagging during prolonged work bursts.

**Given** a suggestion is eligible,
**When** the server emits `checkpoint.suggestion`,
**Then** an inline `checkpoint_suggestion` `ChatMessage` variant renders between the assistant's reply and the next user message: dim-styled container with a "Good stopping point?" label chip, one-sentence rationale from the detector ("We just logged a decision and closed the pricing research thread"), and two actions — "Save checkpoint" (triggers Story 5.3's flow pre-filled with a suggested topic label) and "Keep going" (dismisses the suggestion for this session's debounce window).

**Given** this story's detector overlaps conceptually with Epic 4 Story 4.5's stopping-point detector,
**When** I implement it,
**Then** they remain separate modules with separate prompts and triggers (wiki-proposal detector looks for methodology patterns worth capturing; checkpoint-suggestion detector looks for session-state milestones) — duplication is intentional per the Epic 5 design note, and both may fire on the same turn without interfering because they produce different inline variants.

**Given** a suggestion is dismissed with "Keep going",
**When** the session continues,
**Then** the debounce window starts fresh, the user's dismissal is logged at `info` level (observability for tuning the detector later), and no follow-up suggestion surfaces until a new trigger AND the cooldown expires.

**Given** the context gauge enters `urgent` or `emergency` zone,
**When** the detector runs,
**Then** the cooldown is bypassed (stopping-point suggestions are critical when context is filling) and the suggestion copy escalates ("Context is at 85% — good time to checkpoint before we run out of room") — Story 5.7 layers the actual auto-save behavior on top of this.

**Given** tests cover detection,
**When** I run the server test suite,
**Then** tests verify: each of the four trigger signals fires correctly on fixture turns, debounce blocks within the cooldown window, cooldown bypass on urgent+ context zones, separation from the wiki stopping-point detector (no cross-triggering), and `checkpoint.suggestion` SSE payload shape.

---

### Story 5.5: Resume protocol + orientation briefing (FR35, FR36, NFR13)

As Downe, I want to resume a past session and get a structured orientation briefing within 15 seconds of clicking resume, So that multi-day work recovers with enough fidelity to continue rather than forcing me to re-read the whole transcript (PRD Journey 3).

**Acceptance Criteria:**

**Given** the History tab (Story 5.6) exposes past sessions,
**When** I click "Resume" on a session entry,
**Then** the client sends `POST /api/sessions/:session_id/resume` and the server: (1) loads the most recent `session_checkpoint` for that `session_id`, (2) rehydrates the conversation turns from the session store into a new session with a fresh `session_id` (so the checkpoint chain's `resumed_from` is preserved), (3) queries the project namespace via RAG using the checkpoint's `conversation_summary` as the semantic query to pull top-relevant findings, decisions, and briefs, and (4) invokes the orchestrator to compose an orientation briefing.

**Given** the orientation briefing is being composed,
**When** the orchestrator runs with a dedicated `resume_orientation` system prompt,
**Then** the briefing is a structured `system` `ChatMessage` with four clearly-delimited sections per UX-DR31: **Progress** (what we accomplished last time — from `conversation_summary`), **Decisions** (list of logged decisions with outcomes, cited to `decision_log` records), **Open questions** (from the checkpoint's `open_questions[]` prioritized), and **Next priority** (the agent's recommendation of where to pick up, synthesized from the open questions and recent research threads).

**Given** the briefing includes citations,
**When** they render,
**Then** they flow through Epic 2's citation pipeline normally — findings, decisions, and wiki pages all cite with `CitationTag` chips, `source_type` metadata is preserved, and the briefing is otherwise a normal chat message (the conversation can continue from it immediately).

**Given** NFR13 requires resume <15s,
**When** the resume endpoint runs under normal conditions (Pinecone + Claude healthy),
**Then** total end-to-end time from button click to briefing rendering (first `message.delta` event) is under 15 seconds for a typical session (100-turn transcript, ~20 findings, 2-3 decisions) — achieved by: parallelizing checkpoint fetch + session-store rehydration, streaming the briefing, and capping RAG retrieval at `top_k: 12` for orientation.

**Given** resume is complete,
**When** the new session's input enables,
**Then** I can ask "where did we land on X?" and the orchestrator answers using the rehydrated transcript + RAG recall — resume-fidelity probes (Story 5.7's test discipline) verify this works, and the first-question response cites the correct prior findings.

**Given** the old session's `session_id` is distinct from the new resumed session's `session_id`,
**When** a checkpoint is saved in the resumed session,
**Then** Story 5.2's writer populates `resumed_from` with the prior checkpoint's id forming a durable lineage chain visible in History (Story 5.6) — users can trace "this week's work → last week's checkpoint → two weeks ago's checkpoint" across many resumes.

**Given** Pinecone is in degraded read mode during resume,
**When** the resume endpoint runs,
**Then** it falls back to rehydrating transcript + checkpoint only (no RAG enrichment), surfaces a degraded-mode banner from Story 2.8 noting "Memory recall offline — orientation is from session transcript only", and the briefing explicitly flags reduced fidelity rather than silently omitting cross-referenced intelligence.

**Given** tests cover resume,
**When** I run both suites,
**Then** tests verify: checkpoint load + transcript rehydration ordering, orientation briefing structure (all four sections present), citation propagation, NFR13 latency under mocked Pinecone+Claude with realistic fixture sizes, `resumed_from` chain preservation, and degraded-mode fallback behavior.

---

### Story 5.6: History sidebar tab + session picker (FR38)

As Downe, I want the History sidebar tab to show every past session for the current project with checkpoint previews and resume actions, So that picking up prior work is scannable rather than requiring me to remember session labels.

**Acceptance Criteria:**

**Given** Epic 1's History sidebar tab shows an empty state,
**When** the current project has at least one session with a saved checkpoint,
**Then** the empty state is replaced by a reverse-chronological list scoped to the current project; sessions without checkpoints render below checkpointed sessions in a collapsed "Unsaved sessions" group so the primary list is resume-ready content.

**Given** the History tab loads,
**When** the client calls `GET /api/projects/:project_id/sessions`,
**Then** the response is `{ data: SessionSummary[] }` with each entry containing `session_id`, most-recent-checkpoint id (null for unsaved), `topic_label`, `created_at`, `last_activity_at`, `turn_count`, `decision_count`, `conversation_summary` preview (first 200 chars), and `resumed_from_chain` (array of prior session ids forming the lineage).

**Given** a session has a resume chain,
**When** it renders in the list,
**Then** a "↖ Resumed from" chip links to the parent session entry, and the chain is navigable both ways (parent entries show "↘ Resumed by N times" when children exist) — lineage is explorable within the tab.

**Given** I click a session entry,
**When** the detail pane opens,
**Then** it shows: full topic label, full `conversation_summary`, open questions list, topic manifest with finding counts, decision count with a "View decisions" link routing to the Decisions tab filtered to this session, context stats at save time, and two actions — "Resume" (triggers Story 5.5) and "View transcript" (opens a read-only transcript view in the main column, read-only is explicit: resuming is the interaction path for continuing work).

**Given** a session is currently active (the session I'm chatting in right now),
**When** it renders in the list,
**Then** a "Current" chip marks it, "Resume" is disabled with tooltip "You're already in this session", and live updates reflect new turns / new checkpoints without requiring tab re-open (TanStack Query invalidates on `checkpoint.saved` and on turn-completion events).

**Given** session data is large,
**When** the list renders,
**Then** pagination or virtualization kicks in past 50 entries — simplest implementation: show most recent 50 with a "Show older" control that loads the next page via `?cursor=<created_at>` — avoids unbounded response payloads for long-running projects.

**Given** I delete a session (if supported),
**When** the action runs,
**Then** scope for delete is explicitly out-of-scope for MVP — the tab is read + resume only. Soft-delete is a future enhancement; no delete surface exists in Story 5.6.

**Given** tests cover the tab,
**When** I run both suites,
**Then** tests verify: empty-state vs populated rendering, chronological ordering, resume-chain navigation both directions, detail pane content, current-session chip disables resume, TanStack Query invalidation on checkpoint-save + turn-completion events, pagination beyond 50 entries, and server endpoint shape.

---

### Story 5.7: Resume-fidelity probes + context-danger auto-checkpoint

As Downe, I want automated tests verifying that resume actually reconstructs state faithfully, and I want the agent to emergency-auto-checkpoint when context nears exhaustion so I never lose work, So that the session-continuity contract is enforced by tests and protected by a safety net.

**Acceptance Criteria:**

**Given** Story 5.5's resume protocol is implemented,
**When** resume-fidelity probes run in the test suite,
**Then** integration tests verify specific scenarios: (a) after resuming a session that logged a decision, the first question "what did we decide about X?" returns the correct decision with citation to the `decision_log` record; (b) after resuming a session with open questions, asking "what were we unsure about?" returns the open questions in priority order; (c) after resuming a session that cited a wiki page, the agent references the same page in the first relevant turn; (d) all three probes pass within the NFR13 15-second target under mocked-dependency conditions.

**Given** Story 5.1's context gauge has entered `emergency` zone (≥92% used),
**When** the next turn-completion fires,
**Then** the orchestrator proactively emits a strong checkpoint prompt inline: a `checkpoint_suggestion` variant with high-urgency styling ("Context nearly full — save a checkpoint now before we lose space") and a one-click "Save now" that runs Story 5.3's composition without the inline topic-label input (auto-generated label).

**Given** the user does not act on the emergency suggestion,
**When** the gauge would cross `CONTEXT_EMERGENCY_AUTO_SAVE_THRESHOLD` (default 95%, configurable via env — must be greater than the UX emergency threshold),
**Then** the server auto-invokes Story 5.3's checkpoint composition with `actor: "agent_auto"` and an auto-generated topic label ("Auto-saved — [first open question or research topic]"), writes the checkpoint via Story 5.2's writer, and fires an elevated toast ("Auto-checkpoint saved — context was nearly full. Session has been preserved.") using an amber-tinted variant (not an error, not a plain success — it's a safety notice).

**Given** auto-save runs,
**When** it completes,
**Then** an inline system `ChatMessage` confirms with a "View checkpoint" link and the agent's next response suggests starting a fresh session via resume ("I auto-saved because context was near the window. Want to start fresh and resume from this checkpoint?") — continuing in the same session is allowed but warned.

**Given** auto-save fails (Pinecone unavailable, Claude fails composition),
**When** the failure surfaces,
**Then** the server emits a high-severity error toast ("Auto-checkpoint failed — save manually or copy transcript"), logs at `error` level, and the conversation continues — the failure is never silent because data loss risk is real at 95%+ context usage.

**Given** the user has just returned from resume (Story 5.5),
**When** the next turn completes in the resumed session,
**Then** the context gauge reflects the resumed session's baseline (orientation briefing counts against the window), and if the prior session was auto-saved at 95%, the fresh session starts at a healthy baseline (maybe 15-25% used from orientation) — the resume → auto-save → resume loop is a viable continuous-work pattern.

**Given** tests cover the safety net,
**When** I run both suites,
**Then** tests verify: resume-fidelity probes for all three scenarios plus the NFR13 latency assertion, emergency zone triggers a strong inline prompt, auto-save fires at 95% without user action and does not fire below 95%, auto-save failure surfaces a loud error and preserves the session, and auto-save success toast + inline confirmation render correctly.

---
