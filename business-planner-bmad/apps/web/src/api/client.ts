import type { ErrorEnvelope } from '@bp/shared';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly envelope: ErrorEnvelope,
  ) {
    super(envelope.error.message);
    this.name = 'ApiError';
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has('content-type')) headers.set('content-type', 'application/json');
  const res = await fetch(path, { ...init, headers });
  if (!res.ok) {
    const envelope = (await res.json()) as ErrorEnvelope;
    throw new ApiError(res.status, envelope);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
