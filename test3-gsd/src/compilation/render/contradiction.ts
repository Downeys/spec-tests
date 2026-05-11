// src/compilation/render/contradiction.ts
// CRIT-05 / COMP-09: contradictions are NEVER smoothed. Both sides rendered with full provenance.

import type { Claim, Source } from '@/onebrain/types.js';

export function renderContradictionCallout(
  a: Claim,
  b: Claim,
  _sources: Source[],
  citedByA: string[] = [],
  citedByB: string[] = [],
): string {
  const aStatus = `confidence ${Number(a.confidence)}, ${a.status}`;
  const bStatus = `confidence ${Number(b.confidence)}, ${b.status}`;
  const aSources =
    citedByA.length > 0
      ? citedByA.map((id) => `[[source:${id}]]`).join(', ')
      : '(no source)';
  const bSources =
    citedByB.length > 0
      ? citedByB.map((id) => `[[source:${id}]]`).join(', ')
      : '(no source)';
  return [
    '> [!warning] Contradiction',
    '> Two sources disagree on this point.',
    `> - **Claim A** (${aStatus}): "${a.text}"`,
    `>   *— [[claim:${a.id}]], cites ${aSources}*`,
    `> - **Claim B** (${bStatus}): "${b.text}"`,
    `>   *— [[claim:${b.id}]], cites ${bSources}*`,
    '',
  ].join('\n');
}
