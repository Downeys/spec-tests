// tests/agents/coordinator-config.spec.ts
// Wave 0 probe — VALIDATION rows AGENT-01 + COMP-10 (sub-agent halves).
// The coordinator's allowedTools assertion is added in plan 02-05 to this same file.
import { describe, it, expect } from 'vitest';
import { researchDef } from '@/agents/definitions/research';
import { compilationDef } from '@/agents/definitions/compilation';

describe('Sub-agent tools[] allowlist (COMP-10 / Pitfall 5 / T-02-02)', () => {
  it('research sub-agent does NOT have mcp__vault__vault_write_atomic in tools', () => {
    expect(researchDef.tools).not.toContain('mcp__vault__vault_write_atomic');
  });

  it('research sub-agent does NOT have any mcp__vault__* tool in tools', () => {
    const vaultTools = (researchDef.tools as readonly string[]).filter((t) =>
      t.startsWith('mcp__vault__'),
    );
    expect(vaultTools).toEqual([]);
  });

  it('compilation sub-agent IS the sole holder of mcp__vault__vault_write_atomic', () => {
    expect(compilationDef.tools).toContain('mcp__vault__vault_write_atomic');
  });

  it('compilation sub-agent does NOT have mcp__tavily__* tools (read-only against OneBrain)', () => {
    const tavilyTools = (compilationDef.tools as readonly string[]).filter((t) =>
      t.startsWith('mcp__tavily__'),
    );
    expect(tavilyTools).toEqual([]);
  });

  it('compilation sub-agent does NOT have mcp__onebrain__onebrain_write_* tools', () => {
    const onebrainWrites = (compilationDef.tools as readonly string[]).filter(
      (t) => t.startsWith('mcp__onebrain__onebrain_write_'),
    );
    expect(onebrainWrites).toEqual([]);
  });

  it('research sub-agent has all three tavily tools (search, extract, crawl)', () => {
    expect(researchDef.tools).toContain('mcp__tavily__tavily_search');
    expect(researchDef.tools).toContain('mcp__tavily__tavily_extract');
    expect(researchDef.tools).toContain('mcp__tavily__tavily_crawl');
  });

  it('research sub-agent has all three onebrain write tools', () => {
    expect(researchDef.tools).toContain('mcp__onebrain__onebrain_write_source');
    expect(researchDef.tools).toContain('mcp__onebrain__onebrain_write_claim');
    expect(researchDef.tools).toContain('mcp__onebrain__onebrain_write_edge');
  });

  it('research sub-agent uses claude-sonnet-4-6 (cheaper retrieval-shaped work)', () => {
    expect(researchDef.model).toBe('claude-sonnet-4-6');
  });

  it('compilation sub-agent uses claude-sonnet-4-6', () => {
    expect(compilationDef.model).toBe('claude-sonnet-4-6');
  });
});

// [APPENDED IN PLAN 02-05] — coordinator allowedTools + identity-source assertions
// (AGENT-01 / T-02-02). These cover the coordinator half of the COMP-10 invariant:
// the coordinator's tool palette structurally excludes mcp__vault__* (no vault
// writes possible from coordinator) and mcp__tavily__* (research-only delegation).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { coordinatorAllowedTools } from '@/agents/coordinator';
import { vaultAuditHook } from '@/agents/hooks/vault-audit';

describe('Coordinator allowedTools (AGENT-01 / T-02-02)', () => {
  it('coordinator does NOT have mcp__vault__vault_write_atomic in allowedTools (COMP-10 write-block)', () => {
    // COMP-10: only the compilation sub-agent ever writes to the vault. The
    // coordinator MUST NOT have vault_write_atomic in its allowlist. This is
    // the negative half of the read-allowed / write-blocked split refined at
    // 02-08 — see coordinator.ts T-02-02 comment block for the spec authority.
    expect(coordinatorAllowedTools).not.toContain(
      'mcp__vault__vault_write_atomic',
    );
  });
  it('coordinator HAS mcp__vault__vault_read in allowedTools (T-02-02 read-allowed half)', () => {
    // 02-08 refinement: the coordinator MAY READ the vault for citation /
    // quote use — quoting compiled topic pages is exactly what the wiki
    // exists for. The vault-audit hook only blocks vault_write_atomic;
    // vault_read passes through unconditionally regardless of agent identity.
    expect(coordinatorAllowedTools).toContain('mcp__vault__vault_read');
  });
  it('coordinator vault tools are EXACTLY [vault_read] — no writes, no other vault tools', () => {
    // Belt-and-braces: assert the full vault-namespace footprint is exactly
    // one entry, vault_read. If a future plan accidentally adds another vault
    // tool (especially a write), this test fails immediately.
    const vaultTools = (coordinatorAllowedTools as readonly string[]).filter(
      (t) => t.startsWith('mcp__vault__'),
    );
    expect(vaultTools).toEqual(['mcp__vault__vault_read']);
  });
  it('coordinator does NOT have any mcp__tavily__* tool (research delegates web)', () => {
    const tavilyTools = (coordinatorAllowedTools as readonly string[]).filter(
      (t) => t.startsWith('mcp__tavily__'),
    );
    expect(tavilyTools).toEqual([]);
  });
  it('coordinator HAS the four mcp__onebrain__* tools', () => {
    expect(coordinatorAllowedTools).toContain('mcp__onebrain__onebrain_search');
    expect(coordinatorAllowedTools).toContain(
      'mcp__onebrain__onebrain_write_source',
    );
    expect(coordinatorAllowedTools).toContain(
      'mcp__onebrain__onebrain_write_claim',
    );
    expect(coordinatorAllowedTools).toContain(
      'mcp__onebrain__onebrain_write_edge',
    );
  });
});

describe('Coordinator permissionMode wiring (Bug A — single-user-local-only)', () => {
  // The Claude Agent SDK's `permissionMode` defaults to 'default' (sdk.d.ts:1447,
  // sdk.d.ts:3230, PermissionMode union sdk.d.ts:1757), which prompts a HUMAN
  // for permission on every tool call. In a server context with no interactive
  // prompter, those prompts go nowhere → tool calls get rejected and the
  // coordinator concludes "I have no tools" even when OneBrain + vault_read
  // are wired. The fix is to set `permissionMode: 'bypassPermissions'` plus
  // the required `allowDangerouslySkipPermissions: true` acknowledgment
  // (sdk.d.ts:1456-1459 / sdk.d.ts:3199-3202) on the SDK query() options.
  //
  // We assert on the source-tree wiring rather than a runtime introspection
  // because the SDK consumes options privately. A grep regression test is
  // sufficient: if either flag is removed, the production server reverts to
  // the silently-rejected behavior and the live curl in the smoke check fails.
  it('coordinator.ts source sets permissionMode: "bypassPermissions" on query() options', () => {
    const coordinatorPath = resolve(process.cwd(), 'src/agents/coordinator.ts');
    const source = readFileSync(coordinatorPath, 'utf-8');
    expect(source).toMatch(/permissionMode\s*:\s*['"]bypassPermissions['"]/);
  });
  it('coordinator.ts source sets allowDangerouslySkipPermissions: true (SDK acknowledgment)', () => {
    const coordinatorPath = resolve(process.cwd(), 'src/agents/coordinator.ts');
    const source = readFileSync(coordinatorPath, 'utf-8');
    expect(source).toMatch(/allowDangerouslySkipPermissions\s*:\s*true/);
  });
  it('coordinator.ts documents the permissionMode choice with a CLAUDE.md / PROJECT.md authority reference', () => {
    // The choice must be defended in-source. A future reader should see WHY
    // bypassPermissions is correct here (single-user-local-only) and not
    // silently revert it under the assumption that 'default' is safer.
    const coordinatorPath = resolve(process.cwd(), 'src/agents/coordinator.ts');
    const source = readFileSync(coordinatorPath, 'utf-8');
    expect(source).toMatch(/single-user/i);
    expect(source).toMatch(/CLAUDE\.md|PROJECT\.md/);
  });
});

describe('Coordinator identity source (DEVIATION from AI-SPEC §3 — split out of CLAUDE.md)', () => {
  it('coordinator system prompt sources rule-named tokens from src/agents/coordinator-identity.md (NOT from CLAUDE.md)', () => {
    // The three rule-named tokens that CRIT-01 grades against MUST appear in
    // src/agents/coordinator-identity.md, NOT only in CLAUDE.md. The coordinator
    // loads coordinator-identity.md as systemPrompt at module init (per the
    // 02-05 deviation; SDK SettingSource is enum-only, not file-path-array).
    const identityPath = resolve(
      process.cwd(),
      'src/agents/coordinator-identity.md',
    );
    const identity = readFileSync(identityPath, 'utf-8');
    expect(
      identity,
      'coordinator-identity.md must mention "hypothesis"',
    ).toMatch(/hypothesis/i);
    expect(identity, 'coordinator-identity.md must mention "TAM"').toMatch(
      /TAM/,
    );
    expect(identity, 'coordinator-identity.md must mention "source"').toMatch(
      /source/i,
    );
  });
});

describe('Coordinator hook registration (AGENT-08 Layer 2 / COMP-10)', () => {
  // The vaultAuditHook is the Layer-2 audit defense for COMP-10. It MUST be
  // wired as a PreToolUse hook in the coordinator's query() options. Plan 02-04
  // shipped the hook function + the registration shape recommendation; this
  // test asserts the coordinator module exports the hook function under its
  // canonical name AND that it has the SDK's HookCallback shape (3 args:
  // input, toolUseID, options{signal}).
  //
  // Note: we cannot trivially introspect query()'s options after the call
  // because the SDK consumes them privately. The structural assertion is on
  // the source-tree wiring: coordinator.ts imports vaultAuditHook AND wires
  // it into the hooks: { PreToolUse: [{ hooks: [...] }] } shape.
  it('coordinator.ts source contains the vaultAuditHook PreToolUse registration', () => {
    const coordinatorPath = resolve(process.cwd(), 'src/agents/coordinator.ts');
    const source = readFileSync(coordinatorPath, 'utf-8');
    expect(source).toMatch(/vaultAuditHook/);
    expect(source).toMatch(/PreToolUse/);
    // The exact registration: hooks: { PreToolUse: [{ hooks: [vaultAuditHook] }] }
    expect(source).toMatch(/hooks\s*:\s*\[\s*vaultAuditHook\s*\]/);
  });
  it('vaultAuditHook is callable as a function (HookCallback shape)', () => {
    expect(typeof vaultAuditHook).toBe('function');
    // HookCallback signature is (input, toolUseID, options{signal}) → Promise.
    // Function.length reflects required positional args (3).
    expect(vaultAuditHook.length).toBe(3);
  });
});
