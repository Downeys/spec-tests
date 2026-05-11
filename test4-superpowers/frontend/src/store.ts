import { create } from "zustand";
import type { Message, RetrievedItem } from "./types.js";

export interface TokenBudget {
  budget: number;
  softWarn: number;
  hardWarn: number;
}

const DEFAULT_BUDGET: TokenBudget = {
  budget: 400_000,
  softWarn: 0.75,
  hardWarn: 0.9
};

export interface AppState {
  conversationId: string | null;
  messages: Message[];
  tokenCount: number;
  tokenBudget: TokenBudget;
  retrievedThisTurn: RetrievedItem[];
  isStreaming: boolean;

  setConversation: (
    id: string,
    messages: Message[],
    tokenCount: number,
    tokenBudget?: TokenBudget
  ) => void;
  appendMessage: (m: Message) => void;
  appendAssistantText: (text: string) => void;
  resetTurnRetrieval: () => void;
  addRetrieval: (r: RetrievedItem) => void;
  setStreaming: (s: boolean) => void;
  setTokenCount: (n: number) => void;
  reset: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  conversationId: null,
  messages: [],
  tokenCount: 0,
  tokenBudget: DEFAULT_BUDGET,
  retrievedThisTurn: [],
  isStreaming: false,

  setConversation: (id, messages, tokenCount, tokenBudget) =>
    set((s) => ({
      conversationId: id,
      messages,
      tokenCount,
      tokenBudget: tokenBudget ?? s.tokenBudget,
      retrievedThisTurn: []
    })),

  appendMessage: (m) =>
    set((s) => ({ messages: [...s.messages, m] })),

  appendAssistantText: (text) =>
    set((s) => {
      const last = s.messages[s.messages.length - 1];
      if (last && last.role === "assistant") {
        const blocks = [...last.content];
        const tail = blocks[blocks.length - 1];
        if (tail && tail.type === "text") {
          blocks[blocks.length - 1] = { ...tail, text: (tail.text ?? "") + text };
        } else {
          blocks.push({ type: "text", text });
        }
        const updated: Message = { ...last, content: blocks };
        return { messages: [...s.messages.slice(0, -1), updated] };
      }
      const placeholder: Message = {
        id: `pending-${Date.now()}`,
        conversationId: s.conversationId ?? "",
        role: "assistant",
        content: [{ type: "text", text }],
        tokenCount: 0,
        createdAt: new Date().toISOString()
      };
      return { messages: [...s.messages, placeholder] };
    }),

  resetTurnRetrieval: () => set({ retrievedThisTurn: [] }),
  addRetrieval: (r) =>
    set((s) => ({ retrievedThisTurn: [...s.retrievedThisTurn, r] })),

  setStreaming: (s) => set({ isStreaming: s }),
  setTokenCount: (n) => set({ tokenCount: n }),

  reset: () =>
    set({
      conversationId: null,
      messages: [],
      tokenCount: 0,
      tokenBudget: DEFAULT_BUDGET,
      retrievedThisTurn: [],
      isStreaming: false
    })
}));
