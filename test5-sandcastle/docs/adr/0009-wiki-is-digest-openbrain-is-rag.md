# Wiki is the digest; OpenBrain is the RAG

The runtime agent treats the **wiki** (Obsidian-compatible markdown projection committed to git) as a *digest* for conversational read-only retrieval. **OpenBrain** (Postgres + pgvector) is the RAG and source of truth — vector retrieval over Claims/Sources, full Citation ledgers, verbatim quotes, and span lookups all live there. The wiki is consulted only for conversational read; any citation-grade, evidence-complete, state-mutating, or rendering operation reads OpenBrain directly. The fall-through is mechanical, tied to the kind of operation, not LLM judgment.

This is a deliberate departure from [Karpathy's RAG-wiki gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f), which treats the wiki itself as the primary retrieval surface for an LLM agent.

Vocabulary in [CONTEXT.md](../../CONTEXT.md). Cutover rule and per-sub-agent retrieval table in [memory-architecture.md](../principles/memory-architecture.md#L54). Wiki commit policy in [ADR-0006](0006-wiki-commit-policy.md).

## Considered Options

- **A — Karpathy-style: wiki is the RAG.** LLM browses the wiki via `[[wikilinks]]` and the file tree; pgvector indexes wiki pages; OpenBrain (if it exists) is just a write log. Single retrieval surface.
- **B — Wiki is the digest, OpenBrain is the RAG (chosen).** Hybrid two-layer model. Wiki is read-only digest committed to git; OpenBrain (Postgres + pgvector) is the source of truth and primary retrieval surface for citation-grade operations.
- **C — OpenBrain only, no wiki.** Drop the wiki entirely. Single source-of-truth surface; loses Obsidian compatibility and git-versioned digest.

## Why B over A

- **Audit-grade citation flows can't run on summarised content.** The Critic has to challenge a Hypothesis with the full Claim ledger including refuting Claims. The wiki summarises *the current strategy* — by construction, refuted/contradicted Claims get framed as "addressed" or downweighted in narrative. A wiki-as-RAG Critic would systematically miss the rebuttal pile. OpenBrain retains every Claim with its state, addressable by Hypothesis ID.
- **Verbatim quotes need source bytes.** Citation `span` and `quote` lookups require the stored full source content with `span_hash` matching at retrieval time (see [memory-architecture.md](../principles/memory-architecture.md) and [ADR-0008](0008-source-ingestion-two-tier.md)). The wiki paraphrases; OpenBrain holds the bytes.
- **Vector quality.** pgvector embeddings over OpenBrain **Claims** (atomic, well-scoped, the unit of citation) produce sharper retrieval than embeddings over wiki pages (paragraph-mixed narratives). Embedding the unit-of-citation is the right granularity.
- **State-machine transitions are write operations.** The wiki is by construction read-only and regenerated. **Hypothesis** mutations have to happen on the OpenBrain aggregate. Trying to do this through a wiki RAG retrieval pattern is a category error.
- **Determinism.** [ADR-0006](0006-wiki-commit-policy.md) already requires deterministic wiki regeneration. If the wiki were the RAG, every regen would invalidate vector indices — a coupling cost we don't want.

## Why not C

- **Loses the Obsidian-compatible digest.** A real personal-use product benefit: the user opens Obsidian and reads cited narrative without invoking the agent at all.
- **Loses the git-versioned audit trail.** [ADR-0006](0006-wiki-commit-policy.md) explicitly leverages git history of `wiki/` for "what did SWOT look like at the start of Q2." Drop the wiki, lose this.
- **Cost of keeping the wiki is small.** Deterministic projection function, pre-existing pattern. Removing it saves nothing meaningful.

## Where the line is

| Operation | Retrieves from |
|---|---|
| "What did we decide about buyer power?" (conversational read) | **Wiki** |
| "Quote Gartner's exact wording on TAM" | OpenBrain (verbatim Citation `quote` / `span`) |
| Critic challenging a Hypothesis | OpenBrain (full Claim ledger including refuting Claims) |
| Researcher forming a new Hypothesis from Claims | OpenBrain (vector retrieval over Claims/Sources) |
| Hypothesis state-machine transition | OpenBrain (load aggregate → mutate → save) |
| Render Business Plan / Marketing Plan / Financial Projection | OpenBrain (deterministic projection) |
| Cartographer slotting decisions | **Both** (wiki for current presentation, OpenBrain for underlying Hypothesis state) |

## Consequences

- **pgvector lives in OpenBrain only.** No vector index over the wiki. The wiki is filesystem markdown for humans and the Coordinator's conversational read; vector retrieval is OpenBrain's job.
- **Per-sub-agent retrieval defaults are mechanical** — Coordinator wiki-first; Researcher / Critic / Renderer always OpenBrain; Cartographer both. Encoded in each sub-agent's tool set, not in the LLM's judgment.
- **The Karpathy divergence is a feature, not a regression.** We pay the cost of two surfaces to get audit-grade evidence flows the single-surface pattern can't support. Anyone reading "Karpathy wiki pattern" + "pgvector" would assume wiki-as-RAG; this ADR exists specifically to disabuse that assumption.
- **The "wiki is N events behind" badge** (per [ADR-0006](0006-wiki-commit-policy.md)) is the only freshness signal the user needs. The wiki is the only stale-able retrieval surface, and it is only consulted for read-only conversation. Stale wiki never affects citation-grade operations.
- **Future direction.** If the wiki proves *too* paraphrased to be useful as a Coordinator digest (the user keeps falling through to OpenBrain anyway in conversational reads), the answer is denser/richer wiki rendering, not making the wiki the RAG. The cutover rule stays.
