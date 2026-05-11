// tests/unit/env.test.ts — uses subprocess to avoid module-cache pollution.
// BLOCKER 2 fix: spawn `npx tsx <script-file>` so the subprocess can `await import('./src/lib/env.ts')`.
// Node alone cannot dynamically import .ts files; the previous `node --input-type=module`
// pattern always failed the import itself, making negative tests indistinguishable from
// harness breakage. Includes a positive case to prove the harness works.
//
// Implementation note (cross-platform): we write the script to a temp .ts file and pass
// the file path to `npx tsx` rather than using `tsx -e <script>`. This avoids Windows
// cmd.exe shell-quoting issues that mangle single quotes inside `-e` payloads. Behavior
// is identical to `-e` in spirit: subprocess runs the script with stripped/overridden env.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

let scratchDir: string;

beforeAll(() => {
  scratchDir = mkdtempSync(join(tmpdir(), 'bsp-env-test-'));
});
afterAll(() => {
  // best-effort cleanup; tests have already finished
  try {
    require('node:fs').rmSync(scratchDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

function runEnvLoader(envOverride: Record<string, string | undefined>) {
  // Build a self-contained TS script. Use absolute file:// URL so dynamic import works on Windows
  // (Node's ESM loader rejects bare drive-letter paths like "c:/...").
  const envFileUrl = pathToFileURL(join(process.cwd(), 'src/lib/env.ts')).href;
  const lines = Object.entries(envOverride).map(([k, v]) =>
    v === undefined
      ? `delete process.env.${k};`
      : `process.env.${k} = ${JSON.stringify(v)};`,
  );
  const script = `
${lines.join('\n')}
await import(${JSON.stringify(envFileUrl)})
  .then((m) => console.log('OK:' + m.env.DATABASE_URL))
  .catch((e) => { console.error(e.message); process.exit(1); });
`;
  // Use .mts extension to force ESM output (needed for top-level await).
  // Without this, tsx infers cjs from the temp dir context and rejects top-level await.
  const scriptPath = join(
    scratchDir,
    `env-runner-${Date.now()}-${Math.random().toString(36).slice(2)}.mts`,
  );
  writeFileSync(scriptPath, script, 'utf8');
  // Build a clean env: keep only the system vars npx/tsx need (PATH, PATHEXT, etc.).
  // Strip the project's .env-derived values so negative cases aren't masked
  // (PGADMIN_DEFAULT_EMAIL=admin@local fails z.email(); VOYAGE_API_KEY='' fails z.min(1)).
  // cwd points at scratchDir so dotenv's auto-discovery doesn't find the project .env.
  const cleanEnv: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    PATHEXT: process.env.PATHEXT,
    SystemRoot: process.env.SystemRoot,
    USERPROFILE: process.env.USERPROFILE,
    APPDATA: process.env.APPDATA,
    LOCALAPPDATA: process.env.LOCALAPPDATA,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    HOME: process.env.HOME,
  };
  for (const [k, v] of Object.entries(envOverride)) {
    if (v !== undefined) cleanEnv[k] = v;
  }
  try {
    return spawnSync('npx', ['tsx', scriptPath], {
      stdio: 'pipe',
      shell: process.platform === 'win32',
      env: cleanEnv,
      cwd: scratchDir,
    });
  } finally {
    try {
      unlinkSync(scriptPath);
    } catch {
      /* ignore */
    }
  }
}

describe('env loader (INFRA-07)', () => {
  it('throws if DATABASE_URL missing', () => {
    const result = runEnvLoader({ DATABASE_URL: undefined });
    expect(result.status).not.toBe(0);
    expect(result.stderr.toString() + result.stdout.toString()).toMatch(/DATABASE_URL/);
  });

  it('throws if VOYAGE_API_KEY missing', () => {
    const result = runEnvLoader({ VOYAGE_API_KEY: undefined });
    expect(result.status).not.toBe(0);
    expect(result.stderr.toString() + result.stdout.toString()).toMatch(/VOYAGE_API_KEY/);
  });

  it('error message points users to .env.example', () => {
    const result = runEnvLoader({ DATABASE_URL: undefined, VOYAGE_API_KEY: undefined });
    const out = result.stderr.toString() + result.stdout.toString();
    expect(out).toMatch(/\.env\.example/);
  });

  // BLOCKER 2 positive case — proves the harness itself works.
  // Without this test, a "green" negative test could mean the harness is broken
  // but failing for the wrong reason (e.g., tsx not found, .ts import failing).
  // Phase 2 (02-01): added ANTHROPIC_API_KEY + TAVILY_API_KEY since the env schema
  // now requires both at process boot (PATTERNS lines 469-474; RESEARCH landmine #5).
  it('with all env vars set, the loader returns env.DATABASE_URL', () => {
    const result = runEnvLoader({
      DATABASE_URL: 'postgres://bsp:test@localhost:5432/businessplanner',
      POSTGRES_PASSWORD: 'test-password',
      VOYAGE_API_KEY: 'test-key-not-real',
      ANTHROPIC_API_KEY: 'test-anthropic-key-not-real',
      TAVILY_API_KEY: 'test-tavily-key-not-real',
    });
    expect(result.status, `harness or loader failure: ${result.stderr.toString()}`).toBe(0);
    expect(result.stdout.toString()).toContain(
      'OK:postgres://bsp:test@localhost:5432/businessplanner',
    );
  });

  // Phase 2 (02-01): new negative cases for the two new required keys.
  it('throws if ANTHROPIC_API_KEY missing', () => {
    const result = runEnvLoader({
      DATABASE_URL: 'postgres://bsp:test@localhost:5432/businessplanner',
      POSTGRES_PASSWORD: 'test-password',
      VOYAGE_API_KEY: 'test-key-not-real',
      TAVILY_API_KEY: 'test-tavily-key-not-real',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr.toString() + result.stdout.toString()).toMatch(/ANTHROPIC_API_KEY/);
  });

  it('throws if TAVILY_API_KEY missing', () => {
    const result = runEnvLoader({
      DATABASE_URL: 'postgres://bsp:test@localhost:5432/businessplanner',
      POSTGRES_PASSWORD: 'test-password',
      VOYAGE_API_KEY: 'test-key-not-real',
      ANTHROPIC_API_KEY: 'test-anthropic-key-not-real',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr.toString() + result.stdout.toString()).toMatch(/TAVILY_API_KEY/);
  });
});
