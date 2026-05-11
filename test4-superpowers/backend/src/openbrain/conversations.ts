import type pg from "pg";
import { getPool } from "../db/pool.js";

export type MessageRole =
  | "user"
  | "assistant"
  | "tool_use"
  | "tool_result"
  | "system_summary";

export interface Conversation {
  id: string;
  startedAt: Date;
}

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: unknown;
  tokenCount: number | null;
  createdAt: Date;
}

function client(c?: pg.PoolClient): pg.PoolClient | pg.Pool {
  return c ?? getPool();
}

export async function getActiveConversation(c?: pg.PoolClient): Promise<Conversation> {
  const conn = client(c);
  const existing = await conn.query<{ id: string; started_at: Date }>(
    `SELECT id, started_at FROM conversations ORDER BY started_at DESC LIMIT 1`
  );
  if (existing.rows[0]) {
    return { id: existing.rows[0].id, startedAt: existing.rows[0].started_at };
  }
  const inserted = await conn.query<{ id: string; started_at: Date }>(
    `INSERT INTO conversations DEFAULT VALUES RETURNING id, started_at`
  );
  return { id: inserted.rows[0]!.id, startedAt: inserted.rows[0]!.started_at };
}

export interface AppendMessageInput {
  conversationId: string;
  role: MessageRole;
  content: unknown;
  tokenCount?: number | null;
}

export async function appendMessage(
  input: AppendMessageInput,
  c?: pg.PoolClient
): Promise<Message> {
  const result = await client(c).query<{
    id: string;
    conversation_id: string;
    role: string;
    content: unknown;
    token_count: number | null;
    created_at: Date;
  }>(
    `INSERT INTO messages (conversation_id, role, content, token_count)
     VALUES ($1, $2, $3::jsonb, $4)
     RETURNING id, conversation_id, role, content, token_count, created_at`,
    [
      input.conversationId,
      input.role,
      JSON.stringify(input.content),
      input.tokenCount ?? null
    ]
  );
  const r = result.rows[0]!;
  return {
    id: r.id,
    conversationId: r.conversation_id,
    role: r.role as MessageRole,
    content: r.content,
    tokenCount: r.token_count,
    createdAt: r.created_at
  };
}

export async function getMessages(
  conversationId: string,
  c?: pg.PoolClient
): Promise<Message[]> {
  const result = await client(c).query<{
    id: string;
    conversation_id: string;
    role: string;
    content: unknown;
    token_count: number | null;
    created_at: Date;
  }>(
    `SELECT id, conversation_id, role, content, token_count, created_at
       FROM messages
      WHERE conversation_id = $1
      ORDER BY created_at ASC`,
    [conversationId]
  );
  return result.rows.map((r) => ({
    id: r.id,
    conversationId: r.conversation_id,
    role: r.role as MessageRole,
    content: r.content,
    tokenCount: r.token_count,
    createdAt: r.created_at
  }));
}

export async function getConversationTokenUsage(
  conversationId: string,
  c?: pg.PoolClient
): Promise<number> {
  const result = await client(c).query<{ total: string | null }>(
    `SELECT COALESCE(SUM(token_count), 0)::text AS total
       FROM messages WHERE conversation_id = $1`,
    [conversationId]
  );
  return Number(result.rows[0]!.total ?? "0");
}

export async function newConversation(c?: pg.PoolClient): Promise<Conversation> {
  const conn = client(c);
  await conn.query(`DELETE FROM conversations`);
  const inserted = await conn.query<{ id: string; started_at: Date }>(
    `INSERT INTO conversations DEFAULT VALUES RETURNING id, started_at`
  );
  return { id: inserted.rows[0]!.id, startedAt: inserted.rows[0]!.started_at };
}

export interface CompactConversationInput {
  conversationId: string;
  summary: string;
  tokenCount: number;
}

export async function compactConversation(
  input: CompactConversationInput
): Promise<void> {
  const pool = getPool();
  const conn = await pool.connect();
  try {
    await conn.query("BEGIN");
    await conn.query(
      `DELETE FROM messages
        WHERE conversation_id = $1
          AND role IN ('user','assistant','tool_use','tool_result','system_summary')`,
      [input.conversationId]
    );
    await conn.query(
      `INSERT INTO messages (conversation_id, role, content, token_count)
       VALUES ($1, 'system_summary', $2::jsonb, $3)`,
      [
        input.conversationId,
        JSON.stringify([{ type: "text", text: input.summary }]),
        input.tokenCount
      ]
    );
    await conn.query("COMMIT");
  } catch (err) {
    await conn.query("ROLLBACK");
    throw err;
  } finally {
    conn.release();
  }
}
