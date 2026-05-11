# Business Strategy Planner

A personal AI-agent system that helps produce investor-grade business plans, built on a hybrid Karpathy wiki + OneBrain memory architecture (per Nate B Jones interpretation). Single-user, local-only, no auth.

## Project context

See `.planning/PROJECT.md` for full project description. Key facts:

- **Core value:** Every strategic claim in the wiki is connected to research-backed evidence with explicit confidence — defensibility by construction.
- **Architecture:** OneBrain (Postgres source-of-truth) → compilation agent → Karpathy wiki (Obsidian, compiled view). The wiki is *generated*, not hand-edited. Only the compilation agent has `vault_write_atomic`.
- **Stack:** Node 22 + TypeScript 5.6, Hono, React + Vite + assistant-ui + Vercel AI SDK, Postgres 16 + pgvector, Voyage 3.5 embeddings, Tavily search, Claude Agent SDK, node-cron, Vitest + Promptfoo.
- **Schema source of truth:** `node-pg-migrate`. Drizzle is query-only — never schema owner.
- **Build order:** 5 phases (`Walking Skeleton → Agents+Chat → Full Compilation → Multi-Agent Maturity → Wiki Maturity`). See `.planning/ROADMAP.md`.

## Hard architectural commitments

1. **Write directionality:** research → OneBrain rows first, *never* directly to wiki.
2. **Single writer to vault:** only the compilation sub-agent has `vault_write_atomic`. Other agents are rejected at the tool layer.
3. **Append-only OneBrain:** no delete path. Supersede via `edges` only.
4. **Stable ULID identity:** every row has a ULID that is immutable for the row's lifetime.
5. **Hypothesis by default:** every claim row is `status = hypothesis` until evidence promotes it.
6. **Contradictions preserved:** rendered as Obsidian callouts. Never auto-resolved.
7. **Provenance enforced:** every wiki claim traces back to specific OneBrain rows via `source_claim_ids` frontmatter.

## GSD workflow

This project uses GSD (`.claude/get-shit-done/`). Common commands:

- `/gsd:plan-phase <N>` — plan a phase (creates `.planning/phases/<N>/PLAN.md`)
- `/gsd:execute-phase <N>` — execute the planned phase
- `/gsd:progress` — check status
- See `.claude/get-shit-done/workflows/` for full list

Mode is **YOLO** (auto-approve). Granularity is **standard** (5–8 phases). Models are **Quality** profile (Opus for research/roadmap/planning).

## Reference inputs

- `.planning/inputs/karpathy-llm-wiki-gist.md` — Karpathy's LLM wiki pattern
- `.planning/inputs/nate-b-jones-hybrid-transcript.md` — How the user wants the hybrid built (write/query-time fork, contradiction preservation, compilation-agent design)
- `.planning/research/SUMMARY.md` — Synthesized research; build-order rationale
- `.planning/research/ARCHITECTURE.md` — Concrete schema + topology + compilation design + vault structure

## Working notes for future sessions

- The user is rigorous and direct. Push back substantively, don't perform agreement.
- Memory architecture is the IP — getting the hybrid right is more important than feature breadth.
- Financial *projections* are v2; v1 ships financial *analysis as evidence rows*.
