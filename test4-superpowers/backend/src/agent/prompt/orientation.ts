import type { OrientationMap } from "../../openbrain/orientation.js";

function isoMinute(d: Date): string {
  return d.toISOString().replace("T", " ").slice(0, 16);
}

export function formatOrientationMap(m: OrientationMap): string {
  const ts = new Date().toISOString();
  const tagLine =
    m.tags.length === 0
      ? "Tags (0): (none)"
      : `Tags (${m.tags.length}): ${m.tags
          .map((t) => `${t.slug} (${t.claimCount})`)
          .join(", ")}`;

  const totalsLine = `Totals: sources=${m.totals.sources}, claims=${m.totals.claims}, open hypotheses=${m.totals.openHypotheses}, unresolved contradictions=${m.totals.unresolvedContradictions}`;

  const eventsBlock =
    m.recentEvents.length === 0
      ? "Recent activity: (none)"
      : "Recent activity:\n" +
        m.recentEvents
          .map((e) => `  - ${isoMinute(e.at)}  ${e.summary}`)
          .join("\n");

  const lastCompile =
    m.lastCompilationAt != null ? isoMinute(m.lastCompilationAt) : "never";

  return [
    `=== Memory orientation (snapshot @ ${ts}) ===`,
    tagLine,
    totalsLine,
    eventsBlock,
    `Last compilation: ${lastCompile}`,
    `=== End orientation ===`
  ].join("\n");
}
