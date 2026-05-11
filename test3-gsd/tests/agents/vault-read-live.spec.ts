// tests/agents/vault-read-live.spec.ts
// Live-only smoke test: drives runCoordinatorTurn with a vault-quote question
// and verifies that (1) the coordinator successfully invokes mcp__vault__vault_read
// (Bug B fix — vault_read added to allowedTools) AND (2) the SDK actually
// executes the tool call instead of silently rejecting it on the missing
// permission prompt (Bug A fix — permissionMode: bypassPermissions).
//
// Default mode (RUN_AGENT_TESTS unset): a placeholder it() case so vitest
// reports the file. The full live test runs only when RUN_AGENT_TESTS=1, which
// keeps `npm test` quick and offline. Mirrors the gating pattern in
// pushback-substance.spec.ts.
//
// Pre-fix evidence (from the 02-08 smoke check):
//   When the user typed "what does the vault say about strategic positioning?"
//   in the chat UI, the coordinator's response was: "I have no visibility into
//   either side of the hybrid in this session — vault is excluded by design,
//   OneBrain isn't wired in." But OneBrain IS wired AND vault_read IS now in
//   the coordinator's allowedTools — the model was concluding "no tools" because
//   every tool call hit the SDK's interactive permission gate (which has no
//   prompter in a server context) and was silently rejected.

import { describe, it, expect } from 'vitest';

const RUN_LIVE = process.env.RUN_AGENT_TESTS === '1';

if (RUN_LIVE) {
  describe('Bug A + Bug B (LIVE — RUN_AGENT_TESTS=1)', () => {
    it('coordinator invokes mcp__vault__vault_read for a vault-quote question and the SDK executes it (does not silently reject on permission)', async () => {
      const { runCoordinatorTurn } = await import('@/agents/coordinator');
      const userMsg =
        'What does our compiled vault say about strategic positioning? Quote it briefly.';

      // Track tool-use names + tool-result content. Bug A's failure mode is
      // that NO tool calls execute at all (permission gate silently rejects
      // every call); Bug B's failure mode is that vault_read isn't in the
      // allowedTools so the SDK never surfaces it to the model.
      const toolUses: string[] = [];
      let sawVaultReadResult = false;
      let replyText = '';

      for await (const ev of runCoordinatorTurn(userMsg)) {
        const evAny = ev as {
          type?: string;
          message?: { content?: Array<Record<string, unknown>> };
          text?: unknown;
        };
        // SDK 'assistant' events carry tool_use blocks
        if (evAny.type === 'assistant' && Array.isArray(evAny.message?.content)) {
          for (const block of evAny.message.content) {
            if (block.type === 'tool_use' && typeof block.name === 'string') {
              toolUses.push(block.name);
            }
            if (block.type === 'text' && typeof block.text === 'string') {
              replyText += block.text;
            }
          }
        }
        // SDK 'user' events carry tool_result blocks (the result of a tool_use)
        if (evAny.type === 'user' && Array.isArray(evAny.message?.content)) {
          for (const block of evAny.message.content) {
            if (block.type === 'tool_result') {
              const content = JSON.stringify(block.content ?? '');
              // The vault_read tool emits { relativePath, content } JSON in
              // its result. Look for the path or any phrase from the actual
              // strategic-positioning.md page.
              if (
                content.includes('strategic-positioning') ||
                content.includes('Strategic Positioning') ||
                content.includes('operational effectiveness') ||
                content.includes('relativePath')
              ) {
                sawVaultReadResult = true;
              }
            }
          }
        }
        // Older event shape (text-delta) — accumulate text so we can also
        // assert "no refusal" on the model's reply.
        if (evAny.type === 'text-delta' && typeof evAny.text === 'string') {
          replyText += evAny.text;
        }
      }

      // Primary assertion: vault_read must have been invoked. If toolUses is
      // empty entirely, that's Bug A (permission gate rejecting). If toolUses
      // is non-empty but doesn't include vault_read, that's a coordinator
      // wiring issue (the model might have called onebrain_search instead).
      const sawVaultReadCall = toolUses.some(
        (name) => name === 'vault_read' || name.endsWith('__vault_read'),
      );
      expect(
        toolUses.length,
        `Bug A regression suspected — no tool calls executed at all. ` +
          `Likely permissionMode reverted to 'default' and SDK is silently ` +
          `rejecting tool calls in the server context. Reply: ${replyText.slice(0, 300)}`,
      ).toBeGreaterThan(0);

      expect(
        sawVaultReadCall,
        `Bug B regression suspected — coordinator did NOT invoke vault_read ` +
          `for a vault-quote question. Tools called: ${JSON.stringify(toolUses)}. ` +
          `Reply: ${replyText.slice(0, 300)}`,
      ).toBe(true);

      // Secondary assertion: the tool actually executed and returned vault
      // content (not a permission-denied error or empty result).
      expect(
        sawVaultReadResult,
        `vault_read was invoked but did not return recognizable vault content. ` +
          `Reply: ${replyText.slice(0, 300)}`,
      ).toBe(true);

      // Tertiary assertion: the reply must NOT contain the pre-fix refusal
      // pattern. If the coordinator says "I have no visibility" or "not wired"
      // despite having tools available, something's still broken.
      const refusalPattern =
        /no visibility|not wired|excluded by design|isn['’]t wired/i;
      expect(
        refusalPattern.test(replyText),
        `Coordinator emitted the pre-fix refusal pattern despite tools being ` +
          `available: ${replyText.slice(0, 300)}`,
      ).toBe(false);
    }, 180000);
  });
} else {
  describe('Bug A + Bug B vault_read live test (skipped — RUN_AGENT_TESTS=1 to enable)', () => {
    it('placeholder: gated test ran or skipped explicitly', () => {
      expect(true).toBe(true);
    });
  });
}
