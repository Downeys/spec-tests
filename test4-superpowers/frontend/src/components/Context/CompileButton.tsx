import { useState } from "react";
import { compileVault } from "../../lib/api.js";

export function CompileButton() {
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  async function onClick() {
    setBusy(true);
    setToast(null);
    try {
      const r = await compileVault();
      setToast(
        `Compile ${r.status} — ${r.pagesWritten} written, ${r.pagesSkipped} skipped (${r.durationMs}ms)`
      );
    } catch (err) {
      setToast(`Compile failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="px-3 py-1.5 bg-gray-800 text-white text-sm rounded disabled:bg-gray-400"
      >
        {busy ? "Compiling..." : "Compile vault"}
      </button>
      {toast && <div className="text-xs text-gray-600">{toast}</div>}
    </div>
  );
}
