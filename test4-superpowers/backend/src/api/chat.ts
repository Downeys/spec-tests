import type { FastifyInstance } from "fastify";
import { runAgentTurn } from "../agent/runtime.js";
import { getActiveConversation } from "../openbrain/conversations.js";
import { SseWriter } from "./sse.js";

const turnLocks = new Map<string, boolean>();
const MAX_MESSAGE_BYTES = 16_000;

export async function registerChatRoute(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { message: string } }>("/chat", async (req, reply) => {
    const message = req.body?.message;
    if (typeof message !== "string" || !message.trim()) {
      reply.code(400);
      return { error: "message must be a non-empty string" };
    }
    if (Buffer.byteLength(message, "utf8") > MAX_MESSAGE_BYTES) {
      reply.code(413);
      return { error: `message exceeds ${MAX_MESSAGE_BYTES} byte limit` };
    }

    const conv = await getActiveConversation();
    if (turnLocks.get(conv.id)) {
      reply.code(409);
      return { error: "another turn is already in progress on this conversation" };
    }
    turnLocks.set(conv.id, true);

    const sse = new SseWriter(reply);
    try {
      await runAgentTurn({
        conversationId: conv.id,
        userMessage: message,
        onEvent: (type, data) => sse.write(type, data)
      });
    } catch (err) {
      sse.write("error", { message: (err as Error).message });
    } finally {
      turnLocks.delete(conv.id);
      sse.end();
    }

    return reply;
  });
}
