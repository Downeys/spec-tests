// tests/integration/eval-meta.test.ts
// EVAL-01 sentinel: this test exists to bind the meta requirement
// "Vitest passes for db, repos, renderer" to a single executable assertion.
//
// It does NOT re-run the other tests; instead it asserts the test files exist and
// the binary `npm test` exits 0 when this entire suite is green. The actual proof
// that EVAL-01 holds is the success of the rest of the integration suite — this
// file is the labeled gate.

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

describe('EVAL-01 — integration suite presence + naming', () => {
  const required = [
    'tests/integration/pipeline.test.ts', // SC #2 + #3, CRIT-05 keystone
    'tests/integration/hash-stability.test.ts', // SC #4 keystone
    'tests/integration/reingest-skip.test.ts', // D-04 idempotency
    'tests/integration/append-only.test.ts', // Plan 03: DATA-06 supersede invariant
    'tests/integration/schema-shape.test.ts', // Plan 02: DATA-01..04, DATA-07
    'tests/integration/schema-parity.test.ts', // Plan 02: drizzle parity
  ];

  for (const f of required) {
    it(`includes ${f} in the suite`, async () => {
      await expect(fs.access(path.resolve(f))).resolves.toBeUndefined();
    });
  }

  it('names match the REQ → Test map in 01-VALIDATION.md', async () => {
    const validation = await fs.readFile(
      '.planning/phases/01-walking-skeleton/01-VALIDATION.md',
      'utf-8',
    );
    for (const f of required) {
      expect(
        validation,
        `01-VALIDATION.md does not reference ${f}`,
      ).toContain(path.basename(f));
    }
  });
});
