import { describe, it, expect } from "vitest";
import { loadStaticPrompt } from "./loader.js";

describe("loadStaticPrompt", () => {
  it("returns the static prompt content as a string", async () => {
    const text = await loadStaticPrompt();
    expect(text).toContain("You are an assistant");
    expect(text).toContain("Discipline rules");
    expect(text.length).toBeGreaterThan(200);
  });

  it("caches the result across calls", async () => {
    const a = await loadStaticPrompt();
    const b = await loadStaticPrompt();
    expect(a).toBe(b);
  });
});
