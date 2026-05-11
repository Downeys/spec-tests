import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { atomicWriteFile, ensureDir } from "./atomicWrite.js";

let tmp: string;
beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "atomic-"));
});
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe("atomicWriteFile", () => {
  it("writes content to a new file", async () => {
    const path = join(tmp, "a.md");
    await atomicWriteFile(path, "hello");
    expect((await readFile(path, "utf8"))).toBe("hello");
  });

  it("overwrites an existing file", async () => {
    const path = join(tmp, "a.md");
    await writeFile(path, "old");
    await atomicWriteFile(path, "new");
    expect((await readFile(path, "utf8"))).toBe("new");
  });

  it("creates parent dirs as needed", async () => {
    const path = join(tmp, "deep/nested/a.md");
    await atomicWriteFile(path, "x");
    expect((await readFile(path, "utf8"))).toBe("x");
  });

  it("does not leave a .tmp file on success", async () => {
    const path = join(tmp, "a.md");
    await atomicWriteFile(path, "x");
    await expect(stat(`${path}.tmp`)).rejects.toThrow();
  });
});

describe("ensureDir", () => {
  it("creates nested dirs without erroring on re-run", async () => {
    const path = join(tmp, "deep/nested");
    await ensureDir(path);
    await ensureDir(path);
    const s = await stat(path);
    expect(s.isDirectory()).toBe(true);
  });
});
