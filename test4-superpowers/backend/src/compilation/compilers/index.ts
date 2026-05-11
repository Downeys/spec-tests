import type { Compiler, CompilationContext, RenderedPage } from "../types.js";
import { listTags } from "../../openbrain/tags.js";
import { serializeFrontmatter } from "../render/frontmatter.js";
import { conceptLink } from "../render/citation.js";

export const indexCompiler: Compiler = {
  name: "index",
  async render(ctx: CompilationContext): Promise<RenderedPage[]> {
    const tags = await listTags();
    const frontmatter = serializeFrontmatter({
      type: "index",
      generated_at: ctx.generatedAt.toISOString(),
      compilation_run: ctx.runId,
      concept_count: tags.length
    });

    const lines: string[] = [
      "# Index",
      "",
      "## Control pages",
      "- [[sources|Source catalog]]",
      "- [[contradictions|Unresolved contradictions]]",
      "- [[log|Compilation log]]",
      "",
      "## Concepts"
    ];
    if (tags.length === 0) {
      lines.push("_No concept pages yet._");
    } else {
      for (const tag of tags) {
        lines.push(`- ${conceptLink(tag.slug, tag.display)}`);
      }
    }

    return [
      {
        path: "index.md",
        content: frontmatter + "\n" + lines.join("\n") + "\n"
      }
    ];
  }
};
