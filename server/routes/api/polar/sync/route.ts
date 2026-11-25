import { auth } from "@/server/compat/clerk";
import { NextResponse } from "@/server/compat/next-server";
import { db } from "@/lib/shared/db";
import { users, subscriptions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { polarLog } from "@/lib/shared/logger";

// Call this after checkout to sync subscription status from database
export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  try {
    // Check for an active subscription in our database
    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(
        and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active"))
      )
      .limit(1);

    if (subscription) {
      // Determine plan from product ID
      const productPlanMap: Record<string, string> = {};
      // Map all known product IDs to plans
      for (const envKey of Object.keys(process.env)) {
        if (envKey.startsWith("POLAR_PRODUCT_ID_STARTER")) productPlanMap[process.env[envKey]!] = "starter";
        if (envKey.startsWith("POLAR_PRODUCT_ID_PRO")) productPlanMap[process.env[envKey]!] = "pro";
        if (envKey.startsWith("POLAR_PRODUCT_ID_SCALE")) productPlanMap[process.env[envKey]!] = "scale";
      }
      const syncedPlan = productPlanMap[subscription.productId] || user.plan || "starter";

      if (user.plan !== syncedPlan) {
        await db
          .update(users)
          .set({
            plan: syncedPlan,
            updatedAt: new Date(),
          })
          .where(eq(users.id, userId));
      }

      polarLog.info("Subscription synced");
      return NextResponse.json({
        success: true,
        plan: syncedPlan,
        subscriptionStatus: subscription.status,
      });
    }

    // No active subscription found - ensure user is on free plan
    if (user.plan !== "free") {
      await db
        .update(users)
        .set({
          plan: "free",
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
    }

    return NextResponse.json({
      success: true,
      plan: "free",
      message: "No active subscription found",
    });
  } catch (error) {
    polarLog.error({ err: error }, "Sync error");
    return NextResponse.json({ error: "Failed to sync" }, { status: 500 });
  }
}
