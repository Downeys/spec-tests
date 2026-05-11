import type { IsoUtcTimestamp, ProjectId, SessionId } from './ids';

export type CostProvider = 'anthropic' | 'tavily' | 'pinecone' | 'voyage';

// TODO: Story 1.11 — add CostBreakdown with per-provider breakdown fields
export interface CostRecord {
  project_id: ProjectId;
  session_id: SessionId;
  provider: CostProvider;
  model?: string;
  input_tokens?: number;
  output_tokens?: number;
  cost_usd: number;
  timestamp: IsoUtcTimestamp;
}
