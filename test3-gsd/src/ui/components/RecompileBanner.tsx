// src/ui/components/RecompileBanner.tsx
// Phase 2 plan 02-08 R-A fix (2026-04-26 smoke check) — D-18 post-success
// notification rendered as ephemeral UI, NOT through the assistant-ui chat
// runtime.
//
// WHY NOT ThreadRuntime.append?
//   The previous implementation called useThreadRuntime().append({ role:
//   'system', content: [...] }). In the external-store runtime that the AI
//   SDK adapter installs (node_modules/@assistant-ui/core/dist/runtimes/
//   external-store/external-store-thread-runtime-core.js:193-202), append()
//   ALWAYS routes to the store's onNew/onEdit handlers — the AI-SDK handler
//   (node_modules/@assistant-ui/react-ai-sdk/dist/ui/use-chat/useAISDKRuntime.js
//   :133-139) calls chatHelpers.sendMessage, which fires POST /chat. The
//   `startRun: false` field exists on CreateAppendMessage but is honored only
//   by the LOCAL runtime (local-thread-runtime-core.js:139); the external
//   store runtime ignores it entirely. There is no public assistant-ui API
//   to inject a message without triggering a turn.
//
//   Live evidence (user smoke test 2026-04-26): "When the Recompile call
//   finishes, it triggers a POST to the chat endpoint, but that returns with
//   a 400 code." (chat route's extractUserMessage correctly returns empty
//   because there is no user message — but the POST should never have fired.)
//
// D-18 INTENT — preserved verbatim:
//   "Drop one line in chat: `Recompiled: 1 page written, 0 skipped (run
//   01J9X…).` Status pill flips back to `Last compiled: now`." (02-CONTEXT
//   line 48; 02-UI-SPEC line 132). The banner satisfies the user-visible
//   contract — same exact text from formatRecompileSystemMessage(), rendered
//   in the chat surface area, automatically dismissed after 8s — without
//   ever touching the assistant-ui runtime.
//
// Accessibility: aria-live="polite" so screen readers announce the message
// when it appears (mirrors RecompileStatus's semantics).

import { useEffect, useState, type ReactElement } from 'react';
import { CheckCircle2Icon } from 'lucide-react';

export interface RecompileBannerProps {
  /**
   * Verbatim D-18 message text from formatRecompileSystemMessage(). When this
   * value changes (referentially), the banner appears for AUTO_DISMISS_MS
   * before fading out.
   */
  readonly message: string | null;
}

const AUTO_DISMISS_MS = 8_000;

export default function RecompileBanner({
  message,
}: Readonly<RecompileBannerProps>): ReactElement | null {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!message) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const handle = setTimeout(() => setVisible(false), AUTO_DISMISS_MS);
    return () => clearTimeout(handle);
  }, [message]);

  if (!visible || !message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="recompile-banner"
      className="mx-auto max-w-3xl px-4"
    >
      <div className="my-2 flex items-center gap-2 rounded-md border border-border bg-muted/60 px-4 py-2 text-sm text-muted-foreground">
        <CheckCircle2Icon className="size-4 shrink-0 text-green-600" />
        <span>{message}</span>
      </div>
    </div>
  );
}
