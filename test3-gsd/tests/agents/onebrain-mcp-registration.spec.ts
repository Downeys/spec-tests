// tests/agents/onebrain-mcp-registration.spec.ts
// Bug R-B regression guard — the onebrain MCP server MUST register all four
// tools so the coordinator can ToolSearch and invoke them. The original bug
// (smoke-tested 2026-04-26 user evidence): the coordinator reported it could
// see vault tools but ZERO mcp__onebrain__* tools — the SDK silently dropped
// the entire onebrain server registration because of a malformed tool input
// schema.
//
// Two layers of guard:
//   1) Registration check: the McpServer's internal _registeredTools map
//      must contain all four onebrain tool names. This catches the case
//      where `tool()` instantiation throws and the entire server registration
//      is silently skipped.
//   2) listTools roundtrip: we connect a real MCP Client to the server over
//      an in-memory transport and call client.listTools(). This is the EXACT
//      code path the Claude Agent SDK uses to surface tools to the model
//      (sdk/dist/esm/server/mcp.js:67 ListToolsRequestSchema handler →
//      normalizeObjectSchema → toJsonSchemaCompat). If any onebrain tool's
//      Zod input schema fails to convert to JSON Schema, the listTools call
//      throws or returns a partial list, and the coordinator's tool palette
//      is missing onebrain tools — exactly the production symptom.
//
// No mocks, no synthetic stubs — the regression we're guarding against is a
// silent failure in the SDK glue between Zod and JSON Schema, so this test
// MUST exercise the real glue.

import { describe, it, expect } from 'vitest';
import { createOnebrainMcpServer } from '@/agents/tools/onebrain';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

interface McpServerInstance {
  // Internal McpServer registration registry. Field name is `_registeredTools`
  // in @modelcontextprotocol/sdk@^1.x; we read it via a typed cast so the
  // test fails loudly if the SDK shape ever changes.
  _registeredTools?: Record<string, unknown>;
  connect(transport: unknown): Promise<void>;
}

const EXPECTED_TOOL_NAMES = [
  'onebrain_search',
  'onebrain_write_claim',
  'onebrain_write_edge',
  'onebrain_write_source',
];

describe('createOnebrainMcpServer — Bug R-B registration guard', () => {
  it('registers all four onebrain tools on the underlying McpServer instance', () => {
    const config = createOnebrainMcpServer();

    // The SDK returns McpSdkServerConfigWithInstance: { type: 'sdk', name, instance }.
    expect(config.type).toBe('sdk');
    expect(config.name).toBe('onebrain');
    expect(config.instance).toBeDefined();

    // Reach into the McpServer's internal registry. This is intentional —
    // we want to verify real registration happened, not just that we passed
    // 4 tool definitions into the factory.
    const instance = config.instance as unknown as McpServerInstance;
    const registered = instance._registeredTools ?? {};
    const registeredNames = Object.keys(registered).sort((a, b) =>
      a.localeCompare(b),
    );

    expect(registeredNames).toEqual(EXPECTED_TOOL_NAMES);
  });

  it('listTools roundtrip surfaces all four tools (catches Zod-to-JSON-Schema conversion crashes — the actual R-B failure mode)', async () => {
    const config = createOnebrainMcpServer();
    const serverInstance = config.instance as unknown as McpServerInstance;

    // Wire a real MCP Client to the server over an in-memory transport.
    // This is the same protocol the Claude Agent SDK uses internally to
    // surface tool definitions to the model.
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client(
      { name: 'onebrain-r-b-test', version: '0.0.1' },
      { capabilities: {} },
    );

    await Promise.all([
      client.connect(clientTransport),
      serverInstance.connect(serverTransport),
    ]);

    // listTools triggers the SDK's ListToolsRequestSchema handler at
    // node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.js:67.
    // That handler calls normalizeObjectSchema + toJsonSchemaCompat on
    // every registered tool's inputSchema. If even one tool throws, the
    // whole response is empty/erroring and the coordinator sees no
    // onebrain tools — exactly the production R-B symptom.
    const result = await client.listTools();

    expect(result.tools).toBeDefined();
    expect(Array.isArray(result.tools)).toBe(true);

    const surfacedNames = result.tools
      .map((t) => t.name)
      .sort((a, b) => a.localeCompare(b));
    expect(surfacedNames).toEqual(EXPECTED_TOOL_NAMES);

    // Every tool MUST have a non-empty inputSchema (JSON Schema object).
    // If a Zod schema failed conversion, the SDK would either throw above
    // or emit `{}` — both are bugs we want to fail loudly on.
    for (const tool of result.tools) {
      expect(tool.inputSchema, `${tool.name} must have inputSchema`).toBeDefined();
      expect(tool.inputSchema.type, `${tool.name}.inputSchema.type`).toBe('object');
    }

    await client.close();
  });
});
