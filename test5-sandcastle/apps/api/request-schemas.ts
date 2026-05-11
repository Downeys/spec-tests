import { z } from 'zod';

export const listStrategiesQuery = z
  .object({
    all: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
  })
  .strict();

export const createStrategyRequest = z.object({ name: z.string() }).strict();

export const switchActiveStrategyRequest = z.object({ name: z.string() }).strict();

const renameBody = z.object({ newName: z.string() }).strict();
const archiveBody = z.object({ archived: z.literal(true), reason: z.string().optional() }).strict();

export const patchStrategyRequest = z.union([renameBody, archiveBody]);
