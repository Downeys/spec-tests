import Anthropic from "@anthropic-ai/sdk";

let cached: Anthropic | undefined;

export interface AnthropicLike {
  messages: {
    create: (params: object) => Promise<unknown>;
  };
}

export function getAnthropicClient(): AnthropicLike {
  if (cached) return cached as unknown as AnthropicLike;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  cached = new Anthropic({ apiKey });
  return cached as unknown as AnthropicLike;
}

export function setAnthropicClient(client: AnthropicLike | undefined): void {
  cached = client as unknown as Anthropic | undefined;
}
