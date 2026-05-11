// @vitest-environment jsdom
// tests/ui/app-shell-recompile-shared-state.spec.tsx
// Plan 02-08 smoke-check follow-up — proves Bug A + C are fixed end-to-end.
//
// Bug A: Slash command triggered a real recompile but the RecompileButton
//        in HeaderBar did NOT show its loading state.
// Bug C: Clicking the button THEN typing /recompile fired TWO POSTs.
//
// Root cause: AppShell and RecompileButton each called useRecompile()
// independently — two separate `inFlight` state vars, two separate guards.
// Fix: AppShell calls useRecompile() ONCE, threads `{ inFlight, trigger }`
// down through HeaderBar -> RecompileButton (props) AND into Thread.onRecompile.
//
// This test renders the REAL AppShell with the REAL HeaderBar + RecompileButton,
// stubs the Thread to surface a `Trigger Slash` button that calls the same
// onRecompile prop the slash-command path uses, then asserts:
//   1. Clicking the Thread's slash-trigger flips the RecompileButton to its
//      "Compiling…" state (Bug A — the same inFlight state drives both).
//   2. While in flight, clicking the actual RecompileButton AND triggering
//      another slash both result in only ONE POST /recompile (Bug C —
//      cross-call short-circuit).

import { useEffect, type ReactNode } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';

// Pending-stream fetch — first trigger opens it, never closes until we say so.
let finishStream: (() => void) | undefined;

function buildPendingSseResponse(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      // AI SDK 6 native shapes — text-delta carries id+delta; data-* carries `data`.
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text-start', id: 's1' })}\n\n`));
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text-delta', id: 's1', delta: '...' })}\n\n`));
      finishStream = () => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text-end', id: 's1' })}\n\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'data-recompile-result',
          data: { pages_written: 1, pages_skipped: 0, run_id: '01J9X1111111111111111111A1' },
        })}\n\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'finish' })}\n\n`));
        controller.close();
      };
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

vi.mock('@assistant-ui/react', () => ({
  AssistantRuntimeProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useThreadRuntime: () => ({ append: () => {} }),
}));

// Stub Thread so we can capture and re-fire the onRecompile prop the same way
// the real slash-command path would. We expose a button labeled "trigger slash"
// that calls onRecompile() — equivalent to the user typing /recompile in the
// composer.
let lastSlashHandler: (() => void | Promise<void>) | undefined;
vi.mock('@/ui/components/assistant-ui/thread', () => ({
  Thread: ({ onRecompile }: { onRecompile?: () => void | Promise<void> }) => {
    // Capture the handler in a module-level ref so the test can also fire it
    // outside the render-effect timing if needed.
    useEffect(() => {
      lastSlashHandler = onRecompile;
    }, [onRecompile]);
    return (
      <div>
        <button
          data-testid="thread-slash-trigger"
          onClick={() => void onRecompile?.()}
        >
          Trigger Slash
        </button>
      </div>
    );
  },
}));

// Note: HeaderBar + RecompileButton + RecompileStatus are NOT mocked — we
// render them for real so the test exercises the actual prop wiring AppShell
// produces.

// Stub RecompileStatus's polling fetch so we don't have to coordinate with it.
// (RecompileStatus is rendered by the real HeaderBar.)
vi.mock('@/ui/components/RecompileStatus', () => ({
  default: () => <div data-testid="recompile-status-stub" />,
}));

import App from '@/ui/App';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  finishStream = undefined;
  lastSlashHandler = undefined;
});

describe('AppShell shared useRecompile instance — Bug A + C end-to-end', () => {
  it('Bug A: slash-command path flips the RecompileButton to the "Compiling…" loading state', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(buildPendingSseResponse());

    render(<App />);

    // Initially the button shows the idle "Recompile" copy and is enabled.
    const button = screen.getByRole('button', { name: /recompile vault/i });
    expect(button).toHaveTextContent(/recompile/i);
    expect(button).not.toHaveTextContent('Compiling…');
    expect(button).not.toBeDisabled();

    // Fire the slash-command path (NOT a click on the button).
    fireEvent.click(screen.getByTestId('thread-slash-trigger'));

    // The same shared inFlight state flips, so the button's visual updates.
    await waitFor(() => {
      expect(button).toHaveTextContent('Compiling…');
    });
    expect(button).toBeDisabled();

    // Let the stream finish so the test exits cleanly.
    await act(async () => {
      finishStream?.();
    });
    await waitFor(() => {
      expect(button).toHaveTextContent(/^recompile$/i);
    });
  });

  it('Bug C: clicking the button while a slash-triggered recompile is in flight does NOT fire a second POST', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(buildPendingSseResponse());

    render(<App />);

    // Step 1: trigger via slash-command path.
    fireEvent.click(screen.getByTestId('thread-slash-trigger'));
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Wait for inFlight to flip — the button is now disabled.
    const button = screen.getByRole('button', { name: /recompile vault/i });
    await waitFor(() => {
      expect(button).toBeDisabled();
    });

    // Step 2: click the button. Disabled button doesn't fire onClick — but
    // even if a non-disabled path called trigger() again, the hook's ref-based
    // guard would short-circuit. fetch must remain at 1.
    fireEvent.click(button);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Step 3: trigger via slash-command path AGAIN (which is NOT gated by the
    // disabled attribute — it goes straight through onRecompile). The shared
    // hook's idempotency guard MUST short-circuit it.
    fireEvent.click(screen.getByTestId('thread-slash-trigger'));
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Let the stream finish.
    await act(async () => {
      finishStream?.();
    });
    await waitFor(() => {
      expect(button).not.toBeDisabled();
    });
  });
});
