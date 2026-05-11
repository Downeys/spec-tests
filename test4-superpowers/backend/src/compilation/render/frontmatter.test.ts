import { describe, it, expect } from "vitest";
import {
  serializeFrontmatter,
  splitPage,
  hashableContent
} from "./frontmatter.js";

describe("serializeFrontmatter", () => {
  it("serializes a record to YAML between fences", () => {
    const out = serializeFrontmatter({ type: "concept", slug: "smb" });
    expect(out).toBe("---\ntype: concept\nslug: smb\n---\n");
  });

  it("preserves nested objects", () => {
    const out = serializeFrontmatter({
      status_summary: { open: 1, validated: 2 }
    });
    expect(out).toContain("status_summary:");
    expect(out).toContain("open: 1");
  });
});

describe("splitPage", () => {
  it("separates frontmatter and body", () => {
    const text = "---\ntype: concept\n---\n# Title\nbody here\n";
    const { frontmatter, body } = splitPage(text);
    expect(frontmatter).toBe("---\ntype: concept\n---\n");
    expect(body).toBe("# Title\nbody here\n");
  });

  it("returns the whole document as body when no frontmatter", () => {
    const text = "# Title\n";
    const { frontmatter, body } = splitPage(text);
    expect(frontmatter).toBe("");
    expect(body).toBe("# Title\n");
  });
});

describe("hashableContent", () => {
  it("strips generated_at and compilation_run from frontmatter for hashing", () => {
    const a = `---
type: concept
slug: smb
generated_at: 2026-04-28T19:42:00Z
compilation_run: aaaa
claim_count: 5
---
body
`;
    const b = `---
type: concept
slug: smb
generated_at: 2027-01-01T00:00:00Z
compilation_run: bbbb
claim_count: 5
---
body
`;
    expect(hashableContent(a)).toBe(hashableContent(b));
  });

  it("differs when body differs", () => {
    const a = "---\ntype: concept\n---\nbody1";
    const b = "---\ntype: concept\n---\nbody2";
    expect(hashableContent(a)).not.toBe(hashableContent(b));
  });

  it("differs when content frontmatter changes", () => {
    const a = "---\nclaim_count: 1\n---\nbody";
    const b = "---\nclaim_count: 2\n---\nbody";
    expect(hashableContent(a)).not.toBe(hashableContent(b));
  });
});
