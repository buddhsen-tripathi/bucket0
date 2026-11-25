import { and, eq, sql } from "drizzle-orm";
import { cloudFiles, teamFiles } from "@/db/schema";
import { db } from "@/lib/shared/db";
import { getBackgroundQueue } from "@/server/bindings";

export type ThumbnailJob = { kind: "thumbnail"; scope: "personal" | "team"; fileId: string; version: string };
export type IndexJob = { kind: "index"; fileId: string; version: string; keyId: string | null; maxMemoryChunks: number };
export type ProbeJob = { kind: "probe"; id: string };
export type BackgroundJob = ThumbnailJob | IndexJob | ProbeJob;

/** Queue references to encrypted source objects, never plaintext file content. */
export async function enqueueThumbnail(ownerId: string, fileKey: string, scope: "personal" | "team" = "personal") {
  const queue = getBackgroundQueue();
  const table = scope === "team" ? teamFiles : cloudFiles;
  const owner = scope === "team" ? teamFiles.teamId : cloudFiles.userId;
  const [file] = await db.select({ id: table.id, version: sql<string>`${table.updatedAt}::text` }).from(table)
    .where(and(eq(owner, ownerId), eq(table.fileKey, fileKey))).limit(1);
  if (!file) return;
  await queue.send({ kind: "thumbnail", scope, fileId: file.id, version: file.version } satisfies ThumbnailJob);
  await db.update(table).set({ thumbnailAttempted: true }).where(and(eq(table.id, file.id), sql`${table.updatedAt}::text = ${file.version}`));
}

export async function enqueueIndex(fileId: string, keyId: string | null, maxMemoryChunks: number) {
  const queue = getBackgroundQueue();
  const [file] = await db.select({ version: sql<string>`${cloudFiles.updatedAt}::text` }).from(cloudFiles).where(eq(cloudFiles.id, fileId)).limit(1);
  if (file) await queue.send({ kind: "index", fileId, version: file.version, keyId, maxMemoryChunks } satisfies IndexJob);
}

export function parseBackgroundJob(value: unknown): BackgroundJob {
  if (typeof value === "object" && value !== null && "kind" in value && value.kind === "probe" &&
    "id" in value && typeof value.id === "string" && /^[0-9a-f-]{36}$/.test(value.id)) return { kind: "probe", id: value.id };
  if (typeof value !== "object" || value === null || !("kind" in value) || !("fileId" in value) ||
    typeof value.fileId !== "string" || !("version" in value) || typeof value.version !== "string" ||
    !Number.isFinite(Date.parse(value.version))) throw new Error("Invalid background job");
  if (value.kind === "thumbnail" && "scope" in value && (value.scope === "personal" || value.scope === "team")) {
    return { kind: value.kind, scope: value.scope, fileId: value.fileId, version: value.version };
  }
  if (value.kind === "index" && "keyId" in value && (typeof value.keyId === "string" || value.keyId === null) &&
    "maxMemoryChunks" in value && typeof value.maxMemoryChunks === "number" && Number.isSafeInteger(value.maxMemoryChunks) && value.maxMemoryChunks > 0) {
    return { kind: value.kind, fileId: value.fileId, version: value.version, keyId: value.keyId, maxMemoryChunks: value.maxMemoryChunks };
  }
  throw new Error("Invalid background job kind");
}
