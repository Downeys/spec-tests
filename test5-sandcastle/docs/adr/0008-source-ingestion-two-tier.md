# Source ingestion — two-tier (candidate → full) with promotion on Citation write

The runtime agent ingests **Sources** in two tiers. **Candidate** Sources are snippet-only records captured from web-search hits — URL + retrieved snippet text + retrievedAt + minimal metadata, cheap. **Full** Sources have their full response bytes fetched, content-hashed verbatim, and stored — the only state from which a **Citation** is allowed to point. Parsing happens _per read_, by a versioned extractor — the stored bytes are always the raw response, never extractor output, so an extractor upgrade does not invalidate `content_hash`. Promotion from candidate → full happens automatically at the OpenBrain write boundary as part of the transaction inserting the first **Citation** that references the Source. Non-web Sources (user-pasted PDFs, text, datasets) bypass the candidate tier entirely; metadata is filled in by the Researcher through conversational follow-up rather than an upload form.

Vocabulary in [CONTEXT.md](../../CONTEXT.md). Schema invariant in [memory-architecture.md](../principles/memory-architecture.md). Web search itself covered by [ADR-0026](0026-anthropic-web-search-supersedes-tavily.md).

## Considered Options

- **A — Search-only / snippet-as-Source.** Researcher reads search snippets, extracts Claims directly from snippet text. Source row stores URL + snippet + retrievedAt; full document never fetched. Lightest possible.
- **B — Two-tier with promotion (chosen).** Default is snippet-only Source records during browsing. On the first Citation write, the Source is promoted: full-fetch + content-hash + store, in the same transaction. Failed promotion fails the Citation.
- **C — Always-full ingestion.** Every URL the Researcher visits is fully fetched, parsed, content-hashed, stored. Most rigorous; expensive at personal-use research scale.

## Why B over A

- **Citation integrity.** [memory-architecture.md](../principles/memory-architecture.md) requires that `span_hash` matches the source's content at retrieval time so a Citation can be re-verified later. Without stored full content, this rule degrades to trust-on-faith — A breaks the invariant. B preserves it for everything that matters (every persisted Citation points to a `full` Source).
- **Snippet drift.** Search-tool snippets change between runs. A Citation backed by a snippet captured today might not match the snippet returned tomorrow, with no way to tell whether the source itself changed or just the snippet excerpt. Stored full content gives the Citation something stable to hash against.

## Why B over C

- **Bandwidth/storage at personal-use scale.** A typical search-driven research pass touches dozens to hundreds of URLs as the Researcher explores. Full-fetching all of them is wasteful — most never become Citations. Promotion-on-write keeps the cost proportional to _citations made_, not _URLs visited_.
- **Failure-mode locality.** Under C, every URL is a potential 404/paywall failure point during browsing — even ones that don't matter. Under B, fetch failures only occur where they're meaningful: when the agent is trying to persist evidence. The failure becomes an actionable conversational moment ("this URL is dead; want to find a different source?") instead of background noise.

## Where the line is

| Trigger                                                  | Behavior                                                                                                                                                                                                 |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web-search hit (Anthropic `web_search` tool result)      | Source stored as `candidate` (snippet + URL + retrievedAt) if not already known. No fetch.                                                                                                               |
| Claim/Citation write referencing a `candidate` Source    | External adapter full-fetches → content-hashes the raw response bytes → stores bytes verbatim → flips `status: full`. All in one transaction. Parsing happens later, per read, by a versioned extractor. |
| Claim/Citation write referencing a Source already `full` | No fetch. Just insert.                                                                                                                                                                                   |
| Promotion fetch fails (paywall / 404 / 403)              | Citation insert fails. Agent retries with another Source or escalates to the user to paste content.                                                                                                      |
| User pastes PDF / text / dataset                         | Source ingested directly as `full`. Researcher then asks chat follow-ups to fill in metadata (publication, date, URL if any) before allowing Citations.                                                  |

## User-paste path: agent-resolves-metadata via follow-up

When the user pastes content without metadata, the Researcher's job is to ask conversational follow-ups ("which publication is this from? roughly when?") and persist metadata as the user supplies it. **No structured upload form** — ingestion is chat-driven so it composes with the rest of the agent UX. The persisted Source has `kind: 'user-pdf' | 'user-text' | 'user-dataset'` and the verbatim pasted content; metadata fields are filled in incrementally and may start partially `null`.

## Consequences

- **Schema additions:** `Source.kind` (discriminator), `Source.status: 'candidate' | 'full'`. Status is enforced at the write boundary — the OpenBrain adapter rejects a Citation whose Source is `candidate` and the same transaction did not include a successful promotion.
- **Candidate pruning** (TTL — e.g. drop unpromoted candidates older than N days): tunable, deferred to the implementation issue. Default-on so OpenBrain doesn't accumulate snippet records forever.
- **Researcher prompt** is updated to: search liberally; only persist Citations when a Claim is actually being written; when the user pastes content, ask conversational follow-ups before Claim writes rather than block on a structured form.
- **Failed-promotion UX** in chat needs surfacing: when a fetch fails during a Claim write, the agent has to communicate "I tried to cite source X but couldn't fetch it" and offer alternatives. Specifics deferred to the chat UI implementation issue.
- **Re-promotion / refresh.** A Source that's `full` can have its content re-fetched later (e.g. user notices a Claim looks stale; agent re-fetches and re-hashes; if `span_hash` changes, the Citation transitions to `revised` per [domain-modeling.md](../principles/domain-modeling.md)'s reified-association lifecycle). Mechanism deferred to a follow-up issue but the data shape supports it.
- **Non-web Sources are uniform.** PDFs, pasted text, datasets all use the same `full`-from-ingestion flow with `kind` discriminating the storage and parser path.
