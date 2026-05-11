import type { FastifyInstance } from 'fastify';

export interface HealthRouteOptions {
  version: string;
}

export function registerHealthRoute(app: FastifyInstance, opts: HealthRouteOptions): void {
  app.get('/healthz', () => ({
    status: 'ok' as const,
    uptime_seconds: Math.round(process.uptime()),
    version: opts.version,
  }));
}
