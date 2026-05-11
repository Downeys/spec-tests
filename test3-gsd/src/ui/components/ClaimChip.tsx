// src/ui/components/ClaimChip.tsx
// Phase 2 plan 02-07 Task 6 — D-09 inline claim citation.
//
// Renders a pill showing the last 6 chars of the claim ULID; clicking
// opens a popover with the full claim text + source URL fetched lazily
// from the existing /api/claims surface (Phase 1 repo layer). On 404 or
// network failure the chip falls back to ULID-only display silently.
//
// Wired by the data-claim-id chunk handler in App.tsx — the handler
// maintains an in-memory Map<ulid, ClaimSummary> populated as
// `data-claim-id` SSE chunks arrive (chunk shape per src/server/streaming.ts
// from plan 02-06: { type: 'data-claim-id', value: { claimId, sourceTool } }).
// `renderWithClaimChips()` replaces `[[claim:<ULID-or-prefix>…]]` text
// tokens in the streamed assistant message with <ClaimChip ulid={ULID}/>
// elements during render.
//
// Race-safety: matches by full ULID OR by 8-char prefix (the
// coordinator-identity D-09 rule emits the prefix; the data-claim-id
// chunk carries the full ULID). If no chunk has arrived yet, the
// literal bracket text is rendered and is replaced on the next render
// once the chunk lands and the parent component re-renders with an
// updated knownClaims Map.

import { useState, type ReactNode } from 'react';

export interface ClaimSummary {
  ulid: string;
  text?: string;
  sourceUrl?: string;
}

export interface ClaimChipProps {
  ulid: string;
  // Optional initial summary populated from the data-claim-id chunk
  // handler's Map; if absent, the chip lazy-fetches on first open.
  summary?: ClaimSummary;
}

export default function ClaimChip({ ulid, summary }: ClaimChipProps) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<ClaimSummary | undefined>(summary);
  const [loading, setLoading] = useState(false);

  const truncated = ulid.slice(-6);

  const handleOpen = async () => {
    setOpen((v) => !v);
    if (!loaded && !loading) {
      setLoading(true);
      try {
        const res = await fetch(`/api/claims/${encodeURIComponent(ulid)}`);
        if (res.ok) {
          const data = (await res.json()) as ClaimSummary;
          setLoaded({ ulid, text: data.text, sourceUrl: data.sourceUrl });
        }
      } catch {
        // silent — chip shows ULID-only.
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={handleOpen}
        aria-label={`Claim ${ulid}`}
        aria-expanded={open}
        className="inline-flex items-center px-2 py-0.5 mx-0.5 rounded-full bg-muted text-xs font-mono text-muted-foreground hover:text-foreground border border-border transition-colors"
        data-claim-ulid={ulid}
      >
        claim:{truncated}
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute z-20 left-0 top-full mt-1 min-w-[16rem] max-w-sm p-3 rounded-md bg-background border border-border shadow-lg text-xs"
        >
          <div className="font-mono text-muted-foreground mb-1">{ulid}</div>
          {loading && <div className="italic">Loading…</div>}
          {!loading && loaded?.text && (
            <div className="text-foreground">{loaded.text}</div>
          )}
          {!loading && loaded?.sourceUrl && (
            <div className="mt-1 truncate">
              Source:{' '}
              <a href={loaded.sourceUrl} className="underline">
                {loaded.sourceUrl}
              </a>
            </div>
          )}
          {!loading && !loaded?.text && !summary?.text && (
            <div className="italic text-muted-foreground">
              Claim metadata not yet available — try again after the message
              finishes streaming.
            </div>
          )}
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Token-replacement helper used by the data-claim-id chunk handler.
// ---------------------------------------------------------------------------
//
// Splits a streamed text fragment around `[[claim:<ULID-or-prefix>…?]]`
// tokens and emits ClaimChip elements for each match. Race-safe: matches
// by full ULID OR by 8-char prefix against the chunk-known Map; if no
// match yet, falls back to literal text (which becomes a ClaimChip on
// the next render once the chunk arrives).
//
// The regex captures one or more uppercase ULID chars (Crockford base32
// is `[0-9A-HJKMNP-TV-Z]` but the inline token may use a relaxed
// `[0-9A-Z]+` form; the chunk-side full ULID is the authority).
export const CLAIM_TOKEN_RE = /\[\[claim:([0-9A-Z]+)[…]?\]\]/g;

export function renderWithClaimChips(
  text: string,
  knownClaims: Map<string, ClaimSummary>,
): ReactNode[] {
  const out: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  // Reset the regex state — module-level regex with `g` flag carries
  // lastIndex across calls.
  CLAIM_TOKEN_RE.lastIndex = 0;
  while ((match = CLAIM_TOKEN_RE.exec(text)) !== null) {
    if (match.index > lastIndex) out.push(text.slice(lastIndex, match.index));
    const tokenIdent = match[1];
    // Try exact ULID match first; fall back to prefix match against any
    // known full ULID.
    let resolvedUlid = knownClaims.has(tokenIdent) ? tokenIdent : undefined;
    if (!resolvedUlid) {
      for (const fullUlid of knownClaims.keys()) {
        if (fullUlid.startsWith(tokenIdent)) {
          resolvedUlid = fullUlid;
          break;
        }
      }
    }
    if (resolvedUlid) {
      out.push(
        <ClaimChip
          key={`${match.index}-${resolvedUlid}`}
          ulid={resolvedUlid}
          summary={knownClaims.get(resolvedUlid)}
        />,
      );
    } else {
      // No data-claim-id chunk has arrived yet for this token — render
      // literal text; re-render on next chunk arrival will replace it.
      out.push(match[0]);
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) out.push(text.slice(lastIndex));
  return out;
}
