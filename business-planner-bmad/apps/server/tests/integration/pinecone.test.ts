import { describe, expect, it } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import type { ProjectId } from '@bp/shared';
import {
  createPineconeClient,
  ensureIndex,
  isReservedNamespace,
  namespaceFor,
} from '../../src/clients/pinecone.js';

const shouldRun = process.env['INTEGRATION'] === '1' && !!process.env['PINECONE_API_KEY'];

const indexName = process.env['PINECONE_INDEX'] ?? 'business-planner-intelligence';

describe.skipIf(!shouldRun)('pinecone integration', () => {
  it('namespaceFor returns the projectId unchanged', () => {
    const id = uuidv4() as unknown as ProjectId;
    expect(namespaceFor(id)).toBe(id);
  });

  it('isReservedNamespace reserves __wiki__ and accepts UUIDs', () => {
    expect(isReservedNamespace('__wiki__')).toBe(true);
    expect(isReservedNamespace(uuidv4())).toBe(false);
  });

  it('ensureIndex is idempotent and leaves the index ready', async () => {
    const client = createPineconeClient({
      ANTHROPIC_API_KEY: 'sk-test',
      PINECONE_API_KEY: process.env['PINECONE_API_KEY'] ?? '',
      PINECONE_INDEX: indexName,
      DATA_ROOT: './data',
      PORT: 3000,
      WEB_PORT: 5173,
      NODE_ENV: 'test',
    });

    await ensureIndex(client, indexName);
    await ensureIndex(client, indexName);

    const description = await client.describeIndex(indexName);
    expect(description.status.ready).toBe(true);
  }, 120_000);
});
