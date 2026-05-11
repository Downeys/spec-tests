export type MessageRole =
  | "user"
  | "assistant"
  | "tool_use"
  | "tool_result"
  | "system_summary";

export interface ContentBlock {
  type: "text" | "tool_use" | "tool_result";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
}

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: ContentBlock[];
  tokenCount: number | null;
  createdAt: string;
}

export interface RetrievedItem {
  kind: "claim" | "source" | "concept" | "tool";
  toolUseId: string;
  toolName: string;
  summary: string;
  raw: unknown;
  isError?: boolean;
}
