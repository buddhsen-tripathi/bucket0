/**
 * S3-Compatible API Gateway
 *
 * Handles all S3 API operations:
 * - GET / - ListBuckets
 * - GET /{bucket} - ListObjectsV2
 * - HEAD /{bucket} - HeadBucket
 * - PUT /{bucket} - CreateBucket
 * - DELETE /{bucket} - DeleteBucket
 * - GET /{bucket}/{key} - GetObject
 * - HEAD /{bucket}/{key} - HeadObject
 * - PUT /{bucket}/{key} - PutObject
 * - DELETE /{bucket}/{key} - DeleteObject
 *
 * Authentication: AWS Signature v4 with full signature verification
 */

import { NextRequest } from "@/server/compat/next-server";
import { Readable } from "stream";
import {
  parseAuthorizationHeader,
  parsePresignedAuthorization,
  verifySignature,
  verifyPresignedSignature,
  checkHeaderRequest,
  extractHeaders,
  s3ApiCredentialService,
  s3ApiStorageService,
  s3ApiQuotaService,
  s3ApiBucketService,
  s3ErrorResponse,
  acquireObjectLease,
  releaseObjectLease,
  generateListObjectsV2Xml,
  generateListBucketsXml,
} from "@/lib/s3-api";
import { s3ApiLog } from "@/lib/shared/logger";
import { userContentSecurityHeaders } from "@/lib/shared/user-content";

/**
 * Authenticate request using AWS Signature v4
 * Performs full signature verification for industrial-standard security
 */
async function authenticateRequest(
  request: NextRequest,
  body?: Buffer
): Promise<{ userId: string; credentialId: string } | Response | null> {
  const authHeader = request.headers.get("authorization");

  const url = new URL(request.url);
  const presignedAuth = parsePresignedAuthorization(url.search.slice(1));
  // Reject ambiguous authentication rather than choosing one set of credentials.
  if (authHeader && url.searchParams.has('X-Amz-Algorithm')) return null;
  const authComponents = authHeader ? parseAuthorizationHeader(authHeader) : presignedAuth;
  if (!authComponents) {
    return null;
  }

  // Look up the credential by access key ID
  const credential = await s3ApiCredentialService.getCredentialByAccessKey(
    authComponents.accessKeyId
  );

  if (!credential) {
    return null;
  }

  // Check if credential is valid (active and not expired)
  const validCheck = s3ApiCredentialService.isCredentialValid(
    credential.isActive,
    credential.expiresAt
  );

  if (!validCheck.valid) {
    return null;
  }

  // Extract headers for signature verification
  const headers = extractHeaders(request.headers);
  headers.host ||= url.host;

  // Get the request path and query string
  const queryString = url.search.slice(1); // Remove leading '?'

  // Determine the path the SDK used when computing the signature:
  // - Via s3.bucket0.com: the Worker rewrites /bucket/key → /api/s3-api/bucket/key for routing,
  //   but the SDK signed against the original path (/bucket/key), so strip the prefix.
  // - Via bucket0.com/api/s3-api: the SDK signed the full path, use as-is.
  // This mirrors how AWS S3 uses the Host header to distinguish path-style vs virtual-hosted.
  const host = headers.host;
  const isS3Subdomain = host === "s3.bucket0.com" || host.startsWith("s3.bucket0.com:");
  const signaturePath = isS3Subdomain
    ? url.pathname.replace(/^\/api\/s3-api/, "") || "/"
    : url.pathname;

  // Verify the AWS Signature v4
  const verification = {
    method: request.method,
    path: signaturePath,
    queryString,
    headers,
    body,
    secretAccessKey: credential.secretAccessKey,
  };
  const isValidSignature = presignedAuth && !authHeader
    ? verifyPresignedSignature(presignedAuth, verification)
    : verifySignature(authComponents, verification);

  if (!isValidSignature) {
    s3ApiLog.error("Signature verification failed");
    return null;
  }

  // Header signatures must be fresh and bound to the received body (presigned URLs check this when parsed).
  const headerError = authHeader ? checkHeaderRequest(authComponents, verification) : null;
  if (headerError === "AccessDenied") return null;
  if (headerError === "RequestTimeTooSkewed") {
    return s3ErrorResponse(headerError, "The difference between the request time and the current time is too large.");
  }
  if (headerError === "XAmzContentSHA256Mismatch") {
    return s3ErrorResponse(headerError, "The provided 'x-amz-content-sha256' header does not match what was computed.");
  }

  // Update last used timestamp
  await s3ApiCredentialService.updateLastUsed(credential.id);

  return {
    userId: credential.userId,
    credentialId: credential.id,
  };
}

/**
 * Parse the request path to extract bucket and key
 */
function parsePath(path: string[]): { bucket: string | null; key: string; invalid: boolean } {
  if (!path || path.length === 0) {
    return { bucket: null, key: "", invalid: false };
  }

  const bucket = path[0];
  const key = path.slice(1).join("/");
  // Segments are already decoded, so "%2F" may have introduced "/"; dot segments would escape the tenant prefix.
  const invalid = path.join("/").split("/").some(segment => segment === "." || segment === "..");

  return { bucket, key, invalid };
}

/**
 * GET handler - ListBuckets, ListObjectsV2, GetObject
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  // GET requests have no body
  const auth = await authenticateRequest(request, undefined);

  if (!auth) {
    return s3ErrorResponse("AccessDenied", "Access Denied - Invalid signature");
  }
  if (auth instanceof Response) return auth;

  const { path: pathArray } = await params;
  const { bucket, key, invalid } = parsePath(pathArray || []);
  if (invalid) {
    return s3ErrorResponse("InvalidArgument", "Bucket and key path segments may not be '.' or '..'");
  }

  // ListBuckets - GET /
  if (!bucket) {
    const buckets = await s3ApiBucketService.listBuckets(auth.userId);

    const xml = generateListBucketsXml({
      ownerDisplayName: auth.userId,
      ownerId: auth.userId,
      buckets: buckets.map(b => ({
        name: b.bucketName,
        creationDate: b.createdAt,
      })),
    });

    return new Response(xml, {
      headers: {
        "Content-Type": "application/xml",
        "x-amz-request-id": crypto.randomUUID(),
      },
    });
  }

  // Verify bucket exists
  const bucketExists = await s3ApiBucketService.bucketExists(auth.userId, bucket);
  if (!bucketExists) {
    // Auto-create bucket on first access (for better UX)
    const createResult = await s3ApiBucketService.createBucket(auth.userId, bucket);
    if (!createResult.success) {
      return s3ErrorResponse("NoSuchBucket", `The specified bucket does not exist: ${bucket}`, `/${bucket}`);
    }
  }

  // ListObjectsV2 - GET /{bucket}?list-type=2
  if (!key || key === "") {
    const prefix = request.nextUrl.searchParams.get("prefix") || undefined;
    const delimiter = request.nextUrl.searchParams.get("delimiter") || undefined;
    const maxKeys = parseInt(request.nextUrl.searchParams.get("max-keys") || "1000", 10);
    const continuationToken = request.nextUrl.searchParams.get("continuation-token") || undefined;

    const result = await s3ApiStorageService.listObjects(auth.userId, bucket, {
      prefix,
      delimiter,
      maxKeys,
      continuationToken,
    });

    const xml = generateListObjectsV2Xml({
      name: bucket,
      prefix,
      delimiter,
      maxKeys,
      keyCount: result.objects.length,
      isTruncated: result.isTruncated,
      continuationToken,
      nextContinuationToken: result.nextContinuationToken,
      contents: result.objects.map(obj => ({
        key: obj.key,
        lastModified: obj.lastModified,
        etag: obj.etag,
        size: obj.size,
      })),
      commonPrefixes: result.prefixes,
    });

    return new Response(xml, {
      headers: {
        "Content-Type": "application/xml",
        "x-amz-request-id": crypto.randomUUID(),
      },
    });
  }

  // GetObject - GET /{bucket}/{key}
  const range = request.headers.get("range") || undefined;

  const result = await s3ApiStorageService.getObject(auth.userId, bucket, key, range);

  if (!result) {
    return s3ErrorResponse("NoSuchKey", `The specified key does not exist: ${key}`, `/${bucket}/${key}`);
  }

  const headers: Record<string, string> = {
    "Content-Type": result.contentType,
    "Content-Length": String(result.contentLength),
    ...userContentSecurityHeaders(result.contentType),
    "ETag": result.etag,
    "Last-Modified": result.lastModified.toUTCString(),
    "Accept-Ranges": "bytes",
    "x-amz-request-id": crypto.randomUUID(),
  };

  if (result.contentRange) {
    headers["Content-Range"] = result.contentRange;
  }

  // Convert Node.js Readable to Web ReadableStream
  const webStream = Readable.toWeb(result.body) as ReadableStream;

  return new Response(webStream, {
    status: range ? 206 : 200,
    headers,
  });
}

/**
 * HEAD handler - HeadBucket, HeadObject
 */
export async function HEAD(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  // HEAD requests have no body
  const auth = await authenticateRequest(request, undefined);

  if (!auth) {
    return s3ErrorResponse("AccessDenied", "Access Denied - Invalid signature");
  }
  if (auth instanceof Response) return auth;

  const { path: pathArray } = await params;
  const { bucket, key, invalid } = parsePath(pathArray || []);
  if (invalid) {
    return s3ErrorResponse("InvalidArgument", "Bucket and key path segments may not be '.' or '..'");
  }

  if (!bucket) {
    return s3ErrorResponse("InvalidRequest", "Bucket name is required");
  }

  // HeadBucket - HEAD /{bucket}
  if (!key || key === "") {
    const bucketExists = await s3ApiBucketService.bucketExists(auth.userId, bucket);

    if (!bucketExists) {
      return s3ErrorResponse("NoSuchBucket", `The specified bucket does not exist: ${bucket}`, `/${bucket}`);
    }

    return new Response(null, {
      status: 200,
      headers: {
        "x-amz-bucket-region": "auto",
        "x-amz-request-id": crypto.randomUUID(),
      },
    });
  }

  // HeadObject - HEAD /{bucket}/{key}
  const metadata = await s3ApiStorageService.headObject(auth.userId, bucket, key);

  if (!metadata) {
    return s3ErrorResponse("NoSuchKey", `The specified key does not exist: ${key}`, `/${bucket}/${key}`);
  }

  return new Response(null, {
    status: 200,
    headers: {
      "Content-Type": metadata.contentType,
      "Content-Length": String(metadata.contentLength),
      ...userContentSecurityHeaders(metadata.contentType),
      "ETag": metadata.etag,
      "Last-Modified": metadata.lastModified.toUTCString(),
      "Accept-Ranges": "bytes",
      "x-amz-request-id": crypto.randomUUID(),
    },
  });
}

/**
 * PUT handler - CreateBucket, PutObject
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  const { path: pathArray } = await params;
  const { bucket, key, invalid } = parsePath(pathArray || []);
  if (invalid) {
    return s3ErrorResponse("InvalidArgument", "Bucket and key path segments may not be '.' or '..'");
  }

  if (!bucket) {
    return s3ErrorResponse("InvalidRequest", "Bucket name is required");
  }

  // Read body first (needed for signature verification)
  let body: Buffer;
  try {
    body = Buffer.from(await request.arrayBuffer());
  } catch (error) {
    s3ApiLog.error({ err: error }, "Failed to read request body");
    return s3ErrorResponse("InvalidRequest", "Failed to read request body");
  }

  // Authenticate with body for signature verification
  const auth = await authenticateRequest(request, body);

  if (!auth) {
    return s3ErrorResponse("AccessDenied", "Access Denied - Invalid signature");
  }
  if (auth instanceof Response) return auth;

  // CreateBucket - PUT /{bucket} (no key)
  if (request.nextUrl.searchParams.has('uploadId') || request.nextUrl.searchParams.has('partNumber')) {
    return s3ErrorResponse('InvalidRequest', 'S3 multipart uploads are not supported; use PutObject without uploadId or partNumber');
  }

  if (!key || key === "") {
    const createResult = await s3ApiBucketService.createBucket(auth.userId, bucket);
    if (!createResult.success) {
      if (createResult.error?.code === "ALREADY_EXISTS") {
        return s3ErrorResponse("BucketAlreadyExists", `Bucket already exists: ${bucket}`, `/${bucket}`);
      }
      return s3ErrorResponse("InvalidBucketName", createResult.error?.message || `Invalid bucket name: ${bucket}`, `/${bucket}`);
    }

    return new Response(null, {
      status: 200,
      headers: {
        "Location": `/${bucket}`,
        "x-amz-request-id": crypto.randomUUID(),
      },
    });
  }

  // PutObject - PUT /{bucket}/{key}
  // Auto-create bucket if it doesn't exist
  const bucketResult = await s3ApiBucketService.getOrCreateBucket(auth.userId, bucket);
  if (!bucketResult) {
    return s3ErrorResponse("InvalidBucketName", `Invalid bucket name: ${bucket}`, `/${bucket}`);
  }

  // Get content type from header
  const contentType = request.headers.get("content-type") || "application/octet-stream";
  const actualSize = body.length;

  // Serialize writes/deletes per object so the size read and quota change happen once
  const lease = await acquireObjectLease(auth.userId, bucket, key);
  if (!lease) {
    return s3ErrorResponse("OperationAborted", "A conflicting operation on this object is in progress. Try again.");
  }

  try {
    // Check if existing object
    const existingSize = await s3ApiStorageService.getObjectSize(auth.userId, bucket, key);

    // Check quota
    if (existingSize === 0) {
      // New object - need to reserve quota
      const quotaCheck = await s3ApiQuotaService.checkUploadAllowed(auth.userId, actualSize);

      if (!quotaCheck.allowed) {
        if (quotaCheck.error?.code === "STORAGE_LIMIT") {
          return s3ErrorResponse("QuotaExceeded", quotaCheck.error.message);
        }
        if (quotaCheck.error?.code === "FILE_SIZE_LIMIT") {
          return s3ErrorResponse("EntityTooLarge", quotaCheck.error.message);
        }
        return s3ErrorResponse("AccessDenied", quotaCheck.error?.message || "Upload not allowed");
      }

      // Reserve quota atomically
      const quotaResult = await s3ApiQuotaService.reserveQuota(auth.userId, actualSize);

      if (!quotaResult.success) {
        return s3ErrorResponse("QuotaExceeded", "Storage quota exceeded");
      }
    } else {
      // Replacing existing object - adjust quota
      const quotaResult = await s3ApiQuotaService.adjustQuotaForReplace(
        auth.userId,
        existingSize,
        actualSize
      );

      if (!quotaResult.success && quotaResult.quotaExceeded) {
        return s3ErrorResponse("QuotaExceeded", "Storage quota exceeded");
      }
    }

    try {

      // Upload to R2
      const result = await s3ApiStorageService.putObject(
        auth.userId,
        bucket,
        key,
        body,
        contentType,
        actualSize
      );

      // Update bucket stats
      const countChange = existingSize === 0 ? 1 : 0;
      const storageChange = actualSize - existingSize;
      await s3ApiQuotaService.updateBucketStats(auth.userId, bucket, storageChange, countChange);

      return new Response(null, {
        status: 200,
        headers: {
          "ETag": result.etag,
          "x-amz-request-id": crypto.randomUUID(),
        },
      });
    } catch (error) {
      // Rollback quota on failure
      if (existingSize === 0) {
        await s3ApiQuotaService.releaseQuota(auth.userId, actualSize);
      } else {
        // Restore original size
        await s3ApiQuotaService.adjustQuotaForReplace(auth.userId, actualSize, existingSize);
      }

      // Log detailed error info
      const errorMessage = error instanceof Error ? error.message : String(error);
      s3ApiLog.error({ err: error }, "PutObject error");

      return s3ErrorResponse("InternalError", `Failed to upload object: ${errorMessage}`);
    }
  } finally {
    await releaseObjectLease(auth.userId, bucket, key, lease).catch((err) =>
      s3ApiLog.error({ err }, "Failed to release S3 object lease")
    );
  }
}

/**
 * DELETE handler - DeleteBucket, DeleteObject
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  // DELETE requests have no body
  const auth = await authenticateRequest(request, undefined);

  if (!auth) {
    return s3ErrorResponse("AccessDenied", "Access Denied - Invalid signature");
  }
  if (auth instanceof Response) return auth;

  if (request.nextUrl.searchParams.has('uploadId')) {
    return s3ErrorResponse('InvalidRequest', 'S3 multipart uploads are not supported; no object was deleted');
  }

  const { path: pathArray } = await params;
  const { bucket, key, invalid } = parsePath(pathArray || []);
  if (invalid) {
    return s3ErrorResponse("InvalidArgument", "Bucket and key path segments may not be '.' or '..'");
  }

  if (!bucket) {
    return s3ErrorResponse("InvalidRequest", "Bucket name is required");
  }

  // Check bucket exists
  const bucketExists = await s3ApiBucketService.bucketExists(auth.userId, bucket);
  if (!bucketExists) {
    return s3ErrorResponse("NoSuchBucket", `The specified bucket does not exist: ${bucket}`, `/${bucket}`);
  }

  // DeleteBucket - DELETE /{bucket} (no key)
  if (!key || key === "") {
    // Check if bucket is empty
    const { objectCount } = await s3ApiQuotaService.getBucketStats(auth.userId, bucket) || { objectCount: 0 };

    if (objectCount > 0) {
      return s3ErrorResponse("BucketNotEmpty", `The bucket you tried to delete is not empty: ${bucket}`, `/${bucket}`);
    }

    // Delete the bucket
    const deleteResult = await s3ApiBucketService.deleteBucket(auth.userId, bucket);
    if (!deleteResult) {
      return s3ErrorResponse("InternalError", "Failed to delete bucket");
    }

    return new Response(null, {
      status: 204,
      headers: {
        "x-amz-request-id": crypto.randomUUID(),
      },
    });
  }

  // Serialize writes/deletes per object so the size read and quota change happen once
  const lease = await acquireObjectLease(auth.userId, bucket, key);
  if (!lease) {
    return s3ErrorResponse("OperationAborted", "A conflicting operation on this object is in progress. Try again.");
  }

  try {
    // DeleteObject - DELETE /{bucket}/{key}
    // Get object size before deleting (for quota update)
    const existingSize = await s3ApiStorageService.getObjectSize(auth.userId, bucket, key);

    if (existingSize === 0) {
      // Object doesn't exist - S3 still returns 204 for idempotency
      return new Response(null, {
        status: 204,
        headers: {
          "x-amz-request-id": crypto.randomUUID(),
        },
      });
    }

    try {
      // Delete from R2
      if (!await s3ApiStorageService.deleteObject(auth.userId, bucket, key)) {
        return s3ErrorResponse("InternalError", "Failed to delete object");
      }

      // Release quota
      await s3ApiQuotaService.releaseQuota(auth.userId, existingSize);

      // Update bucket stats
      await s3ApiQuotaService.updateBucketStats(auth.userId, bucket, -existingSize, -1);

      return new Response(null, {
        status: 204,
        headers: {
          "x-amz-request-id": crypto.randomUUID(),
        },
      });
    } catch (error) {
      s3ApiLog.error({ err: error }, "DeleteObject error");
      return s3ErrorResponse("InternalError", "Failed to delete object");
    }
  } finally {
    await releaseObjectLease(auth.userId, bucket, key, lease).catch((err) =>
      s3ApiLog.error({ err }, "Failed to release S3 object lease")
    );
  }
}

/**
 * OPTIONS handler - CORS preflight (handled by middleware, this prevents 405)
 */
export async function OPTIONS() {
  return new Response(null, { status: 204 });
}

/**
 * POST handler - For multipart upload operations
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  // Read body for signature verification
  let body: Buffer | undefined;
  try {
    body = Buffer.from(await request.arrayBuffer());
    if (body.length === 0) body = undefined;
  } catch {
    body = undefined;
  }

  const auth = await authenticateRequest(request, body);

  if (!auth) {
    return s3ErrorResponse("AccessDenied", "Access Denied - Invalid signature");
  }
  if (auth instanceof Response) return auth;

  // Multipart upload initiation is typically done via POST with ?uploads
  // For MVP, we can add this later

  return s3ErrorResponse("InvalidRequest", "POST method not supported for this operation");
}
