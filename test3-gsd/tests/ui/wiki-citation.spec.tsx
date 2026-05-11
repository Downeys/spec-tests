// @vitest-environment jsdom
// tests/ui/wiki-citation.spec.tsx
// Wave 0 probe — VALIDATION row UI-04.
//
// Asserts:
//   - Header + excerpt + Open-in-Obsidian + Copy path buttons present
//   - obsidian:// URL is correctly URL-encoded (slash → %2F)
//   - Custom vaultName overrides the default 'vault'

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import WikiCitation from '@/ui/components/WikiCitation';

afterEach(() => cleanup());

describe('WikiCitation (UI-04)', () => {
  it('renders header, excerpt, Open-in-Obsidian button, and Copy path button', () => {
    render(
      <WikiCitation
        topicSlug="pricing"
        excerpt="The market is sizeable."
        vaultRelPath="topics/pricing.md"
      />,
    );
    expect(screen.getByText(/From the wiki/)).toBeInTheDocument();
    expect(screen.getByText(/The market is sizeable/)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /open pricing in obsidian/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /copy vault path/i }),
    ).toBeInTheDocument();
  });

  it('constructs correctly URL-encoded obsidian:// URL', () => {
    render(
      <WikiCitation
        topicSlug="pricing"
        excerpt="..."
        vaultRelPath="topics/pricing.md"
      />,
    );
    const link = screen.getByRole('link', { name: /open pricing in obsidian/i });
    expect(link).toHaveAttribute(
      'href',
      'obsidian://open?vault=vault&file=topics%2Fpricing.md',
    );
  });

  it('uses custom vault name when provided', () => {
    render(
      <WikiCitation
        topicSlug="pricing"
        excerpt="..."
        vaultRelPath="topics/pricing.md"
        vaultName="my-vault"
      />,
    );
    const link = screen.getByRole('link', { name: /open pricing in obsidian/i });
    expect(link.getAttribute('href')).toContain('vault=my-vault');
  });
});
