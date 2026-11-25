import { validateEvent, WebhookVerificationError } from "@polar-sh/sdk/webhooks";
import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { db } from "@/lib/shared/db";
import { subscriptions, users } from "@/db/schema";
import { eq } from "drizzle-orm";

type SubscriptionEvent = {
  id: string;
  customerId: string;
  productId: string;
  status: string;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  metadata?: Record<string, unknown>;
};

export async function POST(request: NextRequest) {
  const body = await request.text();
  const headers = Object.fromEntries(request.headers);

  let event;
  try {
    event = validateEvent(body, headers, process.env.POLAR_WEBHOOK_SECRET!);
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
    }
    throw error;
  }

  switch (event.type) {
    case "subscription.created":
    case "subscription.updated":
    case "subscription.active": {
      const sub = event.data as SubscriptionEvent;
      const userId = sub.metadata?.userId as string | undefined;
      const planType = sub.metadata?.plan as string | undefined;

      await db
        .insert(subscriptions)
        .values({
          id: sub.id,
          userId: userId || sub.customerId,
          polarCustomerId: sub.customerId,
          productId: sub.productId,
          status: sub.status,
          currentPeriodEnd: sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null,
          cancelAtPeriodEnd: sub.cancelAtPeriodEnd ?? false,
        })
        .onConflictDoUpdate({
          target: subscriptions.id,
          set: {
            status: sub.status,
            currentPeriodEnd: sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null,
            cancelAtPeriodEnd: sub.cancelAtPeriodEnd ?? false,
            updatedAt: new Date(),
          },
        });

      if (userId && sub.status === "active") {
        // Set plan based on subscription metadata: starter, pro, or scale
        const validPlans = ["starter", "pro", "scale"];
        const newPlan = validPlans.includes(planType || "") ? planType! : "starter";
        await db.update(users).set({ plan: newPlan, updatedAt: new Date() }).where(eq(users.id, userId));
      }
      break;
    }

    case "subscription.canceled":
    case "subscription.revoked": {
      const sub = event.data as SubscriptionEvent;
      const userId = sub.metadata?.userId as string | undefined;

      await db
        .update(subscriptions)
        .set({
          status: sub.status,
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.id, sub.id));

      if (userId) {
        await db.update(users).set({ plan: "free", updatedAt: new Date() }).where(eq(users.id, userId));
      }
      break;
    }
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
