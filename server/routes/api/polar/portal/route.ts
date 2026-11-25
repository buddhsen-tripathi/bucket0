import { auth } from "@/server/compat/clerk";
import { NextResponse } from "@/server/compat/next-server";
import { polar } from "@/lib/payments/polar";
import { db } from "@/lib/shared/db";
import { subscriptions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { polarLog } from "@/lib/shared/logger";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [subscription] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);

  if (!subscription?.polarCustomerId) {
    return NextResponse.json({ error: "No subscription found" }, { status: 404 });
  }

  try {
    const session = await polar.customerSessions.create({
      customerId: subscription.polarCustomerId,
    });

    return NextResponse.json({ url: session.customerPortalUrl });
  } catch (error) {
    polarLog.error({ err: error }, "Failed to create customer session");
    return NextResponse.json(
      { error: "Failed to create customer portal session" },
      { status: 500 }
    );
  }
}
