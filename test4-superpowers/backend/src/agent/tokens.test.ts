import { describe, it, expect } from "vitest";
import { estimateTokens, sumTokens } from "./tokens.js";

describe("estimateTokens", () => {
  it("returns a reasonable estimate for short text", () => {
    const n = estimateTokens("hello world");
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(10);
  });

  it("scales roughly with length", () => {
    expect(estimateTokens("a".repeat(400))).toBeGreaterThan(
      estimateTokens("a".repeat(40))
    );
  });
});

describe("sumTokens", () => {
  it("sums a list of token counts (treating null as 0)", () => {
    expect(sumTokens([3, null, 5])).toBe(8);
    expect(sumTokens([])).toBe(0);
  });
});
