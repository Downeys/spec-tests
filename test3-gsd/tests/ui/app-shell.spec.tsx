// @vitest-environment jsdom
// tests/ui/app-shell.spec.tsx
// Wave 0 probe — VALIDATION row UI-01.
//
// Stubs the assistant-ui runtime + Thread component so the test does not
// need a real /chat endpoint or the full assistant-ui store wired. The
// actual streaming/runtime config is verified separately in
// tests/ui/streaming.spec.tsx (Task 5).

import type { ReactNode } from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('@assistant-ui/react-ai-sdk', () => ({
  AssistantChatTransport: class {
    api: string;
    constructor(opts?: { api?: string }) {
      this.api = opts?.api ?? '';
    }
  },
  useChatRuntime: () => ({}),
}));

vi.mock('@assistant-ui/react', () => ({
  AssistantRuntimeProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  ThreadPrimitive: {
    Root: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  },
  // Plan 02-08 post-task-5 follow-up: AppShell calls useThreadRuntime() to
  // emit the D-18 system message after a recompile completes. The mock
  // returns a no-op append so this probe keeps its existing scope (UI-01
  // shell rendering); the D-18 wiring is exercised in
  // tests/ui/recompile-system-message.spec.tsx.
  useThreadRuntime: () => ({ append: () => {} }),
}));

vi.mock('@/ui/components/assistant-ui/thread', () => ({
  Thread: () => <div data-testid="thread-stub">Thread</div>,
}));

import App from '@/ui/App';

afterEach(() => cleanup());

describe('App shell (UI-01)', () => {
  it('renders header with Business Strategy Planner title', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Business Strategy Planner',
    );
  });

  it('renders Recompile button', () => {
    render(<App />);
    expect(
      screen.getByRole('button', { name: /recompile vault/i }),
    ).toBeInTheDocument();
  });

  it('renders Thread (assistant-ui chat surface)', () => {
    render(<App />);
    expect(screen.getByTestId('thread-stub')).toBeInTheDocument();
  });
});
