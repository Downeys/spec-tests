import { describe, it, expect } from "vitest";

import { buildServer } from "./server.js";

describe("GET /chat/state", () => {
  it("creates an active conversation if none exists and returns shape", async () => {
    const app = await buildServer();
    const resp = await app.inject({ method: "GET", url: "/chat/state" });
    expect(resp.statusCode).toBe(200);
    const body = resp.json();
    expect(body.conversationId).toBeTypeOf("string");
    expect(Array.isArray(body.messages)).toBe(true);
    expect(body.tokenCount).toBe(0);
    await app.close();
  });
});

describe("POST /chat/new", () => {
  it("deletes the active conversation and creates a new one", async () => {
    const app = await buildServer();
    const first = (await app.inject({ method: "GET", url: "/chat/state" })).json();
    const newer = (await app.inject({ method: "POST", url: "/chat/new" })).json();
    expect(newer.conversationId).not.toBe(first.conversationId);
    await app.close();
  });
});
