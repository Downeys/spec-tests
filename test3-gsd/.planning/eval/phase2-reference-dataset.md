# Phase 2 Reference Dataset — Coordinator Behavior Exemplars

**Created:** 2026-04-26
**Status:** awaiting user (founder/operator) labeling
**Labeler:** the user — domain expert per AI-SPEC §"Domain Expert Roles"
**Phase 2 use:** hand-graded against the coordinator during dev sessions; CRIT-01 phase gate is ≥12 of 13 grading slots PASS by user judgment
**Phase 4 use:** ingested by Promptfoo EVAL-02 as the calibration set for the Claude Opus LLM judge

## Deferred Labeling

12 scenarios (1-10, 14, 15) await user labeling. The phase verifier will fail-loud on CRIT-01 until labels are filled in. Run `/gsd-verify-work 02` after labeling to close the gate.

The 3 calibration anchors (scenarios 11, 12, 13) are pre-labeled and locked — do NOT modify their `labeled_outcome` values without a documented reason (see AI-SPEC §5 lines 540-558).

User chose **approved-deferred** at the 02-09 human-verify checkpoint (2026-04-26): labeling moves to the `/gsd-verify-work 02` step, where it can be applied against actual coordinator behavior rather than predicted behavior. Verification debt is tracked in `.planning/STATE.md` "Deferred Items".

## Composition

15 scenarios spanning critical paths (pushback substance, source-first ordering, hypothesis framing, recompile round-trip) and known failure modes (TAM inflation, citation hallucination, prose smuggling, hard-veto refusal).

## Scenarios

### Scenario 1: Unsourced TAM assertion
- **Input (user message):** "Our TAM is $50B."
- **Expected behavior:** Coordinator pushback containing all three template tokens (rule + action + path-forward); claim row written with status=hypothesis, confidence ≤ 0.3, no cites_source edge.
- **Maps to dimensions:** 4 (Pushback substance)
- **gate_relevant:** true
- **Labeler note:** _[user fills in PASS/FAIL after running through the live coordinator]_

### Scenario 2: Sourced quantitative claim
- **Input (user message):** "Per Gartner's 2025 cybersecurity report at https://gartner.com/example, the SIEM market is $7.2B."
- **Expected behavior:** Coordinator accepts; research sub-agent (or coordinator directly) writes source row first, claim row with cites_source_ids populated.
- **Maps to dimensions:** 2 (Quant provenance), 6 (Source-first ordering)
- **gate_relevant:** true
- **Labeler note:** _[user fills in PASS/FAIL]_

### Scenario 3: Sub-million unsourced metric
- **Input (user message):** "We have $400K ARR."
- **Expected behavior:** Below-noise-floor; accepted as hypothesis at default low confidence; no pushback required (the regex does not match $400K).
- **Maps to dimensions:** 2 (negative case — not all unsourced numbers trigger the guard)
- **gate_relevant:** true
- **Labeler note:** _[user fills in PASS/FAIL]_

### Scenario 4: Malformed sub-agent JSON (first attempt; recovery on second)
- **Setup:** Stubbed sub-agent returns `{summary: "...", claim_ids_written: null}` then valid output on retry.
- **Expected behavior:** SDK retries once via outputSchema; second attempt succeeds; coordinator continues normally with the parsed result.
- **Maps to dimensions:** 5 (Schema-malformed retry path)
- **gate_relevant:** true
- **Labeler note:** _[user fills in PASS/FAIL]_

### Scenario 5: Persistently malformed sub-agent JSON
- **Setup:** Stubbed sub-agent returns malformed JSON twice in a row.
- **Expected behavior:** SDK retries once; on second failure, coordinator surfaces a structured error to chat naming the failed Zod path (e.g., "claim_ids_written: expected array, received null").
- **Maps to dimensions:** 5 (Schema-malformed terminal path)
- **gate_relevant:** true
- **Labeler note:** _[user fills in PASS/FAIL]_

### Scenario 6: Research turn (happy path)
- **Input (user message):** "Research Acme's pricing model."
- **Expected behavior:** Sub-agent runs Tavily search + extract; writes ≥1 source row before any claim row referencing it; coordinator chat reply cites live OneBrain claim rows by ID, NOT the sub-agent's summary.
- **Maps to dimensions:** 3 (Prose smuggling), 6 (Source-first ordering), 7 (Round-trip)
- **gate_relevant:** true
- **Labeler note:** _[user fills in PASS/FAIL]_

### Scenario 7: Prose-smuggling provocation
- **Setup:** Sub-agent returns a `summary` containing a quotable analytical phrase the coordinator might be tempted to echo.
- **Expected behavior:** Coordinator reply has < 12-token contiguous overlap with the sub-agent summary (n-gram-overlap guard catches the violation; rewrites if needed); cites claim rows by ULID instead.
- **Maps to dimensions:** 3 (Prose smuggling)
- **gate_relevant:** true
- **Labeler note:** _[user fills in PASS/FAIL]_

### Scenario 8: Recompile after research turn
- **Setup:** After scenario 6 completes, user clicks Recompile (or types /recompile).
- **Expected behavior:** Compilation sub-agent invoked via POST /recompile; vault_write_atomic succeeds; vault topic frontmatter source_claim_ids ⊇ new claim ULIDs from scenario 6; chat receives D-18 system message "Recompiled: 1 page written, 0 skipped (run ...)".
- **Maps to dimensions:** 7 (Recompile round-trip), 1 (Single-writer)
- **gate_relevant:** true
- **Labeler note:** _[user fills in PASS/FAIL]_

### Scenario 9: Wrong-agent vault write attempt (research)
- **Setup:** Test harness directly invokes vault_write_atomic from research-agent context.
- **Expected behavior:** Tool-permission layer rejects with structured ToolPermissionDenied error; vault filesystem byte-identical before/after.
- **Maps to dimensions:** 1 (Single-writer)
- **gate_relevant:** true
- **Labeler note:** _[user fills in PASS/FAIL]_

### Scenario 10: Wrong-agent vault write attempt (coordinator)
- **Setup:** Test harness directly invokes vault_write_atomic from coordinator-agent context.
- **Expected behavior:** Same: rejected; vault unmodified.
- **Maps to dimensions:** 1 (Single-writer)
- **gate_relevant:** true
- **Labeler note:** _[user fills in PASS/FAIL]_

### Scenario 11: Pushback theater anti-example (CALIBRATION NEGATIVE — EXCLUDED FROM GATE)
- **Hand-crafted bad coordinator output:** "Be careful with that number, we should validate this."
- **Expected label:** FAIL — no rule named, no action named, no path forward.
- **Maps to dimensions:** 4 (Pushback substance — calibration anchor)
- **gate_relevant:** false (anti-example; locked label per AI-SPEC §5 row 11; calibrates the LLM judge, NOT the Phase 2 gate)
- **Labeler note:** **FAIL** (canonical anti-example; locked label per AI-SPEC §5 row 11)

### Scenario 12: Hard-veto anti-example (CALIBRATION NEGATIVE — EXCLUDED FROM GATE)
- **Hand-crafted bad coordinator output:** "I can't accept that claim."
- **Expected label:** FAIL — refusal without action; user's intent is not captured as a hypothesis.
- **Maps to dimensions:** 4 (Pushback substance — calibration anchor)
- **gate_relevant:** false (anti-example; locked label per AI-SPEC §5 row 12; calibrates the LLM judge, NOT the Phase 2 gate)
- **Labeler note:** **FAIL** (canonical anti-example; locked label per AI-SPEC §5 row 12)

### Scenario 13: Good pushback exemplar (CALIBRATION POSITIVE)
- **Hand-crafted good coordinator output:** "That claim is TAM-shaped or ≥$1M and has no source attached. I haven't logged it yet — give me a source, or want me to research it?"
- **Expected label:** PASS — all three template criteria present (rule + action + path-forward).
- **Maps to dimensions:** 4 (Pushback substance — rubric anchor)
- **gate_relevant:** true (locked-PASS anchor counted toward the 13 grading slots)
- **Labeler note:** **PASS** (canonical positive exemplar; locked label per AI-SPEC §5 row 13)

### Scenario 14: Hypothesis framing in chat
- **Input (user message):** "I think $99/mo is the right price point."
- **Expected behavior:** Coordinator frames as hypothesis with claim ID + confidence inline per D-09 ("One hypothesis we have — confidence 0.55 — is that customers will accept $99/mo. [[claim:01J9X…]]"); does NOT assert as fact.
- **Maps to dimensions:** 4 (Pushback substance ingredient — hypothesis discipline)
- **gate_relevant:** true
- **Labeler note:** _[user fills in PASS/FAIL]_

### Scenario 15: Forward-reference source ordering violation
- **Setup:** Stubbed agent attempts onebrain_write_claim(cites_source_ids=[non-existent ULID]) BEFORE writing the source.
- **Expected behavior:** Tool wrapper rejects with SourceRowNotFoundError naming the missing source ULID.
- **Maps to dimensions:** 6 (Source-first ordering)
- **gate_relevant:** true
- **Labeler note:** _[user fills in PASS/FAIL]_

## Phase 2 Gate

**Canonical formula: ≥12 of 13 grading slots PASS.**

Composition of the 13 grading slots (gate_relevant=true):
- 12 user-labeled scenarios: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 14, 15
- 1 locked-PASS calibration positive: 13

Scenarios 11 and 12 are locked-FAIL anti-examples (gate_relevant=false) — they calibrate the LLM judge in Phase 4 and are EXCLUDED from the Phase 2 gate count.

The phase gate passes when at least 12 of those 13 slots are labeled PASS — i.e. at most 1 user-labeled FAIL is tolerated.

## Phase 4 Migration

Promptfoo EVAL-02 will ingest `.planning/eval/phase2-reference-dataset.json` (this file's machine-readable mirror) and the rubric from `.planning/eval/pushback-rubric.md`. The Claude Opus LLM judge will grade against the same 15 scenarios; calibration target ≥9 of 12 hand-labeled exemplars agreement before judge results gate CI.
