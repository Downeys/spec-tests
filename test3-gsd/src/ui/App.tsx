// src/ui/App.tsx
// Phase 2 plan 02-07 — assistant-ui Thread + Composer + HeaderBar.
// Replaces Phase 1 placeholder per UI-SPEC component #1.
//
// The Phase 1 <h1>Business Strategy Planner</h1> moves into HeaderBar;
// INFRA-05's contract (the <h1> renders in the document) is preserved by
// HeaderBar continuing to ship that exact title.
//
// Relative imports use the `.js` suffix so the file resolves cleanly under
// NodeNext (per Phase 1 plan 01-03 convention) AND under Bundler (the
// `tsconfig.web.json` setting used by `npm run tsc:web` and Vite). Vite
// strips the suffix at bundle time.
//
// Plan 02-08 R-A fix (2026-04-26 smoke check) — D-18 wiring SWITCHED from
// useThreadRuntime().append() to an ephemeral RecompileBanner component.
//
//   ROOT CAUSE: assistant-ui's external-store runtime (the AI SDK adapter
//   we use via useChatRuntime) routes EVERY append() call through
//   chatHelpers.sendMessage, which fires a POST /chat. The CreateAppendMessage
//   `startRun: false` field is honored only by the LOCAL runtime — the
//   external-store runtime (external-store-thread-runtime-core.js:193-202)
//   ignores it and always calls onNew → POST /chat. Result: every recompile
//   completion triggered an empty POST /chat that returned 400.
//
//   FIX: render D-18 as ephemeral UI (RecompileBanner) BELOW HeaderBar.
//   Same verbatim text from formatRecompileSystemMessage(); auto-dismisses
//   after 8s; aria-live polite for screen readers. The chat thread runtime
//   is NOT touched. D-18's intent ("user knows recompile completed",
//   02-CONTEXT line 48) is preserved.
//
//   Why not "find a non-running append API"? There isn't one for the
//   external-store runtime — confirmed by reading the runtime sources cited
//   above. The closest API is `unstable_loadExternalState` which REPLACES
//   thread state (not additive). Defaulting to ephemeral UI is the cleanest
//   path that preserves D-18's user-visible contract.
//
// 02-08 smoke-check follow-up (Bug A + C fix):
//   AppShell now calls useRecompile() EXACTLY ONCE and threads
//   `{ inFlight, trigger }` down through HeaderBar -> RecompileButton (props)
//   AND into Thread.onRecompile. Previously RecompileButton called
//   useRecompile() internally — a separate hook instance from the one used
//   by the slash-command path — so:
//     (Bug A) typing /recompile triggered a real recompile but the button's
//             "Compiling…" loader never appeared.
//     (Bug C) clicking the button while a slash-triggered recompile was in
//             flight fired a SECOND POST /recompile because the button's
//             instance still had inFlight=false.
//   Lifting to a single instance fixes both: the same inFlight state drives
//   the button's visual AND short-circuits any second invocation regardless
//   of which path called it.
//
// Task 6 — D-09 inline citation chunk handler.
// `useClaimChunkHandler()` maintains an in-memory Map<ulid, ClaimSummary>
// populated as `data-claim-id` SSE chunks arrive (chunk shape per
// src/server/streaming.ts). The Map is exposed at the App-shell level so a
// future Thread message renderer can call `renderWithClaimChips(text, claims)`
// to swap `[[claim:<ULID-or-prefix>…]]` text tokens for <ClaimChip> elements.
//
// The actual subscription seam to assistant-ui's runtime chunk stream is
// pending — assistant-ui ~0.12.x exposes `useThreadStream`-style hooks and a
// custom data-* renderer surface via `useAssistantDataUI`/`makeAssistantDataUI`,
// but the exact wiring depends on the installed Thread renderer's component
// surface. The hook + helper are colocated here; a future polish round (or
// the user at the smoke-check checkpoint) can wire them to the live stream.
// The unit probe in tests/ui/claim-chip.spec.tsx validates the
// renderWithClaimChips contract independent of that wiring.

import { useCallback, useRef, useState, type ReactElement } from 'react';
import { AssistantRuntimeProvider } from '@assistant-ui/react';
import { useChatRuntime } from '@assistant-ui/react-ai-sdk';

import HeaderBar from './components/HeaderBar.js';
import RecompileBanner from './components/RecompileBanner.js';
import { Thread } from './components/assistant-ui/thread.js';
import {
  renderWithClaimChips,
  type ClaimSummary,
} from './components/ClaimChip.js';
import { transport } from './runtime.js';
import { useRecompile, type RecompileResult } from './hooks/useRecompile.js';

// AI SDK 6 native DataUIMessageChunk shape: { type, id?, data, transient? }
// (node_modules/ai/dist/index.d.ts:2151-2158). The chat route now emits `data`
// (not `value`); the chunk handler reads from that field.
interface ClaimIdChunk {
  type: 'data-claim-id';
  id?: string;
  data: { claimId: string; sourceTool: string };
}

interface UnknownChunk {
  type: string;
  id?: string;
  data?: { claimId?: string; sourceTool?: string };
}

type IncomingChunk = ClaimIdChunk | UnknownChunk;

export function useClaimChunkHandler() {
  const claimsRef = useRef<Map<string, ClaimSummary>>(new Map());
  const [, force] = useState(0);
  const onChunk = useCallback((chunk: IncomingChunk) => {
    if (chunk.type === 'data-claim-id' && chunk.data?.claimId) {
      claimsRef.current.set(chunk.data.claimId, { ulid: chunk.data.claimId });
      force((n) => n + 1);
    }
  }, []);
  return { claims: claimsRef.current, onChunk };
}

// Re-export so the future Thread-message renderer can swap
// `[[claim:<ULID>]]` tokens for ClaimChip elements without re-importing
// from the component module. Reading-grep target: `ClaimChip` in App.tsx.
export { renderWithClaimChips };

/**
 * Format the D-18 post-success system message verbatim per AI-SPEC + 02-CONTEXT D-18:
 *   `Recompiled: <n> page written, <s> skipped (run <run-ulid>).`
 *
 * Pure function — exported for unit-testability and so the slash-command path
 * and button-click path produce byte-identical text.
 */
export function formatRecompileSystemMessage(result: RecompileResult): string {
  return `Recompiled: ${result.pages_written} page written, ${result.pages_skipped} skipped (run ${result.run_id}).`;
}

/**
 * AppShell owns the single useRecompile() instance and the ephemeral
 * RecompileBanner state. The recompile-completed handler is shared between
 * RecompileButton.onCompleted (click path) and Thread.onRecompile ->
 * useRecompile.onCompleted (slash command path) so both produce the same
 * D-18 message text. The text is rendered by RecompileBanner — NOT pushed
 * through the assistant-ui chat runtime (R-A fix; see file header).
 */
function AppShell(): ReactElement {
  // Hook is wired but the chunk-stream subscription seam is pending; see
  // file header.
  useClaimChunkHandler();

  // Banner state. We store the message text (not just a boolean) so the
  // banner key (referential identity) changes on each recompile — the
  // useEffect inside RecompileBanner restarts the auto-dismiss timer when
  // the message reference changes, even if two consecutive recompiles
  // produce identical text.
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);

  const handleRecompileCompleted = useCallback(
    (result: RecompileResult) => {
      const text = formatRecompileSystemMessage(result);
      setBannerMessage(text);
    },
    [],
  );

  // SINGLE useRecompile() instance — its { inFlight, trigger } drives BOTH
  // the RecompileButton (via HeaderBar props) AND the slash-command path
  // (Thread.onRecompile). One source of truth means the button's loading
  // visual reflects whichever path triggered the recompile, and a second
  // concurrent invocation (button-then-slash or slash-then-button) is
  // short-circuited by the hook's idempotency guard regardless of source.
  const { inFlight: recompileInFlight, trigger: triggerRecompile } = useRecompile({
    onCompleted: handleRecompileCompleted,
  });

  // Stable click handler so RecompileButton's prop identity doesn't churn
  // every render (avoids unnecessary re-renders of the memoized child).
  const handleRecompileClick = useCallback(() => {
    triggerRecompile().catch((err) => {
      // useRecompile already logs internally; this is a safety belt for any
      // synchronous throw that escapes the hook (shouldn't happen).
      // eslint-disable-next-line no-console
      console.error('AppShell handleRecompileClick:', err);
    });
  }, [triggerRecompile]);

  return (
    <div className="flex h-screen flex-col items-stretch bg-background text-foreground">
      <HeaderBar
        recompileInFlight={recompileInFlight}
        onRecompileClick={handleRecompileClick}
      />
      <RecompileBanner message={bannerMessage} />
      <main className="flex-1 overflow-hidden">
        <div className="mx-auto h-full max-w-3xl">
          <Thread onRecompile={triggerRecompile} />
        </div>
      </main>
    </div>
  );
}

export default function App(): ReactElement {
  const runtime = useChatRuntime({ transport });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <AppShell />
    </AssistantRuntimeProvider>
  );
}
