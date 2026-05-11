// @vitest-environment jsdom
// tests/ui/claim-chip.spec.tsx
// Wave 0 probe — VALIDATION row data-claim-id (D-09).
//
// Asserts:
//   1. renderWithClaimChips replaces `[[claim:<ULID>]]` text tokens with
//      <ClaimChip> elements when the ULID is in the knownClaims Map
//      (chunk-before-text path).
//   2. Match by 8-char prefix against the known full ULID
//      (coordinator-identity emits prefix tokens; chunk carries full ULID).
//   3. Tokens without a matching known ULID fall back to literal bracket
//      text (race-safe).
//   4. The chip displays the truncated ULID (last 6 chars) in its label.
//   5. Re-render with an updated knownClaims Map swaps the literal
//      bracket text for a <ClaimChip> (text-before-chunk race-safety).

import { useEffect, useState } from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, screen, act } from '@testing-library/react';
import ClaimChip, {
  renderWithClaimChips,
  type ClaimSummary,
} from '@/ui/components/ClaimChip';

afterEach(() => cleanup());

const FULL_ULID = '01J9X1111111111111111111A1';
const PREFIX = '01J9X111';

describe('ClaimChip + renderWithClaimChips (D-09 inline citation)', () => {
  it('replaces a `[[claim:<ULID>]]` token with a <ClaimChip> when chunk has already arrived', () => {
    const known = new Map<string, ClaimSummary>([
      [FULL_ULID, { ulid: FULL_ULID, text: 'TAM hypothesis' }],
    ]);
    const text = `Per [[claim:${FULL_ULID}]] the market is sizeable.`;
    const { container } = render(<>{renderWithClaimChips(text, known)}</>);
    const chip = container.querySelector(`[data-claim-ulid="${FULL_ULID}"]`);
    expect(chip).not.toBeNull();
    expect(chip?.textContent).toContain(FULL_ULID.slice(-6));
    expect(container.textContent).not.toContain(`[[claim:${FULL_ULID}]]`);
  });

  it('matches by 8-char prefix against the known full ULID (coordinator-identity emits prefix tokens)', () => {
    const known = new Map<string, ClaimSummary>([
      [FULL_ULID, { ulid: FULL_ULID, text: 'TAM hypothesis' }],
    ]);
    const text = `Per [[claim:${PREFIX}…]] the market is sizeable.`;
    const { container } = render(<>{renderWithClaimChips(text, known)}</>);
    const chip = container.querySelector(`[data-claim-ulid="${FULL_ULID}"]`);
    expect(chip).not.toBeNull();
  });

  it('falls back to literal bracket text when no chunk has yet arrived (race-safe)', () => {
    const known = new Map<string, ClaimSummary>(); // empty — no chunk seen yet
    const text = `Per [[claim:${FULL_ULID}]] the market is sizeable.`;
    const { container } = render(<>{renderWithClaimChips(text, known)}</>);
    expect(container.querySelector('[data-claim-ulid]')).toBeNull();
    expect(container.textContent).toContain(`[[claim:${FULL_ULID}]]`);
  });

  it('swaps literal text for ClaimChip on re-render when the chunk arrives AFTER the text (text-before-chunk race-safety)', async () => {
    function Harness() {
      const [known, setKnown] = useState(new Map<string, ClaimSummary>());
      useEffect(() => {
        const t = setTimeout(() => {
          setKnown((prev) => {
            const next = new Map(prev);
            next.set(FULL_ULID, { ulid: FULL_ULID, text: 'TAM hypothesis' });
            return next;
          });
        }, 0);
        return () => clearTimeout(t);
      }, []);
      const text = `Per [[claim:${FULL_ULID}]] the market is sizeable.`;
      return <>{renderWithClaimChips(text, known)}</>;
    }
    const { container } = render(<Harness />);
    // First synchronous render: no chunk yet, literal text present.
    expect(container.textContent).toContain(`[[claim:${FULL_ULID}]]`);
    // Flush the microtask + setTimeout so React picks up the state update.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    const chip = container.querySelector(`[data-claim-ulid="${FULL_ULID}"]`);
    expect(chip).not.toBeNull();
    expect(container.textContent).not.toContain(`[[claim:${FULL_ULID}]]`);
  });

  it('ClaimChip renders truncated ULID label (last 6 chars)', () => {
    render(<ClaimChip ulid={FULL_ULID} />);
    const button = screen.getByRole('button');
    expect(button.textContent).toContain(FULL_ULID.slice(-6));
    expect(button).toHaveAttribute('data-claim-ulid', FULL_ULID);
  });
});
