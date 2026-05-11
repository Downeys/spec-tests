import type { Compiler, CompilationContext, RenderedPage } from "../types.js";
import { getContradictionPairs } from "../../openbrain/relations.js";
import { serializeFrontmatter } from "../render/frontmatter.js";
import { sourceLink } from "../render/citation.js";
import { shortId } from "../render/shortId.js";

function fmtDate(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "—";
}

export const contradictionsCompiler: Compiler = {
  name: "contradictions",
  async render(ctx: CompilationContext): Promise<RenderedPage[]> {
    const pairs = await getContradictionPairs();
    const frontmatter = serializeFrontmatter({
      type: "contradictions",
      generated_at: ctx.generatedAt.toISOString(),
      compilation_run: ctx.runId,
      pair_count: pairs.length
    });

    const lines: string[] = ["# Contradictions"];
    if (pairs.length === 0) {
      lines.push("");
      lines.push("_No unresolved contradictions._");
    }

    for (const pair of pairs) {
      lines.push("");
      lines.push("---");
      lines.push("");
      lines.push(`### Pair ${shortId(pair.relation.id)}`);
      lines.push("");
      lines.push(`**A.** "${pair.claimA.statement}"`);
      if (pair.sourceA) {
        lines.push(`  ${sourceLink(pair.sourceA.id, pair.sourceA.title)}`);
      } else {
        lines.push("  *(user statement)*");
      }
      lines.push("");
      lines.push(`**B.** "${pair.claimB.statement}"`);
      if (pair.sourceB) {
        lines.push(`  ${sourceLink(pair.sourceB.id, pair.sourceB.title)}`);
      } else {
        lines.push("  *(user statement)*");
      }
      lines.push("");
      lines.push(`_Unresolved since: ${fmtDate(pair.relation.createdAt)}_`);
    }

    return [
      {
        path: "contradictions.md",
        content: frontmatter + "\n" + lines.join("\n") + "\n"
      }
    ];
  }
};
