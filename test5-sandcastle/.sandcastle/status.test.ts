import { describe, test, expect } from 'vitest';
import { determineRunStatus } from './status.js';

describe('determineRunStatus', () => {
  test('commits + completionSignal → completed', () => {
    expect(
      determineRunStatus({
        commits: [{ sha: 'abc1234' }],
        completionSignal: 'COMPLETE',
        runError: undefined,
        stdout: '',
      }),
    ).toBe('completed');
  });

  test('commits + no completionSignal → partial-work', () => {
    expect(
      determineRunStatus({
        commits: [{ sha: 'abc1234' }],
        completionSignal: undefined,
        runError: undefined,
        stdout: '',
      }),
    ).toBe('partial-work');
  });

  test('no commits + completionSignal → bailed-out', () => {
    expect(
      determineRunStatus({
        commits: [],
        completionSignal: 'COMPLETE',
        runError: undefined,
        stdout: '',
      }),
    ).toBe('bailed-out');
  });

  test('commits + timeout error → partial-work (the bug fix)', () => {
    const timeoutError = new Error('idle timeout exceeded');
    expect(
      determineRunStatus({
        commits: [{ sha: 'abc1234' }],
        completionSignal: undefined,
        runError: timeoutError,
        stdout: '',
      }),
    ).toBe('partial-work');
  });

  test('commits + rate-limit error → partial-work', () => {
    const rateLimitError = new Error('rate limit exceeded');
    expect(
      determineRunStatus({
        commits: [{ sha: 'abc1234' }],
        completionSignal: undefined,
        runError: rateLimitError,
        stdout: '',
      }),
    ).toBe('partial-work');
  });

  test('no commits + timeout error → failed (timeout)', () => {
    const timeoutError = new Error('idle timeout exceeded');
    expect(
      determineRunStatus({
        commits: [],
        completionSignal: undefined,
        runError: timeoutError,
        stdout: '',
      }),
    ).toBe('failed (timeout)');
  });

  test('no commits + rate-limit error → failed (rate limit)', () => {
    const rateLimitError = new Error('rate limit exceeded');
    expect(
      determineRunStatus({
        commits: [],
        completionSignal: undefined,
        runError: rateLimitError,
        stdout: '',
      }),
    ).toBe('failed (rate limit)');
  });

  test('no commits + rate-limit string in stdout → failed (rate limit)', () => {
    expect(
      determineRunStatus({
        commits: [],
        completionSignal: undefined,
        runError: undefined,
        stdout: 'Some output\nPlease try again later\nMore output',
      }),
    ).toBe('failed (rate limit)');
  });

  test('commits + runError + recoveredFromError → recovered (cleanup error)', () => {
    const cleanupError = new Error(
      "error: failed to delete 'agent-issue-19': Function not implemented",
    );
    expect(
      determineRunStatus({
        commits: [{ sha: 'abc1234' }],
        completionSignal: undefined,
        runError: cleanupError,
        stdout: '',
        recoveredFromError: true,
      }),
    ).toBe('recovered (cleanup error)');
  });

  test('recoveredFromError without runError falls through to normal logic', () => {
    expect(
      determineRunStatus({
        commits: [{ sha: 'abc1234' }],
        completionSignal: 'COMPLETE',
        runError: undefined,
        stdout: '',
        recoveredFromError: true,
      }),
    ).toBe('completed');
  });

  test('runError without recoveredFromError stays partial-work (existing behavior)', () => {
    expect(
      determineRunStatus({
        commits: [{ sha: 'abc1234' }],
        completionSignal: undefined,
        runError: new Error('idle timeout exceeded'),
        stdout: '',
      }),
    ).toBe('partial-work');
  });

  test('nothing matched → failed (unknown)', () => {
    expect(
      determineRunStatus({
        commits: [],
        completionSignal: undefined,
        runError: undefined,
        stdout: '',
      }),
    ).toBe('failed (unknown)');
  });
});
