import { runInBackground } from "@/server/context";
import { NextResponse } from "@/server/compat/next-server";
import { auth, currentUser } from "@/server/compat/clerk";
import { dbService } from "@/lib/shared/db-service";
import { getPlanLimits, formatBytes } from "@/lib/payments/plans";
import { db } from "@/lib/shared/db";
import { cloudFiles, cloudFolders } from "@/db/schema";
import { and, eq, asc, desc, sql } from "drizzle-orm";
import { cloudLog } from "@/lib/shared/logger";
import { supportsThumbnail } from "@/lib/cloud/thumbnail-service";
import { enqueueThumbnail } from "@/lib/cloud/background-jobs";

const THUMBNAILS_PER_REQUEST = 10;

/**
 * GET /api/cloud/files/list
 *
 * Folder-scoped, DB-backed, offset-paginated listing for the Bucket0 cloud drive (My Drive).
 *
 * Query params:
 *   path   — folder to list ("" = drive root, e.g. "maskG/" for a sub-folder).
 *   offset — file offset (0-indexed), default 0.
 *   limit  — files in this response, 1..1000, default 100.
 *   sort   — "name" (default) | "size" | "modified".
 *   order  — "asc" (default) | "desc".
 *
 * Response: { path, folders, files, totalItems, offset, limit, hasMore, sort, order, usage, limit, plan, …Formatted }
 *   - `folders` are always returned in full for the level (folder counts are tiny).
 *   - `totalItems` is the total file count for that path (not including folders).
 *   - The client uses (offset, limit, totalItems) to drive numbered pagination + a
 *     "preload 100 ahead" buffer.
 *
 * The /api/cloud/files endpoint stays in place for the mobile app.
 */

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;
const RECENT_CAP = 100; // Recent shows at most this many most-recently-modified files.
const ALLOWED_SORTS = new Set(["name", "size", "modified"] as const);
const ALLOWED_ORDERS = new Set(["asc", "desc"] as const);

type Sort = "name" | "size" | "modified";
type Order = "asc" | "desc";

export async function GET(request: Request) {
  try {
    const { userId } = await auth();
    const user = await currentUser();
    if (!userId || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const email = user.emailAddresses[0]?.emailAddress;
    if (!email) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    // Sanitize path: drop "" and ".." segments; non-root gets a trailing slash.
    const url = new URL(request.url);
    const segs = (url.searchParams.get("path") || "")
      .split("/")
      .filter((s) => s !== "" && s !== "..");
    const path = segs.length ? `${segs.join("/")}/` : "";

    const rawSort = url.searchParams.get("sort");
    const sort: Sort = ALLOWED_SORTS.has(rawSort as Sort) ? (rawSort as Sort) : "name";
    const rawOrder = url.searchParams.get("order");
    const order: Order = ALLOWED_ORDERS.has(rawOrder as Order) ? (rawOrder as Order) : "asc";
    const limit = Math.min(
      Math.max(parseInt(url.searchParams.get("limit") || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );
    const offset = Math.max(parseInt(url.searchParams.get("offset") || "0", 10) || 0, 0);
    // `?retryFailed=1` (user-initiated refresh) → also retry thumbnails that failed a prior attempt.
    const retryFailed = url.searchParams.get("retryFailed") === "1";
    // Flat cross-folder views (not folder-scoped):
    //   ?starred=1 → every starred file;  ?recent=1 → the most-recently-modified files (capped).
    const starred = url.searchParams.get("starred") === "1";
    const recent = url.searchParams.get("recent") === "1";

    const dbUser = await dbService.getUser(userId, email);
    const limits = getPlanLimits(dbUser.plan);

    // Sub-folders at this level (My Drive view). Always returned in full — folder counts are small.
    // Starred/Recent are flat cross-folder lists, so they have no sub-folders.
    const subFolders = starred || recent
      ? []
      : await db
          .select({
            path: cloudFolders.path,
            name: cloudFolders.name,
            createdAt: cloudFolders.createdAt,
          })
          .from(cloudFolders)
          .where(
            and(
              eq(cloudFolders.userId, userId),
              eq(cloudFolders.isAgentUpload, false),
              eq(cloudFolders.parentPath, path),
            ),
          )
          .orderBy(asc(cloudFolders.name));

    // Files for the page. Folder view → files directly in `path`; starred view → every
    // starred file regardless of folder. Both offset-paginated and sorted.
    const fileFilter = and(
      eq(cloudFiles.userId, userId),
      eq(cloudFiles.isAgentUpload, false),
      starred ? eq(cloudFiles.isStarred, true) : recent ? undefined : eq(cloudFiles.folderPath, path),
      sql`${cloudFiles.fileKey} NOT LIKE '%/'`, // exclude folder-marker rows
    );

    // Recent is a fixed window of the most-recently-modified files (a "quick access"
    // surface), so it forces modified-desc + a hard cap and isn't offset-paginated.
    const effOrder: Order = recent ? "desc" : order;
    const effSortCol = recent
      ? cloudFiles.updatedAt
      : sort === "size"
      ? cloudFiles.fileSize
      : sort === "modified"
      ? cloudFiles.updatedAt
      : cloudFiles.fileName;
    const effOffset = recent ? 0 : offset;
    const effLimit = recent ? RECENT_CAP : limit;
    const dir = effOrder === "asc" ? asc : desc;

    const [rows, totalRow] = await Promise.all([
      db
        .select({
          id: cloudFiles.id,
          fileKey: cloudFiles.fileKey,
          fileName: cloudFiles.fileName,
          fileSize: cloudFiles.fileSize,
          mimeType: cloudFiles.mimeType,
          thumbnailKey: cloudFiles.thumbnailKey,
          thumbnailAttempted: cloudFiles.thumbnailAttempted,
          encrypted: cloudFiles.encrypted,
          encryptionMode: cloudFiles.encryptionMode,
          isStarred: cloudFiles.isStarred,
          createdAt: cloudFiles.createdAt,
          updatedAt: cloudFiles.updatedAt,
        })
        .from(cloudFiles)
        .where(fileFilter)
        .orderBy(dir(effSortCol), dir(cloudFiles.id))
        .limit(effLimit)
        .offset(effOffset),
      // Recent uses its returned count as the total (capped window); no separate COUNT.
      recent
        ? Promise.resolve([{ n: 0 }])
        : db.select({ n: sql<number>`count(*)::int` }).from(cloudFiles).where(fileFilter),
    ]);

    // Background thumbnail generation for files in this page that don't have one.
    // `retryFailed` (user-initiated refresh) also retries previously-failed attempts.
    const thumbCandidates = rows.filter(
      (r) => !r.thumbnailKey && r.mimeType && supportsThumbnail(r.mimeType) && (retryFailed || !r.thumbnailAttempted),
    );
    for (const r of thumbCandidates.slice(0, THUMBNAILS_PER_REQUEST)) {
      await runInBackground(enqueueThumbnail(userId, r.fileKey)
        .catch((err) => cloudLog.error({ err }, "Thumb-regen background error")));
    }

    const totalItems = recent ? rows.length : totalRow[0]?.n ?? 0;
    const userPrefix = `users/${userId}/`;
    const files = rows.map((r) => ({
      key: r.fileKey.startsWith(userPrefix) ? r.fileKey.slice(userPrefix.length) : r.fileKey,
      fileName: r.fileName,
      size: r.fileSize,
      lastModified: r.updatedAt,
      etag: "",
      hasThumbnail: !!r.thumbnailKey,
      mimeType: r.mimeType,
      isStarred: r.isStarred,
    }));

    return NextResponse.json({
      path,
      folders: subFolders.map((f) => ({ name: f.name, path: f.path, createdAt: f.createdAt })),
      files,
      pagination: {
        offset: effOffset,
        limit: effLimit,
        totalItems,
        hasMore: recent ? false : offset + files.length < totalItems,
      },
      sort: recent ? "modified" : sort,
      order: effOrder,
      // Plan / usage info (matches the /api/cloud/files top-level shape).
      usage: Number(dbUser.storageUsage),
      limit: limits.maxStorageBytes,
      plan: dbUser.plan,
      maxFileSize: limits.maxFileSizeBytes,
      maxFileSizeFormatted: formatBytes(limits.maxFileSizeBytes),
      usageFormatted: formatBytes(dbUser.storageUsage),
      limitFormatted: formatBytes(limits.maxStorageBytes),
    });
  } catch (error) {
    cloudLog.error({ err: error }, "Cloud listing v2 error");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list files" },
      { status: 500 },
    );
  }
}
