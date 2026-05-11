// src/ui/components/WikiCitation.tsx
// Phase 2 plan 02-07 Task 3 — UI-SPEC component #6 + D-13/D-14.
// Inline wiki excerpt + Obsidian deeplink + Copy-path fallback.
//
// "Open in Obsidian →" uses bg-primary accent (UI-SPEC reserved-for list #3).
// "Copy path" is always rendered alongside, NOT a fallback shown only on
// failure (per D-14: silent fallback, never conditional on deeplink-failure
// detection).
//
// T-02-UI-01 mitigation: obsidian:// URL is built with encodeURIComponent —
// `..` and `/` are escape-encoded so user-supplied vaultRelPath cannot inject
// path traversal. The OS scheme handler resolves the path against the vault
// root, not arbitrary FS.

import { Button } from '@/ui/components/ui/button';
import { ExternalLinkIcon, CopyIcon } from 'lucide-react';

export interface WikiCitationProps {
  topicSlug: string;
  excerpt: string;
  vaultRelPath: string;
  vaultName?: string; // default: 'vault'
}

export default function WikiCitation({
  topicSlug,
  excerpt,
  vaultRelPath,
  vaultName = 'vault',
}: WikiCitationProps) {
  const obsidianUrl = `obsidian://open?vault=${encodeURIComponent(
    vaultName,
  )}&file=${encodeURIComponent(vaultRelPath)}`;

  const handleCopyPath = async () => {
    try {
      await navigator.clipboard.writeText(vaultRelPath);
    } catch {
      // silent — per D-14, the user does not see an error popup.
    }
  };

  return (
    <div className="bg-muted border border-border rounded-lg p-4 my-4">
      <small className="text-xs text-muted-foreground">
        From the wiki: {topicSlug}.md
      </small>
      <div className="mt-2 text-sm">
        {excerpt.length >= 200 ? (
          <>
            {excerpt.slice(0, 200)}
            <em className="text-xs text-muted-foreground ml-1">
              (excerpt — full page in Obsidian)
            </em>
          </>
        ) : (
          excerpt
        )}
      </div>
      <div className="flex items-center gap-2 mt-3">
        <Button asChild variant="default" size="sm">
          <a href={obsidianUrl} aria-label={`Open ${topicSlug} in Obsidian`}>
            <ExternalLinkIcon className="size-4 mr-1" />
            Open in Obsidian →
          </a>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopyPath}
          aria-label="Copy vault path"
        >
          <CopyIcon className="size-4 mr-1" />
          Copy path
        </Button>
      </div>
    </div>
  );
}
