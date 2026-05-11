---
title: "Product Brief Distillate: business-planner-bmad"
type: llm-distillate
source: "product-brief-business-planner-bmad.md"
created: "2026-04-16"
purpose: "Token-efficient context for downstream PRD creation"
---

# Product Brief Distillate: Business Planner

## Origin & Motivation

- Creator co-founded a company that built a working product but never built the business — no market research, no financial model, no GTM strategy. Product worked; company didn't. This failure is the direct motivation.
- The tool exists to prevent that specific failure mode from recurring across future ventures.
- "Created a product, not a company" is the north-star framing — every feature should be evaluated against whether it prevents this.

## User Profile

- Single user (Downe), forever. No multi-user, no distribution, no SaaS aspirations.
- Tenacious worker — will put in many hours/day, sometimes full days, for however long the project takes. Does not lose steam from effort or duration.
- Primary failure risk is **process dissatisfaction**, not burnout. Quality of workflow, tooling, and collaboration matters more than speed.
- Prioritizes high-quality, maintainable, readable code over quick wins. Technical debt and shortcuts require justification.
- Wants evidence-backed decisions — explicitly refuses to speculate on domain questions, preferring the agent to research and present findings.

## Adversarial / Critical-Thinking Framework (Detailed)

- **Systemized skeptic sub-agent** — not a prompt pattern or tone adjustment. A dedicated agent component that provides structured, independent challenge. Analogous to BMAD's Skeptic Reviewer but persistent across the planning workflow.
- **Pushback calibration**: intensity scales with (a) strength/confidence of supporting evidence and (b) stakes of the decision. High-evidence + high-stakes = maximum pushback. Low-evidence + low-stakes = lighter touch.
- **Disagreement resolution protocol**:
  1. Agent presents evidence + confidence level for its position
  2. If user disagrees, agent enters **steelmanning mode** — actively seeks the strongest evidence FOR the user's opposing view
  3. Agent presents both sides honestly with sources
  4. User makes the final decision
  5. **Critical**: intelligence findings are preserved regardless of the decision. The agent continues reasoning from the evidence, not from the user's choice.
  6. Decisions made against evidence are logged as such — retrievable later ("you decided X despite evidence for Y")
- **Idea kill gate**: first-class feature. Go/No-Go verdict capability for early-stage business idea evaluation, designed to kill bad ideas before significant effort is invested.
- **Risk**: adversarial tone can overshoot into obstructionism. Research shows users abandon tools that feel combative rather than rigorous. Calibration is a real design problem — needs testing and tuning, not just a prompt.

## Wiki Mechanism (Detailed)

- Based on Karpathy's wiki library pattern (reference gist: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
- **Graduated-trust update model**:
  - **Phase A (bootstrap)**: User and agent co-build wiki foundation together. This is the expected FIRST activity after tool setup. Agent researches and recommends entries; user approves/rejects/modifies each one.
  - **Phase B (collaborative)**: User can direct agent to add/modify wiki content at any time. Agent proposes improvements at natural stopping points or end of sessions ("based on the work we just did, I recommend adding this article").
  - **Phase C (autonomous)**: Once user has confidence in the agent's editorial judgment (after enough approved edits), agent earns autonomous wiki update permissions.
- **Purpose**: wiki provides behavioral context for the agent. CLAUDE.md defines identity; wiki defines methodology and accumulated business-planning knowledge; Pinecone stores project-specific intelligence.
- **Cross-project**: wiki persists across business ideas. When starting a new project (new projectId), the wiki carries forward all accumulated methodology learnings.

## Memory Architecture (Detailed)

- **Two distinct memory layers**, each with different persistence and scope:
  1. **Project-specific intelligence** (Pinecone, namespaced by projectId): research findings, evidence, document versions, decision logs, intelligence briefs. Scoped to one business idea.
  2. **Cross-project methodology** (wiki library): generalizable business-planning learnings, frameworks, procedures. Persists across all projects.
- **Session state continuity**: Pinecone also serves as session-state store. Agent monitors context usage, recognizes natural stopping points ("competitive analysis complete" vs. "mid-brainstorm"), proactively checkpoints to Pinecone before context limits, resumes via RAG in fresh sessions.
- **Multi-project model**: single repo, projectId-based Pinecone namespacing. Starting a new business idea = new projectId. Wiki carries over; Pinecone intelligence starts fresh per project. Older business-idea corpora remain accessible for historical reference.
- **Stale memory risk**: vector retrieval is probabilistic. Without curation, stale assumptions, superseded research, and contradictory document versions can poison future reasoning. Wiki should include memory-governance rules. Architecture needs explicit versioning and staleness signals.

## Financial Modeling Architecture

- **The agent does NOT perform math.** This is a hard constraint.
- Financial data is stored in Postgres, grounded in intelligence findings from research.
- All mathematical modeling, projections, and calculations are executed by a **deterministic compute layer in the Node API**, exposed to the agent as tools.
- Financial documents are **templates that surface the underlying computed data** — not prose generated by the LLM.
- This is a Phase 2 concern but architecturally significant: the compute layer needs to be designed in Phase 1's architecture even if not built until Phase 2.
- Competitor tools (LivePlan, Enloop) use rigid spreadsheet templates for financial projections because LLMs reliably produce numbers that drift and contradict narrative. This design avoids that failure mode entirely.

## Competitive Landscape (Preserved from Research)

- **LivePlan**: template-driven SaaS with AI assistant for section drafting. Gaps: form-filling UX, no dialogue; AI drafts to fill templates, never challenges; no persistent memory; outputs optimized for polish not rigor.
- **Upmetrics / Bizplan / Enloop**: AI plan generators from short prompts + questionnaires. Gaps: "plan in minutes" speed optimization; generic boilerplate widely recognized as AI output; no adversarial posture; no memory.
- **ChatGPT Custom GPTs** ("Business Plan Writer", "Strategy GPT"): GPT-4/5 system-prompted personas. Gaps: shallow memory (short notes, not vector-indexed corpus); default sycophantic (RLHF); no artifact versioning; must re-establish standards every session.
- **Notion AI + templates / Perplexity Spaces**: Notion = writing assistant, not critic; Perplexity = sourced research with no opinion. Neither maintains wiki or produces financial projections.
- **Claude Projects + Artifacts**: closest built-in alternative. Gaps: flat file/instruction memory, not semantic retrieval; doesn't scale past context window; no structured versioning; no self-editing wiki; user must enforce adversarial behavior manually every turn.

## Market Timing Signals

- Claude Opus 4.x (2025) is first model generation that sustains adversarial reasoning over long sessions without drifting to agreeable tone.
- LLM sycophancy is now a named industry problem (Anthropic research, GPT-4o rollback April 2025). "Anti-sycophancy" is a training objective, not yet a product category.
- Managed vector DBs (Pinecone serverless, pgvector) dropped to effectively free at personal-use scale in 2024-2025.
- Agent frameworks (Claude Agent SDK, LangGraph, PydanticAI) and MCP standardization in 2025 made bespoke single-user workbenches realistic.
- BYO-AI for personal productivity is normalized among technical users in 2025.

## User Sentiment on Existing Tools

- LivePlan/Upmetrics reviews: outputs read as "AI slop" that bankers recognize; tool never pressure-tests underlying business logic.
- G2/Capterra reviews of AI plan generators: hallucinated market sizes, fabricated competitor data, invented statistics. Users must fact-check everything.
- ChatGPT business-plan GPTs: "just agrees with me", "validates whatever I input". Users manually prompt "be harsh" every session.
- Financial projections are a frequent pain point: either rigid templates disconnected from strategy, or AI-generated numbers with no defensible assumptions.
- Solo founders on IndieHackers/r/SaaS describe the exact failure mode this tool targets: building product first and business second.

## Scope Signals

**Confirmed in Phase 1:**
- Chat UI + agent core
- Web research + evidence collection
- Pinecone memory (projectId-scoped)
- Wiki with graduated-trust updates (first user activity)
- Systemized skeptic sub-agent
- Idea kill gate
- Critical-thinking decision framework
- Context-aware session management

**Confirmed out of scope for Phase 1:**
- All document production workflows (strategic frameworks, marketing plans, business plans, financial projections)
- Polished output formats (PDF, PPTX, branded decks)
- Multi-user / collaboration / sharing
- Mobile or non-local hosting
- Live data integrations (stock APIs, Census data, real-time feeds)
- Non-business-planning use cases

**Phase 2 (PRD written after Phase 1 ships):**
- Strategic framework document production
- Marketing plan production
- Business plan production
- Financial modeling with deterministic compute layer

**Deferred / future (no timeline):**
- Polished document output (PDF/PPTX/branded)
- Post-plan accountability layer (checking live decisions against documented strategy)
- Anonymized/aggregated wiki learnings as publishable content

## Rejected Ideas & Rationale

- **Multiple PRDs written in parallel**: rejected because Phase 1 learnings should inform Phase 2 spec. Can't know how agent behaves until it's built.
- **Single mega-PRD covering everything**: rejected because scope too broad and document-production end too speculative to spec confidently before intelligence platform exists.
- **Designing for other users**: rejected permanently. No generalization tax. Every design decision optimized for one person's workflow.
- **Domain research before building the tool**: skipped. For a personal tool, surveying how existing tools solve this is informative but not blocking. The competitive research captured above is sufficient context.

## Technical Context & Preferences

- **Stack**: Node/TypeScript backend, React frontend, local Postgres in Docker (managed with node-pg-migrations), local pgAdmin container, no auth.
- **AI**: Claude Opus primary model. Coordinator/sub-agent or agent-team topology TBD in architecture.
- **Orchestration**: LangChain/LangGraph or Claude Agent SDK — needs architecture validation. These are fundamentally different architectures; deferring too long risks mid-build pivot.
- **Research**: Tavily or equivalent for web search.
- **NotebookLM**: mentioned as potential tool for delivering finished documents. Deferred consideration.
- **Code quality**: user explicitly prioritizes high-quality, maintainable, readable code. No shortcuts, no quick wins at the expense of architecture.

## Build Justification

- The 80% alternative: Claude Project + Pinecone MCP + manual discipline. Why it breaks:
  - (a) Context window saturates once research accumulates past 200K tokens
  - (b) Cross-session memory doesn't persist in Claude Projects
  - (c) Structured artifact versioning doesn't exist
  - (d) Steelmanning/intelligence-preservation protocol needs durable state management
  - (e) Wiki curation and retrieval needs a structured layer beyond flat files
- The 80% solution breaks at exactly the points that matter most for this tool's value proposition.

## Open Questions for Architecture

- **Agent topology**: coordinator/sub-agent vs. agent-team? Sub-agents need to share context (e.g., skeptic needs access to research findings). If sub-agents need to communicate with each other during work, agent-team may be more appropriate.
- **LangChain/LangGraph vs. Claude Agent SDK**: fundamentally different trade-offs. Decision should not be deferred past architecture phase.
- **Wiki retrieval strategy**: how does the agent decide which wiki articles are relevant to the current conversation? Full wiki in context? Semantic retrieval? Hybrid?
- **Pinecone schema design**: how to separate research findings, evidence, decision logs, session state, and document versions within a project namespace.
- **Cost monitoring**: Claude Opus + Tavily + Pinecone at research depth could cost significantly per project. Need cost visibility per session/project.
- **Context checkpoint schema**: what gets saved, in what format, and how does a fresh session reconstruct working state from a checkpoint + RAG?

## First User Activity (Expected Workflow)

1. Set up the tool (docker, deps, config)
2. **Co-build the wiki foundation** with the agent — this is the very first substantive activity. Establishes methodology, frameworks, behavioral norms.
3. Create a new project (projectId) for the radio app
4. Begin research — agent investigates the local internet streaming radio market, accumulates intelligence in Pinecone
5. Agent challenges findings and assumptions via skeptic sub-agent throughout
6. Multi-day sessions with checkpoint/resume cycles
7. (Phase 2) Begin producing strategic documents grounded in accumulated intelligence
