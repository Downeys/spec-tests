import 'dotenv/config';
import type { Config } from 'drizzle-kit';

export default {
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
  schema: './src/onebrain/schema.ts',
  out: './migrations', // drizzle-kit pull writes here; we only USE pull, never push
} satisfies Config;
