import { getAnthropicClient } from "./anthropic.js";
import { agentConfig } from "./config.js";
import {
  compactConversation,
  getMessages,
  getConversationTokenUsage
} from "../openbrain/conversations.js";

const HAIKU_INPUT_BUDGET = 180_000;

const COMPACT_SYSTEM_PROMPT = `Summarize the following conversation, preserving:
- decisions made
- open questions
- any context needed to continue productively

Output: a concise narrative under 800 tokens. Do not invent facts.`;

export interface CompactResult {
  summary: string;
  newTokenCount: number;
}

export async function runCompactConversation(
  conversationId: string
): Promise<CompactResult> {
  const tokenUsage = await getConversationTokenUsage(conversationId);
  if (tokenUsage > HAIKU_INPUT_BUDGET) {
    throw new Error(
      `Conversation tokens (${tokenUsage}) exceeds Haiku input budget (${HAIKU_INPUT_BUDGET}). Use 'New conversation' instead.`
    );
  }

  const messages = await getMessages(conversationId);
  const transcript = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => {
      const blocks = m.content as { type: string; text?: string }[] | undefined;
      const text = (blocks ?? [])
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join(" ");
      return `[${m.role.toUpperCase()}] ${text}`;
    })
    .join("\n\n");

  const client = getAnthropicClient();
  const resp = (await client.messages.create({
    model: agentConfig.compactorModel,
    max_tokens: 1200,
    system: COMPACT_SYSTEM_PROMPT,
    messages: [{ role: "user", content: transcript }]
  })) as {
    content: { type: string; text?: string }[];
    usage?: { output_tokens: number };
  };

  const summary =
    resp.content
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("") || "(empty summary)";

  const newTokenCount = resp.usage?.output_tokens ?? Math.ceil(summary.length / 4);

  await compactConversation({
    conversationId,
    summary,
    tokenCount: newTokenCount
  });

  return { summary, newTokenCount };
}
