---
stepsCompleted:
  - step-01-document-discovery
  - step-02-prd-analysis
  - step-03-epic-coverage-validation
  - step-04-ux-alignment
  - step-05-epic-quality-review
  - step-06-final-assessment
filesIncluded:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/ux-design-specification.md
  - _bmad-output/planning-artifacts/product-brief-business-planner-bmad.md
  - _bmad-output/planning-artifacts/product-brief-business-planner-bmad-distillate.md
---

# Implementation Readiness Assessment Report

**Date:** 2026-04-23
**Project:** business-planner-bmad

## Document Inventory

### PRD
- `_bmad-output/planning-artifacts/prd.md` (whole, 35 KB, modified 2026-04-16)

### Architecture
- `_bmad-output/planning-artifacts/architecture.md` (whole, 71 KB, modified 2026-04-22)

### Epics & Stories
- `_bmad-output/planning-artifacts/epics.md` (whole, 161 KB, modified 2026-04-23)

### UX Design
- `_bmad-output/planning-artifacts/ux-design-specification.md` (whole, 55 KB, modified 2026-04-17)
- `_bmad-output/planning-artifacts/ux-design-directions.html` (supplementary)

### Supporting Context
- `_bmad-output/planning-artifacts/product-brief-business-planner-bmad.md`
- `_bmad-output/planning-artifacts/product-brief-business-planner-bmad-distillate.md`

### Discovery Notes
- No duplicate whole/sharded conflicts found.
- All four required artifacts (PRD, Architecture, Epics, UX) present.
- User confirmed inventory on 2026-04-23.

## PRD Analysis

### Functional Requirements

**Chat & Conversation**
- **FR1:** User can send messages to the agent via a chat interface
- **FR2:** User can view agent responses streaming token-by-token in real time
- **FR3:** User can view the agent's thinking and reasoning process during response generation
- **FR4:** User can view tool calls the agent is making and their results as they occur
- **FR5:** User can expand and collapse agent thinking and tool call details
- **FR6:** User can view the full conversation history within a session

**Research & Evidence**
- **FR7:** Agent can perform web searches to research a topic and return sourced findings
- **FR8:** Agent can collect and store evidence with original source URLs for every research finding
- **FR9:** User can view the source citation for any research finding the agent presents
- **FR10:** Agent can perform multiple sequential research queries to build depth on a topic
- **FR11:** Agent can distinguish between findings with strong evidence and findings with weak or insufficient evidence, and communicate confidence levels

**Critical Thinking & Challenge**
- **FR12:** Skeptic sub-agent can independently challenge the primary agent's findings and recommendations with evidence-based pushback
- **FR13:** Skeptic sub-agent's challenges are displayed inline in the chat, visually distinct from the primary agent's responses
- **FR14:** Skeptic sub-agent can calibrate pushback intensity based on evidence strength and decision stakes
- **FR15:** Agent can enter steelmanning mode when the user disagrees — actively searching for evidence supporting the user's opposing position
- **FR16:** Agent can present both sides of a disagreement with supporting evidence and sources for each
- **FR17:** User can make a final decision after reviewing both sides of a challenged position
- **FR18:** Agent can preserve intelligence findings independently of user decisions — findings persist unchanged even when the user decides against them
- **FR19:** User can review past decisions and see what evidence existed on both sides at the time of the decision

**Knowledge Management**
- **FR20:** Agent can store research findings, evidence, and decision logs in a durable knowledge repository scoped to the current project
- **FR21:** Agent can retrieve relevant prior findings from the knowledge repository when a related topic is discussed
- **FR22:** User can ask questions about previously researched topics and receive informed answers with source citations
- **FR23:** Agent can identify when retrieved context may be stale or contradictory and flag it to the user
- **FR24:** Agent can store session checkpoint data to the knowledge repository for later resume
- **FR25:** Agent can identify and surface information gaps — "this data doesn't exist" is a valid finding, not a failure

**Methodology Wiki**
- **FR26:** Agent can propose new wiki articles based on research or work completed
- **FR27:** User can approve, reject, or modify agent-proposed wiki content
- **FR28:** User can direct the agent to create or modify specific wiki articles
- **FR29:** Agent can read and reference wiki articles to inform its behavior and responses
- **FR30:** Agent can suggest wiki improvements at natural stopping points based on work completed
- **FR31:** Wiki content persists across projects — available to the agent regardless of which project is active
- **FR32:** Agent can guide the user through an initial wiki bootstrapping experience on first launch

**Session Management**
- **FR33:** User can view a context health gauge showing remaining context capacity with graduated indication (not binary)
- **FR34:** User can trigger a session checkpoint to save current state
- **FR35:** Agent can resume a prior session by loading checkpoint data and relevant intelligence from the knowledge repository
- **FR36:** After resume, agent can answer questions about prior session topics, key decisions, and open questions without the user re-explaining context
- **FR37:** Agent can identify and suggest natural stopping points in the current work
- **FR38:** User can view a summary of what was saved during the last checkpoint

**Project Management**
- **FR39:** User can create a new project with a unique identifier
- **FR40:** User can switch between projects
- **FR41:** Each project maintains its own isolated intelligence store
- **FR42:** Agent can reference wiki-stored learnings from prior projects when working on a new project
- **FR43:** User can view approximate API cost information for the current session or project

**Total FRs: 43**

### Non-Functional Requirements

**Integration**
- **NFR1:** The application must handle Claude API errors (rate limits, timeouts, 5xx) gracefully — display a clear error message and allow retry without losing the current message draft or conversation state.
- **NFR2:** The application must handle Tavily API failures without crashing the agent's response flow — if a research query fails, the agent reports the failure and continues reasoning with available information.
- **NFR3:** The application must handle Pinecone API failures (write failures, retrieval timeouts) without data loss — writes must be confirmed before "checkpoint saved," retrieval failures must surface as explicit warnings.
- **NFR4:** All third-party API keys must be stored in environment variables (`.env` file), never committed to source control or exposed in the UI.
- **NFR5:** The application must function correctly when Tavily or Pinecone are temporarily unreachable — the chat remains usable for conversation, with degraded research or memory capabilities clearly indicated.

**Data Integrity & Reliability**
- **NFR6:** Intelligence data written to Pinecone must be confirmed via API response before a successful save is reported. No fire-and-forget writes.
- **NFR7:** Wiki files must be written atomically — a crash or error mid-write must not corrupt existing wiki content.
- **NFR8:** Decision logs that preserve intelligence on both sides of a disagreement must be stored as immutable records.
- **NFR9:** Session checkpoint data must include enough context to reconstruct a useful working summary — conversation summary, key decisions, open questions, and a manifest of stored intelligence topics.
- **NFR10:** The Postgres database must run in a Docker container with a named volume, ensuring data persists across container restarts.

**Performance**
- **NFR11:** UI interactions must remain responsive during agent processing — no UI thread blocking while waiting for API responses.
- **NFR12:** Streaming token display must begin within 3 seconds of sending a message (first token visible), excluding research-heavy queries.
- **NFR13:** Session resume should complete within 15 seconds with a loading indicator.
- **NFR14:** The chat UI must handle conversations of 200+ messages within a single session without significant rendering degradation.

**Total NFRs: 14**

### Additional Requirements / Constraints

- **Platform constraint:** Chrome-latest only, desktop-only, single user — no auth, no multitenancy, no responsive, no SEO, no offline.
- **Stack constraint:** React SPA frontend; Node/TypeScript backend; Claude Opus agent core; Pinecone for intelligence (projectId namespacing); Tavily (or equivalent) for web research; Postgres in Docker with named volume (NFR10).
- **Architectural decision gate (blocking):** Agent orchestration topology — coordinator vs. agent-team, skeptic context-sharing, tool-call flow — must be resolved in Architecture before development.
- **Wiki implementation for MVP:** Simplified start — markdown files in project; agent proposes in chat; user applies manually. Full approval-workflow UI deferred within Phase 1.
- **Session management for MVP:** Simplified start — user-triggered checkpoint with context health gauge; automatic stopping-point detection deferred within Phase 1.
- **Intelligence-preservation invariant:** Research findings and decision logs persist independently of user decisions — findings never erased or overwritten when user overrules.
- **Sourcing invariant:** 100% of research findings must include verifiable source URLs. No hallucinated data.
- **Transparent process display:** Agent thinking, tool calls in progress, tool results, and skeptic input must all be visible inline (expandable/collapsible).
- **Cost-visibility obligation:** User must be able to see approximate API cost per session or project (FR43).

### PRD Completeness Assessment

**Strengths:**
- Requirements are numbered, grouped by capability, and phrased as user-observable behaviors — good for traceability.
- FR/NFR coverage spans all four user journeys; journey-to-capability matrix is explicit.
- NFRs cover integration error handling, data integrity, and performance with measurable targets (3s first token, 15s resume, 200+ messages).
- MVP scope is clearly bounded with explicit deferrals called out (wiki UI, auto stopping-point detection).
- Supporting context (product brief + distillate) is present and aligned.

**Gaps / watch-outs to test against epics in Step 3:**
- **FR37** (natural stopping-point detection) is listed as a functional requirement but Phase 1 scope calls it "deferred within Phase 1." Epics must clarify whether it is in or out for MVP — it cannot be both.
- **FR43** (cost visibility) is not tied to an NFR for measurement granularity; epics should specify how cost is computed and at what granularity.
- **FR23** (stale/contradictory context flagging) has no specification of staleness signals or the algorithm — epics should either spec it or defer it.
- **Security/compliance NFRs are thin** — NFR4 covers secrets, but there is no explicit NFR for data-at-rest, log hygiene, or PII handling for research content. Acceptable for single-user personal tool; worth confirming.
- **No explicit NFR on agent-response quality** — the measurable outcomes table (>80% skeptic pushback referencing specific evidence, 100% source traceability) lives in Success Criteria rather than as testable NFRs. Epics should create verification stories.
- **No explicit NFR on observability / logging / cost instrumentation** — FR43 requires cost visibility but no NFR defines how cost data is captured or stored.
- **Wiki concurrency / conflict handling is undefined** — single-user tool, but atomic-write (NFR7) does not cover what happens if the agent and user both edit the same article.

Proceeding to epic coverage validation.

## Epic Coverage Validation

### Coverage Matrix

| FR  | PRD Requirement (summary) | Epic Coverage | Story Anchor(s) | Status |
|---|---|---|---|---|
| FR1 | Send messages via chat | Epic 1 | 1.8 | ✓ Covered |
| FR2 | Streaming token-by-token | Epic 1 | 1.7, 1.8 | ✓ Covered |
| FR3 | Visible agent thinking | Epic 1 | 1.10 | ✓ Covered |
| FR4 | Visible tool calls + results | Epic 1 shell + Epic 2 | 1.10, 2.3 | ✓ Covered (2 epics) |
| FR5 | Expand/collapse thinking & tool-call detail | Epic 1 | 1.10 | ✓ Covered |
| FR6 | Session conversation history | Epic 1 | 1.8, 1.9 | ✓ Covered |
| FR7 | Web research with sourced findings | Epic 2 | 2.3 | ✓ Covered |
| FR8 | Evidence + source URL persistence | Epic 2 | 2.2, 2.4 | ✓ Covered |
| FR9 | Source citation visible | Epic 2 | 2.4 | ✓ Covered |
| FR10 | Multiple sequential research queries | Epic 2 | 2.3, 3.5 | ✓ Covered |
| FR11 | Confidence levels communicated | Epic 2 | 2.5 | ✓ Covered |
| FR12 | Skeptic evidence-based pushback | Epic 3 | 3.1, 3.2 | ✓ Covered |
| FR13 | Inline skeptic display, visually distinct | Epic 3 | 3.2 | ✓ Covered |
| FR14 | Calibrated pushback intensity | Epic 3 | 3.2 | ✓ Covered |
| FR15 | Steelmanning on disagreement | Epic 3 | 3.4, 3.5 | ✓ Covered |
| FR16 | Both-sides presentation with sources | Epic 3 | 3.5 | ✓ Covered |
| FR17 | User-final-decision | Epic 3 | 3.6 | ✓ Covered |
| FR18 | Intelligence preserved regardless of decision | Epic 3 | 3.5, 3.6 | ✓ Covered |
| FR19 | Review past decisions with both sides | Epic 3 | 3.7 | ✓ Covered |
| FR20 | Durable project-scoped storage | Epic 2 | 2.1, 2.2 | ✓ Covered |
| FR21 | Retrieve relevant prior findings | Epic 2 | 2.6 | ✓ Covered |
| FR22 | Cited recall on user question | Epic 2 | 2.6, 2.7 | ✓ Covered |
| FR23 | Staleness / contradiction flagging | Epic 2 | 2.6 | ✓ Covered |
| FR24 | Checkpoint write to knowledge repo | Epic 5 | 5.2, 5.3 | ✓ Covered |
| FR25 | "No data is a finding" surfacing | Epic 2 | 2.3, 2.5, 3.5 | ✓ Covered (implicit) |
| FR26 | Agent proposes wiki articles | Epic 4 | 4.5 | ✓ Covered |
| FR27 | Approve / reject / modify proposals | Epic 4 | 4.5 | ✓ Covered |
| FR28 | User-directed wiki create/modify | Epic 4 | 4.4 (Obsidian), 4.5 (modify) | ⚠ Partial |
| FR29 | Wiki-influenced agent behavior | Epic 4 | 4.2, 4.3 | ✓ Covered |
| FR30 | Wiki suggestions at stopping points | Epic 4 | 4.5 | ✓ Covered |
| FR31 | Cross-project wiki persistence | Epic 4 | 4.2, 4.3 | ✓ Covered |
| FR32 | First-launch wiki bootstrap | Epic 4 | 4.6 | ✓ Covered |
| FR33 | Context health gauge (graduated) | Epic 5 | 5.1 | ✓ Covered |
| FR34 | User-triggered session checkpoint | Epic 5 | 5.3 | ✓ Covered |
| FR35 | Resume via checkpoint + retrieval | Epic 5 | 5.5 | ✓ Covered |
| FR36 | Post-resume Q&A without re-explaining | Epic 5 | 5.5, 5.7 | ✓ Covered |
| FR37 | Natural stopping-point detection | Epic 5 | 5.4 | ✓ Covered |
| FR38 | Last-checkpoint summary | Epic 5 | 5.3, 5.6 | ✓ Covered |
| FR39 | Create project with unique ID | Epic 1 | 1.5 | ✓ Covered |
| FR40 | Switch between projects | Epic 1 | 1.5 | ✓ Covered |
| FR41 | Isolated per-project intelligence | Epic 1 | 1.5 | ✓ Covered |
| FR42 | Cross-project wiki-learning reference | Epic 4 | 4.2, 4.3 | ✓ Covered |
| FR43 | Approximate API cost visibility | Epic 1 + extended | 1.11, 2.1, 2.3 | ⚠ Partial |

### Missing / Partial Requirements

**High Priority — worth addressing before implementation:**

- **FR28** (User can direct the agent to create or modify specific wiki articles)
  - Impact: PRD treats this as a first-class user action ("Downe directs the agent to update the methodology wiki on X"). Epic 4 covers the user-edits-in-Obsidian path (Story 4.4) and the "Modify" action on an agent-generated proposal (Story 4.5). However, a chat-initiated "please write/update an article about X" flow where the user is the proposer (not reacting to an agent proposal) does not have its own acceptance criteria in any story.
  - Recommendation: Add explicit acceptance criteria to Story 4.5 (or a new micro-story under Epic 4) covering `user_directed_wiki_request` intent — user prompt triggers agent to draft, propose via the same `wiki_proposal` variant, and approve/modify/reject. Could be a one-AC addition rather than a whole story.

- **FR43** (Approximate API cost visibility)
  - Impact: Architecture additional-requirement list specifies per-provider breakdown including **Pinecone ops** in `cost.jsonl`. Story 1.11 covers Claude; Story 2.1 covers Voyage; Story 2.3 covers Tavily. **Pinecone operation cost metering is not explicitly assigned to any story.** Pinecone Serverless is cheap on the free tier so financial risk is minimal, but the observability invariant is incomplete and the tooltip breakdown (Story 2.3 AC) won't surface Pinecone even if ops accumulate.
  - Recommendation: Add a Pinecone-ops cost-row emission AC to Story 2.1 (alongside Voyage cost-row emission in its current AC), or explicitly document the Pinecone-cost deferral as an accepted gap.

**Lower Priority — flagged but acceptable:**

- **FR25** (information-gap surfacing) is covered implicitly through Stories 2.3 (Tavily degraded), 2.5 (confidence badges), and 3.5 (null-evidence case in steelman). No single story has "agent explicitly says 'this data doesn't exist' is a valid finding" as an AC, but the behavior is inherent to the prompt design. Acceptable as long as the orchestrator system prompt (Story 1.7) is written to model this.

- **FR11 confidence-level communication** is scoped to cited claims via `ConfidenceBadge` (Story 2.5). Non-cited agent synthesis claims are addressed via an optional `{conf: low}` inline marker (2.5 AC #4). Sparing use is acceptable but epics should track whether this proves sufficient in practice.

### Coverage Statistics

- **Total PRD FRs:** 43
- **FRs fully covered in epics:** 41 (95.3%)
- **FRs partially covered (need AC refinement):** 2 (FR28, FR43)
- **FRs not covered:** 0 (0%)
- **Overall coverage:** 100% at the epic-mapping level; 95% at the story-AC level.

### NFR Coverage Summary (per epics document)

| NFR | Epic | Status |
|---|---|---|
| NFR1 — Claude error handling | Epic 1 (1.7, 1.12) | ✓ Covered |
| NFR2 — Tavily failure handling | Epic 2 (2.3, 2.8) | ✓ Covered |
| NFR3 — Pinecone failure / no data loss | Epic 2 (2.1, 2.8) | ✓ Covered |
| NFR4 — Env-var secrets | Epic 1 (1.1, 1.3) | ✓ Covered |
| NFR5 — Degraded-mode framework | Epic 1 (1.12) + Epic 2 (2.8) | ✓ Covered |
| NFR6 — Confirmed Pinecone writes | Epic 2 (2.1, 2.2) | ✓ Covered |
| NFR7 — Atomic wiki writes | Epic 4 (4.1) | ✓ Covered |
| NFR8 — Immutable decision logs | Epic 3 (3.6) | ✓ Covered |
| NFR9 — Checkpoint content sufficient | Epic 5 (5.2) | ✓ Covered |
| NFR10 — Postgres Docker named volume | Epic 1 (1.1 stub; Phase 2) | ⚠ Stub only — deferred to Phase 2 |
| NFR11 — UI responsive during processing | Epic 1 (1.4, 1.7, 1.8) | ✓ Covered |
| NFR12 — First-token <3s | Epic 1 (1.7, 1.8) | ✓ Covered |
| NFR13 — Resume <15s | Epic 5 (5.5, 5.7) | ✓ Covered |
| NFR14 — 200+ message chat rendering | Epic 1 (1.9, react-virtuoso) | ✓ Covered |

**Total NFRs:** 14 — all covered in epics (NFR10 is a Phase 2 stub, which the epics explicitly acknowledge as an accepted deferral).

Proceeding to UX alignment validation.

## UX Alignment Assessment

### UX Document Status

**Document:** [ux-design-specification.md](../../_bmad-output/planning-artifacts/ux-design-specification.md) (55 KB, modified 2026-04-17).

**Scope:**
- 39 UX Design Requirements (UX-DR1–UX-DR39).
- Design System: dark-mode-only Tailwind + shadcn/ui; amber skeptic accent; cyan citation accent; confidence color scale; graduated context-health colors (green → yellow → red).
- Layout: Direction B (overlay sidebar 320 px + 32 px bottom status bar) — explicitly chosen among three evaluated directions.
- Custom components: `ChatMessage` (6 variants), `ToolCallRow`, `CitationTag`, `ConfidenceBadge`, `ContextHealthGauge`, `CheckpointButton`, `StreamingTokenDisplay`, `SkepticPanel`, `SessionControls`, `ProjectSwitcher`, `CostMeter`.
- Interaction patterns (expand/collapse thinking; inline skeptic; citation hover; confidence interpretation).
- Feedback patterns (toasts, progress, graduated degradation).
- Empty / loading / error states for each primary surface.
- Navigation and button-hierarchy rules.
- Accessibility: keyboard-first, high-contrast dark palette; screen-reader and full WCAG 2.1 AA conformance documented as out of MVP scope (single-user personal tool).

**Supplementary artifact:** [ux-design-directions.html](../../_bmad-output/planning-artifacts/ux-design-directions.html) — three layout directions; Direction B was selected in the UX spec.

### UX ↔ PRD Alignment

**All 43 FRs have a UX surface traced to a named component or interaction pattern.**

| PRD area | UX coverage | Status |
|---|---|---|
| FR1–FR6 Chat & conversation | `ChatView` + `ChatInput` + `ChatMessage` variants + `StreamingTokenDisplay` + `ThinkingBlock`/`ToolCallBlock` expand/collapse + virtualized history | ✓ Covered |
| FR7–FR11 Research & evidence | `ToolCallRow` (research tool) + `CitationTag` + `ConfidenceBadge` (strong/moderate/weak/insufficient) | ✓ Covered |
| FR12–FR19 Skeptic & decisions | `SkepticPanel` (amber-tinted, inline-distinct per FR13) + steelman dual-column view + decision-log review surface | ✓ Covered |
| FR20–FR25 Knowledge management | Citation hover → source URL; staleness marker on recalled findings; no-data empty state pattern | ✓ Covered |
| FR26–FR32 Wiki | Chat-embedded `wiki_proposal` variant with Approve/Modify/Reject; Obsidian as primary editing surface (explicit UX non-goal: no in-app wiki editor) | ✓ Covered |
| FR33–FR38 Session | `ContextHealthGauge` with graduated color + %; `CheckpointButton` in bottom status bar; resume loading state; checkpoint-summary surface | ✓ Covered |
| FR39–FR43 Project | `ProjectSwitcher` (overlay sidebar top) + `CostMeter` (bottom status bar with tooltip breakdown) | ✓ Covered |

**NFR alignment:**
- **NFR11** (UI responsive during processing): streaming-token rendering and skeleton states defined.
- **NFR12** (first-token <3 s): `StreamingTokenDisplay` renders on first token rather than waiting for a completed response.
- **NFR13** (resume <15 s): explicit resume loading state with determinate progress indicator.
- **NFR14** (200+ messages): virtualized history (react-virtuoso) specified in UX spec and architecture.

**Deliberate UX non-goals (documented and aligned with PRD MVP cuts):**
- Full WCAG 2.1 AA certification (keyboard + high-contrast shipped; screen-reader deferred).
- In-app wiki editor (Obsidian fills this role).
- Responsive / mobile layout (Chrome desktop only).
- Light mode (dark-only; reinforced by user-memory preference for dark mode).

### UX ↔ Architecture Alignment

**Component-to-code mapping is consistent.** Every UX-named component maps to a feature folder under `apps/web/src/features/`:

| UX component | Architecture location |
|---|---|
| `ChatView` / `ChatInput` / `ChatMessage` / `StreamingTokenDisplay` / `ThinkingBlock` / `ToolCallBlock` | `apps/web/src/features/Chat/*` |
| `CitationTag` / `ConfidenceBadge` / sources list | `apps/web/src/features/Sources/*` |
| `SkepticPanel` | `apps/web/src/features/SkepticPanel/*` |
| `SessionControls` / `CheckpointButton` | `apps/web/src/features/SessionControls/*` |
| `ContextHealthGauge` | `apps/web/src/features/ContextGauge/*` |
| `ProjectSwitcher` | `apps/web/src/features/ProjectSwitcher/*` |
| `CostMeter` | `apps/web/src/features/CostMeter/*` |
| shadcn primitives (Sheet / Tabs / Toast / Progress / Badge / Dialog) | `apps/web/src/components/ui/*` |

**Consistent architectural decisions backing the UX:**
- Dark-only Tailwind matches architecture coherence table (CSS-vars themed shadcn, dark-only simplifies config).
- React 19 + react-virtuoso + react-markdown + rehype-highlight all validated compatible in the architecture coherence matrix — directly supports `ChatView` virtualized history and streaming markdown render.
- Zustand (UI / streaming / ephemeral) + TanStack Query (persisted server data) split matches the UX spec's separation of streaming token state from stored messages and findings.
- SSE event taxonomy (`thinking.*`, `tool.*`, `subagent.*`, `message.token`, `response.complete`, `cost.update`, `context.update`) covers every UX-spec streaming interaction — the `ToolCallRow` lifecycle, `SkepticPanel` challenge stream, and both meters (context + cost) have dedicated event channels.
- snake_case wire format + `packages/shared` types ensure the UX-specified component props (confidence, record_type, cost breakdown) land as typed data without client-side casing drift.

**Explicit UX/architecture agreement on simplifications:**
- No `WikiEditor` feature folder — enforced by omission in both docs; Obsidian is the editor.
- No screen-reader ARIA scaffolding beyond shadcn defaults.
- No auto-stopping-point UI affordance beyond the standard `CheckpointButton` (auto-detect is Phase 2).

### Warnings & Watch-Outs

**No critical misalignments detected.** UX specification, PRD, architecture, and epics converge.

Minor items worth tracking during implementation (not blockers):

1. **`StreamingTokenDisplay` + react-markdown + rehype-highlight token-level re-render cost.** UX spec mandates streaming token-by-token with live markdown render; architecture accepts this. At 50+ tokens/sec over 2000-token answers, incremental markdown parsing can spike CPU. Implementation should measure and, if needed, throttle markdown re-parse to a reasonable interval (e.g., 60–100 ms) while keeping raw-text display frame-tight.

2. **Skeptic amber accent vs. shadcn destructive/warning palette.** UX spec defines a custom amber token; architecture ships shadcn defaults. Ensure the amber is registered as a Tailwind CSS variable in the theme rather than ad-hoc per-component hex values — otherwise drift is inevitable. This is implementation hygiene, already implied by the "theme via CSS vars" architecture note.

3. **`ContextHealthGauge` color transitions.** UX spec defines green→yellow→red thresholds; architecture defines `contextGauge.ts` threshold logic. The thresholds must agree (e.g., if UX spec says yellow at 60% but `contextGauge.ts` picks 70%, the meter changes color at the wrong moment). Story-level AC should pin both thresholds in one place — `packages/shared` is the natural home; cross-reference the shared constant from both UX tests and backend threshold logic.

4. **Direction B overlay sidebar at 320 px on narrow screens.** UX spec assumes desktop Chrome; no responsive design by constraint. At 1280 px the overlay + main chat is comfortable; at 1024 px the overlay covers more content. Accept as non-issue (single-user, user controls window) but flag for implementation to confirm at smallest expected window size.

5. **Accessibility deferral is explicit but worth re-confirming for keyboard flow.** Screen-reader deferred; keyboard-first retained. The `SkepticPanel`, `ChatInput`, and `CheckpointButton` all need verified keyboard-reachable focus traps and shortcuts. Story 1.8 (ChatInput) and Story 3.2 (SkepticPanel) should include a keyboard-nav AC.

### UX Readiness Assessment

**Overall status:** UX SPECIFICATION IS READY TO IMPLEMENT.

- 39 UX-DRs present with concrete components, states, and interaction patterns.
- Complete UX ↔ PRD mapping; every FR has a UX surface.
- Complete UX ↔ Architecture mapping; every named UX component corresponds to a feature folder and a typed event stream.
- No UX requirement lacks architectural support.
- Non-goals explicitly documented and aligned across PRD + UX + architecture.

Proceeding to epic quality review.

## Epic Quality Review

Applied `create-epics-and-stories` standards across all 5 epics and 41 stories.

### Summary

| Dimension | Result |
|---|---|
| Epics deliver user value | ✅ All 5 epic goals are user-outcome framed |
| Epic independence (no forward deps) | ✅ Epic N depends only on Epics 1..N−1 |
| Story dependencies (no forward refs) | ✅ All within-epic dependencies point backward |
| Story sizing | ✅ Stories sized to implementable increments |
| AC format (Given / When / Then) | ✅ Consistent BDD structure throughout |
| AC completeness (happy / error / tests) | ✅ Every story includes explicit test AC |
| Database/entity creation timing | ✅ Created when first needed, not upfront |
| Starter template handling | ✅ Story 1.1 is the scaffold anchor per architecture |

### Epic-Level Assessment

**Epic 1 — Foundation & Project-Scoped Chat.** User-value framed ("usable personal AI chat workbench by end of Epic 1"). Stories 1.1–1.3 are infrastructure-heavy but this is the explicit starter-template pattern architecture mandates; without them no later story is implementable. Story 1.5 ships a functional `ProjectSwitcher` and project-scoped Pinecone namespace — legitimate user-visible value, not just plumbing. Epic is self-contained: a user can install, create a project, and hold a streaming Claude conversation at end of Epic 1.

**Epic 2 — Web Research & Evidence-Backed Intelligence.** Strong user-value framing ("Perplexity with project memory"). Depends on Epic 1 only (orchestrator, SSE, tool framework, cost meter). Story 2.1 is technical foundation but binds tightly to Stories 2.2–2.3 which ship user-facing behavior in the same epic. Each story gates a distinct user capability: embedding, writing, researching, citing, confidence, recall, briefs, degraded modes. No forward references.

**Epic 3 — Adversarial Skeptic & Decision Accountability.** User-value framed ("enforces critical-thinking discipline"). Depends on Epic 2 (evidence bundle composition requires research pipeline). Story 3.1 introduces the bundle-pass contract as schema v1 with explicit extension rules — a deliberate invariant to protect future epics. Stories 3.4–3.6 introduce an intent-classifier Claude call that becomes a shared utility in Stories 3.6 and 4.7 — used as a backward dependency, not a forward one.

**Epic 4 — Methodology Wiki (Karpathy + Obsidian).** User-value framed ("durable cross-project methodology"). Depends on Epic 1 (orchestrator, file infrastructure) + Epic 2 (Pinecone client, retrieval). Story 4.1 enforces the sole-writer choke point as a test-verified module boundary — architecturally strong. Phases A (bootstrap) / B (collaborative) / C (autonomous) cleanly separate in Stories 4.6 / 4.5 / 4.7. No forward dependencies; Phase C can be deferred without breaking earlier stories.

**Epic 5 — Session Continuity.** User-value framed ("multi-day workflow recovery"). Depends on Epic 2 writer pattern. `decision_count` in the checkpoint schema references Epic 3 output but gracefully zero-valued if Epic 3 skipped — Epic 5 is independently shippable. NFR13 (<15s resume) has explicit latency AC and integration-test budget in Story 5.5 and verification probe in Story 5.7.

### Story Quality Findings by Severity

#### 🔴 Critical Violations

**None.** No technical-milestone epics; no forward dependencies; no unsized or undefined stories.

#### 🟠 Major Issues

1. **Sidebar tab inventory is inconsistent across UX spec, Epic 1, and Epic 3.**
   - UX-DR11 defines three tabs: **Wiki | Projects | Decisions**.
   - Epic 1 Story 1.4 scaffolds three tabs: **Intelligence | Wiki | History**.
   - Epic 2 Story 2.7 populates the "Intelligence" tab.
   - Epic 3 Story 3.3 adds a fourth "Skeptic" tab between Intelligence and Wiki.
   - Epic 3 Story 3.7 populates a "Decisions" tab (assumed to exist from Epic 1, but Story 1.4 does not scaffold it).
   - Epic 5 Story 5.6 uses "History" tab.
   
   **Impact:** Implementation risk — without reconciliation, a developer will either follow UX spec (and miss Intelligence/Skeptic/History surfaces) or follow Epic 1 (and miss Projects/Decisions from UX spec).
   
   **Recommendation:** Before Epic 1 Story 1.4 starts, update Story 1.4 AC to scaffold the final tab inventory. Best fit: **Intelligence | Skeptic | Wiki | Decisions | History** (5 tabs) — covering both UX-named surfaces (Wiki, Decisions) and epics-named surfaces (Intelligence, Skeptic, History). Projects is a `ProjectSwitcher` dropdown per UX-DR35, not a tab, so it doesn't need a tab slot. Update UX-DR11 in parallel or accept that the epics inventory supersedes.

2. **Intent classifier (Story 3.4) adds latency to every turn with prior skeptic state.**
   - The classifier is a "short, cheap Claude call" that runs pre-turn to detect disagreement vs. agreement vs. clarification.
   - Stacks onto NFR12's 3-second first-token target: classifier roundtrip (~800–1500ms) runs before the main orchestrator invocation.
   
   **Impact:** Under typical conditions, NFR12 (<3s first token) is at risk on turns where the classifier runs. The classifier only runs when the prior turn contained a skeptic challenge, so not every turn — but steelman-heavy sessions will frequently incur this latency.
   
   **Recommendation:** Story 3.4 should include an AC specifying a latency budget for the classifier (e.g., ≤1000ms p95) and a fallback to "skip classification on timeout" that assumes `neutral` rather than blocking the turn. Alternatively, run the classifier in parallel with the first tokens of the orchestrator and cancel one path once intent is known. Flag for Story 3.4's refinement during implementation.

#### 🟡 Minor Concerns

1. **Story 5.7's emergency auto-checkpoint may exceed PRD's "user-triggered checkpoint" MVP simplification.** PRD says: "Session management for MVP: simplified start — user-triggered checkpoint... automatic stopping-point detection deferred." Story 5.4 (auto-suggestion) and Story 5.7 (auto-save at 95% context) are technically automatic. However, the auto-save is a safety net against data loss, which is distinct in intent from the deferred "auto-stopping-point detection." Acceptable but worth flagging in Story 5.7's AC — add an explicit note that the 95% auto-save is a data-loss safeguard, not the deferred auto-stopping-point feature.

2. **Story 1.2 `AgentEvent` union fields use mixed conventions.** The union defines `message.delta`, `tool_call.start`, `tool_call.end`, `thinking.delta`, `cost.update`, `context.update`, etc. Architecture says event names are `namespace.action` with dot-separated segments, but `tool_call` has an embedded underscore. Minor stylistic inconsistency — the architecture explicitly uses `tool.start` / `tool.end` in one place and `tool_call.start` elsewhere. Reconcile during Story 1.2 implementation. No blocker.

3. **Story 4.7's "undo autonomous write" natural-language path requires git-diff or log-replay.** AC says "invokes `writer.writePage` with the prior content (loaded from git if available, otherwise from `wiki/log.md`'s recorded previous state)." The `log.md` format (Story 4.1) is a markdown bullet list and does not include previous file content — it's not a diff format. If git is not the mechanism, the rollback AC cannot be satisfied. Recommendation: either (a) require the git-backed path and assume the repo is always a working git tree (safe given the architecture commits `wiki/` to git by design), or (b) extend `log.md` or `writer.ts` to capture a before-state snapshot when autonomous writes happen. Flag for Story 4.7 refinement.

4. **Story 2.3 Tavily-failure UX path deferred to Story 2.8.** Story 2.3 says "flagged via a natural-language degraded-mode note (Story 2.8 wires the banner)." The natural-language note is user-visible; the banner is the secondary signal. This is a defensible split (Story 2.3 ships the inline note; Story 2.8 ships the cross-dependency banner pattern). Minor concern: ensure Story 2.3's orchestrator prompt is updated to emit the natural-language note even if Story 2.8 has not yet landed.

5. **Stories 1.1 / 1.2 / 1.3 are all infrastructure stories with no end-user observable behavior.** Three consecutive setup stories is a lot before the first user-visible surface (Story 1.4 is the first UI surface). Acceptable for a greenfield project with architecture-mandated starter-template pattern, but worth noting: the first usable demo lands at Story 1.8, not Story 1.1.

6. **Story 3.4 classifier is a Claude call not a rule-based heuristic.** The classifier is a real model call, meaning it incurs cost and latency. A regex-based "pushback detector" would be cheaper but less accurate. Acceptable tradeoff, but worth confirming during Story 3.4 that the classifier genuinely warrants the model call (vs. rule-based detection of "I don't think", "actually", "disagree", etc.). Could be a cost-optimization opportunity.

7. **Minimal Pinecone bootstrap (Story 1.5) precedes full Pinecone client (Story 2.1).** Story 1.5 must ensure index existence + namespace creation; Story 2.1 formalizes typed helpers. This is not a forward reference (Story 1.5 ships its own minimal path), but the boundary between "minimal bootstrap" and "full typed client" should be articulated in Story 1.5's AC to prevent accidental duplication or divergence. Low risk.

### Acceptance Criteria Quality

Representative AC analysis across 10 spot-sampled stories (1.1, 1.5, 1.7, 2.1, 2.4, 3.2, 3.6, 4.1, 4.5, 5.5):

- **All 10 use Given / When / Then format.** ✓
- **All 10 include explicit test AC.** ✓ (most have a final "Given tests cover…" AC listing specific test scenarios)
- **All 10 cover error paths.** ✓ (retry / fallback / failure toast / malformed input / degraded mode)
- **All 10 have measurable outcomes** (token counts, latencies, file structure, event shapes, UI state assertions). ✓
- **No AC uses vague phrasing** ("user can login") — specifics throughout. ✓

### Best-Practices Compliance Checklist (per epic)

| Epic | User value | Independence | Story sizing | No forward deps | DB timing | AC clarity | FR traceability |
|---|---|---|---|---|---|---|---|
| Epic 1 | ✅ | ✅ | ✅ | ✅ | ✅ (Postgres deferred, Pinecone on-demand) | ✅ | ✅ |
| Epic 2 | ✅ | ✅ | ✅ | ✅ | ✅ (record types added as needed) | ✅ | ✅ |
| Epic 3 | ✅ | ✅ | ✅ | ✅ | ✅ (`decision_log` added here) | ✅ | ✅ |
| Epic 4 | ✅ | ✅ | ✅ | ✅ | ✅ (wiki scaffold in 4.1; `__wiki__` namespace in 4.3) | ✅ | ✅ |
| Epic 5 | ✅ | ✅ | ✅ | ✅ | ✅ (`session_checkpoint` added here) | ✅ | ✅ |

### Remediation Summary

**Before implementation starts:**
1. Reconcile sidebar tab inventory across UX spec ↔ Epic 1 Story 1.4 ↔ Epic 3 Story 3.3 ↔ Epic 3 Story 3.7. **(Major)**
2. Add latency budget + timeout-fallback AC to Story 3.4's intent classifier. **(Major)**
3. Close the FR28 (user-directed wiki request) AC gap in Story 4.5 — identified in Step 3. **(Major)**
4. Assign Pinecone-ops cost metering to Story 2.1 or explicitly accept the FR43 partial coverage — identified in Step 3. **(Minor → decide)**

**During implementation (refinement as stories begin):**
5. Clarify Story 4.7's autonomous-write undo mechanism (git-backed vs. log-captured snapshot).
6. Confirm Story 3.4 classifier as Claude-call vs. rule-based detection.
7. Align `AgentEvent` naming convention (`tool_call.*` vs. `tool.*`) in Story 1.2.
8. Add an AC to Story 5.7 explicitly framing the 95% auto-save as a data-loss safeguard distinct from the deferred auto-stopping-point feature.

**Acceptable as-is:**
- Three consecutive infrastructure stories at Epic 1 start — architecturally required starter-template pattern.
- Story 5.4 vs. Story 4.5 stopping-point-detector duplication — intentional separation of concerns documented in both.

### Epic Quality Assessment

**Overall status:** EPICS ARE READY TO IMPLEMENT with 2 Major items to reconcile before Story 1.4 starts and 7 Minor items to refine during implementation.

**Confidence level:** High. The 41 stories across 5 epics form a cohesive implementation plan. User-value framing holds throughout, forward dependencies are absent, AC quality is consistently high, and the starter-template pattern is correctly anchored in Story 1.1.

Proceeding to final assessment.

## Summary and Recommendations

### Overall Readiness Status

**READY TO IMPLEMENT** — with a short remediation list to address before Epic 1 Story 1.4 starts.

All four planning artifacts (PRD, Architecture, Epics, UX Design) are present, internally consistent, and mutually aligned. Every PRD FR traces to at least one epic and at least one UX surface; every UX-named component maps to a feature folder in the architecture; all architectural decisions have rationale, version, and rejected alternatives. No critical violations were identified.

### Readiness Scorecard

| Dimension | Result |
|---|---|
| Document inventory complete | ✅ 4/4 artifacts present |
| PRD completeness | ✅ 43 FRs + 14 NFRs, numbered, grouped, testable |
| Epic → FR coverage | ✅ 100% epic-level, 95.3% story-AC level |
| Epic → NFR coverage | ✅ 14/14 (NFR10 deferred to Phase 2 explicitly) |
| UX → PRD alignment | ✅ Every FR has a UX surface |
| UX → Architecture alignment | ✅ Every UX component has a code location |
| Architectural decisions resolved | ✅ Both PRD-flagged blockers closed (orchestration, topology) |
| Epic independence (no forward deps) | ✅ All 5 epics |
| Story quality (AC format + completeness) | ✅ All 41 stories |
| Starter-template pattern | ✅ Anchored in Story 1.1 |

### Critical Issues Requiring Immediate Action

**None.** No issue is severe enough to block implementation outright.

### Issues to Address Before Epic 1 Story 1.4 Starts (Major)

1. **Sidebar tab inventory inconsistency** across UX-DR11 (Wiki | Projects | Decisions), Epic 1 Story 1.4 (Intelligence | Wiki | History), Epic 3 Story 3.3 (adds Skeptic), and Epic 3 Story 3.7 (Decisions). Reconcile to a single canonical inventory — suggested: **Intelligence | Skeptic | Wiki | Decisions | History** (5 tabs). `ProjectSwitcher` is a dropdown per UX-DR35, not a tab. Update Story 1.4 AC accordingly.

2. **Story 3.4 intent classifier latency budget.** The per-turn classifier Claude call stacks onto NFR12's 3-second first-token target. Add an AC specifying ≤1000ms p95 latency budget and a timeout-fallback that assumes `neutral` intent rather than blocking the turn.

3. **FR28 (user-directed wiki request) story-AC gap.** Epic 4 covers the Obsidian-edit path (Story 4.4) and the Modify-on-agent-proposal path (Story 4.5), but a chat-initiated "please write an article about X" request has no explicit AC. Add one AC to Story 4.5 or a new micro-story under Epic 4.

4. **FR43 Pinecone-ops cost metering assignment.** Epic 1 meters Claude (Story 1.11); Story 2.1 meters Voyage; Story 2.3 meters Tavily. Pinecone operation costs are specified in the architecture but not assigned to any story. Add a Pinecone cost-row emission AC to Story 2.1, or document the deferral explicitly.

### Issues to Refine During Implementation (Minor)

5. **Story 4.7 autonomous-write undo mechanism.** The AC references "prior content from git if available, otherwise from `wiki/log.md`" but `log.md` is not a diff format. Either commit to the git-backed path explicitly, or extend the writer/log to capture before-state snapshots.

6. **Story 3.4 classifier: Claude call vs. rule-based.** Confirm during implementation whether the classifier genuinely needs a model call or a regex-based pushback detector would suffice (cheaper, faster).

7. **Story 1.2 `AgentEvent` naming convention.** Reconcile `tool_call.start` (epics) vs. `tool.start` (architecture examples) to a single form.

8. **Story 5.7 emergency auto-checkpoint framing.** Add an AC explicitly framing the 95% auto-save as a data-loss safeguard distinct from the PRD-deferred auto-stopping-point detection feature.

9. **Story 2.3 Tavily degraded-mode inline note.** Ensure the orchestrator prompt emits a natural-language note even if Story 2.8's banner has not yet landed.

10. **Story 1.5 minimal Pinecone bootstrap.** Clarify the boundary between Story 1.5's on-demand index/namespace creation and Story 2.1's typed-helper client to prevent duplication.

11. **UX-DR1–UX-DR39 refinement opportunities** (from Step 4):
    - `StreamingTokenDisplay` + react-markdown re-render cost at 50+ tok/s — measure and throttle markdown parse if needed.
    - Amber skeptic accent as a Tailwind CSS variable, not ad-hoc hex.
    - `ContextHealthGauge` color thresholds pinned in `packages/shared` so UI and backend agree.
    - Keyboard focus-trap AC added to Story 1.8 (ChatInput) and Story 3.2 (SkepticPanel).

### Acceptable Deferrals (Documented)

- **NFR10 Postgres Docker volume** — Phase 2.
- **Wiki approval-workflow UI beyond inline proposals** — Phase 2; Obsidian fills the editor role.
- **Automatic stopping-point detection as a general feature** — Phase 2; MVP ships user-triggered checkpoints + agent-suggested stopping points (Story 5.4) + 95%-context safety auto-save (Story 5.7).
- **WCAG 2.1 AA formal compliance** — deferred; keyboard-first and high-contrast dark palette are retained.
- **Responsive / mobile layouts** — explicit single-user Chrome desktop constraint.
- **External APM (Sentry, Datadog, analytics)** — observability is 5 in-product log streams.
- **Cross-project intelligence queries** — Phase 2; wiki provides cross-project methodology.
- **Post-plan accountability layer** — Phase 2.

### Recommended Next Steps

1. **Pick the canonical sidebar tab inventory** (suggested 5 tabs: Intelligence | Skeptic | Wiki | Decisions | History) and update Story 1.4 AC + UX-DR11 in the UX spec. ~15 minutes.
2. **Add the Story 3.4 classifier latency budget AC** (≤1000ms p95 + neutral fallback on timeout). ~5 minutes.
3. **Add the FR28 user-directed wiki request AC** to Story 4.5. ~5 minutes.
4. **Decide on the FR43 Pinecone-cost path** — add AC to Story 2.1 or explicitly accept deferral in the epics doc. ~5 minutes.
5. **Begin Epic 1 Story 1.1 (monorepo scaffold).** Starter-template anchor is unambiguous; architecture specifies the full directory tree and initialization commands.
6. **During Story 1.2 implementation**, pick the event-naming convention (`tool_call.*` vs. `tool.*`) and update both documents.
7. **During Story 3.4 implementation**, consider the rule-based-classifier alternative before committing to the Claude-call path.
8. **During Story 4.7 implementation**, commit to the git-backed autonomous-write undo path.

### Final Note

This assessment identified **0 critical**, **4 major**, and **7 minor** issues across PRD completeness, epic coverage, UX alignment, and epic quality dimensions — a combined total of **11** findings. None are severe enough to block implementation outright. The 4 major items are narrowly scoped edits to the planning artifacts that can be resolved in under 30 minutes total; address them before Epic 1 Story 1.4 begins.

The artifacts are coherent, complete, and aligned. Implementation can begin at Epic 1 Story 1.1 (monorepo scaffold) immediately once the sidebar tab inventory (Issue #1) is reconciled, since Story 1.1 does not depend on Story 1.4's UI decisions.

---

**Assessed by:** Claude Opus 4.7 (bmad-check-implementation-readiness skill)
**Assessment date:** 2026-04-23
**Project:** business-planner-bmad
**Inputs:** PRD, Architecture, Epics, UX Design Specification + supporting product briefs



