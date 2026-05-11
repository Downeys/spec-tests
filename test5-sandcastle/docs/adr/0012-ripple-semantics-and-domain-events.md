# Ripple semantics and domain-event delivery

When a **Hypothesis** transitions state, downstream Hypotheses (those connected via **Derivation Edges**) are *flagged* with `staleSince: timestamp` — never auto-reverted. The `CriticAttempt.evidenceSnapshot` covers both the supporting `ClaimId` set and the state of upstream Hypotheses, so any upstream transition forces a re-Critic before the downstream can transition again. Ripple delivery is via **domain events** through an **EventBus** port, with handlers running **pre-commit** (in the same DB transaction as the trigger) for in-DB ripples.

Vocabulary in [CONTEXT.md](../../CONTEXT.md). Composed with [ADR-0003](0003-agent-topology.md) (Critic structural guard) and [ADR-0010](0010-strategy-as-scope-unit.md) (ripple stays in-Strategy). Architecture rationale in [architecture.md](../principles/architecture.md).

## Three decisions

### 1. Flag-only ripple, no auto-revert

When upstream Hypothesis A transitions, downstream B (with `derivedFrom: [A]`) keeps its current state but gains `staleSince: timestamp`. The UI badges B as "derives from a recently-changed upstream — revisit." The user (not the system) decides whether to re-Critic-and-re-test, or to break the Derivation Edge (A is no longer load-bearing for B).

**Why not auto-revert.** Auto-reverting B's state from `tested-supports` to `unverified` makes the system the strategic judge of whether the upstream change is load-bearing for B — that's exactly what the spec says the *user* does. It also fights the OpenBrain append-only principle: state snapping back without a user action mutates the audit trail in a way the user can't easily reconstruct.

**Hybrid auto-revert (auto-revert only when downstream is `tested-supports`) was rejected** because it requires the system to make the same judgment call in the riskiest case. The system can't tell the difference between "this upstream change actually undermines B" and "this upstream change happens to share a graph edge with B but doesn't substantively bear on it." The user can.

### 2. CriticAttempt evidence snapshot covers upstream Hypothesis state

`CriticAttempt.evidenceSnapshot` carries:

- `claimIds: ClaimId[]` — the supporting/refuting Claim set at attempt time (existing).
- `derivedFromStates: Record<HypothesisId, HypothesisState>` — the state of each upstream Hypothesis at attempt time (new).

The structural guard on `Hypothesis.testSupports()` / `Hypothesis.testRefutes()` (per [ADR-0003](0003-agent-topology.md)) is extended: it fails unless a CriticAttempt exists whose snapshot matches *both* the current `ClaimId` set and the current upstream Hypothesis states.

**Why extend the snapshot.** The Critic's job is to challenge whether B is well-supported. If a load-bearing upstream gets refuted, that's a substantive change to whether B is well-supported — even if B's own Claims are unchanged. Without the extension, B could ride a stale CriticAttempt indefinitely while its upstream story collapses underneath it. The extension keeps the guard honest with minimal added structure.

**The wiki badge alone (without guard extension) was rejected** because badges are advisory and the user can transition state past them. The guard turns the staleness into a hard gate at the next state transition.

### 3. Domain events via an EventBus port; handlers run pre-commit

Aggregates accumulate domain events in a private buffer (standard DDD pattern). The **OpenBrain repository** drains the buffer on save and hands events to the **EventBus** port. Handlers subscribed to those events run inside the same DB transaction as the original aggregate save.

```
packages/application/ports/event-bus.ts            # EventBus port (interface)
packages/application/event-handlers/
  hypothesis-ripple-handler.ts                     # subscribes to HypothesisStateChanged
                                                   # walks Derivation Edges
                                                   # writes staleSince on descendants
                                                   # all in the same UoW/transaction
packages/external/event-bus/
  in-memory-event-bus.ts                           # initial implementation
                                                   # typed via discriminated unions on DomainEvent
```

**Why event-driven over synchronous-in-the-use-case.** The architecture principle ([architecture.md](../principles/architecture.md)) puts cross-aggregate coordination behind a port in Application, not inline in a use-case. Synchronous-in-the-use-case has the state-transition use-case knowing about Derivation Edge graph traversal — exactly the leak Onion exists to prevent. Domain events are the canonical DDD shape for this; they cost ~1 port + 1 in-memory implementation + 1 handler at the start. Future ripples (wiki regen flag, Marketing Plan staleness, framework freshness badge) plug into the same event without modifying the state-transition use-case.

**Why pre-commit (in-transaction).** The ripple handler reads and writes the same OpenBrain database as the trigger — flagging a descendant Hypothesis is just another Hypothesis save. Running both in one transaction means: either the trigger and the ripple both succeed, or neither does. No outbox table, no idempotency keys, no at-least-once delivery scaffolding. Single-operator, low-concurrency — the simpler shape is correct.

**Post-commit was rejected for now** because it requires an outbox + retry + idempotency to be safe, which is real complexity earned only by external-side-effect handlers (Slack notifications, e-mail). When such a handler appears, it can use a different delivery strategy (post-commit + retry queue) without changing the in-DB ripple's pre-commit semantics — different events can be subscribed to with different delivery guarantees.

## Considered Options for delivery

- **A — Synchronous in the use-case (rejected).** State-transition use-case directly walks Derivation Edges. Simplest mechanically; violates Onion's separation rule.
- **B — Domain events, pre-commit handlers (chosen).** Aggregates emit; EventBus dispatches; handlers run in-transaction.
- **C — Domain events, post-commit handlers.** Outbox + retry. Right shape when external side effects appear; overkill for in-DB ripples.

## Consequences

- **`Hypothesis.staleSince: timestamp | null`** is a new field on the Hypothesis aggregate. Cleared on any user-initiated state transition (the user has revisited). Set by the ripple handler.
- **`CriticAttempt.evidenceSnapshot`** gains the `derivedFromStates` field. Existing CriticAttempts (none yet, since this is greenfield) would otherwise need a backfill — not applicable here.
- **`EventBus` port** lives in `packages/application/ports/`. Initial in-memory implementation is ~50 LoC. Typed via a discriminated-union `DomainEvent` type. Tests use a recording fake.
- **`HypothesisRippleHandler`** lives in `packages/application/event-handlers/`. Takes `OpenBrainRepository` by injection. Walks `derivedBy(hypothesisId)` edges; writes `staleSince` on each descendant. Idempotent by construction (writing the same timestamp is a no-op).
- **The repository's `save(aggregate)` method drains the aggregate's event buffer** and publishes to the EventBus inside the transaction. Standard "transactional outbox without an outbox" pattern for in-DB events.
- **Cross-Strategy boundary** ([ADR-0010](0010-strategy-as-scope-unit.md)) is preserved by the existing aggregate construction rule — Derivation Edges can't cross Strategies, so the ripple traversal can't either.
- **Handler registration happens at the composition root** (`apps/agent/`) — no service-locator, no module-level singletons.
