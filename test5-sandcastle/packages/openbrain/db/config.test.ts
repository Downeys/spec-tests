import { describe, expect, it } from 'vitest';
import { OpenBrainConfigError, loadOpenBrainConfig } from './config.js';

const baseEnv = {
  OPENBRAIN_ADMIN_URL: 'postgres://openbrain_admin:pw@127.0.0.1:5432/openbrain',
  OPENBRAIN_APP_URL: 'postgres://openbrain_app:pw@127.0.0.1:5432/openbrain',
} satisfies NodeJS.ProcessEnv;

describe('loadOpenBrainConfig', () => {
  it('parses both Postgres URLs and an optional Voyage key', () => {
    const cfg = loadOpenBrainConfig({ ...baseEnv, VOYAGE_API_KEY: 'vk_test' });
    expect(cfg.OPENBRAIN_ADMIN_URL).toBe(baseEnv.OPENBRAIN_ADMIN_URL);
    expect(cfg.OPENBRAIN_APP_URL).toBe(baseEnv.OPENBRAIN_APP_URL);
    expect(cfg.VOYAGE_API_KEY).toBe('vk_test');
  });

  it('treats VOYAGE_API_KEY as optional', () => {
    const cfg = loadOpenBrainConfig(baseEnv);
    expect(cfg.VOYAGE_API_KEY).toBeUndefined();
  });

  it('accepts the postgresql:// scheme', () => {
    const cfg = loadOpenBrainConfig({
      OPENBRAIN_ADMIN_URL: 'postgresql://a:b@127.0.0.1:5432/openbrain',
      OPENBRAIN_APP_URL: 'postgresql://c:d@127.0.0.1:5432/openbrain',
    });
    expect(cfg.OPENBRAIN_ADMIN_URL.startsWith('postgresql://')).toBe(true);
  });

  it('throws OpenBrainConfigError when OPENBRAIN_ADMIN_URL is missing', () => {
    expect(() => loadOpenBrainConfig({ OPENBRAIN_APP_URL: baseEnv.OPENBRAIN_APP_URL })).toThrow(
      OpenBrainConfigError,
    );
  });

  it('throws OpenBrainConfigError when OPENBRAIN_APP_URL is missing', () => {
    expect(() => loadOpenBrainConfig({ OPENBRAIN_ADMIN_URL: baseEnv.OPENBRAIN_ADMIN_URL })).toThrow(
      OpenBrainConfigError,
    );
  });

  it('rejects URLs that are not Postgres connection strings', () => {
    expect(() =>
      loadOpenBrainConfig({
        OPENBRAIN_ADMIN_URL: 'http://127.0.0.1:5432/openbrain',
        OPENBRAIN_APP_URL: baseEnv.OPENBRAIN_APP_URL,
      }),
    ).toThrow(OpenBrainConfigError);
  });

  it('refuses identical admin and app URLs (would defeat the role split)', () => {
    expect(() =>
      loadOpenBrainConfig({
        OPENBRAIN_ADMIN_URL: baseEnv.OPENBRAIN_ADMIN_URL,
        OPENBRAIN_APP_URL: baseEnv.OPENBRAIN_ADMIN_URL,
      }),
    ).toThrow(/different roles/);
  });
});
