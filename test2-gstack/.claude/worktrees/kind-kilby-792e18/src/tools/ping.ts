// Smoke test tool. Lets the Phase 1 Windows smoke gate verify that
// (a) the server starts, (b) the MCP stdio handshake completes, and
// (c) the factory wraps a handler correctly — without needing the DB.

import { z } from 'zod';
import { defineTool } from '../lib/define-tool.js';

export const ping = defineTool({
  name: 'ping',
  description:
    'Smoke test. Returns "pong" with an echo of the input message. ' +
    'Used by the Phase 1 acceptance gate to verify MCP transport on Windows.',
  inputShape: {
    message: z.string().min(1).max(200).optional(),
  },
  handler: async (input) => {
    return {
      reply: 'pong',
      echo: input.message ?? '(no message)',
      ts: new Date().toISOString(),
    };
  },
});
