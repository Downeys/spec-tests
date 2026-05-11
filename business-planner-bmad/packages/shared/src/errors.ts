export type ErrorCode =
  | 'upstream_claude'
  | 'rate_limited'
  | 'tavily_failure'
  | 'pinecone_write_failure'
  | 'pinecone_read_failure'
  | 'wiki_write_failure'
  | 'tool_execution_error'
  | 'invalid_input'
  | 'not_found'
  | 'internal';

export interface ErrorEnvelope {
  error: {
    code: ErrorCode;
    message: string;
    retryable: boolean;
    details?: unknown;
  };
}

export interface AppErrorShape {
  code: ErrorCode;
  message: string;
  retryable: boolean;
  status: number;
}
