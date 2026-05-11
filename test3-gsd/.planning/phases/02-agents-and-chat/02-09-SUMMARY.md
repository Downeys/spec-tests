---
phase: 02-agents-and-chat
plan: 09
subsystem: testing
tags: [eval, reference-dataset, llm-judge, promptfoo, calibration, crit-01, pushback-rubric]

# Dependency graph
requires:
  - phase: 02-agents-and-chat
    provides: AI-SPEC §5 "Reference Dataset" + dimensions table; UI-SPEC Copywriting Contract D-07 verbatim
provides:
  - 15-scenario reference dataset (.md + .json) with 13 grading slots and 2 calibration anti-examples
  - 3-criterion pushback rubric (rule_named + action_named + path_forward_named) for CRIT-01 dimension #4
  - LLM-judge prompt template for Phase 4 Promptfoo EVAL-02 mechanization
  - Canonical Phase 2 gate formula (≥12 of 13 grading slots PASS) stated in dataset .md, rubric .md, and JSON
affects: [02-05-coordinator, 02-verify-work, phase-04-eval-suite]

# Tech tracking
tech-stack:
  added: []  # Pure authoring plan — no code, no new deps
  patterns:
    - "Reference dataset duality (.md human-readable + .json machine-readable mirror) for hand-graded → mechanized eval migration"
    - "Calibration-anchor locking: 3 hand-labeled scenarios with `gate_relevant` flag mechanically separating gating slots from anti-examples"
    - "Verification-debt deferral: human-verify checkpoint resolved as 'approved-deferred' produces a tracked debt entry, not a silent skip"

key-files:
  created:
    - .planning/eval/phase2-reference-dataset.md
    - .planning/eval/phase2-reference-dataset.json
    - .planning/eval/pushback-rubric.md
  modified:
    - .planning/STATE.md (Deferred Items + Session Continuity)
    - .planning/ROADMAP.md (02-09 progress)

key-decisions:
  - "User chose 'approved-deferred' at the 02-09 human-verify checkpoint — labeling moves to /gsd-verify-work 02 where it can be applied against actual coordinator behavior"
  - "Phase 2 gate cannot close until the 12 deferred labels are filled; the verifier MUST fail-loud on any `labeled_outcome: null` for `gate_relevant: true` scenarios"
  - "Calibration anchors (scenarios 11, 12, 13) are immutable from this point forward — any modification requires a documented reason per AI-SPEC §5"

patterns-established:
  - "Eval artifact pair (.md + .json): the .md is the human grading surface; the .json is the Phase-4 Promptfoo ingestion source. Both must stay in sync."
  - "Verification debt: 'approved-deferred' at a human-verify checkpoint is bounded by a fail-loud verifier hook recorded in 02-VALIDATION.md — turns deferral into a tracked obligation rather than a silent skip"

requirements-completed: [CRIT-01]  # Artifact deliverables shipped; user-labeling debt to verify-work step

# Metrics
duration: ~8min (Tasks 1-3) + continuation closeout
completed: 2026-04-26
---

# Phase 02 Plan 09: Reference Dataset + Pushback Rubric Summary

**15-scenario reference dataset (.md + .json) and 3-criterion CRIT-01 pushback rubric shipped; 3 calibration anchors locked; 12 user-labeling slots deferred to /gsd-verify-work 02 with a tracked fail-loud verifier hook.**

## Performance

- **Duration:** ~8 min for the 3 authoring tasks (Tasks 1-3 by the previous executor); plus continuation closeout for the deferral note + SUMMARY + STATE/ROADMAP updates
- **Completed:** 2026-04-26
- **Tasks:** 3 of 4 fully executed; Task 4 (human-verify checkpoint) resolved as "approved-deferred" by user
- **Status:** **partial** — 12 labels deferred; all 3 artifacts shipped
- **Files created:** 3 (under .planning/eval/)
- **Files modified:** 2 (STATE.md, ROADMAP.md)

## Accomplishments

- **15-scenario reference dataset** (`phase2-reference-dataset.md` + `.json`) per AI-SPEC §5 lines 540-558, mirroring the spec's verbatim composition and adding the `gate_relevant` flag for mechanical 13-vs-2 separation.
- **3 calibration anchors locked** — scenario 11 (pushback theater) FAIL, scenario 12 (hard-veto) FAIL, scenario 13 (D-07 verbatim) PASS — pre-labeled and immutable.
- **CRIT-01 pushback rubric** (`pushback-rubric.md`) — three-criterion checklist (`rule_named`, `action_named`, `path_forward_named`) with PASS/FAIL examples, locked-anchor table, and the verbatim LLM-judge prompt template for Phase 4 Promptfoo EVAL-02 mechanization.
- **Canonical Phase 2 gate formula stated everywhere** — "≥12 of 13 grading slots PASS" appears in dataset .md, rubric .md, and JSON metadata. No ambiguity at verify-time.
- **Deferred-labeling debt tracked** with explicit user choice ("approved-deferred"), pointed at `/gsd-verify-work 02` as the resolution point, with a fail-loud verifier hook documented in 02-VALIDATION.md.

## Task Commits

1. **Task 1: phase2-reference-dataset.md (15 scenarios)** — `3e23f0b` (docs)
2. **Task 2: phase2-reference-dataset.json (machine-readable mirror)** — `ce872e1` (docs)
3. **Task 3: pushback-rubric.md (CRIT-01 LLM-judge rubric)** — `75bb0d7` (docs)
4. **Task 4 [checkpoint:human-verify]:** resolved as "approved-deferred" by user; no code commit. Closeout commit:
   - **Deferred-labeling note** — `cd56b4c` (docs: mark 12 user-labeling scenarios deferred — anchors locked)

**Plan metadata commit:** appended after STATE/ROADMAP updates (this SUMMARY).

## Files Created/Modified

- `.planning/eval/phase2-reference-dataset.md` — 142 lines; 15 scenario blocks + Composition + Deferred Labeling + Phase 2 Gate + Phase 4 Migration sections
- `.planning/eval/phase2-reference-dataset.json` — 148 lines; 15 scenarios with `id`, `name`, `input`, `expected_behavior`, `maps_to_dimensions[]`, `labeled_outcome`, `gate_relevant`; 3 anchors include `calibration_role`
- `.planning/eval/pushback-rubric.md` — 68 lines; 3-criterion rubric + locked anchor table + LLM-judge prompt template + Phase 2/4 protocols
- `.planning/STATE.md` — Deferred Items entry for 02-09 verification debt; Session Continuity advanced
- `.planning/ROADMAP.md` — 02-09 marked complete-with-deferral; Phase 2 plan-progress count updated

### Artifact Counts (machine-verified)

| Artifact | Count | Notes |
|----------|-------|-------|
| `.md` line count | 142 | exceeds plan minimum of 80 |
| `.json` scenario count | 15 | all required entries present |
| `gate_relevant: true` scenarios | 13 | scenarios 1-10 + 13 + 14 + 15 |
| `gate_relevant: false` scenarios | 2 | scenarios 11 + 12 (anti-examples) |
| `labeled_outcome: null` slots | 12 | scenarios 1-10 + 14 + 15 (deferred to verify-work) |
| `labeled_outcome` non-null | 3 | scenario 11=FAIL, scenario 12=FAIL, scenario 13=PASS (locked) |
| `pushback-rubric.md` line count | 68 | exceeds plan minimum of 40 |

## Decisions Made

- **User chose "approved-deferred" at the 02-09 human-verify checkpoint.** The 12 open scenarios will be labeled at `/gsd-verify-work 02` time against actual coordinator behavior, not predicted behavior. This is the practical path for a single-user dev tool per the plan's `<how-to-verify>` Option (b).
- **Anchors locked from this point forward.** Scenarios 11, 12, 13 carry locked PASS/FAIL labels matching AI-SPEC §5 lines 540-558. Any future modification requires a documented reason per the threat model entry T-02-EVAL-01 (Tampering — accept disposition; git-diff visibility is the audit trail).
- **`gate_relevant` flag is mechanical, not advisory.** Phase 4 Promptfoo EVAL-02 ingestion uses it to split the 13 grading slots from the 2 anti-examples without re-reading the .md prose. The canonical ≥12 of 13 formula references this exact split.

## Deviations from Plan

None — plan executed exactly as written. The 3 authoring tasks shipped on first attempt; Task 4 was a checkpoint that cleanly resolved on the user's choice between Option (a) "label now" and Option (b) "defer to verify-work". User picked (b).

## Issues Encountered

None during execution. The continuation context handed off cleanly: previous executor's commits (`3e23f0b`, `ce872e1`, `75bb0d7`) all verified present; JSON anchors already correctly set; .md placeholders already in place. The continuation work was authoring the deferred-labeling note + closeout artifacts only.

## User Setup Required

None — pure documentation deliverables. No external services, no env vars, no credentials.

## Reference (per plan output spec)

- **AI-SPEC §"Domain Expert Roles":** the user (founder/operator) is the labeler. Cannot be delegated to Claude.
- **02-VALIDATION.md "Manual-Only Verifications" CRIT-01 row:** the fail-loud verifier hook that turns "approved-deferred" into "labeling debt with a name on it".
- **Phase 4 EVAL-02 ingestion path:** `.planning/eval/phase2-reference-dataset.json` is consumed directly by Promptfoo; the LLM-judge prompt template is verbatim in `.planning/eval/pushback-rubric.md` under "LLM-Judge Prompt Template (Phase 4 — for Promptfoo EVAL-02)".
- **Calibration target:** Claude Opus must agree with user labels on ≥9 of 12 hand-labeled exemplars (≥0.75 agreement, exceeding the 0.7 floor in ai-evals.md) before judge results gate any future CI step.

## Verification Debt (carried into Phase 2 verify-work)

| Item | Status | Resolution Point |
|------|--------|------------------|
| 12 user-labeling slots in `phase2-reference-dataset.json` are `null` | OPEN — by user choice | `/gsd-verify-work 02` MUST fail-loud on CRIT-01 until all 12 are labeled with PASS or FAIL |
| Phase 2 gate (≥12 of 13 PASS) cannot close | OPEN | After labeling, recompute gate count; if ≥12 PASS, gate closes |

## Next Phase Readiness

- **For Phase 2 in-progress execution:** plan 02-05 (coordinator + Layer 1 quant-guard) can land code that emits responses against scenarios 1, 11, 12, 13, 14 — the rubric is ready.
- **For `/gsd-verify-work 02`:** the verifier MUST scan `phase2-reference-dataset.json` and fail-loud on any `labeled_outcome: null` where `gate_relevant: true`. This is the gating mechanism that closes the labeling debt.
- **For Phase 4 EVAL-02:** zero ambiguity. JSON schema is explicit; LLM-judge prompt is verbatim. Ingest, score, calibrate, mechanize.

## Self-Check: PASSED

- File `.planning/eval/phase2-reference-dataset.md` — FOUND (142 lines)
- File `.planning/eval/phase2-reference-dataset.json` — FOUND (148 lines, valid JSON, 15 scenarios, 13 gate_relevant true, 2 gate_relevant false, 3 anchors labeled, 12 nulls)
- File `.planning/eval/pushback-rubric.md` — FOUND (68 lines)
- Commit `3e23f0b` — FOUND (Task 1)
- Commit `ce872e1` — FOUND (Task 2)
- Commit `75bb0d7` — FOUND (Task 3)
- Commit `cd56b4c` — FOUND (deferred-labeling note)

---
*Phase: 02-agents-and-chat*
*Plan: 09*
*Completed: 2026-04-26 (status: partial — 12 labels deferred to /gsd-verify-work 02)*
