import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import type { Logger } from 'pino';
import type { Pinecone } from '@pinecone-database/pinecone';
import type { Env } from './config/env.js';
import { registerErrorHooks } from './errors/index.js';
import { registerRoutes } from './routes/index.js';
import { createPineconeClient } from './clients/pinecone.js';
import { createClaudeClient, type ClaudeClient } from './clients/claude.js';
import { createProjectService } from './domain/projectService.js';
import { createMessageStore } from './domain/messageStore.js';
import { createSseRegistry } from './events/registry.js';
import { createOrchestrator } from './agents/orchestrator.js';
import pkg from '../package.json' with { type: 'json' };

export interface BuildAppOverrides {
  pineconeOverride?: Pinecone | { describeIndex: unknown; createIndex: unknown };
  claudeClientOverride?: ClaudeClient;
}

const INPUT_COST_PER_TOKEN = 15 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 75 / 1_000_000;

export async function buildApp(
  env: Env,
  logger: Logger,
  overrides: BuildAppOverrides = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    loggerInstance: logger as unknown as FastifyBaseLogger,
    disableRequestLogging: false,
  });

  await app.register(cors, {
    origin: `http://127.0.0.1:${String(env.WEB_PORT)}`,
    credentials: false,
  });

  registerErrorHooks(app);

  const pineconeFactory: () => Pinecone = overrides.pineconeOverride
    ? () => overrides.pineconeOverride as unknown as Pinecone
    : () => createPineconeClient(env);

  const projectService = createProjectService({
    dataRoot: env.DATA_ROOT,
    pinecone: pineconeFactory,
    pineconeIndex: env.PINECONE_INDEX,
  });

  const messageStore = createMessageStore({ dataRoot: env.DATA_ROOT });
  const sseRegistry = createSseRegistry();
  const claudeClient =
    overrides.claudeClientOverride ?? createClaudeClient({ apiKey: env.ANTHROPIC_API_KEY });

  const { runOrchestrator } = createOrchestrator({
    claudeClient,
    messageStore,
    getProjectCumulativeCostUsd: async (projectId) => {
      const all = await messageStore.listAllForProject(projectId);
      let total = 0;
      for (const m of all) {
        const u = m.usage;
        if (!u) continue;
        total += u.input_tokens * INPUT_COST_PER_TOKEN + u.output_tokens * OUTPUT_COST_PER_TOKEN;
      }
      return total;
    },
  });

  app.addHook('onClose', (_app, done) => {
    sseRegistry.shutdown();
    done();
  });

  registerRoutes(app, {
    version: pkg.version,
    projectService,
    messageStore,
    sseRegistry,
    runOrchestrator,
  });

  return app;
}
