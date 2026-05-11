# Voyage `voyage-3` for OpenBrain embeddings

OpenBrain's pgvector index over **Claims** (per [ADR-0009](0009-wiki-is-digest-openbrain-is-rag.md)) needs a fixed embedding model so the `vector(N)` column dimension can be pinned at migration time. We use **Voyage AI `voyage-3` (1024 dimensions)** via a hosted HTTP adapter behind an `EmbedderPort` in `packages/external/openbrain/`. Voyage is the embedding model Anthropic explicitly recommends pairing with Claude, so it is the boring/idiomatic choice for this stack.

Vocabulary in [CONTEXT.md](../../CONTEXT.md). Embedding granularity (per-Claim, not per-wiki-page) and retrieval cutover rule in [ADR-0009](0009-wiki-is-digest-openbrain-is-rag.md).

## Considered Options

- **A — Voyage `voyage-3` (1024 dims), hosted (chosen).** Anthropic's recommended companion to Claude. Top MTEB at this size class. Same operational pattern as Anthropic ([ADR-0004](0004-anthropic-agent-sdk.md)) — a pinned API key + HTTP adapter in External. User already holds a Voyage subscription.
- **B — Ollama `nomic-embed-text` (768 dims), local.** Fully offline, fully reproducible. Adds an Ollama container to docker-compose with the model pre-pulled in the entrypoint (~270MB). Slightly weaker retrieval at MTEB but indistinguishable at the low-hundreds-of-Claims scale of one personal business plan. Rejected because we already accept hosted dependencies for two more critical surfaces (LLM and search), so the audit-grade posture isn't strengthened by going offline for embeddings alone, while compose complexity does grow.
- **C — OpenAI `text-embedding-3-small` (1536 dims), hosted.** Cheapest hosted option. Quality is fine. Rejected because it would introduce OpenAI as a fourth provider purely for embeddings — the only place an OpenAI key would appear in the system. Ergonomically incoherent.

## Consequences

- **Schema lock.** `vector(1024)` is wired into the OpenBrain migration. Switching models later (e.g. to a hypothetical `voyage-4` at a different dimension) is a full re-embed of every Claim plus a `vector(N)` column migration. Acceptable cost; called out so it's not a surprise.
- **`EmbedderPort` interface in External.** The adapter is the only thing that knows about Voyage. Domain and Application stay provider-agnostic. Swapping providers is a one-adapter change _plus_ the schema migration above — the architecture takes the easy half.
- **Population is deferred.** PRD-4 declares the column but does not embed anything; the Researcher/Coordinator code paths that produce embeddings on Claim writes land in a later PRD. The column starts NULL and the migration permits NULL until the embedding-population PRD adds the NOT NULL.
- **`VOYAGE_API_KEY`** joins `ANTHROPIC_API_KEY` and `TAVILY_API_KEY` in the runtime config. Same handling pattern: required at runtime config validation, never persisted, never logged.
