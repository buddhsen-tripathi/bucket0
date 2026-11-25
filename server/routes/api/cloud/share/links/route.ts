import { NextResponse } from "@/server/compat/next-server";
import { auth } from "@/server/compat/clerk";
import { db } from "@/lib/shared/db";
import { shareLinks } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { cloudLog } from "@/lib/shared/logger";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const links = await db
      .select()
      .from(shareLinks)
      .where(
        and(
          eq(shareLinks.userId, userId),
          eq(shareLinks.isActive, true)
        )
      )
      .orderBy(desc(shareLinks.createdAt));

    return NextResponse.json({ links });
  } catch (error) {
    cloudLog.error({ err: error }, "List share links error");
    return NextResponse.json(
      { error: "Failed to list share links" },
      { status: 500 }
    );
  }
}
