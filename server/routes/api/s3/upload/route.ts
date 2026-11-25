/**
 * External S3 Bucket - Upload File / Create Folder
 *
 * Uploads a file or creates an empty folder in a user's external S3 bucket.
 * Supports two modes:
 * - File upload: multipart/form-data with file and config
 * - Folder creation: application/json with config, key, and isEmptyFolder flag
 *
 * POST /api/s3/upload
 *
 * File upload:
 *   Content-Type: multipart/form-data
 *   Body: file (File), config (JSON string)
 *
 * Folder creation:
 *   Content-Type: application/json
 *   Body: { config: S3Config, key: string, isEmptyFolder: true }
 */

import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { auth } from "@/server/compat/clerk";
import { S3Client, PutObjectCommand, S3ClientConfig } from "@aws-sdk/client-s3";
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

    const contentType = request.headers.get("content-type");

    // Handle folder creation (JSON request)
    if (contentType?.includes("application/json")) {
      const body = await request.json();
      const { config, key, isEmptyFolder } = body;

      if (!config || !key || !isEmptyFolder) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }

      const s3Client = createS3Client(config as S3Config);

      const command = new PutObjectCommand({
        Bucket: config.bucketName,
        Key: key,
        Body: "",
      });

      await s3Client.send(command);
      return NextResponse.json({ success: true, key });
    }

    // Handle file upload (multipart/form-data)
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const configStr = formData.get("config") as string;

    if (!file || !configStr) {
      return NextResponse.json(
        { error: "Missing file or configuration" },
        { status: 400 }
      );
    }

    const config = JSON.parse(configStr) as S3Config;

    if (!config.accessKeyId || !config.secretAccessKey || !config.bucketName) {
      return NextResponse.json(
        { error: "Missing required S3 configuration" },
        { status: 400 }
      );
    }

    const s3Client = createS3Client(config);
    const buffer = Buffer.from(await file.arrayBuffer());

    const command = new PutObjectCommand({
      Bucket: config.bucketName,
      Key: file.name,
      Body: buffer,
      ContentType: file.type,
    });

    await s3Client.send(command);

    s3Log.info("File uploaded to external S3");
    return NextResponse.json({
      success: true,
      key: file.name,
      message: "File uploaded successfully",
    });
  } catch (error) {
    s3Log.error({ err: error }, "Error uploading file");
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to upload file",
      },
      { status: 500 }
    );
  }
}
