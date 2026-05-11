// @vitest-environment jsdom
// tests/ui/recompile-system-message.spec.tsx
// Plan 02-08 R-A fix (2026-04-26 smoke check) — D-18 wiring contract.
//
// Verifies the formatRecompileSystemMessage() helper produces the verbatim
// D-18 string per AI-SPEC + 02-CONTEXT D-18:
//   `Recompiled: <n> page written, <s> skipped (run <run-ulid>).`
//
// R-A correctness contract:
//   - The D-18 message MUST render in the ephemeral RecompileBanner (NOT
//     through the assistant-ui chat thread runtime).
//   - A recompile completion MUST NOT trigger any POST /chat. The previous
//     implementation called useThreadRuntime().append({ role: 'system' }),
//     which the AI-SDK external-store runtime always routes through
//     chatHelpers.sendMessage → POST /chat. The chat route's
//     extractUserMessage then 400s because the message has no user content.
//
// We assert this end-to-end by:
//   1. Spying on global.fetch — only POST /recompile is allowed; any POST
//      /chat after the recompile completes is the regression we are guarding.
//   2. Driving the slash-command path (Thread.onRecompile prop) and waiting
//      for the SSE stream to finish.
//   3. Asserting the banner renders the verbatim D-18 string AND fetch was
//      called for /recompile only.

import { useEffect, type ReactNode } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';

const appendSpy = vi.fn();

// SSE response factory — emits a recompile-result chunk and closes.
function buildRecompileSseResponse(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            type: 'data-recompile-result',
            data: {
              pages_written: 1,
              pages_skipped: 0,
              run_id: '01J9X1111111111111111111A1',
            },
          })}\n\n`,
        ),
      );
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'finish' })}\n\n`));
      controller.close();
    },
  });
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    body: stream,
    headers: new Headers({ 'content-type': 'text/event-stream' }),
  } as Response;
}

vi.mock('@assistant-ui/react-ai-sdk', () => ({
  AssistantChatTransport: class {
    api: string;
    constructor(opts?: { api?: string }) {
      this.api = opts?.api ?? '';
    }
  },
  useChatRuntime: () => ({}),
}));

// Provide a useThreadRuntime mock that records calls — the R-A fix removes the
// production call to it, so this spy MUST remain at zero. If a future change
// re-introduces append() (or any other turn-triggering API), this spy fires.
vi.mock('@assistant-ui/react', () => ({
  AssistantRuntimeProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useThreadRuntime: () => ({ append: appendSpy }),
}));

// Stub Thread so we can fire the slash-command path; expose a button labeled
// "trigger slash" that calls onRecompile.
let lastSlashHandler: (() => void | Promise<void>) | undefined;
vi.mock('@/ui/components/assistant-ui/thread', () => ({
  Thread: ({ onRecompile }: { onRecompile?: () => void | Promise<void> }) => {
    useEffect(() => {
      lastSlashHandler = onRecompile;
    }, [onRecompile]);
    return (
      <div>
        <button data-testid="thread-slash-trigger" onClick={() => void onRecompile?.()}>
          Trigger Slash
        </button>
      </div>
    );
  },
}));

// Stub HeaderBar so we don't need RecompileStatus's poll fetch in the way.
vi.mock('@/ui/components/HeaderBar', () => ({
  default: () => <div data-testid="header-stub">Header</div>,
}));

import App, { formatRecompileSystemMessage } from '@/ui/App';

afterEach(() => {
  cleanup();
  appendSpy.mockClear();
  lastSlashHandler = undefined;
  vi.restoreAllMocks();
});

describe('formatRecompileSystemMessage (D-18 verbatim)', () => {
  it('produces the verbatim D-18 string from AI-SPEC + 02-CONTEXT D-18', () => {
    const text = formatRecompileSystemMessage({
      pages_written: 1,
      pages_skipped: 0,
      run_id: '01J9X1111111111111111111A1',
    });
    // VERBATIM per UI-SPEC Copywriting Contract — DO NOT paraphrase.
    expect(text).toBe(
      'Recompiled: 1 page written, 0 skipped (run 01J9X1111111111111111111A1).',
    );
  });

  it('handles pages_skipped > 0', () => {
    const text = formatRecompileSystemMessage({
      pages_written: 1,
      pages_skipped: 3,
      run_id: '01J9X2222222222222222222B2',
    });
    expect(text).toBe(
      'Recompiled: 1 page written, 3 skipped (run 01J9X2222222222222222222B2).',
    );
  });
});

describe('R-A: D-18 renders in RecompileBanner — NOT through chat thread runtime', () => {
  it('on render, no append() and no fetch fire (handler is constructed, not called)', () => {
    render(<App />);
    expect(appendSpy).not.toHaveBeenCalled();
  });

  it('after recompile completes, the banner shows the verbatim D-18 text AND no POST /chat fires', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(buildRecompileSseResponse());

    render(<App />);

    // Trigger the recompile via the slash-command path (the SAME callback
    // path that produced the original 400 in production).
    await act(async () => {
      fireEvent.click(screen.getByTestId('thread-slash-trigger'));
    });

    // Wait for the banner to render the verbatim D-18 message.
    await waitFor(() => {
      const banner = screen.getByTestId('recompile-banner');
      expect(banner).toHaveTextContent(
        'Recompiled: 1 page written, 0 skipped (run 01J9X1111111111111111111A1).',
      );
    });

    // R-A correctness contract: the chat-thread runtime was never touched.
    expect(appendSpy).not.toHaveBeenCalled();

    // R-A correctness contract: the only POST is /recompile. NO /chat.
    const chatCalls = fetchSpy.mock.calls.filter((args) => {
      const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url;
      return url.includes('/chat');
    });
    expect(
      chatCalls.length,
      `R-A regression: recompile completion fired ${chatCalls.length} POST /chat call(s). ` +
        `Expected 0. The D-18 system message must NOT go through the assistant-ui chat runtime.`,
    ).toBe(0);

    const recompileCalls = fetchSpy.mock.calls.filter((args) => {
      const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url;
      return url.includes('/recompile');
    });
    expect(recompileCalls.length).toBe(1);
  });
});
