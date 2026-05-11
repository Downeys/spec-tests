/**
 * Drains the queue of `sandcastle`-labeled GitHub issues by running the agent
 * once per issue. See README.md for the wrapper design and
 * docs/agents/triage-labels.md for the label state machine.
 *
 * Run with: npx tsx .sandcastle/main.ts
 */
import { run, claudeCode } from '@ai-hero/sandcastle';
import { docker } from '@ai-hero/sandcastle/sandboxes/docker';
import { execa } from 'execa';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  containsRateLimit,
  determineRunStatus,
  isRateLimitError,
  type RunStatus,
} from './status.js';
import {
  buildSiblingContextBlock,
  estimateTokens,
  summarizeBranch,
  type SiblingSummary,
} from './sibling-context.js';
import { formatSummary, type RunSummary } from './summary.js';
import { removeWorktreeDir } from './worktree-cleanup.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REPO_ROOT = resolve(import.meta.dirname, '..');

// Matches Sandcastle's default image-name convention: `sandcastle:<dir-name>`.
// `npx sandcastle docker build-image` produces this name without a flag; we
// pin it here so a custom `--image-name` build doesn't silently mismatch.
const IMAGE_NAME = 'sandcastle:test5-sandcastle';

const HOST_CREDS_PATH = join(homedir(), '.config', 'sandcastle-claude-creds');
const SANDBOX_CREDS_PATH = '/home/agent/.claude';

const QUEUE_LABEL = 'sandcastle';
const IN_PROGRESS_LABEL = 'in-progress';
const BLOCKED_LABEL = 'blocked';
const RETRY_LABEL = 'retry';
const NEEDS_REVIEW_LABEL = 'needs-review';
const NEEDS_INFO_LABEL = 'needs-info';

// Skills the prompt actually depends on. Probe these before entering the loop.
const REQUIRED_SKILLS = ['tdd', 'diagnose'];

// Idle timeout: 10 minutes of silence kills the run. Wall-clock cap: 90 minutes.
const IDLE_TIMEOUT_SECONDS = 600;
const WALL_CLOCK_TIMEOUT_MS = 90 * 60 * 1000;

const MAX_ITERATIONS = 5;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Issue {
  number: number;
  title: string;
  labels: string[];
}

// ---------------------------------------------------------------------------
// gh helpers — best-effort, never abort the loop on label or comment failure
// ---------------------------------------------------------------------------

async function gh(args: string[], options: { input?: string } = {}): Promise<string> {
  const result = await execa('gh', args, {
    cwd: REPO_ROOT,
    input: options.input,
    reject: false,
  });
  if (result.exitCode !== 0) {
    throw new Error(`gh ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

async function tryGh(
  args: string[],
  context: string,
  options: { input?: string } = {},
): Promise<void> {
  try {
    await gh(args, options);
  } catch (err) {
    console.error(`[wrapper] ${context} failed (continuing):`, (err as Error).message);
  }
}

async function fetchQueue(): Promise<Issue[]> {
  const raw = await gh([
    'issue',
    'list',
    '--label',
    QUEUE_LABEL,
    '--state',
    'open',
    '--json',
    'number,title,labels',
    '--limit',
    '200',
  ]);
  const issues = JSON.parse(raw) as Array<{
    number: number;
    title: string;
    labels: Array<{ name: string }>;
  }>;
  return issues
    .map((i) => ({ number: i.number, title: i.title, labels: i.labels.map((l) => l.name) }))
    .filter((i) => !i.labels.includes(IN_PROGRESS_LABEL) && !i.labels.includes(BLOCKED_LABEL))
    .sort((a, b) => a.number - b.number);
}

async function addLabel(issue: number, label: string): Promise<void> {
  await tryGh(
    ['issue', 'edit', String(issue), '--add-label', label],
    `add label "${label}" to #${issue}`,
  );
}

async function removeLabel(issue: number, label: string): Promise<void> {
  await tryGh(
    ['issue', 'edit', String(issue), '--remove-label', label],
    `remove label "${label}" from #${issue}`,
  );
}

async function postComment(issue: number, body: string): Promise<void> {
  await tryGh(['issue', 'comment', String(issue), '--body-file', '-'], `comment on #${issue}`, {
    input: body,
  });
}

// ---------------------------------------------------------------------------
// git helpers
// ---------------------------------------------------------------------------

async function branchExists(branch: string): Promise<boolean> {
  const result = await execa('git', ['rev-parse', '--verify', branch], {
    cwd: REPO_ROOT,
    reject: false,
  });
  return result.exitCode === 0;
}

async function deleteBranch(branch: string): Promise<void> {
  // -D = force delete; the branch is unmerged by definition (it's the agent's
  // rejected work). The user explicitly opted in via the `retry` label.
  await execa('git', ['branch', '-D', branch], { cwd: REPO_ROOT, reject: false });
}

async function tryRecoverCommits(args: {
  result: unknown;
  runError: unknown;
  branch: string;
}): Promise<{ sha: string }[]> {
  if (args.result !== undefined || args.runError === undefined) return [];
  const recovered = await recoverCommitsFromBranch(args.branch);
  if (recovered.length > 0) {
    console.log(
      `[wrapper] recovered ${recovered.length} commit(s) from ${args.branch} after sandcastle.run() threw`,
    );
  }
  return recovered;
}

async function recoverCommitsFromBranch(branch: string): Promise<{ sha: string }[]> {
  // When sandcastle.run() throws (e.g. its WorktreeManager hits the Windows +
  // pnpm-symlinks "Function not implemented" landmine during teardown), we
  // never receive its `result` object. The agent's commits are still on the
  // branch, though — read them back so labeling can route to needs-review
  // instead of mislabeling a successful run as a hard failure.
  if (!(await branchExists(branch))) return [];
  const result = await execa('git', ['log', 'main..' + branch, '--format=%H'], {
    cwd: REPO_ROOT,
    reject: false,
  });
  if (result.exitCode !== 0) return [];
  return result.stdout
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((sha) => ({ sha }));
}

async function remoteBranchExists(branch: string): Promise<boolean> {
  // Defensive check: if the agent ignored its instructions and pushed, this
  // succeeds. We don't fetch first — just check what's already in
  // `refs/remotes/origin/` locally. If the agent ran `git push` from the
  // sandbox, it will have updated the local remote ref via the same shared
  // .git directory.
  const result = await execa('git', ['rev-parse', '--verify', `refs/remotes/origin/${branch}`], {
    cwd: REPO_ROOT,
    reject: false,
  });
  return result.exitCode === 0;
}

// ---------------------------------------------------------------------------
// Startup probes
// ---------------------------------------------------------------------------

function probeSkills(): string[] {
  const missing: string[] = [];
  for (const skill of REQUIRED_SKILLS) {
    const path = join(REPO_ROOT, '.claude', 'skills', skill, 'SKILL.md');
    if (!existsSync(path)) missing.push(skill);
  }
  return missing;
}

async function probeAuth(): Promise<string | null> {
  // Light auth probe: credential file present + claude --version succeeds on
  // the host. We do NOT make a real API call — that's network spend, slow,
  // and the actual sandbox will fail loudly within ~30s of the run starting
  // if the OAuth token has been revoked.
  if (!existsSync(HOST_CREDS_PATH)) {
    return `OAuth credential directory not found at ${HOST_CREDS_PATH}. Bootstrap with:\n  docker run -it --rm --entrypoint claude -v ${HOST_CREDS_PATH}:/home/agent/.claude ${IMAGE_NAME} login`;
  }
  // Some Claude Code installs ship a settings.json + auth tokens; we don't
  // know exactly which file is the canonical token, so just check the dir
  // is non-empty as a sanity signal.
  const result = await execa('claude', ['--version'], { reject: false });
  if (result.exitCode !== 0) {
    return `\`claude --version\` failed on the host. Make sure the Claude Code CLI is installed and on PATH.`;
  }
  return null;
}

async function probeGhAuth(): Promise<{ token: string } | string> {
  // The wrapper itself uses host-side gh for queue / labels / comments — but
  // the prompt's `!gh issue view ...` shell-expansion block runs *inside* the
  // sandbox, where no auth exists by default. Sandcastle does not bridge
  // keyring auth into the container, so we export the token here and pass it
  // through as GH_TOKEN. (On Windows the keyring is Credential Manager, which
  // isn't mountable as a file, so token-via-env is the only viable path.)
  const versionResult = await execa('gh', ['--version'], { reject: false });
  if (versionResult.exitCode !== 0) {
    return '`gh --version` failed on the host. Install GitHub CLI and run `gh auth login`.';
  }
  const tokenResult = await execa('gh', ['auth', 'token'], { reject: false });
  if (tokenResult.exitCode !== 0) {
    return `\`gh auth token\` failed on the host. Run \`gh auth login\`.\n${tokenResult.stderr}`;
  }
  const token = tokenResult.stdout.trim();
  if (!token) {
    return '`gh auth token` returned empty. Run `gh auth login`.';
  }
  return { token };
}

// ---------------------------------------------------------------------------
// Per-issue flow
// ---------------------------------------------------------------------------

function lastLines(text: string, n: number): string {
  const lines = text.split(/\r?\n/);
  return lines.slice(Math.max(0, lines.length - n)).join('\n');
}

function buildStatusComment(args: {
  status: RunStatus;
  branch?: string;
  commits: { sha: string }[];
  stdout: string;
  logFilePath?: string;
  pushedWarning: boolean;
  siblingContext?: { count: number; tokens: number };
}): string {
  const { status, branch, commits, stdout, logFilePath, pushedWarning, siblingContext } = args;
  const lines: string[] = [];
  lines.push(`**Sandcastle run:** \`${status}\``);
  if (branch) lines.push(`**Branch:** \`${branch}\``);
  lines.push(
    `**Commits:** ${commits.length}${commits.length > 0 ? ` (${commits.map((c) => `\`${c.sha.slice(0, 7)}\``).join(', ')})` : ''}`,
  );
  if (siblingContext && siblingContext.count > 0) {
    lines.push(
      `**Sibling context:** ${siblingContext.count} sibling(s), ~${siblingContext.tokens} tokens`,
    );
  }
  if (logFilePath) lines.push(`**Log:** \`${logFilePath}\``);
  if (pushedWarning) {
    lines.push('');
    lines.push(
      '> :warning: **The agent pushed this branch to the remote.** It was instructed not to. Investigate before merging — this is a wrapper or prompt regression.',
    );
  }
  lines.push('');
  lines.push('<details><summary>Last ~50 lines of agent output</summary>');
  lines.push('');
  lines.push('```');
  lines.push(lastLines(stdout, 50));
  lines.push('```');
  lines.push('');
  lines.push('</details>');
  return lines.join('\n');
}

// Removes the per-issue worktree dir from disk. Safe to call when the dir
// doesn't exist. Failures are logged, never thrown — cleanup must not mask the
// real run outcome. Used both for pre-flight orphan removal and post-run
// cleanup so a clean run leaves no disk residue.
async function cleanupWorktree(worktreePath: string): Promise<void> {
  if (!existsSync(worktreePath)) return;
  try {
    await removeWorktreeDir(worktreePath);
    await execa('git', ['worktree', 'prune'], { cwd: REPO_ROOT, reject: false });
  } catch (err) {
    console.error(`[wrapper] worktree cleanup failed for ${worktreePath}:`, err);
  }
}

async function processIssue(
  issue: Issue,
  ghToken: string,
  siblings: readonly SiblingSummary[],
): Promise<RunSummary> {
  const branch = `agent/issue-${issue.number}`;
  console.log(`\n[wrapper] === Issue #${issue.number}: ${issue.title} ===`);

  // (a) Honor `retry` — discard prior branch and clear the label so the next
  // queue fetch doesn't keep re-triggering it.
  if (issue.labels.includes(RETRY_LABEL)) {
    console.log(`[wrapper] retry label set; discarding prior branch ${branch} if any`);
    if (await branchExists(branch)) await deleteBranch(branch);
    await removeLabel(issue.number, RETRY_LABEL);
  }

  // (b) Skip-on-existing-branch — preserve possibly-good prior work.
  if (await branchExists(branch)) {
    console.log(
      `[wrapper] branch ${branch} already exists; skipping (add 'retry' label to discard and re-run)`,
    );
    return { issue: issue.number, status: 'skipped (existing branch)', commitCount: 0 };
  }

  // (b.5) Clean up any orphaned worktree dir from a prior failed run. Without
  // this, sandcastle's WorktreeManager hits "Function not implemented" on
  // Windows when git tries to delete a pnpm-installed worktree dir.
  const worktreePath = join(REPO_ROOT, '.sandcastle', 'worktrees', `agent-issue-${issue.number}`);
  if (existsSync(worktreePath)) {
    console.log(`[wrapper] cleaning orphaned worktree dir ${worktreePath}`);
    await cleanupWorktree(worktreePath);
  }

  // (c) Mark in-progress.
  await addLabel(issue.number, IN_PROGRESS_LABEL);

  // Build the sibling-context block once so we can both pass it to the agent
  // and surface its size in logs / status comment for bloat monitoring.
  const siblingContextBlock = buildSiblingContextBlock(siblings);
  const siblingContextTokens = estimateTokens(siblingContextBlock);
  if (siblings.length > 0) {
    console.log(
      `[wrapper] sibling context: ${siblings.length} sibling(s), ~${siblingContextTokens} tokens`,
    );
  }

  // (d) Run the agent.
  let result: Awaited<ReturnType<typeof run>> | undefined;
  let runError: unknown;
  try {
    result = await run({
      agent: claudeCode('claude-opus-4-7'),
      sandbox: docker({
        imageName: IMAGE_NAME,
        mounts: [{ hostPath: HOST_CREDS_PATH, sandboxPath: SANDBOX_CREDS_PATH }],
        // GH_TOKEN gives the in-sandbox `gh` (used by the prompt's
        // `!gh issue view ...` block, and by any agent-side `gh issue comment`)
        // the same auth as the host. Without it, gh inside the container
        // hits its "please run gh auth login" path.
        env: { GH_TOKEN: ghToken },
      }),
      promptFile: '.sandcastle/prompt.md',
      promptArgs: {
        ISSUE_NUMBER: String(issue.number),
        ISSUE_TITLE: issue.title,
        SIBLING_CONTEXT: siblingContextBlock,
      },
      branchStrategy: { type: 'branch', branch },
      maxIterations: MAX_ITERATIONS,
      idleTimeoutSeconds: IDLE_TIMEOUT_SECONDS,
      signal: AbortSignal.timeout(WALL_CLOCK_TIMEOUT_MS),
    });
  } catch (err) {
    runError = err;
    console.error(`[wrapper] sandcastle.run() threw:`, err);
  }

  // Determine status from result + error.
  let commits = result?.commits ?? [];
  const completionSignal = result?.completionSignal;
  const stdout =
    result?.stdout ?? (runError instanceof Error ? runError.message : String(runError ?? ''));
  const logFilePath = result?.logFilePath;

  // Recovery: sandcastle.run() can throw *after* the agent commits — e.g. its
  // WorktreeManager hits the Windows + pnpm-symlinks teardown landmine. In
  // that case `result` is undefined but the commits are still on the branch.
  const recovered = await tryRecoverCommits({ result, runError, branch });
  if (recovered.length > 0) commits = recovered;
  const recoveredFromError = recovered.length > 0;

  const status: RunStatus = determineRunStatus({
    commits,
    completionSignal,
    runError,
    stdout,
    recoveredFromError,
  });

  // (g) Defensive push check.
  const pushed = await remoteBranchExists(branch);

  // (e) Status comment — best effort, posted regardless of outcome.
  const comment = buildStatusComment({
    status,
    branch: commits.length > 0 ? branch : undefined,
    commits,
    stdout,
    logFilePath,
    pushedWarning: pushed,
    siblingContext: { count: siblings.length, tokens: siblingContextTokens },
  });
  await postComment(issue.number, comment);

  // (f) Apply outcome labels. Always remove `sandcastle` so the wrapper
  // never silently re-queues the issue — the user re-applies `sandcastle`
  // (with `retry` for fresh-start) when they're ready.
  await removeLabel(issue.number, IN_PROGRESS_LABEL);
  await removeLabel(issue.number, QUEUE_LABEL);
  if (commits.length > 0) {
    await addLabel(issue.number, NEEDS_REVIEW_LABEL);
  } else {
    // No commits: either bail-out (COMPLETE without commits) or hard
    // failure (timeout, abort, unknown error). Both want a human eye, so
    // both go to `needs-info`.
    await addLabel(issue.number, NEEDS_INFO_LABEL);
  }

  // (h) Post-run worktree cleanup. The git branch is the durable artifact;
  // the worktree dir is a build cache that, on Windows + pnpm, accumulates
  // symlink farms that defeat next-run cleanup. Run before the rate-limit
  // throw so cleanup happens even when the loop is about to abort.
  await cleanupWorktree(worktreePath);

  // Surface rate-limit upstream so the loop can break — even when commits
  // exist (status is partial-work, but we still don't drain the next issue).
  if (isRateLimitError(runError) || containsRateLimit(stdout)) {
    throw new RateLimitError();
  }

  return {
    issue: issue.number,
    status,
    branch: commits.length > 0 ? branch : undefined,
    commitCount: commits.length,
  };
}

class RateLimitError extends Error {
  constructor() {
    super('rate-limit detected; ending drain');
    this.name = 'RateLimitError';
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function printSummary(summaries: RunSummary[]): void {
  console.log(formatSummary(summaries));
}

async function drainQueue(queue: Issue[], ghToken: string): Promise<RunSummary[]> {
  const summaries: RunSummary[] = [];
  const siblings: SiblingSummary[] = [];
  for (const issue of queue) {
    try {
      const summary = await processIssue(issue, ghToken, siblings);
      summaries.push(summary);
      // Capture sibling context for subsequent iterations. Only branches with
      // commits are useful — a no-commit run has nothing for siblings to reuse.
      if (summary.commitCount > 0 && summary.branch) {
        siblings.push(
          await summarizeBranch({
            issue: summary.issue,
            branch: summary.branch,
            baseBranch: 'main',
            cwd: REPO_ROOT,
          }),
        );
      }
    } catch (err) {
      if (err instanceof RateLimitError) {
        console.error(`[wrapper] Rate limit detected on #${issue.number}; stopping drain.`);
        // Mark remaining issues as skipped in the summary for visibility.
        const remaining = queue.slice(queue.indexOf(issue) + 1);
        for (const r of remaining) {
          summaries.push({ issue: r.number, status: 'skipped (rate-limited)', commitCount: 0 });
        }
        break;
      }
      // Anything else: log, continue. The per-issue try/catches inside
      // processIssue should normally swallow this.
      console.error(`[wrapper] Unexpected error on #${issue.number}:`, err);
      summaries.push({ issue: issue.number, status: 'failed (unknown)', commitCount: 0 });
    }
  }

  return summaries;
}

async function main(): Promise<void> {
  console.log('[wrapper] Sandcastle drain starting');

  const missingSkills = probeSkills();
  if (missingSkills.length > 0) {
    console.error(
      `[wrapper] FATAL: missing required skills under .claude/skills/: ${missingSkills.join(', ')}`,
    );
    console.error(
      `[wrapper] Install with: npx skills@latest add mattpocock/skills/<name> — and commit them.`,
    );
    process.exit(1);
  }

  const authError = await probeAuth();
  if (authError) {
    console.error(`[wrapper] FATAL: ${authError}`);
    process.exit(1);
  }

  const ghAuth = await probeGhAuth();
  if (typeof ghAuth === 'string') {
    console.error(`[wrapper] FATAL: ${ghAuth}`);
    process.exit(1);
  }

  const queue = await fetchQueue();
  if (queue.length === 0) {
    console.log('[wrapper] Queue empty');
    return;
  }
  console.log(
    `[wrapper] Queue: ${queue.length} issue(s) — ${queue.map((i) => `#${i.number}`).join(', ')}`,
  );

  const summaries = await drainQueue(queue, ghAuth.token);
  printSummary(summaries);
}

await main();
