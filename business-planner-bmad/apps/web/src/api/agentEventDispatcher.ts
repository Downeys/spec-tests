import { assertNever, type AgentEvent } from '@bp/shared';

export interface AgentEventHandlers {
  onMessageDelta?: (e: Extract<AgentEvent, { type: 'message.delta' }>) => void;
  onThinkingStart?: (e: Extract<AgentEvent, { type: 'thinking.start' }>) => void;
  onThinkingDelta?: (e: Extract<AgentEvent, { type: 'thinking.delta' }>) => void;
  onThinkingEnd?: (e: Extract<AgentEvent, { type: 'thinking.end' }>) => void;
  onToolCallStart?: (e: Extract<AgentEvent, { type: 'tool_call.start' }>) => void;
  onToolCallEnd?: (e: Extract<AgentEvent, { type: 'tool_call.end' }>) => void;
  onCostUpdate?: (e: Extract<AgentEvent, { type: 'cost.update' }>) => void;
  onContextUpdate?: (e: Extract<AgentEvent, { type: 'context.update' }>) => void;
  onError?: (e: Extract<AgentEvent, { type: 'error' }>) => void;
  onDone?: (e: Extract<AgentEvent, { type: 'done' }>) => void;
  onSubagentStarted?: (e: Extract<AgentEvent, { type: 'subagent.started' }>) => void;
  onSubagentEvent?: (e: Extract<AgentEvent, { type: 'subagent.event' }>) => void;
  onSubagentCompleted?: (e: Extract<AgentEvent, { type: 'subagent.completed' }>) => void;
  onSkepticChallenge?: (e: Extract<AgentEvent, { type: 'skeptic.challenge' }>) => void;
  onStreamCancelled?: (e: Extract<AgentEvent, { type: 'stream.cancelled' }>) => void;
}

export function dispatchAgentEvent(event: AgentEvent, handlers: AgentEventHandlers): void {
  switch (event.type) {
    case 'message.delta':
      handlers.onMessageDelta?.(event);
      return;
    case 'thinking.start':
      handlers.onThinkingStart?.(event);
      return;
    case 'thinking.delta':
      handlers.onThinkingDelta?.(event);
      return;
    case 'thinking.end':
      handlers.onThinkingEnd?.(event);
      return;
    case 'tool_call.start':
      handlers.onToolCallStart?.(event);
      return;
    case 'tool_call.end':
      handlers.onToolCallEnd?.(event);
      return;
    case 'cost.update':
      handlers.onCostUpdate?.(event);
      return;
    case 'context.update':
      handlers.onContextUpdate?.(event);
      return;
    case 'error':
      handlers.onError?.(event);
      return;
    case 'done':
      handlers.onDone?.(event);
      return;
    case 'subagent.started':
      handlers.onSubagentStarted?.(event);
      return;
    case 'subagent.event':
      handlers.onSubagentEvent?.(event);
      return;
    case 'subagent.completed':
      handlers.onSubagentCompleted?.(event);
      return;
    case 'skeptic.challenge':
      handlers.onSkepticChallenge?.(event);
      return;
    case 'stream.cancelled':
      handlers.onStreamCancelled?.(event);
      return;
    default:
      assertNever(event);
  }
}
