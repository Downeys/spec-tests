import type { FastifyInstance } from "fastify";
import {
  getActiveConversation,
  getMessages,
  getConversationTokenUsage,
  newConversation
} from "../openbrain/conversations.js";
import { agentConfig } from "../agent/config.js";

export async function registerLifecycleRoutes(app: FastifyInstance): Promise<void> {
  app.get("/chat/state", async () => {
    const conv = await getActiveConversation();
    const [messages, tokenCount] = await Promise.all([
      getMessages(conv.id),
      getConversationTokenUsage(conv.id)
    ]);
    return {
      conversationId: conv.id,
      messages,
      tokenCount,
      tokenBudget: agentConfig.tokenBudget,
      tokenSoftWarn: agentConfig.tokenSoftWarn,
      tokenHardWarn: agentConfig.tokenHardWarn
    };
  });

  app.post("/chat/new", async () => {
    const conv = await newConversation();
    return { conversationId: conv.id };
  });

  app.post("/chat/compact", async (_req, reply) => {
    const { runCompactConversation } = await import("../agent/compaction.js");
    const conv = await getActiveConversation();
    try {
      const result = await runCompactConversation(conv.id);
      return result;
    } catch (err) {
      reply.code(422);
      return { error: (err as Error).message };
    }
  });
}
