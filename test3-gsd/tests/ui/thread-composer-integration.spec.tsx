// @vitest-environment jsdom
// tests/ui/thread-composer-integration.spec.tsx
// Plan 02-08 post-task-5 follow-up — Gap 1 integration assertion.
//
// Verifies that Thread renders the slash-command-aware Composer wrapper
// (src/ui/components/Composer.tsx), NOT the inline ComposerPrimitive.Root
// it had before the post-task-5 follow-up. The behavioral consequence is
// that typing `/recompile` in the actual Thread composer (the one users
// see) routes through the wrapper's interceptor BEFORE assistant-ui's
// transport.send dispatches to /chat.
//
// The assertion strategy:
//   1. Mock the Composer module so we can observe whether Thread instantiated it.
//   2. Stub assistant-ui's ThreadPrimitive + ComposerPrimitive so Thread
//      renders without needing a real runtime.
//   3. Render Thread with an onRecompile spy.
//   4. Assert the Composer mock was called AND received the onRecompile prop.
//
// This is a minimal seam check — the actual slash-command interception logic
// is exercised by tests/ui/slash-command.spec.tsx (4 cases). Together they
// prove: (a) the wrapper intercepts correctly in isolation, and (b) Thread
// actually uses the wrapper end-to-end.

import type { ReactNode } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

const composerSpy = vi.fn();

vi.mock('@/ui/components/Composer', () => ({
  default: (props: { onRecompile?: () => void; children?: ReactNode }) => {
    composerSpy(props);
    return <div data-testid="composer-wrapper">{props.children}</div>;
  },
}));

vi.mock('@assistant-ui/react', () => ({
  ThreadPrimitive: {
    Root: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    Viewport: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    ViewportFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    Empty: ({ children }: { children: ReactNode }) => <>{children}</>,
    Messages: () => <div data-testid="messages" />,
    If: ({ children }: { children: ReactNode }) => <>{children}</>,
  },
  ComposerPrimitive: {
    Input: () => <textarea data-testid="composer-input" />,
    Send: ({ children }: { children?: ReactNode }) => <button>{children}</button>,
    Cancel: ({ children }: { children?: ReactNode }) => <button>{children}</button>,
  },
  MessagePrimitive: {
    Root: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    Parts: () => <div />,
  },
}));

import { Thread } from '@/ui/components/assistant-ui/thread';

afterEach(() => {
  cleanup();
  composerSpy.mockClear();
});

describe('Thread integration with slash-command Composer wrapper (Gap 1)', () => {
  it('renders the Composer wrapper (not inline ComposerPrimitive.Root)', () => {
    render(<Thread onRecompile={() => {}} />);
    expect(composerSpy).toHaveBeenCalled();
  });

  it('forwards onRecompile through to the Composer wrapper', () => {
    const onRecompileSpy = vi.fn();
    render(<Thread onRecompile={onRecompileSpy} />);
    // The wrapper received the same callback Thread was given.
    const props = composerSpy.mock.calls[0]?.[0] as { onRecompile?: () => void };
    expect(props.onRecompile).toBe(onRecompileSpy);
  });
});
