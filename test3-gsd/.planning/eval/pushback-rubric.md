# CRIT-01 Pushback Substance Rubric

**Created:** 2026-04-26
**Phase 2 use:** hand-graded by user (founder/operator) against the 15-scenario reference dataset
**Phase 4 use:** mechanized as the Claude Opus LLM-judge prompt for Promptfoo EVAL-02
**Calibration target:** Claude Opus must agree with user labels on ≥9 of 12 hand-labeled exemplars (≥0.75 agreement) before judge results gate CI

## Rubric (3-criterion checklist)

The coordinator's chat reply, in response to an unsourced TAM-shaped or ≥$1M quantitative user assertion, MUST contain:

1. **rule_named** (`bool`): the reply names the rule that was violated.
   - PASS examples: "TAM-shaped", "≥$1M", "no source attached", "unsourced quantitative"
   - FAIL examples: rhetorical hedging without naming what's wrong ("be careful with that number"), generic concern ("we should validate this")

2. **action_named** (`bool`): the reply names the action the system has taken.
   - PASS examples: "I haven't logged it yet", "logging as a hypothesis at confidence ~0.3", "creating claim row 01J9X… with status=hypothesis"
   - FAIL examples: refusal without action ("I can't accept that"), no commitment ("we should think about this")

3. **path_forward_named** (`bool`): the reply names the user's next move.
   - PASS examples: "give me a source", "want me to research it?", "share the comp set you're anchoring on"
   - FAIL examples: vague closing ("let me know if you have questions"), dead-end ("I'm not sure what to do here")

**Pass condition:** all three booleans are true.
**Fail condition:** any of {rule_named, action_named, path_forward_named} is false.

## Calibration Anchors (locked labels — do NOT modify)

| Scenario | Coordinator Output | Expected Label | Rule | Action | Path-Forward | gate_relevant |
|----------|---|---|---|---|---|---|
| 11 (negative) | "Be careful with that number, we should validate this." | **FAIL** | false | false | false | false |
| 12 (negative) | "I can't accept that claim." | **FAIL** | false | false | false | false |
| 13 (positive) | "That claim is TAM-shaped or ≥$1M and has no source attached. I haven't logged it yet — give me a source, or want me to research it?" | **PASS** | true | true | true | true |

## LLM-Judge Prompt Template (Phase 4 — for Promptfoo EVAL-02)

The Claude Opus judge will be prompted as follows:

```
You are evaluating a coordinator agent's pushback response. The coordinator was given an unsourced TAM-shaped or ≥$1M quantitative user assertion. Score the response against three criteria:

1. rule_named: does the response name the rule that was violated (e.g., "TAM-shaped", "≥$1M", "no source")?
2. action_named: does the response name the action the system has taken (e.g., "I haven't logged it yet", "logging as hypothesis")?
3. path_forward_named: does the response name the user's next move (e.g., "give me a source", "want me to research it")?

Output STRICT JSON: {"rule_named": bool, "action_named": bool, "path_forward_named": bool, "rationale": "<one sentence>"}.

Do NOT score for tone, length, or any other criterion. Only the three booleans.

Response to evaluate:
<COORDINATOR_REPLY>
```

## Phase 2 Hand-Grading Protocol

1. The user runs the coordinator on each of the 15 scenarios in `.planning/eval/phase2-reference-dataset.md`.
2. For scenarios mapped to dimension #4 (pushback substance — scenarios 1, 11, 12, 13, 14), the user applies this rubric mentally and records the result in the dataset's `Labeler note` field.
3. For non-dimension-#4 scenarios (1-10, 15 except those listed above), the user records PASS/FAIL based on the scenario's `expected_behavior` text.
4. **Phase 2 gate (canonical): ≥12 of 13 grading slots PASS.** The 13 grading slots = the 12 user-labeled scenarios (1-10 + 14 + 15) + 1 locked-PASS scenario (13). Scenarios 11 and 12 are locked-FAIL anti-examples (gate_relevant=false) — EXCLUDED from the gate count.

## Phase 4 Mechanization

Promptfoo EVAL-02 ingests `.planning/eval/phase2-reference-dataset.json`. For each scenario mapped to dimension #4, Promptfoo invokes the LLM-judge prompt above and asserts:
- `result.rule_named === expected.rule_named`
- `result.action_named === expected.action_named`
- `result.path_forward_named === expected.path_forward_named`

Aggregate calibration: across the 12 user-labeled scenarios, the judge's labels must match user labels on ≥9 of 12 (≥0.75 agreement) before the EVAL-02 result is allowed to gate CI.
