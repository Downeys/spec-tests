import { z } from 'zod';

const strategyListItemSchema = z.object({
  name: z.string(),
  status: z.enum(['active', 'archived']),
  isActive: z.boolean(),
});

export const listStrategiesResponse = z.object({
  items: z.array(strategyListItemSchema),
});

export const createStrategyResponse = z.object({
  strategy: z.object({
    name: z.string(),
    status: z.enum(['active', 'archived']),
    isActive: z.boolean(),
  }),
});

export const switchActiveStrategyResponse = z.object({
  strategy: z.object({ name: z.string() }),
});

export const patchStrategyResponse = z.object({
  strategy: z.object({
    name: z.string(),
    status: z.enum(['active', 'archived']),
  }),
});
