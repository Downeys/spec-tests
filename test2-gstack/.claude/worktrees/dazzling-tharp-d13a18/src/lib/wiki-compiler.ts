// Wiki compiler — pure-ish synthesis helpers shared by src/tools/compile-wiki.ts.
//
// Decisions captured:
//   T2 — Every factual sentence in the synthesized markdown MUST end with at
//        least one `[[entry-uuid]]` Obsidian wikilink, where entry-uuid is a
//        canonical 8-4-4-4-12 hex UUID. The prompt builder bakes this in as
//        the CRITICAL FORMAT REQUIREMENT; validateClaimCoverage() enforces
//        post-hoc coverage checks (the regenerability invariant).
//   A2 — Synthesis calls run under an AbortSignal so the tool can bound them.
//        Per-file writes are atomic: write-to-.tmp + fsync + rename. A crash
//        mid-compile leaves no half-finalized file.
//   CMT3 — the compiled wiki is the eventual Phase 4 brief. Phase 3 only needs
//        the compile pipeline to work + the regenerability test to pass.
//
// This module is deliberately split from src/tools/compile-wiki.ts so the
// compiler internals (prompt shape, claims parser, coverage validator, atomic
// writer) are unit-testable without dragging in the DB / MCP plumbing.
//
// NOTE: we import the Anthropic SDK lazily inside synthesize() so the module
// can be imported for pure helpers (parseClaims, validateClaimCoverage,
// writeAtomic, buildPrompt) without the SDK having to be configured.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';

// T2 — pinned format. 8-4-4-4-12 hex in double square brackets. Kept loose on
// case so mixed-case UUIDs parse, but all comparisons are lowercased.
export const UUID_WIKILINK_RE =
  /\[\[([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\]\]/g;

// Pin: Claude Opus 4.7. Per the design doc's Open Question 1, Opus is the v1
// synthesis model; we'll revisit Sonnet when we have cost data.
export const ANTHROPIC_MODEL = 'claude-opus-4-7';

// Input row for the prompt builder. The tool layer shapes DB rows into this.
export interface PromptEntry {
  id: string;
  type: string;
  content: string;
  metadata: Record<string, unknown>;
  relations: Array<{ relation_type: string; related_id: string }>;
}

// Output of parseClaims — paragraphs with their discovered UUIDs.
export interface ParsedParagraph {
  text: string;
  uuids: string[];
}

export interface ParsedClaims {
  paragraphs: ParsedParagraph[];
  // Every UUID seen anywhere in the markdown (deduplicated, lowercased).
  uuids: string[];
}

// Coverage report. claims_total = count of factual paragraphs (non-heading,
// non-bullet-separator, non-empty). claims_resolved = count whose UUIDs all
// map to real entries. unverified_paragraphs = paragraphs with zero UUIDs
// (orphan claims). unresolved_uuids = UUIDs cited but not in the valid set.
export interface CoverageReport {
  claims_total: number;
  claims_resolved: number;
  unverified_paragraphs: string[];
  unresolved_uuids: string[];
}

// Truncate the entry body so a single monstrous raw_source doesn't blow the
// prompt. 2000 chars is a rough knob — in Phase 4 we'll revisit.
const PROMPT_CONTENT_CAP = 2000;

function truncateContent(s: string): string {
  if (s.length <= PROMPT_CONTENT_CAP) return s;
  return s.slice(0, PROMPT_CONTENT_CAP) + '\n...[truncated]';
}

// Stringify metadata onto a single line so the prompt stays compact. Complex
// metadata shapes degrade gracefully — JSON.stringify handles cycles/undefined
// poorly but entries' metadata is plain JSONB and round-trips cleanly.
function stringifyMetadataOneLine(metadata: Record<string, unknown>): string {
  try {
    return JSON.stringify(metadata);
  } catch {
    return '{}';
  }
}

// Build the synthesis prompt. The template is the load-bearing UX piece — the
// CRITICAL FORMAT REQUIREMENT block is what makes the model cite every claim.
export function buildPrompt(topic: string, entries: PromptEntry[]): string {
  const header = `You are synthesizing a wiki page for an investor-grade venture brief.
The wiki is downstream of a structured "oneBrain" knowledge base; every claim
in the output MUST be traceable to an entry from that base.

CRITICAL FORMAT REQUIREMENT — DO NOT VIOLATE:
Every factual sentence in your output MUST end with at least one citation in
the form [[entry-uuid]], where entry-uuid is the exact UUID of one of the
entries listed below. Do NOT invent UUIDs. Use only UUIDs from this list.

UUID format is 8-4-4-4-12 hex characters in double square brackets, like:
[[a1b2c3d4-e5f6-7890-1234-567890abcdef]]

If a sentence cannot be supported by any entry in the list, OMIT IT.

Topic: ${topic}

Available entries (use ONLY these as sources):
`;

  const body = entries
    .map((e) => {
      const relations =
        e.relations.length > 0
          ? e.relations.map((r) => `(${r.relation_type}, ${r.related_id})`).join(', ')
          : '(none)';
      return [
        '---',
        `entry_id: ${e.id}`,
        `type: ${e.type}`,
        `content: |`,
        `  ${truncateContent(e.content).replace(/\n/g, '\n  ')}`,
        `metadata: ${stringifyMetadataOneLine(e.metadata)}`,
        `related_to: [${relations}]`,
      ].join('\n');
    })
    .join('\n');

  const footer = `

Now synthesize the wiki page. Use Obsidian-flavored markdown:
- # H1 for the topic title
- ## H2 for major sections
- - Bullets where helpful
- Cite EVERY factual sentence with [[entry-uuid]] at the end
`;

  return header + body + footer;
}

// A paragraph counts as "factual" (i.e. subject to the citation requirement)
// if it is a non-empty line that is NOT a markdown heading, NOT a separator,
// and NOT a pure bullet marker. This matches what the design doc calls a
// "factual sentence" — headings and bullet markers are structural.
function isFactualParagraph(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0) return false;
  if (trimmed.startsWith('#')) return false; // markdown heading
  if (/^-{3,}$/.test(trimmed)) return false; // horizontal rule / yaml separator
  if (/^[-*+]\s*$/.test(trimmed)) return false; // empty bullet
  // Code fences and block quotes — not factual prose, skip.
  if (trimmed.startsWith('```')) return false;
  return true;
}

// Parse markdown into paragraph-like units + every UUID found in wikilinks.
// Each non-blank, non-heading line is a paragraph for coverage purposes.
// Bullet items are each their own paragraph (they're independent claims).
export function parseClaims(markdown: string): ParsedClaims {
  const paragraphs: ParsedParagraph[] = [];
  const uuidSet = new Set<string>();

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine;
    if (!isFactualParagraph(line)) continue;

    const uuidsInLine: string[] = [];
    // Reset the regex state by using a fresh regex per line — the shared
    // UUID_WIKILINK_RE carries the /g lastIndex between calls otherwise.
    const re = new RegExp(UUID_WIKILINK_RE.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      const uuid = m[1]!.toLowerCase();
      uuidsInLine.push(uuid);
      uuidSet.add(uuid);
    }

    paragraphs.push({ text: line.trim(), uuids: uuidsInLine });
  }

  return { paragraphs, uuids: Array.from(uuidSet) };
}

// Given parsed claims + a set of valid (real) entry UUIDs, report coverage.
// A paragraph is "unverified" if it has zero UUIDs. A UUID is "unresolved"
// if it's cited but isn't in the valid set (the model invented it).
export function validateClaimCoverage(
  parsed: ParsedClaims,
  validUuids: Set<string>,
): CoverageReport {
  const unverified: string[] = [];
  let resolved = 0;

  for (const p of parsed.paragraphs) {
    if (p.uuids.length === 0) {
      unverified.push(p.text);
      continue;
    }
    // All of this paragraph's UUIDs must resolve for the paragraph to count
    // as resolved. A paragraph citing [[fake-uuid]] still shows up as
    // unresolved, even though it technically has a marker.
    const allResolve = p.uuids.every((u) => validUuids.has(u));
    if (allResolve) resolved += 1;
  }

  const unresolvedUuids = parsed.uuids.filter((u) => !validUuids.has(u));

  return {
    claims_total: parsed.paragraphs.length,
    claims_resolved: resolved,
    unverified_paragraphs: unverified,
    unresolved_uuids: unresolvedUuids,
  };
}

// Call Anthropic Opus with an AbortSignal-bounded request. Returns the plain
// text of the synthesized wiki page. Throws the raw SDK error on failure —
// the caller (compile_wiki) lets classifyError() in the factory route 429/
// 5xx -> TRANSIENT, 4xx -> PERMANENT, AbortError -> TRANSIENT.
export interface SynthesizeOpts {
  prompt: string;
  signal: AbortSignal;
  apiKey: string;
  maxTokens?: number;
}

export async function synthesize(opts: SynthesizeOpts): Promise<string> {
  const client = new Anthropic({ apiKey: opts.apiKey });
  const response = await client.messages.create(
    {
      model: ANTHROPIC_MODEL,
      max_tokens: opts.maxTokens ?? 4096,
      messages: [{ role: 'user', content: opts.prompt }],
    },
    { signal: opts.signal },
  );

  // Collect every text block. Tool-use blocks aren't expected here (no tools
  // are defined) but we filter defensively.
  const textParts: string[] = [];
  for (const block of response.content) {
    if (block.type === 'text') {
      textParts.push(block.text);
    }
  }
  return textParts.join('');
}

// Atomic per-file write (A2). Write to `<target>.tmp`, fsync the fd, rename
// over the target. On Windows rename is atomic within the same volume.
// If the rename fails mid-way, the .tmp file is best-effort unlinked so we
// don't leave orphans around.
export async function writeAtomic(targetPath: string, content: string): Promise<void> {
  const dir = path.dirname(targetPath);
  // Ensure the directory exists — callers typically do this once up front but
  // doing it here keeps the helper standalone.
  await fs.mkdir(dir, { recursive: true });

  const tmpPath = `${targetPath}.tmp`;
  let handle: Awaited<ReturnType<typeof fs.open>> | null = null;
  try {
    handle = await fs.open(tmpPath, 'w');
    await handle.writeFile(content, 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;

    await fs.rename(tmpPath, targetPath);
  } catch (err) {
    if (handle) {
      try {
        await handle.close();
      } catch {
        // ignore
      }
    }
    // Best-effort cleanup of the .tmp. If rename failed after close, the
    // .tmp still exists; unlink it. If it never existed we swallow ENOENT.
    try {
      await fs.unlink(tmpPath);
    } catch {
      // ignore — nothing to clean
    }
    throw err;
  }
}

// Slug the topic for use as a filename. Lowercase, non-alphanumerics -> '-',
// collapse runs, trim leading/trailing dashes, cap at 80 chars. Falls back
// to 'untitled' when the topic slugs to the empty string (e.g. all symbols).
export function slugify(topic: string): string {
  const s = topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    // trim trailing '-' left over from slice on a boundary
    .replace(/-+$/g, '');
  return s.length > 0 ? s : 'untitled';
}
