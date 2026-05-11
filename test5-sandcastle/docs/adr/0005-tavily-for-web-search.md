---
status: superseded by ADR-0026
---

# Tavily for web search (paid-service exception)

> **Superseded by [ADR-0026](0026-anthropic-web-search-supersedes-tavily.md).** The Researcher and Critic now use Anthropic's first-party `web_search` tool through the Agent SDK; no third-party search provider is used. This ADR is preserved for historical context — the option-set evaluation here did not include the Agent SDK's first-party tool, which became the reason for supersession. The body below is the original decision text, unchanged.

The runtime **Researcher** and **Critic** sub-agents use **Tavily** as the primary `WebSearcher` adapter. This is a deliberate exception to the [tech-selection rule](../principles/personal-use-tradeoffs.md) of "default to free / OSS"; the rule requires a paid-service ADR — this is it.

## Considered Options

| Option                      | Why considered                                                                                                                                                     | Why not chosen                                                                                                                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tavily (chosen)**         | Purpose-built for AI agents; clean structured results with relevance scores; bundles search and content extraction in one API; free tier covers single-user volume | —                                                                                                                                                                                                                               |
| **Exa (formerly Metaphor)** | Semantic search; strong for "find papers/articles like X"                                                                                                          | Less mature for general web research; the framework chain (PESTEL, 5 Forces, SWOT, STP, 4 Ps, FeedbackChannels) needs broad general web search, not academic-paper retrieval                                                    |
| **Brave Search API**        | OSS-friendly company; generous free tier (2000/mo)                                                                                                                 | Less curated for AI consumption — results need more cleaning; no built-in content extraction                                                                                                                                    |
| **SearxNG (self-host)**     | Free, OSS, no vendor lock-in — would honour the tech-selection rule's default                                                                                      | Operationally fragile: scrapes upstream engines, frequently breaks, rate-limited. The tech-selection rule's exception clause "(a) the open alternative would burn a meaningful fraction of build time on operating it" applies. |

## Why Tavily satisfies the paid-service exception

The tech-selection rule allows paid services when **(a)** the OSS alternative would burn meaningful build-time on ops, **or** **(b)** the proprietary option is meaningfully better at the specific job. Tavily satisfies both:

- **(a) SearxNG's operational cost is real.** Self-hosted scraping of search engines is brittle and a recurring time-sink. For a single-operator, attended product, that ops time is precisely what the personal-use trade-offs want to free up.
- **(b) Tavily's structured output saves work elsewhere.** It returns clean, scored, content-included results — the Researcher's job becomes "decide what claims to extract from these results," not "parse this messy HTML." That difference shows up across every Researcher pass.

## Cost ceiling

- Free tier: ~1000 searches / month. Likely covers single-user usage for the early phase.
- A heavy strategy-building session (filling SWOT + 5 Forces + Positioning end-to-end with Researcher and Critic both running) can plausibly approach 200-500 searches in a sitting. One full strategy refresh per month likely fits free tier; multiple per month means paid (~$30/month for 10k searches).
- Accepted ceiling: **$30/month**. If usage exceeds that, revisit in a follow-up ADR — it's a signal that either search discipline or hypothesis-generation is over-eager.

## Architecture: port-based, single provider for v0

- The `WebSearcher` port lives in `packages/application/ports/web-searcher.ts`. The Tavily adapter lives in `packages/external/research/tavily/`.
- **Single provider for v0.** Adding additional providers later (Exa for academic-leaning passes, Brave as a fallback, etc.) is a new adapter file, not a refactor.
- **Critic uses the same provider.** Multi-provider Critic for source-diversity is deferred — it's optional complexity that doesn't pay back unless single-provider blind spots show up empirically.
- Recorded fixtures for tests, per [testing.md](../principles/testing.md#L48-L57) — Tavily calls cost money and aren't deterministic; tests use the recorded-fixture pattern with explicit re-record flag.

## Consequences

- The project depends on Tavily's continued availability and pricing. If Tavily shuts down, gets acquired, or hikes prices, swap to another adapter — port-based architecture makes this a localised change.
- API key in `.env`, gitignored, never logged — per [personal-use-tradeoffs.md](../principles/personal-use-tradeoffs.md) "Secrets handling" line.
- Specialized sources (academic via OpenAlex, financial via SEC EDGAR, government data) are **deferred** until concrete strategic needs surface — they'd be additional `WebSearcher` adapters or new ports altogether (e.g. `AcademicSearcher`).
