import { NextResponse } from "@/server/compat/next-server";
import { auth } from "@/server/compat/clerk";
import { dbService } from "@/lib/shared/db-service";
import { PLAN_CONFIGS, PlanType } from "@/lib/payments/plans";
import { userLog } from "@/lib/shared/logger";

export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user from database to fetch plan
    const user = await dbService.getUser(userId, "");

    // Get storage limit from plan config
    const planConfig = PLAN_CONFIGS[user.plan as PlanType] || PLAN_CONFIGS.free;

    return NextResponse.json({
      plan: user.plan,
      storageUsage: user.storageUsage,
      storageLimit: planConfig.limits.maxStorageBytes,
      fileCount: user.fileCount,
    });
  } catch (error) {
    userLog.error({ err: error }, "Failed to fetch user plan");
    return NextResponse.json(
      { error: "Failed to fetch user plan" },
      { status: 500 }
    );
  }
}
