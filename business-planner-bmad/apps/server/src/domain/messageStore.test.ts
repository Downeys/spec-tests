import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ChatMessage, IsoUtcTimestamp, MessageId, ProjectId, SessionId } from '@bp/shared';
import { createMessageStore, type MessageStore } from './messageStore.js';

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  const now = new Date().toISOString() as IsoUtcTimestamp;
  return {
    message_id: randomUUID() as MessageId,
    project_id: 'p1' as ProjectId,
    session_id: 'default' as SessionId,
    role: 'user',
    content: 'hello',
    created_at: now,
    status: 'complete',
    ...overrides,
  };
}

describe('messageStore', () => {
  let dataRoot: string;
  let store: MessageStore;

  beforeEach(() => {
    dataRoot = mkdtempSync(path.join(os.tmpdir(), `bp-msgstore-${randomUUID()}-`));
    store = createMessageStore({ dataRoot });
  });

  afterEach(() => {
    rmSync(dataRoot, { recursive: true, force: true });
  });

  it('append + list round-trip with a single message', async () => {
    const msg = makeMessage({ content: 'hi' });
    await store.append('p1', 'default', msg);
    const rows = await store.list('p1', 'default');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.content).toBe('hi');
    expect(rows[0]?.message_id).toBe(msg.message_id);
  });

  it('list returns an empty array for a missing session file', async () => {
    const rows = await store.list('nope', 'default');
    expect(rows).toEqual([]);
  });

  it('append preserves order across multiple messages', async () => {
    const a = makeMessage({ role: 'user', content: 'a' });
    const b = makeMessage({ role: 'assistant', content: 'b' });
    const c = makeMessage({ role: 'user', content: 'c' });
    await store.append('p1', 'default', a);
    await store.append('p1', 'default', b);
    await store.append('p1', 'default', c);
    const rows = await store.list('p1', 'default');
    expect(rows.map((r) => r.content)).toEqual(['a', 'b', 'c']);
  });

  it('updateLast patches content and usage on the last row only', async () => {
    const user = makeMessage({ role: 'user', content: 'q' });
    const assistant = makeMessage({
      role: 'assistant',
      content: '',
      status: 'streaming',
    });
    await store.append('p1', 'default', user);
    await store.append('p1', 'default', assistant);

    await store.updateLast('p1', 'default', {
      content: 'final answer',
      status: 'complete',
      usage: { input_tokens: 12, output_tokens: 34 },
    });

    const rows = await store.list('p1', 'default');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.content).toBe('q');
    expect(rows[0]?.status).toBe('complete');
    expect(rows[1]?.content).toBe('final answer');
    expect(rows[1]?.status).toBe('complete');
    expect(rows[1]?.usage).toEqual({ input_tokens: 12, output_tokens: 34 });
  });

  it('updateLast on empty session throws', async () => {
    await expect(store.updateLast('p1', 'default', { content: 'x' })).rejects.toThrow(
      /no messages to patch/,
    );
  });

  it('concurrent appends serialize to a correct, line-delimited file', async () => {
    const msgs = Array.from({ length: 5 }, (_, i) => makeMessage({ content: `m${String(i)}` }));
    await Promise.all(msgs.map((m) => store.append('p1', 'default', m)));

    const rows = await store.list('p1', 'default');
    expect(rows).toHaveLength(5);

    const raw = await readFile(path.join(dataRoot, 'sessions', 'p1', 'default.jsonl'), 'utf8');
    // every line must be parseable JSON — corruption surfaces as JSON.parse throw
    const parsed = raw
      .split('\n')
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l) as unknown);
    expect(parsed).toHaveLength(5);
  });

  it('listAllForProject aggregates rows across multiple sessions', async () => {
    await store.append('p1', 's-a', makeMessage({ session_id: 's-a' as SessionId, content: 'a1' }));
    await store.append('p1', 's-a', makeMessage({ session_id: 's-a' as SessionId, content: 'a2' }));
    await store.append('p1', 's-b', makeMessage({ session_id: 's-b' as SessionId, content: 'b1' }));

    const rows = await store.listAllForProject('p1');
    expect(rows.map((r) => r.content).sort()).toEqual(['a1', 'a2', 'b1']);
  });

  it('listAllForProject returns [] when the project has no sessions', async () => {
    const rows = await store.listAllForProject('no-one');
    expect(rows).toEqual([]);
  });
});
