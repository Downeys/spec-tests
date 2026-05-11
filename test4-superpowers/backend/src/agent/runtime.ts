import { agentConfig } from "./config.js";
import { loadStaticPrompt } from "./prompt/loader.js";
import { formatOrientationMap } from "./prompt/orientation.js";
import { TOOL_DEFINITIONS } from "./tools/definitions.js";
import { dispatchTool } from "./tools/dispatch.js";
import { getAnthropicClient } from "./anthropic.js";
import { estimateTokens } from "./tokens.js";
import {
  appendMessage,
  getMessages,
  getConversationTokenUsage,
  type Message
} from "../openbrain/conversations.js";
import { getOrientationMap } from "../openbrain/orientation.js";

export type AgentEventType =
  | "text_delta"
  | "tool_use_start"
  | "tool_use_complete"
  | "message_complete"
  | "error";

export interface RunAgentTurnInput {
  conversationId: string;
  userMessage: string;
  onEvent: (type: AgentEventType, data: unknown) => void;
}

interface ContentBlock {
  type: "text" | "tool_use" | "tool_result";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
}

interface BlockWithRawJson extends ContentBlock {
  _rawJson?: string;
}

export async function runAgentTurn(input: RunAgentTurnInput): Promise<void> {
  const { conversationId, userMessage, onEvent } = input;

  await appendMessage({
    conversationId,
    role: "user",
    content: [{ type: "text", text: userMessage }],
    tokenCount: estimateTokens(userMessage)
  });

  const staticPrompt = await loadStaticPrompt();
  const orientation = await getOrientationMap();
  const orientationText = formatOrientationMap(orientation);

  let history = await getMessages(conversationId);
  const summary = history.find((m) => m.role === "system_summary");
  let systemPrompt = `${staticPrompt}\n\n${orientationText}`;
  if (summary) {
    const blocks = summary.content as ContentBlock[];
    const text = Array.isArray(blocks) && blocks[0]?.text ? blocks[0].text : "";
    systemPrompt = `${systemPrompt}\n\n<conversation_summary>\n${text}\n</conversation_summary>`;
  }

  let liveMessages = anthropicMessagesFromHistory(
    history.filter((m) => m.role !== "system_summary")
  );

  const client = getAnthropicClient();
  let safetyCounter = 0;

  while (safetyCounter++ < 12) {
    const stream = (await client.messages.create({
      model: agentConfig.primaryModel,
      max_tokens: 8192,
      system: systemPrompt,
      tools: TOOL_DEFINITIONS.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema
      })),
      messages: liveMessages,
      stream: true
    })) as AsyncIterable<unknown>;

    let stopReason: string | null = null;
    let usage: { input_tokens: number; output_tokens: number } | null = null;
    const finalBlocks: ContentBlock[] = [];
    const blockBuilders: Record<number, BlockWithRawJson> = {};

    for await (const ev of stream) {
      const e = ev as { type: string; [k: string]: unknown };
      if (e.type === "content_block_start") {
        const idx = e["index"] as number;
        const block = (e["content_block"] as ContentBlock) ?? { type: "text" as const };
        blockBuilders[idx] = { ...block };
        if (block.type === "tool_use") {
          onEvent("tool_use_start", {
            toolUseId: block.id,
            name: block.name,
            input: block.input ?? {}
          });
        }
      } else if (e.type === "content_block_delta") {
        const idx = e["index"] as number;
        const delta = e["delta"] as { type: string; text?: string; partial_json?: string };
        const block = blockBuilders[idx];
        if (!block) continue;
        if (delta.type === "text_delta" && delta.text) {
          block.text = (block.text ?? "") + delta.text;
          onEvent("text_delta", { text: delta.text });
        } else if (delta.type === "input_json_delta" && delta.partial_json) {
          block._rawJson = (block._rawJson ?? "") + delta.partial_json;
        }
      } else if (e.type === "content_block_stop") {
        const idx = e["index"] as number;
        const block = blockBuilders[idx];
        if (!block) continue;
        if (block.type === "tool_use") {
          const raw = block._rawJson;
          if (raw) {
            try {
              block.input = JSON.parse(raw) as Record<string, unknown>;
            } catch {
              block.input = {};
            }
          }
        }
        // Push a clean ContentBlock without _rawJson
        const { _rawJson: _discarded, ...cleanBlock } = block;
        finalBlocks.push(cleanBlock);
      } else if (e.type === "message_delta") {
        const delta = e["delta"] as { stop_reason?: string };
        if (delta.stop_reason) stopReason = delta.stop_reason;
        if (e["usage"]) usage = e["usage"] as { input_tokens: number; output_tokens: number };
      }
    }

    await appendMessage({
      conversationId,
      role: "assistant",
      content: finalBlocks,
      tokenCount: usage?.output_tokens ?? estimateTokens(
        finalBlocks.map((b) => b.text ?? "").join(" ")
      )
    });

    if (stopReason === "tool_use") {
      const toolResults: ContentBlock[] = [];
      for (const block of finalBlocks) {
        if (block.type !== "tool_use") continue;
        const start = Date.now();
        const result = await dispatchTool(block.name ?? "", block.input ?? {});
        const durationMs = Date.now() - start;
        const isError =
          typeof result === "object" &&
          result !== null &&
          (result as { isError?: boolean }).isError === true;
        onEvent("tool_use_complete", {
          toolUseId: block.id,
          result,
          durationMs,
          isError
        });
        const toolResultBlock: ContentBlock = {
          type: "tool_result",
          content: typeof result === "string" ? result : JSON.stringify(result),
          is_error: isError
        };
        if (block.id !== undefined) toolResultBlock.tool_use_id = block.id;
        toolResults.push(toolResultBlock);
      }
      await appendMessage({
        conversationId,
        role: "tool_result",
        content: toolResults,
        tokenCount: estimateTokens(JSON.stringify(toolResults))
      });

      history = await getMessages(conversationId);
      liveMessages = anthropicMessagesFromHistory(
        history.filter((m) => m.role !== "system_summary")
      );
      continue;
    }

    const total = await getConversationTokenUsage(conversationId);
    onEvent("message_complete", {
      tokenCount: usage?.output_tokens ?? 0,
      totalConversationTokens: total
    });
    return;
  }

  onEvent("error", { message: "Agent loop exceeded safety counter (12 turns)" });
}

function anthropicMessagesFromHistory(history: Message[]): unknown[] {
  return history
    .filter((m) => m.role !== "tool_use")
    .map((m) => {
      if (m.role === "tool_result") {
        return { role: "user", content: m.content };
      }
      return { role: m.role, content: m.content };
    });
}
