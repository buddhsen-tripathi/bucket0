/**
 * External S3 Bucket - Configuration Management
 *
 * CRUD operations for user's external S3 bucket configurations.
 * Credentials are encrypted at rest using AES-256-GCM.
 *
 * Plan limits enforced:
 * - Free: 1 bucket
 * - Starter: 10 buckets
 * - Pro: 25 buckets
 * - Scale: 100 buckets
 *
 * Endpoints:
 * - GET /api/s3/config - List all configs (without credentials)
 * - GET /api/s3/config?id=xxx - Get specific config (with decrypted credentials)
 * - POST /api/s3/config - Create new config (enforces plan limit)
 * - PUT /api/s3/config - Update existing config
 * - DELETE /api/s3/config?id=xxx - Soft delete config
 */

import { NextResponse } from "@/server/compat/next-server";
import { auth, currentUser } from "@/server/compat/clerk";
import { db } from "@/lib/shared/db";
import { s3Configurations } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { encryptS3Credentials, decryptS3Credentials } from "@/lib/s3/server-credential-encryption";
import { dbService } from "@/lib/shared/db-service";
import { getPlanLimits, getPlanConfig } from "@/lib/payments/plans";
import { s3Log } from "@/lib/shared/logger";

/**
 * GET /api/s3/config - List all S3 configurations for current user
 * GET /api/s3/config?id=xxx - Get specific configuration (decrypted)
 */
export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const configId = searchParams.get("id");

    if (configId) {
      // Get specific configuration with decrypted credentials
      const configs = await db
        .select()
        .from(s3Configurations)
        .where(
          and(
            eq(s3Configurations.userId, userId),
            eq(s3Configurations.id, configId),
            eq(s3Configurations.isActive, true)
          )
        )
        .limit(1);

      if (configs.length === 0) {
        return NextResponse.json({ error: "Configuration not found" }, { status: 404 });
      }

      const config = configs[0];

      // Decrypt credentials
      const { accessKeyId, secretAccessKey } = decryptS3Credentials(
        config.encryptedAccessKeyId,
        config.encryptedSecretAccessKey,
        config.credentialsIv,
        config.credentialsAuthTag
      );

      return NextResponse.json({
        id: config.id,
        name: config.name,
        provider: config.provider,
        bucketName: config.bucketName,
        region: config.region,
        endpoint: config.endpoint,
        forcePathStyle: config.forcePathStyle,
        accessKeyId,
        secretAccessKey,
      });
    } else {
      // List all configurations (without credentials)
      const configs = await db
        .select({
          id: s3Configurations.id,
          name: s3Configurations.name,
          provider: s3Configurations.provider,
          bucketName: s3Configurations.bucketName,
          region: s3Configurations.region,
          endpoint: s3Configurations.endpoint,
          forcePathStyle: s3Configurations.forcePathStyle,
          createdAt: s3Configurations.createdAt,
        })
        .from(s3Configurations)
        .where(
          and(
            eq(s3Configurations.userId, userId),
            eq(s3Configurations.isActive, true)
          )
        );

      return NextResponse.json({ configurations: configs });
    }
  } catch (error) {
    s3Log.error({ err: error }, "Failed to get configuration");
    return NextResponse.json(
      { error: "Failed to get configuration" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/s3/config - Create new S3 configuration
 * Enforces bucket connection limits based on user's plan
 */
export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    const user = await currentUser();

    if (!userId || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const email = user.emailAddresses[0]?.emailAddress;
    if (!email) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    const body = await req.json();
    const {
      name,
      provider,
      bucketName,
      region,
      endpoint,
      forcePathStyle,
      accessKeyId,
      secretAccessKey,
    } = body;

    // Validate required fields
    if (!name || !provider || !bucketName || !region || !accessKeyId || !secretAccessKey) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Get user's plan and check bucket limit
    const dbUser = await dbService.getUser(userId, email);
    const limits = getPlanLimits(dbUser.plan);
    const planName = getPlanConfig(dbUser.plan).name;

    // Count existing active bucket configurations
    const existingConfigs = await db
      .select({ id: s3Configurations.id })
      .from(s3Configurations)
      .where(
        and(
          eq(s3Configurations.userId, userId),
          eq(s3Configurations.isActive, true)
        )
      );

    if (existingConfigs.length >= limits.maxBucketConnections) {
      return NextResponse.json(
        {
          error: `Bucket limit reached. Your ${planName} plan allows up to ${limits.maxBucketConnections} bucket connection${limits.maxBucketConnections === 1 ? "" : "s"}.`,
          code: "BUCKET_LIMIT",
          limit: limits.maxBucketConnections,
          current: existingConfigs.length,
        },
        { status: 402 }
      );
    }

    // Encrypt credentials
    const encryptedCreds = encryptS3Credentials(accessKeyId, secretAccessKey);

    // Insert into database
    const newConfig = await db
      .insert(s3Configurations)
      .values({
        userId,
        name,
        provider,
        bucketName,
        region,
        endpoint: endpoint || null,
        forcePathStyle: forcePathStyle || false,
        ...encryptedCreds,
      })
      .returning({
        id: s3Configurations.id,
        name: s3Configurations.name,
        provider: s3Configurations.provider,
      });

    s3Log.info("S3 configuration created");
    return NextResponse.json({
      success: true,
      configuration: newConfig[0],
    });
  } catch (error) {
    s3Log.error({ err: error }, "Failed to create configuration");
    return NextResponse.json(
      { error: "Failed to create configuration" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/s3/config - Update existing S3 configuration
 */
export async function PUT(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      id,
      name,
      provider,
      bucketName,
      region,
      endpoint,
      forcePathStyle,
      accessKeyId,
      secretAccessKey,
    } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Configuration ID required" },
        { status: 400 }
      );
    }

    // Build update object with partial S3 config fields
    const updateData: Partial<{
      name: string;
      provider: string;
      bucketName: string;
      region: string;
      endpoint: string | null;
      forcePathStyle: boolean;
      encryptedAccessKeyId: string;
      encryptedSecretAccessKey: string;
      credentialsIv: string;
      credentialsAuthTag: string;
      updatedAt: Date;
    }> = {
      updatedAt: new Date(),
    };

    if (name) updateData.name = name;
    if (provider) updateData.provider = provider;
    if (bucketName) updateData.bucketName = bucketName;
    if (region) updateData.region = region;
    if (endpoint !== undefined) updateData.endpoint = endpoint || null;
    if (forcePathStyle !== undefined) updateData.forcePathStyle = forcePathStyle;

    // If credentials are being updated
    if (accessKeyId && secretAccessKey) {
      const encryptedCreds = encryptS3Credentials(accessKeyId, secretAccessKey);
      Object.assign(updateData, encryptedCreds);
    }

    // Update in database
    const updated = await db
      .update(s3Configurations)
      .set(updateData)
      .where(
        and(
          eq(s3Configurations.userId, userId),
          eq(s3Configurations.id, id)
        )
      )
      .returning({
        id: s3Configurations.id,
        name: s3Configurations.name,
      });

    if (updated.length === 0) {
      return NextResponse.json(
        { error: "Configuration not found" },
        { status: 404 }
      );
    }

    s3Log.info("S3 configuration updated");
    return NextResponse.json({
      success: true,
      configuration: updated[0],
    });
  } catch (error) {
    s3Log.error({ err: error }, "Failed to update configuration");
    return NextResponse.json(
      { error: "Failed to update configuration" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/s3/config?id=xxx - Delete (deactivate) S3 configuration
 */
export async function DELETE(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const configId = searchParams.get("id");

    if (!configId) {
      return NextResponse.json(
        { error: "Configuration ID required" },
        { status: 400 }
      );
    }

    // Soft delete by setting isActive to false
    const deleted = await db
      .update(s3Configurations)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(s3Configurations.userId, userId),
          eq(s3Configurations.id, configId)
        )
      )
      .returning({ id: s3Configurations.id });

    if (deleted.length === 0) {
      return NextResponse.json(
        { error: "Configuration not found" },
        { status: 404 }
      );
    }

    s3Log.info("S3 configuration deleted");
    return NextResponse.json({ success: true });
  } catch (error) {
    s3Log.error({ err: error }, "Failed to delete configuration");
    return NextResponse.json(
      { error: "Failed to delete configuration" },
      { status: 500 }
    );
  }
}
