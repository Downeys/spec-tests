# Pitfalls Research

**Domain:** Single-user local AI-agent app — hybrid Karpathy wiki + OneBrain memory, multi-agent business-planning, TS/Node + Postgres + pgvector + Obsidian + Claude Agent SDK
**Researched:** 2026-04-25
**Confidence:** HIGH on hybrid-pattern + single-writer + investor-grade pitfalls (Nate B Jones explicitly flagged most of these; Karpathy gist endorses several); HIGH on stack-specific pitfalls (verified against 2026 community sources); MEDIUM on a small number of "predicted" pitfalls based on architecture inspection (no field reports yet — flagged inline).

This document is opinionated and project-specific. Generic advice ("write tests", "use TypeScript carefully") has been filtered out. Every pitfall maps to a phase from `ARCHITECTURE.md` ("Build Order — The Smallest End-to-End Slice Path": Slice 0 → Slice 5).

---

## Critical Pitfalls

These are the pitfalls that would either kill the project or force a major rewrite if hit.

### Pitfall 1: Wiki-as-Confident-Misinformation (the Nate B Jones failure mode)

**What goes wrong:**
The compilation agent runs against an OneBrain row set that has gone stale (a `validated` claim was actually refuted by a later source, but the supersede edge wasn't written; or a `hypothesis` was promoted to `validated` without evidence). The wiki regenerates and produces a beautifully written page that *reads with authority* and contains factually wrong statements. The user (or, worse, an investor) reads the wiki, trusts the prose because it has the shape of synthesis, and acts on bad information.

This is the explicit failure mode Nate flagged: *"stale wiki = active misinformation that reads with confidence. Old syntheses become wrong but the page sounds authoritative."* A pure-DB system fails by saying "I don't have that"; the hybrid wiki layer fails by saying something confidently wrong.

**Why it happens:**
- The compilation agent treats every claim with `status='validated'` as ground truth even when the supporting evidence is months old or the source has since been retracted.
- Confidence (`numeric(3,2)`) and narrative voice are decoupled — the page narrates a 0.55-confidence claim with the same prose register as a 0.92-confidence claim.
- The renderer's "1–2 sentence prose connectives" (Pattern 2 in ARCHITECTURE.md) launder hedged claims into smooth declarative English.
- Contradictions sit in `edges.kind='contradicts'` rows but the rendering filter or grouping logic accidentally hides one side (e.g. dropping the lower-confidence claim).
- LLM-written intros generalize beyond what the underlying claim actually says.

**How to avoid:**
1. **Confidence is rendered visibly on every claim citation** — no exceptions. The frontmatter `confidence_avg` / `confidence_min` already exists; enforce a rule that every quoted claim block shows `[hypothesis 0.55]` / `[validated 0.92]` inline. ARCHITECTURE.md Pattern 2 already specifies this — don't let it slip during implementation.
2. **Hedge-preserving prose constraints in the LLM intro prompt.** The bounded prompt for "section intros" must include: "Reflect the lowest confidence in the group; if any claim in the group is < 0.6, the intro must use hedging language ('preliminary evidence suggests', 'one source indicates'). Do not generalize beyond the literal claim text."
3. **Contradiction blocks are required even when one side has higher confidence.** ARCHITECTURE.md spells this out — operationalize it as a unit test on `renderContradictions()` that fails if the lower-confidence side is omitted.
4. **`stale: true` banner at the top of any page where `last_evidence_at > 90 days`** (already in design — make it loud, not subtle).
5. **Promptfoo eval case**: ingest one source, then ingest a contradicting source, recompile, assert both claims appear in the rendered page with their respective contradiction edge.
6. **Periodic "wiki drift" diff review** — once a week, the user runs a CLI that lists pages where `confidence_avg` dropped > 0.15 between the last two compile runs. These are pages drifting toward staleness.

**Warning signs:**
- A wiki page that reads more confidently than its frontmatter `confidence_avg` would suggest.
- Compile artifacts where `source_claim_ids` no longer overlap with the current top-N claims for that page's tag set.
- The user notices a claim in the wiki they don't remember the agent telling them about (= LLM intro hallucination).
- Devil's-advocate sub-agent's counter-claims are systematically excluded from rendered pages.

**Phase to address:**
Slice 2 (compilation hardening — confidence rendering, contradiction preservation), reinforced in Slice 4 (wiki maturity — stale banner, lint pass).

**Severity:** PROJECT-KILLING. This is the entire reason the user is building the hybrid pattern instead of pure-Karpathy. If the wiki produces confident misinformation, the value proposition collapses.

**Domain specificity:** Hybrid-pattern-specific. Pure-DB systems can't have this failure (they fail by gaps, not by smooth confident wrongness). Pure-wiki systems have this failure but you accept it as the cost.

---

### Pitfall 2: Provenance Chain Breaks Between OneBrain Rows and Wiki Claims

**What goes wrong:**
A wiki page cites `[[claim:01J9XABC]]` but that ULID no longer exists in the `claims` table (it was deleted, or its ID was regenerated, or it was superseded without a `superseded_by` link). When the user clicks the citation in chat or runs a verification query, the chain to evidence is broken. "Defensible by construction" — the project's stated core value — fails silently.

**Why it happens:**
- Someone (the agent, a script, a manual SQL fix in pgAdmin) deletes a claim row directly instead of going through the supersede flow.
- ULID regeneration during a migration or a "let me clean up the database" moment.
- The compile artifact's `source_claim_ids` array becomes stale because `compile_artifacts.source_claim_ids` was captured at one moment but the corresponding claim row was modified (text changed) afterwards — citation points to the right ID but the claim text on display is different from what was rendered.
- Embedding re-runs that produce different IDs (ULIDs are app-generated, but a refactor that regenerates them silently is plausible).
- Manual edits to vault markdown that introduce citations to claim IDs that don't exist (forbidden by single-writer discipline, but accidents happen).

**How to avoid:**
1. **`claims.id` is forever immutable.** Enforce in code: there is no `updateClaimId()` function in `src/onebrain/repo.ts`. Period.
2. **Deletion is forbidden in the repo layer.** Only `supersede(claimId, newClaimId)` exists, which writes the new claim, sets `superseded_by`, sets `status='superseded'`, and writes a `supersedes` edge. ARCHITECTURE.md already specifies this — make it the only path.
3. **Foreign-key-on-soft-delete constraint:** add a periodic check (lint pass) that all `compile_artifacts.source_claim_ids` exist as `claims.id`. Any orphan = audit alert.
4. **Citation resolution at chat time.** When the chat UI renders `[[claim:01J9XABC]]`, the backend resolves the ULID against the live `claims` row and shows current `text` + `status` + `confidence`. If the row is `superseded`, show the supersede chain. If the row is missing, render `[broken citation]` in red — never silently hide.
5. **Single-writer discipline on the vault is a HARD rule.** Tool-gate `vault_write_atomic` to the compilation sub-agent only (already designed). Add a CI/precommit check that no markdown file in `vault/` was modified in a git commit that does not also update `compile_runs` — the user shouldn't be hand-editing the vault at all.
6. **Backup the OneBrain DB and the vault together** (see Pitfall 17 — they are paired artifacts; restoring one without the other breaks provenance).

**Warning signs:**
- "I clicked a citation in chat and got nothing back."
- The lint pass reports orphan `claim_ids` in any `compile_artifacts` row.
- `git diff` on vault files between two compile runs shows changes that don't correspond to any OneBrain write.

**Phase to address:**
Slice 0 (immutable IDs, repo-layer guarantees), Slice 2 (compile_artifacts integrity), Slice 4 (lint pass orphan check).

**Severity:** PROJECT-KILLING. The product's promise is "defensible by construction." Broken provenance breaks defensibility.

**Domain specificity:** Hybrid-pattern-specific. The wiki-as-compiled-view promise depends on these IDs being stable forever.

---

### Pitfall 3: Compilation Idempotency Bugs — Recompile Loops or Silent Skips

**What goes wrong:**
Two failure modes, both bad:
- **Loop**: every recompile produces a different content hash for the same claim set (because of nondeterministic LLM intros, timestamp-in-frontmatter, or unsorted claim ordering). The diff-based plan then thinks every page changed every run; the cron rewrites every page every 6 hours; git diff is constantly noisy; Obsidian's graph view never stabilizes.
- **Silent skip**: a real change to a claim doesn't trigger a recompile of a page that depends on it (because the dependency mapping in `src/compilation/plan.ts` missed an edge type). The wiki silently goes stale.

**Why it happens:**
- LLM intros are nondeterministic at temperature > 0. Same input → different prose → different hash.
- `generated_at: ISO timestamp` in frontmatter changes every run, so the hash is never stable.
- Claim ordering inside a section depends on iteration order of a `Set` or `Map`, which is insertion-order in JS but the insertion order can vary by query plan.
- The dependency graph in `plan.ts` enumerates `topic_tags` and `framework_tags` but forgets `edges.kind='about_entity'` or vice versa.
- `compile_artifacts.source_claim_ids` includes claim IDs that don't actually appear on the rendered page (over-claiming dependencies → too many recompiles).

**How to avoid:**
1. **Hash excludes nondeterministic fields.** Compute `content_hash` from a *normalized* version of the markdown that strips `generated_at`, `compile_run_id`, and `content_hash` itself from frontmatter before hashing. The DB record stores the full markdown, but the hash is over a canonical form.
2. **LLM intros are pinned at temperature 0** AND **cached by input hash** — the same claim set produces the same intro text. Implement a `llm_intro_cache(input_hash, intro_text)` table or in-memory LRU keyed by `hash(claim_ids + section_kind)`.
3. **Deterministic claim ordering** — sort claims by `(claim.created_at, claim.id)` ASC before rendering. Specify this in `src/compilation/render/page.ts` and add a unit test.
4. **Dependency map is a single function with explicit cases.** `claimToPagePaths(claim, edges): string[]` enumerates every kind that produces a dependency. Add a test that every `edge_kind` value has a code path. This way, when you add a new edge kind, the type system reminds you to update the dependency map (use TS exhaustive switch with `never`).
5. **Idempotency test in Slice 2.** Run the compilation agent twice in a row with no DB changes between. Assert: zero file writes on the second run; assert: both runs' artifacts have the same `content_hash` for every page path.
6. **Recompile loop detection.** Log a warning if the same `page_path` was rewritten in three consecutive runs without any `claims.updated_at > previous_run.finished_at` matching its dependency set.

**Warning signs:**
- `git diff` on the vault shows churn after compiling but no semantic change in OneBrain.
- `compile_runs.pages_written` is consistently equal to `pages_planned` across runs.
- A claim updated 3 days ago doesn't appear on the page that should cite it.
- LLM intro cache hit rate < 90% in a steady state.

**Phase to address:**
Slice 2 (compilation + cron). This is the core compilation engineering concern.

**Severity:** Causes major rework. Compilation churn destroys git history's value as audit trail; silent skips break the "wiki always reflects OneBrain" invariant.

**Domain specificity:** Compilation-pipeline-specific. Doesn't apply to pure-DB or pure-wiki.

---

### Pitfall 4: Drift Between Drizzle Schema and node-pg-migrate Migrations

**What goes wrong:**
The constraint says `node-pg-migrate` is the schema source of truth and Drizzle is "query-only" with hand-mirrored types in `src/onebrain/schema.ts`. In practice, someone forgets to update the Drizzle mirror after a migration, and Drizzle queries silently return stale type information. Worse: `drizzle-kit push` is accidentally invoked and overwrites the migration-applied schema with the Drizzle TS schema — destroying data or constraints.

**Why it happens:**
- Two sources of truth for the same schema. Even with discipline, drift accumulates.
- `drizzle-kit` commands include `push` (apply Drizzle TS schema directly to DB) and `pull` (regenerate Drizzle TS from DB). Either one used at the wrong time corrupts the model.
- Type inference from Drizzle returns stale shapes when the TS schema lags behind migrations — TypeScript compiles fine, but runtime `SELECT` produces extra columns the type system doesn't know about; Zod parsing silently drops them.
- Constraints in migrations (CHECK, partial indexes, custom types like `claim_status` enum) don't roundtrip to Drizzle's schema fluently.

**How to avoid:**
1. **Drizzle TS schema is generated from migrations, never written by hand.** After every migration, run `drizzle-kit pull` to regenerate `src/onebrain/schema.ts`. Commit the regenerated file.
2. **`drizzle-kit push` is forbidden.** Add an explicit script that fails: `"db:push": "echo 'FORBIDDEN — use migrations/ + npm run db:migrate'; exit 1"`. Document in CONTRIBUTING and CLAUDE.md so the agent doesn't suggest it.
3. **CI / precommit check**: schema parity test. Boot a clean DB, apply migrations, run `drizzle-kit pull` to a temp file, diff against the committed `schema.ts`. Fail if different.
4. **Custom Postgres types (the enums in ARCHITECTURE.md)** need explicit Drizzle `pgEnum()` declarations. Add a test that asserts the enum values in `schema.ts` match the migration's `CREATE TYPE` exactly.
5. **`gen_random_uuid()` and ULID generation are app-side.** Don't let migrations declare DEFAULT values that Drizzle's `INSERT` expects to omit — keep ID generation in `src/onebrain/ids.ts`.

**Warning signs:**
- TypeScript compiles, but `select().from(claims)` returns objects with `undefined` for a column that exists in the DB.
- pgAdmin shows constraints (e.g. `confidence` CHECK) that don't appear in Drizzle's `pgTable` definition.
- Migration history in `pgmigrations` table doesn't match the `migrations/` directory.
- `npm run db:migrate` succeeds but a Drizzle query later throws "column does not exist."

**Phase to address:**
Slice 0 (during initial schema). The drift discipline must be in place from migration #1.

**Severity:** Causes rework. Recoverable but corrosive — small drift compounds and you eventually distrust your own schema.

**Domain specificity:** Stack-specific (TS + Drizzle + node-pg-migrate combo). Does not apply if either tool were dropped.

---

### Pitfall 5: pgvector HNSW Index Footguns — Dimension Mismatch, Memory Bloat, Index-Not-Used

**What goes wrong:**
Several distinct failure modes:
- **Dimension mismatch on swap**: switch from Voyage 3.5 (1024) to OpenAI text-embedding-3-large (3072) without altering the column type → all `INSERT`s fail with `expected 1024 dimensions, got 3072`. Or worse: someone sets `output_dimension=512` on Voyage and the column is still `vector(1024)` → silent zero-padding is NOT pgvector's behavior; insert fails, but a poorly-written try/catch swallows the error and the row goes in without an embedding.
- **HNSW index not used at query time**: queries with `WHERE` clauses that filter on `topic_tags && ARRAY[...]` AND `ORDER BY embedding <=> $1` may not hit the HNSW index because the planner chose a sequential scan (HNSW index doesn't support arbitrary `WHERE` filtering at index time without `iterative scans` enabled in pgvector 0.8+).
- **Memory bloat**: HNSW build of 100k+ vectors with default `maintenance_work_mem=64MB` blows up build time to hours and produces a fragmented index. After heavy churn (deletes/updates), the index needs `REINDEX` but no one runs it.
- **Insert performance cliff**: HNSW indexes make INSERTs ~5x slower than no index. Bulk loading the OneBrain initial seed becomes painful.

**Why it happens:**
- The Voyage embedding dimension is set in two places (the SDK call and the column type) with no enforcement that they match.
- HNSW + filtered query is a pgvector subtlety — without `SET hnsw.ef_search` and pgvector 0.8+ iterative scans, filtered queries fall back to seq-scan past a certain selectivity threshold.
- `maintenance_work_mem` defaults are container-defaults (64MB), not tuned for HNSW build.
- Voyage 3.5's 32k context allows long inputs; embedding a 30k-character source produces fine vectors but is 5–10x more expensive than chunking.

**How to avoid:**
1. **Single source for embedding dimension**: a constant `EMBEDDING_DIM = 1024` in `src/onebrain/embed.ts`. The migration creates `vector(1024)` from a TypeScript-emitted SQL fragment that imports the same constant (or via a `${EMBEDDING_DIM}` template at migration build time). Drift becomes a compile error.
2. **Embedding insert is wrapped**: `repo.writeClaim()` calls `embed(text, { dim: EMBEDDING_DIM })`. The Voyage client asserts the returned vector length === `EMBEDDING_DIM`; mismatch throws. No try/catch swallowing.
3. **Verify the index plan with `EXPLAIN`** in a test: run a representative query (claim search by topic tag + cosine distance), assert the plan uses `Index Scan using claims_embedding_hnsw`. Add to the integration test suite in Slice 2.
4. **Set `hnsw.ef_search = 80` per query** for the chat agent's claim retrieval (already in ARCHITECTURE.md — operationalize it).
5. **Bump `maintenance_work_mem` for build**: in `docker-compose.yml`, set `command: postgres -c maintenance_work_mem=512MB -c shared_buffers=512MB`. At single-user scale this costs nothing and removes a footgun.
6. **Chunking strategy for `sources.embedding`**: cap source-level embedding at first 4k chars (already in ARCHITECTURE.md). Don't embed full 30k articles — cost compounds.
7. **`REINDEX` job** in the scheduled compile (weekly): runs when `pg_stat_user_indexes` shows fragmentation > 30%. Logs to `event_log`.

**Warning signs:**
- Slow chat responses (`> 2s`) on simple "search claims about X" queries — likely seq-scan.
- Voyage API errors about dimension or token count.
- Postgres logs showing "could not extend index" or HNSW build OOMs.
- `INSERT INTO claims` taking > 100ms (should be sub-50ms with embedding).

**Phase to address:**
Slice 0 (embedding dimension constant + insert assertion); Slice 2 (EXPLAIN-based plan tests, REINDEX job).

**Severity:** Mid-severity. Fixable but produces user-visible slowdowns or silent missing data.

**Domain specificity:** Stack-specific. pgvector + Voyage interaction.

---

### Pitfall 6: Sub-Agent Result Pollution into the Coordinator Context

**What goes wrong:**
The Claude Agent SDK isolates sub-agent contexts (each gets its own context window), but the sub-agent's *final message* returns to the coordinator. If the research sub-agent returns "I read these 14 articles and here's everything I found: [3000-word dump]", the coordinator's context window inflates with that dump — across 5 sub-agent invocations in one chat turn, the coordinator's context blows past 100k tokens, latency degrades, and eventually the coordinator's reasoning quality drops because too-much-context causes attention dilution.

A second variant: the research sub-agent's final message smuggles claims into the coordinator's reasoning that *weren't* written to OneBrain (because the sub-agent decided they were "too speculative"). The coordinator then uses them in chat without provenance — a silent provenance break.

**Why it happens:**
- Default Agent SDK behavior is "sub-agent returns whatever it wants to its caller." There's no enforced result schema unless the parent prompt demands one.
- LLMs trained on chat respond verbosely. "Summarize what you found" produces a 1000-word summary, not a 100-word abstract.
- No structural separation between "what I wrote to OneBrain (with claim IDs)" and "what I want to tell the coordinator about my work."

**How to avoid:**
1. **Strict structured output for every sub-agent.** Each sub-agent's prompt ends with: *"Return ONLY a JSON object: `{ summary: string (≤150 words), claim_ids_written: string[], notable_contradictions: ContradictionRef[] }`. The summary must reference findings by claim ID, not by restating them."* Enforce via Agent SDK's `outputSchema` (Zod).
2. **Coordinator must not quote sub-agent prose verbatim** — that's the contract. Coordinator's role is to (a) re-fetch the listed claim IDs from OneBrain and (b) cite from those rows. CLAUDE.md must spell this out.
3. **Cap sub-agent output length** in the prompt and validate post-hoc: if the response is > 200 words after JSON-strip, log a warning and trim.
4. **Promptfoo eval**: sub-agent responses must be ≥ 95% JSON-parseable; summary length must be ≤ 200 words; every claim referenced must exist in OneBrain.
5. **No claims may be communicated to the coordinator that weren't written to OneBrain.** The eval suite includes a check: every factual statement in the sub-agent summary must correspond to a `claim_ids_written` entry. (This is hard to fully automate; spot-check during Slice 3.)

**Warning signs:**
- Coordinator reply latency growing as the chat turn progresses.
- Coordinator quotes facts in chat that have no claim ID citation.
- Sub-agent summaries exceeding 200 words consistently.
- `notable_contradictions` field empty even when `edges.kind='contradicts'` rows were written.

**Phase to address:**
Slice 1 (initial sub-agent output schema), reinforced in Slice 3 (multi-agent maturity, Promptfoo eval).

**Severity:** Project-degrading. Doesn't kill but quietly erodes the "evidence-first" discipline.

**Domain specificity:** Multi-agent + Claude Agent SDK specific.

---

### Pitfall 7: Pushback Theater — Devil's-Advocate Without Substance

**What goes wrong:**
The devil's-advocate sub-agent is supposed to surface real weakness in claims. Instead, it produces formulaic strawmen: "But what if the market is smaller than you think?" without grounding the counter-claim in any actual evidence. The user sees "the agent is being critical" and trusts the system more than warranted — actually less rigorous than no devil's-advocate at all because the user's epistemic immune system gets desensitized.

A related variant: the coordinator does superficial pushback in chat ("Are you sure?") but doesn't actually invoke the devil's-advocate sub-agent or query OneBrain for contradicting evidence. Pushback becomes a rhetorical tic.

**Why it happens:**
- LLMs default to balanced-sounding hedges; "be critical" without specifics produces hedge-prose, not analysis.
- Devil's-advocate prompts that say "find counter-arguments" are too abstract; the agent imagines counter-arguments rather than retrieving them.
- The coordinator's "treat statements as hypotheses" instruction can degenerate into a verbal mannerism if not wired to a tool call.

**How to avoid:**
1. **Devil's-advocate prompt is evidence-grounded:** "Your job is to find OneBrain claims that contradict, weaken, or undermine the claims listed below. For each weakness, write a `counter`-kind claim with `status='hypothesis'` and a `contradicts` edge to the original. If you cannot find evidence-grounded counter-claims, you MUST respond `no_substantive_counter_found` and explain why. Strawmen and hypothetical objections are forbidden."
2. **Required tool use**: devil's-advocate must invoke `onebrain_search` at least once before writing any counter-claim. Enforce via prompt and verify in eval — if it writes counters without searching first, eval fails.
3. **Coordinator's pushback is mechanized**: when a claim with `confidence > 0.75` and `supporting_count < 2` appears in the conversation, the coordinator invokes devils-advocate (already in ARCHITECTURE.md — operationalize as a Promptfoo eval).
4. **Promptfoo eval cases for "fake pushback"**: feed the system a well-supported claim. The devils-advocate must respond `no_substantive_counter_found`, not invent a strawman counter. Conversely, feed it a single-source claim — it must find the weak-evidence weakness.
5. **Visual marker in chat**: when the coordinator's "I'm hedging" mode fires, the UI shows "challenged via devil's-advocate" with a tool-call trace; if the coordinator hedges *without* a tool call, the trace is empty — the user sees that the pushback is verbal-only and adjusts trust accordingly.

**Warning signs:**
- Devil's-advocate counter-claims that have no `cites_source` edge (= invented).
- All counter-claims have `confidence ~ 0.5` and look templated.
- Coordinator says "let me push back" or "I'd challenge that" but no Agent SDK tool call appears in the trace.
- User starts ignoring the agent's pushbacks because they feel rote.

**Phase to address:**
Slice 3 (multi-agent maturity, where devil's-advocate is introduced) — eval cases must be written FIRST before the sub-agent is considered done.

**Severity:** PROJECT-CRITICAL. The user explicitly listed "agent is critical: pushes back verbally and treats statements as hypotheses" as a requirement. If pushback is theater, requirement is not met.

**Domain specificity:** AI-business-planning specific. Generic LLM hedging masquerading as critical thinking is the signature failure of LLM-assisted strategy work.

---

### Pitfall 8: Hallucinated Market Sizes, TAMs, and Financial Projections

**What goes wrong:**
The agent (or financial sub-agent) is asked "what's the TAM for SMB fintech in North America?" The LLM generates a plausible-sounding number ("$48B in 2026") drawing on training-data shapes, with no source. The number gets written into `claims` with `kind='fact'` and inherits a default 0.5 confidence. The compilation agent renders it on `frameworks/stp.md` with prose like "The serviceable market is approximately $48B." An investor reads this, asks "where did $48B come from?", and the agent's evidence chain leads back to... nothing. North-star credibility gone.

This is well-documented as the #1 way AI-generated business plans fail under investor scrutiny: confident numbers with no traceable sourcing.

**Why it happens:**
- LLMs are extremely good at generating numerically-plausible figures from training data without remembering they're imagined.
- A `claim` row stores `text` and `rationale` and `confidence` but doesn't *enforce* that quantitative claims have a source citation.
- The default 0.5 confidence makes hallucinated numbers indistinguishable from genuinely-uncertain claims.
- Tavily searches for "TAM SMB fintech 2026" return market-research firm summaries that themselves cite different numbers; the agent picks one without surfacing the disagreement.

**How to avoid:**
1. **Quantitative claim discipline at the schema level.** Add a CHECK or validation: any claim with a number ≥ $1M, a percentage, or a "TAM/SAM/SOM/CAGR/multiple" pattern in `text` MUST have at least one `cites_source` edge OR `kind='finance.assumption'` with explicit `rationale`. Enforce in `repo.writeClaim()` via a regex prefilter — block-with-error if no source attached.
2. **Tavily result → source row before claim row.** The research sub-agent's prompt: "For any quantitative claim (numbers, percentages, market sizes), the source row MUST be written FIRST and the claim's `cites_source` edge MUST be created in the same transaction. If you cannot find a source for a number, do not write the claim — write a `kind='question'` claim instead."
3. **Hallucination-detection eval (Promptfoo)**: ask the agent for a market size; assert the response cites a `claim_id` whose `cites_source` edge resolves to a `sources.url` that is reachable and contains the number. False match = eval fail.
4. **Financial projection claims (`kind='finance.calc'`) require an assumptions trail**: every calc-claim must `derived_from` one or more `finance.assumption` claims. The financial sub-agent prompt enforces this. Investor-grade defense: "show me the assumption tree for this number" → walk the `derived_from` edges.
5. **Confidence floor for unsourced quantities.** If a quantitative claim somehow makes it in without `cites_source`, downgrade `confidence` to 0.2 and `status='hypothesis'` automatically. Renders with a red banner.
6. **The wiki page for any framework that contains numbers (4Ps pricing, STP sizing, financial projections) renders a "Sourcing audit" section at the bottom** listing every quantitative claim and its source, generated deterministically from `cites_source` edges. Missing sources are listed loudly.

**Warning signs:**
- Tavily call count is zero for a chat turn that produced numerical claims.
- A claim's `rationale` references "market reports" or "industry estimates" without a specific source row.
- The financial sub-agent's calc-claims have no `derived_from` edges.
- The user can't retrace where a number came from when asked.

**Phase to address:**
Slice 1 (research sub-agent + Tavily — establish source-first discipline immediately); reinforced in Slice 3 (financial sub-agent with strict assumption-tree enforcement); compounding in later iterations toward the investor-grade north star.

**Severity:** PROJECT-KILLING for the north-star milestone (investor-grade plans). The whole product collapses if the agent confidently asserts unsourced numbers.

**Domain specificity:** AI-business-planning specific. This is THE failure mode investors flag.

---

### Pitfall 9: Unfalsifiable Claims and Generic-Sounding Output

**What goes wrong:**
The agent produces strategy claims that are technically true but tell you nothing: "Customer experience is critical to retention," "Pricing must reflect value," "Differentiation requires understanding the competition." The wiki fills with this gruel. Every business plan looks the same. Investors recognize boilerplate and lose interest.

This is the LLM's natural attractor when not constrained: produce defensibly-correct generalities rather than risk specific testable claims.

**Why it happens:**
- LLMs minimize loss by producing safe generalities; specifics carry training-data and prompt-context dependence.
- "Help me write a positioning statement" without grounding produces classic SaaS-shaped boilerplate.
- The agent has no explicit instruction to make claims falsifiable.
- Confidence rating doesn't penalize unfalsifiability — a vacuous truism gets `confidence=0.9` because nothing can refute it.

**How to avoid:**
1. **CLAUDE.md falsifiability rule**: "A claim must be falsifiable: a sensible person should be able to imagine evidence that would refute it. Tautologies, truisms, and generic strategy clichés are forbidden. If the claim's negation is also obviously true ('don't ignore the customer'), do not write it."
2. **Falsifiability flag on every claim.** Add `claim_kind='hypothesis'` discipline: hypotheses have a "what would refute this?" field (`refutation_criteria text` in the schema, optional but encouraged). If absent for `hypothesis` kind, the lint pass surfaces it.
3. **Devil's-advocate auto-trigger on suspected truisms.** A simple regex check on common boilerplate ("critical to success", "must understand", "key driver") flags claims for devils-advocate review. The counter-claim must be specific or the original gets demoted.
4. **Prompt patterns for specificity**: when generating a positioning statement or framework page, the prompt requires "for each strength/weakness/opportunity/threat, name a specific entity, segment, or measurable factor — no abstractions like 'market trends'."
5. **Promptfoo eval for "boilerplate detection"**: feed the agent a request to summarize the value prop. Assert the response mentions specific competitor names, segment names, or numerical targets — generic phrasing fails.

**Warning signs:**
- Wiki pages that could be copy-pasted into any other business plan and still make sense.
- Claims with `confidence ≥ 0.8` that have no specific entity, segment, or quantity referenced.
- The user reading the wiki and thinking "this is true but uninformative."

**Phase to address:**
Slice 1 (CLAUDE.md initial draft includes falsifiability rule); Slice 3 (devil's-advocate enforcement); Slice 4 (boilerplate detection as part of lint pass).

**Severity:** Critical for investor-grade north star. Boilerplate in chunks is what makes investors stop reading.

**Domain specificity:** AI-business-planning specific.

---

### Pitfall 10: Anchoring on the First Plausible Answer

**What goes wrong:**
The agent (or user, prompted by the agent) commits to the first viable strategic direction it generates. Subsequent sessions reinforce that direction by selectively supporting it. The wiki accretes evidence for one path while alternatives are abandoned without examination. By the time a serious flaw surfaces, the agent has 50 claims supporting the chosen direction and rerouting feels expensive — sunk cost in the OneBrain itself.

This is well-documented in human strategy work; LLMs make it worse because they're predisposed to coherence.

**Why it happens:**
- The agent's chat-completion bias is to elaborate on the previous turn, not to challenge it.
- OneBrain's confidence + supporting-count fields reward depth-of-evidence over breadth-of-options.
- "The wiki keeps getting richer" (Karpathy) cuts both ways: rich evidence for the wrong direction is worse than no wiki.

**How to avoid:**
1. **Mandatory alternatives generation at decision points.** When a `decisions` row is about to be written, the coordinator MUST first invoke a brief "alternatives sub-agent" pass that lists ≥ 3 distinct strategic alternatives with rough confidence levels. The chosen alternative is recorded; the rejected ones are stored with `status='refuted'` rather than discarded.
2. **`decisions` table includes `alternatives_considered jsonb`** (an array of `{ description, why_rejected, claim_ids }`). Investor-grade plans show "we considered X, Y, Z and chose Y because..." — this is the trail.
3. **Devil's-advocate auto-fires on decisions.** Before a decision is finalized, devils-advocate runs against the supporting claim set and surfaces strongest counter-arguments. The decision rationale must respond to them.
4. **Lint pass: "evidence imbalance detection".** Flag pages where `supporting_count > 5 * contradicting_count` AND no devils-advocate run has occurred in 30 days. Means: nobody's been looking for problems.
5. **Periodic "kill the darling" review.** A scheduled prompt every 30 days: "name the three strongest claims supporting our current direction. For each, list one source we have NOT yet sought that would credibly refute it. Schedule research." (User-driven, but prompted by the system.)

**Warning signs:**
- All claims about a topic have similar `confidence`; no contradictions.
- `decisions` rows with empty `alternatives_considered`.
- Devil's-advocate has not been invoked on a decision page in > 14 days.
- The user feels the wiki is "telling them what they want to hear."

**Phase to address:**
Slice 3 (decisions + devils-advocate) is when this becomes mechanizable.

**Severity:** Critical for investor-grade north star. Investors can spot anchoring fast.

**Domain specificity:** AI-business-planning specific.

---

## Major Pitfalls

These would not kill the project but would cause significant rework or quality erosion.

### Pitfall 11: Tag Taxonomy Explosion

**What goes wrong:**
`claims.topic_tags` is `text[]` — free-form. The agent writes `pricing`, then later `Pricing`, then `pricing-strategy`, then `price-point`, then `pricing_models`. Index pages explode into mostly-empty buckets. Filter queries miss claims because they used a different tag spelling. The wiki's organization rots.

**Why it happens:**
- LLMs invent tags on the fly without normalization.
- The `tags` registry table is "soft" — not foreign-keyed.
- No reconciliation pass; every tag the agent invents becomes canonical by default.

**How to avoid:**
1. **`tags` table is consulted before writing.** `repo.writeClaim()` looks up each `topic_tag` against the `tags` registry. New tags are allowed but logged to `event_log` with `kind='new_tag'`. The lint pass surfaces near-duplicates (Levenshtein distance < 3, lowercased equality, slug-collapse).
2. **Tag canonicalization at write**: lowercase, kebab-case, strip plurals. Done in `repo.writeClaim()` deterministically.
3. **Periodic tag reconciliation prompt** (in lint pass): "These tags appear similar — should they be merged? `[pricing, pricing-strategy, price-points]`." The user accepts/rejects; merge runs as a SQL update + edge fix-up.
4. **Promptfoo eval**: agents producing claims about pricing across 5 sessions all use the same canonical tag set.

**Warning signs:**
- `SELECT DISTINCT unnest(topic_tags) FROM claims` returns > 50 tags after only 100 claims.
- Index pages with many single-claim tag buckets.
- A topic search misses claims because of tag-spelling drift.

**Phase to address:**
Slice 2 (basic canonicalization + registry); Slice 4 (lint reconciliation).

**Severity:** Quality erosion. Recoverable with reconciliation but increasingly painful as data accumulates.

**Domain specificity:** OneBrain-specific.

---

### Pitfall 12: Embedding Drift Across Re-Embedding Runs

**What goes wrong:**
The user upgrades from `voyage-3.5` to `voyage-4` (or just re-runs embeddings to fix a bug). Old `claims.embedding` values were generated by one model; new claims by another. Cosine similarity searches return nonsense because vectors live in two separate spaces.

**Why it happens:**
- Voyage 3.5 / 4.x share a vector space (per Voyage docs) — but only across that family. Switching to OpenAI mid-project is a hard break.
- A "let me regenerate embeddings to fix a bad text" script doesn't track what was regenerated when.
- HNSW index recall craters when the underlying vector distribution is mixed.

**How to avoid:**
1. **`claims.embedding_model text` column** records the model that produced each vector. Default = 'voyage-3.5-1024'.
2. **Embedding regeneration is a planned operation, not ad-hoc.** A `npm run reembed -- --model voyage-3.5 --since 2026-01-01` script regenerates and updates the column. Atomic; logged.
3. **Mixed-model state is forbidden during query**: the search function asserts all queried embeddings share the same model OR runs the query embedding in the model that matches the candidates (rare path; expensive).
4. **Voyage family commitment**: pick one (Voyage 3.5) and stick with it for v1. Document the upgrade procedure for v2.

**Warning signs:**
- Search recall drops noticeably after a model swap.
- `SELECT DISTINCT embedding_model FROM claims` returns more than one value.
- HNSW index warnings during build.

**Phase to address:**
Slice 0 (column + default); Slice 2 (regeneration tooling).

**Severity:** Mid. Painful but not fatal — a `reembed --all` always works as a recovery.

**Domain specificity:** Stack-specific (pgvector + Voyage).

---

### Pitfall 13: Tavily Quota Burn and Cost Surprise

**What goes wrong:**
A single research session triggers 30 Tavily searches + 50 extracts. The user hits the 1,000-credit/month free tier in week one. Subsequent sessions silently degrade to no-research mode (or hit a paid tier without warning).

**Why it happens:**
- Research sub-agent's prompt is not budget-aware.
- No daily/monthly quota tracking in app.
- Repeated searches for the same query (no result cache) burn credits redundantly.

**How to avoid:**
1. **Tavily call cache**: `tavily_cache(query_hash, response_json, fetched_at)` — searches within 24h of an identical query return cached results. The agent gets the same data; one credit burned.
2. **Daily quota guard**: env-var `TAVILY_DAILY_LIMIT=50`. The Tavily tool wrapper checks today's call count; refuses with an explicit error past the limit. Coordinator handles gracefully.
3. **Monthly budget alarm**: at 80% of `TAVILY_MONTHLY_LIMIT`, the coordinator gets a system message and starts asking the user before each research-heavy turn.
4. **Search-depth tiering**: `tavily_search` at `basic` depth costs 1 credit; `advanced` costs more. Reserve `advanced` for confirmed-promising leads.

**Warning signs:**
- Tavily 429 errors mid-session.
- Daily call count > 50 in logs.
- Same query string appears 3+ times in a single session.

**Phase to address:**
Slice 1 (Tavily integration includes the cache + quota from day one).

**Severity:** Annoying not fatal. Local dev pain.

**Domain specificity:** Tavily-specific.

---

### Pitfall 14: Obsidian Markdown vs. CommonMark Parsing Differences

**What goes wrong:**
The compilation agent uses `remark` (CommonMark + GFM by default) to construct markdown. Obsidian renders Obsidian-flavored markdown: `[[wikilinks]]`, `> [!warning] callouts`, `==highlights==`, embedded blocks `![[note#section]]`, Dataview queries. `remark` doesn't understand these natively. Round-tripping (read existing page → modify → write) corrupts wikilinks.

**Why it happens:**
- `remark` treats `[[wikilink]]` as plain text; safe to write but the output structure may differ from what was read.
- Obsidian callouts (`> [!warning]`) are a GFM-blockquote extension; `remark-gfm` doesn't fully support them.
- Frontmatter is YAML but Obsidian also accepts JSON; mixing causes Dataview to break.

**How to avoid:**
1. **Don't roundtrip vault pages** — the compilation agent generates from scratch every recompile. The `vault_read` tool exists only for the diff-hash check, not for content modification. ARCHITECTURE.md already aligns with this — keep discipline.
2. **Use `remark-obsidian` or `mdast-util-from-markdown` with custom extensions** for wikilinks, callouts, embeds. Test each renders correctly in Obsidian.
3. **Frontmatter via `gray-matter` only** (already in the stack). Always YAML, never JSON. Always at the top of the file, separated by `---`.
4. **Visual regression test**: a test fixture renders one page of each kind (framework, entity, topic, decision, source), opens in Obsidian (manual the first time, screenshot-asserted later), confirms wikilinks resolve, callouts render, frontmatter parses.
5. **No Dataview queries in compilation output (v1).** Dataview is great for the user to add manually as queries; the compilation agent doesn't write Dataview blocks. Defer to later.

**Warning signs:**
- Obsidian's graph view shows edges that don't exist in OneBrain (= wikilink syntax broken).
- Backlinks panel empty for a page that should have many backlinks.
- Frontmatter fields show in the body of a page instead of the properties pane.

**Phase to address:**
Slice 0 (renderer fundamentals); Slice 4 (visual regression testing).

**Severity:** Mid. Not fatal but the wiki experience degrades.

**Domain specificity:** Obsidian + remark integration.

---

### Pitfall 15: Single-Writer Discipline Erosion (Hand-Edits to the Vault)

**What goes wrong:**
The user — out of habit, frustration with a wiki rendering, or a quick-fix temptation — opens a wiki page in Obsidian and edits it directly. The next compile run overwrites the edit. The user is annoyed; eventually they disable the cron or stop running compiles. The system collapses into a manual wiki with no DB backing.

This is the discipline collapse that pure-wiki systems eventually suffer; the hybrid pattern is supposed to prevent it, but only if the human-side discipline holds.

**Why it happens:**
- Obsidian opens the vault read-write by default.
- Hand-editing markdown is fast and natural.
- The user forgets that the compile will obliterate their change.
- Worse: the change is something the agent should have done (e.g. fixing a typo) but doesn't because the OneBrain row wasn't updated.

**How to avoid:**
1. **Vault is read-only at the OS level for the user.** Set Windows folder permissions on `vault/` so the user account has read but not write access; only the Node process (which has elevated rights or a separate technical account) writes. This is annoying but enforceable.
2. **Pre-compile diff check**: before recompile, the agent reads each `vault/*.md`'s mtime and content hash; if it differs from `compile_artifacts.content_hash` for the prior run, abort with a loud error: "human edit detected at vault/foo.md. Run `npm run reconcile` to capture the change as OneBrain rows OR overwrite to discard."
3. **`reconcile` script**: parses a hand-edited page, asks the user "what claim did you mean to add/change?", writes the corresponding OneBrain row, then recompiles. This makes hand-edits a *path into OneBrain*, not a path that breaks the system.
4. **CLAUDE.md / README discipline note**: "If you want to edit the wiki, edit OneBrain. If something in the wiki is wrong, the OneBrain row backing it is wrong — fix that." Plastered everywhere.
5. **Visual signal in Obsidian**: every page's frontmatter has `generated_by: compilation-agent` — the user can use a CSS snippet or the Properties panel to display "GENERATED — DO NOT EDIT" prominently.

**Warning signs:**
- `git status` shows changes to vault files between compile runs.
- Compile-time hash comparison reports mismatches with no corresponding `compile_artifacts` row.
- The user expressed frustration with a recent compile output.

**Phase to address:**
Slice 2 (compile + diff infrastructure includes the human-edit guard from day one).

**Severity:** Discipline erosion that compounds. If allowed to proceed, kills the system.

**Domain specificity:** Hybrid-pattern + single-writer specific. The signature failure mode that distinguishes hybrid from pure-wiki.

---

### Pitfall 16: Async/Await Write Ordering Bugs in OneBrain Repository

**What goes wrong:**
`repo.writeClaim()` does (1) embed via Voyage, (2) INSERT into `claims`, (3) INSERT into `edges`, (4) INSERT into `event_log`. If these are not in a single transaction OR if a Promise ordering bug means edges are written before claims, foreign-key violations or partially-applied state result. Worse: a sub-agent calling multiple writes in parallel produces races where claim B's edges depend on claim A's existence but A's INSERT is still pending.

**Why it happens:**
- Promise.all() looks like the right tool for "write multiple things fast" but breaks transactional guarantees.
- `pg` connection pool: each query may run on a different connection unless explicit transaction is used.
- Voyage embedding is async (network call); awaiting it before the INSERT is correct but easy to forget.

**How to avoid:**
1. **All writes through the repo.** Already specified in ARCHITECTURE.md — enforce.
2. **`repo.writeClaim()` is a transaction**. Use `db.transaction(async tx => { ... })`. Embedding is awaited *outside* the transaction (it's slow); claim insert and edge inserts happen inside. event_log writes can be in a separate (fast) commit.
3. **No `Promise.all` over write operations** at the repo layer. Writes are sequential. Only reads are parallelized.
4. **Idempotency keys** for claim writes: a `claim_hash` (sha256 of `text + topic_tags + cites_source`) prevents duplicates if a sub-agent retries.
5. **Integration test**: parallel sub-agent simulator writes 100 claims concurrently. Assert: zero foreign-key violations; claim count = 100; edge count matches expected.

**Warning signs:**
- Postgres logs show foreign-key violation errors.
- Duplicate claims with near-identical text but different IDs.
- `event_log` entries for ingests that don't have corresponding `claims` rows.

**Phase to address:**
Slice 0 (transactional repo from day one).

**Severity:** Mid. Recoverable but produces dirty state that erodes provenance.

**Domain specificity:** Stack-specific (pg + Drizzle).

---

### Pitfall 17: OneBrain DB and Vault Out-of-Sync After Backup Restore

**What goes wrong:**
The user backs up the OneBrain database with `pg_dump` on day 30, but the vault is only in git (last committed day 25). Day 35: disk failure. Restore from latest git → vault is at day 25; restore from latest pg_dump → DB is at day 30. The vault now has wikilinks to claim IDs that exist in the DB but no compile_artifacts referencing them; or vice versa. Provenance chain corrupted.

A second variant: only the DB is backed up (the vault is "just compiled output, can be regenerated"). Truth is, regenerating the vault produces a *different* vault if the LLM's intro temperature / cache has changed — the historical wiki is lost.

**Why it happens:**
- Two storage systems (Postgres + filesystem) with different backup cadences.
- The mental model "vault is regenerable" ignores the LLM nondeterminism in narrative connectives.
- No backup strategy was specified up front.

**How to avoid:**
1. **Backup pairs**: a single command (`npm run backup`) does `pg_dump` + `tar -czf vault.tar.gz vault/` + records the `compile_runs.id` of the last successful run in a `backup_manifest.json`. Restore is an atomic pair.
2. **Git-version the vault.** Commit the vault to git after every compile run. The compile script auto-commits with a message like `compile: run 01J9XRUN... — 4 pages written`. The DB backup includes `compile_runs.id` so you can match git commits to DB state.
3. **Periodic backup automation**: nightly `pg_dump` to a project-local `backups/` directory; rotate weekly. The user doesn't have to remember.
4. **Disaster recovery test**: monthly, restore DB and vault to a temp location, run `lint` to assert provenance integrity. If the test fails, the backup procedure is broken — fix it.
5. **`vault/.gitignore` excludes nothing.** The vault is checked in entirely. Recovery from a missing OneBrain is "git checkout vault, recompile, accept that LLM intros may differ" — but the structural content from frontmatter and claim citations is preserved.

**Warning signs:**
- The user has not run a backup in 30+ days.
- `compile_runs.id` referenced in `backup_manifest.json` doesn't exist in the current DB.
- Wikilinks in vault that don't resolve to current claim IDs.

**Phase to address:**
Slice 2 (when compile_runs and vault git history both exist).

**Severity:** Project-killing if disaster strikes uncovered. Easy to ignore until it bites.

**Domain specificity:** Hybrid-pattern + local-only specific. Two coordinated stores need coordinated backups.

---

### Pitfall 18: Single-User Assumptions Baked Into the Schema

**What goes wrong:**
The user later wants a second user (a co-founder, an investor, a contractor) to access the system. Refactoring is enormous because `claims` has no `created_by_user_id`, `decisions` has no `owner_id`, `business_plan_id` was added but never used, and the agent's coordinator state assumes one ongoing chat thread.

The PROJECT.md is explicit that multi-user is out-of-scope, but cheap forward-compatibility is worth getting now.

**Why it happens:**
- "Single user, no auth" is interpreted as "no user concept anywhere."
- Schema decisions made early are expensive to reverse later.
- `business_plan_id` was added in ARCHITECTURE.md as nullable for future-proofing — easy to forget to populate even at single-user scale.

**How to avoid:**
1. **`business_plan_id` is required even in v1** — set to a hard-coded `default-plan` ULID. Cheap, future-proof.
2. **`created_by` (already in `claims`) records the agent name, not user ID — but the column is there.** Add a sibling `created_by_user_id text DEFAULT 'local-user'` with a hard-coded default. Migration to multi-user later is one ALTER + a backfill.
3. **No multi-user plumbing in chat flow** — coordinator assumes one user. That's fine. But the data layer is ready.
4. **Don't add auth, sessions, or RBAC.** The constraint is explicit. Forward-compat at the schema layer only.

**Warning signs:**
- Future feature request "let me share this with X" → estimated cost is huge.
- Schema lacks any per-row ownership column.

**Phase to address:**
Slice 0 (schema decisions). Cheap if done up front, expensive later.

**Severity:** Low for v1; medium for the long-term project ambition.

**Domain specificity:** Single-user-local pitfall.

---

### Pitfall 19: API Key Sprawl and Leakage

**What goes wrong:**
Three API keys (Anthropic, Voyage, Tavily) live in `.env`. The user accidentally commits `.env` to git. Or the keys are pasted into a chat with another LLM for debugging. Or `pgadmin` connects with a hardcoded password committed to `docker-compose.yml`.

For a local-only project, the cost is leakage of paid API access. For an investor-facing project, the cost is reputational.

**Why it happens:**
- `.env` is easy to forget about.
- Docker Compose files often have default credentials.
- Logging frameworks may dump full request objects including auth headers.

**How to avoid:**
1. **`.env` in `.gitignore` from commit zero.** Add an `.env.example` with placeholders.
2. **`docker-compose.yml` reads passwords from `.env`**, never inline. Use `${POSTGRES_PASSWORD}`.
3. **Pino logger redaction**: `pino({ redact: ['*.headers.authorization', '*.api_key', 'password'] })`.
4. **pgAdmin**: change the default password from the docker image's default, set it via env var.
5. **Pre-commit hook**: `git-secrets` or simple grep for `sk-ant-`, `pa-`, `voyage-` prefixes. Block commit.

**Warning signs:**
- `git log -p` shows an API key.
- Pino logs include `Authorization: Bearer ...` strings.
- `docker-compose.yml` has a literal `password:` value.

**Phase to address:**
Slice 0 (project setup).

**Severity:** Low to medium. Recoverable (rotate keys) but embarrassing.

**Domain specificity:** Generic but called out because PROJECT.md mentions Docker Compose explicitly.

---

### Pitfall 20: Confidence Inflation Over Time

**What goes wrong:**
A claim starts at `confidence=0.5, status=hypothesis`. The agent finds two supporting sources; it bumps to `confidence=0.75, status=tested`. A third source agrees; `confidence=0.9, status=validated`. But the three sources are all citing the same original report. Confidence inflated despite no independent evidence. Compounding effect: the higher-confidence claim now anchors subsequent reasoning.

**Why it happens:**
- "More sources = higher confidence" is naive and gameable.
- The agent doesn't distinguish independent evidence from echo-chamber repetition.
- `supporting_count` is a denormalized integer, not a graph-aware measure.

**How to avoid:**
1. **Independent-source detection in the research sub-agent**. Before incrementing supporting_count, check: are these sources from the same publisher domain? Do they cite the same upstream report? If yes, treat as one supporting unit, not many.
2. **`evidence_independence` field on edges**. `edges.kind='supports'` rows include `independent_of: text[]` listing source IDs they share an upstream with. The compilation agent's confidence aggregation respects this.
3. **Confidence promotion requires explicit step**: status transitions `hypothesis → tested → validated` must be explicit decisions (logged in `event_log`), not automatic from `supporting_count`. The user (or a deliberate prompt to the user) confirms the upgrade.
4. **Devil's-advocate triggered on confidence promotion**. Before `validated`, devils-advocate gets a chance to challenge.
5. **Source diversity heuristic**: a claim with 3 supports from 3 different domains is stronger than 5 supports from 1 domain. Render this explicitly in claim citations.

**Warning signs:**
- Many claims at `confidence ≥ 0.85`.
- Claims with `supporting_count > 3` whose sources all share a domain.
- Validated-status claims with no `validated_at` event log entry.

**Phase to address:**
Slice 3 (confidence + status discipline lives here).

**Severity:** Critical for investor-grade defensibility.

**Domain specificity:** AI-business-planning + critical-agent specific.

---

## Minor Pitfalls

### Pitfall 21: pgAdmin in Production-Mode Container Auth Confusion

**What goes wrong:**
Default `dpage/pgadmin4` config requires email/password setup on first load; users skip past it, set weak credentials, can't log in next time. Or pgAdmin's session state lives in a non-persisted container layer; restarting the container loses configurations.

**How to avoid:**
- Set `PGADMIN_DEFAULT_EMAIL` and `PGADMIN_DEFAULT_PASSWORD` via env vars in `docker-compose.yml`.
- Persist pgAdmin's `/var/lib/pgadmin` to a named volume.

**Phase to address:** Slice 0 (initial Docker setup).

**Severity:** Low — annoying not project-killing.

---

### Pitfall 22: Concurrently Hot-Reload Race in Dev

**What goes wrong:**
`concurrently` runs Vite + tsx watch. When `tsx watch` restarts the backend (because of an agent definition change), in-flight HTTP/SSE streams die mid-response. assistant-ui shows a half-streamed message and gets stuck. User refreshes; chat history is in OneBrain's `event_log` but the UI's local React state is lost.

**How to avoid:**
- Chat session state hydrates from `event_log` on UI mount.
- assistant-ui's `useChat` is configured with reconnect logic.
- During dev, prefer manual restart for backend changes over auto-restart-on-save (set `tsx watch` with `--ignore "src/agents/definitions/**"` if iteration is too disruptive).

**Phase to address:** Slice 1 (chat plumbing).

**Severity:** Low — dev-time pain.

---

### Pitfall 23: Voyage 3.5 Long-Context Cost Surprises

**What goes wrong:**
Voyage 3.5 supports 32k context. Embedding a full-length article (20k+ chars) costs ~10x more than a 4k chunk. The user processes a batch of long PDFs; embedding cost spikes.

**How to avoid:**
- Cap embedding input at 4k chars (already in ARCHITECTURE.md for `sources.embedding`); chunk longer documents into multiple `sources` rows or use multiple `claims` extracted from the source.
- Track Voyage spend in `event_log` (cost per embedding row).
- Daily Voyage budget guard analogous to Tavily's.

**Phase to address:** Slice 0 (embed wrapper); Slice 2 (budget tracking).

**Severity:** Low — cost not correctness.

---

### Pitfall 24: Cron Time Zone Confusion

**What goes wrong:**
`node-cron` runs in the process's timezone (defaults to system TZ). The user is in EST, the Docker container is UTC, the cron string `0 */6 * * *` fires at unexpected local times. Compile runs collide with the user's busiest research sessions.

**How to avoid:**
- Set `node-cron` timezone explicitly: `cron.schedule(expr, fn, { timezone: 'America/New_York' })`.
- Document the timezone in CLAUDE.md (so the agent knows when it last ran).
- For local-only single-user, use the user's local TZ; expose via `process.env.TZ` in `.env`.

**Phase to address:** Slice 2 (cron setup).

**Severity:** Low.

---

### Pitfall 25: Obsidian's Reserved Filenames Break Slug Generation

**What goes wrong:**
The compilation agent generates a page path `entities/AT&T.md`. Filesystem accepts; Obsidian's `[[entities/AT&T]]` wikilink may fail to resolve due to the `&`. Or the agent generates `decisions/Q1: pivot.md` — colon is a Windows-illegal filename character.

**How to avoid:**
- Slug generation in `src/compilation/render/page.ts` uses a strict regex: `/[^a-z0-9-]/g → '-'`, lowercase, collapse multiple dashes.
- The original entity name is preserved in frontmatter `title`; the filename is the slug.
- Wikilinks use slugs: `[[entities/at-t|AT&T]]`.

**Phase to address:** Slice 0 (renderer fundamentals).

**Severity:** Low.

---

## Phase-Specific Warnings

| Phase Topic (slice) | Likely Pitfall | Mitigation |
|---------------------|----------------|------------|
| Slice 0 — DB + repo + render | Drift between Drizzle and migrations (P4); embedding dimension mismatch (P5); single-user assumptions baked in (P18); broken provenance from non-immutable IDs (P2) | Set the schema-truth + ID-immutability + dimension-constant patterns from migration #1; add `business_plan_id` and `created_by_user_id` defaults |
| Slice 1 — agents + chat | Sub-agent context pollution (P6); Tavily quota burn (P13); hallucinated quantities without citation (P8) | Strict structured-output schema for sub-agents; Tavily cache + daily limit; source-first discipline in research sub-agent prompt |
| Slice 2 — compilation + cron | Compilation idempotency loops (P3); single-writer erosion (P15); backup/vault-DB sync (P17); Obsidian markdown rendering (P14); cron TZ (P24) | Hash excludes nondeterministic fields; pre-compile diff guard; paired backup strategy; remark-obsidian + visual regression test; explicit TZ |
| Slice 3 — multi-agent maturity | Pushback theater (P7); confidence inflation (P20); anchoring on first answer (P10) | Devil's-advocate must use tools (Promptfoo eval); independent-source detection; mandatory alternatives at decisions |
| Slice 4 — wiki maturity | Wiki-as-confident-misinformation (P1); tag taxonomy explosion (P11); generic boilerplate (P9) | Hedge-preserving prose; lint pass for tag canonicalization and boilerplate; falsifiability rule in CLAUDE.md |
| Slice 5 — scale tooling | Embedding drift on model swap (P12); HNSW index rebuild lag | Embedding-model column; planned reembed script |
| North-star (financials, investor-grade) | Hallucinated TAMs (P8); unfalsifiable claims (P9); confidence inflation (P20); broken provenance under audit (P2) | All quantitative claims require source rows; assumptions trees on finance.calc; devil's-advocate on decisions; provenance integrity tests |

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Skip embedding-model column on `claims` | Saves a migration | Forces full re-embed when swapping models; no audit trail | Never — add it Slice 0 |
| Hand-mirror Drizzle schema instead of `pull` | Saves CI step | Drift between schema and queries | Acceptable through Slice 0 if you commit to a `pull` step before Slice 2 |
| Skip Promptfoo evals in Slice 3 | Faster Slice 3 ship | Pushback theater (P7), boilerplate (P9), and pollution (P6) become invisible until they're entrenched | Never — write evals BEFORE the sub-agents they test |
| Single-tag claims (no `topic_tags` array) | Simpler schema | Tag explosion + reorganization headache | Never — `text[]` from Slice 0 |
| Skip `compile_artifacts` table in early compilation | "Compile every time" works | No diff-based recompile; LLM cost compounds; vault churn | Acceptable for Slice 0 walking skeleton; mandatory by Slice 2 |
| Free-text `confidence` instead of constrained numeric | Easier inserts | Confidence inflation invisible; eval impossible | Never |
| Run compile agent on every claim write | Wiki always fresh | Recompile thrash + cost spike | Never; debounce 30s minimum |
| In-process backup (no `pg_dump`) | Zero infrastructure | Backup-restore loses data; vault-DB drift on restore | Never — `pg_dump` from Slice 2 |
| Agent has direct vault write tool | Faster ingest | Single-writer discipline breaks; merge conflicts | Never; tool gating is the entire point |
| LLM intros at temperature > 0 with no cache | More natural prose | Compilation idempotency breaks (P3) | Never |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Voyage embeddings | Caller assumes returned vector length without checking; dimension drift on model swap | `embed()` wrapper asserts `vec.length === EMBEDDING_DIM`; `embedding_model` recorded per row |
| Tavily search | Prompt the agent to "research deeply" with no budget guard | Daily call cap, query-cache, depth tiering |
| Claude Agent SDK sub-agent | Sub-agent returns free-form text; coordinator quotes it directly | Structured JSON output schema; coordinator must re-fetch claims by ID |
| Claude Agent SDK tool gating | Adding `vault_write_atomic` to coordinator "for convenience" | Tool restricted to compilation sub-agent; verified in Promptfoo eval |
| Obsidian + remark | Round-tripping a vault page through `remark` corrupts wikilinks/callouts | Generate vault pages from scratch every recompile; never read-modify-write |
| pgvector + Drizzle | Use `<->` as L2 distance when cosine was intended | Use `cosineDistance(claims.embedding, $1)` helper; assert similarity score range in test |
| node-cron + Docker | Container TZ is UTC; user expects local time | Explicit `timezone:` option; document in CLAUDE.md |
| pg + Drizzle pool | Multi-statement transaction split across pool connections | `db.transaction(async tx => ...)` for any multi-write operation |
| Hono + assistant-ui SSE | Backend hot-reload during stream kills connection mid-message | Hydrate UI from `event_log` on mount; reconnect logic in transport |
| Obsidian vault on Windows | Filesystem watcher misses changes during compile (rare) | Ensure compile is fully complete before Obsidian indexes; atomic temp+rename writes already mitigate |
| pgAdmin in Docker | Default email/password setup skipped, lockout next session | Set `PGADMIN_DEFAULT_*` env vars; persist `/var/lib/pgadmin` volume |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| HNSW index not used due to filtered query | Search > 1s; `EXPLAIN` shows seq scan | Test EXPLAIN plans; tune `hnsw.ef_search`; pgvector 0.8+ iterative scans | At 10k+ claims with selective `WHERE` filters |
| Compilation thrash on every claim write | Vault git noise; LLM cost spike | Debounce 30s; diff-based plan | Whenever an ingest session adds many claims fast |
| Promise.all over OneBrain writes | FK violations; partial state | Sequential transactional writes | First parallel sub-agent run |
| Embedding 20k-char source documents in full | Voyage cost spike; embeddings less retrieval-useful | 4k cap; chunk longer documents | At first long-PDF ingest |
| `pg_dump` blocking the live connection | Compile errors during backup | Schedule backups during idle windows | If backups become frequent |
| LLM intro generation not cached | Recompile latency stacks; nondeterministic hashes | LRU cache keyed by claim-set hash | Slice 2 onward |
| Drizzle `select().from(claims)` returning all rows | Memory bloat; slow chat | Always paginate; `.limit()` mandatory in `repo.search` | At 5k+ claims |
| Tag-based filter scans all `claims.topic_tags` arrays | Slow tag pages | GIN index on `topic_tags` (already in schema) — verify it's used | At 10k+ claims |

---

## Security Mistakes (domain-specific)

| Mistake | Risk | Prevention |
|---------|------|------------|
| `.env` checked into git | API key leakage; paid quota burn by attacker | `.gitignore` from commit zero; pre-commit secret scan |
| Pino logging full HTTP requests | Auth headers in log files | Pino redact paths for `authorization`, `api_key`, `password` |
| pgAdmin default credentials | DB exposed if port 5050 leaks | Set `PGADMIN_DEFAULT_*`; bind to `127.0.0.1:5050` not `0.0.0.0` |
| Postgres exposed on 0.0.0.0 in docker-compose | DB reachable from local network | `ports: ["127.0.0.1:5432:5432"]` (note loopback bind) |
| Hono server bound to 0.0.0.0 | Chat agent reachable by anything on the LAN | Bind to `127.0.0.1`; document; reverse if user wants LAN access |
| Tavily API key shared with the agent's "Bash" tool (financial sub-agent post-MVP) | Agent could exfiltrate the key via a shell command | Tool-gate `Bash` to a sandbox; no env-var passthrough |
| Storing chat history with PII in `event_log.payload` | If DB leaks, conversational secrets leak | Document what gets logged; redact obvious patterns (emails, phones) at write time |
| Markdown injection from web sources via Tavily extract | Source raw_text contains `[[malicious]]` wikilink that resolves in Obsidian | Sanitize `sources.raw_text` for wikilink syntax before embedding in claim text; or escape in the renderer |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Confidence shown as a number only | Users glaze over numerics; can't internalize | Pair number with label and color: `[hypothesis 0.55]` (yellow), `[validated 0.92]` (green) |
| Citations are tiny grey IDs with no preview | User can't verify without clicking | Hover-preview the claim text + source title; assistant-ui supports inline cards |
| Compile run is silent | User doesn't know wiki updated | Toast notification on `recompile` complete; log entry in chat |
| Wiki shows "stale" banners constantly | Banner blindness | Threshold tuning + once-clicked-snooze; only show on heavily-relied-on pages |
| No way to mark a claim "I don't trust this" | User can't override agent's confidence | Add `user_review` status to `claims` (`accepted | rejected | pending`); refuted claims displayed as such |
| Obsidian opens vault read-only — user confused why edits revert | User edits, sees revert, blames the system | Read-only OS perms + a clear `README` in the vault: "Edit OneBrain via chat. The wiki is generated." |
| Long research sessions lose chat scroll position | User can't find earlier discussion | assistant-ui `Thread` virtualization + jump-to-claim links |
| Devil's-advocate counter-claims feel hostile | User dismisses the system as "annoying" | Frame as "challenges to consider" with explicit "good challenges strengthen the plan" copy |
| The user can't see what the cron is doing | Mystery overnight changes | `vault/log.md` is human-readable; nightly toast on next session "since you were away: 4 claims, 1 contradiction surfaced" |

---

## "Looks Done But Isn't" Checklist

- [ ] **Citations:** Click a claim ID — does it actually resolve to a live OneBrain row? Is the displayed claim text current (not the version from the compile run)?
- [ ] **Confidence rendering:** Open three random wiki pages — every claim has a visible confidence badge?
- [ ] **Contradictions:** Find a topic with known contradictions in the DB — is the wiki page rendering the contradiction block, or did one side get smoothed away?
- [ ] **Idempotency:** Run `recompile` twice with no DB changes — second run reports `pages_written: 0`?
- [ ] **Single-writer:** Edit a vault page in Obsidian, then trigger recompile — does the system warn loudly OR silently overwrite (silently overwriting is also a fail)?
- [ ] **Pushback substance:** Ask the agent to challenge a claim that has only one weak source — does the response cite a specific contradicting source from OneBrain, or hand-wave?
- [ ] **Numbers without sources:** Ask "what's the TAM for X?" — does the response include a `claim_id` with a `cites_source` edge to a real URL?
- [ ] **Provenance integrity:** Run `lint` — zero orphan `claim_ids` in `compile_artifacts`?
- [ ] **Backup pair:** Restore from `npm run backup` to a temp location; does `lint` pass and do all wikilinks resolve?
- [ ] **Tag canonicalization:** `SELECT DISTINCT unnest(topic_tags) FROM claims` — any near-duplicates (`Pricing` vs `pricing` vs `pricing-strategy`)?
- [ ] **Embedding model uniformity:** `SELECT DISTINCT embedding_model FROM claims` — single value?
- [ ] **HNSW index used:** `EXPLAIN ANALYZE` on a representative chat-time claim search — `Index Scan using claims_embedding_hnsw`?
- [ ] **Tavily quota:** Today's call count visible in dashboard / log; not exceeding daily cap?
- [ ] **Devil's-advocate eval:** Promptfoo run passes for "no_substantive_counter_found" on well-supported claims and "finds counter" on weak claims?
- [ ] **Decisions trail:** Every `decisions` row has non-empty `alternatives_considered`?
- [ ] **Stale flagging:** A page with `last_evidence_at > 90 days` shows the stale banner?
- [ ] **Schema-Drizzle parity:** `drizzle-kit pull` produces no diff vs committed `schema.ts`?
- [ ] **Postgres bound to localhost:** `docker-compose ps` shows `127.0.0.1:5432`, not `0.0.0.0:5432`?

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| P1 Wiki misinformation | MEDIUM | Identify the offending pages from user report; backfill correct claims into OneBrain (with supersede edges); recompile. The audit trail in `compile_runs` shows what version of the wiki was wrong |
| P2 Provenance break | HIGH | Run lint to find orphan claim IDs; for each: check git history for a deleted claim row; restore via point-in-time DB recovery or rewrite the claim with a new ID and add a manual supersede edge |
| P3 Compilation thrash | LOW | Add normalized hash; clear LLM intro cache; rerun. Vault git history shows the noisy commits — squash or accept |
| P4 Drizzle drift | LOW | `drizzle-kit pull`; commit the regenerated schema; fix breaking call sites |
| P5 pgvector dimension mismatch | MEDIUM | New migration: `ALTER TABLE claims ADD COLUMN embedding_new vector(NEW_DIM)`; reembed all rows; drop old column; rebuild HNSW |
| P6 Sub-agent pollution | LOW | Add structured output schema; rerun affected sessions (chat history is in event_log, can be replayed) |
| P7 Pushback theater | LOW | Update CLAUDE.md and devils-advocate prompt; add Promptfoo eval; iterate |
| P8 Hallucinated number | MEDIUM | Identify via lint pass for unsourced quantitative claims; for each: re-research with the user, write source row, update claim; recompile |
| P9 Boilerplate | MEDIUM | Lint flags; user-driven cleanup; CLAUDE.md tightening |
| P10 Anchoring | HIGH | Run `kill the darling` review; surface alternatives; potentially reverse a `decisions` row (status='reversed'); rebuild downstream pages |
| P11 Tag explosion | MEDIUM | Tag canonicalization SQL update; merge edges; recompile index pages |
| P12 Embedding drift | MEDIUM | `npm run reembed --all --model voyage-3.5`; rebuild HNSW; verify recall on test queries |
| P13 Tavily quota | LOW | Wait for monthly reset; cache fixes future |
| P14 Obsidian rendering | LOW | Switch to `remark-obsidian`; visual regression tests |
| P15 Hand-edits to vault | LOW–MEDIUM | Run `reconcile` script (per Pitfall 15 mitigation #3); for accumulated drift, manually replay edits as OneBrain rows |
| P16 Async write bugs | MEDIUM | Wrap writes in transactions; replay from event_log if state corrupted |
| P17 Backup mismatch | HIGH if data loss | Restore matched DB+vault pair; verify with lint; if pair unavailable, reconstruct vault from DB only (LLM intros may differ) |
| P18 Single-user assumptions | HIGH | Add user_id columns + backfill; refactor coordinator state per-user; expensive |
| P19 API key leak | LOW (rotate) | Rotate keys; check git history for further leaks; add pre-commit hook |
| P20 Confidence inflation | MEDIUM | Recompute supporting_count with independence detection; demote validated claims that lack independent evidence; recompile |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| P1 Wiki misinformation | Slice 2 + 4 | Hedge-preserving Promptfoo eval; visual review of 3 framework pages |
| P2 Provenance break | Slice 0 | Lint pass = 0 orphans; click-through citation works in chat |
| P3 Compilation idempotency | Slice 2 | Double-compile-run produces 0 writes; canonical hash test |
| P4 Drizzle drift | Slice 0 | `drizzle-kit pull` produces no diff in CI |
| P5 pgvector footguns | Slice 0 + 2 | EXPLAIN test passes; embed dim assertion |
| P6 Sub-agent pollution | Slice 1 + 3 | Structured output schema enforced; eval verifies |
| P7 Pushback theater | Slice 3 | Promptfoo eval: false-positive and true-positive pushback cases |
| P8 Hallucinated quantities | Slice 1 + ongoing | Eval: every quantitative claim has `cites_source` edge to reachable URL |
| P9 Generic boilerplate | Slice 1 (CLAUDE.md) + 4 (lint) | Eval: positioning statement contains specific entity / segment / number |
| P10 Anchoring | Slice 3 | `decisions.alternatives_considered` non-empty; devil's-advocate triggered |
| P11 Tag taxonomy | Slice 2 + 4 | Tag canonicalization SQL on every write; lint reconciliation pass |
| P12 Embedding drift | Slice 0 + 5 | `embedding_model` column populated; reembed script tested |
| P13 Tavily quota | Slice 1 | Daily call counter; quota guard test |
| P14 Obsidian markdown | Slice 0 + 4 | Visual regression test on 5 page kinds |
| P15 Single-writer erosion | Slice 2 | Pre-compile diff guard fires on simulated hand-edit |
| P16 Async write bugs | Slice 0 | Concurrent-write integration test |
| P17 Backup pair | Slice 2 | Disaster recovery test passes |
| P18 Single-user assumptions | Slice 0 | `business_plan_id`, `created_by_user_id` populated with defaults |
| P19 API key leak | Slice 0 | Pre-commit secret scan; pino redaction test |
| P20 Confidence inflation | Slice 3 | Independence-detection on supports edges; status promotion requires log entry |

---

## What This Pitfalls Document Does NOT Cover (Out of Scope)

- **Generic web app security beyond what's domain-specific**. OWASP basics — input validation, SQL injection (Drizzle handles), XSS (assistant-ui handles) — are assumed table stakes.
- **Multi-user / multi-tenant pitfalls** — out of scope per PROJECT.md, except to keep the door open via `business_plan_id` + `created_by_user_id`.
- **Deployment / hosting pitfalls** — local-only scope.
- **Mobile UX pitfalls** — desktop-only scope.
- **Comparative-pattern pitfalls** ("but pure-Karpathy would handle this differently") — explicitly out of scope per PROJECT.md decision to build one pattern well.
- **Generic LLM pitfalls** (token limits, rate limits, model drift across versions) unless specifically interacting with the hybrid-pattern architecture.

---

## Sources

### Hybrid pattern + memory architecture (HIGH confidence)
- Karpathy LLM Wiki Gist — `.planning/inputs/karpathy-llm-wiki-gist.md` (failure mode: "wiki staleness = active misinformation")
- Nate B Jones hybrid transcript — `.planning/inputs/nate-b-jones-hybrid-transcript.md` (explicit failure modes for both pure-wiki and pure-DB; hybrid trade-offs; "the instructions you give the AI that tells it how to organize your wiki becomes the highest leverage document")

### Stack-specific (HIGH–MEDIUM confidence)
- [HNSW Indexes with Postgres and pgvector — Crunchy Data](https://www.crunchydata.com/blog/hnsw-indexes-with-postgres-and-pgvector)
- [pgvector GitHub — issue #877: Slow inserts with HNSW](https://github.com/pgvector/pgvector/issues/877)
- [The 'Vector Hangover': HNSW Index Memory Bloat in Production RAG — tech-champion.com](https://tech-champion.com/database/the-vector-hangover-hnsw-index-memory-bloat-in-production-rag/)
- [pgvector performance tips — Crunchy Data](https://www.crunchydata.com/blog/pgvector-performance-for-developers)
- [Drizzle ORM Migrations docs](https://orm.drizzle.team/docs/migrations)
- [Drizzle ORM Schema docs](https://orm.drizzle.team/docs/sql-schema-declaration)
- [WSL2 + Docker Desktop volume corruption — microsoft/WSL #11926](https://github.com/microsoft/WSL/issues/11926)
- [Docker Postgres on WSL2 volume permissions — Docker forums](https://forums.docker.com/t/postgres-in-wsl-2-with-docker-operation-not-permitted-when-i-share-volumes-enter-windows-folder/92161)

### Multi-agent / Claude Agent SDK (HIGH–MEDIUM confidence)
- [Subagents in the SDK — Claude API Docs](https://platform.claude.com/docs/en/agent-sdk/subagents)
- [Agent loop — Claude API Docs](https://platform.claude.com/docs/en/agent-sdk/agent-loop)
- [Agents spawning sub-agents endless loop / OOM — anthropics/claude-code #4850](https://github.com/anthropics/claude-code/issues/4850)
- [Claude Agent SDK: Subagents, Sessions and Why It's Worth It — ksred.com](https://www.ksred.com/the-claude-agent-sdk-what-it-is-and-why-its-worth-understanding/)

### AI business planning / investor scrutiny (MEDIUM confidence)
- [2026 AI Impact Survey Report — Grant Thornton](https://www.grantthornton.com/services/advisory-services/artificial-intelligence/2026-ai-impact-survey)
- [AI Risk 2026: What Business Leaders Need to Know — Aon](https://www.aon.com/en/insights/articles/ai-risk-2026-practical-agenda)
- [AI Answers Are Becoming Business Decisions — ISACA](https://www.isaca.org/resources/news-and-trends/newsletters/atisaca/2026/volume-3/ai-answers-are-becoming-business-decisions-most-organizations-arent-governing-them-that-way)
- [2026 AI Business Predictions — PwC](https://www.pwc.com/us/en/tech-effect/ai-analytics/ai-predictions.html)

### Project context (HIGH confidence)
- `.planning/PROJECT.md` — explicit constraints, scope, and the "every strategic claim... defensible by construction" core value
- `.planning/research/STACK.md` — version-pinned 2026 stack decisions
- `.planning/research/ARCHITECTURE.md` — single-writer wiki, deterministic-renderer pattern, schema, build-order

---

*Pitfalls research for: Hybrid Karpathy wiki + OneBrain, multi-agent business-planning, single-user local TS+Node+Postgres+pgvector+Obsidian app.*
*Researched: 2026-04-25*
