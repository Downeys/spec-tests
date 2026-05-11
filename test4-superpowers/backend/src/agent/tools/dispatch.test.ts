import { describe, it, expect } from "vitest";

import { dispatchTool, ToolNotFoundError } from "./dispatch.js";

describe("dispatchTool", () => {
  it("invokes the handler matching the tool name", async () => {
    const result = await dispatchTool("listTags", {});
    expect(Array.isArray(result)).toBe(true);
  });

  it("throws ToolNotFoundError for unknown names", async () => {
    await expect(dispatchTool("nope", {})).rejects.toBeInstanceOf(
      ToolNotFoundError
    );
  });

  it("returns errors as { isError: true, message } when handler throws", async () => {
    const result = await dispatchTool("getClaim", {
      id: "00000000-0000-0000-0000-000000000000"
    });
    expect((result as { isError: boolean }).isError).toBe(true);
  });
});
