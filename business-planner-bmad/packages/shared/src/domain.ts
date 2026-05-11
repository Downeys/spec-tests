import type {
  CheckpointId,
  DecisionId,
  IsoUtcTimestamp,
  MessageId,
  ProjectId,
  SessionId,
} from './ids';

export interface Project {
  project_id: ProjectId;
  name: string;
  description: string;
  namespace: string;
  created_at: IsoUtcTimestamp;
  deleted_at?: IsoUtcTimestamp;
}

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
}

export interface ChatMessage {
  message_id: MessageId;
  project_id: ProjectId;
  session_id: SessionId;
  role: 'user' | 'assistant';
  content: string;
  created_at: IsoUtcTimestamp;
  status: 'streaming' | 'complete' | 'error';
  usage?: TokenUsage;
}

export interface ToolCall {
  tool_call_id: string;
  tool_name: string;
  input: unknown;
  output?: unknown;
  status: 'pending' | 'running' | 'success' | 'error';
  duration_ms?: number;
  started_at: IsoUtcTimestamp;
  ended_at?: IsoUtcTimestamp;
}

export interface Citation {
  citation_id: string;
  source_url: string;
  excerpt: string;
  relevance_score?: number;
}

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'unverified';

export interface DecisionRecord {
  decision_id: DecisionId;
  project_id: ProjectId;
  content: string;
  evidence: string[];
  confidence: ConfidenceLevel;
  created_at: IsoUtcTimestamp;
}

export interface Checkpoint {
  checkpoint_id: CheckpointId;
  session_id: SessionId;
  project_id: ProjectId;
  summary: string;
  created_at: IsoUtcTimestamp;
}
