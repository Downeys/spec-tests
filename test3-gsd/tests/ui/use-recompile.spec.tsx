// @vitest-environment jsdom
// tests/ui/use-recompile.spec.tsx
// Plan 02-08 smoke-check follow-up — covers the standalone behavior of the
// useRecompile hook after RecompileButton was demoted to a controlled
// component. The hook is the SHARED instance AppShell wires into both the
// click path (HeaderBar -> RecompileButton.onClick) and the slash-command
// path (Thread.onRecompile). Idempotency, SSE drain, and onCompleted firing
// are tested here directly.

import { useState, type ReactElement } from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';
import { useRecompile, type RecompileResult } from '@/ui/hooks/useRecompile';

// Build a Response whose body is a ReadableStream of SSE bytes — same helper
// shape the original recompile-button.spec used.
function buildSseResponse(frames: object[]): Response {
  const encoder = new TextEncoder();
  const lines = frames
    .map((f) => `data: ${JSON.stringify(f)}\n\n`)
    .join('');
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(lines));
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

// Build a Response whose body NEVER closes during the test — used to assert
// the inFlight guard: while one trigger is mid-stream, a second invocation
// must short-circuit. We resolve the underlying controller from the test so
// we can let the stream finish at the end.
function buildPendingSseResponse(): { response: Response; finish: () => void } {
  const encoder = new TextEncoder();
  let close: (() => void) | undefined;
  const stream = new ReadableStream({
    start(controller) {
      // Send one frame so the reader has something to consume immediately.
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text-delta', text: '...' })}\n\n`));
      close = () => {
        // AI SDK 6 DataUIMessageChunk shape: payload on `data` (not `value`).
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'data-recompile-result',
          data: { pages_written: 1, pages_skipped: 0, run_id: '01J9X1111111111111111111A1' },
        })}\n\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'finish' })}\n\n`));
        controller.close();
      };
    },
  });
  const response = {
    ok: true,
    status: 200,
    statusText: 'OK',
    body: stream,
    headers: new Headers({ 'content-type': 'text/event-stream' }),
  } as Response;
  return { response, finish: () => close?.() };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// Test harness — exposes the hook's return value as buttons + state badges so
// we can drive it from React Testing Library without a real consumer component.
function HookHarness({ onCompleted }: { onCompleted?: (r: RecompileResult) => void }): ReactElement {
  const { inFlight, trigger } = useRecompile({ onCompleted });
  const [calls, setCalls] = useState(0);
  return (
    <div>
      <button
        onClick={() => {
          setCalls((c) => c + 1);
          void trigger();
        }}
      >
        trigger
      </button>
      <span data-testid="inFlight">{String(inFlight)}</span>
      <span data-testid="calls">{calls}</span>
    </div>
  );
}

describe('useRecompile — SSE drain + onCompleted', () => {
  beforeEach(() => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      buildSseResponse([
        // AI SDK 6 native shapes: text-delta carries id+delta; data-* carries `data`.
        { type: 'text-start', id: 's1' },
        { type: 'text-delta', id: 's1', delta: 'Compiling…' },
        { type: 'text-end', id: 's1' },
        {
          type: 'data-recompile-result',
          data: {
            pages_written: 1,
            pages_skipped: 0,
            run_id: '01J9X1111111111111111111A1',
          },
        },
        { type: 'finish' },
      ]),
    );
  });

  it('POSTs to /recompile, drains the SSE stream, and calls onCompleted with the parsed result', async () => {
    const onCompletedSpy = vi.fn();
    render(<HookHarness onCompleted={onCompletedSpy} />);

    fireEvent.click(screen.getByRole('button', { name: /trigger/i }));

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith('/recompile', { method: 'POST' });

    await waitFor(() => {
      expect(onCompletedSpy).toHaveBeenCalledTimes(1);
    });
    expect(onCompletedSpy).toHaveBeenCalledWith({
      pages_written: 1,
      pages_skipped: 0,
      run_id: '01J9X1111111111111111111A1',
    });
  });

  it('flips inFlight true during the stream and back to false after the stream drains', async () => {
    render(<HookHarness />);
    fireEvent.click(screen.getByRole('button', { name: /trigger/i }));

    // After the stream drains, inFlight returns to false.
    await waitFor(() => {
      expect(screen.getByTestId('inFlight')).toHaveTextContent('false');
    });
  });
});

describe('useRecompile — idempotency guard (Bug C cross-call short-circuit)', () => {
  it('drops a second trigger() call while the first is still in-flight (only ONE POST)', async () => {
    // Pending stream — we manually finish it after the test asserts.
    const { response, finish } = buildPendingSseResponse();
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(response);

    render(<HookHarness />);
    const button = screen.getByRole('button', { name: /trigger/i });

    // Two synchronous clicks — within a single tick, before the inFlight
    // state has had a chance to flip via React's render cycle. The ref-based
    // guard in useRecompile is what catches the second call.
    fireEvent.click(button);
    fireEvent.click(button);

    // The first call fired fetch; the second was short-circuited by the ref
    // guard, so fetch was called exactly once across both clicks.
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Wait for inFlight to settle to true (the SSE stream is open and reading).
    await waitFor(() => {
      expect(screen.getByTestId('inFlight')).toHaveTextContent('true');
    });

    // A THIRD click while inFlight=true must also be dropped.
    fireEvent.click(button);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Let the stream finish so the test exits cleanly.
    await act(async () => {
      finish();
    });
    await waitFor(() => {
      expect(screen.getByTestId('inFlight')).toHaveTextContent('false');
    });
  });
});
