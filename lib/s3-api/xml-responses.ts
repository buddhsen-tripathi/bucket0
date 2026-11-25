/**
 * S3-compatible XML response helpers
 *
 * S3 API returns XML responses for most operations.
 * This module provides helpers to generate these responses.
 */

/**
 * Escape XML special characters
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * S3 error codes
 */
export type S3ErrorCode =
  | "AccessDenied"
  | "BucketAlreadyExists"
  | "BucketNotEmpty"
  | "InternalError"
  | "InvalidAccessKeyId"
  | "InvalidArgument"
  | "InvalidBucketName"
  | "InvalidRequest"
  | "NoSuchBucket"
  | "NoSuchKey"
  | "SignatureDoesNotMatch"
  | "QuotaExceeded"
  | "EntityTooLarge"
  | "RequestTimeTooSkewed"
  | "XAmzContentSHA256Mismatch"
  | "OperationAborted";

/**
 * Generate S3 error XML response
 */
export function generateErrorXml(
  code: S3ErrorCode,
  message: string,
  resource?: string,
  requestId?: string
): string {
  const parts = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<Error>",
    `  <Code>${code}</Code>`,
    `  <Message>${escapeXml(message)}</Message>`,
  ];

  if (resource) {
    parts.push(`  <Resource>${escapeXml(resource)}</Resource>`);
  }

  if (requestId) {
    parts.push(`  <RequestId>${escapeXml(requestId)}</RequestId>`);
  }

  parts.push("</Error>");

  return parts.join("\n");
}

/**
 * HTTP status code for each S3 error
 */
export const S3_ERROR_STATUS: Record<S3ErrorCode, number> = {
  AccessDenied: 403,
  BucketAlreadyExists: 409,
  BucketNotEmpty: 409,
  InternalError: 500,
  InvalidAccessKeyId: 403,
  InvalidArgument: 400,
  InvalidBucketName: 400,
  InvalidRequest: 400,
  NoSuchBucket: 404,
  NoSuchKey: 404,
  SignatureDoesNotMatch: 403,
  QuotaExceeded: 403,
  EntityTooLarge: 400,
  RequestTimeTooSkewed: 403,
  XAmzContentSHA256Mismatch: 400,
  OperationAborted: 409,
};

/**
 * Generate error Response object
 */
export function s3ErrorResponse(
  code: S3ErrorCode,
  message: string,
  resource?: string,
  requestId?: string
): Response {
  const xml = generateErrorXml(code, message, resource, requestId);
  return new Response(xml, {
    status: S3_ERROR_STATUS[code],
    headers: {
      "Content-Type": "application/xml",
      "x-amz-request-id": requestId || crypto.randomUUID(),
    },
  });
}

/**
 * Generate ListObjectsV2 response
 */
export function generateListObjectsV2Xml(params: {
  name: string;
  prefix?: string;
  delimiter?: string;
  maxKeys: number;
  keyCount: number;
  isTruncated: boolean;
  continuationToken?: string;
  nextContinuationToken?: string;
  contents: Array<{
    key: string;
    lastModified: Date;
    etag: string;
    size: number;
    storageClass?: string;
  }>;
  commonPrefixes?: string[];
}): string {
  const parts = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">',
    `  <Name>${escapeXml(params.name)}</Name>`,
  ];

  if (params.prefix) {
    parts.push(`  <Prefix>${escapeXml(params.prefix)}</Prefix>`);
  } else {
    parts.push("  <Prefix/>");
  }

  if (params.delimiter) {
    parts.push(`  <Delimiter>${escapeXml(params.delimiter)}</Delimiter>`);
  }

  parts.push(`  <MaxKeys>${params.maxKeys}</MaxKeys>`);
  parts.push(`  <KeyCount>${params.keyCount}</KeyCount>`);
  parts.push(`  <IsTruncated>${params.isTruncated}</IsTruncated>`);

  if (params.continuationToken) {
    parts.push(`  <ContinuationToken>${escapeXml(params.continuationToken)}</ContinuationToken>`);
  }

  if (params.nextContinuationToken) {
    parts.push(`  <NextContinuationToken>${escapeXml(params.nextContinuationToken)}</NextContinuationToken>`);
  }

  // Contents
  for (const obj of params.contents) {
    parts.push("  <Contents>");
    parts.push(`    <Key>${escapeXml(obj.key)}</Key>`);
    parts.push(`    <LastModified>${obj.lastModified.toISOString()}</LastModified>`);
    parts.push(`    <ETag>${escapeXml(obj.etag)}</ETag>`);
    parts.push(`    <Size>${obj.size}</Size>`);
    parts.push(`    <StorageClass>${obj.storageClass || "STANDARD"}</StorageClass>`);
    parts.push("  </Contents>");
  }

  // Common prefixes (directories)
  if (params.commonPrefixes?.length) {
    for (const prefix of params.commonPrefixes) {
      parts.push("  <CommonPrefixes>");
      parts.push(`    <Prefix>${escapeXml(prefix)}</Prefix>`);
      parts.push("  </CommonPrefixes>");
    }
  }

  parts.push("</ListBucketResult>");

  return parts.join("\n");
}

/**
 * Generate ListBuckets response
 */
export function generateListBucketsXml(params: {
  ownerDisplayName: string;
  ownerId: string;
  buckets: Array<{
    name: string;
    creationDate: Date;
  }>;
}): string {
  const parts = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<ListAllMyBucketsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">',
    "  <Owner>",
    `    <DisplayName>${escapeXml(params.ownerDisplayName)}</DisplayName>`,
    `    <ID>${escapeXml(params.ownerId)}</ID>`,
    "  </Owner>",
    "  <Buckets>",
  ];

  for (const bucket of params.buckets) {
    parts.push("    <Bucket>");
    parts.push(`      <Name>${escapeXml(bucket.name)}</Name>`);
    parts.push(`      <CreationDate>${bucket.creationDate.toISOString()}</CreationDate>`);
    parts.push("    </Bucket>");
  }

  parts.push("  </Buckets>");
  parts.push("</ListAllMyBucketsResult>");

  return parts.join("\n");
}

/**
 * Generate InitiateMultipartUpload response
 */
export function generateInitiateMultipartUploadXml(params: {
  bucket: string;
  key: string;
  uploadId: string;
}): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<InitiateMultipartUploadResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">',
    `  <Bucket>${escapeXml(params.bucket)}</Bucket>`,
    `  <Key>${escapeXml(params.key)}</Key>`,
    `  <UploadId>${escapeXml(params.uploadId)}</UploadId>`,
    "</InitiateMultipartUploadResult>",
  ].join("\n");
}

/**
 * Generate CompleteMultipartUpload response
 */
export function generateCompleteMultipartUploadXml(params: {
  location: string;
  bucket: string;
  key: string;
  etag: string;
}): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<CompleteMultipartUploadResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">',
    `  <Location>${escapeXml(params.location)}</Location>`,
    `  <Bucket>${escapeXml(params.bucket)}</Bucket>`,
    `  <Key>${escapeXml(params.key)}</Key>`,
    `  <ETag>${escapeXml(params.etag)}</ETag>`,
    "</CompleteMultipartUploadResult>",
  ].join("\n");
}

/**
 * Generate CopyObject response
 */
export function generateCopyObjectXml(params: {
  lastModified: Date;
  etag: string;
}): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<CopyObjectResult>',
    `  <LastModified>${params.lastModified.toISOString()}</LastModified>`,
    `  <ETag>${escapeXml(params.etag)}</ETag>`,
    "</CopyObjectResult>",
  ].join("\n");
}

/**
 * Generate DeleteResult response (for DeleteObjects)
 */
export function generateDeleteResultXml(params: {
  deleted: string[];
  errors: Array<{
    key: string;
    code: S3ErrorCode;
    message: string;
  }>;
}): string {
  const parts = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<DeleteResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">',
  ];

  for (const key of params.deleted) {
    parts.push("  <Deleted>");
    parts.push(`    <Key>${escapeXml(key)}</Key>`);
    parts.push("  </Deleted>");
  }

  for (const error of params.errors) {
    parts.push("  <Error>");
    parts.push(`    <Key>${escapeXml(error.key)}</Key>`);
    parts.push(`    <Code>${error.code}</Code>`);
    parts.push(`    <Message>${escapeXml(error.message)}</Message>`);
    parts.push("  </Error>");
  }

  parts.push("</DeleteResult>");

  return parts.join("\n");
}
