import { describe, it, expect } from "vitest";
import { parseSseStream } from "./sse.js";

function streamFromString(s: string): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      c.enqueue(enc.encode(s));
      c.close();
    }
  });
}

describe("parseSseStream", () => {
  it("yields one event per double-newline frame", async () => {
    const stream = streamFromString(
      `event: text_delta\ndata: {"text":"hi"}\n\nevent: message_complete\ndata: {"tokenCount":5,"totalConversationTokens":12}\n\n`
    );
    const events: { event: string; data: unknown }[] = [];
    for await (const ev of parseSseStream(stream)) events.push(ev);
    expect(events.length).toBe(2);
    expect(events[0]?.event).toBe("text_delta");
    expect((events[0]?.data as { text: string }).text).toBe("hi");
  });

  it("handles split chunks across read boundaries", async () => {
    const enc = new TextEncoder();
    const stream = new ReadableStream({
      async start(c) {
        c.enqueue(enc.encode("event: text_delta\ndata: {\""));
        c.enqueue(enc.encode("text\":\"split\"}\n\n"));
        c.close();
      }
    });
    const events: { event: string; data: unknown }[] = [];
    for await (const ev of parseSseStream(stream)) events.push(ev);
    expect(events.length).toBe(1);
    expect((events[0]?.data as { text: string }).text).toBe("split");
  });
});
