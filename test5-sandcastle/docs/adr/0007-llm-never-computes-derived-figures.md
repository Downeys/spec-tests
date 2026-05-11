# LLM never performs arithmetic on persisted values

The runtime business-planning agent's LLM calls may **extract** numeric values from cited source content into **Quantitative Hypotheses**, but **never** perform arithmetic between values. Derived figures (ROI, NPV, runway, break-even, growth rates derived from two data points, sensitivity bands) run in deterministic formula code under `packages/domain/projections/financial/`, exposed through Application-layer use-cases. The **Renderer** sub-agent's structured-base path (per [ADR-0003](0003-agent-topology.md)) is exactly this. Vocabulary in [CONTEXT.md](../../CONTEXT.md); principle in [memory-architecture.md](../principles/memory-architecture.md).

## Considered Options

- **A — LLM does arithmetic.** Researcher (or a dedicated FinancialAnalyst sub-agent) runs the math: take Hypothesis values, compute ROI/NPV/runway, return a number. Simple, flexible, fast to build.
- **B — LLM extracts, code computes (chosen).** LLM extracts numeric values from cited source text into **Quantitative Hypotheses**; pure formula functions in `packages/domain` consume those values to produce derived figures. Application-layer use-cases ("endpoints") load the Hypotheses and invoke the formulas.
- **C — User does the math.** LLM neither extracts nor computes. User transcribes every number into a manual modelling form. Maximum trustworthiness; user does all the work.

## Why B over A

- **Hallucinated arithmetic is silent.** A wrong qualitative claim is usually catchable on read-back — phrasing is off, the user notices. A wrong NPV is just a number; it looks identical to a correct one and propagates into the **Business Plan**'s financial section without flagging itself.
- **Auditability composes.** The **Citation** carries the verbatim quote; the **Claim** carries the user/Critic-classified extracted value; the formula function is unit-testable and `fast-check`-tested. Every derived figure traces deterministically to its driver Hypotheses, which trace to Citations, which trace to Sources. LLM arithmetic breaks this chain — the derived figure has no source.
- **Same posture as agent-never-invents.** [memory-architecture.md](../principles/memory-architecture.md) already forbids the LLM from being the truth-bearer for persisted facts. Letting it compute derived figures readmits exactly that role through a different door.
- **Matches the existing Renderer pattern.** [ADR-0003](0003-agent-topology.md) already specifies *"Pure projection — no LLM for the structured base"* for the Renderer. The financial path is one concrete instance of that pattern.
- **No "just ask Claude to double-check" guarantee.** That's a vibe, not structural. Same reason [ADR-0003](0003-agent-topology.md) picked Coordinator+Critic over a single agent prompted to self-critique.

## Why not C

- Discards the LLM's actual leverage. Extracting `$250B` from a Gartner quote into a typed Hypothesis value is high-value NLP work. Making the user transcribe every number is friction with no audit benefit (the verbatim quote is in OpenBrain either way).

## Where the line is

**Allowed inside an LLM call:**
- Parsing a single numeric value out of one cited quote (`"approximately $250B"` → `250 USD_B`).
- Proposing a **Quantitative Hypothesis** with that extracted value.
- Qualitative judgment about whether a cited number supports or refutes a Hypothesis (this drives the user/Critic classification of supporting vs refuting Claims; no math).

**Forbidden inside an LLM call:**
- Computing one numeric value from two or more (ROI, NPV, runway, break-even, sensitivity).
- Aggregating multiple Claims' numeric values into a "consensus" or "average" figure.
- Deriving growth rates from two data points across time.
- Producing the Conservative/Expected/Optimistic bands of a **Financial Projection**.

The line is **arithmetic between values**, not the presence of numbers in LLM output. Quoting a source's number back in chat is fine; combining two source numbers into a third is not.

## Consequences

- **`packages/domain/projections/financial/`** holds the formula functions as pure TypeScript. Each has property-based tests via `fast-check` covering edge cases (zero divisor, negative growth, range outputs when supporting Claims disagree).
- **Application-layer use-cases** are the "endpoints" that load Quantitative Hypotheses via repository ports and invoke the formulas. The Renderer sub-agent invokes these use-cases when building the structured base of a Business Plan.
- **The optional narrative-pass LLM call** (per [ADR-0003](0003-agent-topology.md)) wraps the structured result in prose. It does not produce the numbers. The user must be able to read the structured base on its own and have all the math, with the prose being decoration.
- **No FinancialAnalyst sub-agent is added.** Researcher extracts, Critic critiques, Cartographer slots, Renderer projects. The math is code, not a fifth role.
- **Soft prompt guard.** Researcher and Critic system prompts include explicit "do not compute" wording (forbidding "calculate", "compute X from Y", "derive the rate"). This is belt-and-suspenders — the hard guarantee is that any persisted Quantitative Hypothesis value comes from a single Claim's extraction (enforced at the OpenBrain write boundary), so even if a Researcher tried to write a computed value, it could not be traced to a single source quote and the schema would reject it.
- **Hard reverse cost.** Once downstream code, UI, and the user's working memory trust LLM-computed financials, untangling that trust is expensive. Pinning the constraint now is cheaper than relaxing it later if needed.
