import type { FastifyInstance } from 'fastify';
import type { CreateProjectRequest } from '@bp/shared';
import { AppError } from '../errors/AppError.js';
import type { ProjectService } from '../domain/projectService.js';

export interface ProjectsRouteOptions {
  service: ProjectService;
}

const createBodySchema = {
  type: 'object',
  required: ['name', 'description'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 100 },
    description: { type: 'string', maxLength: 500 },
  },
} as const;

const UUID_PATTERN = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

const deleteParamsSchema = {
  type: 'object',
  required: ['project_id'],
  additionalProperties: false,
  properties: {
    project_id: { type: 'string', pattern: UUID_PATTERN },
  },
} as const;

export function registerProjectsRoute(app: FastifyInstance, opts: ProjectsRouteOptions): void {
  const { service } = opts;

  app.post(
    '/api/projects',
    { schema: { body: createBodySchema }, attachValidation: true },
    async (req, reply) => {
      if (req.validationError) {
        throw new AppError('invalid_input', req.validationError.message, {
          status: 400,
          cause: req.validationError,
        });
      }
      const body = req.body as CreateProjectRequest;
      const project = await service.create(body);
      void reply.status(201);
      return project;
    },
  );

  app.get('/api/projects', async () => {
    return service.list();
  });

  app.delete<{ Params: { project_id: string } }>(
    '/api/projects/:project_id',
    { schema: { params: deleteParamsSchema }, attachValidation: true },
    async (req, reply) => {
      if (req.validationError) {
        throw new AppError('invalid_input', req.validationError.message, {
          status: 400,
          cause: req.validationError,
        });
      }
      await service.softDelete(req.params.project_id);
      void reply.status(204).send();
    },
  );
}
