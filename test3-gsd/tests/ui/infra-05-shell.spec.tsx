// @vitest-environment jsdom
// tests/ui/infra-05-shell.spec.tsx
//
// INFRA-05 contract preservation across the Phase 1 → Phase 2 boundary.
// Phase 1 D-19 shipped a placeholder App.tsx with <h1>Business Strategy
// Planner</h1>. Phase 2 plan 02-07 replaced that with the assistant-ui
// composition; the <h1> moved into HeaderBar but the contract — the title
// renders in the document — must still hold.
//
// Originally tests/integration/ui-scaffold.test.tsx, but that file ran in
// the integration project's `node` environment and broke once App.tsx
// imported assistant-ui (the assistant-stream package needs TransformStream,
// which only jsdom provides). Plan 02-07 Task 4 (Rule 3 deviation) moved
// the contract assertion into tests/ui/ where the jsdom env is loaded.

import type { ReactNode } from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';

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
  // returns a no-op append so the shell renders cleanly in this probe (the
  // D-18 wiring is unit-tested separately in tests/ui/recompile-system-message.spec.tsx).
  useThreadRuntime: () => ({ append: () => {} }),
}));

vi.mock('@/ui/components/assistant-ui/thread', () => ({
  Thread: () => <div data-testid="thread-stub">Thread</div>,
}));

import App from '@/ui/App';

afterEach(() => cleanup());

describe('UI scaffold (INFRA-05 contract — preserved into Phase 2)', () => {
  it('renders <h1>Business Strategy Planner</h1>', () => {
    render(<App />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.textContent).toBe('Business Strategy Planner');
  });
});
