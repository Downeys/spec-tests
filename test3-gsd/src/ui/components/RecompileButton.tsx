// src/ui/components/RecompileButton.tsx
// Phase 2 plan 02-08 — UI-06 closure (was the placeholder onClick from 02-07).
//
// 02-08 smoke-check follow-up (Bug A + C fix):
//   This component is now a CONTROLLED component. It no longer calls
//   useRecompile() internally — that hook MUST be instantiated exactly once
//   in AppShell so the slash-command path and the click path share the same
//   inFlight state and idempotency guard. The button receives `inFlight` and
//   `onClick` as props from AppShell (via HeaderBar). Result: typing
//   /recompile flips the button's loading visual, and clicking the button
//   while a slash-triggered recompile is in flight is properly short-circuited.
//
// Copy is verbatim from UI-SPEC Copywriting Contract — DO NOT paraphrase.

import { RefreshCwIcon, Loader2Icon } from 'lucide-react';
import { Button } from '@/ui/components/ui/button';

// Re-export so existing import sites that pulled `RecompileResult` from this
// module (Phase 2 plan 02-08 Task 3 contract) still resolve. The hook is the
// new source of truth; this module is the historical surface.
export type { RecompileResult } from '@/ui/hooks/useRecompile';

export interface RecompileButtonProps {
  /**
   * True while a recompile is running (POST /recompile open or SSE draining).
   * AppShell passes the value from its single useRecompile() instance.
   */
  readonly inFlight: boolean;
  /**
   * Click handler — AppShell passes the trigger() from its useRecompile()
   * instance. The button does not own the recompile logic anymore.
   */
  readonly onClick: () => void;
}

export default function RecompileButton({ inFlight, onClick }: Readonly<RecompileButtonProps>) {
  return (
    <Button
      variant="default"
      className="h-9 gap-2"
      onClick={onClick}
      disabled={inFlight}
      aria-label="Recompile vault"
    >
      {inFlight ? (
        <>
          <Loader2Icon className="size-4 animate-spin" />
          Compiling…
        </>
      ) : (
        <>
          <RefreshCwIcon className="size-4" />
          Recompile
        </>
      )}
    </Button>
  );
}
