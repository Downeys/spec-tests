/**
 * Post-merge cleanup for an `agent/issue-N` slice: pulls main, removes the
 * worktree directory (Windows-safe via the shared helper), prunes git's
 * worktree metadata, and deletes the local branch.
 *
 * Run with: npm run sweep <issue-number>     (also accepts `npm run sweep -- <N>`)
 *
 * Refuses to run unless a MERGED PR exists for the branch — sweep is post-merge
 * cleanup, not a way to discard in-flight work. To discard a still-open branch
 * intentionally, use `git worktree remove` and `git branch -D` directly.
 */
import { execa } from 'execa';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { removeWorktreeDir } from './worktree-cleanup.js';

const REPO_ROOT = resolve(import.meta.dirname, '..');

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

async function run(
  cmd: string,
  args: string[],
  opts: { reject?: boolean; cwd?: string } = {},
): Promise<RunResult> {
  const r = await execa(cmd, args, { cwd: opts.cwd ?? REPO_ROOT, reject: opts.reject ?? true });
  return { exitCode: r.exitCode ?? 0, stdout: r.stdout, stderr: r.stderr };
}

function fail(msg: string): never {
  console.error(`[sweep] ${msg}`);
  process.exit(1);
}

function parseIssueArg(): number {
  const arg = process.argv[2];
  if (!arg || !/^\d+$/.test(arg)) {
    fail('Usage: npm run sweep <issue-number>  (e.g. `npm run sweep 3`)');
  }
  return Number(arg);
}

interface PrInfo {
  number: number;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  url: string;
}

async function findMergedPr(branch: string): Promise<PrInfo | undefined> {
  const result = await run(
    'gh',
    ['pr', 'list', '--head', branch, '--state', 'all', '--json', 'number,state,url'],
    { reject: false },
  );
  if (result.exitCode !== 0) {
    fail(`gh pr list failed: ${result.stderr}`);
  }
  const prs = JSON.parse(result.stdout || '[]') as PrInfo[];
  return prs.find((p) => p.state === 'MERGED');
}

async function main(): Promise<void> {
  const n = parseIssueArg();
  const branch = `agent/issue-${n}`;
  const worktreePath = resolve(REPO_ROOT, '.sandcastle', 'worktrees', `agent-issue-${n}`);

  // Safety check: refuse to sweep if the PR isn't merged yet.
  console.log(`[sweep] Checking that PR for ${branch} is merged...`);
  const merged = await findMergedPr(branch);
  if (!merged) {
    fail(
      `No MERGED PR found for ${branch}. Sweep is post-merge cleanup only — run \`npm run ship ${n}\` first, or remove the worktree manually if you want to discard the branch without merging.`,
    );
  }
  console.log(`[sweep] Found merged PR: ${merged.url}`);

  // 1. Pull main so the local main has the squash commit. (Without this, the
  //    `git branch -d` step below refuses with "not yet merged to HEAD".)
  console.log(`[sweep] Pulling main...`);
  await run('git', ['checkout', 'main']);
  await run('git', ['pull', 'origin', 'main']);

  // 2. Remove the worktree directory if it's still there.
  if (existsSync(worktreePath)) {
    console.log(`[sweep] Removing worktree...`);
    await removeWorktreeDir(worktreePath);
  } else {
    console.log(`[sweep] Worktree already gone — skipping.`);
  }

  // 3. Prune git's worktree metadata.
  await run('git', ['worktree', 'prune']);

  // 4. Delete the local branch with -D (force). -d would refuse because we
  //    use squash-merge: the branch tip never becomes an ancestor of main,
  //    so git's "not fully merged" check fires even though the work IS on
  //    main under a different SHA. The startup PR-merge check above is the
  //    real safety net — if we got here, the work is upstream.
  const branchCheck = await run('git', ['rev-parse', '--verify', branch], { reject: false });
  if (branchCheck.exitCode === 0) {
    console.log(`[sweep] Deleting local branch ${branch}...`);
    await run('git', ['branch', '-D', branch]);
  } else {
    console.log(`[sweep] Local branch ${branch} already gone — skipping.`);
  }

  console.log(`[sweep] Done. #${n} is fully cleaned up.`);
}

await main();
