import { db } from "@/lib/shared/db";
import { cloudFolders } from "@/db/schema";
import { and, eq, or, sql } from "drizzle-orm";

/**
 * Catalog chokepoint for the Bucket0 cloud drive (R2).
 *
 * R2 holds the bytes; `cloud_files` + `cloud_folders` are the queryable index the
 * app lists from. Every code path that creates/deletes a file or folder in R2 must
 * also go through here so the index stays in sync. The reconciliation job is the
 * backstop, not the mechanism.
 *
 * Paths here are *relative to the user root* and folder paths always end in "/"
 * ("" = drive root). The `isAgentUpload` flag mirrors `cloud_files`: My Drive and
 * Agent Storage are independent folder trees.
 */

/**
 * Parent directory of `fileKey` relative to the user root, ending in "/"; "" = drive root.
 * For a folder-marker key (ends in "/") this returns the *parent* of that folder.
 */
export function deriveFolderPath(userId: string, fileKey: string): string {
  const prefix = `users/${userId}/`;
  if (!fileKey.startsWith(prefix)) return "";
  let rel = fileKey.slice(prefix.length);
  if (rel.endsWith("/")) rel = rel.slice(0, -1); // folder marker → its parent
  const i = rel.lastIndexOf("/");
  return i === -1 ? "" : rel.slice(0, i + 1);
}

/** All ancestor folder paths of `folderPath`, root-first. `"a/b/c/"` → `["a/", "a/b/", "a/b/c/"]`. `""` → `[]`. */
export function ancestorFolderPaths(folderPath: string): string[] {
  const segments = folderPath.split("/").filter(Boolean);
  const out: string[] = [];
  let acc = "";
  for (const seg of segments) {
    acc += `${seg}/`;
    out.push(acc);
  }
  return out;
}

function folderRow(userId: string, path: string, isAgentUpload: boolean) {
  const segments = path.split("/").filter(Boolean);
  return {
    userId,
    path,
    parentPath: segments.slice(0, -1).map((s) => `${s}/`).join(""),
    name: segments[segments.length - 1],
    isAgentUpload,
  };
}

export const cloudCatalog = {
  deriveFolderPath,
  ancestorFolderPaths,

  /**
   * Ensure `folderPath` and all of its ancestors exist as `cloud_folders` rows.
   * Idempotent (ON CONFLICT DO NOTHING). No-op for the root ("").
   */
  async ensureFolders(userId: string, folderPath: string, opts?: { isAgentUpload?: boolean }): Promise<void> {
    const paths = ancestorFolderPaths(folderPath);
    if (paths.length === 0) return;
    const isAgentUpload = opts?.isAgentUpload ?? false;
    await db
      .insert(cloudFolders)
      .values(paths.map((p) => folderRow(userId, p, isAgentUpload)))
      .onConflictDoNothing({ target: [cloudFolders.userId, cloudFolders.isAgentUpload, cloudFolders.path] });
  },

  /** Call right after a `cloud_files` row is inserted/updated so its folder chain exists. */
  async onFileWritten(userId: string, fileKey: string, opts?: { isAgentUpload?: boolean }): Promise<void> {
    await cloudCatalog.ensureFolders(userId, deriveFolderPath(userId, fileKey), opts);
  },

  /** Explicit folder creation (the "New folder" action). `path` must end in "/". */
  async createFolder(userId: string, path: string, opts?: { isAgentUpload?: boolean }): Promise<void> {
    await cloudCatalog.ensureFolders(userId, path, opts);
  },

  /**
   * Remove a folder and everything beneath it from `cloud_folders`.
   * Call after the R2 + `cloud_files` cleanup for that subtree. Does not touch parent folders.
   */
  async removeFolderSubtree(userId: string, path: string, opts?: { isAgentUpload?: boolean }): Promise<void> {
    if (!path) return; // never delete "the root"
    const isAgentUpload = opts?.isAgentUpload ?? false;
    const escaped = path.replace(/([%_\\])/g, "\\$1");
    await db.delete(cloudFolders).where(
      and(
        eq(cloudFolders.userId, userId),
        eq(cloudFolders.isAgentUpload, isAgentUpload),
        // the folder itself, plus everything beneath it
        or(eq(cloudFolders.path, path), sql`${cloudFolders.path} LIKE ${`${escaped}%`} ESCAPE '\\'`),
      ),
    );
  },

  /** Remove every `cloud_folders` row for a user (account deletion). */
  async removeAllForUser(userId: string): Promise<void> {
    await db.delete(cloudFolders).where(eq(cloudFolders.userId, userId));
  },
};
