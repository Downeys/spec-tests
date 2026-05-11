# Memory architecture (PRODUCT principles)

These are constraints on the **product code Claude Code writes**, not rules about Claude Code's own behavior. The product is the runtime business-planning agent we are building inside this repo. The memory architecture below is what *that* agent operates against — *not* what Claude Code does during a Sandcastle issue.

For Claude Code's own behavior around the wiki and OpenBrain, see [claude-code-modes.md](claude-code-modes.md). The short version: **Claude Code does not write `wiki/` or ingest into OpenBrain during issue resolution.**

## OpenBrain is the source of truth

Sources, claims, citations, hypothesis statuses — all persisted state lives in **OpenBrain**: our `packages/external/openbrain/` adapter over a local Docker Postgres + pgvector instance. The wiki is a *derived projection*, not an independent store.

The name `OpenBrain` is preserved as the adapter's namespace because it is woven through the codebase, but it is **our code**, not a third-party library. We own everything: the schema, the migrations, the adapter, the Docker compose definition. Postgres and pgvector are pinned via the Docker image tag. Earlier framings of OpenBrain as a third-party library (after a brief consideration of [OB1](https://github.com/NateBJones-Projects/OB1)) were dropped because we use < 10% of OB1's surface and the rest of the system fights our domain model.

## Schema invariants (enforced at the External adapter)

The `packages/external/openbrain/` adapter enforces these at every write:

- **Append-only.** No updates, no deletes. New versions of an entity are new rows linked to the prior row by a `previousVersionId`. Postgres-level: revoke `UPDATE` and `DELETE` on the relevant tables; only `INSERT` is granted.
- **Claims require ≥ 1 citation.** Zod-validated at the write boundary. A claim insert without an accompanying citation insert in the same transaction fails — at the schema level, not the application level.
- **Citation integrity.** The citation row references real source and claim rows by ID, and the `span_hash` matches the source's content at the recorded retrieval time.
- **Every persisted record traces to a source.** Claims cite ≥ 1 source. Sources are inserted only from observed external content (web fetch, user input, file ingestion) — not invented from agent reasoning.
- **Source promotion on Citation write.** A web Source in `candidate` state (snippet-only, captured from a search hit) is automatically upgraded to `full` (full content fetched, parsed, content-hashed, stored) as part of the same transaction as the first **Citation** that references it. If the fetch fails (paywall, 404, 403), the Citation insert fails — the agent must retry with a different Source or escalate to the user to paste content manually. Non-web Sources are always `full` at ingestion. Snippet-only Sources never carry persisted Citations by construction. See [ADR-0008](../adr/0008-source-ingestion-two-tier.md).

If a write violates any of these, the adapter returns `Result<_, OpenBrainError>` rather than panicking. Use cases see the failure and respond.

## The product agent never invents persisted data

The **runtime business-planning agent** ingests sources, writes claims, writes citations. Each persisted item must trace to an observed input. If the runtime agent has a useful insight with no source, the right move is one of:

- Cite the *chain of prior claims with citations* it derived the insight from (the agent shows its work).
- Downgrade the insight to a "question" page (a different schema, no claim, no required citation).
- Surface it to the user for source-finding before persisting anything.

What the runtime agent **does not** do: write a claim row with `citations: []`. The schema refuses.

## The product agent never performs arithmetic on persisted values

Extracting a numeric value from a single cited quote is **NLP, not computation** — the LLM may parse `$250B` out of "the global B2B SaaS TAM is approximately $250B" and assign it as a **Quantitative Hypothesis** value. The Citation carries the verbatim quote; the Claim/Hypothesis carries the extracted number.

What the LLM may **not** do is perform arithmetic *between* numeric values. ROI, NPV, runway, break-even, growth rates derived from two data points, sensitivity bands — these run in deterministic code, never in an LLM call.

Concretely:
- Pure formula functions live in `packages/domain/projections/financial/`. Property-based tested via `fast-check`.
- Application-layer use-cases (the "endpoints") read **Quantitative Hypotheses** from OpenBrain via repository ports and invoke the formulas.
- The Renderer sub-agent's structured-base path *is* this — deterministic formulas pulling from the database, no LLM. The optional narrative-pass LLM call wraps the result in prose; it does not produce the numbers. (See [ADR-0003](../adr/0003-agent-topology.md).)

Why this is a separate principle from "agent never invents persisted data": a hallucinated qualitative claim is usually visible to the user on read-back. A wrong NPV looks identical to a right one. The structural defense is to keep the LLM out of the math path entirely. ADR follow-up captures this as its own decision.

## Wiki is a derived projection

The wiki is a filesystem of markdown pages compiled from OpenBrain data. Pages render claims with their hypothesis status and inline citations; cross-link via `[[wikilinks]]` between related claims, frameworks, and sources; expose YAML frontmatter for Obsidian compatibility.

Implications:
- The wiki has **no independent state** that isn't in OpenBrain. If the wiki and OpenBrain ever disagree, OpenBrain wins; the wiki is regenerated.
- The wiki renderer (`packages/external/wiki/`) does not validate citations — that already happened at the OpenBrain write. The renderer just displays what is there.
- The wiki is **Obsidian-compatible**: top-level `wiki/` folder so the user can open it as an Obsidian vault, YAML frontmatter, `[[wikilinks]]`, no special characters that confuse Obsidian.
- The wiki is **committed to git** and regenerated by an explicit, deterministic `pnpm wiki:regen` command — not auto-regenerated on use-case writes, not gitignored. See [docs/adr/0006-wiki-commit-policy.md](../adr/0006-wiki-commit-policy.md).

## Hypothesis state is a typed state machine in `packages/domain`

The state machine (transitions, allowed paths, illegal transitions) lives in [packages/domain/aggregates/hypothesis/](../../packages/domain/aggregates/hypothesis/) once scaffolded — see [domain-modeling.md](domain-modeling.md). Specific states and transitions are product decisions deferred to the next session, but the *shape* is fixed:

- States are a TypeScript discriminated union.
- Transition methods on the aggregate return `Result<void, IllegalTransition>`.
- Illegal transitions don't compile when matched exhaustively (TS strict + `switch-exhaustiveness-check`).

The Application layer orchestrates transitions: load the hypothesis from OpenBrain via the repository port, call the aggregate's transition method, save back. The persistence side and the invariant side stay separate.

## Retrieval order at runtime

The runtime agent has two retrieval surfaces with different jobs:

- **Wiki = digest.** Filesystem markdown, `[[wikilinks]]`-navigable, Obsidian-compatible. Pre-rendered narrative with inline citations. Used only for fast conversational read.
- **OpenBrain = RAG and source of truth.** Postgres + pgvector. Holds the full Claim ledger (including refuting Claims), verbatim Citation `quote` and `span`, and the source content the `span_hash` is computed from. Used for everything citation-grade or evidence-complete.

### Cutover rule

The wiki is consulted only for **conversational read-only retrieval**. The agent falls through to OpenBrain whenever it needs any of:

1. A verbatim **Citation** `quote` or `span` (the wiki summarises; it does not carry the original bytes).
2. The full **Claim** ledger for a **Hypothesis**, including refuting Claims that the wiki page may frame as "addressed."
3. A state-machine transition on a Hypothesis aggregate (load → mutate → save). The wiki is a projection, never a write target.
4. Deterministic rendering of a **Business Plan** / **Marketing Plan** / **Financial Projection** — these read OpenBrain directly per [ADR-0006](../adr/0006-wiki-commit-policy.md).

The fall-through is **mechanical, not LLM-judged** — tied to the *kind of operation* (citation-grade? state-mutating? rendering?), not to the LLM deciding "hmm let me dig deeper."

### Per-sub-agent retrieval

| Sub-agent | Default retrieval | Why |
|---|---|---|
| **Coordinator** | Wiki first, OpenBrain on any of the four cutover triggers | Conversational read; falls through mechanically when the operation kind requires it |
| **Researcher** | Always OpenBrain | Produces citation-grade output; cannot trust a digest |
| **Critic** | Always OpenBrain | Needs the full evidence ledger including refuting Claims; the wiki page frames the strategy, not the rebuttal pile |
| **Cartographer** | Both | Wiki to see how the strategy currently presents; OpenBrain when slotting decisions need underlying Hypothesis state |
| **Renderer** | Always OpenBrain | Renders the wiki itself; reading from the wiki is circular |

### Difference from Karpathy's RAG-wiki

[Karpathy's gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) treats the wiki *as* the RAG — the LLM browses it like a person browses Obsidian, and there is no separate database. Our hybrid differs deliberately: the wiki is the digest, OpenBrain (with pgvector) is the RAG. Vector retrieval, full Claim ledgers, span lookups, and source content all live in OpenBrain. The wiki is human-readable + Obsidian-compatible + LLM-skimmable for conversational read, but it is not the primary retrieval surface for evidence-bearing operations. See [ADR-0009](../adr/0009-wiki-is-digest-openbrain-is-rag.md).

### Summarisation and freshness

The wiki summarises OpenBrain content at render time using fixed templates per page kind (Hypothesis page, Strategic Framework page, Source page, Claim page). The optional narrative-pass LLM call from [ADR-0003](../adr/0003-agent-topology.md) is allowed for *prose glue* between facts; the facts themselves are deterministic rendering of OpenBrain rows. Wiki staleness vs current OpenBrain state is detected by per-page content-hash comparison; the chat UI surfaces a "wiki is N events behind" badge per [ADR-0006](../adr/0006-wiki-commit-policy.md). Stale wiki never affects citation-grade operations because those go to OpenBrain by construction.

## Backups are not optional

The OpenBrain database is the **irreplaceable artifact** of this system. Losing it undoes months of research. Even though this is a personal-use, attended product, OpenBrain backups are treated as production-grade. See [personal-use-tradeoffs.md](personal-use-tradeoffs.md) — backups appear under "NOT relaxed."

A `pg_dump` cron + a versioned snapshot directory is queued as a follow-up issue (see the plan file). The wiki, if committed to git, is implicitly backed up via the git history.
