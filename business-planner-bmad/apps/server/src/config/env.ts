import { z } from 'zod';

export const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY is required'),

  TAVILY_API_KEY: z.string().optional(),
  PINECONE_API_KEY: z.string().optional(),
  VOYAGE_API_KEY: z.string().optional(),
  DATABASE_URL: z.string().optional(),

  PINECONE_INDEX: z.string().min(1).default('business-planner-intelligence'),
  DATA_ROOT: z.string().default('./data'),

  PORT: z.coerce.number().int().positive().max(65535).default(3000),
  WEB_PORT: z.coerce.number().int().positive().max(65535).default(5173),

  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type Env = z.infer<typeof envSchema>;
