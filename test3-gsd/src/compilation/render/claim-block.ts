// src/compilation/render/claim-block.ts
// Render one claim as an Obsidian quote block with confidence + status + sources.

import type { Claim, Source } from '@/onebrain/types.js';

export function renderClaimBlock(claim: Claim, _sources: Source[]): string {
  return [
    `> ${claim.text}`,
    `> — [[claim:${claim.id}]] confidence=${Number(claim.confidence)} status=${claim.status}`,
    '',
  ].join('\n');
}

export function renderClaimBlockWithSources(
  claim: Claim,
  citedSourceIds: string[],
): string {
  const sourcesLine =
    citedSourceIds.length > 0
      ? `> — sources: ${citedSourceIds.map((id) => `[[source:${id}]]`).join(', ')}`
      : null;
  const lines = [
    `> ${claim.text}`,
    `> — [[claim:${claim.id}]] confidence=${Number(claim.confidence)} status=${claim.status}`,
    sourcesLine,
    '',
  ].filter((l): l is string => l !== null);
  return lines.join('\n');
}
