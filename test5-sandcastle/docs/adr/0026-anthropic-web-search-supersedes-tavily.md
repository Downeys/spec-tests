---
status: accepted
supersedes: ADR-0005
---

# Anthropic `web_search` tool supersedes Tavily

The runtime **Researcher** and **Critic** sub-agents use **Anthropic's first-party `web_search` tool**, invoked through the Agent SDK ([ADR-0004](0004-anthropic-agent-sdk.md)), as the primary web-search capability — not Tavily. [ADR-0005](0005-tavily-for-web-search.md) is **superseded**.

This is not a retraction of ADR-0005's reasoning at the time it was written. ADR-0005 considered Tavily, Exa, Brave, and SearxNG — all third-party search APIs — and made the right call within that option set. It did **not** consider the SDK's first-party `web_search` tool because ADR-0004 (Agent SDK) and ADR-0005 (search) were decided as separate concerns. With both decisions on the table, plus the rejection of Tavily-side content extraction at PRD-4 grilling time (we own the bytes via our own promotion fetcher per [ADR-0008](0008-source-ingestion-two-tier.md)), the original Tavily justification mostly dissolved.

Vocabulary in [CONTEXT.md](../../CONTEXT.md). Source ingestion lifecycle in [ADR-0008](0008-source-ingestion-two-tier.md). Sub-agent invocation audit in [ADR-0021](0021-sub-agent-invocations-as-append-only-audit-aggregates.md).

## Why supersede now

ADR-0005's primary value pillars:

1. **"Bundles search and content extraction in one API."** Rejected at PRD-4. We own the promotion-tier bytes ourselves so `span_hash` is stable across Tavily extractor changes. With extraction off the table, this pillar is gone.
2. **"Clean structured results with relevance scores."** Anthropic's `web_search` returns the same — URL + title + snippet — as a tool_result block visible in the message stream. Same structural quality.
3. **"Free tier covers single-user volume."** Anthropic `web_search` pricing (~$10/1k searches) is comparable to Tavily's $30/10k paid tier; both are negligible at personal-use scale and both have functional free coverage.

What Anthropic `web_search` adds that Tavily doesn't:

- **One fewer dependency, one fewer API key.** `TAVILY_API_KEY` leaves the runtime config. The `packages/external/research/tavily/` adapter is not built.
- **Native to the Agent SDK we already chose.** No HTTP adapter to write or maintain; the SDK exposes `web_search` as a tool the Researcher's `tools` array opts into.
- **Coherent provider story.** Anthropic for LLM and search; Voyage for embeddings ([ADR-0022](0022-voyage-for-embeddings.md)); our code for everything else. One fewer relationship to manage.

What we give up:

- **Search execution happens server-side at Anthropic, not in our adapter code.** We can't intercept errors before they reach the model. In practice the model surfaces failures in its next turn and the Researcher handles them via its own retry/skip logic; we observe everything we need via tool_use / tool_result blocks for [ADR-0021](0021-sub-agent-invocations-as-append-only-audit-aggregates.md) audit purposes.

## Considered options at supersession time

- **A — Switch to Anthropic `web_search` (chosen).** Above.
- **B — Keep Tavily.** Reasoning above shows the original justification doesn't survive. Sticking with Tavily would mean keeping a dependency for thin operational benefit.
- **C — No search API at all; user provides URLs/content.** Considered and rejected. The Researcher's value is meaningfully diminished if the user has to do source discovery manually; this would convert the agent from a research tool into an extraction tool. If the audit-grade posture later demands user-vetted sources only, that's a separate, bigger product decision worthy of its own ADR.

## Consequences

- **`packages/external/research/tavily/` is not created.** The `WebSearcher` port from [ADR-0005](0005-tavily-for-web-search.md) is also not created — the Researcher invokes `web_search` directly through the Agent SDK's tools mechanism, not through an Application port.
- **`TAVILY_API_KEY` is not in runtime config.** `ANTHROPIC_API_KEY` and `VOYAGE_API_KEY` are the only third-party keys.
- **The candidate→full promotion fetcher is still ours** ([ADR-0008](0008-source-ingestion-two-tier.md)). `web_search` returns URLs; our fetcher fetches and hashes the bytes for `span_hash` stability. Provider switch doesn't affect the bytes-ownership invariant.
- **Search-tool failures are recorded as `failureMode: 'tool-error'` on `SubAgentInvocation`** per [ADR-0021](0021-sub-agent-invocations-as-append-only-audit-aggregates.md). The example "Tavily timed out" in that ADR is now "web_search returned no useful results" — same audit shape, different provider name.
- **Future search-provider swap is harder, not easier.** Without a `WebSearcher` port abstraction, swapping `web_search` for a different provider later means rewriting the Researcher's tool-binding rather than swapping an adapter. Acceptable: the cost of a port we wouldn't use is real, and a port-when-needed refactor is bounded.
- **Recorded fixtures for tests** ([testing.md](../principles/testing.md)) — Anthropic `web_search` tool calls are recorded via the same fixture mechanism that captures Anthropic message responses; one fewer fixture taxonomy.
