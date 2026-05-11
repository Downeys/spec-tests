// src/ui/runtime.ts
// Phase 2 plan 02-07 Task 1 — assistant-ui transport configuration.
//
// Points the AssistantChatTransport at the Hono /chat SSE endpoint via the
// Vite dev proxy (/chat → http://127.0.0.1:3000/chat per plan 02-01 Task 2).
// In production-style `bsp serve` the UI is served same-origin from Hono,
// so /chat resolves directly without a proxy hop.
//
// AssistantChatTransport extends ai-sdk's DefaultChatTransport, which stores
// the endpoint URL on the public `api` field — confirmed by inspecting
// node_modules/ai/dist/index.d.ts:`api?: string` on the base class.

import { AssistantChatTransport } from '@assistant-ui/react-ai-sdk';

export const transport = new AssistantChatTransport({
  api: '/chat',
});
