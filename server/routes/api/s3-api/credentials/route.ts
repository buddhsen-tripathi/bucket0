/**
 * S3 API Credentials Management
 *
 * POST /api/s3-api/credentials - Create a new access key
 * GET /api/s3-api/credentials - List access keys
 * DELETE /api/s3-api/credentials?id=xxx - Delete an access key
 */

import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { auth } from "@/server/compat/clerk";
import { s3ApiCredentialService } from "@/lib/s3-api";
import { s3ApiLog } from "@/lib/shared/logger";
import { db } from "@/lib/shared/db";
import { s3ApiCredentials, s3ApiBuckets } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

/**
 * POST - Create a new S3 API access key
 *
 * Body: { name: string }
 * Returns: { accessKeyId, secretAccessKey, name, createdAt }
 *
 * Note: secretAccessKey is only returned once on creation
 */
export async function POST(request: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const name = body.name || "Untitled Key";

    const result = await s3ApiCredentialService.createCredential(userId, name);

    if (!result.success) {
      return NextResponse.json(
        {
          error: result.error?.message,
          code: result.error?.code,
        },
        { status: result.error?.code === "USER_NOT_FOUND" ? 404 : 403 }
      );
    }

    s3ApiLog.info("API credential created");
    return NextResponse.json({
      credential: {
        id: result.credential!.id,
        accessKeyId: result.credential!.accessKeyId,
        secretAccessKey: result.credential!.secretAccessKey,
        name: result.credential!.name,
        createdAt: result.credential!.createdAt.toISOString(),
      },
      warning: "Store the secret access key securely. It will not be shown again.",
    });
  } catch (error) {
    s3ApiLog.error({ err: error }, "Error creating credential");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * GET - List all S3 API access keys
 *
 * Returns: { credentials: [...] }
 *
 * Note: Secret keys are never returned, only access key IDs
 */
export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const credentials = await s3ApiCredentialService.listCredentials(userId);

    return NextResponse.json({
      credentials: credentials.map(cred => ({
        id: cred.id,
        accessKeyId: cred.accessKeyId,
        name: cred.name,
        lastUsedAt: cred.lastUsedAt?.toISOString() || null,
        isActive: cred.isActive,
        expiresAt: cred.expiresAt?.toISOString() || null,
        createdAt: cred.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    s3ApiLog.error({ err: error }, "Error listing credentials");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE - Delete an S3 API access key
 *
 * Query: ?id=xxx
 */
export async function DELETE(request: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const credentialId = request.nextUrl.searchParams.get("id");

  if (!credentialId) {
    return NextResponse.json({ error: "Missing credential ID" }, { status: 400 });
  }

  try {
    // Prevent deleting the last key if buckets exist
    const [[keyCount], [bucketCount]] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(s3ApiCredentials).where(eq(s3ApiCredentials.userId, userId)),
      db.select({ count: sql<number>`count(*)` }).from(s3ApiBuckets).where(eq(s3ApiBuckets.userId, userId)),
    ]);

    if (keyCount.count <= 1 && bucketCount.count > 0) {
      return NextResponse.json(
        { error: "Cannot delete the last API key while buckets exist. Delete your buckets first, or create another key before deleting this one." },
        { status: 409 }
      );
    }

    const deleted = await s3ApiCredentialService.deleteCredential(userId, credentialId);

    if (!deleted) {
      return NextResponse.json({ error: "Credential not found" }, { status: 404 });
    }

    s3ApiLog.info("API credential deleted");
    return NextResponse.json({ success: true });
  } catch (error) {
    s3ApiLog.error({ err: error }, "Error deleting credential");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
