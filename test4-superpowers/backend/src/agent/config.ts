function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const agentConfig = {
  get tokenBudget(): number {
    return num("TOKEN_BUDGET", 400_000);
  },
  get tokenSoftWarn(): number {
    return num("TOKEN_SOFT_WARN", 0.75);
  },
  get tokenHardWarn(): number {
    return num("TOKEN_HARD_WARN", 0.9);
  },
  get primaryModel(): string {
    return process.env.ANTHROPIC_MODEL_PRIMARY ?? "claude-opus-4-7";
  },
  get compactorModel(): string {
    return (
      process.env.ANTHROPIC_MODEL_COMPACTOR ?? "claude-haiku-4-5-20251001"
    );
  }
};
