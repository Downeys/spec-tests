import { describe, test, expect } from 'vitest';
import { buildSiblingContextBlock, estimateTokens, extractNewExports } from './sibling-context.js';

describe('extractNewExports', () => {
  test('captures const, function, class, type, interface, enum', () => {
    const diff = [
      '+export const parseFoo = () => {};',
      '+export function makeBar() {}',
      '+export async function fetchBaz() {}',
      '+export class Qux {}',
      '+export type Quux = string;',
      '+export interface Corge {}',
      '+export enum Grault { A, B }',
    ].join('\n');
    expect(extractNewExports(diff)).toEqual([
      'parseFoo',
      'makeBar',
      'fetchBaz',
      'Qux',
      'Quux',
      'Corge',
      'Grault',
    ]);
  });

  test('ignores non-+ lines (existing exports, context lines)', () => {
    const diff = [
      ' export const existing = 1;',
      '-export const removed = 2;',
      '+export const added = 3;',
    ].join('\n');
    expect(extractNewExports(diff)).toEqual(['added']);
  });

  test('ignores re-exports and default exports (intentionally narrow)', () => {
    const diff = [
      '+export { foo, bar } from "./other";',
      '+export default someValue;',
      '+export const keepThis = 1;',
    ].join('\n');
    expect(extractNewExports(diff)).toEqual(['keepThis']);
  });

  test('deduplicates the same symbol added twice', () => {
    const diff = ['+export const foo = 1;', '+export const foo = 1;'].join('\n');
    expect(extractNewExports(diff)).toEqual(['foo']);
  });

  test('returns empty array on empty diff', () => {
    expect(extractNewExports('')).toEqual([]);
  });
});

describe('estimateTokens', () => {
  test('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  test('rounds up at the 4-chars-per-token rate', () => {
    expect(estimateTokens('a')).toBe(1);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
    expect(estimateTokens('abcdefgh')).toBe(2);
  });
});

describe('buildSiblingContextBlock', () => {
  test('returns empty string when no siblings', () => {
    expect(buildSiblingContextBlock([])).toBe('');
  });

  test('renders branch header, changed files, and new exports', () => {
    const block = buildSiblingContextBlock([
      {
        issue: 4,
        branch: 'agent/issue-4',
        changedFiles: ['packages/x/parse.ts', 'packages/x/index.ts'],
        newExports: ['parseFoo', 'FooSchema'],
      },
    ]);
    expect(block).toContain('## Sibling work in this drain session');
    expect(block).toContain('`agent/issue-4` (issue #4)');
    expect(block).toContain('Changed: packages/x/parse.ts, packages/x/index.ts');
    expect(block).toContain('New exports: parseFoo, FooSchema');
  });

  test('renders multiple siblings in order', () => {
    const block = buildSiblingContextBlock([
      { issue: 4, branch: 'agent/issue-4', changedFiles: ['a.ts'], newExports: ['a'] },
      { issue: 5, branch: 'agent/issue-5', changedFiles: ['b.ts'], newExports: ['b'] },
    ]);
    const idx4 = block.indexOf('agent/issue-4');
    const idx5 = block.indexOf('agent/issue-5');
    expect(idx4).toBeGreaterThan(-1);
    expect(idx5).toBeGreaterThan(idx4);
  });

  test('omits Changed line when no files', () => {
    const block = buildSiblingContextBlock([
      { issue: 7, branch: 'agent/issue-7', changedFiles: [], newExports: ['only'] },
    ]);
    expect(block).not.toContain('Changed:');
    expect(block).toContain('New exports: only');
  });

  test('omits New exports line when no symbols', () => {
    const block = buildSiblingContextBlock([
      { issue: 8, branch: 'agent/issue-8', changedFiles: ['docs/foo.md'], newExports: [] },
    ]);
    expect(block).toContain('Changed: docs/foo.md');
    expect(block).not.toContain('New exports:');
  });

  test('includes the stack-review framing', () => {
    const block = buildSiblingContextBlock([
      { issue: 4, branch: 'agent/issue-4', changedFiles: ['a.ts'], newExports: ['a'] },
    ]);
    expect(block).toContain('Prefer importing');
    expect(block).toContain('reviewed as a stack');
  });
});
