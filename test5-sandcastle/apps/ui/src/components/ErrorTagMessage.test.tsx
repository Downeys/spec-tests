import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ErrorTagMessage } from './ErrorTagMessage';
import type { ApiErrorTag } from '../api-client';

afterEach(() => {
  cleanup();
});

interface Case {
  readonly tag: ApiErrorTag;
  readonly message: string;
}

const CASES: readonly Case[] = [
  { tag: 'NetworkError', message: 'API unreachable.' },
  { tag: 'RequestTimeout', message: 'Request timed out. Check the API process.' },
  { tag: 'RepositoryError', message: 'Storage error. Check the data files.' },
  { tag: 'ConfigError', message: 'Config error. Check ~/.config/bp-agent/runtime.json.' },
  { tag: 'InternalError', message: 'Server error. Check the API process logs.' },
  { tag: 'StrategyNotFound', message: 'Strategy not found. Refreshing list…' },
  { tag: 'NameInvalid', message: 'Name is invalid.' },
  { tag: 'StrategyAlreadyExists', message: 'A Strategy with that name already exists.' },
  {
    tag: 'StrategyIsArchived',
    message: 'That Strategy is archived. Restore it before switching.',
  },
  { tag: 'IllegalTransition', message: 'That state transition is not allowed.' },
  {
    tag: 'CannotArchiveActive',
    message: 'Cannot archive the active Strategy. Switch first.',
  },
];

describe('ErrorTagMessage', () => {
  it.each(CASES)('renders canonical text for $tag', ({ tag, message }) => {
    render(<ErrorTagMessage error={{ tag }} />);
    expect(screen.getByRole('alert').textContent).toBe(message);
  });

  it('throws on an unknown tag (assertNever runtime guard)', () => {
    expect(() => render(<ErrorTagMessage error={{ tag: 'Bogus' as ApiErrorTag }} />)).toThrow(
      /Unexpected ApiError tag/,
    );
  });
});
