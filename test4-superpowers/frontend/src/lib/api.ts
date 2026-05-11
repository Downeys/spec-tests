import { parseSseStream, type SseEvent } from "./sse.js";
import type { Message } from "../types.js";

export interface ChatStateResponse {
  conversationId: string;
  messages: Message[];
  tokenCount: number;
  tokenBudget: number;
  tokenSoftWarn: number;
  tokenHardWarn: number;
}

export async function getChatState(): Promise<ChatStateResponse> {
  const r = await fetch("/chat/state");
  if (!r.ok) throw new Error(`GET /chat/state ${r.status}`);
  return r.json();
}

export async function newConversation(): Promise<{ conversationId: string }> {
  const r = await fetch("/chat/new", { method: "POST" });
  if (!r.ok) throw new Error(`POST /chat/new ${r.status}`);
  return r.json();
}

export async function compactConversation(): Promise<{
  summary: string;
  newTokenCount: number;
}> {
  const r = await fetch("/chat/compact", { method: "POST" });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.error ?? `POST /chat/compact ${r.status}`);
  }
  return r.json();
}

export async function compileVault(): Promise<{
  runId: string;
  status: string;
  pagesWritten: number;
  pagesSkipped: number;
  durationMs: number;
}> {
  const r = await fetch("/vault/compile", { method: "POST" });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.error ?? `POST /vault/compile ${r.status}`);
  }
  return r.json();
}

export async function* streamChat(message: string): AsyncGenerator<SseEvent> {
  const r = await fetch("/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message })
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`POST /chat ${r.status}: ${text}`);
  }
  if (!r.body) throw new Error("POST /chat: no body");
  yield* parseSseStream(r.body);
}
