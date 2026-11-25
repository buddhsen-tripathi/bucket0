import { db } from "@/lib/shared/db";
import { cloudFiles } from "@/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * Check if a user has already saved a shared file to their drive.
 * Returns the filename if saved, null otherwise.
 */
export async function checkIfAlreadySaved(
  userId: string | null,
  shareLinkId: string,
  shareType: "personal" | "team"
): Promise<string | null> {
  if (!userId) {
    return null;
  }

  const [existingSave] = await db
    .select({ fileName: cloudFiles.fileName })
    .from(cloudFiles)
    .where(
      and(
        eq(cloudFiles.userId, userId),
        eq(cloudFiles.sourceShareLinkId, shareLinkId),
        eq(cloudFiles.sourceShareType, shareType)
      )
    )
    .limit(1);

  return existingSave?.fileName || null;
}
