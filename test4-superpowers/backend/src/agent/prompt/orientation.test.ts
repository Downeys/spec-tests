import { describe, it, expect } from "vitest";
import { formatOrientationMap } from "./orientation.js";

describe("formatOrientationMap", () => {
  it("renders the snapshot block with tags, totals, recent activity", () => {
    const text = formatOrientationMap({
      tags: [
        { slug: "pricing", display: "Pricing", claimCount: 8 },
        { slug: "smb", display: "SMB", claimCount: 17 }
      ],
      totals: {
        sources: 47,
        claims: 82,
        openHypotheses: 58,
        unresolvedContradictions: 2
      },
      recentEvents: [
        {
          kind: "compilation_run",
          at: new Date("2026-04-30T18:42:00Z"),
          summary: "compilation success (5 written, 9 skipped)"
        },
        {
          kind: "claim_created",
          at: new Date("2026-04-30T18:40:00Z"),
          summary: "claim added: 62% of restaurants..."
        }
      ],
      lastCompilationAt: new Date("2026-04-30T18:42:11Z")
    });

    expect(text).toContain("=== Memory orientation");
    expect(text).toContain("smb (17)");
    expect(text).toContain("pricing (8)");
    expect(text).toContain("sources=47");
    expect(text).toContain("claims=82");
    expect(text).toContain("open hypotheses=58");
    expect(text).toContain("unresolved contradictions=2");
    expect(text).toContain("compilation success");
    expect(text).toContain("=== End orientation ===");
  });

  it("renders gracefully on empty memory", () => {
    const text = formatOrientationMap({
      tags: [],
      totals: {
        sources: 0,
        claims: 0,
        openHypotheses: 0,
        unresolvedContradictions: 0
      },
      recentEvents: [],
      lastCompilationAt: null
    });
    expect(text).toContain("Tags (0)");
    expect(text).toContain("Last compilation: never");
  });
});
