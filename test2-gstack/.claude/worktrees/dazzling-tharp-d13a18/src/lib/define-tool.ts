// CQ1 — defineTool() factory. Centralizes Zod input parsing, optional pg
// client acquisition, error classification, and structured logging. Each
// tool file becomes a short export of one defineTool() call.
//
// Two registration shapes:
//   1. defineTool({ name, description, inputSchema, handler }) where the
//      handler is a pure async function. No DB.
//   2. defineDbTool({ ...same..., handler: (input, { db }) => ... }) where
//      the factory acquires a pg client per call and releases on return.
//
// Both produce a `RegisteredTool` object that src/server.ts hands to the
// MCP SDK at startup.

import { z, type ZodRawShape, type ZodTypeAny } from 'zod';
import type { PoolClient } from 'pg';
import { withClient } from './db.js';
import { classifyError, ToolError } from './errors.js';
import { log } from './logger.js';

// MCP tools return a `content` array of typed parts; we only emit text in v1.
export interface ToolSuccess {
  content: [{ type: 'text'; text: string }];
}

export interface ToolFailure {
  content: [{ type: 'text'; text: string }];
  isError: true;
  // Tag the category so the LLM can route on it (CQ2). The MCP spec allows
  // additional fields on tool results; agents see them in the structured
  // response.
  errorCategory: 'TRANSIENT' | 'PERMANENT' | 'INVALID_INPUT';
}

export type ToolResult = ToolSuccess | ToolFailure;

interface DefineToolOpts<S extends ZodRawShape> {
  name: string;
  description: string;
  inputShape: S;
  handler: (input: z.infer<z.ZodObject<S>>) => Promise<unknown>;
}

interface DefineDbToolOpts<S extends ZodRawShape> {
  name: string;
  description: string;
  inputShape: S;
  handler: (
    input: z.infer<z.ZodObject<S>>,
    ctx: { db: PoolClient },
  ) => Promise<unknown>;
}

export interface RegisteredTool {
  name: string;
  description: string;
  // Zod shape (object map); MCP SDK accepts this and derives JSON Schema.
  inputShape: ZodRawShape;
  // Pre-wrapped invocation: validates input, runs handler, classifies errors.
  invoke: (rawInput: unknown) => Promise<ToolResult>;
}

function ok(value: unknown): ToolSuccess {
  return {
    content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }],
  };
}

function fail(err: ToolError): ToolFailure {
  return {
    content: [{ type: 'text', text: err.message }],
    isError: true,
    errorCategory: err.category,
  };
}

// Build the parser+invoke wrapper shared by both flavors.
function buildInvoke<S extends ZodRawShape>(
  name: string,
  inputShape: S,
  run: (parsed: z.infer<z.ZodObject<S>>) => Promise<unknown>,
): RegisteredTool['invoke'] {
  const schema = z.object(inputShape) as unknown as ZodTypeAny;

  return async (rawInput: unknown): Promise<ToolResult> => {
    const parsed = schema.safeParse(rawInput);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      log.warn('tool_invalid_input', { tool: name, issues });
      return fail(new ToolError('INVALID_INPUT', `invalid input: ${issues}`));
    }

    const start = Date.now();
    try {
      const value = await run(parsed.data as z.infer<z.ZodObject<S>>);
      log.info('tool_ok', { tool: name, duration_ms: Date.now() - start });
      return ok(value);
    } catch (err) {
      const tool_err = classifyError(err);
      log.error('tool_failed', {
        tool: name,
        category: tool_err.category,
        message: tool_err.message,
        duration_ms: Date.now() - start,
      });
      return fail(tool_err);
    }
  };
}

export function defineTool<S extends ZodRawShape>(opts: DefineToolOpts<S>): RegisteredTool {
  return {
    name: opts.name,
    description: opts.description,
    inputShape: opts.inputShape,
    invoke: buildInvoke(opts.name, opts.inputShape, opts.handler),
  };
}

export function defineDbTool<S extends ZodRawShape>(opts: DefineDbToolOpts<S>): RegisteredTool {
  return {
    name: opts.name,
    description: opts.description,
    inputShape: opts.inputShape,
    invoke: buildInvoke(opts.name, opts.inputShape, async (parsed) =>
      withClient((db) => opts.handler(parsed, { db })),
    ),
  };
}
