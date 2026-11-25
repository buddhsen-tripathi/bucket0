/**
 * External S3 Bucket - List Files
 *
 * Lists files from a user's connected external S3-compatible bucket.
 * Supports pagination to handle buckets with many files.
 *
 * POST /api/s3/files
 * Body: {
 *   config: S3Config,
 *   continuationToken?: string,  // For pagination
 *   maxKeys?: number,            // Max files per request (default 1000)
 *   prefix?: string              // Filter by prefix (folder path)
 * }
 *
 * Returns: {
 *   files: S3FileObject[],
 *   isTruncated: boolean,        // More files available
 *   nextContinuationToken?: string,  // Token for next page
 *   totalLoaded: number          // Files in this response
 * }
 */

import { NextRequest, NextResponse } from "@/server/compat/next-server";
import { auth } from "@/server/compat/clerk";
import {
  S3Client,
  ListObjectsV2Command,
  ListObjectsV2CommandOutput,
  S3ClientConfig,
  _Object,
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

    const body = await request.json();
    const {
      config,
      continuationToken,
      maxKeys = 1000,
      prefix,
      loadAll = false, // If true, load ALL files (multiple requests)
    } = body;

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

    if (loadAll) {
      // Load ALL files with automatic pagination
      const allFiles: Array<{
        key: string;
        size: number;
        lastModified: Date;
        etag: string;
      }> = [];

      let nextToken: string | undefined = undefined;
      let totalRequests = 0;
      const maxRequests = 100; // Safety limit: 100 requests * 1000 files = 100,000 files max

      do {
        const command = new ListObjectsV2Command({
          Bucket: config.bucketName,
          MaxKeys: 1000,
          Prefix: prefix || undefined,
          ContinuationToken: nextToken,
        });

        const response: ListObjectsV2CommandOutput = await s3Client.send(command);
        totalRequests++;

        const files = (response.Contents || []).map((item: _Object) => ({
          key: item.Key || "",
          size: item.Size || 0,
          lastModified: item.LastModified || new Date(),
          etag: item.ETag || "",
        }));

        allFiles.push(...files);
        nextToken = response.IsTruncated ? response.NextContinuationToken : undefined;
      } while (nextToken && totalRequests < maxRequests);

      return NextResponse.json({
        files: allFiles,
        isTruncated: false,
        totalLoaded: allFiles.length,
        requestsMade: totalRequests,
      });
    }

    // Single page request
    const command = new ListObjectsV2Command({
      Bucket: config.bucketName,
      MaxKeys: Math.min(maxKeys, 1000), // S3 max is 1000
      Prefix: prefix || undefined,
      ContinuationToken: continuationToken || undefined,
    });

    const response = await s3Client.send(command);

    const files = (response.Contents || []).map((item) => ({
      key: item.Key || "",
      size: item.Size || 0,
      lastModified: item.LastModified || new Date(),
      etag: item.ETag || "",
    }));

    return NextResponse.json({
      files,
      isTruncated: response.IsTruncated || false,
      nextContinuationToken: response.NextContinuationToken,
      totalLoaded: files.length,
    });
  } catch (error) {
    s3Log.error({ err: error }, "Error listing files");
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to list files",
      },
      { status: 500 }
    );
  }
}
