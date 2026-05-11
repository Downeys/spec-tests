import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { parse } from "yaml";
import { upsertSourceByHash } from "../../openbrain/sources.js";
import {
  type Source,
  type SourceType,
  ValidationError
} from "../../openbrain/types.js";
import { sha256 } from "../../compilation/render/hash.js";
import { splitPage } from "../../compilation/render/frontmatter.js";

interface ManifestData {
  type: SourceType;
  title: string;
  url?: string;
  author?: string;
  publishedAt?: string;
  content?: string;
  metadata?: Record<string, unknown>;
}

function parseManifest(text: string, ext: string): ManifestData {
  if (ext === ".json") {
    return JSON.parse(text) as ManifestData;
  }
  // markdown with frontmatter
  const { frontmatter, body } = splitPage(text);
  if (!frontmatter) {
    throw new ValidationError(
      "manifest",
      "markdown source files require YAML frontmatter"
    );
  }
  const inner = frontmatter.replace(/^---\r?\n|\r?\n---\r?\n?$/g, "");
  const meta = (parse(inner) ?? {}) as Partial<ManifestData>;
  if (!meta.type || !meta.title) {
    throw new ValidationError(
      "manifest",
      "frontmatter must include 'type' and 'title'"
    );
  }
  return { ...meta, content: body } as ManifestData;
}

export async function ingestSource(path: string): Promise<Source> {
  const text = await readFile(path, "utf8");
  const manifest = parseManifest(text, extname(path).toLowerCase());

  const content = manifest.content ?? null;
  const contentHash = content ? sha256(content) : sha256(text);

  return upsertSourceByHash({
    type: manifest.type,
    title: manifest.title,
    url: manifest.url ?? null,
    author: manifest.author ?? null,
    publishedAt: manifest.publishedAt ? new Date(manifest.publishedAt) : null,
    content,
    contentHash,
    ingestedBy: "cli",
    metadata: manifest.metadata ?? null
  });
}
