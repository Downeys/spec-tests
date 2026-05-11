import type { FastifyInstance } from 'fastify';
import type { ProjectService } from '../domain/projectService.js';
import type { MessageStore } from '../domain/messageStore.js';
import type { SseRegistry } from '../events/registry.js';
import type { RunOrchestratorInput, RunOrchestratorResult } from '../agents/orchestrator.js';
import { registerHealthRoute } from './health.js';
import { registerProjectsRoute } from './projects.js';
import { registerSseRoutes } from './sse.js';
import { registerMessageRoutes } from './messages.js';

export interface RoutesOptions {
  version: string;
  projectService: ProjectService;
  messageStore: MessageStore;
  sseRegistry: SseRegistry;
  runOrchestrator: (input: RunOrchestratorInput) => Promise<RunOrchestratorResult>;
}

export function registerRoutes(app: FastifyInstance, opts: RoutesOptions): void {
  registerHealthRoute(app, { version: opts.version });
  registerProjectsRoute(app, { service: opts.projectService });
  registerSseRoutes(app);
  registerMessageRoutes(app, {
    projectService: opts.projectService,
    messageStore: opts.messageStore,
    sseRegistry: opts.sseRegistry,
    runOrchestrator: opts.runOrchestrator,
  });
}
