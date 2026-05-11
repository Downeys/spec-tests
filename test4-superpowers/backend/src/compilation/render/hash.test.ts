import { describe, it, expect } from "vitest";
import { sha256 } from "./hash.js";

describe("sha256", () => {
  it("hashes a string deterministically", () => {
    const a = sha256("hello");
    const b = sha256("hello");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("differs for different inputs", () => {
    expect(sha256("a")).not.toBe(sha256("b"));
  });
});
