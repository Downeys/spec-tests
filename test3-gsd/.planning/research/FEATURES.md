# Feature Research

**Domain:** Personal AI agent for investor-grade business plans, with hybrid Karpathy-wiki + OneBrain memory and a critical/hypothesis-driven persona
**Researched:** 2026-04-25
**Confidence:** MEDIUM-HIGH (HIGH on competitor surface from direct review, HIGH on Karpathy/Nate B Jones patterns from primary sources, MEDIUM on critical-agent patterns — synthesized from emerging 2026 literature)

## Orientation

Three feature surfaces feed one product:

1. **Business-planning surface** — what an LLM-assisted business-planning tool does (SWOT, STP, 4Ps, Porter, brand pyramid, JTBD, ICPs, marketing plan, business plan, financials).
2. **Memory/wiki surface** — what a hybrid wiki + structured-DB knowledge tool needs (ingest, search, contradiction surfacing, evidence linking, lint, log, graph).
3. **Critical/hypothesis-aware agent surface** — what a "be skeptical, treat statements as hypotheses, push back" agent needs (devil's-advocate sub-agents, red-team passes, hypothesis status, decision logs, change journals).

Each table below is filtered through *this user's context*: single user, local-only, generic-tool, investor-grade north star, v1 = strategic+research foundation (financial projections deferred). Anti-features deliberately reject team/SaaS/multi-user surface area.

---

## Feature Landscape

### Table Stakes (Users Expect These)

#### Business-planning surface

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Conversational chat UI for the agent | Plannit, LivePlan, Bizplanr, every modern entrant lead with chat — non-chat feels dated | LOW | React + streaming; chat is the primary input modality per PROJECT.md |
| SWOT generation | Universal first-page framework in every business-plan tool | LOW | Template fill + agent prose; trivial once research substrate exists |
| STP (Segmentation/Targeting/Positioning) | Classical positioning starter; in-scope per PROJECT.md | LOW | Each S/T/P stage is a wiki page generated from OneBrain rows |
| 4Ps marketing mix | Table-stakes marketing-plan section | LOW | Same as SWOT — template-driven |
| Porter's Five Forces | Table-stakes industry analysis; in-scope | MEDIUM | Each force = its own wiki page with multiple OneBrain evidence rows; the "rivalry" force especially benefits from web research |
| ICP + persona docs | Delve AI, M1-Project, every JTBD tool has these; entrepreneur expectation | MEDIUM | Persona doc is a structured wiki entity; ICP is a filterable predicate over personas |
| JTBD framing (functional/social/emotional jobs) | JTBD-aware tools (Delve AI) integrate this; classical JTBD canon expects it | MEDIUM | Encode jobs as first-class OneBrain rows linkable from personas + product features |
| Customer journey maps | Standard alongside personas in JTBD tooling | MEDIUM | Stage-based markdown table per persona; can be auto-generated from JTBD + persona rows |
| Brand pyramid + positioning statement | Brand strategy table-stakes; in-scope | LOW | Single page each; pyramid is a structured-fields page |
| Voice/tone + messaging architecture | Brand strategy lifecycle expects it | MEDIUM | Messaging architecture is multi-audience × multi-message; benefits from a matrix view |
| Comprehensive business plan compilation | LivePlan/Bizplan/Plannit all output a single bound document — users expect a "plan" artifact | MEDIUM | Compose existing wiki pages into a single ordered deliverable (markdown → optionally PDF) |
| Comprehensive marketing plan compilation | Same expectation, marketing flavor | MEDIUM | Same pattern as business plan compilation; different page set |
| Financial analysis (research-only, v1) | Investor grade demands defensible numbers; competitors offer 3-statement basics | MEDIUM | v1 = financial *analysis* as research evidence (unit economics, comp benchmarks, market sizing); store findings as OneBrain rows |
| Citation/source on every claim | Investor-grade north star demands defensibility; LivePlan and the new generation lean here | MEDIUM | Wiki claims must carry an inline link to the OneBrain row(s) that support them |
| Document export (markdown / PDF) | Plans ultimately get sent to investors/banks | LOW | Markdown is native (Obsidian); PDF via Pandoc or equivalent if needed; defer until a polished plan exists |

#### Memory/wiki surface

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Source ingest (paste URL / paste text / drop file) | Karpathy pattern's primary input op; every LLM-wiki implementation has it | MEDIUM | Source → OneBrain rows first, *then* compilation triggers wiki update (per Nate B Jones write path) |
| Index file (`index.md`) | Karpathy explicit: catalog of wiki pages, primary nav for the agent | LOW | Compilation agent emits/maintains it |
| Append-only chronological log (`log.md`) | Karpathy explicit: timeline of ingests/queries/lints | LOW | Trivial; one append per operation, with a parseable prefix |
| Wiki search (over markdown pages) | Every Karpathy-pattern impl reaches for `qmd` or BM25 once the vault crosses ~50 pages | MEDIUM | Start with naive grep over index.md; promote to BM25 (qmd) when scale demands |
| Cross-reference linking ([[wikilinks]]) | Obsidian native; pattern is built around it | LOW | Compilation agent inserts wikilinks; Obsidian renders them |
| Contradiction surfacing | Nate B Jones explicit failure mode: smoothing contradictions = losing strategic signal | MEDIUM | Compilation agent reads OneBrain rows, detects conflicts, emits a "Contradictions" callout in the relevant wiki page |
| Confidence + status fields on every claim | PROJECT.md explicit; the durable-truth principle of OneBrain | MEDIUM | Schema-level — every OneBrain row has `confidence` (0-1 or low/med/high) and `status` (hypothesis/tested/validated/refuted) |
| Evidence linking from wiki → OneBrain row | PROJECT.md explicit: "every wiki claim traces to a OneBrain row" | MEDIUM | Stable IDs in OneBrain; wiki uses an `[[onebrain:abc123]]` style link or footnote |
| Provenance chain (source → OneBrain row → wiki claim) | Investor defensibility; 2026 RAG production standard | MEDIUM | Each OneBrain row stores the source URL/excerpt/date; wiki claim links forward; trivial to walk the chain |
| Lint / health-check command | Karpathy explicit op (orphan pages, contradictions, stale claims, missing pages) | MEDIUM | Scheduled or on-demand; emits a report, not an auto-fix |
| Compilation agent (scheduled + on-demand) | Nate B Jones explicit; this is the architectural keystone | HIGH | The hardest piece in the system — see ARCHITECTURE.md |
| Source manifest with delta tracking | Common in Karpathy-pattern implementations (obsidian-llm-wiki, second-brain) — avoids re-ingesting | LOW | Track ingested source IDs + hashes; delta = new + changed |

#### Critical/hypothesis-aware agent surface

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Agent verbally pushes back in chat | PROJECT.md explicit; CLAUDE.md identity layer | LOW | Prompt-engineered behavior; lives in CLAUDE.md / system prompt |
| Hypothesis status field on claims | PROJECT.md explicit: hypothesis/tested/validated/refuted | LOW | OneBrain schema field; every row has a status |
| Confidence weighting in synthesis | PROJECT.md explicit; compilation agent filters/weights by confidence | MEDIUM | Compilation agent's prompt + filter logic |
| Evidence-first reasoning ("show me the source") | CLAUDE.md identity; investor-grade defensibility | LOW | Prompt-level discipline + tool to fetch supporting OneBrain rows |
| Decision log | Standard in agentic systems; 2026 production norm; Karpathy `log.md` covers operational events but a *decision* log captures strategic choices | LOW | Append-only `decisions.md` page or OneBrain `decision` row kind, with rationale + alternatives |

---

### Differentiators (Competitive Advantage)

These features set this system apart from the LivePlan / Bizplan / Plannit cohort. The user's investor-grade north star + Karpathy hybrid pattern is the moat.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Every strategic claim is defensible by construction** | Investor north star: any claim → click → OneBrain row → original source. Competitors generate plausible prose; this generates *traceable* prose. | MEDIUM | Direct outcome of the evidence-linking architecture; the differentiator is *built in* not bolted on |
| **Persistent compounding wiki across sessions** | Karpathy's core value: knowledge accumulates rather than being re-derived per query. Competitors RAG over docs every time; this builds up. | HIGH | The compilation agent is what makes this real |
| **Contradictions preserved, not smoothed** | Nate B Jones's headline insight: a tool that hides "eng said 12 weeks, sales promised 8" is worse than one that flags it. Investor-grade plans need this candor. | MEDIUM | Compilation agent prompt + a dedicated "contradictions" template |
| **Devil's-advocate / red-team sub-agent pass before plan finalization** | 2026 critical-reasoning skill pattern (five modes: Socratic, falsification, pre-mortem, red-team, dialectical). Surfaces holes before an investor does. | MEDIUM | A sub-agent or scheduled pass that reads the wiki and writes "challenges" rows back into OneBrain |
| **Hypothesis-driven workflow (every claim starts as a hypothesis)** | Default `status=hypothesis`; promotion requires evidence. This forces honest epistemics into the plan. | LOW | Schema default + UI/agent affordance |
| **Pre-mortem feature for the plan** | "What kills this business in 18 months?" — a recognized critical-reasoning mode; rare in business-plan tools | MEDIUM | A scripted prompt that runs over the wiki and produces a `pre-mortem.md` page with structured failure modes |
| **Confidence-weighted compilation** | Wiki narrative weights/filters by row confidence; low-confidence claims get hedged language ("preliminary indication" vs "confirmed"); investor reads tone-calibrated prose | MEDIUM | Compilation agent prompt understands confidence semantics |
| **Generic across business types** | Most competitors have industry templates that constrain. This works on any idea brought to it; the framework families are abstract enough. | LOW | An architectural commitment, not a feature; PROJECT.md explicit |
| **Obsidian as the wiki UI** | Mature graph view, backlinks, plugins (Marp, Dataview), git-friendly markdown vault — competitors have closed walls | LOW | Pure pattern adoption; cost = none, leverage = high |
| **Local-only / file-over-app** | No vendor lock-in, no SaaS dependency, full data ownership; aligns with the 2026 anti-SaaS-bloat sentiment | LOW | Architectural commitment; no extra build cost |
| **Web-research depth (iterative search loop, not single-pass)** | Perplexity/Tavily-style iterative deep-research loop — keeps drilling until evidence threshold met | HIGH | Use Tavily (or equivalent) inside an agent loop; orchestration is the work, not the search itself |
| **Change journal / wiki diff history** | Beyond Karpathy's `log.md`: when a claim's confidence flips or a contradiction resolves, that *change* is a strategic event. Git gives diff for free; surfacing it is the work. | LOW | Optional UI panel reading `git log` over the vault; can defer to v1.x |
| **"Why does the wiki say this?" reverse lookup** | Click any wiki claim → see all OneBrain rows that produced it + the compilation agent's reasoning trace | MEDIUM | Requires the compilation agent to log its reasoning per page emit |

---

### Anti-Features (Commonly Requested, Often Problematic)

These deliberately do *not* belong, given single-user / local-only / generic-tool / v1-strategic-foundation framing. Resisting these is what keeps the system focused.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Authentication / user accounts / login | "Every app has it" | PROJECT.md explicit out-of-scope; pure overhead for single user | None — local app, OS-level access control suffices |
| Multi-user / team collaboration | Most B-plan tools brag about this | PROJECT.md explicit out-of-scope; collaboration features impose merge/permission complexity for zero value | None — single user |
| Real-time collaborative editing | Standard in modern docs tools | Forces CRDT/OT complexity; wiki is single-writer (compilation agent) by design | None |
| Cloud sync / SaaS hosting | "Access from anywhere" | PROJECT.md explicit local-only; hosting introduces auth, secrets, networking, cost | git remote (optional) for personal backup if needed |
| Mobile UI / responsive design | "Modern apps are mobile-first" | PROJECT.md explicit desktop-only | Defer entirely |
| Industry-specific templates (SaaS plan, restaurant plan, etc.) | Competitors lean on these | PROJECT.md explicit: generic across industries; templates would constrain a hypothesis-driven agent | Frameworks (SWOT, STP, JTBD) are industry-neutral; agent does industry tailoring per-conversation |
| Drag-and-drop visual plan builder (à la Bizplan) | Looks impressive in marketing | Pulls UX away from chat-first; wiki + Obsidian already provide visual structure via graph view | Obsidian graph view + chat |
| Custom in-app graph visualization | "We need our own graph view" | PROJECT.md explicit: Obsidian renders the graph natively | Obsidian's native graph view |
| Permission / role / approval workflows | Enterprise expectation | Single-user; nothing to permission | None |
| Per-seat or per-plan pricing logic | SaaS norm | Personal tool; no billing surface | None |
| Multi-tenant data isolation | Enterprise expectation | Single user, single DB | None |
| Audit trail beyond git + log.md | Compliance expectation | Investor-grade ≠ SOC-2; the log + git history + OneBrain provenance is sufficient | git + `log.md` |
| Template marketplace / community plans | Competitor differentiator | Adds platform/curation surface; doesn't help quality of *one* plan | None |
| Built-in pitch-deck generator (v1) | Investor-facing temptation | Slide design is a different craft; Marp via Obsidian plugin is sufficient when needed | Marp plugin in Obsidian, on demand |
| Auto-fix lint findings without human-in-loop | "Make it self-healing" | Karpathy explicit: lint *suggests*, doesn't auto-fix; auto-fix can silently worsen the wiki | Lint produces a report; user reviews and dispatches the agent to fix specific items |
| Direct chat-to-wiki writes (bypassing OneBrain) | "Just save this directly" | Violates Nate B Jones write path: research → OneBrain → compilation → wiki. Direct writes break provenance and re-introduce merge conflicts | Always: chat → OneBrain row → recompile triggers wiki update |
| Embedding-based RAG over the wiki (instead of index-driven retrieval) | "RAG everything" | Karpathy explicit: index.md works at this scale (~hundreds of pages); RAG adds infra without value below the threshold | Index-driven retrieval first; promote to qmd/BM25 only if scale demands |
| Auto-resolution of contradictions | "Clean up the wiki" | Nate B Jones explicit failure mode: smoothing contradictions = losing strategic signal | Surface, don't resolve; user (or evidence) resolves them |
| Rich animation / theme system / customization | "Modern UX" | UI bloat; chat-first means UI is the agent, not the chrome | Plain functional UI; Obsidian for browsing |
| Slack / Notion / Jira integrations | "Where teams live" | No team here; integration surface is pure cost | None |
| Telemetry / analytics / usage tracking | "Understand the user" | The user is the operator; no remote analytics value | Local-only logs (`log.md`) |

---

## Feature Dependencies

```
[Source ingest]
    └──writes──> [OneBrain rows w/ confidence + status + provenance]
                      │
                      ├──read by──> [Compilation agent]
                      │                  └──emits──> [Wiki pages w/ evidence links]
                      │                                     └──surfaced in──> [Chat UI markdown chunks]
                      │                                     └──browsed in──> [Obsidian]
                      │
                      ├──queried by──> [Critical / hypothesis agent push-back in chat]
                      │
                      └──aggregated by──> [Lint / health-check]
                                                └──reports──> [User reviews; dispatches fix tasks]

[Web research tool (Tavily etc.)] ──feeds──> [Source ingest]

[Devil's-advocate sub-agent] ──reads──> [Wiki + OneBrain]
                              └──writes──> [Challenge rows in OneBrain]
                                              └──recompiles into──> [Wiki "challenges" sections]

[Confidence + status schema in OneBrain] ──enables──> [Confidence-weighted compilation]
                                                      [Hypothesis-status workflow]
                                                      [Investor-grade defensibility]
                                                      [Critical agent push-back]

[Evidence linking schema] ──enables──> [Reverse "why does the wiki say this?" lookup]
                                       [Provenance chain]
                                       [Investor defensibility]

[Compilation agent] ──conflicts──> [Direct chat-to-wiki writes]   (anti-feature)
[Auto-resolve contradictions] ──conflicts──> [Contradiction surfacing]   (anti-feature)
```

### Dependency Notes

- **Compilation agent requires OneBrain schema first.** Until rows have stable IDs, confidence, status, and provenance fields, the compilation agent has nothing to compile from. OneBrain schema is the literal foundation; nearly every differentiator depends on it.
- **Critical-agent push-back requires the confidence + status schema.** "Treat statements as hypotheses" is a behavioral promise the schema makes real. Without `status=hypothesis|tested|validated|refuted` and `confidence`, push-back is just generic LLM skepticism.
- **Evidence linking requires stable OneBrain row IDs.** Wiki-claim → row link breaks if rows can be deleted/renumbered. Schema decision: append-only with `superseded_by` rather than mutate.
- **Contradiction surfacing requires OneBrain row tagging.** The compilation agent detects contradictions by reading multiple rows on the same topic; tags + categories are how it groups them.
- **Devil's-advocate sub-agent enhances the compilation agent.** Independently runnable, but its output is most useful when it lands as new OneBrain rows that the next compile picks up.
- **Lint/health-check enhances the compilation agent.** Both read OneBrain + wiki; lint's job is to spot what compile missed.
- **Web-research depth enhances source ingest.** A naive ingest takes a single URL; an iterative loop (Perplexity-style) auto-expands sourcing.
- **Investor-grade financial projections (v2+) depend on the v1 strategic foundation.** Without ICP, market sizing rows, unit economics research stored in OneBrain, projection models have nothing defensible to anchor on. PROJECT.md explicit: financial *projections* are post-v1.
- **Document export depends on a stable wiki page set.** Compose pages → ordered document. Until the page taxonomy is stable, export is premature.

---

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed to validate the hybrid pattern *and* produce a defensible v1 strategic plan. Target: a wiki populated with strategy/marketing/JTBD/positioning docs, all interconnected, all backed by research stored in OneBrain.

- [ ] **Chat UI (React, streaming)** — single input modality per PROJECT.md
- [ ] **Local Postgres OneBrain with schema: rows have `kind`, `content`, `tags`, `source`, `confidence`, `status`, stable ID, timestamps** — foundation for everything else
- [ ] **Source ingest pipeline (paste URL / paste text)** — agent reads → emits OneBrain rows; *not* direct wiki writes
- [ ] **Web research tool integration (Tavily or equivalent)** — agent can do in-depth research, not just one-shot search
- [ ] **Compilation agent (on-demand, manual trigger)** — reads OneBrain, emits/updates Obsidian markdown vault
- [ ] **Obsidian-compatible markdown vault structure** — index.md, log.md, framework pages, entity pages, source summaries
- [ ] **Wiki page emission for table-stakes frameworks** — SWOT, STP, 4Ps, Porter, brand pyramid + positioning, JTBD + ICP + persona, customer journey
- [ ] **Evidence linking on every wiki claim → OneBrain row ID** — non-negotiable for the defensibility north star
- [ ] **Confidence + hypothesis status visible in wiki narrative** — language hedges per confidence; explicit "Hypothesis:" prefix where applicable
- [ ] **Contradiction surfacing in compilation** — when OneBrain has conflicting rows on the same topic, the wiki page calls it out instead of resolving
- [ ] **Critical/hypothesis CLAUDE.md** — identity layer that makes the agent push back, ask for evidence, surface counters
- [ ] **`log.md` chronological log** — append-only operational timeline; trivial; investor-defensibility checkpoint ("when did this claim get added?")
- [ ] **Comprehensive plan compilation (markdown)** — composes existing wiki pages into a single ordered marketing-plan.md and business-plan.md
- [ ] **Financial *analysis* rows in OneBrain** — unit economics, market sizing, comp benchmarks as research evidence (not yet projection models)

### Add After Validation (v1.x)

Features to add once core flow is working and the user is producing real plans.

- [ ] **Scheduled compilation runs** — once on-demand works, add daily/weekly schedule; trigger: "I've added 5 sources; have any contradictions surfaced overnight?"
- [ ] **Lint / health-check command** — orphan pages, stale claims, missing cross-refs, data gaps; trigger: vault crosses ~50 pages and starts feeling messy
- [ ] **Devil's-advocate sub-agent pass over the wiki** — emits challenge rows; trigger: first plan reaches "I think this is done" stage
- [ ] **Pre-mortem template + agent flow** — structured "what kills this business?" pass; trigger: same as devil's advocate
- [ ] **PDF / document export** — Pandoc pipeline; trigger: actually showing the plan to a reader
- [ ] **Decision log (separate from `log.md`)** — capture *strategic* choices with rationale + alternatives; trigger: looking back and wondering "why did I conclude X?"
- [ ] **Wiki search via qmd / BM25** — trigger: index.md retrieval starts feeling slow (~hundreds of pages)
- [ ] **Reverse "why does the wiki say this?" lookup UI** — wiki claim → reasoning trace; trigger: user wants to defend a claim and needs the receipts fast
- [ ] **Change journal panel (over git history)** — trigger: vault has enough history that "what changed last week?" becomes a real question

### Future Consideration (v2+)

Features deferred until product-market fit is established (north-star scope: investor-grade financial projections).

- [ ] **Three-statement financial model (P&L, Balance Sheet, Cash Flow) builder** — full model, not just analysis; PROJECT.md explicit: "financial projections that pass investor scrutiny" is the north star, not v1
- [ ] **Scenario modeling / what-if analysis** — once base model exists; competitors (LivePlan) charge for this
- [ ] **Pitch deck generation (Marp)** — when a plan is complete and an investor meeting is real
- [ ] **Multi-agent topology refactor** — if v1 single-agent or simple sub-agent structure hits limits (defer per PROJECT.md "Open architectural decisions")
- [ ] **Vector search over OneBrain rows** — only if structured query + tags stop being enough; not before
- [ ] **Per-page reasoning trace stored alongside compiled wiki page** — defer until reverse-lookup demand is real
- [ ] **Source-add event triggers compilation automatically** — defer until manual on-demand feels limiting

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Chat UI (React, streaming) | HIGH | LOW | P1 |
| OneBrain schema (rows, confidence, status, provenance) | HIGH | MEDIUM | P1 |
| Source ingest → OneBrain | HIGH | MEDIUM | P1 |
| Web research tool integration | HIGH | MEDIUM | P1 |
| Compilation agent (on-demand) | HIGH | HIGH | P1 |
| Wiki emission for SWOT/STP/4Ps/Porter | HIGH | LOW | P1 |
| Wiki emission for JTBD/ICP/persona/journey | HIGH | MEDIUM | P1 |
| Wiki emission for brand pyramid/positioning/messaging | HIGH | LOW | P1 |
| Evidence linking (wiki → OneBrain row) | HIGH | MEDIUM | P1 |
| Critical/hypothesis CLAUDE.md identity | HIGH | LOW | P1 |
| Confidence-weighted prose in wiki | HIGH | MEDIUM | P1 |
| Contradiction surfacing | HIGH | MEDIUM | P1 |
| Comprehensive plan compilation (markdown) | HIGH | MEDIUM | P1 |
| Financial *analysis* (research only) | MEDIUM | MEDIUM | P1 |
| `log.md` chronological log | MEDIUM | LOW | P1 |
| Scheduled compilation runs | MEDIUM | LOW | P2 |
| Lint / health-check | MEDIUM | MEDIUM | P2 |
| Devil's-advocate sub-agent pass | HIGH | MEDIUM | P2 |
| Pre-mortem flow | HIGH | MEDIUM | P2 |
| PDF / document export | MEDIUM | LOW | P2 |
| Decision log (separate from `log.md`) | MEDIUM | LOW | P2 |
| Reverse "why does the wiki say this?" lookup | MEDIUM | MEDIUM | P2 |
| Wiki search via qmd / BM25 | LOW (until scale) | MEDIUM | P2 |
| Change journal panel | LOW | LOW | P2 |
| Three-statement financial model | HIGH (north-star) | HIGH | P3 |
| Scenario / what-if modeling | MEDIUM | HIGH | P3 |
| Pitch-deck (Marp) | MEDIUM | LOW | P3 |
| Vector search over OneBrain | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for v1 (validates the hybrid pattern + produces a defensible v1 strategic plan)
- P2: v1.x — add once core flow is working and producing plans
- P3: v2+ — north-star territory (full investor-grade financials, multi-agent refactor, scale-driven optimizations)

---

## Competitor Feature Analysis

| Feature | LivePlan | Plannit / Bizplanr | Delve AI / M1-Project | Karpathy LLM-Wiki impls (obsidian-wiki, second-brain) | Our Approach |
|---------|----------|---------------------|------------------------|--------------------------------------------------------|--------------|
| Chat-first input | Partial ("Help Me Write") | Yes | Yes | Yes | **Yes — primary modality** |
| SWOT/Porter/STP/4Ps generation | Yes (templated) | Yes | No (marketing only) | No (general-purpose KB) | **Yes — emitted from OneBrain rows, not template fill** |
| ICP / persona / JTBD | Light | Light | Strong (their core) | No | **Yes — first-class entity in OneBrain + wiki** |
| Three-statement financials | Yes (mature) | Yes (basic) | No | No | **v1: analysis only; v2+: full model** |
| Source ingest into a persistent KB | No (per-plan only) | No | No | Yes (Karpathy core) | **Yes — OneBrain + wiki hybrid** |
| Evidence linking on every claim | No | No | No | Partial (LLM citations in chat) | **Yes — wiki claim → OneBrain row, by construction** |
| Contradiction surfacing | No (smooths) | No (smooths) | No | Partial (Karpathy mentions; impls vary) | **Yes — explicit, preserved, called out** |
| Hypothesis status on claims | No | No | No | No | **Yes — schema-level field** |
| Devil's-advocate / red-team pass | No | No | No | No | **Yes — sub-agent or scheduled critical pass** |
| Confidence weighting | No | No | No | No | **Yes — narrative prose hedges per row confidence** |
| Generic across industries | No (templates) | No (templates) | Marketing-only | Yes (general-purpose) | **Yes — frameworks are industry-neutral** |
| Local-only / file-over-app | No (SaaS) | No (SaaS) | No (SaaS) | Yes | **Yes — local Postgres + Obsidian vault** |
| Obsidian as wiki UI | No | No | No | Yes | **Yes** |
| Chat-to-wiki via compilation agent (not direct) | N/A | N/A | N/A | Mostly direct (Karpathy single-writer); Nate B Jones hybrid is rarer | **Yes — Nate B Jones write path is the differentiator** |
| Comprehensive plan compilation artifact | Yes (their product) | Yes | No | No | **Yes — composed from wiki pages** |

The competitive position: **business-plan tools have plan generation but no compounding research substrate; Karpathy-pattern tools have the substrate but no business-plan output; this system unifies both, plus the critical/hypothesis discipline that nobody in either column has.**

---

## Notes for Downstream Roadmap

**Phase ordering implications (for the roadmap agent):**

1. **OneBrain schema before everything.** The schema is the foundation for confidence weighting, hypothesis status, evidence linking, contradiction surfacing, and devil's-advocate. Specing it carelessly means refactoring everything later.
2. **Compilation agent is the longest single piece of work.** It's the architectural keystone (per Nate B Jones) and the riskiest unknown. Plan a dedicated phase, not a sub-task.
3. **Source ingest → OneBrain → manual recompile loop is the smallest end-to-end MVP slice.** Once that loop closes for *one* framework page (say, SWOT), every other framework page is replication.
4. **Critical/hypothesis discipline ships in two layers.** The CLAUDE.md identity layer (LOW cost, ship in v1) makes chat push back; the schema-driven layer (MEDIUM cost, ships with the OneBrain schema) makes the wiki carry confidence/status. Both must land in v1 or the "critical agent" promise rings hollow.
5. **Devil's-advocate / pre-mortem are v1.x, not v1.** They depend on a populated wiki to challenge. Building them before the wiki is populated is premature.
6. **Investor-grade financial projections are explicitly v2+.** PROJECT.md is unambiguous; v1 is the strategic + research foundation, financial *analysis* (rows of evidence) only.

**Anti-feature watch (the roadmap agent should not let these creep into v1):**

- Auth, multi-user, mobile, cloud, SaaS, industry templates, custom graph view, drag-and-drop builder, auto-fix lint, direct chat-to-wiki writes, auto-resolved contradictions, vector RAG before scale demands it.

---

## Sources

### Business-planning competitor surface (HIGH confidence, multiple verified sources)
- LivePlan blog comparison: https://www.liveplan.com/blog/planning/ai-business-plan-writing-tools-ranked
- Monday.com 10-best 2026 comparison: https://monday.com/blog/crm-and-sales/best-ai-for-business-plan/
- Bizplanr feature page: https://dev.saasworthy.com/product/bizplanr-ai
- Plania financial features: https://www.plania.ai/product/finance
- IdeaBuddy financial features: https://ideabuddy.com/features/financial-plan/
- Upmetrics AI generators overview: https://upmetrics.co/blog/ai-business-plan-generators
- PrometAI: https://prometai.app/

### Strategic frameworks (HIGH confidence, canonical references)
- AUT MARS guide (PEST/Porter/SWOT): https://aut.ac.nz.libguides.com/c.php?g=205007&p=6861991
- Toolshero Porter Five Forces: https://www.toolshero.com/strategy/porter-five-forces-model/
- Adnan Masood — frameworks in AI/digital era: https://medium.com/@adnanmasood/strategic-planning-frameworks-and-their-applicability-in-the-context-of-artificial-intelligence-and-626f35d44158
- Broadhurst Digital — five frameworks alongside SOSTAC: https://broadhurst.digital/blog/five-marketing-frameworks-to-complement-sostac

### JTBD / persona / ICP tooling (HIGH confidence, direct product review)
- Delve AI JTBD vs personas: https://www.delve.ai/blog/personas-jobs-to-be-done
- Delve AI ICP solution: https://www.delve.ai/solutions/ideal-customer-profile
- M1-Project AI persona guide: https://www.m1-project.com/blog/how-to-create-a-buyer-persona-that-drives-results-with-ai-powered-insights
- Lemlist AI buyer personas: https://www.lemlist.com/blog/ai-buyer-personas

### Memory / wiki / RAG patterns (HIGH-MEDIUM confidence; primary sources for Karpathy/Nate, secondary for production-RAG norms)
- Karpathy LLM Wiki gist (primary, .planning/inputs/karpathy-llm-wiki-gist.md): https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
- Nate B Jones hybrid transcript (primary, .planning/inputs/nate-b-jones-hybrid-transcript.md)
- obsidian-wiki framework (Karpathy-pattern impl): https://github.com/Ar9av/obsidian-wiki
- obsidian-llm-wiki-local (Karpathy-pattern impl): https://github.com/kytmanov/obsidian-llm-wiki-local
- second-brain (Karpathy-pattern impl): https://github.com/NicholasSpisak/second-brain
- claude-obsidian (Karpathy-pattern impl): https://github.com/AgriciDaniel/claude-obsidian
- 2026 production RAG norms (NStarX): https://nstarxinc.com/blog/the-next-frontier-of-rag-how-enterprise-knowledge-systems-will-evolve-2026-2030/
- LLM Wiki vs RAG comparison (MindStudio): https://www.mindstudio.ai/blog/llm-wiki-vs-rag-markdown-knowledge-base-comparison

### Critical / hypothesis-aware agent patterns (MEDIUM confidence; emerging 2026 literature)
- Lobehub critical-reasoning skill (5-mode devil's-advocate): https://lobehub.com/skills/arnwaldn-gsd-atum-the-fool
- Daniel Miessler RedTeam skill pack: https://github.com/danielmiessler/Personal_AI_Infrastructure/blob/main/Packs/Thinking/src/RedTeam/SKILL.md
- Confident AI agent evaluation guide: https://www.confident-ai.com/blog/definitive-ai-agent-evaluation-guide
- Sparkco confidence scoring in AI agents: https://sparkco.ai/blog/mastering-confidence-scoring-in-ai-agents
- LlamaIndex confidence threshold: https://www.llamaindex.ai/glossary/what-is-confidence-threshold

### Deep research agent patterns (HIGH confidence on the Anthropic/Perplexity references)
- ByteByteGo on OpenAI/Gemini/Claude deep research agents: https://blog.bytebytego.com/p/how-openai-gemini-and-claude-use
- Perplexity Deep Research announcement: https://www.perplexity.ai/hub/blog/introducing-perplexity-deep-research
- Tavily Agent Skills docs: https://docs.tavily.com/documentation/agent-skills
- Three Ways to Build Deep Research with Claude: https://paddo.dev/blog/three-ways-deep-research-claude/

### SaaS-bloat / single-user framing (MEDIUM confidence; trend literature)
- TechCrunch SaaSpocalypse: https://techcrunch.com/2026/03/01/saas-in-saas-out-heres-whats-driving-the-saaspocalypse/
- Orbilon Tech: https://orbilontech.com/ai-agents-replacing-saas-tools-2026/

---
*Feature research for: AI agent for investor-grade business plans w/ hybrid Karpathy+OneBrain memory and critical/hypothesis persona*
*Researched: 2026-04-25*
