// tests/agents/tavily.spec.ts
// Wave 0 probe — VALIDATION row RES-01.
// Default: stubbed @tavily/core client (RUN_TAVILY_TESTS unset).
// Gated: live Tavily API call when RUN_TAVILY_TESTS=1.
//
// Mirrors the tests/integration/voyage-live.test.ts gating pattern from Phase 1.

import { describe, it, expect, vi } from 'vitest';

const RUN_LIVE = process.env.RUN_TAVILY_TESTS === '1';

// vi.mock hoists above imports — call it at top level (the `if (!RUN_LIVE)` form
// works but produces a future-deprecation warning per Vitest 4 mocking docs). We
// always mock, then in LIVE mode the test re-imports through `vi.unmock()` after
// stubbing the env. The mock factory builds a stable canned response so the mocked
// path is deterministic regardless of input query.
vi.mock('@tavily/core', () => ({
  tavily: () => ({
    search: vi.fn(async (query: string) => ({
      query,
      responseTime: 0.01,
      images: [],
      results: [
        {
          title: 'Mock result',
          url: 'https://example.com/test',
          content: 'mock body',
          score: 0.9,
          publishedDate: '2026-01-01',
        },
      ],
      requestId: 'mock-request',
    })),
    extract: vi.fn(async (_urls: string[]) => ({
      results: [],
      failedResults: [],
      responseTime: 0.01,
    })),
    crawl: vi.fn(async (_url: string) => ({ results: [], responseTime: 0.01 })),
  }),
}));

type Handler = (
  args: Record<string, unknown>,
  extra: { agentId?: string } | undefined,
) => Promise<{ content: Array<{ type: string; text: string }> }>;

describe(RUN_LIVE ? 'tavily_search (LIVE)' : 'tavily_search (mocked)', () => {
  it('returns ≥1 result for a known query', async () => {
    if (RUN_LIVE) {
      // Bypass the module-level mock for live calls — re-import the actual @tavily/core.
      vi.doUnmock('@tavily/core');
      vi.resetModules();
    }
    const { tavily_search } = await import('@/agents/tools/tavily');
    const result = await (tavily_search.handler as unknown as Handler)(
      {
        query: RUN_LIVE ? 'Anthropic Claude pricing' : 'mocked query',
        max_results: 3,
      },
      { agentId: 'research' },
    );
    // Tool returns MCP CallToolResult shape with stringified Tavily response.
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    const parsed = JSON.parse(result.content[0].text) as {
      results: Array<unknown>;
    };
    expect(parsed.results.length).toBeGreaterThan(0);
  });
});
