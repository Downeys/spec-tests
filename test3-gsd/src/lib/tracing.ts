// src/lib/tracing.ts
// Opt-in OpenTelemetry → Phoenix wiring. Phase 2 plan 02-01, Task 2.
//
// Spec authority: .planning/phases/02-agents-and-chat/02-AI-SPEC.md §5 lines 508-520.
// Gate: PHOENIX_ENABLED=1 in env (default OFF — T-02-INFRA-02 in threat register).
// When enabled, OpenTelemetry's NodeSDK starts and exports spans to localhost:4317
// (loopback only — Phoenix Docker container exposes the OTLP receiver locally).

import { env } from './env.js';
import { logger } from './log.js';

export function startTracing(): void {
  if (env.PHOENIX_ENABLED !== '1') return;

  // Lazy-import — keeps the OpenTelemetry SDK out of the dependency graph
  // when tracing is disabled (the default). Important for fast `bsp --help`
  // and for unit tests that don't want OTel side effects.
  import('@opentelemetry/sdk-node')
    .then(async ({ NodeSDK }) => {
      const { OTLPTraceExporter } = await import(
        '@opentelemetry/exporter-trace-otlp-http'
      );
      const { AnthropicInstrumentation } = await import(
        '@arizeai/openinference-instrumentation-anthropic'
      );
      const sdk = new NodeSDK({
        traceExporter: new OTLPTraceExporter({
          url: 'http://localhost:4317/v1/traces',
        }),
        instrumentations: [new AnthropicInstrumentation()],
      });
      sdk.start();
      logger.info(
        'phoenix tracing started (visit http://localhost:6006 for the Phoenix UI)',
      );
    })
    .catch((err) => logger.warn({ err }, 'phoenix tracing failed to start'));
}
