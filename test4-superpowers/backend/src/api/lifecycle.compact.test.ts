import { describe, it, expect, vi } from "vitest";

import { buildServer } from "./server.js";
import { setAnthropicClient } from "../agent/anthropic.js";
import { appendMessage, getActiveConversation } from "../openbrain/conversations.js";

describe("POST /chat/compact", () => {
  it("returns the compaction summary on success", async () => {
    const conv = await getActiveConversation();
    await appendMessage({
      conversationId: conv.id,
      role: "user",
      content: [{ type: "text", text: "hi" }],
      tokenCount: 2
    });
    setAnthropicClient({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: "text", text: "we said hi" }],
          usage: { output_tokens: 4 }
        })
      }
    } as never);

    const app = await buildServer();
    const resp = await app.inject({ method: "POST", url: "/chat/compact" });
    expect(resp.statusCode).toBe(200);
    expect(resp.json().summary).toContain("hi");
    await app.close();
  });

  it("returns 422 when conversation exceeds Haiku budget", async () => {
    const conv = await getActiveConversation();
    await appendMessage({
      conversationId: conv.id,
      role: "user",
      content: [{ type: "text", text: "x" }],
      tokenCount: 200_000
    });
    const app = await buildServer();
    const resp = await app.inject({ method: "POST", url: "/chat/compact" });
    expect(resp.statusCode).toBe(422);
    await app.close();
  });
});
