import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir, stat, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resetCmd } from "./reset.js";
import { getPool } from "../../db/pool.js";
import { createSource } from "../../openbrain/sources.js";
import {
  appendMessage,
  getActiveConversation
} from "../../openbrain/conversations.js";

let vault: string;
beforeEach(async () => {
  vault = await mkdtemp(join(tmpdir(), "reset-"));
  await writeFile(join(vault, "CLAUDE.md"), "# schema\n");
  await mkdir(join(vault, "concepts"), { recursive: true });
  await mkdir(join(vault, "assets"), { recursive: true });
  await mkdir(join(vault, "notes"), { recursive: true });
  await writeFile(join(vault, "concepts/x.md"), "generated\n");
  await writeFile(join(vault, "sources.md"), "generated\n");
  await writeFile(join(vault, "index.md"), "generated\n");
  await writeFile(join(vault, "log.md"), "generated\n");
  await writeFile(join(vault, "contradictions.md"), "generated\n");
  await writeFile(join(vault, "notes/keep-me.md"), "user content\n");
  await writeFile(join(vault, "assets/keep-me.txt"), "asset\n");
});
afterEach(async () => {
  await rm(vault, { recursive: true, force: true });
});

describe("resetCmd --vault", () => {
  it("deletes generated pages, preserves CLAUDE.md, notes/, assets/", async () => {
    await resetCmd({ target: "vault", vaultPath: vault, yes: true });
    await expect(stat(join(vault, "CLAUDE.md"))).resolves.toBeTruthy();
    await expect(stat(join(vault, "notes/keep-me.md"))).resolves.toBeTruthy();
    await expect(stat(join(vault, "assets/keep-me.txt"))).resolves.toBeTruthy();
    await expect(stat(join(vault, "sources.md"))).rejects.toThrow();
    await expect(stat(join(vault, "concepts/x.md"))).rejects.toThrow();
    const entries = await readdir(join(vault, "concepts"));
    expect(entries.filter((e) => e !== ".gitkeep").length).toBe(0);
  });
});

describe("resetCmd --db", () => {
  it("truncates app tables but preserves pgmigrations", async () => {
    await createSource({ type: "manual", title: "x" });
    const conv = await getActiveConversation();
    await appendMessage({
      conversationId: conv.id,
      role: "user",
      content: [{ type: "text", text: "hi" }],
      tokenCount: 1
    });

    await resetCmd({ target: "db", vaultPath: vault, yes: true });

    const s = await getPool().query<{ count: string }>(
      "SELECT count(*) FROM sources"
    );
    const m = await getPool().query<{ count: string }>(
      "SELECT count(*) FROM pgmigrations"
    );
    const conversationsAndMessages = await getPool().query<{ count: string }>(
      `SELECT count(*)::text AS count FROM (
         SELECT 1 FROM messages
         UNION ALL SELECT 1 FROM conversations
       ) x`
    );
    expect(Number(s.rows[0]?.count)).toBe(0);
    expect(Number(m.rows[0]?.count)).toBeGreaterThan(0);
    expect(Number(conversationsAndMessages.rows[0]?.count)).toBe(0);
  });
});

describe("resetCmd --snapshot", () => {
  it("writes a tarball + dump file before reset", async () => {
    const snap = join(vault, "..", `snapshot-${Date.now()}`);
    await resetCmd({ target: "all", vaultPath: vault, yes: true, snapshot: snap });
    await expect(stat(`${snap}.vault.tar`)).resolves.toBeTruthy();
    await expect(stat(`${snap}.db.sql`)).resolves.toBeTruthy();
    await rm(`${snap}.vault.tar`, { force: true });
    await rm(`${snap}.db.sql`, { force: true });
  });
});
