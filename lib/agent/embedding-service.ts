/**
 * Embedding Service
 *
 * Provider-agnostic text embeddings for AgentBucket memory. Talks to any
 * OpenAI-compatible `/embeddings` endpoint over HTTP (no SDK dependency), so
 * the provider is swappable and can be self-hosted for full privacy.
 *
 * Config (env):
 * - EMBEDDING_API_URL    default https://openrouter.ai/api/v1/embeddings
 * - EMBEDDING_API_KEY    required for memory features
 * - EMBEDDING_MODEL      default openai/text-embedding-3-small
 * - EMBEDDING_DIMENSIONS default 1536 (MUST match the memory_chunks vector column)
 *
 * The chosen provider must carry a no-retention / no-training guarantee.
 */

import { agentLog } from "@/lib/shared/logger";

const apiUrl = () => process.env.EMBEDDING_API_URL || "https://openrouter.ai/api/v1/embeddings";
const apiKey = () => process.env.EMBEDDING_API_KEY || "";
const model = () => process.env.EMBEDDING_MODEL || "openai/text-embedding-3-small";

/** Vector dimension. Must match the memory_chunks.embedding column. */
export const EMBEDDING_DIMENSIONS = parseInt(process.env.EMBEDDING_DIMENSIONS || "1536", 10);

/** Whether embeddings are configured (an API key is present). */
export function isEmbeddingConfigured(): boolean {
  return apiKey().length > 0;
}

interface EmbeddingResponse {
  data: { embedding: number[] }[];
}

/**
 * Embed a batch of texts. Returns one vector per input, in order.
 * Throws if the provider is not configured or the request fails.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!isEmbeddingConfigured()) {
    throw new Error("Embedding provider not configured (EMBEDDING_API_KEY missing)");
  }
  if (texts.length === 0) return [];

  const res = await fetch(apiUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify({
      model: model(),
      input: texts,
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    agentLog.error({ status: res.status, detail }, "Embedding request failed");
    throw new Error(`Embedding request failed: ${res.status}`);
  }

  const json = (await res.json()) as EmbeddingResponse;
  const vectors = json.data.map((d) => d.embedding);

  // Guard: a model that ignores `dimensions` (or a wrong EMBEDDING_DIMENSIONS) would
  // otherwise surface only as a swallowed DB insert error against the vector(1536) column.
  for (const v of vectors) {
    if (v.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `Embedding dimension mismatch: provider returned ${v.length}, expected ${EMBEDDING_DIMENSIONS}. ` +
          `Pick a ${EMBEDDING_DIMENSIONS}-dim model or set EMBEDDING_DIMENSIONS to match (memory_chunks is vector(1536)).`
      );
    }
  }
  return vectors;
}

/** Embed a single query string. */
export async function embedQuery(text: string): Promise<number[]> {
  const [vector] = await embedTexts([text]);
  return vector;
}
