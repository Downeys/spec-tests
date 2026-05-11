import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { Strategy } from './strategy.js';
import { createStrategyName } from './strategy-name.js';
import { isOk, isErr } from '../../dtos/result.js';

const validSlugArb = fc
  .stringMatching(/^[a-z][a-z0-9-]{0,10}[a-z0-9]$/)
  .filter((s) => !s.includes('--') && s.length >= 2);

type Action = { kind: 'rename'; slug: string } | { kind: 'archive'; reason?: string };

const actionArb: fc.Arbitrary<Action> = fc.oneof(
  validSlugArb.map((slug): Action => ({ kind: 'rename', slug })),
  fc
    .option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined })
    .map((reason): Action => {
      if (reason !== undefined) return { kind: 'archive', reason };
      return { kind: 'archive' };
    }),
);

function applyAction(strategy: Strategy, action: Action): { ok: boolean; error?: string } {
  if (action.kind === 'rename') {
    const nameResult = createStrategyName(action.slug);
    if (!isOk(nameResult)) return { ok: false, error: 'invalid-name' };
    const result = strategy.rename(nameResult.value);
    return isOk(result) ? { ok: true } : { ok: false, error: result.error.reason };
  }
  const result = strategy.archive(action.reason, () => new Date());
  return isOk(result) ? { ok: true } : { ok: false, error: result.error.reason };
}

describe('Strategy state machine (property-based)', () => {
  it('archived strategies reject all further mutations', () => {
    fc.assert(
      fc.property(
        validSlugArb,
        fc.array(actionArb, { minLength: 1, maxLength: 20 }),
        (initialSlug, actions) => {
          const createResult = Strategy.create(initialSlug);
          if (!isOk(createResult)) return;
          const strategy = createResult.value;

          let archived = false;
          for (const action of actions) {
            const before = strategy.isArchived;
            const result = applyAction(strategy, action);

            if (before) {
              expect(result.ok).toBe(false);
              expect(strategy.isArchived).toBe(true);
            }

            if (!archived && action.kind === 'archive' && result.ok) {
              archived = true;
            }
          }
        },
      ),
    );
  });

  it('archive is idempotent in its refusal — always IllegalTransition on second attempt', () => {
    fc.assert(
      fc.property(validSlugArb, (slug) => {
        const createResult = Strategy.create(slug);
        if (!isOk(createResult)) return;
        const strategy = createResult.value;

        const first = strategy.archive(undefined, () => new Date());
        expect(isOk(first)).toBe(true);

        const second = strategy.archive('retry', () => new Date());
        expect(isErr(second)).toBe(true);
        if (isErr(second)) {
          expect(second.error.tag).toBe('IllegalTransition');
        }
      }),
    );
  });

  it('rename succeeds any number of times on active strategies', () => {
    fc.assert(
      fc.property(
        validSlugArb,
        fc.array(validSlugArb, { minLength: 1, maxLength: 10 }),
        (initialSlug, renameSlugs) => {
          const createResult = Strategy.create(initialSlug);
          if (!isOk(createResult)) return;
          const strategy = createResult.value;

          for (const slug of renameSlugs) {
            const nameResult = createStrategyName(slug);
            if (!isOk(nameResult)) continue;
            const result = strategy.rename(nameResult.value);
            expect(isOk(result)).toBe(true);
            expect(strategy.name).toBe(slug);
          }

          expect(strategy.isArchived).toBe(false);
        },
      ),
    );
  });

  it('the legal-transition matrix holds for arbitrary action sequences', () => {
    fc.assert(
      fc.property(
        validSlugArb,
        fc.array(actionArb, { minLength: 0, maxLength: 30 }),
        (initialSlug, actions) => {
          const createResult = Strategy.create(initialSlug);
          if (!isOk(createResult)) return;
          const strategy = createResult.value;

          for (const action of actions) {
            const wasArchived = strategy.isArchived;

            if (action.kind === 'archive') {
              const result = strategy.archive(action.reason, () => new Date());
              if (wasArchived) {
                expect(isErr(result)).toBe(true);
              } else {
                expect(isOk(result)).toBe(true);
                expect(strategy.isArchived).toBe(true);
              }
            } else {
              const nameResult = createStrategyName(action.slug);
              if (!isOk(nameResult)) continue;
              const result = strategy.rename(nameResult.value);
              if (wasArchived) {
                expect(isErr(result)).toBe(true);
              } else {
                expect(isOk(result)).toBe(true);
              }
            }
          }
        },
      ),
    );
  });

  it('snapshot always reflects current state after any sequence of transitions', () => {
    fc.assert(
      fc.property(
        validSlugArb,
        fc.array(actionArb, { minLength: 0, maxLength: 15 }),
        (initialSlug, actions) => {
          const createResult = Strategy.create(initialSlug);
          if (!isOk(createResult)) return;
          const strategy = createResult.value;

          for (const action of actions) {
            applyAction(strategy, action);
          }

          const snap = strategy.snapshot();
          expect(snap.id).toBe(strategy.id);
          expect(snap.name).toBe(strategy.name);
          expect(snap.status).toEqual(strategy.status);
          expect(snap.createdAt).toBe(strategy.createdAt);
        },
      ),
    );
  });
});
