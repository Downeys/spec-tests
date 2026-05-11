import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentEvent, MessageId } from '@bp/shared';
import {
  openAgentEventStream,
  closeAllAgentEventStreams,
  type AgentEventStreamHandlers,
} from './sse';

type Listener = (ev: MessageEvent) => void;

class MockEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSED = 2;

  url: string;
  readyState = MockEventSource.CONNECTING;
  onopen: ((ev: Event) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  close = vi.fn(() => {
    this.readyState = MockEventSource.CLOSED;
  });

  private listeners = new Map<string, Set<Listener>>();

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener = vi.fn((type: string, listener: Listener) => {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
  });

  dispatchFrame(type: string, data: string): void {
    const ev = { type, data } as unknown as MessageEvent;
    const set = this.listeners.get(type);
    if (set) {
      for (const listener of set) listener(ev);
    } else if (this.onmessage) {
      this.onmessage(ev);
    }
  }

  fireOpen(): void {
    this.readyState = MockEventSource.OPEN;
    this.onopen?.({ type: 'open' } as Event);
  }

  fireError(readyState: number): void {
    this.readyState = readyState;
    this.onerror?.({ type: 'error' } as Event);
  }

  static instances: MockEventSource[] = [];
  static reset(): void {
    MockEventSource.instances = [];
  }
}

const MID = 'm1' as MessageId;

function makeHandlers(): AgentEventStreamHandlers & {
  onEvent: ReturnType<typeof vi.fn>;
  onError: ReturnType<typeof vi.fn>;
  onOpen: ReturnType<typeof vi.fn>;
  onClose: ReturnType<typeof vi.fn>;
} {
  return {
    onEvent: vi.fn(),
    onError: vi.fn(),
    onOpen: vi.fn(),
    onClose: vi.fn(),
  };
}

describe('openAgentEventStream', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubGlobal('EventSource', MockEventSource);
    MockEventSource.reset();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    closeAllAgentEventStreams();
    vi.unstubAllGlobals();
    warnSpy.mockRestore();
  });

  it('parses a well-formed message.delta frame and calls onEvent with narrowed event', () => {
    const handlers = makeHandlers();
    openAgentEventStream('/api/sse/echo?token=x', handlers);
    const es = MockEventSource.instances[0];
    if (!es) throw new Error('expected EventSource instance');

    const event: AgentEvent = { type: 'message.delta', message_id: MID, delta: 'hi' };
    es.dispatchFrame('message.delta', JSON.stringify(event));

    expect(handlers.onEvent).toHaveBeenCalledTimes(1);
    expect(handlers.onEvent).toHaveBeenCalledWith(event);
  });

  it('warns and skips unknown event types', () => {
    const handlers = makeHandlers();
    openAgentEventStream('/api/sse/echo?token=x', handlers);
    const es = MockEventSource.instances[0];
    if (!es) throw new Error('expected EventSource instance');

    // No listener registered for this type — falls through to onmessage
    es.dispatchFrame('future_event', JSON.stringify({ type: 'future_event' }));

    expect(warnSpy).toHaveBeenCalledWith('[sse] unknown event type', 'future_event');
    expect(handlers.onEvent).not.toHaveBeenCalled();
  });

  it('warns and skips malformed JSON', () => {
    const handlers = makeHandlers();
    openAgentEventStream('/api/sse/echo?token=x', handlers);
    const es = MockEventSource.instances[0];
    if (!es) throw new Error('expected EventSource instance');

    es.dispatchFrame('message.delta', 'not-json');

    expect(warnSpy).toHaveBeenCalledWith('[sse] invalid JSON frame', 'not-json');
    expect(handlers.onEvent).not.toHaveBeenCalled();
  });

  it('warns and skips payloads whose type is not in the AgentEvent union', () => {
    const handlers = makeHandlers();
    openAgentEventStream('/api/sse/echo?token=x', handlers);
    const es = MockEventSource.instances[0];
    if (!es) throw new Error('expected EventSource instance');

    // Registered listener exists for 'message.delta', but the payload's type
    // field names a non-union value — guard trips and we skip.
    es.dispatchFrame(
      'message.delta',
      JSON.stringify({ type: 'nope', message_id: MID, delta: 'x' }),
    );

    expect(warnSpy).toHaveBeenCalledWith('[sse] invalid payload shape', expect.any(Object));
    expect(handlers.onEvent).not.toHaveBeenCalled();
  });

  it('allows one silent reconnect then surfaces onError after the second error', () => {
    const handlers = makeHandlers();
    openAgentEventStream('/api/sse/echo?token=x', handlers);
    const es = MockEventSource.instances[0];
    if (!es) throw new Error('expected EventSource instance');

    es.fireError(MockEventSource.CONNECTING);
    expect(handlers.onError).not.toHaveBeenCalled();

    es.fireError(MockEventSource.CONNECTING);
    expect(handlers.onError).toHaveBeenCalledTimes(1);
    expect(handlers.onError).toHaveBeenCalledWith({
      code: 'internal',
      message: 'sse stream unreachable',
      retryable: true,
    });
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
    expect(es.close).toHaveBeenCalled();
  });

  it('resets the retry counter after a successful onopen', () => {
    const handlers = makeHandlers();
    openAgentEventStream('/api/sse/echo?token=x', handlers);
    const es = MockEventSource.instances[0];
    if (!es) throw new Error('expected EventSource instance');

    es.fireError(MockEventSource.CONNECTING);
    es.fireOpen();
    es.fireError(MockEventSource.CONNECTING);
    // Still only 1 error since the reset — no onError yet
    expect(handlers.onError).not.toHaveBeenCalled();

    es.fireError(MockEventSource.CONNECTING);
    expect(handlers.onError).toHaveBeenCalledTimes(1);
  });

  it('force-closes immediately if readyState becomes CLOSED on first error', () => {
    const handlers = makeHandlers();
    openAgentEventStream('/api/sse/echo?token=x', handlers);
    const es = MockEventSource.instances[0];
    if (!es) throw new Error('expected EventSource instance');

    es.fireError(MockEventSource.CLOSED);
    expect(handlers.onError).toHaveBeenCalledTimes(1);
  });
});

describe('stream registry', () => {
  beforeEach(() => {
    vi.stubGlobal('EventSource', MockEventSource);
    MockEventSource.reset();
  });

  afterEach(() => {
    closeAllAgentEventStreams();
    vi.unstubAllGlobals();
  });

  it('closeAllAgentEventStreams closes every open handle', () => {
    const h1 = makeHandlers();
    const h2 = makeHandlers();
    openAgentEventStream('/api/sse/a', h1);
    openAgentEventStream('/api/sse/b', h2);

    const [es1, es2] = MockEventSource.instances;
    if (!es1 || !es2) throw new Error('expected two EventSources');

    closeAllAgentEventStreams();

    expect(es1.close).toHaveBeenCalled();
    expect(es2.close).toHaveBeenCalled();
    expect(h1.onClose).toHaveBeenCalledTimes(1);
    expect(h2.onClose).toHaveBeenCalledTimes(1);
  });

  it('individual handle.close deregisters from the registry (closeAll is then a no-op)', () => {
    const h1 = makeHandlers();
    const h2 = makeHandlers();
    const handle1 = openAgentEventStream('/api/sse/a', h1);
    openAgentEventStream('/api/sse/b', h2);

    const [es1, es2] = MockEventSource.instances;
    if (!es1 || !es2) throw new Error('expected two EventSources');

    handle1.close();
    expect(es1.close).toHaveBeenCalledTimes(1);
    expect(h1.onClose).toHaveBeenCalledTimes(1);

    // Closing the registry should only invoke close on the remaining handle
    closeAllAgentEventStreams();
    expect(es1.close).toHaveBeenCalledTimes(1); // no double-close
    expect(es2.close).toHaveBeenCalledTimes(1);
    expect(h1.onClose).toHaveBeenCalledTimes(1);
    expect(h2.onClose).toHaveBeenCalledTimes(1);
  });

  it('handle.close is idempotent', () => {
    const h = makeHandlers();
    const handle = openAgentEventStream('/api/sse/x', h);
    const es = MockEventSource.instances[0];
    if (!es) throw new Error('expected EventSource');

    handle.close();
    handle.close();
    handle.close();

    expect(es.close).toHaveBeenCalledTimes(1);
    expect(h.onClose).toHaveBeenCalledTimes(1);
    expect(handle.isOpen).toBe(false);
  });
});
