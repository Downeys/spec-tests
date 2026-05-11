import { describe, it, expect, vi } from "vitest";

import { buildServer } from "./server.js";
import { setAnthropicClient } from "../agent/anthropic.js";
import { setEmbeddingProvider } from "../embeddings/index.js";

function fakeStream(chunks: object[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const c of chunks) yield c;
    }
  };
}

describe("POST /chat (SSE)", () => {
  it("streams text_delta and message_complete events", async () => {
    setEmbeddingProvider({
      model: "fake",
      dimensions: 1024,
      embed: async (xs) => xs.map(() => new Array(1024).fill(0))
    });
    setAnthropicClient({
      messages: {
        create: vi.fn().mockResolvedValue(
          fakeStream([
            { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
            { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "ok" } },
            { type: "content_block_stop", index: 0 },
            { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { input_tokens: 5, output_tokens: 1 } },
            { type: "message_stop" }
          ])
        )
      }
    } as never);

    const app = await buildServer();
    const resp = await app.inject({
      method: "POST",
      url: "/chat",
      payload: { message: "hi" }
    });
    expect(resp.statusCode).toBe(200);
    expect(resp.headers["content-type"]).toContain("text/event-stream");
    expect(resp.body).toContain("event: text_delta");
    expect(resp.body).toContain("event: message_complete");
    await app.close();
  });
});
