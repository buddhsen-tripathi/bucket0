import { createHash, timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/lib/shared/db";
import { systemStorage } from "@/lib/cloud/system-service";
import { clerkClient } from "@/server/compat/clerk";
import { getBackgroundQueue, getMediaContainer, getThumbnailBucket } from "@/server/bindings";
import { requestContext } from "@/server/context";
import { cloudLog } from "@/lib/shared/logger";

export function isReadinessAuthorized(request: Request) {
  const expected = process.env.HEALTH_CHECK_TOKEN;
  if (!expected) return false;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  return timingSafeEqual(createHash("sha256").update(expected).digest(), createHash("sha256").update(supplied).digest());
}

async function check<T extends object>(work: () => Promise<T>, timeoutMs = 12000) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const details = await Promise.race([
      work(),
      new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("ReadinessTimeout")), timeoutMs); }),
    ]);
    return { status: "ok" as const, ...details };
  } catch (error) {
    // Provider errors can contain connection strings or object keys; return the type only.
    if (error instanceof Error) {
      let message = error.message;
      for (const value of Object.values(process.env)) {
        if (value && value.length >= 8) message = message.replaceAll(value, "[redacted]");
      }
      cloudLog.error({ type: error.name, reason: message.replace(/https?:\/\/\S+/g, "[url]"),
        frames: error.stack?.split("\n").filter((line) => /^\s+at /.test(line)).slice(0, 8) }, "Readiness provider check failed");
    }
    return { status: "error" as const, error: error instanceof Error ? error.name : "UnknownError" };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function checkReadiness() {
  const [database, storage, auth] = await Promise.all([
    check(async () => {
      const { rows } = await db.execute<{ branch_id: string | null; schema_ready: boolean }>(sql`
        SELECT current_setting('neon.branch_id', true) AS branch_id,
          (SELECT count(*) = 15 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'chunked_uploads'
            AND column_name IN ('id','user_id','file_key','upload_id','size','content_type','encrypted',
              'existing_size','is_new_file','reserved_bytes','reserved_files','state','started_at','updated_at','operation_token')) AS schema_ready
      `);
      const row = rows[0];
      if (!row?.schema_ready) throw new Error("UploadSchemaMissing");
      const target = process.env.DATABASE_URL;
      if (!target) throw new Error("DatabaseURLMissing");
      const endpoint = new URL(target).hostname.toLowerCase().replace(/-pooler(?=\.)/, "");
      return { branchId: row.branch_id, endpointFingerprint: createHash("sha256").update(endpoint).digest("hex").slice(0, 12), schemaReady: true };
    }),
    check(() => systemStorage.checkReadAccess()),
    check(async () => { await (await clerkClient()).users.getCount(); return { verified: true }; }),
  ]);
  const encryption = {
    status: /^[0-9a-f]{32}$/i.test(process.env.ENCRYPTION_KEY ?? "") &&
      /^[0-9a-f]{64}$/i.test(process.env.CREDENTIAL_ENCRYPTION_KEY ?? "") ? "ok" : "error",
  };
  const serviceUrl = process.env.MEDIA_SERVICE_URL;
  const media = await check(async () => {
    const response = serviceUrl
      ? await fetch(new URL("/health", serviceUrl), { signal: AbortSignal.timeout(5000) })
      : await getMediaContainer().getByName("primary").fetch("http://media/health", { signal: AbortSignal.timeout(55000) });
    if (!response.ok) throw new Error("MediaHealthFailed");
    await response.body?.cancel();
    return { verified: true, transport: serviceUrl ? "http" : "private-container" };
  }, 60000);
  const infrastructure = await check(async () => {
    getBackgroundQueue();
    if (!requestContext.getStore()?.env.RATE_LIMITS) throw new Error("RATE_LIMITS binding is missing");
    await getThumbnailBucket().list({ limit: 1 });
    return { queue: "bound", rateLimits: "bound", thumbnails: "verified" };
  });
  const ready = [database, storage, auth, encryption, media, infrastructure].every((result) => result.status === "ok");
  return { status: ready ? "ready" : "not_ready", checks: { database, storage, auth, encryption, media, infrastructure } };
}
