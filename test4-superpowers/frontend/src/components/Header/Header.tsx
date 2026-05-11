import { TokenMeter } from "./TokenMeter.js";
import { Menu } from "./Menu.js";
import type { TokenBudget } from "../../store.js";

export interface HeaderProps {
  tokens: number;
  tokenBudget: TokenBudget;
  onCompact: () => void;
  onNewConversation: () => void;
}

export function Header(props: Readonly<HeaderProps>) {
  return (
    <header className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-white">
      <div className="font-medium text-sm">PRD 2 Agent</div>
      <div className="flex items-center gap-3">
        <TokenMeter tokens={props.tokens} tokenBudget={props.tokenBudget} />
        <Menu onCompact={props.onCompact} onNewConversation={props.onNewConversation} />
      </div>
    </header>
  );
}
