// src/ui/components/HeaderBar.tsx
// Phase 2 plan 02-07 Task 2 — UI-SPEC component #2.
// Sticky h-14 header: title (left) + RecompileStatus + RecompileButton (right).
// Preserves INFRA-05's <h1>Business Strategy Planner</h1> contract from Phase 1.
//
// 02-08 smoke-check follow-up (Bug A + C fix): HeaderBar is now a pure pass-
// through for the recompile UX. AppShell owns the single useRecompile()
// instance and threads `{ recompileInFlight, onRecompileClick }` through to
// RecompileButton, so the button's loading state reflects EITHER the click
// path or the /recompile slash-command path (since both flip the same state).

import RecompileButton from './RecompileButton.js';
import RecompileStatus from './RecompileStatus.js';

export interface HeaderBarProps {
  /**
   * True while a recompile is in flight. Forwarded straight to RecompileButton
   * so its visual loading state reflects both click-path and slash-command-path
   * recompiles equally.
   */
  readonly recompileInFlight: boolean;
  /**
   * Click handler for RecompileButton. AppShell wires this to the trigger()
   * from its single useRecompile() instance.
   */
  readonly onRecompileClick: () => void;
}

export default function HeaderBar({
  recompileInFlight,
  onRecompileClick,
}: Readonly<HeaderBarProps>) {
  return (
    <header className="sticky top-0 z-10 h-14 border-b border-border bg-muted px-6 flex items-center justify-between">
      <h1 className="text-2xl font-medium">Business Strategy Planner</h1>
      <div className="flex items-center gap-3">
        <RecompileStatus />
        <RecompileButton inFlight={recompileInFlight} onClick={onRecompileClick} />
      </div>
    </header>
  );
}
