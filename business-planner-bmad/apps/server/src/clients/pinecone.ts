import { Pinecone, Errors as PineconeErrors } from '@pinecone-database/pinecone';
import type { ProjectId } from '@bp/shared';
import type { Env } from '../config/env.js';
import { AppError } from '../errors/AppError.js';

export interface EnsureIndexOptions {
  dimension?: number;
  metric?: 'cosine';
  cloud?: 'aws';
  region?: string;
}

const DEFAULT_OPTS: Required<EnsureIndexOptions> = {
  dimension: 1024,
  metric: 'cosine',
  cloud: 'aws',
  region: 'us-east-1',
};

export const RESERVED_NAMESPACES = new Set<string>(['__wiki__']);

export function isReservedNamespace(name: string): boolean {
  if (name.startsWith('__')) return true;
  return RESERVED_NAMESPACES.has(name);
}

export function namespaceFor(projectId: ProjectId): string {
  return projectId;
}

export function createPineconeClient(env: Env): Pinecone {
  if (!env.PINECONE_API_KEY) {
    throw new AppError('invalid_input', 'PINECONE_API_KEY is not configured', {
      status: 500,
    });
  }
  return new Pinecone({ apiKey: env.PINECONE_API_KEY });
}

function isNotFound(err: unknown): boolean {
  if (err instanceof PineconeErrors.PineconeNotFoundError) return true;
  if (err && typeof err === 'object') {
    const status = (err as { status?: unknown }).status;
    const name = (err as { name?: unknown }).name;
    if (status === 404) return true;
    if (typeof name === 'string' && name.includes('NotFound')) return true;
  }
  return false;
}

function isConflict(err: unknown): boolean {
  if (err instanceof PineconeErrors.PineconeConflictError) return true;
  if (err && typeof err === 'object') {
    const status = (err as { status?: unknown }).status;
    if (status === 409) return true;
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function ensureIndex(
  client: Pinecone,
  indexName: string,
  opts: EnsureIndexOptions = {},
): Promise<void> {
  const { dimension, metric, cloud, region } = { ...DEFAULT_OPTS, ...opts };

  try {
    const description = await client.describeIndex(indexName);
    if (description.status.ready) return;
    await pollUntilReady(client, indexName);
    return;
  } catch (err: unknown) {
    if (!isNotFound(err)) {
      throw new AppError('pinecone_read_failure', errMessage(err), {
        status: 502,
        retryable: true,
        cause: err,
      });
    }
  }

  try {
    await client.createIndex({
      name: indexName,
      dimension,
      metric,
      spec: { serverless: { cloud, region } },
    });
  } catch (err: unknown) {
    if (isConflict(err)) {
      await pollUntilReady(client, indexName);
      return;
    }
    throw new AppError('pinecone_write_failure', errMessage(err), {
      status: 502,
      retryable: true,
      cause: err,
    });
  }

  await pollUntilReady(client, indexName);
}

async function pollUntilReady(
  client: Pinecone,
  indexName: string,
  timeoutMs = 60_000,
  intervalMs = 2_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const description = await client.describeIndex(indexName);
      if (description.status.ready) return;
    } catch (err: unknown) {
      if (!isNotFound(err)) {
        throw new AppError('pinecone_read_failure', errMessage(err), {
          status: 502,
          retryable: true,
          cause: err,
        });
      }
    }
    await sleep(intervalMs);
  }
  throw new AppError('pinecone_write_failure', `index ${indexName} did not become ready`, {
    status: 502,
    retryable: true,
  });
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
