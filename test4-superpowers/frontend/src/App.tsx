import { useEffect, useMemo } from "react";
import { Header } from "./components/Header/Header.js";
import { ChatPane } from "./components/Chat/ChatPane.js";
import { ContextPanel } from "./components/Context/ContextPanel.js";
import { useAppStore } from "./store.js";
import {
  compactConversation,
  getChatState,
  newConversation,
  streamChat
} from "./lib/api.js";

interface ToolResultEntry {
  result: unknown;
  durationMs: number;
  isError?: boolean;
}

export default function App() {
  const state = useAppStore();
  const toolResults = useMemo<Record<string, ToolResultEntry>>(() => {
    const acc: Record<string, ToolResultEntry> = {};
    for (const r of state.retrievedThisTurn) {
      const entry: ToolResultEntry = {
        result: r.raw,
        durationMs: 0
      };
      if (r.isError !== undefined) entry.isError = r.isError;
      acc[r.toolUseId] = entry;
    }
    return acc;
  }, [state.retrievedThisTurn]);

  useEffect(() => {
    void (async () => {
      const s = await getChatState();
      state.setConversation(s.conversationId, s.messages, s.tokenCount, {
        budget: s.tokenBudget,
        softWarn: s.tokenSoftWarn,
        hardWarn: s.tokenHardWarn
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSend(text: string) {
    state.appendMessage({
      id: `local-${Date.now()}`,
      conversationId: state.conversationId ?? "",
      role: "user",
      content: [{ type: "text", text }],
      tokenCount: 0,
      createdAt: new Date().toISOString()
    });
    state.resetTurnRetrieval();
    state.setStreaming(true);

    try {
      for await (const ev of streamChat(text)) {
        if (ev.event === "text_delta") {
          const data = ev.data as { text: string };
          state.appendAssistantText(data.text);
        } else if (ev.event === "tool_use_start") {
          const data = ev.data as {
            toolUseId: string;
            name: string;
            input: Record<string, unknown>;
          };
          state.addRetrieval({
            kind: "tool",
            toolUseId: data.toolUseId,
            toolName: data.name,
            summary: `${data.name} called`,
            raw: data.input
          });
        } else if (ev.event === "tool_use_complete") {
          const data = ev.data as {
            toolUseId: string;
            result: unknown;
            durationMs: number;
            isError?: boolean;
          };
          state.addRetrieval({
            kind: "tool",
            toolUseId: data.toolUseId + "-result",
            toolName: "→ result",
            summary: data.isError === true ? "error" : "ok",
            raw: data.result,
            ...(data.isError !== undefined ? { isError: data.isError } : {})
          });
        } else if (ev.event === "message_complete") {
          const data = ev.data as { totalConversationTokens: number };
          state.setTokenCount(data.totalConversationTokens);
        } else if (ev.event === "error") {
          const data = ev.data as { message: string };
          alert(`Stream error: ${data.message}`);
        }
      }
    } finally {
      state.setStreaming(false);
      const s = await getChatState();
      state.setConversation(s.conversationId, s.messages, s.tokenCount, {
        budget: s.tokenBudget,
        softWarn: s.tokenSoftWarn,
        hardWarn: s.tokenHardWarn
      });
    }
  }

  async function onCompact() {
    try {
      await compactConversation();
    } catch (err) {
      alert(`Compact failed: ${(err as Error).message}`);
    }
    const s = await getChatState();
    state.setConversation(s.conversationId, s.messages, s.tokenCount, {
      budget: s.tokenBudget,
      softWarn: s.tokenSoftWarn,
      hardWarn: s.tokenHardWarn
    });
  }

  async function onNewConversation() {
    await newConversation();
    const s = await getChatState();
    state.setConversation(s.conversationId, s.messages, s.tokenCount, {
      budget: s.tokenBudget,
      softWarn: s.tokenSoftWarn,
      hardWarn: s.tokenHardWarn
    });
  }

  return (
    <div className="h-full flex flex-col bg-gray-100">
      <Header
        tokens={state.tokenCount}
        tokenBudget={state.tokenBudget}
        onCompact={onCompact}
        onNewConversation={onNewConversation}
      />
      <div className="flex-1 grid grid-cols-[1.4fr_1fr] min-h-0">
        <ChatPane
          messages={state.messages}
          toolResults={toolResults}
          isStreaming={state.isStreaming}
          tokens={state.tokenCount}
          tokenBudget={state.tokenBudget}
          onSend={onSend}
        />
        <ContextPanel retrieved={state.retrievedThisTurn} />
      </div>
    </div>
  );
}
