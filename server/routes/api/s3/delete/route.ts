/**
 * External S3 Bucket - Delete File
 *
 * Deletes a file from a user's connected external S3-compatible bucket.
 *
 * DELETE /api/s3/delete
 * Body: { config: S3Config, key: string }
 * Returns: { success: true, message: string }
 */

import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { auth } from "@/server/compat/clerk";
import {
  S3Client,
  DeleteObjectCommand,
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

export async function DELETE(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { config, key } = await request.json();

    if (!config || !key) {
      return NextResponse.json(
        { error: "Missing configuration or file key" },
        { status: 400 }
      );
    }

    if (!config.accessKeyId || !config.secretAccessKey || !config.bucketName) {
      return NextResponse.json(
        { error: "Missing required S3 configuration" },
        { status: 400 }
      );
    }

    const s3Client = createS3Client(config as S3Config);

    const command = new DeleteObjectCommand({
      Bucket: config.bucketName,
      Key: key,
    });

    await s3Client.send(command);

    s3Log.info("File deleted from external S3");
    return NextResponse.json({
      success: true,
      message: "File deleted successfully",
    });
  } catch (error) {
    s3Log.error({ err: error }, "Error deleting file");
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to delete file",
      },
      { status: 500 }
    );
  }
}
