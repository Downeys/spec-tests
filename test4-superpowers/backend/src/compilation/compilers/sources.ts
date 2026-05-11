import type { Compiler, CompilationContext, RenderedPage } from "../types.js";
import { listSourcesByIngestedAt } from "../../openbrain/sources.js";
import { serializeFrontmatter } from "../render/frontmatter.js";
import { sourceAnchor } from "../render/citation.js";

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return d.toISOString().slice(0, 10);
}

export const sourcesCompiler: Compiler = {
  name: "sources",
  async render(ctx: CompilationContext): Promise<RenderedPage[]> {
    const sources = await listSourcesByIngestedAt();
    const frontmatter = serializeFrontmatter({
      type: "source-index",
      generated_at: ctx.generatedAt.toISOString(),
      compilation_run: ctx.runId,
      source_count: sources.length
    });

    const lines: string[] = ["# Sources"];
    if (sources.length === 0) {
      lines.push("");
      lines.push("_No sources ingested yet._");
    }
    for (const s of sources) {
      lines.push("");
      lines.push(`## ${s.title} ${sourceAnchor(s.id)}`);
      if (s.url) lines.push(`- **URL:** ${s.url}`);
      lines.push(
        `- **Type:** ${s.type} · **Published:** ${fmtDate(s.publishedAt)} · **Ingested:** ${fmtDate(s.ingestedAt)}`
      );
      if (s.author) lines.push(`- **Author:** ${s.author}`);
    }

    return [
      {
        path: "sources.md",
        content: frontmatter + "\n" + lines.join("\n") + "\n"
      }
    ];
  }
};
