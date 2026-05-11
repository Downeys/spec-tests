import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AgentEvent } from '@bp/shared';
import { AppError } from '../errors/AppError.js';

export interface SseHandle {
  emit: (event: AgentEvent) => void;
  emitComment: (text: string) => void;
  close: () => void;
  readonly isClosed: boolean;
}

export interface CreateSseHandleOptions {
  reply: FastifyReply;
  request: FastifyRequest;
  onAbort?: () => void;
  heartbeatIntervalMs?: number;
}

const DEFAULT_HEARTBEAT_INTERVAL_MS = 15_000;

export function buildSseFrame(event: AgentEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export function buildSseComment(text: string): string {
  // Replace CRLF, bare CR, and bare LF — all are SSE field terminators per spec
  const safe = text.replaceAll(/\r\n|\r|\n/g, ' ');
  return `: ${safe}\n\n`;
}

/**
 * Returns true when `err` is the AppError thrown by emit() on a closed handle.
 * Use this in route catch blocks instead of comparing message strings directly.
 */
export function isSseClosedError(err: unknown): err is AppError {
  return (
    err instanceof AppError && err.code === 'internal' && err.message === 'stream already closed'
  );
}

export function createSseHandle(opts: CreateSseHandleOptions): SseHandle {
  const { reply, request, onAbort, heartbeatIntervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS } = opts;

  let closed = false;
  let onAbortInvoked = false;

  reply.hijack();

  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  reply.raw.write('retry: 1000\n\n');

  const heartbeatTimer = setInterval(() => {
    if (closed) return;
    try {
      reply.raw.write(buildSseComment('keep-alive'));
    } catch {
      closeHandle(false);
    }
  }, heartbeatIntervalMs);

  // onAbort fires only when the CLIENT closes the connection, not on server-
  // initiated close. The flag isClientDisconnect distinguishes the two paths.
  const onRawClose = (): void => {
    closeHandle(true);
  };

  const onRawError = (): void => {
    closeHandle(false);
  };

  request.raw.on('close', onRawClose);
  reply.raw.on('error', onRawError);

  function closeHandle(isClientDisconnect: boolean): void {
    if (closed) return;
    closed = true;
    clearInterval(heartbeatTimer);
    request.raw.off('close', onRawClose);
    reply.raw.off('error', onRawError);
    try {
      reply.raw.end();
    } catch {
      /* socket already destroyed — ignore */
    }
    if (!onAbortInvoked && onAbort && isClientDisconnect) {
      onAbortInvoked = true;
      try {
        onAbort();
      } catch {
        /* swallow so one bad callback can't orphan resources */
      }
    }
  }

  const handle: SseHandle = {
    emit(event: AgentEvent): void {
      if (closed) {
        throw new AppError('internal', 'stream already closed', { status: 500 });
      }
      reply.raw.write(buildSseFrame(event));
    },
    emitComment(text: string): void {
      if (closed) {
        throw new AppError('internal', 'stream already closed', { status: 500 });
      }
      reply.raw.write(buildSseComment(text));
    },
    close(): void {
      closeHandle(false);
    },
    get isClosed(): boolean {
      return closed;
    },
  };

  return handle;
}
