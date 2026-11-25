import { auth, clerkClient } from "@/server/compat/clerk";
import { NextResponse } from "@/server/compat/next-server";
import { RateLimiters, createRateLimitHeaders } from "@/lib/payments/rate-limit";
import { userLog } from "@/lib/shared/logger";

/**
 * GET /api/user/password
 * Check if the current user has a password set
 */
export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const client = await clerkClient();
    const user = await client.users.getUser(userId);

    // Check if user has password-based authentication enabled
    const hasPassword = user.passwordEnabled;

    return NextResponse.json({
      hasPassword,
      // Also return auth methods for UI context
      authMethods: {
        password: user.passwordEnabled,
        oauth: user.externalAccounts.length > 0,
        oauthProviders: user.externalAccounts.map((acc) => acc.provider),
      },
    });
  } catch (error) {
    userLog.error({ err: error }, "Password check error");
    return NextResponse.json(
      { error: "Failed to check password status" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/user/password
 * Set or change password
 * - If user has no password: only newPassword required (set password)
 * - If user has password: currentPassword and newPassword required (change password)
 */
export async function POST(request: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Apply rate limiting: 3 requests per hour
    const rateLimitResult = await RateLimiters.passwordChange(userId);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          error: "Too many password change attempts. Please try again later.",
          resetAt: new Date(rateLimitResult.reset).toISOString(),
        },
        {
          status: 429,
          headers: createRateLimitHeaders(rateLimitResult),
        }
      );
    }

    const { currentPassword, newPassword } = await request.json();

    if (!newPassword) {
      return NextResponse.json(
        { error: "New password is required" },
        { status: 400 }
      );
    }

    // Validate new password length (Clerk requires minimum 8 characters)
    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: "New password must be at least 8 characters long" },
        { status: 400 }
      );
    }

    const client = await clerkClient();

    // Check if user has a password set
    const user = await client.users.getUser(userId);
    const hasPassword = user.passwordEnabled;

    if (hasPassword) {
      // User has password - verify current password before allowing change
      if (!currentPassword) {
        return NextResponse.json(
          { error: "Current password is required" },
          { status: 400 }
        );
      }

      try {
        const { verified } = await client.users.verifyPassword({
          userId,
          password: currentPassword,
        });

        if (!verified) {
          return NextResponse.json(
            { error: "Current password is incorrect" },
            { status: 401 }
          );
        }
      } catch (verifyError: unknown) {
        // Handle Clerk API errors
        const clerkError = verifyError as {
          status?: number;
          errors?: Array<{ code?: string; message?: string }>;
        };

        // 422 typically means password verification failed
        if (clerkError.status === 422) {
          const errorCodes = clerkError.errors?.map((e) => e.code) || [];

          if (errorCodes.includes("form_password_incorrect")) {
            return NextResponse.json(
              { error: "Current password is incorrect" },
              { status: 401 }
            );
          }
        }

        userLog.error({ err: verifyError }, "Password verification error");
        return NextResponse.json(
          { error: "Failed to verify current password" },
          { status: 500 }
        );
      }
    }
    // If user has no password (OAuth-only), skip verification - they're setting a password

    // Set or update password using Clerk's server-side API
    await client.users.updateUser(userId, {
      password: newPassword,
    });

    userLog.info("Password updated");
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    userLog.error({ err: error }, "Password update error");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update password" },
      { status: 500 }
    );
  }
}
