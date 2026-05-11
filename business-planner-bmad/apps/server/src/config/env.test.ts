import { describe, expect, it } from 'vitest';
import { envSchema } from './env.js';

describe('envSchema', () => {
  it('parses a minimal config and applies defaults', () => {
    const result = envSchema.safeParse({ ANTHROPIC_API_KEY: 'sk-test' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ANTHROPIC_API_KEY).toBe('sk-test');
      expect(result.data.PORT).toBe(3000);
      expect(result.data.WEB_PORT).toBe(5173);
      expect(result.data.NODE_ENV).toBe('development');
      expect(result.data.PINECONE_INDEX).toBe('business-planner-intelligence');
      expect(result.data.DATA_ROOT).toBe('./data');
    }
  });

  it('fails when ANTHROPIC_API_KEY is missing', () => {
    const result = envSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      const missing = result.error.issues.find((i) => i.path[0] === 'ANTHROPIC_API_KEY');
      expect(missing).toBeDefined();
    }
  });

  it('fails when PORT is non-numeric', () => {
    const result = envSchema.safeParse({
      ANTHROPIC_API_KEY: 'sk-test',
      PORT: 'abc',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const portIssue = result.error.issues.find((i) => i.path[0] === 'PORT');
      expect(portIssue).toBeDefined();
    }
  });
});
