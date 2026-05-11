import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type {
  ChatMessage,
  IsoUtcTimestamp,
  MessageId,
  ProjectId,
  SendMessageRequest,
  SendMessageResponse,
  SessionId,
} from '@bp/shared';
import { AppError } from '../errors/AppError.js';
import { createSseHandle, isSseClosedError } from '../events/emit.js';
import type { SseRegistry } from '../events/registry.js';
import type { ProjectService } from '../domain/projectService.js';
import type { MessageStore } from '../domain/messageStore.js';
import type { RunOrchestratorInput, RunOrchestratorResult } from '../agents/orchestrator.js';

export interface MessageRoutesDeps {
  projectService: ProjectService;
  messageStore: MessageStore;
  sseRegistry: SseRegistry;
  runOrchestrator: (input: RunOrchestratorInput) => Promise<RunOrchestratorResult>;
}

const UUID_PATTERN = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

const sseQuerySchema = {
  type: 'object',
  required: ['token'],
  additionalProperties: false,
  properties: {
    token: { type: 'string', format: 'uuid', minLength: 36, maxLength: 36 },
  },
} as const;

const postParamsSchema = {
  type: 'object',
  required: ['project_id'],
  additionalProperties: false,
  properties: {
    project_id: { type: 'string', pattern: UUID_PATTERN },
  },
} as const;

const postBodySchema = {
  type: 'object',
  required: ['content', 'sse_token'],
  additionalProperties: false,
  properties: {
    content: { type: 'string', minLength: 1, maxLength: 20_000 },
    sse_token: { type: 'string', format: 'uuid', minLength: 36, maxLength: 36 },
  },
} as const;

export function registerMessageRoutes(app: FastifyInstance, deps: MessageRoutesDeps): void {
  const { projectService, messageStore, sseRegistry, runOrchestrator } = deps;

  app.get<{ Querystring: { token: string } }>(
    '/api/sse/messages',
    { schema: { querystring: sseQuerySchema }, attachValidation: true },
    async (req, reply) => {
      if (req.validationError) {
        throw new AppError('invalid_input', req.validationError.message, {
          status: 400,
          cause: req.validationError,
        });
      }
      const { token } = req.query;
      const abortController = new AbortController();

      const handle = createSseHandle({
        reply,
        request: req,
        onAbort: () => {
          abortController.abort();
          req.log.info(
            {
              event: 'stream.cancelled',
              reason: 'client_disconnect',
              request_id: req.id,
              sse_token: token,
            },
            'messages sse stream cancelled by client',
          );
          // Remove from registry in case the POST never consumed it.
          sseRegistry.cancel(token);
        },
      });

      try {
        sseRegistry.register(token, {
          handle,
          abortController,
          createdAt: Date.now(),
        });
      } catch (err) {
        // Duplicate-token: close the stream and surface a 4xx via SSE comment before ending.
        try {
          handle.emitComment('duplicate-token');
        } catch {
          /* ignore */
        }
        handle.close();
        req.log.warn({ err, sse_token: token }, 'duplicate sse token');
        return;
      }

      // The handle's lifecycle now belongs to the POST handler (or TTL expiry).
    },
  );

  app.post<{
    Params: { project_id: string };
    Body: SendMessageRequest;
  }>(
    '/api/projects/:project_id/messages',
    { schema: { params: postParamsSchema, body: postBodySchema }, attachValidation: true },
    async (req, reply) => {
      if (req.validationError) {
        throw new AppError('invalid_input', req.validationError.message, {
          status: 400,
          cause: req.validationError,
        });
      }

      const { project_id: projectId } = req.params;
      const { content, sse_token: sseToken } = req.body;

      const project = await projectService.getById(projectId);
      if (!project) {
        throw new AppError('not_found', 'project not found', { status: 404 });
      }

      const entry = sseRegistry.consume(sseToken);
      if (!entry) {
        throw new AppError('not_found', 'sse token not found or already consumed', { status: 404 });
      }

      const sessionId = 'default' as SessionId;
      const now = new Date().toISOString() as IsoUtcTimestamp;
      const userMessage: ChatMessage = {
        message_id: randomUUID() as MessageId,
        project_id: projectId as ProjectId,
        session_id: sessionId,
        role: 'user',
        content,
        created_at: now,
        status: 'complete',
      };

      await messageStore.append(projectId, sessionId, userMessage);
      const history = await messageStore.list(projectId, sessionId);

      const assistantMessageId = randomUUID() as MessageId;

      void runOrchestratorTurn({
        projectId,
        sessionId,
        history,
        userMessage,
        assistantMessageId,
        entry,
        logger: req.log,
        sseToken,
        runOrchestrator,
      }).catch((err: unknown) => {
        req.log.error({ err, sse_token: sseToken }, 'orchestrator turn crashed');
      });

      const body: SendMessageResponse = {
        user_message: userMessage,
        assistant_message_id: assistantMessageId,
      };
      void reply.status(202).send(body);
    },
  );
}

interface OrchestratorTurnInput {
  projectId: string;
  sessionId: SessionId;
  history: ChatMessage[];
  userMessage: ChatMessage;
  assistantMessageId: MessageId;
  entry: {
    handle: ReturnType<typeof createSseHandle>;
    abortController: AbortController;
  };
  logger: {
    debug: (...args: unknown[]) => void;
    info: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
  sseToken: string;
  runOrchestrator: MessageRoutesDeps['runOrchestrator'];
}

async function runOrchestratorTurn(input: OrchestratorTurnInput): Promise<void> {
  const { entry, logger, sseToken } = input;
  try {
    await input.runOrchestrator({
      projectId: input.projectId,
      sessionId: input.sessionId,
      history: input.history,
      userMessage: input.userMessage,
      abortSignal: entry.abortController.signal,
      onEvent: (event) => {
        try {
          entry.handle.emit(event);
        } catch (err) {
          if (isSseClosedError(err)) {
            logger.debug({ err }, 'sse stream closed mid-emit');
          } else {
            throw err;
          }
        }
      },
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      logger.info({ sse_token: sseToken }, 'orchestrator aborted');
    } else {
      logger.error({ err, sse_token: sseToken }, 'orchestrator failed');
    }
  } finally {
    entry.handle.close();
  }
}
