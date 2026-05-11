import { stringify, parse } from "yaml";

export function serializeFrontmatter(data: Record<string, unknown>): string {
  const yaml = stringify(data).trimEnd();
  return `---\n${yaml}\n---\n`;
}

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function splitPage(text: string): {
  frontmatter: string;
  body: string;
} {
  const match = FENCE.exec(text);
  if (!match) {
    return { frontmatter: "", body: text };
  }
  return {
    frontmatter: match[0],
    body: text.slice(match[0].length)
  };
}

const TIME_VARYING_KEYS = new Set(["generated_at", "compilation_run", "run_count"]);

export function hashableContent(text: string): string {
  const { frontmatter, body } = splitPage(text);
  if (!frontmatter) return body;
  const inner = frontmatter.replace(FENCE, "$1");
  const parsed = (parse(inner) ?? {}) as Record<string, unknown>;
  for (const key of TIME_VARYING_KEYS) {
    delete parsed[key];
  }
  const stable = stringify(parsed).trimEnd();
  return `---\n${stable}\n---\n${body}`;
}
