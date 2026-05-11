import { describe, it, expect } from 'vitest';
import { parseCommand } from './parser.js';

describe('parseCommand', () => {
  describe('/strategy switch', () => {
    it('parses /strategy switch <slug>', () => {
      const result = parseCommand('/strategy switch my-plan');
      expect(result).toEqual({ kind: 'strategy-switch', slug: 'my-plan' });
    });

    it('handles extra whitespace', () => {
      const result = parseCommand('  /strategy  switch  my-plan  ');
      expect(result).toEqual({ kind: 'strategy-switch', slug: 'my-plan' });
    });

    it('returns unknown for /strategy switch without slug', () => {
      const result = parseCommand('/strategy switch');
      expect(result.kind).toBe('unknown');
    });
  });

  describe('/strategy rename', () => {
    it('parses /strategy rename <old> <new>', () => {
      const result = parseCommand('/strategy rename old-name new-name');
      expect(result).toEqual({ kind: 'strategy-rename', oldSlug: 'old-name', newSlug: 'new-name' });
    });

    it('handles extra whitespace', () => {
      const result = parseCommand('  /strategy  rename  old-name  new-name  ');
      expect(result).toEqual({ kind: 'strategy-rename', oldSlug: 'old-name', newSlug: 'new-name' });
    });

    it('returns unknown for /strategy rename without both slugs', () => {
      expect(parseCommand('/strategy rename').kind).toBe('unknown');
      expect(parseCommand('/strategy rename only-one').kind).toBe('unknown');
    });
  });

  describe('/strategy archive', () => {
    it('parses /strategy archive <slug>', () => {
      const result = parseCommand('/strategy archive old-plan');
      expect(result).toEqual({ kind: 'strategy-archive', slug: 'old-plan', reason: undefined });
    });

    it('parses /strategy archive <slug> --reason <text>', () => {
      const result = parseCommand('/strategy archive old-plan --reason pivoting to new market');
      expect(result).toEqual({
        kind: 'strategy-archive',
        slug: 'old-plan',
        reason: 'pivoting to new market',
      });
    });

    it('handles extra whitespace', () => {
      const result = parseCommand('  /strategy  archive  old-plan  ');
      expect(result).toEqual({ kind: 'strategy-archive', slug: 'old-plan', reason: undefined });
    });

    it('returns unknown for /strategy archive without slug', () => {
      expect(parseCommand('/strategy archive').kind).toBe('unknown');
    });
  });

  describe('/strategy list', () => {
    it('parses /strategy list', () => {
      const result = parseCommand('/strategy list');
      expect(result).toEqual({ kind: 'strategy-list', all: false });
    });

    it('parses /strategy list --all', () => {
      const result = parseCommand('/strategy list --all');
      expect(result).toEqual({ kind: 'strategy-list', all: true });
    });

    it('handles extra whitespace', () => {
      const result = parseCommand('  /strategy  list  --all  ');
      expect(result).toEqual({ kind: 'strategy-list', all: true });
    });
  });
});
