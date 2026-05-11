import { READER_HANDLERS } from "./readers.js";
import { WRITER_HANDLERS } from "./writers.js";

const ALL_HANDLERS = { ...READER_HANDLERS, ...WRITER_HANDLERS };

export class ToolNotFoundError extends Error {
  constructor(public readonly toolName: string) {
    super(`Tool not found: ${toolName}`);
    this.name = "ToolNotFoundError";
  }
}

export interface ToolErrorResult {
  isError: true;
  message: string;
  errorType: string;
}

export async function dispatchTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const handler = ALL_HANDLERS[name];
  if (!handler) throw new ToolNotFoundError(name);
  try {
    return await handler(args);
  } catch (err) {
    const e = err as Error;
    return {
      isError: true,
      message: e.message ?? String(e),
      errorType: e.name ?? "Error"
    } satisfies ToolErrorResult;
  }
}
