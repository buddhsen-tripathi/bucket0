/**
 * External S3 Bucket - Generate View URL
 *
 * Generates a presigned URL for inline viewing (preview) of a file.
 * Sets Content-Disposition: inline and appropriate Content-Type based on extension.
 *
 * POST /api/s3/view
 * Body: { config: S3Config, key: string, expiresIn?: number }
 * Returns: { viewUrl: string }
 */

import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { auth } from "@/server/compat/clerk";
import { S3Client, GetObjectCommand, S3ClientConfig } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getContentTypeFromExtension } from "@/lib/shared/http-utils";
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
    const contentType = getContentTypeFromExtension(key);

    const command = new GetObjectCommand({
      Bucket: config.bucketName,
      Key: key,
      ResponseContentType: contentType,
      ResponseContentDisposition: "inline",
    });

    const viewUrl = await getSignedUrl(s3Client, command, { expiresIn });

    return NextResponse.json({
      viewUrl,
    });
  } catch (error) {
    s3Log.error({ err: error }, "Error generating view URL");
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate view URL",
      },
      { status: 500 }
    );
  }
}
