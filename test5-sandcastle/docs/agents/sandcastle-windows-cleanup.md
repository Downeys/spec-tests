# Sandcastle on Windows: worktree cleanup failures

## Symptom

`sandcastle.run()` throws `error: failed to delete '.sandcastle/worktrees/agent-issue-N': Function not implemented` after the agent has committed. The wrapper's catch block records `runError`, `result` is undefined, and historically this got mislabeled as `failed (unknown)` — even though the work is on the branch.

Cause: pnpm's `node_modules/.pnpm/` symlink farm defeats Windows recursive deletion (Node's `fs.rm`, `Remove-Item`, `rmdir /s`, and git's own worktree teardown — git surfaces `Function not implemented` from the kernel). Sandcastle's internal `WorktreeManager.remove` runs in the success path and trips this.

This is the same root cause as our wrapper's `removeWorktreeDir` (`robocopy /MIR`) mitigation in [`.sandcastle/worktree-cleanup.ts`](../../.sandcastle/worktree-cleanup.ts), but in a code path our mitigation does not run — sandcastle owns its own worktree teardown.

## What we tried

Probed sandcastle 0.5.7's public API for a way to disable internal worktree cleanup so the wrapper could own it:

- `RunOptions` in `node_modules/@ai-hero/sandcastle/dist/run.d.ts` — no `cleanupWorktree`, `keepWorktree`, or equivalent flag.
- `SandboxHooks` in `dist/SandboxLifecycle.d.ts` — only `onWorktreeReady` / `onSandboxReady` setup hooks; no teardown hook.
- `WorktreeManager.remove` exists in `dist/WorktreeManager.d.ts` but is internal — not callable from the wrapper without forking.
- One escape hatch: `RunOptions.signal` docs say "The worktree is preserved on disk after abort (error-path behavior)." Aborting works, but defeats the purpose — we want a normal completion that doesn't tear down.

## Decision

We accept post-hoc recovery as the durable fix until sandcastle exposes a cleanup-ownership hook.

The wrapper's `recoverCommitsFromBranch` reads `git log main..agent/issue-N` after `sandcastle.run()` throws and synthesizes the commits list so labeling routes to `needs-review`. The status variant `recovered (cleanup error)` (in [`.sandcastle/status.ts`](../../.sandcastle/status.ts)) makes the situation visible in the per-run GitHub comment so reviewers know the agent finished cleanly even though the wrapper had to recover.

The pre-run cleanup at `processIssue` step (b.5) calls `removeWorktreeDir` against any orphaned dir from a prior failed run, so the symlink farm doesn't accumulate across drains.

## When to revisit

When sandcastle ships a release that:

- Adds a `cleanupWorktree: false` (or similarly-named) option to `RunOptions`, **or**
- Adds a `beforeWorktreeRemove` / `onTeardown` hook to `SandboxHooks`, **or**
- Switches its own teardown to use long-path-aware Win32 APIs (e.g. invokes our same `robocopy /MIR` trick or `RemoveDirectoryW` with `FILE_FLAG_BACKUP_SEMANTICS`).

At that point, take ownership of cleanup in the wrapper and remove the recovery path. Until then, `recovered (cleanup error)` is the expected label for any Windows drain that runs `pnpm install`.

## Do not

- Fork sandcastle to add the option (per memory `sandcastle_api_drift_v0_5_7.md`).
- Pre-empt sandcastle's cleanup by deleting `node_modules/.pnpm/` ourselves before `run()` returns — that races sandcastle's lifecycle and corrupts the agent's workspace.
