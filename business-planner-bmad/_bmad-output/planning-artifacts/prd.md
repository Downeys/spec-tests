---
stepsCompleted: [step-01-init, step-02-discovery, step-02b-vision, step-02c-executive-summary, step-03-success, step-04-journeys, step-05-domain-skipped, step-06-innovation, step-07-project-type, step-08-scoping, step-09-functional, step-10-nonfunctional, step-11-polish]
inputDocuments: [product-brief-business-planner-bmad.md, product-brief-business-planner-bmad-distillate.md]
documentCounts:
  briefs: 2
  research: 0
  brainstorming: 0
  projectDocs: 0
workflowType: 'prd'
classification:
  projectType: web_app
  domain: general
  complexity: medium
  projectContext: greenfield
---

# Product Requirements Document - Business Planner

**Author:** Downe
**Date:** 2026-04-16

## Executive Summary

Business Planner is a personal AI workbench for researching, challenging, and documenting business plans. It serves a single user across multiple business ventures over years. The first venture — a local internet streaming radio app — is the forcing function for Phase 1.

The tool addresses a specific failure mode: building a product without building a company. Market research gets skipped, financial projections are guesswork, competitive analysis is shallow. Existing AI tools reinforce this by being sycophantic, forgetful, and generic. Business Planner is the antidote — an agent that treats every assumption as a hypothesis, demands evidence, and refuses to let the user proceed unchallenged.

**This PRD covers Phase 1: the Intelligence Platform** — the research, memory, and adversarial-challenge foundation. It includes the chat UI, Claude Opus agent core, web research with evidence collection, Pinecone-backed knowledge repository, a self-maintaining methodology wiki, a systemized skeptic sub-agent, and context-aware session management. Phase 1 is shippable on its own as a personal research and critical-thinking assistant, even before document production (Phase 2) exists.

### What Makes This Special

**Adversarial architecture, not adversarial prompting.** A dedicated skeptic sub-agent provides independent, systemized challenge with calibrated pushback intensity. When the user disagrees, a steelmanning protocol seeks the strongest counter-evidence, presents both sides, and preserves intelligence findings regardless of the decision made. This is an accountability mechanism — not a tone setting.

**Memory that compounds across ventures.** Two distinct layers: project-specific intelligence in Pinecone (namespaced by projectId) and a cross-project methodology wiki that carries forward learnings. The second business plan starts where the first one's lessons left off.

**Traceable sourcing as the trust foundation.** Every insight links to evidence. Every evidence links to sources. The user can audit the full reasoning chain. In a landscape where professionals distrust AI output by default, auditability is not a feature — it is the credibility prerequisite.

**Session continuity across days.** User-triggered checkpointing saves state to durable memory. The agent resumes seamlessly via retrieval in fresh sessions. Multi-day planning workflows are first-class, not an afterthought.

## Project Classification

- **Type:** Web Application (SPA) — React frontend, Node/TypeScript backend
- **Domain:** General (AI-powered business planning, no regulated vertical)
- **Complexity:** Medium (high technical ambition — multi-agent AI, vector DB, session continuity — low domain regulation)
- **Context:** Greenfield — no existing codebase
- **Users:** Single user, forever. No auth, no multitenancy.

## Success Criteria

### User Success

- **Traceable intelligence chain.** Every insight the agent surfaces links to evidence, and every piece of evidence links to an original source. The user can independently verify any claim by following the chain.
- **Investor-grade rigor.** A first-time reader of any output document can identify the top risks and the evidence basis for key decisions without asking follow-up questions.
- **Reliable session continuity.** After a checkpoint and resume, the agent remembers: a summary of prior conversations, key decisions made, open questions, and all accumulated intelligence. The user should be able to ask questions about previously researched topics and get informed answers without re-explaining context.
- **Memory fidelity under probing.** Minor details may not surface unprompted — that's acceptable. Significant findings, decisions, and intelligence must be recallable when the user asks. Failure to recall significant details when probed is a trust-breaking event.
- **Wiki compounds visibly.** On the second business venture, the agent demonstrably avoids mistakes made during the first and applies accumulated methodology without being reminded.

### Business Success

- **Plans pass scrutiny.** Strategy documents, marketing plans, and financial projections (Phase 2) are rigorous enough to withstand investor or advisor review — not recognized as generic AI output.
- **Wiki improves over time.** The methodology wiki shows noticeable growth and refinement across projects, and its effect on agent behavior is observable.

### Technical Success

- **Quality over speed.** No latency constraints on agent responses. The agent should take as much time as needed to produce thorough, well-researched output. A 30-second or longer pause for web research is expected and acceptable — the user multitasks.
- **Research integrity.** Findings are sourced from real, verifiable references. No hallucinated market data, no fabricated statistics, no invented competitors. Every research finding includes its source.
- **Skeptic specificity.** The skeptic sub-agent's pushback is evidence-based and specific to the current context — not generic "have you considered..." prompts. Pushback should reference concrete findings and name specific risks.
- **Wiki retrieval accuracy.** Relevant wiki articles surface and influence agent behavior for the current topic. Irrelevant articles do not pollute context.
- **Cost visibility.** The user can understand the approximate cost of API usage per session or project to make informed trade-offs.

### Measurable Outcomes

| Outcome | Measure | Target |
|---------|---------|--------|
| Source traceability | % of insights with cited sources | 100% for research findings |
| Session resume fidelity | Can answer questions about prior session topics | Yes, for all significant findings and decisions |
| Skeptic value | % of pushbacks that reference specific evidence | >80% |
| Wiki growth | New/updated articles per completed project | Measurable increase per project |
| Investor readiness | External review of output docs (Phase 2) | Passes without "this looks AI-generated" feedback |

## Product Scope

### MVP — Phase 1: Intelligence Platform

Phase 1 is the MVP. All listed components are required to deliver value — none can be deferred without breaking the core experience.

- **Chat UI** — Browser-based SPA for conversational interaction with the agent
- **Claude Opus agent core** — Primary reasoning engine with business-planning identity
- **Web research capability** — Tavily or equivalent for in-depth, sourced web research with evidence collection
- **Pinecone knowledge repository** — Project-scoped (projectId) durable memory for intelligence, evidence, decision logs, and session state
- **Methodology wiki** — Self-maintaining wiki library (Karpathy pattern) with graduated-trust update model; co-building the wiki is the first user activity
- **Systemized skeptic sub-agent** — Dedicated adversarial challenge agent with calibrated pushback intensity and steelmanning protocol
- **Context-aware session management** — User-triggered checkpointing to Pinecone with context health gauge, seamless resume via retrieval

### Growth Features — Phase 2: Plan Production

Written as a separate PRD after Phase 1 ships and real usage informs the spec.

- Strategic framework document production
- Marketing plan production
- Business plan production
- Financial modeling and projections (deterministic compute layer in Node API — agent uses tools, never does math)
- Polished output formats (PDF, PPTX — timing TBD)

### Vision (Future)

- Multiple businesses planned and launched using the tool — some killed early, others launched with rigorous foundations
- Dense methodology wiki carrying years of hard-won learnings
- The tool is a proven decision gate for which ideas deserve time and capital
- Post-plan accountability layer — flagging when live decisions diverge from documented strategy

## User Journeys

### Journey 1: First Launch — Building the Foundation

Downe has just finished setting up the tool — Docker containers running, dependencies installed, Pinecone provisioned with a fresh namespace. He opens the chat UI for the first time. The wiki is empty. Pinecone is empty. The agent has its identity from CLAUDE.md but no methodology, no accumulated wisdom, no project context.

"Let's build the wiki," Downe types. The agent begins by researching foundational business-planning methodology — frameworks like Porter's Five Forces, Blue Ocean Strategy, Business Model Canvas, Jobs-to-be-Done. For each topic, the agent drafts a wiki article summarizing the framework, when to apply it, its strengths and limitations, and how it connects to other frameworks. Downe reviews each recommendation. Some he approves as-is. Some he modifies — he has opinions about which frameworks are overrated and which are underutilized. Some he rejects entirely. The agent updates the wiki with each decision.

This takes hours. Maybe a full day. By the end, the wiki has 15-20 foundational articles. The agent's behavior is already different — when Downe asks a strategic question, the agent's responses reference wiki methodology instead of generic reasoning. The foundation is set. Tomorrow, they start on the radio app.

**Requirements revealed:** Wiki CRUD operations with approval workflow. Agent ability to research and propose wiki articles. User ability to approve/reject/modify proposals. Agent behavior visibly influenced by wiki content. First-run experience that guides toward wiki bootstrapping.

### Journey 2: Deep Research Session — Drilling Into the Radio App Market

It's Wednesday morning. Downe has been working on the radio app project for a few days. Today's focus: competitive landscape for local internet streaming radio. He opens the tool, and the agent has context from prior sessions — it knows they've already established the mission/vision and identified the target market.

"I want to understand who else is doing local internet radio and how they're monetizing," Downe says. The agent kicks off a series of web searches. 30 seconds pass. A minute. Downe switches to another tab and checks email. A research summary appears — the agent found seven competitors across three monetization models, with sources for each finding.

The skeptic weighs in immediately: "Three of these competitors launched in markets 10x larger than your target. The monetization data may not transfer to a local market. The sample size for local-only stations is small — only two examples, both with unclear revenue data. Confidence in the monetization analysis is low."

Downe pushes back: "Local advertising is fundamentally different — national comparisons don't apply." The agent enters steelmanning mode. It searches for evidence supporting Downe's position — finds two case studies of hyperlocal media businesses with strong local ad revenue. It presents both sides: the skeptic's concern about sample size AND the evidence that local ad models can work independently of scale. Downe reviews both, decides to proceed with the local ad hypothesis but acknowledges the evidence gap. The agent logs the decision and the intelligence behind both positions — both persist in Pinecone regardless of Downe's choice.

Three hours later, the competitive landscape research is solid. The agent suggests this is a natural stopping point: "We've completed the competitive analysis. I'd recommend checkpointing here. I also have a suggestion for the wiki — based on our work today, I think we should add an article on 'Evaluating Competitive Data in Niche Markets' since the small-sample-size challenge will likely recur." Downe approves the wiki update and closes the tool.

**Requirements revealed:** Web research with source collection and citation. Skeptic sub-agent providing inline challenge with evidence and confidence levels. Steelmanning protocol (search for counter-evidence, present both sides). Decision logging that preserves intelligence regardless of user choice. Pinecone storage of research findings with sources. Natural stopping point detection. Wiki update suggestions triggered by work patterns. Session checkpointing.

### Journey 3: Session Resume — Picking Up After Three Days Away

It's Saturday. Downe hasn't touched the tool since Wednesday's competitive analysis session. He opens the chat UI. The agent loads — pulling the session checkpoint from Pinecone and retrieving relevant intelligence for the radio app project.

Downe asks: "Where did we land on monetization models?" The agent recalls: they explored three models, the skeptic flagged weak evidence for local-market transferability, Downe found the hyperlocal case studies compelling and decided to pursue local ad revenue as the primary model — but with an acknowledged evidence gap. The agent can cite the specific sources from Wednesday's research.

"What about the two local stations we found — did either of them publish listener numbers?" Downe is probing deeper. The agent retrieves the specific research findings. One station had public data in a local news article. The other didn't. The agent surfaces both — and notes that listener-count data for local internet radio is sparse across the board, which is itself a finding worth tracking.

Downe is satisfied the memory is intact. "Let's move on to market sizing." A new research thread begins, building on the competitive intelligence already accumulated.

**Requirements revealed:** Session checkpoint retrieval on load. Intelligent context reconstruction from Pinecone (not raw replay). Ability to answer specific questions about prior research with source citations. Graceful handling of information gaps ("this data doesn't exist" is a valid finding). Continuity between sessions without requiring the user to re-establish context.

### Journey 4: New Venture — The Wiki Pays Off

Six months have passed. The radio app is launched. Downe has a new idea — a local event discovery platform. He creates a new project in the tool with a fresh projectId. Pinecone starts clean for this project. But the wiki carries over — 40+ articles now, refined over months of real use.

"I want to explore a local events platform," Downe begins. The agent's first response is noticeably different from six months ago. It immediately references wiki methodology: "Before we dive in, the wiki suggests we start with market validation before competitive analysis — we added that sequence after the radio app research showed we'd been doing it in the wrong order." The agent also applies learnings about evaluating niche/local markets — the wiki article Downe approved after the competitive analysis session now shapes how the agent approaches small-market research.

Within the first hour, the skeptic surfaces a concern grounded in cross-project pattern recognition: "This looks structurally similar to the radio app's initial pitch — hyperlocal, ad-supported, community-driven. The radio app research showed that hyperlocal ad revenue requires a critical mass of local businesses willing to advertise digitally. Do we have reason to believe the events market has a different advertiser profile, or are we making the same assumption twice?"

This is the moment. The agent didn't just remember facts — it recognized a *pattern* across ventures and challenged Downe on it before he invested weeks of research. The wiki made the agent smarter. That's the compound return.

**Requirements revealed:** Multi-project support via projectId namespacing. Wiki persistence across projects. Agent behavior visibly shaped by wiki articles. Cross-project pattern recognition (referencing prior project learnings stored in wiki). Fresh Pinecone namespace per project with clean intelligence slate. Wiki article retrieval relevant to current research context.

### Journey Requirements Summary

| Capability | J1: Bootstrap | J2: Research | J3: Resume | J4: New Venture |
|-----------|:---:|:---:|:---:|:---:|
| Chat UI with streaming responses | x | x | x | x |
| Claude Opus agent with business-planning identity | x | x | x | x |
| Wiki CRUD with approval workflow | x | x | | x |
| Web research with source citation | x | x | | x |
| Pinecone read/write (intelligence storage) | | x | x | x |
| Skeptic sub-agent (inline, always-on) | | x | | x |
| Steelmanning protocol | | x | | |
| Decision logging (preserves both sides) | | x | | |
| Natural stopping point detection | | x | | |
| Session checkpointing to Pinecone | | x | | |
| Session resume from checkpoint | | | x | |
| Context reconstruction via retrieval | | | x | x |
| Multi-project support (projectId) | | | | x |
| Wiki-influenced agent behavior | x | x | x | x |
| Cross-project pattern recognition via wiki | | | | x |

## Innovation & Novel Patterns

### Detected Innovation Areas

**The integration is the innovation.** No existing tool combines always-on adversarial challenge, durable project-scoped memory, cross-project methodology wiki, traceable sourcing, and intelligence preservation in a single workbench. Individual components are adapted from established patterns — Karpathy's wiki library, BMAD's skeptic-reviewer (adapted from batch review to inline real-time companion), standard RAG memory with projectId namespacing. The bet is that the integration creates emergent value that exceeds the sum of the parts.

**Intelligence preservation independent of decisions.** When the user overrules the agent's evidence-based position, the intelligence findings persist unchanged. The agent continues reasoning from the evidence, not from the user's choice. This creates a retrievable accountability record — "you decided X despite evidence for Y" — that may be novel in personal planning tools, though similar patterns likely exist in enterprise decision-support systems.

### Market Context & Competitive Landscape

The competitive research (preserved in the product brief distillate) confirms that no shipping tool combines these capabilities. The closest alternatives — Claude Projects, ChatGPT custom GPTs, LivePlan — each cover one or two dimensions but miss the integration. The cultural moment (post-sycophancy awareness, agent framework maturity, free-tier vector DBs) makes the timing viable.

### Validation Approach

The riskiest assumption is whether an LLM-based skeptic sub-agent can maintain genuine adversarial rigor over sustained multi-day sessions without degrading to sycophancy under user pressure. Validation strategy:

1. **Early testing of skeptic persistence** — during wiki bootstrap and initial research sessions, deliberately push back against the skeptic to test whether it holds position or capitulates
2. **Compare batch vs. inline** — run BMAD's one-shot skeptic-reviewer against the same content the inline skeptic challenged in real-time; compare finding quality and specificity
3. **Memory fidelity testing** — after multi-day sessions with checkpoint/resume cycles, probe the agent on prior findings and decisions to verify intelligence preservation accuracy

### Risk Mitigation

- **Skeptic degradation:** If the inline skeptic can't maintain rigor, fallback to periodic batch-review passes (BMAD pattern) triggered at natural stopping points. Less elegant but still delivers value.
- **Integration complexity:** The combination of many components increases surface area for bugs and unexpected interactions. Mitigate with clean separation of concerns: each component (wiki, Pinecone, skeptic, research) should be independently testable.
- **Overfit to one user:** Since Downe is the only user, there's no signal on whether the integration works generally. This is acceptable — the tool is personal — but the wiki should capture methodology learnings in domain-neutral language so they remain valid if the tool's scope ever changes.

## Web Application Specific Requirements

### Project-Type Overview

Single-page application (SPA) serving as a chat-driven AI workbench. Desktop-only, Chrome-only, single user. No SEO, no responsive design, no offline capability, no accessibility beyond standard browser defaults. The simplicity of these constraints is a feature — every design decision optimizes for one user's desktop workflow with zero generalization tax.

### Technical Architecture Considerations

**Browser Matrix:**
- Chrome (latest stable) — sole supported browser
- Desktop only — no mobile, no tablet
- No responsive design — optimized for wide-screen chat + research display

**Real-Time Streaming:**
- Agent responses stream token-by-token to the UI
- Transparent process display showing:
  - Agent thinking/reasoning steps
  - Tool calls in progress (e.g., "Searching Tavily for: local internet radio monetization models")
  - Tool results as they return
  - Skeptic sub-agent input displayed inline, visually distinct from primary agent (callout or quote-block styling)
  - Final synthesized response
- Transparency goal: make the agent's process as visible as possible without excessive token cost

**Performance Targets:**
- No hard latency constraints on agent responses — quality over speed
- UI responsiveness and streaming targets specified in Non-Functional Requirements (NFR11–NFR14)

**Offline & Network:**
- Internet connection required — hard dependency on Claude API, Tavily, and Pinecone
- No offline mode, no graceful degradation for network loss
- No service worker or PWA capabilities needed

### Implementation Considerations

**Chat UI Structure:**
- Primary chat stream with streaming token display
- Inline skeptic display (visually differentiated — e.g., different background, border, or icon)
- Expandable/collapsible sections for agent thinking and tool call details (keeps the UI clean while maintaining transparency)
- Wiki browsing/editing interface (separate view or panel — to be determined in UX design)
- Project selection/switching for multi-venture support

**Simplified Build Surface:**
- No auth layer — no login, no sessions, no user management
- No SEO — no SSR, no meta tags, no sitemap
- No responsive breakpoints — single fixed-width or fluid desktop layout
- No cross-browser testing — Chrome DevTools only
- No accessibility audit — standard semantic HTML is sufficient

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**MVP Approach:** Problem-solving MVP — deliver the core research + adversarial challenge workflow with minimum viable implementation complexity. Every component serves the primary use case: researching a business idea with rigorous, evidence-backed critical thinking.

**Resource Model:** Solo developer, high daily dedication (multiple hours, sometimes full days). No team, no external dependencies beyond third-party APIs. Quality over speed — no shortcuts, no tech debt for expediency.

### MVP Feature Set (Phase 1)

**Core User Journeys Supported:**
- J1: First Launch — Wiki Bootstrap (simplified: markdown files, manual updates from chat proposals)
- J2: Deep Research Session (full implementation)
- J3: Session Resume (user-triggered checkpointing with context health gauge)
- J4: New Venture (full implementation)

**Must-Have Capabilities:**

| Capability | Implementation Approach |
|-----------|------------------------|
| Chat UI with streaming | Full — token streaming, tool call transparency, thinking display |
| Claude Opus agent core | Full — business-planning identity, wiki-aware behavior |
| Web research (Tavily) | Full — sourced findings with citations |
| Pinecone knowledge repository | Full — projectId namespacing, intelligence storage |
| Methodology wiki | Simplified start — markdown files in project, agent proposes in chat, user applies manually. Full approval-workflow UI deferred within Phase 1 |
| Skeptic sub-agent | Full — dedicated sub-agent architecture from day one, inline display with visual differentiation |
| Steelmanning protocol | Full — evidence search for opposing view, both-sides presentation, intelligence preservation |
| Decision logging | Full — preserves findings regardless of user decision |
| Session management | Simplified start — context health gauge (progress bar in UI header, green/yellow/red), user-triggered checkpoint. Automatic stopping-point detection deferred |
| Project selection/switching | Full — projectId-based, wiki carries over, Pinecone fresh per project |

**Explicitly removed from Phase 1 scope:**
- Idea kill gate as standalone feature (adversarial challenge is pervasive, not a separate flow)

### Post-MVP Features

**Phase 2 — Plan Production (separate PRD, written after Phase 1 ships):**
- Strategic framework document production
- Marketing plan production
- Business plan production
- Financial modeling with deterministic Node API compute layer
- Wiki approval-workflow UI (if not completed in Phase 1 iteration)
- Automatic session stopping-point detection (if not completed in Phase 1 iteration)

**Phase 3 — Expansion (future, no timeline):**
- Polished output formats (PDF, PPTX, branded decks)
- Post-plan accountability layer (flagging when live decisions diverge from strategy)
- Cross-project intelligence queries (asking questions that span multiple venture corpora)
- Advanced cost analytics per project/session

### Risk Mitigation Strategy

**Technical Risks:**

| Risk | Severity | Mitigation |
|------|----------|------------|
| Agent orchestration architecture unclear | High | This is the least clear technical area. Architecture phase (Winston) must resolve coordinator vs. agent-team topology, skeptic context-sharing, and tool-call flow BEFORE development begins. This is the blocking architectural decision. |
| Skeptic sub-agent degrades to sycophancy under pressure | High | Test early during wiki bootstrap. Fallback: periodic batch-review passes (BMAD pattern) at stopping points if inline skeptic can't maintain rigor. |
| Pinecone retrieval returns stale or irrelevant context | Medium | Design explicit versioning and staleness signals in schema. Wiki should include memory-governance rules. Test retrieval quality during first research sessions. |
| Session checkpoint/resume loses significant context | Medium | Start with user-triggered saves (simpler). Context health gauge gives user control over timing. Test resume fidelity by probing agent on prior session details. |
| Integration complexity across many components | Medium | Clean separation of concerns — each component (wiki, Pinecone, skeptic, research) independently testable. Don't build everything simultaneously; layer components. |

**Market Risks:** Not applicable — personal tool, no market validation needed. Output quality validated by showing radio app plans to real investors/advisors.

**Resource Risks:** Solo developer with high tenacity. Primary risk is process dissatisfaction, not burnout. Mitigate by maintaining high code quality throughout and avoiding shortcuts that create frustrating tech debt. If any Phase 1 component proves harder than expected, the simplified-start items (wiki UI, auto-checkpointing) provide natural deferral points without blocking core value delivery.

## Functional Requirements

### Chat & Conversation

- **FR1:** User can send messages to the agent via a chat interface
- **FR2:** User can view agent responses streaming token-by-token in real time
- **FR3:** User can view the agent's thinking and reasoning process during response generation
- **FR4:** User can view tool calls the agent is making and their results as they occur
- **FR5:** User can expand and collapse agent thinking and tool call details
- **FR6:** User can view the full conversation history within a session

### Research & Evidence

- **FR7:** Agent can perform web searches to research a topic and return sourced findings
- **FR8:** Agent can collect and store evidence with original source URLs for every research finding
- **FR9:** User can view the source citation for any research finding the agent presents
- **FR10:** Agent can perform multiple sequential research queries to build depth on a topic
- **FR11:** Agent can distinguish between findings with strong evidence and findings with weak or insufficient evidence, and communicate confidence levels

### Critical Thinking & Challenge

- **FR12:** Skeptic sub-agent can independently challenge the primary agent's findings and recommendations with evidence-based pushback
- **FR13:** Skeptic sub-agent's challenges are displayed inline in the chat, visually distinct from the primary agent's responses
- **FR14:** Skeptic sub-agent can calibrate pushback intensity based on evidence strength and decision stakes
- **FR15:** Agent can enter steelmanning mode when the user disagrees — actively searching for evidence supporting the user's opposing position
- **FR16:** Agent can present both sides of a disagreement with supporting evidence and sources for each
- **FR17:** User can make a final decision after reviewing both sides of a challenged position
- **FR18:** Agent can preserve intelligence findings independently of user decisions — findings persist unchanged even when the user decides against them
- **FR19:** User can review past decisions and see what evidence existed on both sides at the time of the decision

### Knowledge Management

- **FR20:** Agent can store research findings, evidence, and decision logs in a durable knowledge repository scoped to the current project
- **FR21:** Agent can retrieve relevant prior findings from the knowledge repository when a related topic is discussed
- **FR22:** User can ask questions about previously researched topics and receive informed answers with source citations
- **FR23:** Agent can identify when retrieved context may be stale or contradictory and flag it to the user
- **FR24:** Agent can store session checkpoint data to the knowledge repository for later resume
- **FR25:** Agent can identify and surface information gaps — "this data doesn't exist" is a valid finding, not a failure

### Methodology Wiki

- **FR26:** Agent can propose new wiki articles based on research or work completed
- **FR27:** User can approve, reject, or modify agent-proposed wiki content
- **FR28:** User can direct the agent to create or modify specific wiki articles
- **FR29:** Agent can read and reference wiki articles to inform its behavior and responses
- **FR30:** Agent can suggest wiki improvements at natural stopping points based on work completed
- **FR31:** Wiki content persists across projects — available to the agent regardless of which project is active
- **FR32:** Agent can guide the user through an initial wiki bootstrapping experience on first launch

### Session Management

- **FR33:** User can view a context health gauge showing remaining context capacity with graduated indication (not binary)
- **FR34:** User can trigger a session checkpoint to save current state
- **FR35:** Agent can resume a prior session by loading checkpoint data and relevant intelligence from the knowledge repository
- **FR36:** After resume, agent can answer questions about prior session topics, key decisions, and open questions without the user re-explaining context
- **FR37:** Agent can identify and suggest natural stopping points in the current work
- **FR38:** User can view a summary of what was saved during the last checkpoint

### Project Management

- **FR39:** User can create a new project with a unique identifier
- **FR40:** User can switch between projects
- **FR41:** Each project maintains its own isolated intelligence store
- **FR42:** Agent can reference wiki-stored learnings from prior projects when working on a new project
- **FR43:** User can view approximate API cost information for the current session or project

## Non-Functional Requirements

### Integration

- **NFR1:** The application must handle Claude API errors (rate limits, timeouts, 5xx) gracefully — display a clear error message to the user and allow retry without losing the current message draft or conversation state.
- **NFR2:** The application must handle Tavily API failures without crashing the agent's response flow — if a research query fails, the agent reports the failure and continues reasoning with available information.
- **NFR3:** The application must handle Pinecone API failures (write failures, retrieval timeouts) without data loss — writes must be confirmed before the user sees "checkpoint saved," and retrieval failures must surface as explicit warnings, not silent gaps.
- **NFR4:** All third-party API keys must be stored in environment variables (`.env` file), never committed to source control or exposed in the UI.
- **NFR5:** The application must function correctly when Tavily or Pinecone are temporarily unreachable — the chat remains usable for conversation, with degraded research or memory capabilities clearly indicated.

### Data Integrity & Reliability

- **NFR6:** Intelligence data written to Pinecone must be confirmed via API response before the application reports a successful save to the user. No fire-and-forget writes for checkpoint or intelligence storage.
- **NFR7:** Wiki files must be written atomically — a crash or error mid-write must not corrupt existing wiki content.
- **NFR8:** Decision logs that preserve intelligence on both sides of a disagreement must be stored as immutable records — subsequent decisions cannot overwrite or modify the evidence captured at the time of the original decision.
- **NFR9:** Session checkpoint data must include enough context for the agent to reconstruct a useful working summary — at minimum: conversation summary, key decisions made, open questions, and a manifest of stored intelligence topics.
- **NFR10:** The Postgres database must run in a Docker container with a named volume, ensuring data persists across container restarts.

### Performance

- **NFR11:** UI interactions (sending a message, navigating between views, scrolling conversation history) must remain responsive during agent processing — no UI thread blocking while waiting for API responses.
- **NFR12:** Streaming token display must begin within 3 seconds of the user sending a message (measured to first token visible), excluding research-heavy queries where tool calls execute first.
- **NFR13:** Session resume (loading checkpoint + Pinecone retrieval + context reconstruction) should complete within 15 seconds — the user should see a loading indicator, not an unresponsive UI.
- **NFR14:** The chat UI must handle conversations of 200+ messages within a single session without significant rendering degradation (no visible lag when scrolling or new messages appear).
