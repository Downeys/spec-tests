import type { TokenBudget } from "../../store.js";

export interface TokenMeterProps {
  tokens: number;
  tokenBudget: TokenBudget;
}

const fmt = new Intl.NumberFormat("en-US");

export function TokenMeter({ tokens, tokenBudget }: Readonly<TokenMeterProps>) {
  const ratio = tokens / tokenBudget.budget;
  const pct = Math.min(100, Math.round(ratio * 100));

  let bar = "bg-gray-400";
  if (ratio >= tokenBudget.hardWarn) bar = "bg-red-500";
  else if (ratio >= tokenBudget.softWarn) bar = "bg-yellow-500";

  // Subtitle only in the soft-warn zone; the hard zone is handled by a banner
  // above the chat input, so we don't double up the signal here.
  let subtitle: string | null = null;
  if (ratio >= tokenBudget.softWarn && ratio < tokenBudget.hardWarn) {
    subtitle = "Consider wrapping up — Compact or New soon";
  }

  return (
    <div className="flex flex-col items-end text-xs font-mono">
      <div className="flex items-center gap-2 text-gray-700">
        <div className="w-32 h-2 bg-gray-200 rounded">
          <div
            className={`h-2 rounded ${bar}`}
            style={{ width: `${pct}%` }}
            aria-label={`token usage ${pct}%`}
          />
        </div>
        <span>
          {fmt.format(tokens)} / {fmt.format(tokenBudget.budget)}
        </span>
      </div>
      {subtitle && (
        <div className="text-yellow-700 text-[11px] mt-0.5">{subtitle}</div>
      )}
    </div>
  );
}
