import { useEffect, useRef } from "react";
import { Message } from "./Message.js";
import { Composer } from "./Composer.js";
import type { Message as MsgType } from "../../types.js";
import type { TokenBudget } from "../../store.js";

export interface ChatPaneProps {
  messages: MsgType[];
  toolResults: Record<string, { result: unknown; durationMs: number; isError?: boolean }>;
  isStreaming: boolean;
  tokens: number;
  tokenBudget: TokenBudget;
  onSend: (text: string) => void;
}

export function ChatPane({
  messages,
  toolResults,
  isStreaming,
  tokens,
  tokenBudget,
  onSend
}: Readonly<ChatPaneProps>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth"
    });
  }, [messages]);

  const ratio = tokens / tokenBudget.budget;
  const showHardBanner = ratio >= tokenBudget.hardWarn;
  const pct = Math.round(tokenBudget.hardWarn * 100);

  return (
    <div className="flex flex-col h-full">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 flex flex-col">
        {messages.map((m) => (
          <Message key={m.id} message={m} toolResults={toolResults} />
        ))}
      </div>
      {showHardBanner && (
        <div className="px-3 py-2 bg-red-50 border-t border-red-200 text-red-800 text-sm">
          Approaching token budget ({pct}%) — Compact the conversation or start a new one.
        </div>
      )}
      <Composer onSend={onSend} disabled={isStreaming} />
    </div>
  );
}
