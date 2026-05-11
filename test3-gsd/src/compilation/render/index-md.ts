// src/compilation/render/index-md.ts
// D-16: vault/index.md is REBUILT FROM SCRATCH on every compile.
import type { Source } from '@/onebrain/types.js';

export interface IndexedPage {
  kind: 'framework' | 'entity' | 'topic' | 'decision' | 'source';
  title: string;
  slug: string;
  claimCount: number;
  contradictionCount: number;
  lastUpdated: Date;
}

export function renderIndexMd(pages: IndexedPage[], sources: Source[]): string {
  const topics = pages
    .filter((p) => p.kind === 'topic')
    .sort((a, b) => a.slug.localeCompare(b.slug));
  const sortedSources = [...sources].sort((a, b) => a.id.localeCompare(b.id));

  const lines: string[] = ['# Index', ''];

  lines.push('## Topics');
  if (topics.length === 0) {
    lines.push('_(none yet)_');
  } else {
    for (const p of topics) {
      const updated = p.lastUpdated.toISOString().slice(0, 10);
      lines.push(
        `- [[${p.slug}|${p.title}]] — ${p.claimCount} claims, ${p.contradictionCount} contradictions, last updated ${updated}`,
      );
    }
  }
  lines.push('');

  lines.push(`## Sources (${sortedSources.length})`);
  for (const s of sortedSources) {
    const date = s.ingested_at.toISOString().slice(0, 10);
    const url = s.url ? ` — ${s.url}` : '';
    lines.push(`- ${s.title}${url} — ingested ${date} — id: \`${s.id}\``);
  }
  lines.push('');

  return lines.join('\n');
}
