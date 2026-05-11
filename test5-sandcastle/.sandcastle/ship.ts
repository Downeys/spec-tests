/**
 * Pushes an `agent/issue-N` branch, opens a PR, and merges it (squash + delete
 * remote branch). The PR body is explicitly set to include `Closes #N` so the
 * merge auto-closes the issue regardless of what the agent's commit messages
 * looked like.
 *
 * Run with: npm run ship <issue-number>     (also accepts `npm run ship -- <N>`)
 *
 * After this completes successfully, run `npm run sweep <N>` to clean up the
 * local worktree, branch, and pull main.
 */
import { execa } from 'execa';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..');

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

async function run(
  cmd: string,
  args: string[],
  opts: { reject?: boolean } = {},
): Promise<RunResult> {
  const r = await execa(cmd, args, { cwd: REPO_ROOT, reject: opts.reject ?? true });
  return { exitCode: r.exitCode ?? 0, stdout: r.stdout, stderr: r.stderr };
}

function fail(msg: string): never {
  console.error(`[ship] ${msg}`);
  process.exit(1);
}

function parseIssueArg(): number {
  const arg = process.argv[2];
  if (!arg || !/^\d+$/.test(arg)) {
    fail('Usage: npm run ship <issue-number>  (e.g. `npm run ship 3`)');
  }
  return Number(arg);
}

async function main(): Promise<void> {
  const n = parseIssueArg();
  const branch = `agent/issue-${n}`;

  // 1. Verify the branch exists locally — the wrapper would have created it
  //    during the drain. If it's gone, the user probably already shipped.
  const branchCheck = await run('git', ['rev-parse', '--verify', branch], { reject: false });
  if (branchCheck.exitCode !== 0) {
    fail(
      `Branch \`${branch}\` not found locally. Did you already ship this issue, or has \`npm run drain\` run yet?`,
    );
  }

  // 2. Push. Idempotent: if it's already on origin and up-to-date, push is a
  //    no-op + sets upstream tracking either way.
  console.log(`[ship] Pushing ${branch} to origin...`);
  await run('git', ['push', '-u', 'origin', branch]);

  // 3. PR title from the last commit subject — keeps the PR title aligned
  //    with the squash-merge commit subject GitHub will produce.
  const titleResult = await run('git', ['log', '-1', '--pretty=%s', branch]);
  const title = titleResult.stdout.trim();

  // 4. PR body — explicit `Closes #N` so the squash-merge auto-closes the
  //    issue. We set this regardless of what's in commit messages because
  //    `gh pr create --fill` only reads the first commit's body, which is
  //    fragile when an agent makes multiple commits during TDD.
  const body = `Closes #${n}\n\n_Created via \`npm run ship ${n}\`._`;

  console.log(`[ship] Creating PR for ${branch}...`);
  const prCreate = await run(
    'gh',
    ['pr', 'create', '--head', branch, '--base', 'main', '--title', title, '--body', body],
    { reject: false },
  );

  if (prCreate.exitCode !== 0) {
    // A PR may already exist for this branch (e.g. ship was re-run after a
    // merge failure). Surface the existing one and continue to the merge.
    const list = await run(
      'gh',
      ['pr', 'list', '--head', branch, '--state', 'open', '--json', 'number,url'],
      { reject: false },
    );
    const open = JSON.parse(list.stdout || '[]') as Array<{ number: number; url: string }>;
    if (open.length === 0) {
      fail(`gh pr create failed and no open PR exists for ${branch}.\n${prCreate.stderr}`);
    }
    console.log(`[ship] PR already open: ${open[0].url}`);
  }

  // 5. Merge. Squash keeps main's history one-commit-per-slice. We do NOT use
  //    `gh pr merge --delete-branch` because that flag tries to delete the
  //    *local* branch too, which always fails at ship time — the branch is
  //    checked out in the worktree the user just reviewed. Instead, do an
  //    explicit remote-only delete after the merge succeeds.
  console.log(`[ship] Merging (squash)...`);
  await run('gh', ['pr', 'merge', branch, '--squash']);

  console.log(`[ship] Deleting remote branch...`);
  await run('git', ['push', 'origin', '--delete', branch]);

  console.log(`[ship] Done. Run \`npm run sweep ${n}\` to clean up the local worktree and branch.`);
}

await main();
