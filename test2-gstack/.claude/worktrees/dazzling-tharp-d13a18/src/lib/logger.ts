// stderr-only structured logger. Writing to stdout in this process corrupts the
// MCP JSON-RPC stream (A1 — see also stdout-guard.ts which enforces this at
// runtime). Every log line is a single JSON object on stderr; pipe stderr to
// a file or jq during dev to read it.

type Level = 'debug' | 'info' | 'warn' | 'error';

interface LogFields {
  [key: string]: unknown;
}

function emit(level: Level, msg: string, fields?: LogFields): void {
  const record: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...fields,
  };
  process.stderr.write(JSON.stringify(record) + '\n');
}

export const log = {
  debug: (msg: string, fields?: LogFields): void => emit('debug', msg, fields),
  info: (msg: string, fields?: LogFields): void => emit('info', msg, fields),
  warn: (msg: string, fields?: LogFields): void => emit('warn', msg, fields),
  error: (msg: string, fields?: LogFields): void => emit('error', msg, fields),
};
