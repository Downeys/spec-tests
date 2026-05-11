// tests/setup/voyage-mock.ts — vi.mock for unit suite (RESEARCH.md §Pattern 2)
import { vi } from 'vitest';

vi.mock('@/onebrain/embed', () => ({
  embed: vi.fn(async () => Array.from({ length: 1024 }, () => Math.random())),
  EMBEDDING_DIMENSION: 1024,
}));
