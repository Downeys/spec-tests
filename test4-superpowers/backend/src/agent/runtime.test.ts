import { describe, it, expect, vi, beforeEach } from "vitest";

import { runAgentTurn } from "./runtime.js";
import { setAnthropicClient } from "./anthropic.js";
import {
  appendMessage,
  getActiveConversation,
  getMessages
} from "../openbrain/conversations.js";
import { setEmbeddingProvider } from "../embeddings/index.js";

beforeEach(() => {
  setEmbeddingProvider({
    model: "fake",
    dimensions: 1024,
    embed: async (xs) => xs.map(() => new Array(1024).fill(0))
  });
});

function fakeStream(chunks: object[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const c of chunks) yield c;
    }
  };
}

describe("runAgentTurn", () => {
  it("forwards text deltas and persists the assistant message", async () => {
    setAnthropicClient({
      messages: {
        create: vi.fn().mockResolvedValue(
          fakeStream([
            { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
            { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hello" } },
            { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: " world" } },
            { type: "content_block_stop", index: 0 },
            { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { input_tokens: 12, output_tokens: 5 } },
            { type: "message_stop" }
          ])
        )
      }
    } as never);

    const conv = await getActiveConversation();
    const events: { type: string; data: unknown }[] = [];
    await runAgentTurn({
      conversationId: conv.id,
      userMessage: "hi",
      onEvent: (type, data) => events.push({ type, data })
    });

    expect(events.some((e) => e.type === "text_delta")).toBe(true);
    expect(events.some((e) => e.type === "message_complete")).toBe(true);

    const msgs = await getMessages(conv.id);
    expect(msgs.find((m) => m.role === "user")).toBeTruthy();
    expect(msgs.find((m) => m.role === "assistant")).toBeTruthy();
  });

  it("dispatches tool_use blocks and continues until end_turn", async () => {
    let call = 0;
    setAnthropicClient({
      messages: {
        create: vi.fn().mockImplementation(async () => {
          call++;
          if (call === 1) {
            return fakeStream([
              {
                type: "content_block_start",
                index: 0,
                content_block: {
                  type: "tool_use",
                  id: "tu_1",
                  name: "listTags",
                  input: {}
                }
              },
              { type: "content_block_stop", index: 0 },
              { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { input_tokens: 10, output_tokens: 4 } },
              { type: "message_stop" }
            ]);
          }
          return fakeStream([
            { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
            { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "done" } },
            { type: "content_block_stop", index: 0 },
            { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { input_tokens: 14, output_tokens: 2 } },
            { type: "message_stop" }
          ]);
        })
      }
    } as never);

    const conv = await getActiveConversation();
    const events: { type: string; data: unknown }[] = [];
    await runAgentTurn({
      conversationId: conv.id,
      userMessage: "what tags?",
      onEvent: (type, data) => events.push({ type, data })
    });

    expect(events.some((e) => e.type === "tool_use_start")).toBe(true);
    expect(events.some((e) => e.type === "tool_use_complete")).toBe(true);
    expect(call).toBe(2);
  });
});
