export type ParsedCommand =
  | { readonly kind: 'help' }
  | { readonly kind: 'exit' }
  | { readonly kind: 'strategy-create'; readonly slug: string }
  | { readonly kind: 'strategy-switch'; readonly slug: string }
  | { readonly kind: 'strategy-rename'; readonly oldSlug: string; readonly newSlug: string }
  | { readonly kind: 'strategy-list'; readonly all: boolean }
  | { readonly kind: 'strategy-archive'; readonly slug: string; readonly reason?: string }
  | { readonly kind: 'unknown'; readonly raw: string }
  | { readonly kind: 'not-a-command'; readonly raw: string };

export function parseCommand(input: string): ParsedCommand {
  const trimmed = input.trim();

  if (trimmed === '/help') {
    return { kind: 'help' };
  }

  if (trimmed === '/exit') {
    return { kind: 'exit' };
  }

  const strategyCreateMatch = /^\/strategy\s+create\s+(\S+)$/.exec(trimmed);
  if (strategyCreateMatch?.[1]) {
    return { kind: 'strategy-create', slug: strategyCreateMatch[1] };
  }

  const strategySwitchMatch = /^\/strategy\s+switch\s+(\S+)$/.exec(trimmed);
  if (strategySwitchMatch?.[1]) {
    return { kind: 'strategy-switch', slug: strategySwitchMatch[1] };
  }

  const strategyRenameMatch = /^\/strategy\s+rename\s+(\S+)\s+(\S+)$/.exec(trimmed);
  if (strategyRenameMatch?.[1] && strategyRenameMatch[2]) {
    return {
      kind: 'strategy-rename',
      oldSlug: strategyRenameMatch[1],
      newSlug: strategyRenameMatch[2],
    };
  }

  const strategyArchiveMatch = /^\/strategy\s+archive\s+(\S+)(?:\s+--reason\s+(.+))?$/.exec(
    trimmed,
  );
  if (strategyArchiveMatch?.[1]) {
    const reasonText = strategyArchiveMatch[2]?.trim();
    const cmd: ParsedCommand = reasonText
      ? { kind: 'strategy-archive', slug: strategyArchiveMatch[1], reason: reasonText }
      : { kind: 'strategy-archive', slug: strategyArchiveMatch[1] };
    return cmd;
  }

  const strategyListMatch = /^\/strategy\s+list(?:\s+(--all))?$/.exec(trimmed);
  if (strategyListMatch !== null) {
    return { kind: 'strategy-list', all: strategyListMatch[1] === '--all' };
  }

  if (trimmed.startsWith('/')) {
    return { kind: 'unknown', raw: trimmed };
  }

  return { kind: 'not-a-command', raw: trimmed };
}
