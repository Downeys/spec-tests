# Working on issue #{{ISSUE_NUMBER}}

You are working on GitHub issue **#{{ISSUE_NUMBER}} — {{ISSUE_TITLE}}** in this repository. Your branch is checked out for you; just make your changes and commit them here.

{{SIBLING_CONTEXT}}

## Principles you must follow

Before starting work, read [docs/principles/README.md](../docs/principles/README.md) and the principle files relevant to the change. Two are mandatory in autonomous Sandcastle runs regardless of topic:

- [docs/principles/claude-code-modes.md](../docs/principles/claude-code-modes.md) — universal rules + the autonomous-only deltas (token budget, summarize-don't-paste, no-push, no clarification questions, etc.)
- [docs/principles/context-budget.md](../docs/principles/context-budget.md) — 100k target / 150k ceiling, summarize-don't-paste detail

If your work touches a layer or topic the issue doesn't make obvious, also read the relevant principle file (e.g. domain code → [domain-modeling.md](../docs/principles/domain-modeling.md), tests → [testing.md](../docs/principles/testing.md)).

If the issue asks for something the principles forbid (e.g. ingesting research into OpenBrain, pushing the branch, opening a PR), do whatever code work is _not_ forbidden, then emit `<promise>COMPLETE</promise>` with a paragraph explaining what was completed and what needs to be split out for the runtime / human.

## The issue

The full body and every comment, including any reviewer feedback from a prior attempt:

!`gh issue view {{ISSUE_NUMBER}} --json title,body,labels,comments`

## How to decide what to do

Read the issue carefully and decide what kind of work it requires:

- A code change with behavior the user can observe → use the `tdd` skill (red → green → refactor; commit after each green).
- An open-ended bug or performance regression → use the `diagnose` skill.
- Documentation, configuration, or trivial fixes (one-line, type-only, formatting) → just make the change and commit. Don't invent tests for work that doesn't have testable behavior.
- Anything ambiguous: emit `<promise>COMPLETE</promise>` with a brief explanation of what you'd want clarified, and stop.

If the issue is genuinely too big for a single run, the right move is the same — emit `<promise>COMPLETE</promise>` with what would need to change in the issue (e.g. "split into A and B"). Don't half-solve it.

## Commit messages

Use a Conventional Commits prefix that fits the work — `feat:`, `fix:`, `chore:`, `docs:`, `refactor:` — and put `Closes #{{ISSUE_NUMBER}}` in the message body so the merge auto-closes the issue:

```
<prefix>: <short description>

Closes #{{ISSUE_NUMBER}}
```

If you make multiple commits, only the last one needs the `Closes #...` line. Don't always use `feat:` — pick the prefix that matches the actual change.

## Do not push or open PRs

Do not run `git push`, `gh pr create`, or any command that publishes work outside this worktree. Your branch stays local — the human will review and push it after the run. (`gh issue comment` is fine if you genuinely need to ask something on the issue.)

## When you are done

Emit `<promise>COMPLETE</promise>` once, on its own line, after your final commit. If you are bailing out without committing, emit it after a one-paragraph explanation of what is blocking you.
