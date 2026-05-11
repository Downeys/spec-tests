import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import type { Pinecone } from '@pinecone-database/pinecone';
import type { IsoUtcTimestamp, Project, ProjectId } from '@bp/shared';
import { AppError } from '../errors/AppError.js';
import { ensureIndex, isReservedNamespace } from '../clients/pinecone.js';

export interface CreateProjectInput {
  name: string;
  description: string;
}

export interface ProjectService {
  create(input: CreateProjectInput): Promise<Project>;
  list(): Promise<Project[]>;
  getById(projectId: string): Promise<Project | null>;
  softDelete(projectId: string): Promise<void>;
}

export interface ProjectServiceOptions {
  dataRoot: string;
  pinecone: Pinecone | (() => Pinecone);
  pineconeIndex: string;
}

interface Store {
  projects: Project[];
}

function emptyStore(): Store {
  return { projects: [] };
}

async function readStore(filePath: string): Promise<Store> {
  if (!existsSync(filePath)) return emptyStore();
  const raw = await readFile(filePath, 'utf8');
  if (raw.trim() === '') return emptyStore();
  let parsed: Partial<Store>;
  try {
    parsed = JSON.parse(raw) as Partial<Store>;
  } catch {
    throw new AppError('internal', 'projects.json is corrupt and cannot be parsed', {
      status: 500,
    });
  }
  if (!Array.isArray(parsed.projects)) return emptyStore();
  return { projects: parsed.projects };
}

async function writeStoreAtomic(filePath: string, data: Store): Promise<void> {
  const dir = path.dirname(filePath);
  await mkdir(dir, { recursive: true });
  const tmp = `${filePath}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await rename(tmp, filePath);
}

function validateCreateInput(input: CreateProjectInput): void {
  if (typeof input.name !== 'string') {
    throw new AppError('invalid_input', 'name is required', { status: 400 });
  }
  const name = input.name.trim();
  if (name.length < 1 || name.length > 100) {
    throw new AppError('invalid_input', 'name must be 1-100 characters', { status: 400 });
  }
  if (typeof input.description !== 'string') {
    throw new AppError('invalid_input', 'description is required', { status: 400 });
  }
  if (input.description.length > 500) {
    throw new AppError('invalid_input', 'description must be at most 500 characters', {
      status: 400,
    });
  }
}

export function createProjectService(opts: ProjectServiceOptions): ProjectService {
  const filePath = path.join(opts.dataRoot, 'projects.json');

  let chain: Promise<unknown> = Promise.resolve();
  function serialize<T>(fn: () => Promise<T>): Promise<T> {
    const next = chain.then(fn, fn);
    chain = next.catch(() => undefined);
    return next;
  }

  return {
    async create(input) {
      validateCreateInput(input);
      const name = input.name.trim();

      const projectId = uuidv4() as unknown as ProjectId;
      if (isReservedNamespace(projectId)) {
        throw new AppError('invalid_input', 'reserved namespace', { status: 400 });
      }

      const pinecone = typeof opts.pinecone === 'function' ? opts.pinecone() : opts.pinecone;
      await ensureIndex(pinecone, opts.pineconeIndex);

      return serialize(async () => {
        const store = await readStore(filePath);
        const now = new Date().toISOString() as unknown as IsoUtcTimestamp;
        const project: Project = {
          project_id: projectId,
          name,
          description: input.description,
          namespace: projectId,
          created_at: now,
        };
        store.projects.push(project);
        await writeStoreAtomic(filePath, store);
        return project;
      });
    },

    async list() {
      return serialize(async () => {
        const store = await readStore(filePath);
        return store.projects
          .filter((p) => !p.deleted_at)
          .sort((a, b) => {
            if (a.created_at < b.created_at) return 1;
            if (a.created_at > b.created_at) return -1;
            return 0;
          });
      });
    },

    async getById(projectId) {
      return serialize(async () => {
        const store = await readStore(filePath);
        const found = store.projects.find((p) => p.project_id === projectId && !p.deleted_at);
        return found ?? null;
      });
    },

    async softDelete(projectId) {
      if (isReservedNamespace(projectId)) {
        throw new AppError('invalid_input', 'reserved namespace', { status: 400 });
      }
      return serialize(async () => {
        const store = await readStore(filePath);
        const target = store.projects.find((p) => p.project_id === projectId);
        if (!target) {
          throw new AppError('not_found', 'project not found', { status: 404 });
        }
        if (target.deleted_at) {
          throw new AppError('not_found', 'project already deleted', { status: 404 });
        }
        target.deleted_at = new Date().toISOString() as unknown as IsoUtcTimestamp;
        await writeStoreAtomic(filePath, store);
      });
    },
  };
}
