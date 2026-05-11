// src/ui/components/assistant-ui/thread.tsx
// Phase 2 plan 02-07 — assistant-ui Thread + Composer composition.
//
// Reproduced manually because the assistant-ui init CLI was unavailable
// at execution time (sandbox blocked node invocations); the structure
// follows the assistant-ui ai-sdk-quick-start template
// (https://r.assistant-ui.com/chat/b/ai-sdk-quick-start/json).
//
// Design contract: UI-SPEC §"Component Inventory" #1 (App shell), IC-1
// (streaming), IC-3 (tool-trace expand/collapse hooks come later via
// the per-message tool-event store), IC-6 (empty-state copywriting).
//
// Plan 02-08 post-task-5 follow-up: ChatComposer (the inline composer for
// this Thread) now delegates to the slash-command-aware Composer wrapper
// from src/ui/components/Composer.tsx, which intercepts `/recompile` per
// IC-5 BEFORE assistant-ui's transport.send dispatches to /chat. The
// onRecompile callback is plumbed through from App.tsx via Thread props.

import { type FC } from 'react';
import {
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
} from '@assistant-ui/react';
import { ArrowUpIcon } from 'lucide-react';

import { Button } from '@/ui/components/ui/button';
import { cn } from '@/ui/lib/utils';
import Composer from '@/ui/components/Composer';

export interface ThreadProps {
  /**
   * Invoked when the user submits the `/recompile` slash command in the
   * composer. App.tsx wires this to the same useRecompile().trigger that
   * RecompileButton uses, so the slash command and button click are
   * indistinguishable end-to-end.
   */
  onRecompile?: () => void | Promise<void>;
}

export const Thread: FC<ThreadProps> = ({ onRecompile }) => {
  return (
    <ThreadPrimitive.Root
      className="flex h-full flex-col bg-background text-foreground"
      style={{ ['--thread-max-width' as string]: '48rem' }}
    >
      <ThreadPrimitive.Viewport className="flex h-full flex-col items-center overflow-y-scroll scroll-smooth bg-inherit px-4 pt-8">
        <ThreadEmpty />

        <ThreadPrimitive.Messages
          components={{
            UserMessage,
            AssistantMessage,
          }}
        />

        <div className="min-h-8 flex-grow" />

        <ThreadPrimitive.ViewportFooter className="sticky bottom-0 mt-3 flex w-full max-w-[var(--thread-max-width)] flex-col items-center justify-end rounded-t-lg bg-inherit pb-4">
          <ChatComposer onRecompile={onRecompile} />
        </ThreadPrimitive.ViewportFooter>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
};

const ThreadEmpty: FC = () => {
  return (
    <ThreadPrimitive.Empty>
      <div className="flex w-full max-w-[var(--thread-max-width)] flex-grow flex-col items-center justify-center px-8 py-16 gap-6">
        <p className="text-lg font-medium">Start a research conversation</p>
        <p className="text-sm text-muted-foreground max-w-md text-center">
          Ask about your market, your competition, or paste a source. Every claim lands in OneBrain before the wiki updates — recompile when you&apos;re ready.
        </p>
      </div>
    </ThreadPrimitive.Empty>
  );
};

interface ChatComposerProps {
  onRecompile?: () => void | Promise<void>;
}

const ChatComposer: FC<ChatComposerProps> = ({ onRecompile }) => {
  // Delegate the form/submit + slash-command interception to the Composer
  // wrapper. We pass children explicitly so the visual scaffold (Input +
  // ComposerAction) stays identical to the pre-wrapper inline form.
  return (
    <Composer
      onRecompile={onRecompile}
      className="focus-within:border-ring/20 flex w-full flex-wrap items-end rounded-lg border bg-inherit px-2.5 shadow-sm transition-colors ease-in"
    >
      <ComposerPrimitive.Input
        rows={1}
        autoFocus
        placeholder="Send a message..."
        className="placeholder:text-muted-foreground max-h-40 flex-grow resize-none border-none bg-transparent px-2 py-4 text-sm outline-none focus:ring-0 disabled:cursor-not-allowed"
      />
      <ComposerAction />
    </Composer>
  );
};

const ComposerAction: FC = () => {
  return (
    <>
      <ThreadPrimitive.If running={false}>
        <ComposerPrimitive.Send asChild>
          <Button
            type="submit"
            variant="default"
            size="icon"
            aria-label="Send message"
            className="my-2.5 size-8 p-2 transition-opacity ease-in disabled:opacity-30"
          >
            <ArrowUpIcon className="size-4" />
          </Button>
        </ComposerPrimitive.Send>
      </ThreadPrimitive.If>
      <ThreadPrimitive.If running>
        <ComposerPrimitive.Cancel asChild>
          <Button
            type="button"
            variant="default"
            size="icon"
            aria-label="Cancel"
            className="my-2.5 size-8 p-2"
          >
            <span className="size-3 bg-primary-foreground" />
          </Button>
        </ComposerPrimitive.Cancel>
      </ThreadPrimitive.If>
    </>
  );
};

const UserMessage: FC = () => {
  return (
    <MessagePrimitive.Root className="grid w-full max-w-[var(--thread-max-width)] auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] gap-y-2 py-4">
      <div
        className={cn(
          'col-start-2 row-start-2 max-w-[calc(var(--thread-max-width)*0.8)] break-words rounded-3xl bg-muted px-5 py-2.5 text-foreground',
        )}
      >
        <MessagePrimitive.Parts />
      </div>
    </MessagePrimitive.Root>
  );
};

const AssistantMessage: FC = () => {
  return (
    <MessagePrimitive.Root className="relative grid w-full max-w-[var(--thread-max-width)] grid-cols-[auto_auto_1fr] grid-rows-[auto_1fr] py-4">
      <div className="text-foreground col-span-2 col-start-2 row-start-1 my-1.5 max-w-[calc(var(--thread-max-width)*0.8)] break-words leading-7">
        <MessagePrimitive.Parts />
      </div>
    </MessagePrimitive.Root>
  );
};
