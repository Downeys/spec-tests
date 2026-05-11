import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AppError } from '../errors/AppError.js';

// Hoisted mock so the SDK is replaced before the module under test loads it.
const queryMock = vi.hoisted(() => vi.fn());
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: queryMock,
}));

async function loadClient() {
  return import('./claude.js');
}

describe('createClaudeClient', () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it('throws AppError when apiKey is empty', async () => {
    const { createClaudeClient } = await loadClient();
    expect(() => createClaudeClient({ apiKey: '' })).toThrow(AppError);
    expect(() => createClaudeClient({ apiKey: '   ' })).toThrow(AppError);
  });

  it('invoke passes prompt, model, systemPrompt, and safety options through', async () => {
    queryMock.mockReturnValue({
      [Symbol.asyncIterator]() {
        let emitted = false;
        return {
          next() {
            if (!emitted) {
              emitted = true;
              return Promise.resolve({ value: { type: 'result' }, done: false });
            }
            return Promise.resolve({ value: undefined, done: true });
          },
        };
      },
    });

    const { createClaudeClient } = await loadClient();
    const client = createClaudeClient({ apiKey: 'sk-test' });
    const ac = new AbortController();

    const iter = client.invoke({
      prompt: 'hello',
      systemPrompt: 'you are helpful',
      model: 'claude-opus-4-7',
      abortController: ac,
    });

    // Force the iterator to run once so we know query() was called
    for await (const _ of iter) break;

    expect(queryMock).toHaveBeenCalledTimes(1);
    const call = queryMock.mock.calls[0]?.[0] as { prompt: string; options: Record<string, unknown> };
    expect(call.prompt).toBe('hello');
    expect(call.options.model).toBe('claude-opus-4-7');
    expect(call.options.systemPrompt).toBe('you are helpful');
    expect(call.options.allowedTools).toEqual([]);
    expect(call.options.permissionMode).toBe('bypassPermissions');
    expect(call.options.allowDangerouslySkipPermissions).toBe(true);
    expect(call.options.includePartialMessages).toBe(true);
    expect(call.options.abortController).toBe(ac);
    expect(typeof call.options.cwd).toBe('string');
    const env = call.options.env as Record<string, string>;
    expect(env.ANTHROPIC_API_KEY).toBe('sk-test');
  });
});
