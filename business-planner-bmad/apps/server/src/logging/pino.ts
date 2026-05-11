import { execSync } from 'node:child_process';
import * as os from 'node:os';
import { pino, type Logger } from 'pino';
import type { Env } from '../config/env.js';

function resolveGitSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

const gitSha = resolveGitSha();

export function createLogger(env: Env): Logger {
  return pino({
    level: env.NODE_ENV === 'production' ? 'info' : 'debug',
    base: {
      pid: process.pid,
      hostname: os.hostname(),
      git_sha: gitSha,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}
