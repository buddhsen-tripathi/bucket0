/**
 * External S3 Bucket - Generate Download URL
 *
 * Generates a presigned URL for downloading a file from external S3 bucket.
 * URL includes Content-Disposition: attachment header for download behavior.
 *
 * POST /api/s3/download
 * Body: { config: S3Config, key: string, expiresIn?: number }
 * Returns: { downloadUrl: string, expiresIn: number }
 */

import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { auth } from "@/server/compat/clerk";
import { S3Client, GetObjectCommand, S3ClientConfig } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
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

    const { config, key, expiresIn = 3600 } = await request.json();

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
    const fileName = key.split("/").pop() || key;

    const command = new GetObjectCommand({
      Bucket: config.bucketName,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${fileName}"`,
    });

    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn });

    return NextResponse.json({
      downloadUrl: signedUrl,
      expiresIn,
    });
  } catch (error) {
    s3Log.error({ err: error }, "Error generating download URL");
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate download URL",
      },
      { status: 500 }
    );
  }
}
