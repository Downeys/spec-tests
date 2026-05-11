// src/ui/components/RecompileStatus.tsx
// Phase 2 plan 02-08 — UI-06 closure (was the placeholder polling from 02-07).
//
// Now polls GET /recompile/status every 5s per D-16. State shape mirrors the
// route response exactly:
//   { lastCompiledAt: ISO8601 | null, dirtyClaimsCount: number, inFlight: false }
//
// The /recompile/status endpoint always returns inFlight: false; the in-flight
// state during an SSE stream is tracked by RecompileButton client-side. A future
// polish round could surface that to RecompileStatus via a shared context.
//
// Display:
//   Idle (D-16):
//     Last compiled: HH:MM • N claims unwritten
//     OR (when never compiled)
//     Never compiled • N claims unwritten
//   In-flight (D-17, Phase 2 single-page assumption):
//     ⟿ Compiling… 1 of 1 page
//
// Time format: HH:MM (24-hour, no seconds, local time) per D-16.

import { useState, useEffect } from 'react';
import { Loader2Icon } from 'lucide-react';

interface StatusSnapshot {
  lastCompiledAt: string | null;
  dirtyClaimsCount: number;
  inFlight: boolean;
}

const POLL_INTERVAL_MS = 5000;

function formatHHMM(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'Never';
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  } catch {
    return 'Never';
  }
}

export default function RecompileStatus() {
  const [status, setStatus] = useState<StatusSnapshot>({
    lastCompiledAt: null,
    dirtyClaimsCount: 0,
    inFlight: false,
  });

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch('/recompile/status');
        if (!res.ok) return;
        const data = (await res.json()) as StatusSnapshot;
        if (!cancelled) setStatus(data);
      } catch {
        // Silent — the route fails closed (returns empty state on DB error);
        // a network-level failure leaves the previous snapshot in place.
      }
    };

    // Fire once immediately, then on a 5s interval per D-16.
    void poll();
    const handle = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, []);

  const idleText =
    status.lastCompiledAt === null
      ? `Never compiled • ${status.dirtyClaimsCount} claims unwritten`
      : `Last compiled: ${formatHHMM(status.lastCompiledAt)} • ${status.dirtyClaimsCount} claims unwritten`;

  return (
    <span
      aria-live="polite"
      className="h-7 px-3 inline-flex items-center gap-2 rounded-full bg-muted text-xs text-muted-foreground border border-border"
    >
      {status.inFlight ? (
        <>
          <Loader2Icon className="size-4 animate-spin" />
          Compiling… 1 of 1 page
        </>
      ) : (
        idleText
      )}
    </span>
  );
}
