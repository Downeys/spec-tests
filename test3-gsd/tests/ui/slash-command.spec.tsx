// @vitest-environment jsdom
// tests/ui/slash-command.spec.tsx
// Wave 0 probe — VALIDATION row COMP-11 (composer half).
// Spec authority:
//   .planning/phases/02-agents-and-chat/02-VALIDATION.md row COMP-11 (line 267)
//   .planning/phases/02-agents-and-chat/02-UI-SPEC.md §IC-5
//
// Mocks @assistant-ui/react ComposerPrimitive primitives so the Composer
// renders a plain form + textarea + submit button. The test cares about the
// slash-command interception, not assistant-ui's internal styling or
// runtime-store wiring.
//
// Three it() cases:
//   1. Submitting `/recompile` calls onRecompile and prevents default submit
//      (no /chat fetch).
//   2. Trailing whitespace `/recompile   ` still intercepts.
//   3. Regular text input does NOT call onRecompile.

import type { FormEvent, ReactNode, FormHTMLAttributes } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

// Stub assistant-ui's ComposerPrimitive so .Root renders a plain <form>
// (which it actually IS in production per ComposerRoot.d.ts) + .Input renders
// a plain <textarea> + .Send renders a plain <button type="submit">.
vi.mock('@assistant-ui/react', () => ({
  ComposerPrimitive: {
    Root: ({
      children,
      onSubmit,
      ...rest
    }: FormHTMLAttributes<HTMLFormElement> & {
      children?: ReactNode;
      onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
    }) => (
      <form onSubmit={onSubmit} data-testid="composer-form" {...rest}>
        {children}
      </form>
    ),
    Input: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
      <textarea data-testid="composer-input" {...props} />
    ),
    Send: ({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children?: ReactNode }) => (
      <button type="submit" data-testid="composer-send" {...rest}>
        {children ?? 'Send'}
      </button>
    ),
  },
}));

// Import AFTER the mock so the wrapper resolves to our stubs.
import Composer from '@/ui/components/Composer';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Composer slash-command interception (COMP-11 composer half / IC-5)', () => {
  it('intercepts /recompile and calls onRecompile, NOT default submit (no /chat fetch)', () => {
    const onRecompileSpy = vi.fn();
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response('', { status: 200 }),
    );

    render(<Composer onRecompile={onRecompileSpy} />);

    const textarea = screen.getByTestId('composer-input') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '/recompile' } });

    const form = screen.getByTestId('composer-form');
    fireEvent.submit(form);

    expect(onRecompileSpy).toHaveBeenCalledTimes(1);
    // CRITICAL: no /chat fetch was triggered (the assistant-ui default-submit
    // would have hit /chat — the wrapper's preventDefault must block it).
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('intercepts /recompile with trailing whitespace too', () => {
    const onRecompileSpy = vi.fn();
    render(<Composer onRecompile={onRecompileSpy} />);

    const textarea = screen.getByTestId('composer-input') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '/recompile   ' } });

    const form = screen.getByTestId('composer-form');
    fireEvent.submit(form);

    expect(onRecompileSpy).toHaveBeenCalledTimes(1);
  });

  it('does NOT intercept regular chat messages — onRecompile is not called and default submit is allowed', () => {
    const onRecompileSpy = vi.fn();
    render(<Composer onRecompile={onRecompileSpy} />);

    const textarea = screen.getByTestId('composer-input') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Hello world' } });

    const form = screen.getByTestId('composer-form');
    fireEvent.submit(form);

    expect(onRecompileSpy).not.toHaveBeenCalled();
  });

  it('does NOT intercept `/recompile something else` (must be the exact form per IC-5)', () => {
    const onRecompileSpy = vi.fn();
    render(<Composer onRecompile={onRecompileSpy} />);

    const textarea = screen.getByTestId('composer-input') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '/recompile please' } });

    const form = screen.getByTestId('composer-form');
    fireEvent.submit(form);

    // IC-5: only the exact `/recompile` (with optional whitespace, no further
    // args) is intercepted. `/recompile please` is treated as a normal message.
    expect(onRecompileSpy).not.toHaveBeenCalled();
  });
});
