import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { MessageId } from '@bp/shared';
import { AppError } from '../errors/AppError.js';
import { createSseHandle, isSseClosedError } from '../events/emit.js';

const echoQuerySchema = {
  type: 'object',
  required: ['token'],
  additionalProperties: false,
  properties: {
    token: { type: 'string', format: 'uuid', minLength: 36, maxLength: 36 },
  },
} as const;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function registerSseRoutes(app: FastifyInstance): void {
  app.get<{ Querystring: { token: string } }>(
    '/api/sse/echo',
    { schema: { querystring: echoQuerySchema }, attachValidation: true },
    async (req, reply) => {
      if (req.validationError) {
        throw new AppError('invalid_input', req.validationError.message, {
          status: 400,
          cause: req.validationError,
        });
      }

      const { token } = req.query;
      const messageId = randomUUID() as MessageId;
      const toolCallId = randomUUID();

      const handle = createSseHandle({
        reply,
        request: req,
        onAbort: () => {
          req.log.info(
            {
              event: 'stream.cancelled',
              reason: 'client_disconnect',
              request_id: req.id,
              sse_token: token,
            },
            'sse echo stream cancelled by client',
          );
        },
      });

      try {
        await wait(20);
        handle.emit({ type: 'thinking.start', message_id: messageId });

        await wait(20);
        handle.emit({ type: 'thinking.delta', message_id: messageId, delta: 'thinking…' });

        await wait(20);
        handle.emit({ type: 'thinking.end', message_id: messageId });

        await wait(20);
        handle.emit({ type: 'message.delta', message_id: messageId, delta: 'hello ' });

        await wait(20);
        handle.emit({ type: 'message.delta', message_id: messageId, delta: 'from echo' });

        await wait(20);
        handle.emit({
          type: 'tool_call.start',
          tool_call_id: toolCallId,
          tool_name: 'echo_tool',
          input: { ping: 1 },
        });

        await wait(20);
        handle.emit({
          type: 'tool_call.end',
          status: 'success',
          tool_call_id: toolCallId,
          output: { pong: 1 },
          duration_ms: 1,
        });

        await wait(20);
        handle.emit({
          type: 'cost.update',
          session_cost_usd: 0,
          project_cost_usd_cumulative: 0,
        });

        await wait(20);
        handle.emit({
          type: 'done',
          message_id: messageId,
          usage: { input_tokens: 0, output_tokens: 0 },
        });
      } catch (err) {
        if (isSseClosedError(err)) {
          req.log.debug({ err }, 'sse echo interrupted before done');
        } else {
          req.log.error({ err }, 'sse echo handler failure');
        }
      } finally {
        handle.close();
      }
    },
  );
}
