/**
 * External S3 Bucket - Test Connection
 *
 * Tests if the provided S3 credentials and configuration are valid.
 * Attempts to list one object to verify read access to the bucket.
 *
 * POST /api/s3/test
 * Body: { config: S3Config }
 * Returns: { success: boolean, message?: string, error?: string }
 */

import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { auth } from "@/server/compat/clerk";
import {
  S3Client,
  ListObjectsV2Command,
  S3ClientConfig,
} from "@aws-sdk/client-s3";
import { s3Log } from "@/lib/shared/logger";

interface S3Config {
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  region: string;
  endpoint?: string;
  forcePathStyle?: boolean;
}

function createS3Client(config: S3Config): S3Client {
  const clientConfig: S3ClientConfig = {
    credentials: {
      accessKeyId: config.accessKeyId.trim(),
      secretAccessKey: config.secretAccessKey.trim(),
    },
    region: config.region.trim(),
  };

  if (config.endpoint) {
    clientConfig.endpoint = config.endpoint.trim();
    clientConfig.forcePathStyle = config.forcePathStyle || false;
  }

  return new S3Client(clientConfig);
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { config } = await request.json();

    if (
      !config ||
      !config.accessKeyId ||
      !config.secretAccessKey ||
      !config.bucketName
    ) {
      return NextResponse.json(
        { error: "Missing required S3 configuration" },
        { status: 400 }
      );
    }

    const s3Client = createS3Client(config as S3Config);

    const command = new ListObjectsV2Command({
      Bucket: config.bucketName,
      MaxKeys: 1,
    });

    await s3Client.send(command);

    s3Log.info("S3 connection test passed");
    return NextResponse.json({
      success: true,
      message: "Connection successful",
    });
  } catch (error) {
    s3Log.error({ err: error }, "Connection test failed");
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Connection test failed",
      },
      { status: 500 }
    );
  }
}
