import type { RunStatus } from './status.js';

export interface RunSummary {
  issue: number;
  status: RunStatus | 'skipped (existing branch)' | 'skipped (rate-limited)';
  branch?: string;
  commitCount: number;
}

export interface SummaryCounts {
  attempted: number;
  completed: number;
  partialWork: number;
  recovered: number;
  bailedOut: number;
  failed: number;
  needsReview: number;
  needsInfo: number;
  skipped: number;
}

const isReview = (s: RunSummary): boolean =>
  s.status === 'completed' ||
  s.status === 'partial-work' ||
  s.status === 'recovered (cleanup error)';

const isFailed = (s: RunSummary): boolean =>
  typeof s.status === 'string' && s.status.startsWith('failed');

const isInfo = (s: RunSummary): boolean => s.status === 'bailed-out' || isFailed(s);

const isSkipped = (s: RunSummary): boolean =>
  typeof s.status === 'string' && s.status.startsWith('skipped');

export function computeCounts(summaries: readonly RunSummary[]): SummaryCounts {
  return {
    attempted: summaries.length,
    completed: summaries.filter((s) => s.status === 'completed').length,
    partialWork: summaries.filter((s) => s.status === 'partial-work').length,
    recovered: summaries.filter((s) => s.status === 'recovered (cleanup error)').length,
    bailedOut: summaries.filter((s) => s.status === 'bailed-out').length,
    failed: summaries.filter(isFailed).length,
    needsReview: summaries.filter(isReview).length,
    needsInfo: summaries.filter(isInfo).length,
    skipped: summaries.filter(isSkipped).length,
  };
}

export function formatSummary(summaries: readonly RunSummary[]): string {
  const c = computeCounts(summaries);
  const lines = [
    '',
    '[wrapper] === Drain summary ===',
    `  attempted   : ${c.attempted}`,
    `  needs-review: ${c.needsReview} (${c.completed} completed, ${c.partialWork} partial, ${c.recovered} recovered)`,
    `  needs-info  : ${c.needsInfo} (${c.bailedOut} bailed-out, ${c.failed} failed)`,
    `  skipped     : ${c.skipped}`,
    `  failed      : ${c.failed}`,
    '',
  ];
  for (const s of summaries) {
    const branchPart = s.branch ? ` (${s.branch}, ${s.commitCount} commits)` : '';
    const reviewHint = s.branch ? ` — review with: git diff main..${s.branch}` : '';
    lines.push(`  #${s.issue}: ${s.status}${branchPart}${reviewHint}`);
  }
  return lines.join('\n');
}
