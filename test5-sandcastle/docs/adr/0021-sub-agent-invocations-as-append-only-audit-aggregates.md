# Sub-agent invocations are append-only audit aggregates; artifacts are per-aggregate transactional

Each Coordinator-issued sub-agent run leaves a **`SubAgentInvocation`** record in OpenBrain — a strategy-scoped, append-only aggregate capturing the invocation's lifecycle (`succeeded` / `failed` / `partial`), the artifact IDs it produced, and timing. **Persistence of the artifacts the sub-agent produces is per-aggregate transactional** — each `Claim` + its `Citations` is one transactional write, each `CriticAttempt` is one transactional write, etc. — so individual artifacts are never half-persisted. But the _invocation as a whole_ never spans a transaction; if it dies after writing 2 Claims and before writing a 3rd, the `SubAgentInvocation` record reflects `status: 'partial'` over the 2 ClaimIds it managed to produce. Failed and partial invocations are rendered in the wiki alongside successful ones.

Vocabulary entry added to [CONTEXT.md](../../CONTEXT.md). Composes with [ADR-0003](0003-agent-topology.md) (Coordinator + sub-agent topology), the append-only-and-visible posture in [Objection](../../CONTEXT.md) and [Critic Attempt](../../CONTEXT.md), and [memory-architecture.md](../principles/memory-architecture.md) (OpenBrain append-only).

## Considered Options

- **A — All-or-nothing per invocation.** A Researcher pass either persists _all_ its Claims+Citations (single transaction over the whole run) or _none_ (failure → rollback, retry from scratch). Cleanest aggregate state. **Rejected:** loses partial progress on long deep-research turns; a Researcher that wrote 2 useful Claims before `web_search` timed out should not have those Claims discarded; and the aggregate-per-transaction rule fights the per-aggregate-write architecture from [memory-architecture.md](../principles/memory-architecture.md).
- **B — Best-effort persistence; partial outputs kept; no invocation record.** Partial Claims+Citations stay; failure leaves no breadcrumb beyond an absence. **Rejected:** the user investigating "_why is `marketSize` still `unverified`?_" sees nothing — the failed Researcher pass is invisible. Same anti-pattern as collapsing dismissed Objections into a count or hiding stale Critic Attempts; explicitly forbidden by the never-hidden invariants this codebase already commits to.
- **C — Per-aggregate transactionality + `SubAgentInvocation` audit aggregate (chosen).** Artifacts (Claim, Citation, CriticAttempt, slot/edge updates) are individually transactional. The invocation lifecycle is its own aggregate, recording success/failure/partial alongside produced artifact IDs.

## Why C

- **The append-only-and-visible posture is the load-bearing structural commitment of this codebase.** The Objection never-hidden invariant ("dismissed Objections are rendered side-by-side with their rationales"), the Critic Attempt all-attempts-visible rule ("no-op attempts are first-class findings, not coalesced"), and OpenBrain's append-only schema all point in the same direction: failed work is itself evidence. A failed Researcher invocation is the same shape — _something happened, the user should be able to see it._
- **Sub-agent failure is a research finding.** "`web_search` returned no useful results for `customerLifetimeValue` — twice" is information the user uses to decide "I need a different Source." Without the invocation record, that decision happens on incomplete information.
- **Per-aggregate transactionality is what's actually required.** The data-correctness need is "no half-persisted Claim with a missing Citation" — that's per-aggregate. The need is _not_ "Researcher invocation is atomic" — that's a much stronger guarantee with much less benefit. Splitting the two cleanly is the right grain.
- **Composes with [ADR-0003](0003-agent-topology.md).** ADR-0003 makes Critic read-only and Researcher write-capable; ADR-0021 says _every_ sub-agent invocation — read-only or write-capable — leaves an audit record. Critic's `CriticAttempt` is a Critic-specific structured output; the `SubAgentInvocation` is its lifecycle wrapper. Same shape across all four sub-agents.

## Schema

```ts
type SubAgentInvocation = {
  id: SubAgentInvocationId;
  strategyId: StrategyId; // strategy-scoped
  conversationId: ConversationId | null; // the Conversation turn that triggered it, if any
  kind: 'researcher' | 'critic' | 'cartographer' | 'renderer';
  promptVersion: string; // pointer to the code-defined sub-agent prompt
  startedAt: Date;
  endedAt: Date | null; // null while in flight; set on success/fail/partial
  status:
    | { tag: 'in-flight' }
    | { tag: 'succeeded'; producedArtifactIds: readonly ArtifactId[] }
    | {
        tag: 'failed';
        producedArtifactIds: readonly ArtifactId[];
        failureMode: FailureMode;
        failureMessage: string;
      }
    | {
        tag: 'partial';
        producedArtifactIds: readonly ArtifactId[];
        failureMode: FailureMode;
        failureMessage: string;
      };
  triggeringContext: {
    /* free-form: target HypothesisId, target slot, etc. */
  };
};

type FailureMode =
  | 'tool-error' // web_search timeout, OpenBrain unavailable, etc.
  | 'llm-error' // Anthropic API error, malformed response
  | 'token-budget' // sub-agent ran out of context
  | 'guard-rejected' // sub-agent tried a state transition that the aggregate refused
  | 'user-cancelled'; // user interrupted from the Coordinator
```

`status: 'in-flight'` exists because the invocation record is written _at start_, not at end — that way a process crash leaves a recoverable in-flight row that the next session can mark `failed` (with `failureMode: 'tool-error'` and a "process died" message) on startup. `producedArtifactIds` is appended monotonically as artifacts land; on success/fail/partial, it freezes.

`triggeringContext` is intentionally loose — the structured fields differ per sub-agent kind (Researcher's context is "which Hypothesis, which slot"; Renderer's is "which Strategy, which target") and locking it down here would just be premature shape-design.

## Per-aggregate transactionality

The boundary is the aggregate, not the invocation:

- **Researcher** writes a Claim + its Citations. That's a single transaction per Claim. If the Researcher produces 3 Claims in one invocation, that's 3 separate transactions; the invocation as a whole is _not_ a transaction. Crashing between Claim 2 and Claim 3 leaves Claims 1 and 2 fully persisted, no Claim 3, and a `SubAgentInvocation { status: 'partial', producedArtifactIds: [Claim1Id, Claim2Id], ... }`.
- **Critic** writes a CriticAttempt with its embedded Objections. Single transaction (Objection is a within-aggregate entity per [domain-modeling.md](../principles/domain-modeling.md)). A Critic invocation produces 0 or 1 CriticAttempt; partial here is rare but possible if the LLM response was malformed mid-parse.
- **Cartographer** writes slot assignments and `derivedFrom` edge updates. Each slot or edge change is its own transaction over the affected Hypothesis/StrategicFramework aggregate.
- **Renderer** is pure-projection — no writes. A failed Renderer invocation produces no artifacts; the invocation record itself is the only persistent trace.

## Consequences

- **`SubAgentInvocation` is added to the strategy-laden aggregate list** in [CONTEXT.md](../../CONTEXT.md) "Relationships" section.
- **A repository port** for `SubAgentInvocation` is added to `packages/application/ports/` per [architecture.md](../principles/architecture.md).
- **The Coordinator's orchestration sequence** changes: write `SubAgentInvocation { status: 'in-flight' }` _before_ dispatching to the sub-agent; on completion (or any terminal failure), write the terminal status. Crashes between dispatch and completion leave an `in-flight` row; a startup hook marks orphaned in-flight rows as `failed`.
- **The wiki's Hypothesis page** renders failed/partial Researcher invocations targeting that Hypothesis alongside successful ones, in chronological order. Same shape as the existing all-Critic-Attempts-visible rule on the Hypothesis page.
- **The wiki's Strategy index** can summarize sub-agent activity over a period ("Researcher: 12 successful, 2 failed; Critic: 8 successful, 0 failed; Cartographer: 5 successful"). Useful for the user spotting patterns ("`web_search` keeps timing out on this slot").
- **Conversation linkage.** Each `SubAgentInvocation` carries the `conversationId` it was triggered from (when applicable — Renderer invocations from `pnpm wiki:regen` have no Conversation). The Coordinator's user-facing summary in the Conversation can hyperlink to the invocation record for "show me the trail."
- **The single-LLM-call-per-invocation simplification doesn't hold.** A Researcher invocation may make several LLM calls + several `web_search` tool calls in service of producing 3 Claims. The `SubAgentInvocation` aggregate is one record per invocation, not per-LLM-call; finer granularity (per-LLM-call traces) is the ephemeral sub-agent internals that [ADR-0017](0017-conversation-as-aggregate-fresh-context-default.md)'s clarification says are _not_ persisted.
- **Reversal cost.** Removing `SubAgentInvocation` later is moderate (drop the table, drop the repository port, remove the aggregate). Adding it later — after months of sub-agent runs have happened with no record — is expensive (the missing history is permanently missing). The asymmetry justifies recording it from day one.
