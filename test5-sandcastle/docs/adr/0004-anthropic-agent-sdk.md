# Anthropic Agent SDK for orchestration

The runtime agent's orchestration layer (Coordinator + sub-agents per [docs/adr/0003-agent-topology.md](0003-agent-topology.md)) is built on the **Anthropic Agent SDK** (TypeScript), not hand-rolled on the bare `@anthropic-ai/sdk` and not on LangGraph.

## Considered Options

- **Anthropic Agent SDK (chosen).** Built natively for hierarchical Coordinator + sub-agent topologies. Handles the tool-use loop, sub-agent context isolation, structured output, retry on transient errors.
- **Hand-roll on `@anthropic-ai/sdk`.** Maximum transparency. Every line of the agent loop is in this repo.
- **LangGraph (TS).** Explicit DAG with state flowing between named nodes.

## Why Agent SDK

- **It handles the boring parts so design budget goes to the value layer.** The orchestration loop and sub-agent context isolation are not load-bearing for this project's value — the framework registry, the Hypothesis state machine, the Critic-attempt guard, the citation invariants are. Agent SDK absorbs the boring parts; the interesting parts (sub-agent system prompts, tool sets, the structural guard, framework registry) stay 100% in this repo's code.
- **Lock-in is a non-issue.** Agent SDK ties us to Anthropic. Memory and principles already commit to Opus 4.7. Switching LLM providers would be a project-redefining decision that costs vastly more than rewriting orchestration. The SDK is OSS-licensed and TS-native, satisfying [personal-use-tradeoffs.md](../principles/personal-use-tradeoffs.md) without needing a paid-service ADR.
- **Reversible if learning value is wanted later.** The SDK uses `@anthropic-ai/sdk` underneath. If the user later wants to understand the loop deeply, the Coordinator can be rewritten on top of `messages.create()` directly without touching the Researcher / Critic / Cartographer sub-agents — each is a function-call boundary that doesn't care which side does the orchestration.

## Why not hand-roll

- The agent loop is conceptually simpler than (say) Effect-ts, but rewriting it doesn't deepen the parts of the system that actually matter for the "be critical of every finding" posture. Time spent on a custom loop is time not spent on the framework registry, the Hypothesis state machine, or the Citation invariants.
- Reversal cost from Agent SDK to hand-roll is small (one component, ~2 days). Reversal in the other direction (hand-roll to SDK) is similar. Either direction is cheap.

## Why not LangGraph

- Now a strictly worse fit than at Q4 deliberations. Topology B locked Coordinator + hierarchical sub-agents — exactly the shape the Agent SDK is built for, and exactly *not* the graph-state-flow shape LangGraph leverages.
- Python-first ecosystem with TypeScript as second-class.
- Bakes in opinions about state shape that fight `Result<T, E>` and pure-function rules in [language-and-types.md](../principles/language-and-types.md).

## Consequences

- The composition root in `apps/agent` wires Agent-SDK-defined sub-agents to Application ports. Sub-agent definitions live close to their use, not in a central registry.
- The structural guard from [docs/adr/0003-agent-topology.md](0003-agent-topology.md) (Hypothesis cannot reach `tested-supports` without a `CriticAttempt`) is enforced inside the Hypothesis aggregate, *not* by the SDK — domain rules stay domain rules even when the orchestration is library-managed.
- Sub-agent system prompts and tool sets are explicit code in this repo. The SDK does not "decide" what a Researcher or Critic is — those are project decisions, just plumbed through the SDK's primitives.
- If the SDK has a breaking pre-1.0 API change, the migration cost is bounded: orchestration glue, not domain code. Domain stays untouched.
