import { query, type Options, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { AppError } from '../errors/AppError.js';

export interface ClaudeInvokeOptions {
  prompt: string;
  systemPrompt: string;
  model: string;
  abortController: AbortController;
  cwd?: string;
}

export interface ClaudeClient {
  invoke: (opts: ClaudeInvokeOptions) => AsyncIterable<SDKMessage>;
}

export interface ClaudeClientOptions {
  apiKey: string;
}

export function createClaudeClient(opts: ClaudeClientOptions): ClaudeClient {
  if (!opts.apiKey || opts.apiKey.trim() === '') {
    throw new AppError('internal', 'ANTHROPIC_API_KEY is required for claude client', {
      status: 500,
    });
  }
  const apiKey = opts.apiKey;

  return {
    invoke(invokeOpts): AsyncIterable<SDKMessage> {
      const sdkOptions: Options = {
        model: invokeOpts.model,
        systemPrompt: invokeOpts.systemPrompt,
        allowedTools: [],
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        includePartialMessages: true,
        abortController: invokeOpts.abortController,
        cwd: invokeOpts.cwd ?? process.cwd(),
        env: { ...process.env, ANTHROPIC_API_KEY: apiKey },
      };
      return query({ prompt: invokeOpts.prompt, options: sdkOptions });
    },
  };
}
