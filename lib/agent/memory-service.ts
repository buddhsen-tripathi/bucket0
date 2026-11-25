/**
 * AgentBucket Memory Service
 *
 * Indexes text uploads into semantic memory (chunk -> embed -> store) and
 * searches them by meaning. Chunk text is encrypted at rest with AES-256-GCM
 * (CREDENTIAL_ENCRYPTION_KEY). Indexing runs at upload time from the plaintext
 * the upload route already holds, so files are never decrypted at rest.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/shared/db";
import { memoryChunks, cloudFiles } from "@/db/schema";
import { embedTexts, embedQuery, isEmbeddingConfigured } from "@/lib/agent/embedding-service";
import { agentLog } from "@/lib/shared/logger";

const CHUNK_SIZE = 1000; // characters
const CHUNK_OVERLAP = 100;
const EMBED_BATCH = 64;

const credKey = (): Buffer => Buffer.from(process.env.CREDENTIAL_ENCRYPTION_KEY || "", "hex");

/** AES-256-GCM needs a 32-byte key. Fail loudly instead of with an opaque crypto error. */
function requireCredKey(): Buffer {
  if (credKey().length !== 32) {
    throw new Error(
      "CREDENTIAL_ENCRYPTION_KEY must be 32 bytes (64 hex chars) for AgentBucket memory encryption"
    );
  }
  return credKey();
}

// Text-like mime types and extensions we index (v0 — no PDF/binary extraction).
const TEXT_MIME_PREFIXES = ["text/"];
const TEXT_MIME_EXACT = new Set([
  "application/json",
  "application/xml",
  "application/x-yaml",
  "application/yaml",
  "application/csv",
  "application/javascript",
  "application/typescript",
]);
const TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "json", "csv", "tsv", "yaml", "yml", "xml", "html",
  "css", "js", "jsx", "ts", "tsx", "py", "go", "rs", "java", "rb", "php", "sh",
  "sql", "log", "ini", "toml", "c", "cpp", "h",
]);

export function isTextLike(mimeType: string | null | undefined, filename: string): boolean {
  const mime = (mimeType || "").toLowerCase();
  if (TEXT_MIME_PREFIXES.some((p) => mime.startsWith(p))) return true;
  if (TEXT_MIME_EXACT.has(mime)) return true;
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  return TEXT_EXTENSIONS.has(ext);
}

/** Split text into overlapping character chunks. */
function chunkText(text: string): string[] {
  const clean = text.trim();
  if (!clean) return [];
  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    const end = Math.min(start + CHUNK_SIZE, clean.length);
    chunks.push(clean.slice(start, end));
    if (end >= clean.length) break;
    start = end - CHUNK_OVERLAP;
  }
  return chunks;
}

function encryptChunk(text: string): { content: string; iv: string; authTag: string } {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", requireCredKey(), iv);
  const enc = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return {
    content: enc.toString("base64"),
    iv: iv.toString("hex"),
    authTag: cipher.getAuthTag().toString("hex"),
  };
}

function decryptChunk(content: string, iv: string, authTag: string): string {
  const decipher = createDecipheriv("aes-256-gcm", requireCredKey(), Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(authTag, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(content, "base64")), decipher.final()]).toString("utf8");
}

/** Postgres vector literal: "[0.1,0.2,...]". */
function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

export interface IndexFileArgs {
  userId: string;
  fileId: string;
  keyId: string | null;
  filename: string;
  text: string;
  maxMemoryChunks: number; // plan budget
}

/**
 * Index a file's text into memory. Replaces any existing chunks for the file.
 * Honours the plan chunk budget. No-op if embeddings aren't configured.
 */
export async function indexFile(args: IndexFileArgs): Promise<{ indexed: number }> {
  if (!isEmbeddingConfigured()) {
    agentLog.warn({ fileId: args.fileId }, "Memory indexing skipped: embeddings not configured");
    return { indexed: 0 };
  }

  const pieces = chunkText(args.text);
  if (pieces.length === 0) return { indexed: 0 };

  // Replace existing chunks for this file (re-upload / overwrite).
  await db.delete(memoryChunks).where(eq(memoryChunks.fileId, args.fileId));

  // Enforce the plan budget against the user's existing chunk count.
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(memoryChunks)
    .where(eq(memoryChunks.userId, args.userId));
  const remaining = Math.max(0, args.maxMemoryChunks - Number(count));
  if (remaining <= 0) {
    agentLog.warn({ userId: args.userId }, "Memory budget exhausted; skipping indexing");
    return { indexed: 0 };
  }
  const toIndex = pieces.slice(0, remaining);

  let indexed = 0;
  for (let i = 0; i < toIndex.length; i += EMBED_BATCH) {
    const batch = toIndex.slice(i, i + EMBED_BATCH);
    const vectors = await embedTexts(batch);
    const rows = batch.map((content, j) => {
      const enc = encryptChunk(content);
      return {
        userId: args.userId,
        fileId: args.fileId,
        keyId: args.keyId,
        chunkIndex: i + j,
        content: enc.content,
        contentIv: enc.iv,
        contentAuthTag: enc.authTag,
        embedding: vectors[j],
        tokenCount: Math.ceil(content.length / 4),
      };
    });
    await db.insert(memoryChunks).values(rows);
    indexed += rows.length;
  }

  agentLog.info({ fileId: args.fileId, indexed }, "Memory indexed");
  return { indexed };
}

export interface MemorySearchResult {
  fileName: string;
  key: string; // relative key (users/{userId}/ stripped)
  chunkIndex: number;
  snippet: string;
  score: number; // cosine similarity, higher is closer (1 = identical; pgvector <=> is 0..2, so this can be negative)
}

/** Semantic search over a user's memory. Returns ranked, decrypted snippets. */
export async function searchMemory(
  userId: string,
  query: string,
  topK = 8
): Promise<MemorySearchResult[]> {
  if (!isEmbeddingConfigured()) {
    throw new Error("Embedding provider not configured");
  }
  const vec = await embedQuery(query);
  const literal = toVectorLiteral(vec);
  const distance = sql<number>`${memoryChunks.embedding} <=> ${literal}::vector`;

  const rows = await db
    .select({
      content: memoryChunks.content,
      contentIv: memoryChunks.contentIv,
      contentAuthTag: memoryChunks.contentAuthTag,
      chunkIndex: memoryChunks.chunkIndex,
      fileName: cloudFiles.fileName,
      fileKey: cloudFiles.fileKey,
      distance,
    })
    .from(memoryChunks)
    .innerJoin(cloudFiles, eq(cloudFiles.id, memoryChunks.fileId))
    .where(eq(memoryChunks.userId, userId))
    .orderBy(distance)
    .limit(Math.min(Math.max(topK, 1), 50));

  return rows.map((r) => ({
    fileName: r.fileName,
    key: r.fileKey.replace(`users/${userId}/`, ""),
    chunkIndex: r.chunkIndex,
    snippet: decryptChunk(r.content, r.contentIv, r.contentAuthTag),
    score: 1 - Number(r.distance),
  }));
}
