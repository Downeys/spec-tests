// CQ2 — three-category error envelope. Every tool returns either a successful
// payload or one of these. The category tells the agent (the LLM) what to do
// next: TRANSIENT = retry with backoff; PERMANENT = surface to the user, don't
// retry; INVALID_INPUT = the agent should retry with different arguments.

export type ToolErrorCategory = 'TRANSIENT' | 'PERMANENT' | 'INVALID_INPUT';

export class ToolError extends Error {
  readonly category: ToolErrorCategory;
  override readonly cause: unknown;

  constructor(category: ToolErrorCategory, message: string, cause?: unknown) {
    super(message);
    this.name = 'ToolError';
    this.category = category;
    this.cause = cause;
  }
}

// Helpers for the common cases. Use these instead of `throw new ToolError(...)`
// at call sites — they read better and are easier to grep for.

export const transient = (message: string, cause?: unknown): ToolError =>
  new ToolError('TRANSIENT', message, cause);

export const permanent = (message: string, cause?: unknown): ToolError =>
  new ToolError('PERMANENT', message, cause);

export const invalidInput = (message: string, cause?: unknown): ToolError =>
  new ToolError('INVALID_INPUT', message, cause);

// Anthropic / Tavily SDK-style: errors with a numeric `status` field.
function classifyHttp(err: unknown): ToolError | null {
  const e = err as { status?: number; message?: string };
  if (typeof e?.status !== 'number') return null;
  const msg = e.message ?? 'no message';
  if (e.status === 429) return transient(`rate limited (${msg})`, err);
  if (e.status >= 500 && e.status < 600) return transient(`upstream ${e.status} (${msg})`, err);
  if (e.status >= 400 && e.status < 500) return permanent(`upstream ${e.status} (${msg})`, err);
  return null;
}

// Postgres errors expose `code` (SQLSTATE). Five-char strings; we match prefixes.
function classifyPg(err: unknown): ToolError | null {
  const e = err as { code?: string; message?: string };
  if (typeof e?.code !== 'string') return null;
  const msg = e.message ?? 'no message';
  // 23xxx = integrity constraint violation. FK / NOT NULL / CHECK fail.
  if (e.code.startsWith('23')) return permanent(`db constraint ${e.code} (${msg})`, err);
  // 08xxx = connection exception. Retry.
  if (e.code.startsWith('08')) return transient(`db connection ${e.code} (${msg})`, err);
  // 53xxx = insufficient resources. Retry.
  if (e.code.startsWith('53')) return transient(`db resource ${e.code} (${msg})`, err);
  return null;
}

// AbortError — caller aborted (A2 timeout, SIGINT during shutdown).
function classifyAbort(err: unknown): ToolError | null {
  if (err instanceof Error && err.name === 'AbortError') return transient('aborted', err);
  return null;
}

// Pattern-match raw errors from external SDKs / pg / fetch into a category.
// The factory uses this when a handler throws a non-ToolError.
export function classifyError(err: unknown): ToolError {
  if (err instanceof ToolError) return err;

  const matched = classifyHttp(err) ?? classifyPg(err) ?? classifyAbort(err);
  if (matched) return matched;

  // Default — unknown error, treat as permanent so the agent doesn't loop.
  const msg = err instanceof Error ? err.message : String(err);
  return permanent(`unhandled error: ${msg}`, err);
}
