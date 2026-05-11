import { Pool } from 'pg';
import { loadOpenBrainConfig } from './config.js';

let adminPool: Pool | null = null;
let appPool: Pool | null = null;
let appPoolAsserted = false;

export function getAdminPool(): Pool {
  if (adminPool === null) {
    const cfg = loadOpenBrainConfig();
    adminPool = new Pool({ connectionString: cfg.OPENBRAIN_ADMIN_URL });
  }
  return adminPool;
}

export async function getAppPool(): Promise<Pool> {
  if (appPool === null) {
    const cfg = loadOpenBrainConfig();
    appPool = new Pool({ connectionString: cfg.OPENBRAIN_APP_URL });
  }
  if (!appPoolAsserted) {
    await assertAppRoleCannotMutate(appPool);
    appPoolAsserted = true;
  }
  return appPool;
}

export class OpenBrainRoleSplitTripwireError extends Error {
  override readonly name = 'OpenBrainRoleSplitTripwireError';
}

async function assertAppRoleCannotMutate(pool: Pool): Promise<void> {
  try {
    await pool.query('UPDATE _role_assertion SET x = x WHERE false');
  } catch (e: unknown) {
    if (isPermissionDeniedError(e)) {
      return;
    }
    throw e;
  }
  throw new OpenBrainRoleSplitTripwireError(
    'OPENBRAIN_APP_URL accepted an UPDATE against _role_assertion. ' +
      'This means the runtime is connected with credentials that have ' +
      'UPDATE rights on append-only tables — almost certainly the admin ' +
      'role was wired into OPENBRAIN_APP_URL by mistake. Refusing to ' +
      'start; the append-only invariant (ADR-0024) is not enforceable in ' +
      'this configuration.',
  );
}

function isPermissionDeniedError(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const obj = e as { code?: unknown; message?: unknown };
  if (obj.code === '42501') return true;
  if (typeof obj.message === 'string' && obj.message.toLowerCase().includes('permission denied')) {
    return true;
  }
  return false;
}

export function resetPoolsForTesting(): void {
  adminPool = null;
  appPool = null;
  appPoolAsserted = false;
}
