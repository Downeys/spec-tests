import { test, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface BootedApi {
  baseUrl: string;
  child: ChildProcess;
  tmpDir: string;
}

async function bootApi(): Promise<BootedApi> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-ui-e2e-'));
  const dataHome = path.join(tmpDir, 'data');
  const configHome = path.join(tmpDir, 'config');
  fs.mkdirSync(path.join(dataHome, 'bp-agent'), { recursive: true });
  fs.mkdirSync(path.join(configHome, 'bp-agent'), { recursive: true });

  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const apiEntry = path.join(repoRoot, 'apps', 'api', 'main.ts');

  // Pin the API to the same port Vite's proxy defaults to (127.0.0.1:4317).
  // Vite's webServer process is launched by Playwright before this test runs,
  // so it cannot observe an env var written from within beforeAll. Aligning on
  // the default URL means the proxy + the spawned API agree without needing to
  // re-thread the port through Playwright's webServer config.
  const child = spawn(process.execPath, ['--import', 'tsx', apiEntry], {
    env: {
      ...process.env,
      HOME: tmpDir,
      XDG_DATA_HOME: dataHome,
      XDG_CONFIG_HOME: configHome,
      BP_AGENT_API_HOST: '127.0.0.1',
      BP_AGENT_API_PORT: '4317',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const baseUrl = await new Promise<string>((resolve, reject) => {
    const onErr = (data: Buffer): void => {
      process.stderr.write(data);
    };
    const onOut = (data: Buffer): void => {
      const text = data.toString('utf8');
      process.stdout.write(text);
      const match = /listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(text);
      if (match?.[1]) {
        resolve(match[1]);
      }
    };
    child.stdout?.on('data', onOut);
    child.stderr?.on('data', onErr);
    child.on('exit', (code) => {
      reject(new Error(`API exited early with code ${String(code)}`));
    });
  });

  return { baseUrl, child, tmpDir };
}

let api: BootedApi | undefined;

test.beforeAll(async () => {
  api = await bootApi();
});

test.afterAll(async () => {
  if (api) {
    api.child.kill('SIGTERM');
    await new Promise<void>((resolve) =>
      api?.child.on('exit', () => {
        resolve();
      }),
    );
    fs.rmSync(api.tmpDir, { recursive: true, force: true });
    api = undefined;
  }
});

test('golden flow: create → list → switch → rename → archive', async ({ page }) => {
  await page.goto('/');

  const banner = page.getByRole('banner', { name: 'API health' });
  await expect(banner).toContainText('bp-agent API: ok');

  const list = page.getByRole('region', { name: 'Strategies' });
  const createSection = page.getByRole('region', { name: 'Create Strategy' });

  // CREATE: alpha (first strategy → becomes active)
  await createSection.getByLabel('Strategy name').fill('alpha');
  await createSection.getByRole('button', { name: 'Create' }).click();
  await expect(banner).toContainText('alpha');
  await expect(list.getByLabel('Strategy alpha')).toContainText('active');
  await expect(createSection.getByLabel('Strategy name')).toHaveValue('');

  // CREATE: bravo (each newly-created Strategy becomes active per the use-case)
  await createSection.getByLabel('Strategy name').fill('bravo');
  await createSection.getByRole('button', { name: 'Create' }).click();
  await expect(banner).toContainText('bravo');
  await expect(list.getByLabel('Strategy bravo')).toContainText('active');

  // LIST: both strategies present
  await expect(list.getByLabel('Strategy alpha')).toBeVisible();
  await expect(list.getByLabel('Strategy bravo')).toBeVisible();

  // Active row (bravo) shows no Archive button (mirrors CLI refusal)
  await expect(list.getByRole('button', { name: 'Archive bravo' })).toHaveCount(0);

  // SWITCH: bravo → alpha
  await list.getByRole('button', { name: 'Switch to alpha' }).click();
  await expect(banner).toContainText('alpha');
  await expect(list.getByLabel('Strategy alpha')).toContainText('active');
  await expect(list.getByLabel('Strategy bravo')).not.toContainText('active');

  // RENAME: bravo → bravo2 (non-active, non-archived)
  await list.getByRole('button', { name: 'Rename bravo' }).click();
  const renameForm = list.getByRole('form', { name: 'Rename bravo' });
  const renameInput = renameForm.getByLabel('New name for bravo');
  await expect(renameInput).toHaveValue('bravo');
  await renameInput.fill('bravo2');
  await renameForm.getByRole('button', { name: 'Save' }).click();
  await expect(list.getByLabel('Strategy bravo2')).toBeVisible();
  await expect(list.getByLabel('Strategy bravo', { exact: true })).toHaveCount(0);

  // ARCHIVE: bravo2 (non-active, non-archived) via inline confirm
  await list.getByRole('button', { name: 'Archive bravo2' }).click();
  const confirm = list.getByRole('group', { name: 'Archive bravo2? confirmation' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Confirm archive bravo2' }).click();

  // After archive, bravo2 is gone from the default (non-all) list
  await expect(list.getByLabel('Strategy bravo2')).toHaveCount(0);
  await expect(list.getByLabel('Strategy alpha')).toContainText('active');

  // Show archived → bravo2 reappears with archived badge and no Switch/Rename/Archive actions
  await page.getByLabel('Show archived').check();
  const archivedRow = list.getByLabel('Strategy bravo2');
  await expect(archivedRow).toBeVisible();
  await expect(archivedRow).toContainText('archived');
  await expect(list.getByRole('button', { name: 'Switch to bravo2' })).toHaveCount(0);
  await expect(list.getByRole('button', { name: 'Archive bravo2' })).toHaveCount(0);
  await expect(list.getByRole('button', { name: 'Rename bravo2' })).toHaveCount(0);
});
