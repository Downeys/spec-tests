import { createRequire } from "node:module";

// voyageai's published ESM (`export * from "../api"`) has bare directory
// imports that fail under strict Node ESM and choke tsx's resolver. Their
// CJS build works fine, so load it via createRequire. This module is the
// single seam for tests to mock — no test should mock "voyageai" directly.
const require = createRequire(import.meta.url);

interface VoyageEmbedResponse {
  data?: { embedding?: number[] }[];
}

export interface VoyageClientLike {
  embed(params: { input: string[]; model: string }): Promise<VoyageEmbedResponse>;
}

export interface VoyageClientCtor {
  new (opts: { apiKey: string }): VoyageClientLike;
}

const voyageai = require("voyageai") as { VoyageAIClient: VoyageClientCtor };
export const VoyageAIClient = voyageai.VoyageAIClient;
