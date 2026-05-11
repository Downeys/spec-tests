import type { AgentEvent } from '@bp/shared';

export interface SseStreamError {
  code: 'internal';
  message: string;
  retryable: boolean;
}

export interface AgentEventStreamHandlers {
  onEvent: (event: AgentEvent) => void;
  onError?: (error: SseStreamError) => void;
  onOpen?: () => void;
  onClose?: () => void;
}

export interface AgentEventStreamHandle {
  close: () => void;
  readonly isOpen: boolean;
}

const AGENT_EVENT_TYPES = [
  'message.delta',
  'thinking.start',
  'thinking.delta',
  'thinking.end',
  'tool_call.start',
  'tool_call.end',
  'cost.update',
  'context.update',
  'error',
  'done',
  'subagent.started',
  'subagent.event',
  'subagent.completed',
  'skeptic.challenge',
  'stream.cancelled',
] as const satisfies readonly AgentEvent['type'][];

const activeHandles = new Set<AgentEventStreamHandle>();

/**
 * Open a typed `EventSource` stream to an SSE endpoint.
 *
 * React 19 Strict Mode: this is a plain function, not a hook — Strict Mode's
 * double-invoke does not apply directly. When called from `useEffect`, return
 * `handle.close` as the cleanup so the first-invoke stream is closed before
 * the second-invoke stream opens.
 */
export function openAgentEventStream(
  url: string,
  handlers: AgentEventStreamHandlers,
): AgentEventStreamHandle {
  const es = new EventSource(url);

  let consecutiveErrors = 0;
  let closed = false;

  const handle: AgentEventStreamHandle = {
    close: () => {
      if (closed) return;
      closed = true;
      es.close();
      activeHandles.delete(handle);
      handlers.onClose?.();
    },
    get isOpen(): boolean {
      return !closed;
    },
  };

  es.onopen = () => {
    consecutiveErrors = 0;
    handlers.onOpen?.();
  };

  for (const type of AGENT_EVENT_TYPES) {
    es.addEventListener(type, (ev: MessageEvent) => {
      if (closed) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(ev.data as string);
      } catch {
        console.warn('[sse] invalid JSON frame', ev.data);
        return;
      }
      if (!isAgentEvent(parsed)) {
        console.warn('[sse] invalid payload shape', parsed);
        return;
      }
      handlers.onEvent(parsed);
    });
  }

  es.onmessage = (ev: MessageEvent) => {
    // Any frame hitting the catch-all lacks a known event name
    console.warn('[sse] unknown event type', ev.type);
  };

  es.onerror = () => {
    consecutiveErrors += 1;
    const readyState = es.readyState;
    if (readyState === EventSource.CLOSED || consecutiveErrors >= 2) {
      if (closed) return;
      closed = true;
      es.close();
      activeHandles.delete(handle);
      handlers.onError?.({
        code: 'internal',
        message: 'sse stream unreachable',
        retryable: true,
      });
      handlers.onClose?.();
    }
    // Otherwise EventSource's built-in auto-reconnect handles the drop silently.
  };

  activeHandles.add(handle);
  return handle;
}

export function closeAllAgentEventStreams(): void {
  // Snapshot first to avoid mutation-during-iteration
  const snapshot = Array.from(activeHandles);
  for (const handle of snapshot) {
    handle.close();
  }
}

function isAgentEvent(payload: unknown): payload is AgentEvent {
  if (payload === null || typeof payload !== 'object') return false;
  const maybeType = (payload as { type?: unknown }).type;
  if (typeof maybeType !== 'string') return false;
  return (AGENT_EVENT_TYPES as readonly string[]).includes(maybeType);
}
