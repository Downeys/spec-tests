import { describe, it, expect, vi } from "vitest";

import { runCompactConversation } from "./compaction.js";
import { setAnthropicClient } from "./anthropic.js";
import {
  appendMessage,
  getActiveConversation,
  getMessages
} from "../openbrain/conversations.js";

describe("runCompactConversation", () => {
  it("calls Haiku, replaces messages with one system_summary row, returns counts", async () => {
    const conv = await getActiveConversation();
    await appendMessage({
      conversationId: conv.id,
      role: "user",
      content: [{ type: "text", text: "u1" }],
      tokenCount: 3
    });
    await appendMessage({
      conversationId: conv.id,
      role: "assistant",
      content: [{ type: "text", text: "a1" }],
      tokenCount: 4
    });

    setAnthropicClient({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: "text", text: "we discussed pricing" }],
          usage: { input_tokens: 50, output_tokens: 12 }
        })
      }
    } as never);

    const result = await runCompactConversation(conv.id);
    expect(result.summary).toContain("pricing");
    expect(result.newTokenCount).toBeGreaterThan(0);

    const msgs = await getMessages(conv.id);
    expect(msgs.length).toBe(1);
    expect(msgs[0]!.role).toBe("system_summary");
  });

  it("rejects when conversation tokens exceed Haiku's window", async () => {
    const conv = await getActiveConversation();
    await appendMessage({
      conversationId: conv.id,
      role: "user",
      content: [{ type: "text", text: "x" }],
      tokenCount: 200_000
    });
    await expect(runCompactConversation(conv.id)).rejects.toThrow(
      /exceeds Haiku/i
    );
  });
});
