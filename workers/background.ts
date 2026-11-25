import { and, eq, sql } from "drizzle-orm";
import { cloudFiles, teamFiles, users } from "@/db/schema";
import { db } from "@/lib/shared/db";
import { parseBackgroundJob, type ThumbnailJob, type IndexJob } from "@/lib/cloud/background-jobs";
import { openCloudFileStream, cloudFileToWebStream } from "@/lib/cloud/file-stream";
import { requestThumbnail, supportsThumbnail, isImageType, isVideoType } from "@/lib/cloud/thumbnail-service";
import { processInfrastructureProbe } from "@/server/infrastructure-probe";
import { getThumbnailBucket } from "@/server/bindings";
import { GENERATED_THUMBNAIL_PREFIX } from "@/lib/cloud/thumbnail-storage";
import { indexFile, isTextLike } from "@/lib/agent/memory-service";
import { getPlanLimits } from "@/lib/payments/plans";
import { cloudLog } from "@/lib/shared/logger";
import { createHash } from "node:crypto";
import { requestContext } from "@/server/context";
import type { ExecutionContext } from "hono";

async function processThumbnail(job: ThumbnailJob) {
  const [file] = job.scope === "personal"
    ? await db.select().from(cloudFiles).where(and(eq(cloudFiles.id, job.fileId), sql`${cloudFiles.updatedAt}::text = ${job.version}`)).limit(1)
    : await db.select().from(teamFiles).where(and(eq(teamFiles.id, job.fileId), sql`${teamFiles.updatedAt}::text = ${job.version}`)).limit(1);
  if (!file || !file.mimeType || !supportsThumbnail(file.mimeType)) return;
  const bucket = getThumbnailBucket();
  const ownerId = "teamId" in file ? file.teamId : file.userId;
  const objectKey = `${job.scope}/${ownerId}/${file.id}/${createHash("sha256").update(job.version).digest("hex").slice(0, 16)}.webp`;
  const thumbnailKey = GENERATED_THUMBNAIL_PREFIX + objectKey;
  if (file.thumbnailKey === thumbnailKey) return;
  const kind = isImageType(file.mimeType) ? "image" : isVideoType(file.mimeType) ? "video" : "pdf";
  const teamId = "teamId" in file ? file.teamId : undefined;
  const userId = "userId" in file ? file.userId : file.uploadedBy;
  // Preserve the existing bounded partial-file strategy for very large media.
  let range: string | undefined;
  if (file.fileSize > 64 * 1024 * 1024) {
    const chunks = kind === "video" ? 2 : 1;
    const bytes = chunks * (8 * 1024 * 1024 + (file.encrypted ? 32 : 0)) + (file.encryptionMode === "chunked_gcm" ? 5 : 0);
    range = `bytes=0-${bytes - 1}`;
  }
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 120000);
  let source: Awaited<ReturnType<typeof openCloudFileStream>> | undefined;
  try {
    source = await openCloudFileStream(userId, { ...file, teamId, range }, abort.signal);
    const thumbnail = await requestThumbnail(kind, cloudFileToWebStream(source), {}, file.mimeType, abort.signal);
    await bucket.put(objectKey, thumbnail, { httpMetadata: { contentType: "image/webp" } });
    let updated: { id: string }[];
    if (job.scope === "personal") {
      updated = await db.update(cloudFiles).set({ thumbnailKey, thumbnailAttempted: true })
        .where(and(eq(cloudFiles.id, file.id), sql`${cloudFiles.updatedAt}::text = ${job.version}`)).returning({ id: cloudFiles.id });
    } else {
      updated = await db.update(teamFiles).set({ thumbnailKey, thumbnailAttempted: true })
        .where(and(eq(teamFiles.id, file.id), sql`${teamFiles.updatedAt}::text = ${job.version}`)).returning({ id: teamFiles.id });
    }
    // A delete or replacement may race conversion. Do not retain its obsolete output.
    if (!updated.length) await bucket.delete(objectKey);
  } finally { clearTimeout(timeout); abort.abort(); source?.destroy(); }
}

async function processIndex(job: IndexJob) {
  const [file] = await db.select().from(cloudFiles)
    .where(and(eq(cloudFiles.id, job.fileId), sql`${cloudFiles.updatedAt}::text = ${job.version}`)).limit(1);
  if (!file || file.fileSize > 1_000_000 || !isTextLike(file.mimeType ?? "", file.fileName)) return;
  const [user] = await db.select({ plan: users.plan }).from(users).where(eq(users.id, file.userId)).limit(1);
  if (!user) return;
  const limits = getPlanLimits(user.plan);
  if (!limits.memoryEnabled) return;
  const source = await openCloudFileStream(file.userId, file);
  const chunks: Buffer[] = [];
  let bytes = 0;
  try {
    for await (const chunk of source) {
      const data = Buffer.from(chunk);
      bytes += data.length;
      if (bytes > 1_000_000) throw new Error("Index source exceeds its size limit");
      chunks.push(data);
    }
  } finally { source.destroy(); }
  await indexFile({ userId: file.userId, fileId: file.id, keyId: job.keyId, filename: file.fileName,
    text: Buffer.concat(chunks).toString("utf8"), maxMemoryChunks: Math.min(job.maxMemoryChunks, limits.maxMemoryChunks) });
}

export async function consumeBackground(batch: MessageBatch<unknown>, env: Record<string, unknown>, ctx: ExecutionContext) {
  await requestContext.run({ request: new Request("https://background.internal/"), env: { ...env }, ctx }, async () => {
    for (const message of batch.messages) {
      try {
        const job = parseBackgroundJob(message.body);
        if (job.kind === "probe") await processInfrastructureProbe(job.id);
        else if (job.kind === "thumbnail") await processThumbnail(job);
        else await processIndex(job);
        message.ack();
      } catch (error) {
        cloudLog.error({ err: error, messageId: message.id }, "Background job failed; retrying");
        message.retry({ delaySeconds: 30 });
      }
    }
  });
}
