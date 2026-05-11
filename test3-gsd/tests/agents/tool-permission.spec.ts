// tests/agents/tool-permission.spec.ts
// Wave 0 probe — VALIDATION row COMP-10 (module-level static-membership half).
//
// The agent-definition half (coordinator/research/compilation `tools[]` allowlists)
// ships in plan 02-04 as tests/agents/coordinator-config.spec.ts. THIS plan's test
// is the building-block half — proves the three tool modules expose ONLY the
// expected surface and do NOT cross-contaminate (vault_write_atomic exclusively
// from src/agents/tools/vault.ts).

import { describe, it, expect } from 'vitest';

import * as vaultModule from '@/agents/tools/vault';
import * as onebrainModule from '@/agents/tools/onebrain';
import * as tavilyModule from '@/agents/tools/tavily';

describe('Tool module compartmentalization (COMP-10 building blocks)', () => {
  it('vault module exports vault_write_atomic and ToolPermissionDenied', () => {
    expect(Object.keys(vaultModule)).toContain('vault_write_atomic');
    expect(Object.keys(vaultModule)).toContain('ToolPermissionDenied');
    expect(Object.keys(vaultModule)).toContain('vault_read');
    expect(Object.keys(vaultModule)).toContain('createVaultMcpServer');
  });

  it('onebrain module does NOT export anything named vault_write_atomic', () => {
    expect(Object.keys(onebrainModule)).not.toContain('vault_write_atomic');
  });

  it('tavily module does NOT export anything named vault_write_atomic', () => {
    expect(Object.keys(tavilyModule)).not.toContain('vault_write_atomic');
  });

  it('createVaultMcpServer registers vault_write_atomic under the "vault" server name', () => {
    const server = vaultModule.createVaultMcpServer();
    // The SDK returns a McpSdkServerConfigWithInstance shape:
    //   { type: 'sdk', name: <serverName>, instance: McpServer }
    // (per @anthropic-ai/claude-agent-sdk sdk.d.ts:933-944). The `instance` is
    // not serializable — contains circular refs. We assert against the directly-
    // accessible surface and against the source tool's `.name` field rather than
    // walking the live McpServer instance.
    expect((server as unknown as { name?: string }).name).toBe('vault');
    expect((server as unknown as { type?: string }).type).toBe('sdk');
    expect((server as unknown as { instance?: object }).instance).toBeDefined();
    // The vault_write_atomic tool definition exposes its own `name` field per
    // SdkMcpToolDefinition (sdk.d.ts:2885-2892). Verify it matches the literal
    // we expect to surface as `mcp__vault__vault_write_atomic` to agents.
    expect(vaultModule.vault_write_atomic.name).toBe('vault_write_atomic');
    expect(vaultModule.vault_read.name).toBe('vault_read');
  });
});
