import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Pinecone } from '@pinecone-database/pinecone';
import { AppError } from '../errors/AppError.js';
import { createProjectService, type ProjectService } from './projectService.js';

interface FakePineconeCalls {
  describe: number;
  create: number;
}

function makeFakePinecone(opts?: { describeBehaviour?: 'ready' | 'not-found-then-ready' }): {
  client: Pinecone;
  calls: FakePineconeCalls;
} {
  const behaviour = opts?.describeBehaviour ?? 'ready';
  const calls: FakePineconeCalls = { describe: 0, create: 0 };
  let created = behaviour === 'ready';

  const client = {
    describeIndex: (): Promise<unknown> => {
      calls.describe += 1;
      if (!created) {
        const err = new Error('not found') as Error & { status?: number; name: string };
        err.name = 'PineconeNotFoundError';
        err.status = 404;
        return Promise.reject(err);
      }
      return Promise.resolve({ status: { ready: true } });
    },
    createIndex: (): Promise<unknown> => {
      calls.create += 1;
      created = true;
      return Promise.resolve({ name: 'index', dimension: 1024 });
    },
  } as unknown as Pinecone;

  return { client, calls };
}

describe('projectService', () => {
  let dataRoot: string;
  let service: ProjectService;
  let calls: FakePineconeCalls;

  beforeEach(() => {
    dataRoot = mkdtempSync(path.join(os.tmpdir(), `bp-projsvc-${randomUUID()}-`));
    const fake = makeFakePinecone();
    calls = fake.calls;
    service = createProjectService({
      dataRoot,
      pinecone: fake.client,
      pineconeIndex: 'business-planner-intelligence',
    });
  });

  afterEach(() => {
    rmSync(dataRoot, { recursive: true, force: true });
  });

  it('create persists a project and returns the full record', async () => {
    const created = await service.create({ name: 'radio-app', description: 'test' });
    expect(created.name).toBe('radio-app');
    expect(created.description).toBe('test');
    expect(typeof created.project_id).toBe('string');
    expect(created.project_id.length).toBeGreaterThan(10);
    expect(created.namespace).toBe(created.project_id);
    expect(typeof created.created_at).toBe('string');
    expect(created.deleted_at).toBeUndefined();
    expect(calls.describe).toBeGreaterThanOrEqual(1);

    const raw = await readFile(path.join(dataRoot, 'projects.json'), 'utf8');
    const store = JSON.parse(raw);
    expect(store.projects).toHaveLength(1);
    expect(store.projects[0].project_id).toBe(created.project_id);
  });

  it('create trims the name and validates length', async () => {
    const p = await service.create({ name: '  spaced  ', description: '' });
    expect(p.name).toBe('spaced');

    await expect(service.create({ name: '', description: '' })).rejects.toBeInstanceOf(AppError);
    await expect(service.create({ name: 'x'.repeat(101), description: '' })).rejects.toBeInstanceOf(
      AppError,
    );
    await expect(
      service.create({ name: 'ok', description: 'y'.repeat(501) }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('list returns only active projects sorted by created_at desc', async () => {
    const first = await service.create({ name: 'a', description: '' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await service.create({ name: 'b', description: '' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const third = await service.create({ name: 'c', description: '' });

    await service.softDelete(second.project_id);
    const list = await service.list();

    expect(list.map((p) => p.project_id)).toEqual([third.project_id, first.project_id]);
  });

  it('softDelete sets deleted_at and excludes from list; re-delete returns 404', async () => {
    const created = await service.create({ name: 'tmp', description: '' });
    await service.softDelete(created.project_id);

    const list = await service.list();
    expect(list).toHaveLength(0);

    await expect(service.softDelete(created.project_id)).rejects.toBeInstanceOf(AppError);
    await expect(service.softDelete('missing')).rejects.toBeInstanceOf(AppError);
  });

  it('softDelete rejects reserved namespace', async () => {
    await expect(service.softDelete('__wiki__')).rejects.toMatchObject({
      code: 'invalid_input',
      status: 400,
    });
  });

  it('getById returns the active project, null for missing, and null for soft-deleted', async () => {
    const created = await service.create({ name: 'lookup-me', description: '' });
    const fetched = await service.getById(created.project_id);
    expect(fetched?.project_id).toBe(created.project_id);
    expect(fetched?.name).toBe('lookup-me');

    const missing = await service.getById('00000000-0000-0000-0000-000000000000');
    expect(missing).toBeNull();

    await service.softDelete(created.project_id);
    const afterDelete = await service.getById(created.project_id);
    expect(afterDelete).toBeNull();
  });

  it('create calls createIndex when index is not found', async () => {
    const fake = makeFakePinecone({ describeBehaviour: 'not-found-then-ready' });
    const svc = createProjectService({
      dataRoot,
      pinecone: fake.client,
      pineconeIndex: 'business-planner-intelligence',
    });
    await svc.create({ name: 'fresh', description: '' });
    expect(fake.calls.create).toBe(1);
  });
});
