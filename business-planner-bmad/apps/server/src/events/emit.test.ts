import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { AgentEvent, MessageId } from '@bp/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  buildSseComment,
  buildSseFrame,
  createSseHandle,
  isSseClosedError,
  type CreateSseHandleOptions,
} from './emit.js';
import { AppError } from '../errors/AppError.js';

const MID = 'm1' as MessageId;

// Exhaustive table: adding a new AgentEvent variant without an entry here
// fails typecheck via Record<AgentEvent['type'], AgentEvent>.
const AGENT_EVENT_CASES: Record<AgentEvent['type'], AgentEvent> = {
  'message.delta': { type: 'message.delta', message_id: MID, delta: 'hi' },
  'thinking.start': { type: 'thinking.start', message_id: MID },
  'thinking.delta': { type: 'thinking.delta', message_id: MID, delta: 't' },
  'thinking.end': { type: 'thinking.end', message_id: MID },
  'tool_call.start': {
    type: 'tool_call.start',
    tool_call_id: 'tc1',
    tool_name: 'echo_tool',
    input: { ping: 1 },
  },
  'tool_call.end': {
    type: 'tool_call.end',
    status: 'success',
    tool_call_id: 'tc1',
    output: { pong: 1 },
    duration_ms: 1,
  },
  'cost.update': {
    type: 'cost.update',
    session_cost_usd: 0,
    project_cost_usd_cumulative: 0,
  },
  'context.update': {
    type: 'context.update',
    used_tokens: 10,
    max_tokens: 100,
    pct_used: 0.1,
  },
  error: {
    type: 'error',
    code: 'internal',
    message: 'boom',
    retryable: false,
  },
  done: {
    type: 'done',
    message_id: MID,
    usage: { input_tokens: 0, output_tokens: 0 },
  },
  'subagent.started': {
    type: 'subagent.started',
    subagent_id: 's1',
    subagent_name: 'skeptic',
  },
  'subagent.event': {
    type: 'subagent.event',
    subagent_id: 's1',
    payload: { ok: true },
  },
  'subagent.completed': {
    type: 'subagent.completed',
    status: 'success',
    subagent_id: 's1',
    output: { done: true },
    duration_ms: 5,
  },
  'skeptic.challenge': {
    type: 'skeptic.challenge',
    message_id: MID,
    challenge: 'why?',
  },
  'stream.cancelled': {
    type: 'stream.cancelled',
    message_id: MID,
    reason: 'client_disconnect',
  },
};

describe('buildSseFrame', () => {
  for (const [key, event] of Object.entries(AGENT_EVENT_CASES) as Array<
    [AgentEvent['type'], AgentEvent]
  >) {
    it(`frames ${key}`, () => {
      const frame = buildSseFrame(event);
      expect(frame).toBe(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      expect(frame.endsWith('\n\n')).toBe(true);
      // Exactly two trailing newlines, no embedded extras
      const newlineCount = (frame.match(/\n/g) ?? []).length;
      expect(newlineCount).toBe(3);
    });
  }

  it('serialises data on a single line', () => {
    const frame = buildSseFrame(AGENT_EVENT_CASES['message.delta']);
    const lines = frame.split('\n');
    expect(lines[0]).toBe('event: message.delta');
    expect(lines[1]?.startsWith('data: ')).toBe(true);
    expect(lines[2]).toBe('');
    expect(lines[3]).toBe('');
  });

  it('fails typecheck on malformed emit (negative test)', () => {
    // This file is part of the typecheck project. If the emitter's typing
    // were loosened, this @ts-expect-error would become an "unused" error.
    // @ts-expect-error wrong field name: message.delta requires `delta`, not `content`
    const bad: AgentEvent = { type: 'message.delta', message_id: MID, content: 'x' };
    expect(bad.type).toBe('message.delta');
  });
});

describe('buildSseComment', () => {
  it('prefixes with ": " and terminates with \\n\\n', () => {
    expect(buildSseComment('keep-alive')).toBe(': keep-alive\n\n');
  });

  it('strips embedded newlines to preserve framing', () => {
    expect(buildSseComment('a\nb\r\nc')).toBe(': a b c\n\n');
  });

  it(String.raw`strips bare \r to prevent SSE frame corruption`, () => {
    expect(buildSseComment('a\rb')).toBe(': a b\n\n');
  });
});

// --- createSseHandle tests ----------------------------------------------

interface MockRaw extends EventEmitter {
  write: ReturnType<typeof vi.fn>;
  writeHead: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
}

function makeMocks() {
  const rawReq = new EventEmitter() as EventEmitter & { off: (...args: unknown[]) => void };
  const rawRes: MockRaw = Object.assign(new EventEmitter(), {
    write: vi.fn(),
    writeHead: vi.fn(),
    end: vi.fn(),
  });
  const reply = {
    raw: rawRes,
    hijack: vi.fn(),
  } as unknown as FastifyReply;
  const request = {
    raw: rawReq,
  } as unknown as FastifyRequest;
  return { rawReq, rawRes, reply, request };
}

function makeOpts(extra: Partial<CreateSseHandleOptions> = {}): CreateSseHandleOptions {
  const { reply, request } = makeMocks();
  return { reply, request, ...extra };
}

describe('createSseHandle', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('hijacks reply, writes headers + retry field on construction', () => {
    const { reply, request, rawRes } = makeMocks();
    const replyWithHijack = reply as FastifyReply & { hijack: ReturnType<typeof vi.fn> };
    createSseHandle({ reply, request });
    expect(replyWithHijack.hijack).toHaveBeenCalledTimes(1);
    expect(rawRes.writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      }),
    );
    expect(rawRes.write).toHaveBeenCalledWith('retry: 1000\n\n');
  });

  it('emit writes the expected SSE frame', () => {
    const { reply, request, rawRes } = makeMocks();
    const handle = createSseHandle({ reply, request });
    handle.emit(AGENT_EVENT_CASES['message.delta']);
    expect(rawRes.write).toHaveBeenCalledWith(buildSseFrame(AGENT_EVENT_CASES['message.delta']));
  });

  it('emitComment writes a comment frame', () => {
    const { reply, request, rawRes } = makeMocks();
    const handle = createSseHandle({ reply, request });
    handle.emitComment('ping');
    expect(rawRes.write).toHaveBeenCalledWith(': ping\n\n');
  });

  it('emit throws AppError("internal", "stream already closed", 500) after close', () => {
    const { reply, request } = makeMocks();
    const handle = createSseHandle({ reply, request });
    handle.close();
    expect(() => {
      handle.emit(AGENT_EVENT_CASES['message.delta']);
    }).toThrow(AppError);
    try {
      handle.emit(AGENT_EVENT_CASES['message.delta']);
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      const appErr = err as AppError;
      expect(appErr.code).toBe('internal');
      expect(appErr.status).toBe(500);
      expect(appErr.message).toBe('stream already closed');
    }
  });

  it('emitComment throws AppError after close', () => {
    const { reply, request } = makeMocks();
    const handle = createSseHandle({ reply, request });
    handle.close();
    expect(() => {
      handle.emitComment('x');
    }).toThrow(AppError);
  });

  it('close() ends the raw response and flips isClosed', () => {
    const { reply, request, rawRes } = makeMocks();
    const handle = createSseHandle({ reply, request });
    expect(handle.isClosed).toBe(false);
    handle.close();
    expect(handle.isClosed).toBe(true);
    expect(rawRes.end).toHaveBeenCalledTimes(1);
  });

  it('close() is idempotent and does NOT invoke onAbort (server-initiated close)', () => {
    const onAbort = vi.fn();
    const { reply, request } = makeMocks();
    const handle = createSseHandle({ reply, request, onAbort });
    handle.close();
    handle.close();
    handle.close();
    expect(onAbort).not.toHaveBeenCalled();
  });

  it('request close event invokes onAbort exactly once (client-initiated close)', () => {
    const onAbort = vi.fn();
    const { reply, request, rawReq } = makeMocks();
    createSseHandle({ reply, request, onAbort });
    rawReq.emit('close');
    rawReq.emit('close');
    expect(onAbort).toHaveBeenCalledTimes(1);
  });

  it('request close event fires onAbort within 50ms (fake timers)', () => {
    vi.useFakeTimers();
    const onAbort = vi.fn();
    const { reply, request, rawReq } = makeMocks();
    const handle = createSseHandle({ reply, request, onAbort });
    expect(handle.isClosed).toBe(false);

    rawReq.emit('close');
    vi.advanceTimersByTime(50);

    expect(handle.isClosed).toBe(true);
    expect(onAbort).toHaveBeenCalledTimes(1);
  });

  it('heartbeat writes ": keep-alive\\n\\n" every 15s by default', () => {
    vi.useFakeTimers();
    const { reply, request, rawRes } = makeMocks();
    createSseHandle({ reply, request });

    rawRes.write.mockClear(); // ignore the initial retry: field write

    vi.advanceTimersByTime(15_000);
    expect(rawRes.write).toHaveBeenCalledWith(': keep-alive\n\n');
    vi.advanceTimersByTime(15_000);
    expect(rawRes.write).toHaveBeenCalledTimes(2);
  });

  it('heartbeat uses custom heartbeatIntervalMs when provided', () => {
    vi.useFakeTimers();
    const { reply, request, rawRes } = makeMocks();
    createSseHandle({ reply, request, heartbeatIntervalMs: 100 });
    rawRes.write.mockClear();

    vi.advanceTimersByTime(100);
    expect(rawRes.write).toHaveBeenCalledWith(': keep-alive\n\n');
  });

  it('reply.raw error event closes the handle without invoking onAbort', () => {
    const onAbort = vi.fn();
    const { reply, request, rawRes } = makeMocks();
    const handle = createSseHandle({ reply, request, onAbort });
    rawRes.emit('error', new Error('EPIPE'));
    expect(handle.isClosed).toBe(true);
    expect(onAbort).not.toHaveBeenCalled();
  });

  it('close() clears the heartbeat interval', () => {
    vi.useFakeTimers();
    const { reply, request, rawRes } = makeMocks();
    const handle = createSseHandle({ reply, request, heartbeatIntervalMs: 100 });
    handle.close();
    rawRes.write.mockClear();
    vi.advanceTimersByTime(1_000);
    expect(rawRes.write).not.toHaveBeenCalled();
  });
});

describe('isSseClosedError', () => {
  it('returns true for the AppError thrown by emit() after close', () => {
    const { reply, request } = makeMocks();
    const handle = createSseHandle({ reply, request });
    handle.close();
    let caught: unknown;
    try {
      handle.emit(AGENT_EVENT_CASES['message.delta']);
    } catch (err) {
      caught = err;
    }
    expect(isSseClosedError(caught)).toBe(true);
  });

  it('returns false for a generic Error', () => {
    expect(isSseClosedError(new Error('stream already closed'))).toBe(false);
  });

  it('returns false for null', () => {
    expect(isSseClosedError(null)).toBe(false);
  });
});

// Keep the factory reference from being flagged as unused by lint in some configs
void makeOpts;
