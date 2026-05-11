import { describe, it, expect } from 'vitest';
import { renderIndexMd, type IndexedPage } from '@/compilation/render/index-md';
import type { Source } from '@/onebrain/types';

function mkSource(over: Partial<Source> = {}): Source {
  return {
    id: '01J9XSRC0000000000000000FF',
    kind: 'web_article',
    url: 'https://example.com/a',
    title: 'Test Article',
    author: null,
    published_at: null,
    ingested_at: new Date('2026-04-25T00:00:00Z'),
    raw_text: 'x',
    raw_text_hash: 'abc',
    metadata: {},
    embedding: null,
    embedding_model: 'voyage-3.5-1024',
    ...over,
  };
}

describe('renderIndexMd (COMP-03, D-16)', () => {
  it('contains # Index heading', () => {
    expect(renderIndexMd([], [])).toContain('# Index');
  });

  it('contains ## Topics section', () => {
    expect(renderIndexMd([], [])).toContain('## Topics');
  });

  it('contains ## Sources section with count', () => {
    const md = renderIndexMd(
      [],
      [mkSource(), mkSource({ id: '01J9XSRC0000000000000000FF2' })],
    );
    expect(md).toContain('## Sources (2)');
  });

  it('lists each topic page with title, claim count, contradiction count', () => {
    const pages: IndexedPage[] = [
      {
        kind: 'topic',
        title: 'Pricing',
        slug: 'topics/pricing',
        claimCount: 7,
        contradictionCount: 1,
        lastUpdated: new Date('2026-04-25'),
      },
    ];
    const md = renderIndexMd(pages, []);
    expect(md).toContain('[[topics/pricing|Pricing]]');
    expect(md).toContain('7 claims');
    expect(md).toContain('1 contradictions');
  });

  it('lists each source with title, url, ingested date, id', () => {
    const md = renderIndexMd(
      [],
      [mkSource({ title: 'Acme Press', url: 'https://x.test/a' })],
    );
    expect(md).toContain('Acme Press');
    expect(md).toContain('https://x.test/a');
    expect(md).toContain('2026-04-25');
    expect(md).toContain('01J9XSRC0000000000000000FF');
  });

  it('topics section shows "(none yet)" when empty', () => {
    expect(renderIndexMd([], [])).toContain('_(none yet)_');
  });

  it('determinism: same input → same output', () => {
    const pages: IndexedPage[] = [
      {
        kind: 'topic',
        title: 'X',
        slug: 'topics/x',
        claimCount: 1,
        contradictionCount: 0,
        lastUpdated: new Date('2026-04-25'),
      },
    ];
    expect(renderIndexMd(pages, [])).toBe(renderIndexMd(pages, []));
  });
});
