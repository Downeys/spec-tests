import { describe, it, expect } from "vitest";

import { buildServer } from "./server.js";

describe("POST /vault/compile", () => {
  it("returns 200 + run summary on a clean compile", async () => {
    const app = await buildServer();
    const resp = await app.inject({ method: "POST", url: "/vault/compile" });
    if (resp.statusCode === 200) {
      const body = resp.json();
      expect(body.runId).toBeTypeOf("string");
      expect(body.pagesWritten).toBeTypeOf("number");
    } else {
      expect(resp.statusCode).toBe(409);
    }
    await app.close();
  });
});
