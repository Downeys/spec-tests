import { describe, it, expect } from "vitest";
import {
  getActiveConversation,
  appendMessage,
  getMessages,
  getConversationTokenUsage,
  newConversation,
  compactConversation
} from "./conversations.js";

describe("getActiveConversation", () => {
  it("creates a conversation if none exists, returns it idempotently", async () => {
    const c1 = await getActiveConversation();
    const c2 = await getActiveConversation();
    expect(c1.id).toBe(c2.id);
  });
});

describe("appendMessage + getMessages + token usage", () => {
  it("appends and retrieves messages in order", async () => {
    const conv = await getActiveConversation();
    await appendMessage({
      conversationId: conv.id,
      role: "user",
      content: [{ type: "text", text: "hi" }],
      tokenCount: 5
    });
    await appendMessage({
      conversationId: conv.id,
      role: "assistant",
      content: [{ type: "text", text: "hello" }],
      tokenCount: 7
    });

    const msgs = await getMessages(conv.id);
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant"]);

    const total = await getConversationTokenUsage(conv.id);
    expect(total).toBe(12);
  });
});

describe("newConversation", () => {
  it("deletes the prior conversation (CASCADE wipes messages) and creates a fresh one", async () => {
    const conv = await getActiveConversation();
    await appendMessage({
      conversationId: conv.id,
      role: "user",
      content: [{ type: "text", text: "x" }],
      tokenCount: 1
    });

    const fresh = await newConversation();
    expect(fresh.id).not.toBe(conv.id);

    const oldMsgs = await getMessages(conv.id);
    expect(oldMsgs).toEqual([]);
  });
});

describe("compactConversation", () => {
  it("replaces all prior messages with a single system_summary row", async () => {
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

    await compactConversation({
      conversationId: conv.id,
      summary: "we talked about pricing",
      tokenCount: 9
    });

    const msgs = await getMessages(conv.id);
    expect(msgs.length).toBe(1);
    expect(msgs[0]!.role).toBe("system_summary");
    expect(msgs[0]!.tokenCount).toBe(9);
  });

  it("replaces a prior system_summary too (Compact-of-Compact)", async () => {
    const conv = await getActiveConversation();
    await compactConversation({
      conversationId: conv.id,
      summary: "first",
      tokenCount: 3
    });
    await compactConversation({
      conversationId: conv.id,
      summary: "second",
      tokenCount: 5
    });
    const msgs = await getMessages(conv.id);
    expect(msgs.length).toBe(1);
    expect((msgs[0]!.content as { text: string }[])[0]!.text).toBe("second");
  });
});
