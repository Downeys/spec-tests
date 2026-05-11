import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { remarkCitations } from "../../lib/citations.js";
import type { Message as MsgType, ContentBlock } from "../../types.js";
import { ToolCallDisclosure } from "./ToolCallDisclosure.js";

export interface MessageProps {
  message: MsgType;
  toolResults?: Record<string, { result: unknown; durationMs: number; isError?: boolean }>;
}

export function Message({ message, toolResults = {} }: MessageProps) {
  const isUser = message.role === "user";
  const isSystemSummary = message.role === "system_summary";

  if (isSystemSummary) {
    const text = (message.content[0] as ContentBlock | undefined)?.text ?? "";
    return (
      <details className="my-2 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded text-sm">
        <summary className="cursor-pointer text-yellow-800">
          Conversation summarized — click to expand
        </summary>
        <p className="mt-2 text-gray-700 whitespace-pre-wrap">{text}</p>
      </details>
    );
  }

  return (
    <div
      className={`my-2 max-w-[85%] px-3 py-2 rounded ${
        isUser
          ? "self-end bg-blue-50 border border-blue-100"
          : "self-start bg-white border border-gray-200"
      }`}
    >
      {message.content.map((block, i) => {
        if (block.type === "text") {
          return (
            <div key={i} className="prose prose-sm max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkCitations]}>
                {block.text ?? ""}
              </ReactMarkdown>
            </div>
          );
        }
        if (block.type === "tool_use") {
          const id = block.id ?? `tu_${i}`;
          const tr = toolResults[id];
          const props: { name: string; input: Record<string, unknown>; result?: unknown; durationMs?: number; isError?: boolean } = {
            name: block.name ?? "unknown",
            input: block.input ?? {}
          };
          if (tr) {
            props.result = tr.result;
            props.durationMs = tr.durationMs;
            if (tr.isError !== undefined) props.isError = tr.isError;
          }
          return <ToolCallDisclosure key={id} {...props} />;
        }
        return null;
      })}
    </div>
  );
}
