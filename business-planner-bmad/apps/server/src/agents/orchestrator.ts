import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AgentEvent, ChatMessage, IsoUtcTimestamp, MessageId, TokenUsage } from '@bp/shared';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { ClaudeClient } from '../clients/claude.js';
import type { MessageStore } from '../domain/messageStore.js';

const MODEL = 'claude-opus-4-7';

// Opus 4.7 pricing (per Anthropic docs): $15 / 1M input, $75 / 1M output.
const INPUT_COST_PER_TOKEN = 15 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 75 / 1_000_000;

const MAX_RETRY_ATTEMPTS = 3;
const RETRY_BASE_MS = 250;

// Resolve the prompt file relative to this module (works under tsx + compiled dist).
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROMPT_PATH = path.join(__dirname, 'prompts', 'orchestrator.md');

let cachedPrompt: string | null = null;
async function loadPrompt(): Promise<string> {
  if (cachedPrompt !== null) return cachedPrompt;
  cachedPrompt = await readFile(PROMPT_PATH, 'utf8');
  return cachedPrompt;
}

export interface RunOrchestratorInput {
  projectId: string;
  sessionId: string;
  history: ChatMessage[];
  userMessage: ChatMessage;
  abortSignal: AbortSignal;
  onEvent: (event: AgentEvent) => void;
}

export interface RunOrchestratorResult {
  messageId: MessageId;
  usage: TokenUsage;
  content: string;
  totalCostUsd: number;
}

export interface OrchestratorDeps {
  claudeClient: ClaudeClient;
  messageStore: MessageStore;
  /** Provider for project-cumulative cost. Reads the persisted JSONL store. */
  getProjectCumulativeCostUsd: (projectId: string) => Promise<number>;
  /** Optional override for unit tests. */
  now?: () => Date;
  /** Optional override for unit tests to deflake backoff timing. */
  sleep?: (ms: number) => Promise<void>;
}

function buildPromptString(history: ChatMessage[], userMessage: ChatMessage): string {
  const lines: string[] = [];
  for (const m of history) {
    if (m.message_id === userMessage.message_id) continue;
    lines.push(`${m.role === 'user' ? 'Human' : 'Assistant'}: ${m.content}`);
  }
  lines.push(`Human: ${userMessage.content}`);
  lines.push('Assistant:');
  return lines.join('\n\n');
}

function isRetryable(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === 'AbortError') return false;
  const status =
    (err as { status?: number }).status ??
    (err as { response?: { status?: number } }).response?.status;
  if (typeof status === 'number') {
    return status === 429 || (status >= 500 && status < 600);
  }
  return /\b(429|503|502|504|rate[- ]?limit|overloaded)\b/i.test(err.message);
}

function sanitizeErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message.slice(0, 500);
  return 'unknown upstream error';
}

function extractStreamDelta(
  msg: SDKMessage,
): { kind: 'text' | 'thinking'; text: string } | null {
  if (msg.type !== 'stream_event') return null;
  const event = msg.event;
  if (event.type !== 'content_block_delta') return null;
  const delta = event.delta;
  if (typeof delta !== 'object') return null;
  if ((delta as { type: string }).type === 'text_delta') {
    const text = (delta as { text?: string }).text;
    if (typeof text === 'string' && text.length > 0) {
      return { kind: 'text', text };
    }
  }
  if ((delta as { type: string }).type === 'thinking_delta') {
    const thinking = (delta as { thinking?: string }).thinking;
    if (typeof thinking === 'string' && thinking.length > 0) {
      return { kind: 'thinking', text: thinking };
    }
  }
  return null;
}

interface ResultFrameSummary {
  usage: TokenUsage;
  totalCostUsd?: number;
  isError: boolean;
}

function extractResult(msg: SDKMessage): ResultFrameSummary | null {
  if (msg.type !== 'result') return null;
  const usage = (msg as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
  const input = usage?.input_tokens ?? 0;
  const output = usage?.output_tokens ?? 0;
  const totalCostUsd = (msg as { total_cost_usd?: number }).total_cost_usd;
  const subtype = (msg as { subtype?: string }).subtype;
  return {
    usage: { input_tokens: input, output_tokens: output },
    totalCostUsd: typeof totalCostUsd === 'number' ? totalCostUsd : undefined,
    isError: subtype !== 'success',
  };
}

function computeTurnCostUsd(usage: TokenUsage, sdkTotal: number | undefined): number {
  if (typeof sdkTotal === 'number' && Number.isFinite(sdkTotal)) return sdkTotal;
  return usage.input_tokens * INPUT_COST_PER_TOKEN + usage.output_tokens * OUTPUT_COST_PER_TOKEN;
}

function computeCumulativeFromHistory(history: ChatMessage[]): number {
  let total = 0;
  for (const m of history) {
    const u = m.usage;
    if (!u) continue;
    total += u.input_tokens * INPUT_COST_PER_TOKEN + u.output_tokens * OUTPUT_COST_PER_TOKEN;
  }
  return total;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export function createOrchestrator(deps: OrchestratorDeps): {
  runOrchestrator: (input: RunOrchestratorInput) => Promise<RunOrchestratorResult>;
} {
  const sleep = deps.sleep ?? defaultSleep;

  async function runOrchestrator(input: RunOrchestratorInput): Promise<RunOrchestratorResult> {
    const { projectId, sessionId, history, userMessage, abortSignal, onEvent } = input;

    const systemPrompt = await loadPrompt();
    const assistantMessageId = randomUUID() as MessageId;
    const promptString = buildPromptString(history, userMessage);

    const abortController = new AbortController();
    const onAbort = (): void => {
      abortController.abort();
    };
    if (abortSignal.aborted) abortController.abort();
    else abortSignal.addEventListener('abort', onAbort, { once: true });

    let accumulatedContent = '';
    let placeholderAppended = false;
    const resultRef: { current: ResultFrameSummary | null } = { current: null };

    const appendPlaceholder = (): void => {
      if (placeholderAppended) return;
      placeholderAppended = true;
      const placeholder: ChatMessage = {
        message_id: assistantMessageId,
        project_id: userMessage.project_id,
        session_id: userMessage.session_id,
        role: 'assistant',
        content: '',
        created_at: (deps.now?.() ?? new Date()).toISOString() as IsoUtcTimestamp,
        status: 'streaming',
      };
      // Fire-and-forget so the first delta can flush without blocking on disk IO.
      setImmediate(() => {
        void deps.messageStore.append(projectId, sessionId, placeholder).catch(() => {
          /* persistence failure is non-fatal to the stream; logged elsewhere */
        });
      });
    };

    const handleSdkMessage = (msg: SDKMessage): void => {
      const delta = extractStreamDelta(msg);
      if (delta) {
        if (delta.kind === 'text') {
          onEvent({ type: 'message.delta', message_id: assistantMessageId, delta: delta.text });
          accumulatedContent += delta.text;
          appendPlaceholder();
        } else {
          onEvent({ type: 'thinking.delta', message_id: assistantMessageId, delta: delta.text });
        }
        return;
      }
      const result = extractResult(msg);
      if (result) {
        resultRef.current = result;
      }
    };

    const emitErrorTerminal = (err: unknown, finalUsage: TokenUsage): void => {
      onEvent({
        type: 'error',
        code: 'upstream_claude',
        message: sanitizeErrorMessage(err),
        retryable: isRetryable(err),
      });
      onEvent({ type: 'done', message_id: assistantMessageId, usage: finalUsage });
    };

    let firstFrameYielded = false;
    let attempt = 0;
    let lastError: unknown = null;

    try {
      // Retry wraps only up until the first frame yields.
      while (attempt < MAX_RETRY_ATTEMPTS) {
        try {
          const iterable = deps.claudeClient.invoke({
            prompt: promptString,
            systemPrompt,
            model: MODEL,
            abortController,
          });
          const iter = iterable[Symbol.asyncIterator]();

          const firstStep = await iter.next();
          if (firstStep.done) break;
          firstFrameYielded = true;
          handleSdkMessage(firstStep.value);

          let step = await iter.next();
          while (!step.done) {
            handleSdkMessage(step.value);
            step = await iter.next();
          }
          break;
        } catch (err) {
          lastError = err;
          if (err instanceof Error && err.name === 'AbortError') throw err;
          if (firstFrameYielded) throw err;
          if (!isRetryable(err) || attempt === MAX_RETRY_ATTEMPTS - 1) throw err;
          const backoff = RETRY_BASE_MS * 2 ** attempt + Math.random() * 100;
          await sleep(backoff);
          attempt += 1;
        }
      }

      // Build final usage / content
      const result = resultRef.current;
      const finalUsage: TokenUsage = result?.usage ?? { input_tokens: 0, output_tokens: 0 };
      const totalCostUsd = computeTurnCostUsd(finalUsage, result?.totalCostUsd);

      if (result?.isError) {
        emitErrorTerminal(
          new Error(`claude result error (${String(attempt + 1)} attempts)`),
          finalUsage,
        );
        // Persist whatever we streamed.
        await persistFinal(deps, projectId, sessionId, assistantMessageId, userMessage, {
          content: accumulatedContent,
          status: 'error',
          usage: finalUsage,
          placeholderAppended,
          now: deps.now,
        });
        return {
          messageId: assistantMessageId,
          usage: finalUsage,
          content: accumulatedContent,
          totalCostUsd,
        };
      }

      // Success path: cost.update + done
      let cumulative: number;
      try {
        cumulative = await deps.getProjectCumulativeCostUsd(projectId);
      } catch {
        cumulative = computeCumulativeFromHistory(history);
      }
      onEvent({
        type: 'cost.update',
        session_cost_usd: totalCostUsd,
        project_cost_usd_cumulative: cumulative + totalCostUsd,
      });
      onEvent({ type: 'done', message_id: assistantMessageId, usage: finalUsage });

      await persistFinal(deps, projectId, sessionId, assistantMessageId, userMessage, {
        content: accumulatedContent,
        status: 'complete',
        usage: finalUsage,
        placeholderAppended,
        now: deps.now,
      });

      return {
        messageId: assistantMessageId,
        usage: finalUsage,
        content: accumulatedContent,
        totalCostUsd,
      };
    } catch (err) {
      abortSignal.removeEventListener('abort', onAbort);

      if (err instanceof Error && err.name === 'AbortError') {
        // Persist whatever was streamed before abort.
        await persistFinal(deps, projectId, sessionId, assistantMessageId, userMessage, {
          content: accumulatedContent,
          status: 'complete',
          usage: { input_tokens: 0, output_tokens: 0 },
          placeholderAppended,
          now: deps.now,
        });
        throw err;
      }

      const finalUsage: TokenUsage = { input_tokens: 0, output_tokens: 0 };
      emitErrorTerminal(err ?? lastError, finalUsage);

      await persistFinal(deps, projectId, sessionId, assistantMessageId, userMessage, {
        content: accumulatedContent,
        status: 'error',
        usage: finalUsage,
        placeholderAppended,
        now: deps.now,
      });

      return {
        messageId: assistantMessageId,
        usage: finalUsage,
        content: accumulatedContent,
        totalCostUsd: 0,
      };
    } finally {
      abortSignal.removeEventListener('abort', onAbort);
    }
  }

  return { runOrchestrator };
}

async function persistFinal(
  deps: OrchestratorDeps,
  projectId: string,
  sessionId: string,
  assistantMessageId: MessageId,
  userMessage: ChatMessage,
  info: {
    content: string;
    status: ChatMessage['status'];
    usage: TokenUsage;
    placeholderAppended: boolean;
    now?: () => Date;
  },
): Promise<void> {
  if (info.placeholderAppended) {
    // Yield the event loop once so any setImmediate-scheduled append has flushed.
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
    await deps.messageStore.updateLast(projectId, sessionId, {
      content: info.content,
      status: info.status,
      usage: info.usage,
    });
    return;
  }
  // Never appended the placeholder (error before first delta) — append a final row.
  const finalRow: ChatMessage = {
    message_id: assistantMessageId,
    project_id: userMessage.project_id,
    session_id: userMessage.session_id,
    role: 'assistant',
    content: info.content,
    created_at: (info.now?.() ?? new Date()).toISOString() as IsoUtcTimestamp,
    status: info.status,
    usage: info.usage,
  };
  await deps.messageStore.append(projectId, sessionId, finalRow);
}
