// Heuristic: ~4 chars per token for English-ish text. Replace with the
// Anthropic count_tokens API at API integration time if precision matters.
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export function sumTokens(values: ReadonlyArray<number | null>): number {
  return values.reduce<number>((acc, v) => acc + (v ?? 0), 0);
}
