import { mkdir, readFile, rename, writeFile, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { ChatMessage } from '@bp/shared';
import { AppError } from '../errors/AppError.js';

export interface MessageStore {
  append: (projectId: string, sessionId: string, message: ChatMessage) => Promise<void>;
  list: (projectId: string, sessionId: string) => Promise<ChatMessage[]>;
  updateLast: (
    projectId: string,
    sessionId: string,
    patch: Partial<ChatMessage>,
  ) => Promise<void>;
  listAllForProject: (projectId: string) => Promise<ChatMessage[]>;
}

export interface MessageStoreOptions {
  dataRoot: string;
}

function sessionPath(dataRoot: string, projectId: string, sessionId: string): string {
  return path.join(dataRoot, 'sessions', projectId, `${sessionId}.jsonl`);
}

function projectSessionsDir(dataRoot: string, projectId: string): string {
  return path.join(dataRoot, 'sessions', projectId);
}

async function readAllLines(filePath: string): Promise<ChatMessage[]> {
  if (!existsSync(filePath)) return [];
  const raw = await readFile(filePath, 'utf8');
  if (raw.trim() === '') return [];
  const lines = raw.split('\n').filter((line) => line.length > 0);
  const out: ChatMessage[] = [];
  for (const line of lines) {
    try {
      out.push(JSON.parse(line) as ChatMessage);
    } catch (err) {
      throw new AppError('internal', 'message jsonl is corrupt', {
        status: 500,
        cause: err,
      });
    }
  }
  return out;
}

export function createMessageStore(opts: MessageStoreOptions): MessageStore {
  const { dataRoot } = opts;

  // Serialize writes per (projectId, sessionId) to prevent concurrent corruption.
  const chains = new Map<string, Promise<unknown>>();
  function serialize<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = chains.get(key) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    chains.set(
      key,
      next.catch(() => undefined),
    );
    return next;
  }

  async function ensureDir(projectId: string, sessionId: string): Promise<void> {
    await mkdir(path.dirname(sessionPath(dataRoot, projectId, sessionId)), { recursive: true });
  }

  return {
    async append(projectId, sessionId, message) {
      const key = `${projectId}::${sessionId}`;
      return serialize(key, async () => {
        await ensureDir(projectId, sessionId);
        const filePath = sessionPath(dataRoot, projectId, sessionId);
        await appendFile(filePath, JSON.stringify(message) + '\n', 'utf8');
      });
    },

    async list(projectId, sessionId) {
      const key = `${projectId}::${sessionId}`;
      return serialize(key, async () => {
        const filePath = sessionPath(dataRoot, projectId, sessionId);
        return readAllLines(filePath);
      });
    },

    async updateLast(projectId, sessionId, patch) {
      const key = `${projectId}::${sessionId}`;
      return serialize(key, async () => {
        const filePath = sessionPath(dataRoot, projectId, sessionId);
        const all = await readAllLines(filePath);
        if (all.length === 0) {
          throw new AppError('internal', 'no messages to patch', { status: 500 });
        }
        const lastIndex = all.length - 1;
        const last = all[lastIndex];
        if (!last) {
          throw new AppError('internal', 'no messages to patch', { status: 500 });
        }
        all[lastIndex] = { ...last, ...patch };

        await ensureDir(projectId, sessionId);
        const tmp = `${filePath}.tmp.${String(process.pid)}`;
        const body = all.map((m) => JSON.stringify(m)).join('\n') + '\n';
        await writeFile(tmp, body, 'utf8');
        await rename(tmp, filePath);
      });
    },

    async listAllForProject(projectId) {
      const dir = projectSessionsDir(dataRoot, projectId);
      if (!existsSync(dir)) return [];
      const { readdir } = await import('node:fs/promises');
      const files = await readdir(dir);
      const out: ChatMessage[] = [];
      for (const f of files) {
        if (!f.endsWith('.jsonl')) continue;
        const rows = await readAllLines(path.join(dir, f));
        out.push(...rows);
      }
      return out;
    },
  };
}
