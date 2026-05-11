import type { MessageId } from './ids';
import type { ErrorCode } from './errors';

export interface MessageDeltaEvent {
  readonly type: 'message.delta';
  message_id: MessageId;
  delta: string;
}

export interface ThinkingStartEvent {
  readonly type: 'thinking.start';
  message_id: MessageId;
}

export interface ThinkingDeltaEvent {
  readonly type: 'thinking.delta';
  message_id: MessageId;
  delta: string;
}

export interface ThinkingEndEvent {
  readonly type: 'thinking.end';
  message_id: MessageId;
}

export interface ToolCallStartEvent {
  readonly type: 'tool_call.start';
  tool_call_id: string;
  tool_name: string;
  input: unknown;
}

export interface ToolCallEndSuccessEvent {
  readonly type: 'tool_call.end';
  readonly status: 'success';
  tool_call_id: string;
  output: unknown;
  duration_ms: number;
}

export interface ToolCallEndErrorEvent {
  readonly type: 'tool_call.end';
  readonly status: 'error';
  tool_call_id: string;
  error: string;
  duration_ms: number;
}

export type ToolCallEndEvent = ToolCallEndSuccessEvent | ToolCallEndErrorEvent;

export interface CostUpdateEvent {
  readonly type: 'cost.update';
  session_cost_usd: number;
  project_cost_usd_cumulative: number;
}

export interface ContextUpdateEvent {
  readonly type: 'context.update';
  used_tokens: number;
  max_tokens: number;
  pct_used: number;
}

export interface ErrorEvent {
  readonly type: 'error';
  code: ErrorCode;
  message: string;
  retryable: boolean;
}

export interface DoneEvent {
  readonly type: 'done';
  message_id: MessageId;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface SubagentStartedEvent {
  readonly type: 'subagent.started';
  subagent_id: string;
  subagent_name: string;
}

export interface SubagentEvent {
  readonly type: 'subagent.event';
  subagent_id: string;
  payload: unknown;
}

export interface SubagentCompletedSuccessEvent {
  readonly type: 'subagent.completed';
  readonly status: 'success';
  subagent_id: string;
  output: unknown;
  duration_ms: number;
}

export interface SubagentCompletedErrorEvent {
  readonly type: 'subagent.completed';
  readonly status: 'error';
  subagent_id: string;
  error: string;
  duration_ms: number;
}

export type SubagentCompletedEvent = SubagentCompletedSuccessEvent | SubagentCompletedErrorEvent;

export interface SkepticChallengeEvent {
  readonly type: 'skeptic.challenge';
  message_id: MessageId;
  challenge: string;
}

export interface StreamCancelledEvent {
  readonly type: 'stream.cancelled';
  message_id: MessageId;
  reason?: string;
}

export type AgentEvent =
  | MessageDeltaEvent
  | ThinkingStartEvent
  | ThinkingDeltaEvent
  | ThinkingEndEvent
  | ToolCallStartEvent
  | ToolCallEndEvent
  | CostUpdateEvent
  | ContextUpdateEvent
  | ErrorEvent
  | DoneEvent
  | SubagentStartedEvent
  | SubagentEvent
  | SubagentCompletedEvent
  | SkepticChallengeEvent
  | StreamCancelledEvent;

export function assertNever(x: never): never {
  throw new Error('Unhandled AgentEvent type: ' + (x as { type: string }).type);
}
