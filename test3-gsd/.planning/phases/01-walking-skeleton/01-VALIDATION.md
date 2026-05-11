---
phase: 1
slug: walking-skeleton
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-25
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `.planning/phases/01-walking-skeleton/01-RESEARCH.md` §Validation Architecture

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.5 |
| **Config file** | `vitest.config.ts` (NEW — Wave 0 creates it) |
| **Quick run command** | `npm test` (runs `vitest run`) |
| **Full suite command** | `npm test && RUN_VOYAGE_TESTS=1 npm run test:voyage` |
| **Test directory** | `tests/{unit,integration}/` |
| **Test file pattern** | `*.test.ts` |
| **Estimated runtime** | ~10–30s once suite exists (unit + integration); +Voyage live test ~2s when gated |
| **Mocking strategy** | `vi.mock('@/onebrain/embed')` for unit suite; live Voyage for integration suite (gated by `RUN_VOYAGE_TESTS=1`) |

---

## Sampling Rate

- **After every task commit:** Run `npm test` (full unit + integration suite)
- **After every plan wave:** Run `npm test && npm run lint`
- **Before `/gsd-verify-work`:** `npm test && RUN_VOYAGE_TESTS=1 npm run test:voyage && docker compose ps` all green
- **Phase gate:** All of the above PLUS manual Obsidian visual check of `vault/topics/<demo-slug>.md`
- **Max feedback latency:** ≤30 seconds (unit + integration without Voyage)

---

## Per-Task Verification Map

> Populated by gsd-planner. Each plan task carries `<acceptance_criteria>` mapping back to the REQ-IDs and tests below.

### Phase Requirements → Test Map

| REQ ID | Behavior | Test Type | Automated Command | Wave 0 File |
|--------|----------|-----------|-------------------|-------------|
| INFRA-01 | Postgres + pgvector + pgAdmin start via docker compose | CLI smoke | `docker compose up -d && docker compose ps \| grep healthy` | docker-compose.yml |
| INFRA-02 | Node 22 + TS 5.6 project compiles | unit (build check) | `npm run build` | tsconfig.json + tsconfig.node.json + tsconfig.web.json |
| INFRA-03 | node-pg-migrate is schema source; `drizzle-kit push` is forbidden | unit + script | `npm run db:push` exits 1; `tests/integration/schema-parity.test.ts` | tests/integration/schema-parity.test.ts |
| INFRA-05 | Vite dev server boots; `<h1>` renders | CLI smoke | `npm run dev` then curl localhost:5173 grep `Business Strategy Planner` | src/ui/main.tsx + src/ui/App.tsx |
| INFRA-06 | Vitest configured with unit + integration projects | unit | `vitest --reporter=verbose --listTests` | vitest.config.ts |
| INFRA-07 | `.env.example` committed; env loader fails fast on missing keys | unit | `tests/unit/env.test.ts` | tests/unit/env.test.ts |
| DATA-01 | `sources` table exists with all columns + indexes | integration | `tests/integration/schema-shape.test.ts::sources` | tests/integration/schema-shape.test.ts |
| DATA-02 | `claims` table with status, confidence, defaults | integration | `tests/integration/schema-shape.test.ts::claims` | tests/integration/schema-shape.test.ts |
| DATA-03 | `entities` table | integration | `tests/integration/schema-shape.test.ts::entities` | tests/integration/schema-shape.test.ts |
| DATA-04 | `edges` table with all kinds (cites_source, supports, contradicts, supersedes, evidence_of, derived_from, about_entity) | integration | `tests/integration/schema-shape.test.ts::edges_enum_values` | tests/integration/schema-shape.test.ts |
| DATA-05 | ULID stable IDs; immutable | unit | `tests/unit/ids.test.ts` | tests/unit/ids.test.ts |
| DATA-06 | Append-only repo (no delete path; supersede works) | integration | `tests/integration/append-only.test.ts` | tests/integration/append-only.test.ts |
| DATA-07 | `vector(1024)` column + HNSW index exists | integration | `tests/integration/schema-shape.test.ts::hnsw_index` | tests/integration/schema-shape.test.ts |
| DATA-08 | Voyage 3.5 returns 1024-dim embedding | integration (gated) | `RUN_VOYAGE_TESTS=1 vitest run tests/integration/voyage-live.test.ts` | tests/integration/voyage-live.test.ts |
| DATA-10 | Tags table exists; canonicalize at write | integration + unit | `tests/integration/schema-shape.test.ts::tags`; `tests/unit/tag-canonicalize.test.ts` | tests/unit/tag-canonicalize.test.ts |
| COMP-01 | vault/ dirs created on first compile | CLI smoke + integration | `tests/integration/pipeline.test.ts` asserts `fs.stat('vault/topics')` | tests/integration/pipeline.test.ts |
| COMP-02 | Page frontmatter has all required fields | unit | `tests/unit/frontmatter.test.ts` | tests/unit/frontmatter.test.ts |
| COMP-03 | `index.md` rebuilt with Topics + Sources sections | unit + integration | `tests/unit/render-index-md.test.ts`; `tests/integration/pipeline.test.ts` | tests/unit/render-index-md.test.ts |
| COMP-04 | `log.md` appends `## [date] kind \| summary` per ingest/compile/reset | integration | `tests/integration/pipeline.test.ts::log_entry_appended` | tests/integration/pipeline.test.ts |
| COMP-05 | Renderer is deterministic; same input → same output | unit | `tests/unit/render-topic-page.test.ts` | tests/unit/render-topic-page.test.ts |
| COMP-07 | content_hash stable across runs (excludes timestamps) — **Success Criterion #4** | integration | `tests/integration/hash-stability.test.ts` (compile twice, assert hash equal AND second-run `compile_artifacts.written = false`) | tests/integration/hash-stability.test.ts |
| COMP-09 | Contradictions render as `> [!warning] Contradiction` callouts | unit + integration | `tests/unit/render-contradiction.test.ts`; `tests/integration/pipeline.test.ts::contradiction_callout_present` | tests/unit/render-contradiction.test.ts |
| CRIT-02 | Claims default to `status='hypothesis'` | unit | `tests/unit/repo.test.ts::default_status_is_hypothesis` | tests/unit/repo.test.ts |
| CRIT-03 | Confidence required, range [0,1] | unit | `tests/unit/types.test.ts::confidence_zod_validates_range` | tests/unit/types.test.ts |
| CRIT-04 | Renderer surfaces confidence on each claim + frontmatter aggregates + `stale` flag | unit | `tests/unit/render-topic-page.test.ts` | tests/unit/render-topic-page.test.ts |
| CRIT-05 | Contradictions never auto-resolved (both sides present) | unit | `tests/unit/render-contradiction.test.ts::both_sides_present` | tests/unit/render-contradiction.test.ts |
| CRIT-06 | Status promotion requires evidence edge | unit | `tests/unit/repo.test.ts::promote_requires_edge_id` | tests/unit/repo.test.ts |
| EVAL-01 | Vitest passes for db, repos, renderer | meta — entire suite passes | `npm test` exits 0 | (all of the above) |

*Status will be tracked per-task once plans exist.*

---

## Wave 0 Requirements

Phase 1 starts from zero — every test infrastructure file must be created in Wave 0 before any implementation.

- [ ] `vitest.config.ts` — projects: `unit` + `integration`, alias resolution mirroring tsconfig
- [ ] `tests/setup/db-setup.ts` — beforeEach: connect, reset schema (`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`), apply migrations, populate enums
- [ ] `tests/setup/voyage-mock.ts` — `vi.mock` for `@/onebrain/embed`
- [ ] `tests/unit/repo.test.ts` — append-only enforcement, default status, write transactions
- [ ] `tests/unit/render-topic-page.test.ts` — determinism, confidence display
- [ ] `tests/unit/render-contradiction.test.ts` — both sides present, exact callout syntax
- [ ] `tests/unit/render-index-md.test.ts` — Topics + Sources sections
- [ ] `tests/unit/render-log-md.test.ts` — append behavior, prefix format
- [ ] `tests/unit/content-hash.test.ts` — excludes generated_at/compile_run_id, stable across calls
- [ ] `tests/unit/frontmatter.test.ts` — every required key present (per D-15)
- [ ] `tests/unit/ids.test.ts` — ULID format, no updateId in repo exports
- [ ] `tests/unit/types.test.ts` — Zod confidence range, status enum
- [ ] `tests/unit/env.test.ts` — env loader rejects missing required keys
- [ ] `tests/unit/tag-canonicalize.test.ts` — lowercase, kebab-case
- [ ] `tests/integration/pipeline.test.ts` — full ingest fixture → compile → assert vault page contents (succeeds the success-criteria scenarios)
- [ ] `tests/integration/reingest-skip.test.ts` — D-04 idempotency
- [ ] `tests/integration/append-only.test.ts` — supersede works, no delete path exposed
- [ ] `tests/integration/hash-stability.test.ts` — double-compile produces identical hashes, second compile writes 0 files (Success Criterion #4)
- [ ] `tests/integration/schema-shape.test.ts` — every table/column/index per migrations
- [ ] `tests/integration/schema-parity.test.ts` — drizzle-kit pull diff against committed schema.ts
- [ ] `tests/integration/voyage-live.test.ts` — gated by `RUN_VOYAGE_TESTS=1`
- [ ] Framework install: `npm install -D vitest@4.1.5 @vitest/ui@4.1.5`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Obsidian visually renders the demo topic page (callouts, links, frontmatter all display correctly) | COMP-09 + CRIT-05 (visual proof of Obsidian-callout contradiction rendering) | No headless Obsidian harness exists per ARCHITECTURE.md; v2 concern | After `bsp ingest --fixture <name> && bsp compile`, open `vault/topics/<demo-slug>.md` in Obsidian Desktop and confirm the contradiction callout renders as a styled warning block with both claims visible. |
| Real-world fixture article URL is durably accessible | D-09 | Article durability is a content-quality judgment, not an automated check | Click the fixture's source URL and confirm the article loads on a fresh browser session. |

---

## Validation Sign-Off

- [ ] All tasks have `<acceptance_criteria>` referencing automated commands above OR Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all `❌ Wave 0` references in the REQ → Test map
- [ ] No watch-mode flags in any test command (`vitest run` only — not `vitest`)
- [ ] Feedback latency < 30s for `npm test` once suite is full
- [ ] `nyquist_compliant: true` set in frontmatter once Wave 0 lands and the per-task map is populated by plans

**Approval:** pending
