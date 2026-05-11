# Business-Planning Research Agent

A personal-use, hypothesis-driven research agent that helps the user build, critique, and refine a business strategy as a **web of interconnected Strategic Frameworks**. Every claim is sourced; every strategic position is a testable hypothesis backed by claims; the "business plan" itself is a render-time projection over the framework web.

## Language

### Evidence layer (lives in OpenBrain)

**Source**:
An external piece of content that evidence is drawn from. Has a typed `kind` discriminator (`web`, `user-pdf`, `user-text`, `user-dataset`, `api`) and a `trustScore` (the **user's** meta-assessment of the source itself — peer-reviewed paper > Twitter thread; **nullable**, where `null` is a first-class value meaning "unrated by the user" and is structurally distinct from any rated value including `0.5` — see [ADR-0028](docs/adr/0028-trust-score-is-nullable-unrated-is-distinct-from-rated.md)). The `kind` discriminator is purely _structural_ — it selects the ingestion/parsing code path (web page / PDF / prose / structured data / live API) and carries no provenance signal. `user-dataset` covers any structured data the user provides — CSV / Excel / JSON — _irrespective of who produced the data_. Primary research the user collected themselves and a published dataset they downloaded both share `kind: 'user-dataset'`; provenance and trustworthiness are captured separately in `trustScore`. Web Sources move through a two-tier lifecycle: `candidate` (snippet-only, captured from a search hit) → `full` (full content fetched, parsed, content-hashed, stored). Promotion to `full` is triggered automatically at the OpenBrain write boundary when a **Claim** is first written citing the Source — see [ADR-0008](docs/adr/0008-source-ingestion-two-tier.md). The `trustScore` carries through the promotion unchanged, so a Researcher-captured candidate with `trustScore: null` becomes a `full` row also with `trustScore: null` until the user rates it. Non-web Sources are always `full` at ingestion; metadata (publication, URL, retrievedAt) is filled in by the Researcher via conversational follow-up rather than a structured upload form.
_Avoid_: Reference, document. For `trustScore`, also avoid treating `null` and `0.5` as interchangeable.

**Claim**:
A directly-cited factual statement (e.g. "In a 2024 Gartner survey, 47% of B2B SaaS buyers evaluated 5+ vendors"). Has 1+ **Citations** to **Sources**. Directly verifiable; not under test. Its own aggregate root.
_Avoid_: Fact, finding, assertion, statement.

**Citation**:
A reified association connecting a **Claim** to a **Source**, carrying its own `confidence`, `span`, `quote`, `retrievedAt`, and `status`. Its own aggregate; lifecycle-bound (can be revised or invalidated when the source is retracted). For Citations backing numeric Claims (those supporting a **Quantitative Hypothesis**), also carries `extractedValue: { value: number, unit: string, basis: string }` — **exactly one extracted numeric value per Citation**. Multi-number Sources (e.g. "$14.2B in 2023, $19.1B by 2027") produce multiple Citations, one per relevant number, never one Citation with several numbers in its `quote`. See [ADR-0014](docs/adr/0014-numeric-disambiguation-and-extraction.md).
_Avoid_: Reference, link, source-pointer.

### Strategy layer (lives in OpenBrain)

**Strategy**:
A distinct strategic exploration within the single business this repo is hosting — e.g. "Enterprise Mid-Market Pivot" vs "SMB Self-Serve". The unit of scoping for all strategy-laden aggregates (**Hypothesis**, **Strategic Framework**, **Business Plan**, **Marketing Plan**, **Financial Projection**, **Critic Attempt**, **Objection**). Evidence aggregates (**Source**, **Claim**, **Citation**) are _not_ Strategy-scoped — a Gartner statistic is true regardless of which Strategy is testing it. One repo clone / one OpenBrain instance hosts one business; multiple **Strategies** live within it. Pivots happen via **Strategy archive + create-new** (`/strategy archive <name>`, then `/strategy create <new-name>`); the new Strategy starts with **a clean slate** — no Hypotheses, frameworks, or Critic Attempts carry over from the archived one. The archived Strategy stays fully queryable as a read-only historical record. Switching businesses is done by cloning the repo with an empty wiki and database. The currently-**active** Strategy is a single global pointer (`activeStrategyId`), persisted in runtime config and pinned by the Coordinator in conversation memory — zero or one Strategy is active at any time. `/strategy switch <name>` reassigns the pointer atomically; the targeted Strategy becomes the read/write target for sub-agents and the default banner subject in the UI. "Active" means "currently pointed-to by `activeStrategyId`" — it never means "non-archived"; for that, say "non-archived". See [ADR-0010](docs/adr/0010-strategy-as-scope-unit.md), [ADR-0015](docs/adr/0015-pivot-via-archive-and-clean-slate.md).
_Avoid_: Scenario, branch, variant, plan-variant. Also avoid "active" in the sense of "non-archived" — use "non-archived".

**Hypothesis**:
A strategic proposition under test (e.g. "Buyer power is HIGH in our target market"). Has a typed state machine (`unverified` → `tested-supports` / `tested-refutes` / `contradicted` / `invalidated`). Supported, refuted, or contradicted by **Claims**, not by **Citations** directly. Its own aggregate root. Carries a `staleSince: timestamp | null` flag set when an upstream **Hypothesis** (via a **Derivation Edge**) changes state — the flag is a UX badge, never an automatic state revert. See [ADR-0012](docs/adr/0012-ripple-semantics-and-domain-events.md).
_Avoid_: Assumption, position, theory, statement, proposition (in user-facing copy).

**Quantitative Hypothesis** (refinement of **Hypothesis**):
A **Hypothesis** whose proposition is a numeric value with a unit (e.g. "marketSize = $250B", "marketGrowthRate = 12%/yr", "revenueGrowthRate = 8%/q"). Same state machine and same aggregate as a qualitative **Hypothesis**; the difference is the proposition shape. Supported by **Claims** whose **Citations** carry the extracted numeric value (one per Citation; see **Citation**). When a Source contains multiple candidate numbers for a Quantitative Hypothesis slot (e.g. 2023 actual vs 2027 forecast for `marketSize`), the **Researcher** escalates the choice to the user via a `DisambiguationRequired` artifact rather than silently picking — see [ADR-0014](docs/adr/0014-numeric-disambiguation-and-extraction.md). Consumed by **Financial Projection** at render time.
_Avoid_: Driver, assumption, parameter, KPI (in user-facing copy).

**Strategic Framework**:
A curated view (e.g. PESTEL, 5 Forces, SWOT, STP, 4 Ps) populated by **Hypotheses** in named slots. A thin aggregate: holds slot assignments and narrative connective text, but contains no **Claims** of its own. The same **Hypothesis** can occupy slots across multiple **Strategic Frameworks** \*within the same **Strategy\***. Every slot entry is a **Hypothesis** — not a free-form bullet. **Uniquely identified within its Strategy by its Framework Kind** — at most one PESTEL, one SWOT, one FiveForces per Strategy. Time-horizon variants (e.g. "5-year view") and per-segment variants are modelled as separate **Strategies**, not as additional instances within a Strategy. See [ADR-0011](docs/adr/0011-one-framework-instance-per-kind-per-strategy.md).
_Avoid_: Framework (without "Strategic"), template, model, doc.

**Framework Kind**:
A category of **Strategic Framework** defined in the **Framework Registry**. Two flavours, same shape:

- **Qualitative Kinds** — `PESTEL`, `FiveForces`, `SWOT`, `STP`, `FourPs`, `FeedbackChannels`, etc. Slots take qualitative **Hypotheses**.
- **Quantitative driver-set Kinds** — e.g. `MarketSizing`, `RevenueModel`, `CostStructure`, `Runway`. Slots take **Quantitative Hypotheses** that feed the **Financial Projection**. Specific list and slot schemas deferred to follow-up ADRs (per [ADR-0002](docs/adr/0002-framework-registry.md)'s "adding a Kind is a code change + ADR" rule).

Each Kind specifies its **slot schema** as one of two variants (see [ADR-0016](docs/adr/0016-slot-schema-fixed-and-repeating.md)):

- **FixedSlots** — A fixed enumerated set of slot names (e.g. SWOT: `strengths`, `weaknesses`, `opportunities`, `threats`; PESTEL: `political`, `economic`, `social`, `technological`, `environmental`, `legal`). Slot identity is `(StrategyId, FrameworkKind, SlotName)`.
- **RepeatingSlots** — A repeating outer slot whose label is **user-named** (e.g. STP: each segment is named freely by the user — `mid-market-cfos`, `enterprise-cios`), and an inner schema of registry-defined slot names that each segment must populate (e.g. STP segment: `targeting`, `sizing`, `decisionMakers`, `positioning`). Slot identity is `(StrategyId, FrameworkKind, SegmentLabel, InnerSlotName)`. Optional `minSegments` / `maxSegments` bounds on the registry definition.

Each Kind also specifies its canonical upstream / downstream Kinds.
_Avoid_: Framework type, framework template.

**Framework Registry**:
The static, code-defined catalogue of all supported **Framework Kinds**. Lives under `packages/domain/strategic-frameworks/`. Encodes slot schemas, canonical upstream/downstream relationships, and per-slot default research prompts. Adding a new **Framework Kind** is a code change with an ADR.
_Avoid_: Framework catalog, framework dictionary, framework config.

**Derivation Edge**:
A directed link from a downstream **Hypothesis** to one or more upstream **Hypotheses** that it was inferred from. Stored on the downstream **Hypothesis** as `derivedFrom: HypothesisId[]`. The system's _ripple_ (when an upstream change flags downstream items for re-test) is graph traversal over these edges, not over **Framework Kind** relationships.
_Avoid_: Reference, dependency, link, parent.

**Critic Attempt**:
A timestamped record produced by the **Critic** sub-agent challenging a **Hypothesis** against a snapshot of its current supporting/refuting **Claims** _and_ the current state of its upstream **Hypotheses** (those it depends on via **Derivation Edges**). Its own aggregate root. Required by the structural guard on `Hypothesis.testSupports()` and `Hypothesis.testRefutes()` — the guard fails unless a Critic Attempt exists whose `evidenceSnapshot` matches both (a) the Hypothesis's current `ClaimId` set and (b) the current state of each upstream Hypothesis. Re-Critic is therefore required when supporting Claims change _or_ when an upstream Hypothesis transitions. May be substantively empty (`outcome: 'no-objections'`) — the attempt itself is what the guard requires, not the presence of **Objections**.

**All Critic Attempts are append-only and visible.** Every Critic Attempt — including those with `outcome: 'no-objections'` — is preserved in OpenBrain and rendered in the wiki on the **Hypothesis** page, in chronological order under a `## Critic history` section. No-op attempts ("we re-Critiqued and nothing new surfaced") are first-class findings, not coalesced into a "last-revisited" timestamp on a prior attempt. The wiki collapses older attempts to a one-line summary by default (UI affordance); the data layer keeps everything.
_Avoid_: Critique, review, audit (as domain term).

**Objection**:
A specific challenge raised inside a **Critic Attempt**. Entity inside the Critic Attempt aggregate (not its own aggregate root) — its lifecycle is bounded by the parent. Carries challenge text, severity, optional `counterClaimId`, and an `ObjectionStatus` discriminated union: `open` / `addressed-by-claim` / `dismissed-owned` / `dismissed-mitigated` / `dismissed-negligible` / `dismissed-irrelevant` / `dismissed-out-of-scope`. Every `dismissed-*` requires a `rationale: string`. Objections are **append-only** — never deleted, hidden, or filtered. The wiki renders open and all dismissed Objections side-by-side with their rationales visible. Open Objections do **not block** Hypothesis state-machine transitions; the user judges whether each is load-bearing.
_Avoid_: Concern, issue, comment, question.

**Conversation**:
A persisted record of one chat session between the user and the **Coordinator**, scoped to exactly one **Strategy** (the one active at the time the session started). Its own aggregate root. Each conversational turn is appended; turns are append-only. **Each turn carries a `kind` discriminator: `'prose'` (LLM-mediated dialogue) or `'slash-command'` (deterministic parser-mediated commands like `/strategy create`).** Both kinds are persisted because the user-to-Coordinator boundary is what audit-grade evidence captures; the dispatch path inside the Coordinator (parser vs LLM) is implementation. Conversations are persisted in OpenBrain as audit-grade evidence — they support "why did I decide X?" queries — but are **never auto-loaded** into a fresh chat's context. The Coordinator retrieves prior Conversations only when the user explicitly asks or when surfacing an unresolved in-flight artifact (see **Disambiguation Required**). See [ADR-0017](docs/adr/0017-conversation-as-aggregate-fresh-context-default.md).
_Avoid_: Chat, transcript, dialogue, session-log.

**Disambiguation Required**:
A first-class artifact emitted by the **Researcher** when a Source contains multiple candidate numeric values for a **Quantitative Hypothesis** slot and the choice between them is strategic interpretation rather than NLP extraction (see [ADR-0014](docs/adr/0014-numeric-disambiguation-and-extraction.md)). Persisted as an aggregate scoped to its **Strategy**, with `status: 'awaiting-user' | 'resolved' | 'cancelled'`. Append-only — resolved/cancelled artifacts remain in OpenBrain for audit. On a fresh chat session, the **Coordinator** loads all `awaiting-user` Disambiguation Required artifacts for the active **Strategy** and surfaces them before continuing — this is the one carve-out from the fresh-chat-by-default rule, because the system is waiting on a user answer to make progress.
_Avoid_: Disambiguation request, ambiguity flag, pending question.

**Sub-Agent Invocation**:
A strategy-scoped, append-only audit aggregate recording one Coordinator-issued run of a sub-agent (`Researcher` / `Critic` / `Cartographer` / `Renderer`). Captures `kind`, `promptVersion`, `startedAt` / `endedAt`, terminal `status` (`in-flight` / `succeeded` / `failed` / `partial`), the IDs of artifacts produced (Claims, Citations, CriticAttempt, slot/edge updates), and a `failureMode` discriminant (`tool-error` / `llm-error` / `token-budget` / `guard-rejected` / `user-cancelled`) on non-success. Per-aggregate transactionality on the _artifacts_ it writes — but the invocation itself never spans a transaction, so a Researcher run that produced 2 Claims before `web_search` timed out leaves both Claims fully persisted and a `SubAgentInvocation { status: 'partial', producedArtifactIds: [Claim1Id, Claim2Id], failureMode: 'tool-error' }` record. Failed and partial invocations render in the wiki alongside successful ones — the user investigating "_why is `marketSize` still `unverified`?_" sees "Researcher tried twice, `web_search` timed out both times" rather than nothing. See [ADR-0021](docs/adr/0021-sub-agent-invocations-as-append-only-audit-aggregates.md).
_Avoid_: Agent run, agent call, sub-agent log, invocation log.

**Business Plan**:
A render-time _projection_ compiled from a chosen set of **Strategic Frameworks** (and the **Financial Projection** as its financial section). Not an editable aggregate, not a source of truth — generated on demand for export or review. Audience: operator / investor / strategic-review reader.
_Avoid_: Plan (without "Business"), strategy doc, masterplan.

**Marketing Plan**:
A render-time projection compiled from the marketing-relevant subset of **Strategic Frameworks**. Has a dual nature symmetrical to **Financial Projection**: rendered into the **Business Plan** as the marketing section, _and_ independently exposable as a standalone document for a marketing-team reader. Not editable — generated from the underlying framework web on demand. The "marketing-relevant" classification is **statically encoded in the Framework Registry** (per Kind and per slot), not selected per-render — adding/removing a slot from the marketing projection is a registry change with an ADR. See [ADR-0013](docs/adr/0013-marketing-plan-mirrors-financial-projection.md).
_Avoid_: Marketing strategy (use "Strategic Framework" if you mean the editable thing), marketing doc.

**Financial Projection**:
A render-time projection computed by deterministic formulas in `packages/domain` from a set of **Quantitative Hypotheses**. Outputs derived figures — NPV, runway, break-even, sensitivity — as ranges when supporting **Claims** disagree on driver values. Has a dual nature: rendered into the **Business Plan** as the financial section, _and_ independently exposable on its own.
_Avoid_: Financial model, financial plan, forecast (without "Projection").

## Relationships

- **Strategy scoping:** **Hypothesis**, **Strategic Framework**, **Business Plan**, **Marketing Plan**, **Financial Projection**, **Critic Attempt**, **Objection**, **Conversation**, **Disambiguation Required**, **Sub-Agent Invocation** are each scoped to exactly one **Strategy**. **Source**, **Claim**, **Citation** are global to the OpenBrain instance — they are reusable across **Strategies** without duplication.
- A **Source** is cited by zero or more **Citations**.
- A **Claim** has 1+ **Citations**, each pointing to a **Source**.
- A **Hypothesis** is supported, refuted, or contradicted by zero or more **Claims**. State-machine transitions reference the **Claim** IDs that justified the transition.
- A **Strategic Framework** has slots — either fixed (enumerated by the registry) or repeating (user-named outer label + registry-defined inner schema). Each slot holds zero or more **Hypotheses**. See [ADR-0016](docs/adr/0016-slot-schema-fixed-and-repeating.md).
- A **Strategic Framework** has a single **Framework Kind**, which determines its slot schema. **Within a Strategy, at most one Strategic Framework instance exists per Framework Kind** — instance identity is the pair `(StrategyId, FrameworkKind)`.
- A single **Hypothesis** can appear in slots across multiple **Strategic Frameworks** \*within the same **Strategy\*** ("connective tissue via shared hypotheses"). A **Hypothesis** never crosses Strategy boundaries.
- A **Hypothesis** can declare zero or more **Derivation Edges** to upstream **Hypotheses**, recording the concrete reasoning chain.
- The **Framework Registry** records canonical upstream/downstream relationships between **Framework Kinds** (e.g. `PESTEL → FiveForces → SWOT → STP → Positioning → FourPs → FeedbackChannels`) as _hints_ for the runtime agent, not constraints on what **Derivation Edges** are allowed.
- A **Business Plan** is rendered from a set of **Strategic Frameworks** at a point in time, all from a single **Strategy**. It composes **Marketing Plan** as its marketing section and **Financial Projection** as its financial section — both projections are invoked as sub-renders, not duplicated.
- A **Marketing Plan** is rendered from the marketing-relevant subset of **Strategic Frameworks** at a point in time, all from a single **Strategy**. Same framework web as the **Business Plan** — different projection. The "marketing-relevant" subset is statically encoded in the **Framework Registry** (per Kind and per slot), not selected per-render. Embedded as the marketing section of a **Business Plan**, _and_ independently renderable.
- A **Financial Projection** is rendered from a set of **Quantitative Hypotheses** at a point in time, by deterministic formulas in `packages/domain`, all from a single **Strategy**. Embedded as the financial section of a **Business Plan**, _and_ independently renderable.
- **Cross-Strategy comparison** is a read-only render variant: the same projection logic invoked over two or more **Strategies** side-by-side. Comparison renders never write — they cannot create or mutate aggregates, and they are not editable surfaces.

## Example dialogue

> **User:** "I want to put 'buyer power is high' under SWOT.threats."
> **Agent:** "That's a strategic proposition — I'll create it as a **Hypothesis** in the SWOT.threats slot. Right now it's `unverified`. Want me to research **Claims** that would support or refute it?"
> **User:** "Yes — and this same hypothesis also belongs in 5 Forces."
> **Agent:** "Same **Hypothesis**, slotted into both **Strategic Frameworks**. If a refuting **Claim** lands later, both frameworks get flagged."
> **User:** "What about 'we have 3 published researchers'?"
> **Agent:** "That's a directly-verifiable factual statement, not a strategic proposition. I'd normally model it as a **Claim**, but every **Strategic Framework** slot must be a **Hypothesis** — so frame it as the testable proposition 'the team has the credentials to execute,' supported by **Claims** about LinkedIn profiles and publication records."

## Flagged ambiguities

- **"Claim" vs "Hypothesis"** — _resolved as distinct._ A Claim is a directly-cited factual unit. A Hypothesis is a strategic proposition under test, supported by Claims. Both are aggregate roots in OpenBrain. The earlier framing in [docs/principles/domain-modeling.md](docs/principles/domain-modeling.md) that nested Claim inside Hypothesis is wrong and has been corrected.
- **"Business Plan" vs "Strategic Framework"** — _resolved as distinct._ The user edits **Strategic Frameworks**; the **Business Plan** is rendered from them. There is no editable Business Plan aggregate.
- **"Slot contents"** — _resolved._ Every slot in a **Strategic Framework** is a **Hypothesis**, never a raw **Claim** or free-form text. Factual statements are reframed as testable propositions backed by Claims.
- **"Assertion"** — _avoided as a domain term._ User-spoken word during grilling. Maps to **Hypothesis** in the model.
- **"LLM never computes" line** — _sharpened twice._ Three categories, not two: (1) Numeric **extraction** from cited content (parsing `$250B` out of a quote into a **Quantitative Hypothesis** value) is allowed — it's NLP. (2) Numeric **arithmetic between values** (ROI, NPV, runway, derived growth rates, sensitivity) is forbidden in LLM calls and runs as deterministic formula code, exposed via Application-layer endpoints. (3) Numeric **interpretation** — picking which of multiple candidate numbers in a Source means what for a Hypothesis (e.g. 2023 actual vs 2027 forecast for `marketSize`) — is escalated by the **Researcher** to the user via a `DisambiguationRequired` artifact rather than silently picked. Captured in [docs/principles/memory-architecture.md](docs/principles/memory-architecture.md), [ADR-0007](docs/adr/0007-llm-never-computes-derived-figures.md), and [ADR-0014](docs/adr/0014-numeric-disambiguation-and-extraction.md).
- **Quantitative disagreement and the state machine** — _resolved._ The existing `Hypothesis` state machine handles quantitative drivers without new tags. The user (or Critic) classifies each cited Claim as supporting or refuting; concordant magnitudes both classified-as-supporting → `tested-supports`; both directions present → `contradicted`. The numeric _spread_ across supporting Claims lives in the **Financial Projection**'s render-time output (Conservative/Expected/Optimistic), not in the Hypothesis aggregate. No tolerance band is stored on the Hypothesis.
