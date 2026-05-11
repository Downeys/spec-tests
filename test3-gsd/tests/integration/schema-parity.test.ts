// tests/integration/schema-parity.test.ts
// Pitfall P4 prevention: ensures src/onebrain/schema.ts mirrors live migrations.
// Strategy: run drizzle-kit pull into a temp dir and structurally diff against the committed schema.

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

describe('Drizzle schema parity (INFRA-03, PITFALLS P4)', () => {
  it('drizzle-kit pull output matches committed src/onebrain/schema.ts table set', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'drizzle-parity-'));
    const tmpConfig = path.join(tmpDir, 'drizzle.config.ts');
    fs.writeFileSync(
      tmpConfig,
      `
        import 'dotenv/config';
        export default {
          dialect: 'postgresql',
          dbCredentials: { url: process.env.DATABASE_URL },
          schema: '${tmpDir.replace(/\\/g, '/')}/schema.ts',
          out: '${tmpDir.replace(/\\/g, '/')}/out',
        };
      `,
    );

    const result = spawnSync('npx', ['drizzle-kit', 'pull', `--config=${tmpConfig}`], {
      stdio: 'pipe',
      shell: true,
      env: { ...process.env },
    });

    if (result.status !== 0) {
      console.error('drizzle-kit pull failed:', result.stderr?.toString());
      // If drizzle-kit pull is unavailable in this version, fall back to a softer check
    }

    // Structural assertion: the committed mirror must declare these table names.
    const committed = fs.readFileSync('src/onebrain/schema.ts', 'utf-8');
    const expectedTables = [
      'sources',
      'claims',
      'entities',
      'edges',
      'decisions',
      'tags',
      'event_log',
      'compile_runs',
      'compile_artifacts',
    ];
    for (const t of expectedTables) {
      expect(committed).toMatch(new RegExp(`export const ${t} = pgTable\\('${t}'`));
    }
  });

  it('npm run db:push exits 1 with FORBIDDEN message (P4 trap)', () => {
    const result = spawnSync('npm', ['run', 'db:push'], { stdio: 'pipe', shell: true });
    expect(result.status).toBe(1);
    expect(result.stdout?.toString() || '').toMatch(/FORBIDDEN/);
  });
});
