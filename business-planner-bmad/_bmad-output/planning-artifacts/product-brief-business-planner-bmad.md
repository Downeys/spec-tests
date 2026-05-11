---
title: "Product Brief: Business Planner"
status: "complete"
created: "2026-04-16"
updated: "2026-04-16"
inputs: [user brain dump, web competitive research, guided elicitation, three-lens review panel]
---

# Product Brief: Business Planner

## Executive Summary

The creator of this tool once co-founded a company that built a working product — but never built the business around it. No rigorous market research. No defensible financial model. No go-to-market strategy that survived contact with reality. The product worked; the company didn't. That failure is the origin of Business Planner.

Business Planner is a personal AI workbench — the anti-sycophancy planning tool. Where every other AI assistant validates assumptions and produces agreeable output, this agent treats every statement as a hypothesis that needs evidence, pushes back with calibrated intensity, and refuses to let its user mistake a product idea for a business. Built on Claude Opus with durable memory (Pinecone) and a self-maintaining methodology wiki, it researches, challenges, and documents comprehensive business plans including strategic frameworks, marketing strategy, and financial projections.

This is a single-user personal tool. It is not a product, not a SaaS, and not designed for distribution. It exists to serve one founder across multiple business ventures over years.

## The Problem

Solo founders building new businesses face a specific, well-documented failure mode: they build the product and skip the company. Market research is shallow or skipped. Financial projections are optimistic guesses. Competitive analysis is cursory. The result is a product that works but a business that doesn't — discovered only after months or years of misallocated effort.

Existing AI tools make this worse, not better:

- **Plan generators** (LivePlan, Upmetrics, Enloop) produce template-filled documents that bankers and investors recognize as generic output. They validate whatever the user inputs and never challenge underlying logic.
- **General-purpose AI** (ChatGPT, Claude Projects) is sycophantic by default, has no durable memory across sessions, and loses context when research accumulates past the context window.
- **Research tools** (Perplexity) excel at sourced answers but have no opinion, no strategic framework, and no artifact production pipeline.

No existing tool combines adversarial critical thinking, persistent research memory, strategic document production, and compounding methodology knowledge in a single workbench.

## The Solution

A chat-driven AI agent that acts as a relentlessly honest strategic advisor. The agent:

- **Researches in depth** using web search and accumulates findings in a durable knowledge repository (Pinecone), so nothing learned is ever forgotten
- **Challenges every assumption** — presents evidence with confidence levels, pushes back proportionally, steelmans opposing views when the user disagrees, and preserves intelligence findings even when the user decides to act against them
- **Produces four artifact families**: strategic framework documents, marketing plans, business plans, and financial projections — all with traceable sourcing back to underlying research
- **Maintains a self-evolving methodology wiki** via a graduated-trust model: initially the user and agent co-build the wiki foundation together (agent researches and recommends entries, user approves/rejects/modifies). The user can also direct the agent to add or modify wiki content at any time. As work progresses, the agent suggests improvements at natural stopping points ("based on the work we just did, I recommend adding this article"). Over time, as the user develops confidence in the agent's editorial judgment, the agent earns autonomous update permissions. The wiki captures generalizable business-planning learnings, making the agent measurably sharper with each successive project
- **Manages its own context intelligently** — recognizes natural stopping points, checkpoints state to memory before context limits, and resumes seamlessly

## What Makes This Different

**Adversarial by design, not by prompt.** The critical-thinking stance is architectural, not a system prompt that says "be critical." A dedicated skeptic sub-agent provides systemized challenge — structured, consistent, and independent of the primary agent's reasoning. The skeptic presents evidence with confidence levels, calibrates pushback intensity based on evidence strength and decision stakes, and enforces a consistent protocol across every interaction. This includes a first-class **idea kill gate**: the ability to surface a Go/No-Go verdict early in the planning process, killing bad ideas before significant effort is invested.

**The steelmanning protocol.** When the user disagrees with the agent's position, the agent doesn't capitulate or obstruct. It actively seeks the strongest evidence *for* the user's opposing view, presents both sides honestly, and lets the user decide. Critically: the intelligence findings are preserved regardless of the decision. The agent continues acting on what the evidence says, not what the user chose. Six months later, the user can review any past decision and see "you decided X despite evidence for Y — here's what the evidence still says." This is an accountability mechanism no other tool offers.

**Memory that compounds.** Two distinct memory layers: project-specific intelligence (research, findings, document versions per business idea, namespaced by projectId) and cross-project methodology (the wiki, which grows richer with each planning cycle). Every second business plan starts smarter than the first.

**Traceable sourcing as a trust primitive.** In a post-ChatGPT world where professionals distrust AI output by default, every claim in every document traces back through frameworks to underlying evidence with original sources. The user can audit the full reasoning chain from business plan → strategic framework → research findings → original sources. This is not a feature — it is the credibility foundation the entire tool rests on.

**Session continuity without context collapse.** Multi-day planning sessions are first-class. The agent recognizes natural stopping points in the work (e.g., "competitive analysis complete" vs. "mid-brainstorm"), proactively checkpoints state to durable memory before context limits, and resumes seamlessly in a fresh session with full context via retrieval. This is a reliability promise that generalist AI tools structurally cannot make.

## Success Criteria

**Near-term (first project — local internet streaming radio app):**
- Every insight in every strategic document traces to a citable source
- Data flows visibly through mission → vision → values → strategic frameworks → plans
- The user can read sources independently and confirm decisions are sound
- Output quality meets investor-scrutiny bar: a first-time reader of the business plan can identify the three biggest risks and the evidence basis for the revenue model without asking follow-up questions

**Phase 1 exit criterion:** The intelligence platform, used to research and challenge the radio app business idea, produces a coherent body of sourced intelligence that the user trusts enough to build Phase 2's document production on top of. If the research feels shallow, the pushback feels generic, or the memory feels unreliable after a multi-day session — Phase 1 is not done.

**Long-term (second project onward):**
- Wiki-driven improvements are visible — agent avoids mistakes and applies learnings from project one
- The tool functions as a decision gate: some business ideas get killed early based on evidence, saving months of misallocated effort
- Two businesses planned and launched using the tool within 2-3 years

**Bootstrapping acknowledgment:** The wiki starts empty. The adversarial framework is unproven on day one. The first project (radio app) is a trust-building exercise, not a validated capability. Expectations should be calibrated: the tool earns its stripes over weeks, not on first use.

## Scope

**Phase 1 — Intelligence Platform (PRD 1):**
- Chat UI with Claude Opus agent
- Web research capability with evidence collection
- Pinecone-backed knowledge repository (project-scoped via projectId)
- Methodology wiki with graduated-trust update model (Karpathy pattern) — co-building the wiki foundation is the expected first user activity
- Systemized skeptic sub-agent for adversarial challenge
- Idea kill gate — Go/No-Go verdict capability for early-stage evaluation
- Critical-thinking decision framework (evidence → calibrated pushback → steelman → user decides → intelligence preserved)
- Context-aware session management with proactive checkpointing

**Explicitly out of scope for Phase 1:**
- Strategic document production workflows (deferred to Phase 2)
- Polished output formats (PDF, PPTX, branded decks)
- Multi-user, collaboration, or sharing
- Mobile or non-local hosting
- Live data integrations (stock APIs, Census data, real-time feeds)
- Non-business-planning use cases

**Phase 2 — Plan Production (PRD 2, written after Phase 1 ships):**
- Strategic framework document production
- Marketing plan production
- Business plan production
- Financial modeling and projections (deterministic compute layer in Node API; agent uses tools, never does math; financial docs are data-driven templates)

## Technical Approach (High-Level)

- **AI core:** Claude Opus primary model; coordinator/sub-agent topology with a dedicated skeptic sub-agent for systemized critical review. Agent-team vs. coordinator pattern to be validated during architecture.
- **Memory:** Pinecone for long-term intelligence and session state; projectId-based namespacing for multi-business isolation; wiki library for cross-project methodology with graduated-trust update permissions.
- **Financial compute:** The agent does not perform math. Financial data is stored in Postgres, grounded in intelligence findings. All mathematical modeling and projections are executed by a deterministic compute layer in the Node API, exposed to the agent as a tool. Financial documents are templates that surface the underlying computed data — not prose generated by the LLM.
- **Stack:** Node/TypeScript backend, React frontend, local Postgres in Docker, no auth
- **Orchestration:** LangChain/LangGraph or Claude Agent SDK, to be validated
- **Research:** Tavily or equivalent for robust web search

## Constraints

- **Single user, forever.** No auth, no multitenancy, no generalization for other users. Every design decision optimized for one person's workflow.
- **Cost-aware.** Claude Opus API + Tavily + Pinecone at research depth could compound. Architecture should monitor and surface costs per project so the user can make informed trade-offs.
- **Build justification.** This tool could theoretically be approximated with a strong Claude Project system prompt + Pinecone MCP + manual discipline. What justifies the build: (a) context-window saturates once research accumulates past 200K tokens, (b) cross-session memory doesn't persist in Claude Projects, (c) structured artifact versioning doesn't exist, (d) the steelmanning/intelligence-preservation protocol needs durable state management, and (e) the wiki curation and retrieval needs a structured layer. The 80% solution breaks at exactly the points that matter most.

## Vision

In 2-3 years, this tool has planned multiple businesses. Some were killed early — the agent surfaced fatal flaws before significant investment. Others were launched with unusually rigorous foundations: sourced market analysis, defensible financial projections, and strategies that survived contact with reality because they were stress-tested before launch.

The wiki is dense with hard-won methodology. Every new business idea benefits from every previous one. The tool hasn't just produced plans — it's become a decision gate that prevents the "product without a company" failure mode that motivated its creation.
