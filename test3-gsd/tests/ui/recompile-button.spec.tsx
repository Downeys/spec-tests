// @vitest-environment jsdom
// tests/ui/recompile-button.spec.tsx
// Wave 0 probe — VALIDATION row UI-06.
//
// 02-08 smoke-check follow-up (Bug A + C fix): RecompileButton is now a
// CONTROLLED component. AppShell owns the single useRecompile() instance and
// passes `{ inFlight, onClick }` down via props (HeaderBar forwards). The
// button no longer calls useRecompile() internally — that was the root cause
// of the slash-command path not flipping the button's loading visual.
//
// These tests now drive the button by props directly, which is the actual
// contract the production code relies on. The hook's standalone behaviour
// (idempotency guard, SSE drain, onCompleted invocation) is exercised by
// tests/ui/use-recompile.spec.tsx via the shared instance contract.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import RecompileButton from '@/ui/components/RecompileButton';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('RecompileButton (UI-06) — controlled component', () => {
  it('renders idle state with the verbatim "Recompile" label and is enabled when inFlight=false', () => {
    render(<RecompileButton inFlight={false} onClick={() => {}} />);
    const button = screen.getByRole('button', { name: /recompile vault/i });
    expect(button).toBeInTheDocument();
    // Idle text from UI-SPEC Copywriting Contract — verbatim.
    expect(button).toHaveTextContent(/recompile/i);
    expect(button).not.toBeDisabled();
  });

  it('renders the "Compiling…" loading state and is disabled when inFlight=true', () => {
    render(<RecompileButton inFlight={true} onClick={() => {}} />);
    const button = screen.getByRole('button', { name: /recompile vault/i });
    // VERBATIM "Compiling…" copy (with the ellipsis character, not three dots)
    // per UI-SPEC Copywriting Contract.
    expect(button).toHaveTextContent('Compiling…');
    expect(button).toBeDisabled();
  });

  it('calls onClick exactly once per click (the parent owns the recompile logic)', () => {
    const onClickSpy = vi.fn();
    render(<RecompileButton inFlight={false} onClick={onClickSpy} />);
    const button = screen.getByRole('button', { name: /recompile vault/i });

    fireEvent.click(button);
    expect(onClickSpy).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire onClick when inFlight=true (button is disabled)', () => {
    const onClickSpy = vi.fn();
    render(<RecompileButton inFlight={true} onClick={onClickSpy} />);
    const button = screen.getByRole('button', { name: /recompile vault/i });

    fireEvent.click(button);
    // The disabled attribute prevents the click from firing the handler in
    // testing-library's fireEvent (matches browser behavior).
    expect(onClickSpy).not.toHaveBeenCalled();
  });
});
