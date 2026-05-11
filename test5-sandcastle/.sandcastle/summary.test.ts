import { describe, test, expect } from 'vitest';
import { computeCounts, formatSummary, type RunSummary } from './summary.js';

describe('computeCounts', () => {
  test('recovered (cleanup error) counts under needs-review', () => {
    const summaries: RunSummary[] = [
      {
        issue: 22,
        status: 'recovered (cleanup error)',
        branch: 'agent/issue-22',
        commitCount: 1,
      },
    ];
    const c = computeCounts(summaries);
    expect(c.needsReview).toBe(1);
    expect(c.recovered).toBe(1);
    expect(c.completed).toBe(0);
    expect(c.partialWork).toBe(0);
  });

  test('failed (*) counts under needs-info AND failed', () => {
    const summaries: RunSummary[] = [
      { issue: 1, status: 'failed (timeout)', commitCount: 0 },
      { issue: 2, status: 'failed (rate limit)', commitCount: 0 },
      { issue: 3, status: 'bailed-out', commitCount: 0 },
    ];
    const c = computeCounts(summaries);
    expect(c.needsInfo).toBe(3);
    expect(c.failed).toBe(2);
    expect(c.bailedOut).toBe(1);
  });

  test('mixed run: counts roll up correctly', () => {
    const summaries: RunSummary[] = [
      { issue: 10, status: 'completed', branch: 'agent/issue-10', commitCount: 3 },
      { issue: 11, status: 'partial-work', branch: 'agent/issue-11', commitCount: 1 },
      {
        issue: 12,
        status: 'recovered (cleanup error)',
        branch: 'agent/issue-12',
        commitCount: 2,
      },
      { issue: 13, status: 'bailed-out', commitCount: 0 },
      { issue: 14, status: 'failed (timeout)', commitCount: 0 },
      { issue: 15, status: 'skipped (existing branch)', commitCount: 0 },
    ];
    const c = computeCounts(summaries);
    expect(c.attempted).toBe(6);
    expect(c.needsReview).toBe(3);
    expect(c.needsInfo).toBe(2);
    expect(c.skipped).toBe(1);
    expect(c.failed).toBe(1);
  });
});

describe('formatSummary', () => {
  test('per-issue line gets review hint when branch is present', () => {
    const out = formatSummary([
      {
        issue: 22,
        status: 'recovered (cleanup error)',
        branch: 'agent/issue-22',
        commitCount: 1,
      },
    ]);
    expect(out).toContain(
      '#22: recovered (cleanup error) (agent/issue-22, 1 commits) — review with: git diff main..agent/issue-22',
    );
  });

  test('per-issue line has no review hint when branch is absent', () => {
    const out = formatSummary([{ issue: 23, status: 'failed (timeout)', commitCount: 0 }]);
    expect(out).toContain('#23: failed (timeout)');
    expect(out).not.toContain('review with:');
  });

  test('summary header reflects recovered count under needs-review', () => {
    const out = formatSummary([
      {
        issue: 22,
        status: 'recovered (cleanup error)',
        branch: 'agent/issue-22',
        commitCount: 1,
      },
    ]);
    expect(out).toContain('needs-review: 1 (0 completed, 0 partial, 1 recovered)');
  });
});
