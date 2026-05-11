// src/ui/hooks/useRecompile.ts
// Phase 2 plan 02-08 (post-task-5 follow-up) — shared SSE-consuming recompile
// trigger so both RecompileButton (click path) and Composer (slash-command path
// via App.tsx) hit the same fetch + SSE-drain logic.
//
// 02-08 smoke-check follow-up (Bug A + C fix):
//   - The hook MUST be called ONCE in AppShell. Both RecompileButton (now a
//     controlled component) and Thread.onRecompile receive the SAME trigger +
//     inFlight from that one instance. Two separate hook instances each owned
//     their own inFlight state — clicking the button or typing /recompile each
//     hit a different instance, so the button never reflected the slash-command
//     path's loading state and idempotency was broken across the two paths.
//   - We also keep a `useRef` mirror of `inFlight` so the closure that the
//     callback captures can short-circuit even if the React state hasn't
//     re-rendered yet between two synchronous trigger() calls. The state is
//     still the source of truth for rendering; the ref is just the guard.
//
// The hook returns a stable trigger() function and an inFlight boolean so any
// caller can render an in-flight UX (or ignore it). The onCompleted callback
// is invoked once with the parsed `data-recompile-result` chunk value after
// the SSE stream drains successfully — the contract that App.tsx relies on to
// emit the D-18 system message.
//
// Extracted from RecompileButton (which had this logic inline as of Task 3)
// so the slash-command path can share it without duplicating the parser.

import { useCallback, useRef, useState } from 'react';

export interface RecompileResult {
  pages_written: number;
  pages_skipped: number;
  run_id: string;
  error?: string;
}

export interface UseRecompileOptions {
  /**
   * Called once with the parsed `data-recompile-result` chunk value after the
   * SSE stream drains successfully. Optional — callers that only want the
   * inFlight UX can omit it.
   */
  onCompleted?: (result: RecompileResult) => void;
}

export interface UseRecompileReturn {
  /** True between the moment trigger() is invoked and the moment the SSE stream drains (or errors). */
  inFlight: boolean;
  /** Trigger a recompile. Idempotent during an in-flight run (returns early). */
  trigger: () => Promise<void>;
}

/**
 * Shared recompile trigger. Posts to /recompile, drains the SSE stream,
 * captures the `data-recompile-result` chunk, and invokes onCompleted.
 *
 * The SSE parser tolerates partial frames at chunk boundaries by buffering
 * the trailing partial line between reads.
 *
 * IMPORTANT: Call this hook exactly ONCE per App tree (in AppShell). Pass the
 * returned `{ inFlight, trigger }` down through props so the button and the
 * slash-command path share the same in-flight state. Two separate instances
 * will each own their own state and the UX will diverge (Bug A + C).
 */
export function useRecompile(options: UseRecompileOptions = {}): UseRecompileReturn {
  const { onCompleted } = options;
  const [inFlight, setInFlight] = useState(false);
  // Ref mirror of inFlight so the trigger closure can short-circuit
  // synchronously, even if React hasn't flushed the state update from the
  // previous trigger call yet. Without this, two trigger() calls in the same
  // microtask tick (rare but possible) could both pass the inFlight guard.
  const inFlightRef = useRef(false);

  const trigger = useCallback(async () => {
    // Idempotent during an in-flight run — concurrent invocations (e.g., the
    // user clicking the button AND typing /recompile in quick succession) are
    // dropped rather than firing two parallel POSTs.
    if (inFlightRef.current) return;

    inFlightRef.current = true;
    setInFlight(true);
    let result: RecompileResult | undefined;

    try {
      const res = await fetch('/recompile', { method: 'POST' });
      if (!res.ok) {
        throw new Error(`POST /recompile failed: ${res.status} ${res.statusText}`);
      }
      if (!res.body) {
        throw new Error('POST /recompile returned no body');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // Read SSE frames. Each Hono streamSSE frame is `data: <json>\n\n`.
      // We accumulate bytes into a buffer, split on newline, and process each
      // `data:` line as it lands. Continue until the stream ends.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice('data:'.length).trim();
          if (!payload) continue;
          try {
            // AI SDK 6 native DataUIMessageChunk shape: { type, id?, data }.
            // The streaming.ts adapter emits `data` (not `value`); read that.
            const chunk = JSON.parse(payload) as {
              type?: string;
              data?: RecompileResult;
            };
            if (chunk.type === 'data-recompile-result' && chunk.data) {
              result = chunk.data;
            }
          } catch {
            // Ignore malformed frames — defensive against partial chunks
            // that may slip through if the buffer split on a newline mid-frame.
          }
        }
      }

      if (result && onCompleted) {
        onCompleted(result);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('useRecompile:', err);
    } finally {
      inFlightRef.current = false;
      setInFlight(false);
    }
    // Note: we deliberately do NOT depend on `inFlight` (the React state) here
    // — the ref handles the guard. Depending on `inFlight` would re-create the
    // callback on every state flip, defeating the point of useCallback for
    // anyone who memoizes on the trigger reference.
  }, [onCompleted]);

  return { inFlight, trigger };
}
