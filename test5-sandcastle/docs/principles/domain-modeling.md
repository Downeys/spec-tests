# Domain modeling

How to decide whether a new entity gets full DDD ceremony or just a Zod schema. How to name things. How to model relationships that have their own attributes.

## The ceremony rule (wrong-if-violated)

An entity gets `packages/domain/aggregates/` treatment — class with private state, public methods, `Result<T,E>` returns, repository port — when **any** of these are true:

1. **Lifecycle states with rules about which transitions are legal.** E.g. a `Hypothesis` going `unverified → tested-supports`, never the reverse without a new test event.
2. **Composes other domain objects under invariants.** E.g. a `BusinessPlan` requires every claim in its `FinancialProjection` to cite at least one `ResearchItem`.
3. **Computed fields whose correctness depends on inputs the type system can't validate.** E.g. financial math, framework-completeness checks.
4. **Misuse causes silent wrong answers, not just crashes.** This is the operational test: *would silent corruption be possible if we used a plain shape here?* If yes, DDD.

If none of these apply, **use a Zod schema in `packages/domain/dtos/` plus plain functions.** Examples that go in `dtos/`: chat messages, tool-call traces, search-result caches, config, UI form state. These are transport/log/cache shapes — anemic by design and exempt from the no-anemic-aggregate rule.

## Anemic models banned in `aggregates/`

A custom ESLint rule (`local/no-anemic-aggregate`, see [linting-and-tooling.md](linting-and-tooling.md)) fails any class exported from `packages/domain/aggregates/` that has only a constructor and getters with no behavioral methods. Aggregates carry their invariants *inside* themselves; a class that's just a data bag belongs in `dtos/`, not `aggregates/`.

DTOs in `packages/domain/dtos/` are explicitly exempt — they are *supposed* to be data bags.

## Citation as Reified Association Entity

A `Citation` connects a `Claim` (in OpenBrain) to a `Source` (in OpenBrain) and carries its own metadata: `confidence`, `span`, `quote`, `retrievedAt`, `status`. It is neither a plain Entity nor a plain Value Object — it is a **Reified Association** (sometimes called Associative Entity or Link Entity).

This pattern fits whenever:
- The relationship itself has attributes (confidence, span, retrievedAt).
- The relationship can be revised independently (confidence updated when re-tested, span re-located when source moves, status invalidated when source is retracted).
- The relationship can be queried as a fleet ("all citations to source X with confidence < 0.7").

Concretely:
- `Citation` is an Entity, **its own aggregate root**.
- It has methods: `Citation.revise(newConfidence, reason)`, `Citation.invalidate(reason)`.
- Cross-aggregate references via IDs (`claimId: ClaimId`, `sourceId: SourceId`), never direct object references.
- Has its own repository port in `packages/application/ports/`.

## Three confidence-bearing concepts on three different objects

The "be critical of every finding" posture composes from three independent confidence/status fields, each owned by a different aggregate, derived together at read time.

| Object | Field | Meaning |
|---|---|---|
| `Source` (own aggregate; read model of an OpenBrain document) | `trustScore` | The user's meta-assessment of the source itself — peer-reviewed paper > Twitter thread. Doesn't change per citation. |
| `Citation` (reified association, its own aggregate) | `confidence` | Does *this* source actually support *this* claim? Per-relationship, mutable, lifecycle-bound. |
| `Hypothesis` (own aggregate; supported by Claims) | `status` | State machine: `unverified` → `tested-supports` / `tested-refutes` / `contradicted` / `invalidated`. Per-hypothesis. |

`Claim` is a separate aggregate root that sits *between* `Citation` and `Hypothesis`: a Claim has 1+ Citations to Sources, and a Hypothesis is supported / refuted / contradicted by 1+ Claims. The vocabulary and relationships are canonicalised in [CONTEXT.md](../../CONTEXT.md).

A Hypothesis's overall confidence is **never collapsed into a single composed badge** in user-facing surfaces. The wiki and Hypothesis pages always render the three fields side-by-side — `hypothesis.status`, the best-supporting Citation's `confidence × Source.trustScore`, and the full Citation list. No composed value is stored on the aggregate. See [ADR-0018](../adr/0018-confidence-decomposed-display-no-stored-scalar.md).

The Renderer/Application layer **may** compute a composed value at read-time as a pure domain function — only for one purpose: ordering ranked surfaces (e.g. "weakest-supporting Hypotheses in this SWOT first" in a Business Plan margin-annotation list). The composed value never appears in user-facing copy. The specific sort-key formula is deferred until the first Renderer feature that needs it lands; when it does, it is a pure function fully unit-tested with property-based tests via `fast-check`.

## Hypothesis is a typed state machine

`Hypothesis` lives in `packages/domain/aggregates/hypothesis/`. Its status field is a discriminated union:

```ts
type HypothesisStatus =
  | { tag: 'unverified' }
  | { tag: 'tested-supports';  testedAt: Date; supportingClaims: readonly ClaimId[] }
  | { tag: 'tested-refutes';   testedAt: Date; refutingClaims:  readonly ClaimId[] }
  | { tag: 'contradicted';     contradictedAt: Date; conflictingClaims: readonly ClaimId[] }
  | { tag: 'invalidated';      invalidatedAt: Date; reason: string };
```

Transitions reference `ClaimId`, not `CitationId` — a hypothesis is supported by claims (each of which has its own citations to sources), not by citations directly. See [CONTEXT.md](../../CONTEXT.md) for the resolved Source / Claim / Hypothesis relationship.

Transition methods on the aggregate enforce legality:

```ts
class Hypothesis {
  testSupports(claims: readonly ClaimId[]): Result<void, IllegalTransition | CriticPassMissing> { ... }
  testRefutes(claims:  readonly ClaimId[]): Result<void, IllegalTransition | CriticPassMissing> { ... }
  contradict(by: readonly ClaimId[]):       Result<void, IllegalTransition> { ... }
  invalidate(reason: string):               Result<void, IllegalTransition> { ... }
  revive():                                  Result<void, IllegalTransition> { ... }
}
```

Illegal transitions return `{ tag: 'err' }`. The legal-transition matrix:

| From ↓ / To → | unverified | tested-supports | tested-refutes | contradicted | invalidated |
|---|---|---|---|---|---|
| **unverified** | — | ✓ (Critic-guarded) | ✓ (Critic-guarded) | ✓ | ✓ |
| **tested-supports** | ✗ | ✓ re-test (Critic-guarded) | ✓ (Critic-guarded) | ✓ | ✓ |
| **tested-refutes** | ✗ | ✓ (Critic-guarded) | ✓ re-test (Critic-guarded) | ✓ | ✓ |
| **contradicted** | ✗ | ✓ when refuting Claims withdrawn (Critic-guarded) | ✓ when supporting Claims withdrawn (Critic-guarded) | — | ✓ |
| **invalidated** | ✓ `revive()` | ✗ direct (use `revive()` then test) | ✗ direct (use `revive()` then test) | ✗ direct | — |

Re-testing (any tested state → same state with new `ClaimId`s) is allowed and supersedes prior state; the prior state-event stays in OpenBrain's append-only history. Reverting to `unverified` is forbidden from any tested state — the only path back to `unverified` is `invalidated → revive()`. `invalidated` is user-driven (pivot, scope change) or auto-set when all supporting Claims have their Citations retracted; it is semantically distinct from `contradicted` ("evidence on both sides; the proposition is genuinely disputed").

The aggregate also carries `derivedFrom: readonly HypothesisId[]` — explicit links to upstream **Hypotheses** that this one was inferred from. These edges are how *ripple* propagates: when an upstream Hypothesis transitions to `tested-refutes` / `contradicted` / `invalidated`, downstream Hypotheses with `derivedFrom` pointing to it are flagged for re-test. The `Strategic Framework` meta-graph (PESTEL → FiveForces → ...) lives separately in the **Framework Registry** and is *guidance for the agent*, not a constraint on `derivedFrom` edges. See [CONTEXT.md](../../CONTEXT.md) and [docs/adr/0002-framework-registry.md](../adr/0002-framework-registry.md).

### Critic-attempt guard on `tested-supports` and `tested-refutes`

`Hypothesis.testSupports(claims)` and `Hypothesis.testRefutes(claims)` both refuse their state-machine transitions unless a `CriticAttempt` record exists for the Hypothesis whose `evidenceSnapshot` matches the current ClaimId set (see CriticAttempt section below). Returns `Result<void, CriticPassMissing>` when the guard fails. This is the domain-layer enforcement of the runtime "be critical of every finding" rule from [docs/adr/0003-agent-topology.md](../adr/0003-agent-topology.md), applied symmetrically — refuting a Hypothesis is as substantive a strategic claim as supporting it, and a Researcher who finds counter-evidence without a Critic pass is just as failure-prone as one finding supporting evidence without one. The guard does **not** apply to `contradict` (auto-detectable when both supporting and refuting Claims are present) or `invalidate` (user-driven manual override).

## CriticAttempt — own aggregate, evidence-snapshot freshness, append-only objections

`CriticAttempt` is its own aggregate root in `packages/domain/aggregates/critic-attempt/`, with its own repository port. It records a single Critic-sub-agent pass over a Hypothesis at a point in time:

```ts
type CriticAttempt = {
  id: CriticAttemptId
  hypothesisId: HypothesisId
  evidenceSnapshot: readonly ClaimId[]   // Claims this pass considered
  attemptedAt: Date
  outcome: 'no-objections' | 'objections-raised'
  objections: readonly Objection[]
  criticPromptVersion: string             // for auditing the Critic prompt that produced this
}
```

### Evidence-snapshot freshness

The structural guard requires a CriticAttempt whose `evidenceSnapshot: ClaimId[]` equals the Hypothesis's current set of supporting/refuting ClaimIds. If a Claim has been added or withdrawn since the last Critic pass, the guard fails — re-Critic required. This is sharper than "exists at all" and avoids the failure mode where a months-old CriticAttempt over a stale evidence set silently authorises a fresh state-machine transition.

A substantively-empty CriticAttempt (`outcome: 'no-objections'`, empty `objections`) over the *current* evidence set is fine — the Critic ran, considered the evidence, found nothing. Empty over stale evidence is not.

### Objection lifecycle and never-hidden invariant

`Objection` is an entity inside the CriticAttempt aggregate (not its own aggregate root) — lifecycle bounded by the parent. The status is a discriminated union:

```ts
type ObjectionStatus =
  | { tag: 'open' }
  | { tag: 'addressed-by-claim';     addressedAt: Date; claimId: ClaimId; note: string }
  | { tag: 'dismissed-owned';        dismissedAt: Date; rationale: string }
  | { tag: 'dismissed-mitigated';    dismissedAt: Date; rationale: string; mitigationClaimId?: ClaimId }
  | { tag: 'dismissed-negligible';   dismissedAt: Date; rationale: string }
  | { tag: 'dismissed-irrelevant';   dismissedAt: Date; rationale: string }
  | { tag: 'dismissed-out-of-scope'; dismissedAt: Date; rationale: string };
```

| Status | Meaning |
|---|---|
| `open` | Critic raised it; not yet acted on |
| `addressed-by-claim` | A new **Claim** now answers this Objection — the system shape changed |
| `dismissed-owned` | Real concern, accepted as a known risk we own |
| `dismissed-mitigated` | Real concern, we have a plan/control (optionally formalised as a Claim) |
| `dismissed-negligible` | Real concern, too small to be load-bearing |
| `dismissed-irrelevant` | Objection doesn't apply (wrong scope, misread, factual error in the objection) |
| `dismissed-out-of-scope` | Right concern, but not what *this* Hypothesis is testing |

`rationale: string` is **required** on every `dismissed-*` and `note: string` on `addressed-by-claim` — Zod-enforced at the OpenBrain write boundary. Empty dismissals are forbidden.

**Never-hidden invariant.** The aggregate exposes status-transition methods (`dismiss(kind, rationale)`, `addressByClaim(claimId, note)`) but no `delete`, `archive`, or `hide`. Status transitions are append-only — each is a new row linked by `previousVersionId`. The wiki renders the **full** Objection ledger on every Hypothesis page: open and all `dismissed-*` side-by-side, with their rationales visible. The user reading their own SWOT later must see *"Objection X — dismissed-mitigated, rationale: Y"* alongside the supporting Claims, not have it filtered.

**Open Objections do not block Hypothesis state-machine transitions.** They are surfaced in chat and on the wiki, but the user's judgment whether an Objection is load-bearing is theirs to make. The guard requires the *attempt* to exist over the current evidence; it does not require Objections to be resolved. (A future strict-mode refinement — block on open `severity: 'high'` Objections — could be added without breaking the existing shape.)

**Addressing vs dismissing.** `addressed-by-claim` is structurally distinct from `dismissed-*`: addressing requires a real Claim in OpenBrain that answers the Objection — adding evidence, not just a status flip. This means *resolving* an Objection by genuinely answering it moves the system state, while *dismissing* one is a recorded judgment with rationale. Both are visible forever.

## Nomenclature: CONTEXT.md is the canonical vocabulary

> **CONTEXT.md is the single source of truth for domain vocabulary.** Every type, table, file path, and UI label uses the names defined there without aliasing. New domain concepts are added to CONTEXT.md (via `grill-with-docs`) **before** code uses them.

If CONTEXT.md says "Strategic Framework," the class is `StrategicFramework`, the OpenBrain table is `strategic_framework`, the wiki folder is `wiki/strategic-frameworks/`, the UI label is "Strategic Framework". One vocabulary, four representations, no aliases.

A custom ESLint rule (`local/domain-names-match-context-md`) parses CONTEXT.md headings and fails any export from `packages/domain/aggregates/` or `packages/domain/value-objects/` whose name doesn't match an entry. This rule is silent until CONTEXT.md exists — the file is created lazily by `grill-with-docs`, per the [docs/agents/domain.md](../agents/domain.md) convention.

ADRs in `docs/adr/` record *why* a name was chosen. If a rename is justified, it lives in an ADR and the rename happens atomically across CONTEXT.md, code, tables, files, and UI.

## Where domain logic actually runs

Domain methods are pure: same inputs, same outputs, no I/O. Side effects (saving a hypothesis after a transition) are orchestrated by the **Application layer's use cases** which load the aggregate via a repository port, mutate it via its own methods, and save it back. The aggregate's transition method *does not* know there is a database. See [architecture.md](architecture.md) for the layer rules that enforce this.
