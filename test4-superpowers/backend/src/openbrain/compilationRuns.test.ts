import { describe, it, expect } from "vitest";
import {
  startCompilationRun,
  finishCompilationRun,
  failCompilationRun,
  listRecentCompilationRuns,
  getRunningCompilationRun
} from "./compilationRuns.js";

describe("compilation runs", () => {
  it("starts a run and lists it as running", async () => {
    const run = await startCompilationRun("cli");
    expect(run.status).toBe("running");
    const running = await getRunningCompilationRun();
    expect(running?.id).toBe(run.id);
  });

  it("finishes a run with counts", async () => {
    const run = await startCompilationRun("cli");
    const finished = await finishCompilationRun(run.id, {
      pagesWritten: 3,
      pagesSkipped: 4,
      notes: "ok"
    });
    expect(finished.status).toBe("success");
    expect(finished.pagesWritten).toBe(3);
    expect(finished.pagesSkipped).toBe(4);
    expect(finished.finishedAt).toBeInstanceOf(Date);
  });

  it("fails a run with an error message", async () => {
    const run = await startCompilationRun("cli");
    const failed = await failCompilationRun(run.id, "disk full");
    expect(failed.status).toBe("error");
    expect(failed.errorMessage).toBe("disk full");
    expect(failed.finishedAt).toBeInstanceOf(Date);
  });

  it("listRecentCompilationRuns returns newest first", async () => {
    await startCompilationRun("cli").then((r) =>
      finishCompilationRun(r.id, { pagesWritten: 0, pagesSkipped: 0 })
    );
    await new Promise((r) => setTimeout(r, 5));
    const second = await startCompilationRun("cli");

    const list = await listRecentCompilationRuns(10);
    expect(list[0]?.id).toBe(second.id);
  });
});
