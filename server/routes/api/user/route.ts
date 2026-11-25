import { NextResponse } from "@/server/compat/next-server";
import { auth, currentUser } from "@/server/compat/clerk";
import { db } from "@/lib/shared/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { userLog } from "@/lib/shared/logger";
import { purgeUserData } from "@/lib/shared/user-deletion";

/**
 * Delete user account and all associated data (GDPR compliance)
 *
 * Performs the synchronous purge (R2 objects + every user-owned table) via the
 * shared purgeUserData helper. The same helper runs again from the Clerk
 * `user.deleted` webhook, so deletions triggered outside this route (e.g. the
 * Clerk Account Portal opened from the dashboard) are cleaned up too.
 *
 * This action is irreversible.
 */
export async function DELETE() {
  try {
    const { userId } = await auth();
    const user = await currentUser();

    if (!userId || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await purgeUserData(userId);

    userLog.info("Account deleted");
    return NextResponse.json({
      success: true,
      message: "Account and all associated data have been permanently deleted",
    });
  } catch (error) {
    userLog.error({ err: error }, "Account deletion error");
    return NextResponse.json(
      { error: "Failed to delete account. Please try again or contact support." },
      { status: 500 }
    );
  }
}

/**
 * GET user account information
 */
export async function GET() {
  try {
    const { userId } = await auth();
    const user = await currentUser();

    if (!userId || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [dbUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!dbUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: dbUser.id,
      email: dbUser.email,
      plan: dbUser.plan,
      storageUsage: dbUser.storageUsage,
      fileCount: dbUser.fileCount,
      createdAt: dbUser.createdAt,
    });
  } catch (error) {
    userLog.error({ err: error }, "Get user error");
    return NextResponse.json(
      { error: "Failed to get user information" },
      { status: 500 }
    );
  }
}
