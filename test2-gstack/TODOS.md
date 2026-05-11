# TODOs

Captured during /plan-eng-review on 2026-04-24 against the oneBrain Composer v1 design doc.
Items here are deferred from v1 by deliberate decision — review and pull forward as conditions change.

## Captured

### 1. Self-contradiction second-pass mechanism

**What:** Periodic background pass where a different model (or fresh session) re-reads accumulated findings and surfaces contradictions the primary writer missed.

**Why:** Premise 7 of the design says "confirmation bias is the biggest risk." `flag_contradiction` is the only mitigation, but the agent that wrote both findings is the worst possible judge.

**Context:** Outside voice flagged self-detection by primary writer as the weakest possible check. v1 ships with in-conversation flagging only; v2 adds independent review pass via fresh session or cheaper model (Sonnet) on a weekly cron.

**Depends on:** Phase 2+ corpus existing. Open Question 1 (Sonnet vs Opus for compiler) may inform model choice here too.

---

### 2. `user_observation` can be contradicted by sources

**What:** Currently `flag_contradiction` only handles finding-vs-finding. Add support for finding-vs-`user_observation` so the agent can surface when a stored source disagrees with something the user wrote.

**Why:** Confirmation bias re-enters through the user. Today the design treats `user_observation` as immune to challenge.

**Context:** UX of "agent challenges user" deserves real thought before code — phrasing, capture of `user_response` on either side, preserving both views without overwriting. Outside voice flagged the asymmetry.

**Depends on:** Phase 2 (`flag_contradiction` exists).

---

### 3. Competitor teardown workflow

**What:** A `competitor` entry type (or tagging convention on `user_observation`) for capturing per-competitor features, pricing, UX, strategic differentiator vs your venture.

**Why:** "Spotify for music for local businesses" already has incumbents — Soundtrack Your Brand, Cloud Cover, Rockbot, Mood Media. Outside voice flagged that the licensing-only focus misses competitive displacement risk.

**Context:** Strongly suggest running /plan-ceo-review on the venture's strategic positioning before Phase 4 — licensing is one risk vector, displacement is another. This TODO is the implementation footprint; the strategic question is upstream.

**Depends on:** Probably runs before Phase 4 if a CEO review surfaces competitor analysis as in-scope for the brief.

---

### 4. Template-sync mechanism for clone-per-venture

**What:** A way to push tooling improvements from the template repo to each cloned venture without losing the venture's data.

**Why:** Clone-per-venture means immediate divergence. Without sync, every fix has to be applied N times by hand.

**Context:** Options to evaluate: git subtree split for /src + /bin, scripted rebase pulling tooling changes, or document-and-accept divergence with an explicit policy.

**Depends on:** Triggered when ventures ≥ 2 AND a real tooling fix exists. Not before then.

---

### 5. `verify_critical_posture` session-boundary robustness

**What:** Strengthen the A5 self-check mechanism against Claude Desktop's fuzzy session boundaries (restarts, tab switches, context overflows).

**Why:** A5 assumes the agent calls `verify_critical_posture` "on first turn." Claude Desktop doesn't expose a clean session-start event, so the self-check may fire irregularly.

**Context:** Options to evaluate: (a) every tool implicitly verifies (cheap call, slight overhead), (b) timestamp-gap heuristic (fragile), (c) wait for Claude Desktop MCP session-event API. Trigger: first observed posture-drift incident in v1.

**Depends on:** v1 ship + observed incident, OR Claude Desktop releasing better session events.

---

### 6. MCP SDK version pin + automated update check

**What:** Pin `@modelcontextprotocol/sdk` to a specific minor version (`^x.y.z`) in package.json, and add a quarterly check for v2 / breaking changes.

**Why:** Stable v2 anticipated Q1 2026 (search check during review). An unpinned dep update could break the stdio contract.

**Context:** One-line `package.json` discipline + a calendar reminder to revisit.

**Depends on:** Phase 1 (package.json exists).

---

### 7. `pg_dump` cadence automation

**What:** After the manual `bin/backup-db` script lands (per CMT4), automate it via cron / Task Scheduler so backups happen even when you forget.

**Why:** Manual backups before each session are easy to skip. The DB is the source of truth — losing it loses everything.

**Context:** v1 lands the manual script. v2 lands a Windows Task Scheduler entry (or cron on macOS) that runs the script daily.

**Depends on:** v1 ship.

---

### 8. Cost-cap dashboard / visibility

**What:** A simple read-only view (an MCP tool `get_usage_stats` or a CLI script) that shows daily/weekly Tavily-call count + Anthropic-token spend rolled up from the JSONB metadata of recent entries.

**Why:** v1 has a cost cap (CMT4) that fails-closed when exceeded. Visibility BEFORE hitting the cap is also valuable — "how much have I spent today?" is a frequent question.

**Context:** The factory from CQ1 already records token/call counts in entry metadata. This is just a query+display.

**Depends on:** CQ1 factory shipped + v1 cost-cap shipped.
