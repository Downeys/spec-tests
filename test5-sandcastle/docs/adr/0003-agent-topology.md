# Agent topology — Coordinator + specialised sub-agents

The runtime agent is a **Coordinator** (chat-facing, owns conversation continuity) that orchestrates four specialised sub-agents on demand: **Researcher**, **Critic**, **Cartographer**, **Renderer**. Sub-agents do not talk to each other directly — they return work to the Coordinator. This matches the hierarchical sub-agent shape native to the Anthropic Agent SDK.

## Considered Options

- **A — Single agent with tools.** One Claude call; "Critic" is a system-prompt instruction. Simple, but the "be critical of every finding" posture becomes a vibe rather than a structural guarantee.
- **B — Coordinator + specialised sub-agents (chosen).** Hierarchical; each sub-agent has a tighter prompt, smaller tool set, isolated context window.
- **C — Graph workflow (LangGraph DAG).** Explicit DAG with state flowing between named nodes. Most rigorous, most infrastructure.

## Why B over A and C

- **A fails the load-bearing requirement.** [spec.md](../../spec.md) requires the agent to "be critical of every finding and decision" and "treat every statement as a hypothesis that needs testing." A single agent prompted to do both supporting research and self-critique simultaneously empirically optimises for neither. Two specialised passes — Researcher then Critic — get the posture at quality.
- **C is overkill for a personal-use, single-operator product.** LangGraph's leverage is rigour-of-state-flow we don't need: the structural guard below gets us the "Critic must have run" guarantee at the data layer with much less code. LangGraph also fights `Result<T, E>` and pure-function rules in [language-and-types.md](../principles/language-and-types.md), and is Python-first with TS as second-class.
- **B fits the existing principles.** Sub-agent isolation matches the global CLAUDE.md "delegate substantial work to sub-agents" rule. Sub-agent contexts fit naturally inside the 100k target / 150k ceiling in [context-budget.md](../principles/context-budget.md) — each sub-agent's job is small enough to do well in <50k.

## Sub-agent roles

| Role | Job | Tool access |
|---|---|---|
| **Coordinator** | Talks to user, decides what subtask comes next, owns conversation memory | OpenBrain reads; Strategic Framework reads; OpenBrain writes via use-cases; sub-agent invocation |
| **Researcher** | Given a Hypothesis, find supporting/refuting Claims | Web search; source ingestion; **Claim writes**; **Citation writes** |
| **Critic** | Challenge a Hypothesis or Claim — find contradictions, weak evidence | Web search; OpenBrain reads; **read-only** — emits a `CriticAttempt` artifact; Coordinator decides what to do with it |
| **Cartographer** | Slot Hypotheses, draw `derivedFrom` edges, write narrative connective text | Strategic Framework writes; Hypothesis slot / derivation updates |
| **Renderer** | Compile a Business Plan from frameworks at export time | **Pure projection — no LLM** for the structured base; optional LLM narrative pass for prose polish |

Cartographer is a separate sub-agent (not Coordinator tools) because slotting decisions are judgment calls that benefit from a focused prompt. Collapse into Coordinator tools later only if the role turns out trivially mechanical in practice.

Critic is read-only by design. It returns `CriticAttempt` artifacts; the Coordinator (via use-cases) is what acts on them. Cleaner audit trail; no surprise writes from a sub-agent whose job is to challenge.

## Structural guard: Hypothesis cannot reach `tested-supports` or `tested-refutes` without a CriticAttempt

The `Hypothesis` aggregate's `testSupports(claims)` and `testRefutes(claims)` methods both refuse their state-machine transitions unless a `CriticAttempt` record exists for the Hypothesis. Enforced inside the aggregate, returning `Result<void, CriticPassMissing>` when the guard fails. Same shape as the existing "Claims require ≥ 1 Citation" rule at the OpenBrain write boundary, but at the domain layer per the DDD ceremony rule in [domain-modeling.md](../principles/domain-modeling.md). This turns "Critic should run" into "Critic *did* run, here is the artifact."

The guard applies symmetrically to refutes because refuting a Hypothesis is as substantive a strategic claim as supporting it. The guard does **not** apply to `contradict` (which is auto-detectable when both supporting and refuting Claims are present — the system flips it; not a substantive judgment) or `invalidate` (user-driven manual override — pivot, scope change, or all-citations-retracted). `CriticAttempt` schema and lifecycle deferred to the implementation issue.

## Consequences

- The Coordinator's system prompt carries explicit orchestration rules: "after any Researcher pass that returns supporting Claims, invoke Critic before transitioning the Hypothesis."
- Renderer keeps the structured base of any Business Plan deterministic and cheap. Narrative-pass LLM call is opt-in per render; the structured base is always available without an LLM call.
- Future-portability across LLM providers is reduced (Agent SDK lock-in is implied by B); accepted because Opus 4.7 is the chosen model anyway.
- The `CriticAttempt` artifact becomes a first-class domain concept — needs schema, repository port, and a place in OpenBrain. Tracked as a follow-up implementation issue, not part of this ADR.
- **Every sub-agent invocation — Researcher, Critic, Cartographer, Renderer — leaves a `SubAgentInvocation` audit record** capturing lifecycle (`succeeded` / `failed` / `partial`), produced artifact IDs, and failure mode on non-success. Per-aggregate transactionality on artifacts; the invocation itself never spans a transaction. See [ADR-0021](0021-sub-agent-invocations-as-append-only-audit-aggregates.md).
