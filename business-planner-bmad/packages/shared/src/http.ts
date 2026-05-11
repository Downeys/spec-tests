import type { ErrorCode, ErrorEnvelope } from './errors';
import type { ChatMessage, Project } from './domain';
import type { MessageId, UuidV4 } from './ids';

export type SuccessResponse<T> = T;

export type ErrorResponse = ErrorEnvelope;

export interface ApiError {
  code: ErrorCode;
  message: string;
  retryable: boolean;
}

export interface CreateProjectRequest {
  name: string;
  description: string;
}

export type CreateProjectResponse = Project;

export type ListProjectsResponse = Project[];

export interface SendMessageRequest {
  content: string;
  sse_token: UuidV4;
}

export interface SendMessageResponse {
  user_message: ChatMessage;
  assistant_message_id: MessageId;
}
