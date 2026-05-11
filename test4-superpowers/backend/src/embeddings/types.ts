export interface EmbeddingProvider {
  readonly model: string;
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}

export class EmbeddingError extends Error {
  constructor(message: string, public override readonly cause?: unknown) {
    super(message);
    this.name = "EmbeddingError";
  }
}
