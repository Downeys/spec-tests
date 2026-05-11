# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker, plus the workflow labels the Sandcastle wrapper auto-manages.

## Triage state labels

Used by the `triage` skill's state machine.

| Label in mattpocock/skills | Label in our tracker | Meaning                                 |
| -------------------------- | -------------------- | --------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue |
| `needs-info`               | `needs-info`         | Waiting for more information (see note) |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation           |
| `wontfix`                  | `wontfix`            | Will not be actioned                    |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

> **Note on `needs-info`:** the Sandcastle wrapper at `.sandcastle/main.ts` also writes this label automatically whenever a run produces 0 commits — bail-out, timeout, or hard error. See the workflow section below. Same label, two writers (you, manually, and the wrapper).

## Sandcastle workflow labels

Five labels that exist only for the Sandcastle wrapper at `.sandcastle/main.ts`. `sandcastle`, `blocked`, and `retry` are user-applied; `in-progress` and `needs-review` are wrapper-managed — don't touch them by hand unless you're recovering from a crashed run.

| Label          | Applied when                                                                                              | Removed when                                                        |
| -------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `sandcastle`   | Issue is queued for the agent. Apply manually.                                                            | Wrapper transitions the issue to `needs-review` or `needs-info`.    |
| `in-progress`  | Wrapper picks up the issue at the start of a run.                                                         | Wrapper finishes the run (any outcome).                             |
| `needs-review` | Wrapper finishes a run that produced commits — success OR partial work after timeout/abort, both go here. | Manually, after review.                                             |
| `blocked`      | Skip this issue. Apply manually when blocked.                                                             | Manually, once unblocked.                                           |
| `retry`        | You apply alongside `sandcastle` to discard a prior agent attempt and re-run.                             | Wrapper removes it as part of the retry handling on the next drain. |

The wrapper also writes the triage-state `needs-info` label as one of the run outcomes — see the state machine below.

The wrapper picks the oldest open issue with the `sandcastle` label that does NOT also have `in-progress` or `blocked`.

## Outcome state machine

After every `sandcastle.run()`, the wrapper:

1. Posts a status comment on the issue containing the run's status string, branch name, commit count + SHAs, last ~50 lines of agent stdout in a `<details>` block, and the host-side log file path. This is best-effort; if `gh` fails, the run still proceeds.
2. Applies labels:

   | Run outcome                                                       | Label change                                            |
   | ----------------------------------------------------------------- | ------------------------------------------------------- |
   | `result.commits.length > 0`                                       | remove `in-progress` + `sandcastle`, add `needs-review` |
   | No commits (bail-out, timeout, hard error — any 0-commit outcome) | remove `in-progress` + `sandcastle`, add `needs-info`   |

   The wrapper never leaves `sandcastle` on the issue after a run — silent re-queue is a footgun. To re-run, you re-apply `sandcastle` (with `retry` to discard the prior branch) explicitly.

3. Defensive check: verifies the agent didn't push the branch (`git rev-parse --verify origin/agent/issue-<N>` should fail). If it succeeded, flags a warning in the status comment but doesn't fail the run.

## The `retry` flow

When the agent's branch is wrong-headed and you want a fresh attempt:

1. Comment on the issue explaining what was wrong (this comment becomes input to the next agent run, since the prompt pulls all comments).
2. Swap `needs-review` for `sandcastle` AND add `retry`.
3. Next drain: the wrapper sees `sandcastle` + `retry`, runs `git branch -D agent/issue-<N>`, removes `retry`, and processes the issue normally.

The wrapper only honors `retry` alongside `sandcastle`, never on `needs-review`. Adding `retry` to a `needs-review` issue does nothing destructive.

If the branch is mostly right but needs only minor tweaks, **don't use `retry`** — just `git checkout agent/issue-<N>`, edit, commit, push, and open a PR yourself. No agent involvement, no label changes needed. The agent has no memory between runs anyway, so a retry starts fresh from `main` with only the issue body and comments as feedback — re-running for small tweaks is much more expensive than fixing them by hand.

Edit any of these tables to match whatever vocabulary you actually use. If you change a label string, also update the wrapper at [`.sandcastle/main.ts`](../../.sandcastle/main.ts) and any references in [`README.md`](../../README.md).
