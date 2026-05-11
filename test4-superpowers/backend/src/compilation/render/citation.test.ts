import { describe, it, expect } from "vitest";
import {
  claimAnchor,
  sourceAnchor,
  sourceLink,
  conceptLink,
  renderClaimQuote
} from "./citation.js";

describe("anchors", () => {
  it("claimAnchor formats as ^claim-<8hex>", () => {
    expect(claimAnchor("7c4a1e2f-3d92-4f10-a1b2-c3d4e5f60718")).toBe(
      "^claim-7c4a1e2f"
    );
  });

  it("sourceAnchor formats as ^src-<8hex>", () => {
    expect(sourceAnchor("7c4a1e2f-3d92-4f10-a1b2-c3d4e5f60718")).toBe(
      "^src-7c4a1e2f"
    );
  });
});

describe("sourceLink", () => {
  it("renders a wiki-link to the sources page anchor", () => {
    expect(
      sourceLink("7c4a1e2f-3d92-4f10-a1b2-c3d4e5f60718", "Square 2026")
    ).toBe("[[sources#^src-7c4a1e2f|Square 2026]]");
  });

  it("escapes pipes in the display title", () => {
    expect(sourceLink("aaaa1111-0000-0000-0000-000000000000", "A | B")).toBe(
      "[[sources#^src-aaaa1111|A \\| B]]"
    );
  });
});

describe("conceptLink", () => {
  it("renders a wiki-link to a concept page", () => {
    expect(conceptLink("smb-restaurants", "SMB Restaurants")).toBe(
      "[[concepts/smb-restaurants|SMB Restaurants]]"
    );
  });
});

describe("renderClaimQuote", () => {
  it("formats a claim with citation and block-id", () => {
    const out = renderClaimQuote({
      claimId: "7c4a1e2f-3d92-4f10-a1b2-c3d4e5f60718",
      statement: "62% manage scheduling manually",
      sourceId: "abcd1234-0000-0000-0000-000000000000",
      sourceTitle: "Square 2026"
    });
    expect(out).toBe(
      `- "62% manage scheduling manually" [[sources#^src-abcd1234|Square 2026]] ^claim-7c4a1e2f`
    );
  });

  it("renders user-stated claims when sourceId is null", () => {
    const out = renderClaimQuote({
      claimId: "7c4a1e2f-3d92-4f10-a1b2-c3d4e5f60718",
      statement: "we will target SMB restaurants",
      sourceId: null,
      sourceTitle: null
    });
    expect(out).toBe(
      `- "we will target SMB restaurants" *(user statement)* ^claim-7c4a1e2f`
    );
  });

  it("wraps refuted claims in strikethrough", () => {
    const out = renderClaimQuote({
      claimId: "7c4a1e2f-3d92-4f10-a1b2-c3d4e5f60718",
      statement: "x",
      sourceId: "abcd1234-0000-0000-0000-000000000000",
      sourceTitle: "S",
      status: "refuted"
    });
    expect(out).toContain('~~"x"~~');
  });
});
