// Unit test for the defineTool factory. No DB. Verifies:
//   - Valid input -> ok result
//   - Invalid input (Zod) -> INVALID_INPUT envelope, not a thrown error
//   - Handler throw of ToolError -> respects the category
//   - Handler throw of unknown -> classified, returned as failure

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineTool } from '../../src/lib/define-tool.js';
import { transient } from '../../src/lib/errors.js';

describe('defineTool', () => {
  it('returns ok content for a successful handler', async () => {
    const tool = defineTool({
      name: 'echo',
      description: 'echoes',
      inputShape: { msg: z.string() },
      handler: async (input) => ({ echoed: input.msg }),
    });

    const result = await tool.invoke({ msg: 'hello' });
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('hello');
    expect('isError' in result).toBe(false);
  });

  it('returns INVALID_INPUT for a Zod parse failure', async () => {
    const tool = defineTool({
      name: 'echo',
      description: 'echoes',
      inputShape: { msg: z.string().min(1) },
      handler: async () => ({}),
    });

    const result = await tool.invoke({ msg: 123 });
    expect('isError' in result && result.isError).toBe(true);
    if ('errorCategory' in result) {
      expect(result.errorCategory).toBe('INVALID_INPUT');
    }
  });

  it('preserves ToolError category from the handler', async () => {
    const tool = defineTool({
      name: 'flaky',
      description: 'always fails',
      inputShape: { x: z.number() },
      handler: async () => {
        throw transient('upstream timed out');
      },
    });

    const result = await tool.invoke({ x: 1 });
    if ('errorCategory' in result) {
      expect(result.errorCategory).toBe('TRANSIENT');
      expect(result.content[0].text).toContain('upstream timed out');
    } else {
      throw new Error('expected error result');
    }
  });

  it('classifies unknown errors as PERMANENT by default', async () => {
    const tool = defineTool({
      name: 'broken',
      description: 'throws raw',
      inputShape: { x: z.number() },
      handler: async () => {
        throw new Error('something exploded');
      },
    });

    const result = await tool.invoke({ x: 1 });
    if ('errorCategory' in result) {
      expect(result.errorCategory).toBe('PERMANENT');
    } else {
      throw new Error('expected error result');
    }
  });

  it('classifies HTTP 429 as TRANSIENT', async () => {
    const tool = defineTool({
      name: 'rate-limited',
      description: 'gets 429',
      inputShape: {},
      handler: async () => {
        const err = Object.assign(new Error('too many requests'), { status: 429 });
        throw err;
      },
    });

    const result = await tool.invoke({});
    if ('errorCategory' in result) {
      expect(result.errorCategory).toBe('TRANSIENT');
    } else {
      throw new Error('expected error result');
    }
  });
});
