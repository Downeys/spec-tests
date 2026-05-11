// src/agents/tools/tavily.ts
// Three Tavily MCP tools per RES-01 capability surface:
//   - tavily_search   : web search; default depth 'advanced' per D-03
//   - tavily_extract  : URL → cleaned text/markdown for follow-up reads
//   - tavily_crawl    : recursive site crawl (wired but NOT default-invoked per D-03)
//
// D-03 (CONTEXT.md): the research sub-agent's default tool palette is search +
// extract; crawl is wired to the surface but the sub-agent prompt does not
// instruct invocation by default — it's reserved for an explicit "deep research"
// user signal (Phase 4). Wiring all three NOW lets 02-04 reference the full RES-01
// capability set without a follow-up surface change.
//
// Singleton-client + lazy-init mirrors src/onebrain/embed.ts:30-34. @tavily/core
// is ESM-clean per 02-01-SUMMARY.md (verified at install) — no createRequire fallback.

import {
  tool,
  createSdkMcpServer,
} from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { tavily, type TavilyClient } from '@tavily/core';
import { env } from '@/lib/env.js';
import { logger } from '@/lib/log.js';

// Singleton — lazy so tests that vi.mock('@tavily/core') can substitute the factory
// before first use. The mock returns a fake client; we never reach the env access.
let _client: TavilyClient | undefined;
function client(): TavilyClient {
  if (!_client) _client = tavily({ apiKey: env.TAVILY_API_KEY });
  return _client;
}

// ─── Tools ─────────────────────────────────────────────────────────────────────
// `tool()` arity: (name, description, inputSchema, handler) per @anthropic-ai/
// claude-agent-sdk@0.2.119 sdk.d.ts:5279. inputSchema is AnyZodRawShape (raw
// key→type map), so we pass `{ key: z.type(), ... }` literals NOT z.object({...}).

export const tavily_search = tool(
  'tavily_search',
  'Web search via Tavily. Returns up to max_results entries ranked by Tavily score. Default search depth is "advanced" per D-03 (the research sub-agent\'s default invocation).',
  {
    query: z.string().min(1),
    max_results: z.number().int().min(1).max(10).default(5),
  },
  async ({ query, max_results }, _extra) => {
    logger.info({ query, max_results }, 'tavily_search');
    const result = await client().search(query, {
      searchDepth: 'advanced',
      maxResults: max_results,
    });
    return {
      content: [
        { type: 'text' as const, text: JSON.stringify(result) },
      ],
    };
  },
);

export const tavily_extract = tool(
  'tavily_extract',
  'Extract clean text/markdown from up to 5 URLs (typically used as a follow-up to tavily_search results to get the full body).',
  {
    urls: z.array(z.string().url()).min(1).max(5),
  },
  async ({ urls }, _extra) => {
    logger.info({ urlCount: urls.length }, 'tavily_extract');
    const result = await client().extract(urls);
    return {
      content: [
        { type: 'text' as const, text: JSON.stringify(result) },
      ],
    };
  },
);

// tavily_crawl is wired per RES-01 but per D-03 NOT invoked by default —
// reserved for an explicit "deep research" user signal that lands in Phase 4.
export const tavily_crawl = tool(
  'tavily_crawl',
  'Recursive site crawl from a starting URL. Wired per RES-01 but per D-03 NOT default-invoked — reserved for an explicit deep-research user signal (Phase 4).',
  {
    url: z.string().url(),
    max_depth: z.number().int().min(1).max(3).default(1),
  },
  async ({ url, max_depth }, _extra) => {
    logger.info(
      { url, max_depth },
      'tavily_crawl (D-03: capability surface; not default invocation)',
    );
    const result = await client().crawl(url, { maxDepth: max_depth });
    return {
      content: [
        { type: 'text' as const, text: JSON.stringify(result) },
      ],
    };
  },
);

/**
 * Bundle the three Tavily tools into an MCP server. Tool IDs exposed to agents:
 *   mcp__tavily__tavily_search
 *   mcp__tavily__tavily_extract
 *   mcp__tavily__tavily_crawl
 */
export function createTavilyMcpServer() {
  return createSdkMcpServer({
    name: 'tavily',
    tools: [tavily_search, tavily_extract, tavily_crawl],
  });
}
