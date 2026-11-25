import { randomUUID } from "node:crypto";
import { getBackgroundQueue, getThumbnailBucket } from "@/server/bindings";
import { checkRateLimit } from "@/lib/payments/rate-limit";
import { requestThumbnail } from "@/lib/cloud/thumbnail-service";
import type { ProbeJob } from "@/lib/cloud/background-jobs";

export function isProbeId(id: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id); }
const key = (id: string) => `diagnostics/${id}.webp`;

/** Operator-only synthetic work: no user files or database rows are read or changed. */
export async function startInfrastructureProbe() {
  const queue = getBackgroundQueue();
  getThumbnailBucket(); // Fail before any synthetic work when the binding is missing.
  const id = randomUUID();
  const results = [];
  for (let i = 0; i < 3; i++) results.push(await checkRateLimit(`diagnostics:${id}`, { maxRequests: 2, windowMs: 10000 }));
  if (!results[0].success || !results[1].success || results[2].success) throw new Error("Durable rate limit failed");
  await queue.send({ kind: "probe", id } satisfies ProbeJob);
  return { id, rateLimits: "verified", queue: "accepted" };
}

export async function processInfrastructureProbe(id: string) {
  if (!isProbeId(id)) throw new Error("Invalid probe ID");
  const bucket = getThumbnailBucket();
  if (await bucket.head(key(id))) return;
  // Valid 1x1 PNG; the private container performs the same native conversion as uploads.
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII=", "base64");
  const result = await requestThumbnail("image", png, {}, "image/png", AbortSignal.timeout(120000));
  if (result.toString("ascii", 0, 4) !== "RIFF" || result.toString("ascii", 8, 12) !== "WEBP") throw new Error("Invalid thumbnail output");
  await bucket.put(key(id), result, { httpMetadata: { contentType: "image/webp" } });
}

export async function inspectInfrastructureProbe(id: string, cleanup = false) {
  if (!isProbeId(id)) return { status: "invalid" };
  const bucket = getThumbnailBucket();
  const result = await bucket.head(key(id));
  if (!result) return { status: "pending" };
  if (cleanup) await bucket.delete(key(id));
  return { status: "complete", bytes: result.size, contentType: result.httpMetadata?.contentType, cleaned: cleanup };
}
