// tests/agents/no-peer-messaging.spec.ts
// Wave 0 probe — VALIDATION row AGENT-07 / RESEARCH §AGENT-07.
// Sub-agents communicate via OneBrain rows, NOT via peer-to-peer in-context message passing.
// This is verified by absence: grep src/agents/ for any function name suggesting subAgent→subAgent
// direct calls.
import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';

async function listFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listFiles(full)));
    else if (e.isFile() && (e.name.endsWith('.ts') || e.name.endsWith('.tsx')))
      out.push(full);
  }
  return out;
}

describe('AGENT-07: no peer-to-peer sub-agent messaging API', () => {
  it('no file under src/agents/ defines a subAgentToSubAgent or peerInvoke function', async () => {
    const files = await listFiles(path.resolve('src/agents'));
    const forbidden =
      /\b(subAgentToSubAgent|peerInvoke|sendToSubAgent|callSubAgent|invokeSubAgent|delegateTo)\b/;
    const hits: Array<{ file: string; line: string }> = [];
    for (const f of files) {
      const text = await fs.readFile(f, 'utf-8');
      for (const line of text.split(/\r?\n/)) {
        if (forbidden.test(line) && !line.trim().startsWith('//')) {
          hits.push({ file: f, line: line.trim() });
        }
      }
    }
    expect(
      hits,
      `forbidden peer-messaging API names found: ${JSON.stringify(hits, null, 2)}`,
    ).toEqual([]);
  });
});
