import { describe, expect, it } from 'vitest';
import { assertNever, type AgentEvent } from './events';
import type { MessageId } from './ids';

describe('AgentEvent discriminated union', () => {
  it('narrows exhaustively in a switch and reaches every branch', () => {
    const events: AgentEvent[] = [
      { type: 'message.delta', message_id: 'm1' as MessageId, delta: 'x' },
      { type: 'thinking.start', message_id: 'm1' as MessageId },
      { type: 'thinking.delta', message_id: 'm1' as MessageId, delta: 'x' },
      { type: 'thinking.end', message_id: 'm1' as MessageId },
      { type: 'tool_call.start', tool_call_id: 't1', tool_name: 'web_search', input: null },
      {
        type: 'tool_call.end',
        status: 'success',
        tool_call_id: 't1',
        output: null,
        duration_ms: 0,
      },
      { type: 'cost.update', session_cost_usd: 0, project_cost_usd_cumulative: 0 },
      { type: 'context.update', used_tokens: 0, max_tokens: 100, pct_used: 0 },
      { type: 'error', code: 'internal', message: 'x', retryable: false },
      {
        type: 'done',
        message_id: 'm1' as MessageId,
        usage: { input_tokens: 0, output_tokens: 0 },
      },
      { type: 'subagent.started', subagent_id: 's1', subagent_name: 'skeptic' },
      { type: 'subagent.event', subagent_id: 's1', payload: null },
      {
        type: 'subagent.completed',
        status: 'success',
        subagent_id: 's1',
        output: null,
        duration_ms: 0,
      },
      { type: 'skeptic.challenge', message_id: 'm1' as MessageId, challenge: 'x' },
      { type: 'stream.cancelled', message_id: 'm1' as MessageId },
    ];

    const seen = new Set<AgentEvent['type']>();

    for (const event of events) {
      switch (event.type) {
        case 'message.delta':
        case 'thinking.start':
        case 'thinking.delta':
        case 'thinking.end':
        case 'tool_call.start':
        case 'tool_call.end':
        case 'cost.update':
        case 'context.update':
        case 'error':
        case 'done':
        case 'subagent.started':
        case 'subagent.event':
        case 'subagent.completed':
        case 'skeptic.challenge':
        case 'stream.cancelled':
          seen.add(event.type);
          break;
        default:
          assertNever(event);
      }
    }

    expect(seen.size).toBe(15); // update when AgentEvent union grows
  });
});

describe('assertNever', () => {
  it('throws with the unknown type name for JS-consumer edge cases', () => {
    const rogue = { type: 'not_a_real_event' } as unknown as never;
    expect(() => {
      assertNever(rogue);
    }).toThrow('Unhandled AgentEvent type: not_a_real_event');
  });
});
