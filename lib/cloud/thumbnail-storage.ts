import { getThumbnailBucket } from "@/server/bindings";

export const GENERATED_THUMBNAIL_PREFIX = "cf-thumbnail:";
export async function getGeneratedThumbnail(key: string) {
  if (!key.startsWith(GENERATED_THUMBNAIL_PREFIX)) return null;
  const object = await getThumbnailBucket().get(key.slice(GENERATED_THUMBNAIL_PREFIX.length));
  // Thumbnail output is small; use a byte view across the browser/Workers type boundary.
  return object ? { body: new Uint8Array(await object.arrayBuffer()) } : null;
}

/** Remove all generated versions when files, teams, or accounts are deleted. */
export async function deleteGeneratedThumbnails(scope: "personal" | "team", ownerId: string, fileIds?: string[]) {
  if (fileIds?.length === 0) return;
  const bucket = getThumbnailBucket();
  const ids = fileIds ? new Set(fileIds) : undefined;
  const prefix = `${scope}/${ownerId}/${fileIds?.length === 1 ? fileIds[0] + "/" : ""}`;
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix, cursor, limit: 1000 });
    const keys = page.objects.filter((object) => !ids || ids.has(object.key.split("/")[2])).map((object) => object.key);
    if (keys.length) await bucket.delete(keys);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}
