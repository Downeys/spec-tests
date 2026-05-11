import type { Plugin } from "unified";
import type { Root, Text, Link } from "mdast";
import { visit } from "unist-util-visit";

const SOURCE_RE = /\[\[sources#\^(src-[a-z0-9-]+)(?:\|([^\]]+))?\]\]/g;
const CONCEPT_RE = /\[\[concepts\/([a-z0-9-]+)(?:\|([^\]]+))?\]\]/g;

export const remarkCitations: Plugin<[], Root> = () => (tree) => {
  visit(tree, "text", (node: Text, index, parent) => {
    if (!parent || index == null) return;
    const out: (Text | Link)[] = [];
    let last = 0;
    const value = node.value;
    const matches = [
      ...[...value.matchAll(SOURCE_RE)].map((m) => ({
        kind: "source" as const,
        m
      })),
      ...[...value.matchAll(CONCEPT_RE)].map((m) => ({
        kind: "concept" as const,
        m
      }))
    ].sort((a, b) => (a.m.index ?? 0) - (b.m.index ?? 0));

    for (const { kind, m } of matches) {
      const start = m.index ?? 0;
      if (start > last) out.push({ type: "text", value: value.slice(last, start) });
      const id = m[1]!;
      const display = m[2] ?? id;
      const url =
        kind === "source"
          ? `obsidian://open?vault=vault&file=sources#^${id}`
          : `obsidian://open?vault=vault&file=concepts/${id}`;
      out.push({
        type: "link",
        url,
        children: [{ type: "text", value: display }]
      });
      last = start + m[0].length;
    }
    if (last < value.length) out.push({ type: "text", value: value.slice(last) });
    if (out.length > 0) {
      (parent as { children: unknown[] }).children.splice(index, 1, ...out);
    }
  });
};
