// src/ui/components/Composer.tsx
// Phase 2 plan 02-08 — slash-command-aware Composer wrapper (D-15 + IC-5).
//
// Wraps assistant-ui's ComposerPrimitive.Root (which is a `<form>` per
// node_modules/@assistant-ui/react/dist/primitives/composer/ComposerRoot.d.ts).
// Intercepts the form submit BEFORE assistant-ui dispatches to /chat.
//
// The intercept rule (per UI-SPEC §IC-5):
//   - Only fires when the input's first non-whitespace token is exactly
//     `/recompile` (with optional trailing whitespace, no further args).
//   - When fired: prevents default submit, calls onRecompile(), clears the
//     input via the textarea's `value` setter (works because ComposerPrimitive
//     .Input is a controlled <textarea>).
//   - Other input (regular chat messages, or any `/foo` other than `/recompile`)
//     passes through unchanged — assistant-ui handles normal submit.
//
// The wrapper does NOT replace the visual scaffold from
// src/ui/components/assistant-ui/thread.tsx — Thread renders its own Composer
// internally. This wrapper exists to be unit-tested in isolation; the full
// integration into Thread is documented as a follow-up in the SUMMARY (the
// minimal change to Thread is to swap its inline ComposerPrimitive.Root for
// this wrapper). For Wave 0 the standalone testability is what closes the
// COMP-11 composer-half VALIDATION row.

import { type FC, type FormEvent, type ReactNode } from 'react';
import { ComposerPrimitive } from '@assistant-ui/react';

export interface ComposerProps {
  /**
   * Called when the user submits `/recompile` (with optional trailing
   * whitespace). App.tsx wires this to the same handler RecompileButton uses,
   * so the slash command and button click are indistinguishable end-to-end.
   */
  onRecompile?: () => void | Promise<void>;
  /** Optional children — falls back to a default Input + Send if omitted. */
  children?: ReactNode;
  /** Optional className passthrough to the underlying form. */
  className?: string;
}

const SLASH_RECOMPILE_RE = /^\s*\/recompile\s*$/;

/**
 * Returns true if `text` is exactly `/recompile` with optional surrounding
 * whitespace. Per IC-5, only this exact form (no further args) is intercepted;
 * any `/recompile <something>` falls through to normal chat submission.
 */
export function isRecompileSlash(text: string): boolean {
  return SLASH_RECOMPILE_RE.test(text);
}

const Composer: FC<ComposerProps> = ({ onRecompile, children, className }) => {
  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    // Find the first textarea (ComposerPrimitive.Input is a <textarea>).
    const form = e.currentTarget;
    const textarea = form.querySelector('textarea');
    const value = textarea?.value ?? '';

    if (isRecompileSlash(value)) {
      // Intercept: prevent assistant-ui's default submit (which would POST
      // to /chat). The /recompile route is hit via onRecompile() instead.
      e.preventDefault();
      e.stopPropagation();
      // Clear the textarea so the slash command doesn't linger after firing.
      if (textarea) {
        // Use the native value setter so React's onChange listener fires and
        // assistant-ui's controlled state stays in sync.
        const nativeValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype,
          'value',
        )?.set;
        if (nativeValueSetter) {
          nativeValueSetter.call(textarea, '');
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          textarea.value = '';
        }
      }
      // Fire the recompile callback (fire-and-forget — RecompileButton owns
      // the in-flight UX; the composer doesn't block on the SSE stream).
      void Promise.resolve(onRecompile?.());
      return;
    }

    // Pass through to assistant-ui's normal submit handling.
  };

  return (
    <ComposerPrimitive.Root onSubmit={handleSubmit} className={className}>
      {children ?? (
        <>
          <ComposerPrimitive.Input
            rows={1}
            autoFocus
            placeholder="Send a message..."
            className="placeholder:text-muted-foreground max-h-40 flex-grow resize-none border-none bg-transparent px-2 py-4 text-sm outline-none focus:ring-0 disabled:cursor-not-allowed"
          />
          <ComposerPrimitive.Send aria-label="Send message" />
        </>
      )}
    </ComposerPrimitive.Root>
  );
};

export default Composer;
