import { auth, currentUser } from "@/server/compat/clerk";
import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { polar } from "@/lib/payments/polar";
import { polarLog } from "@/lib/shared/logger";

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const interval = body.interval === "yearly" ? "yearly" : "monthly";
  const plan = body.plan || "pro"; // "starter", "pro", or "scale"

  let productId: string;

  if (plan === "starter") {
    productId =
      interval === "yearly"
        ? process.env.POLAR_PRODUCT_ID_STARTER_YEARLY!
        : process.env.POLAR_PRODUCT_ID_STARTER_MONTHLY!;
  } else if (plan === "scale") {
    productId =
      interval === "yearly"
        ? process.env.POLAR_PRODUCT_ID_SCALE_YEARLY!
        : process.env.POLAR_PRODUCT_ID_SCALE_MONTHLY!;
  } else {
    // Default to Pro
    productId =
      interval === "yearly"
        ? process.env.POLAR_PRODUCT_ID_PRO_YEARLY!
        : process.env.POLAR_PRODUCT_ID_PRO_MONTHLY!;
  }

  const user = await currentUser();
  const email = user?.emailAddresses[0]?.emailAddress;

  try {
    const successUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?upgraded=true`;

    const checkout = await polar.checkouts.create({
      products: [productId],
      successUrl,
      customerEmail: email,
      metadata: {
        userId,
        plan,
      },
    });

    polarLog.info("Checkout session created");
    return NextResponse.json({ url: checkout.url });
  } catch (error) {
    polarLog.error({ err: error }, "Checkout error");
    return NextResponse.json(
      { error: "Failed to create checkout session", details: String(error) },
      { status: 500 }
    );
  }
}
