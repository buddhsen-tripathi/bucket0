import { NextResponse } from "@/server/compat/next-server";
import { auth, currentUser } from "@/server/compat/clerk";
import { db } from "@/lib/shared/db";
import { feedback } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { RateLimiters, createRateLimitHeaders } from "@/lib/payments/rate-limit";
import { feedbackLog } from "@/lib/shared/logger";

/**
 * POST /api/feedback
 * Submit user feedback with context information
 */
export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    const user = await currentUser();

    if (!userId || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check rate limit (5 feedback submissions per hour)
    const rateLimitResult = await RateLimiters.feedback(userId);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: "Too many feedback submissions. Please try again later." },
        { status: 429, headers: createRateLimitHeaders(rateLimitResult) }
      );
    }

    const body = await request.json();
    const { type, message, context } = body;

    // Validate required fields
    if (!type || !message) {
      return NextResponse.json(
        { error: "Type and message are required" },
        { status: 400 }
      );
    }

    // Validate feedback type
    if (!["bug", "feature", "other"].includes(type)) {
      return NextResponse.json(
        { error: "Invalid feedback type" },
        { status: 400 }
      );
    }

    // Insert feedback into database
    const [newFeedback] = await db
      .insert(feedback)
      .values({
        userId,
        email: user.emailAddresses[0]?.emailAddress || "",
        type,
        message,
        context: context ? JSON.stringify(context) : null,
        status: "new",
      })
      .returning();

    // Optionally send notification (e.g., email, Slack, Discord)
    // This can be added later based on requirements

    feedbackLog.info("Feedback submitted");
    return NextResponse.json({
      success: true,
      id: newFeedback.id,
      message: "Feedback submitted successfully",
    });
  } catch (error) {
    feedbackLog.error({ err: error }, "Feedback submission error");
    return NextResponse.json(
      { error: "Failed to submit feedback" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/feedback
 * Get feedback submissions (admin only - to be implemented)
 */
export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // For now, return user's own feedback
    // Admin view can be added later with role checking
    const userFeedback = await db
      .select()
      .from(feedback)
      .where(eq(feedback.userId, userId))
      .orderBy(desc(feedback.createdAt));

    return NextResponse.json({ feedback: userFeedback });
  } catch (error) {
    feedbackLog.error({ err: error }, "Get feedback error");
    return NextResponse.json(
      { error: "Failed to get feedback" },
      { status: 500 }
    );
  }
}
