import { serve } from '@hono/node-server';
import { ok, err } from '@bp-agent/domain';
import type { Result } from '@bp-agent/domain';
import type { Hono } from 'hono';

export interface HostNotAllowed {
  readonly tag: 'HostNotAllowed';
  readonly host: string;
}

export interface ServerHandle {
  readonly url: string;
  close(): Promise<void>;
}

const ALLOWED_HOSTS = new Set(['127.0.0.1', 'localhost']);

export function validateHost(host: string): Result<string, HostNotAllowed> {
  if (ALLOWED_HOSTS.has(host)) {
    return ok(host);
  }
  return err({ tag: 'HostNotAllowed', host });
}

export function bindAndServe(
  app: Hono,
  opts: { host: string; port: number },
): Promise<Result<ServerHandle, HostNotAllowed>> {
  const hostResult = validateHost(opts.host);
  if (hostResult.tag === 'err') {
    return Promise.resolve(err(hostResult.error));
  }

  return new Promise((resolve) => {
    const server = serve({ fetch: app.fetch, hostname: opts.host, port: opts.port }, (info) => {
      const url = `http://${opts.host}:${String(info.port)}`;
      resolve(
        ok({
          url,
          close: () =>
            new Promise<void>((res, rej) => {
              server.close((closeErr?: Error) => {
                if (closeErr) rej(closeErr);
                else res();
              });
            }),
        }),
      );
    });
  });
}
