import { describe, expect, it, vi } from 'vitest';
import type { AgentEvent, MessageId } from '@bp/shared';
import { dispatchAgentEvent, type AgentEventHandlers } from './agentEventDispatcher';

const MID = 'm1' as MessageId;

const CASES: Record<AgentEvent['type'], AgentEvent> = {
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
    session_cost_usd: 0.01,
    project_cost_usd_cumulative: 0.5,
  },
  'context.update': {
    type: 'context.update',
    used_tokens: 10,
    max_tokens: 100,
    pct_used: 0.1,
  },
  error: { type: 'error', code: 'internal', message: 'boom', retryable: false },
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

const HANDLER_KEYS: Record<AgentEvent['type'], keyof AgentEventHandlers> = {
  'message.delta': 'onMessageDelta',
  'thinking.start': 'onThinkingStart',
  'thinking.delta': 'onThinkingDelta',
  'thinking.end': 'onThinkingEnd',
  'tool_call.start': 'onToolCallStart',
  'tool_call.end': 'onToolCallEnd',
  'cost.update': 'onCostUpdate',
  'context.update': 'onContextUpdate',
  error: 'onError',
  done: 'onDone',
  'subagent.started': 'onSubagentStarted',
  'subagent.event': 'onSubagentEvent',
  'subagent.completed': 'onSubagentCompleted',
  'skeptic.challenge': 'onSkepticChallenge',
  'stream.cancelled': 'onStreamCancelled',
};

describe('dispatchAgentEvent', () => {
  for (const [type, event] of Object.entries(CASES) as Array<[AgentEvent['type'], AgentEvent]>) {
    it(`routes ${type} to ${HANDLER_KEYS[type]} and no other handler`, () => {
      const handlers: Record<keyof AgentEventHandlers, ReturnType<typeof vi.fn>> = {
        onMessageDelta: vi.fn(),
        onThinkingStart: vi.fn(),
        onThinkingDelta: vi.fn(),
        onThinkingEnd: vi.fn(),
        onToolCallStart: vi.fn(),
        onToolCallEnd: vi.fn(),
        onCostUpdate: vi.fn(),
        onContextUpdate: vi.fn(),
        onError: vi.fn(),
        onDone: vi.fn(),
        onSubagentStarted: vi.fn(),
        onSubagentEvent: vi.fn(),
        onSubagentCompleted: vi.fn(),
        onSkepticChallenge: vi.fn(),
        onStreamCancelled: vi.fn(),
      };

      dispatchAgentEvent(event, handlers);

      const expectedKey = HANDLER_KEYS[type];
      expect(handlers[expectedKey]).toHaveBeenCalledTimes(1);
      expect(handlers[expectedKey]).toHaveBeenCalledWith(event);

      // No other handler fired
      for (const key of Object.keys(handlers) as Array<keyof AgentEventHandlers>) {
        if (key !== expectedKey) {
          expect(handlers[key]).not.toHaveBeenCalled();
        }
      }
    });

    it(`is a no-op when the ${HANDLER_KEYS[type]} handler is undefined`, () => {
      expect(() => {
        dispatchAgentEvent(event, {});
      }).not.toThrow();
    });
  }
});
