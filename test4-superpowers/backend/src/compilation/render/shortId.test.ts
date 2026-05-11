import { describe, it, expect } from "vitest";
import { shortId } from "./shortId.js";

describe("shortId", () => {
  it("returns the first 8 hex chars of a UUID", () => {
    expect(shortId("7c4a1e2f-3d92-4f10-a1b2-c3d4e5f60718")).toBe("7c4a1e2f");
  });

  it("strips hyphens", () => {
    expect(shortId("abcd1234")).toBe("abcd1234");
  });

  it("handles UUIDs with mixed case", () => {
    expect(shortId("7C4A1E2F-3D92-4f10-a1b2-c3d4e5f60718")).toBe("7c4a1e2f");
  });
});
