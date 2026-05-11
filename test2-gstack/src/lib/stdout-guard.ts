// A1 — runtime guard. The MCP stdio transport uses stdout as the JSON-RPC
// channel. Any byte written to stdout that isn't a JSON-RPC frame corrupts
// the protocol and Claude Desktop disconnects with cryptic errors.
//
// Strategy: snapshot the real write function before anyone uses it, expose
// it via a Writable stream that we hand to the MCP transport, then poison
// process.stdout.write so any other caller (third-party deps, accidental
// console.log) trips a loud error in dev or a redirect-to-stderr in prod.
//
// Order of operations matters: installStdoutGuard() must be the FIRST thing
// the entrypoint does. See src/server.ts.

import { Writable } from 'node:stream';
import { log } from './logger.js';

interface GuardState {
  installed: boolean;
  trustedStdout: Writable | null;
}

const state: GuardState = { installed: false, trustedStdout: null };

export function installStdoutGuard(): void {
  if (state.installed) return;
  state.installed = true;

  // Snapshot the real write function BEFORE poisoning the descriptor.
  const realWrite = process.stdout.write.bind(process.stdout);

  // Build a Writable stream that calls the real write directly. We hand
  // this to StdioServerTransport so its JSON-RPC frames go through cleanly.
  state.trustedStdout = new Writable({
    write(chunk: unknown, encoding: BufferEncoding, callback: (err?: Error | null) => void) {
      try {
        realWrite(chunk as string | Uint8Array, encoding, (err) => callback(err ?? null));
      } catch (err) {
        callback(err instanceof Error ? err : new Error(String(err)));
      }
    },
  });

  const inDev = process.env.NODE_ENV !== 'production';

  // Poison process.stdout.write. Anything that wasn't routed through our
  // trustedStdout hits this path.
  process.stdout.write = ((
    chunk: string | Uint8Array,
    encodingOrCb?: BufferEncoding | ((err?: Error) => void),
    cb?: (err?: Error) => void,
  ): boolean => {
    const text = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
    const trimmed = text.length > 200 ? text.slice(0, 200) + '…' : text;

    if (inDev) {
      // Loud failure with a helpful message. Stack trace at the throw site
      // points at the offender.
      throw new Error(
        `stdout-guard: write to stdout outside MCP transport. ` +
          `This corrupts the JSON-RPC stream. Use the logger (src/lib/logger.ts) ` +
          `which writes to stderr. Offending payload: ${trimmed}`,
      );
    }

    log.error('stdout_guard_redirect', { redirected: trimmed });
    if (typeof encodingOrCb === 'function') encodingOrCb();
    else if (cb) cb();
    return true;
  }) as typeof process.stdout.write;

  log.debug('stdout_guard_installed', { mode: inDev ? 'throw' : 'redirect' });
}

// Hand this stream to StdioServerTransport so its writes bypass the guard.
export function getTrustedStdout(): Writable {
  if (!state.trustedStdout) {
    throw new Error('stdout-guard not installed. Call installStdoutGuard() first.');
  }
  return state.trustedStdout;
}
