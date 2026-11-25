import { describe, it, expect } from "vitest";
import {
  generateErrorXml,
  generateListObjectsV2Xml,
  generateListBucketsXml,
  generateInitiateMultipartUploadXml,
  generateCompleteMultipartUploadXml,
  generateCopyObjectXml,
  generateDeleteResultXml,
  s3ErrorResponse,
  S3_ERROR_STATUS,
} from "@/lib/s3-api/xml-responses";

describe("generateErrorXml", () => {
  it("generates basic error XML", () => {
    const xml = generateErrorXml("AccessDenied", "Access Denied");

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain("<Error>");
    expect(xml).toContain("<Code>AccessDenied</Code>");
    expect(xml).toContain("<Message>Access Denied</Message>");
    expect(xml).toContain("</Error>");
  });

  it("includes resource when provided", () => {
    const xml = generateErrorXml("NoSuchBucket", "Bucket not found", "/mybucket");

    expect(xml).toContain("<Resource>/mybucket</Resource>");
  });

  it("includes requestId when provided", () => {
    const xml = generateErrorXml("InternalError", "Server error", undefined, "req-123");

    expect(xml).toContain("<RequestId>req-123</RequestId>");
  });

  it("escapes XML special characters", () => {
    const xml = generateErrorXml("InvalidRequest", "Invalid <tag> & \"quotes\"");

    expect(xml).toContain("&lt;tag&gt;");
    expect(xml).toContain("&amp;");
    expect(xml).toContain("&quot;quotes&quot;");
  });

  it("includes both resource and requestId when provided", () => {
    const xml = generateErrorXml("NoSuchKey", "Not found", "/mybucket/key.txt", "req-456");

    expect(xml).toContain("<Code>NoSuchKey</Code>");
    expect(xml).toContain("<Message>Not found</Message>");
    expect(xml).toContain("<Resource>/mybucket/key.txt</Resource>");
    expect(xml).toContain("<RequestId>req-456</RequestId>");
  });

  it("handles empty message string", () => {
    const xml = generateErrorXml("InternalError", "");

    expect(xml).toContain("<Message></Message>");
    expect(xml).toContain("<Code>InternalError</Code>");
  });

  it("escapes all five XML special characters in message", () => {
    const xml = generateErrorXml("InvalidRequest", "a & b < c > d \" e ' f");

    expect(xml).toContain("a &amp; b &lt; c &gt; d &quot; e &apos; f");
  });
});

describe("generateListObjectsV2Xml", () => {
  it("generates valid ListBucketResult XML", () => {
    const xml = generateListObjectsV2Xml({
      name: "mybucket",
      prefix: "folder/",
      delimiter: "/",
      maxKeys: 1000,
      keyCount: 2,
      isTruncated: false,
      contents: [
        {
          key: "folder/file1.txt",
          lastModified: new Date("2026-03-01T10:00:00Z"),
          etag: '"abc123"',
          size: 1024,
        },
        {
          key: "folder/file2.txt",
          lastModified: new Date("2026-03-02T10:00:00Z"),
          etag: '"def456"',
          size: 2048,
        },
      ],
      commonPrefixes: ["folder/subfolder/"],
    });

    expect(xml).toContain('<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">');
    expect(xml).toContain("<Name>mybucket</Name>");
    expect(xml).toContain("<Prefix>folder/</Prefix>");
    expect(xml).toContain("<Delimiter>/</Delimiter>");
    expect(xml).toContain("<MaxKeys>1000</MaxKeys>");
    expect(xml).toContain("<KeyCount>2</KeyCount>");
    expect(xml).toContain("<IsTruncated>false</IsTruncated>");
    expect(xml).toContain("<Key>folder/file1.txt</Key>");
    expect(xml).toContain("<Size>1024</Size>");
    expect(xml).toContain("<StorageClass>STANDARD</StorageClass>");
    expect(xml).toContain("<CommonPrefixes>");
    expect(xml).toContain("<Prefix>folder/subfolder/</Prefix>");
  });

  it("handles empty prefix", () => {
    const xml = generateListObjectsV2Xml({
      name: "mybucket",
      maxKeys: 1000,
      keyCount: 0,
      isTruncated: false,
      contents: [],
    });

    expect(xml).toContain("<Prefix/>");
  });

  it("includes continuation tokens when present", () => {
    const xml = generateListObjectsV2Xml({
      name: "mybucket",
      maxKeys: 10,
      keyCount: 10,
      isTruncated: true,
      continuationToken: "token1",
      nextContinuationToken: "token2",
      contents: [],
    });

    expect(xml).toContain("<ContinuationToken>token1</ContinuationToken>");
    expect(xml).toContain("<NextContinuationToken>token2</NextContinuationToken>");
  });

  it("escapes XML special characters in keys", () => {
    const xml = generateListObjectsV2Xml({
      name: "mybucket",
      maxKeys: 1000,
      keyCount: 2,
      isTruncated: false,
      contents: [
        {
          key: "folder/file&name.txt",
          lastModified: new Date("2026-03-01T10:00:00Z"),
          etag: '"abc"',
          size: 100,
        },
        {
          key: "folder/<special>.txt",
          lastModified: new Date("2026-03-01T10:00:00Z"),
          etag: '"def"',
          size: 200,
        },
      ],
    });

    expect(xml).toContain("<Key>folder/file&amp;name.txt</Key>");
    expect(xml).toContain("<Key>folder/&lt;special&gt;.txt</Key>");
  });

  it("uses custom StorageClass when provided", () => {
    const xml = generateListObjectsV2Xml({
      name: "mybucket",
      maxKeys: 1000,
      keyCount: 1,
      isTruncated: false,
      contents: [
        {
          key: "file.txt",
          lastModified: new Date("2026-03-01T10:00:00Z"),
          etag: '"abc"',
          size: 100,
          storageClass: "GLACIER",
        },
      ],
    });

    expect(xml).toContain("<StorageClass>GLACIER</StorageClass>");
    expect(xml).not.toContain("<StorageClass>STANDARD</StorageClass>");
  });

  it("handles empty contents with non-empty commonPrefixes", () => {
    const xml = generateListObjectsV2Xml({
      name: "mybucket",
      prefix: "docs/",
      delimiter: "/",
      maxKeys: 1000,
      keyCount: 0,
      isTruncated: false,
      contents: [],
      commonPrefixes: ["docs/images/", "docs/pdfs/"],
    });

    expect(xml).not.toContain("<Contents>");
    expect(xml).toContain("<CommonPrefixes>");
    expect(xml).toContain("<Prefix>docs/images/</Prefix>");
    expect(xml).toContain("<Prefix>docs/pdfs/</Prefix>");
  });

  it("handles large keyCount and maxKeys values", () => {
    const xml = generateListObjectsV2Xml({
      name: "mybucket",
      maxKeys: 100000,
      keyCount: 99999,
      isTruncated: true,
      contents: [],
    });

    expect(xml).toContain("<MaxKeys>100000</MaxKeys>");
    expect(xml).toContain("<KeyCount>99999</KeyCount>");
    expect(xml).toContain("<IsTruncated>true</IsTruncated>");
  });
});

describe("generateListBucketsXml", () => {
  it("generates valid ListAllMyBucketsResult XML", () => {
    const xml = generateListBucketsXml({
      ownerDisplayName: "user123",
      ownerId: "user_abc123",
      buckets: [
        { name: "bucket1", creationDate: new Date("2026-01-01T00:00:00Z") },
        { name: "bucket2", creationDate: new Date("2026-02-01T00:00:00Z") },
      ],
    });

    expect(xml).toContain('<ListAllMyBucketsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">');
    expect(xml).toContain("<Owner>");
    expect(xml).toContain("<DisplayName>user123</DisplayName>");
    expect(xml).toContain("<ID>user_abc123</ID>");
    expect(xml).toContain("<Buckets>");
    expect(xml).toContain("<Bucket>");
    expect(xml).toContain("<Name>bucket1</Name>");
    expect(xml).toContain("<CreationDate>2026-01-01T00:00:00.000Z</CreationDate>");
    expect(xml).toContain("<Name>bucket2</Name>");
  });

  it("handles empty bucket list", () => {
    const xml = generateListBucketsXml({
      ownerDisplayName: "user",
      ownerId: "user_id",
      buckets: [],
    });

    expect(xml).toContain("<Buckets>");
    expect(xml).toContain("</Buckets>");
    expect(xml).not.toContain("<Bucket>");
  });

  it("escapes special characters in bucket names", () => {
    const xml = generateListBucketsXml({
      ownerDisplayName: "user & admin",
      ownerId: "user_<id>",
      buckets: [
        { name: "bucket&test", creationDate: new Date("2026-01-01T00:00:00Z") },
      ],
    });

    expect(xml).toContain("<DisplayName>user &amp; admin</DisplayName>");
    expect(xml).toContain("<ID>user_&lt;id&gt;</ID>");
    expect(xml).toContain("<Name>bucket&amp;test</Name>");
  });

  it("handles single bucket in list", () => {
    const xml = generateListBucketsXml({
      ownerDisplayName: "solo",
      ownerId: "solo_id",
      buckets: [
        { name: "only-bucket", creationDate: new Date("2026-06-15T12:00:00Z") },
      ],
    });

    expect(xml).toContain("<Bucket>");
    expect(xml).toContain("<Name>only-bucket</Name>");
    expect(xml).toContain("<CreationDate>2026-06-15T12:00:00.000Z</CreationDate>");
    // Ensure exactly one <Bucket> block
    const bucketCount = (xml.match(/<Bucket>/g) || []).length;
    expect(bucketCount).toBe(1);
  });

  it("generates correct structure for large number of buckets", () => {
    const buckets = Array.from({ length: 100 }, (_, i) => ({
      name: `bucket-${i}`,
      creationDate: new Date("2026-01-01T00:00:00Z"),
    }));

    const xml = generateListBucketsXml({
      ownerDisplayName: "user",
      ownerId: "user_id",
      buckets,
    });

    const bucketCount = (xml.match(/<Bucket>/g) || []).length;
    expect(bucketCount).toBe(100);
    expect(xml).toContain("<Name>bucket-0</Name>");
    expect(xml).toContain("<Name>bucket-99</Name>");
  });
});

describe("generateInitiateMultipartUploadXml", () => {
  it("generates valid InitiateMultipartUploadResult XML", () => {
    const xml = generateInitiateMultipartUploadXml({
      bucket: "mybucket",
      key: "large-file.zip",
      uploadId: "upload-123-abc",
    });

    expect(xml).toContain('<InitiateMultipartUploadResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">');
    expect(xml).toContain("<Bucket>mybucket</Bucket>");
    expect(xml).toContain("<Key>large-file.zip</Key>");
    expect(xml).toContain("<UploadId>upload-123-abc</UploadId>");
  });
});

describe("generateCompleteMultipartUploadXml", () => {
  it("generates valid CompleteMultipartUploadResult XML", () => {
    const xml = generateCompleteMultipartUploadXml({
      location: "https://s3.bucket0.com/mybucket/file.zip",
      bucket: "mybucket",
      key: "file.zip",
      etag: '"abc123-5"',
    });

    expect(xml).toContain('<CompleteMultipartUploadResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">');
    expect(xml).toContain("<Location>https://s3.bucket0.com/mybucket/file.zip</Location>");
    expect(xml).toContain("<Bucket>mybucket</Bucket>");
    expect(xml).toContain("<Key>file.zip</Key>");
    expect(xml).toContain("<ETag>&quot;abc123-5&quot;</ETag>");
  });
});

describe("generateCopyObjectXml", () => {
  it("generates valid CopyObjectResult XML", () => {
    const lastModified = new Date("2026-03-05T10:30:00Z");
    const xml = generateCopyObjectXml({
      lastModified,
      etag: '"copied123"',
    });

    expect(xml).toContain("<CopyObjectResult>");
    expect(xml).toContain("<LastModified>2026-03-05T10:30:00.000Z</LastModified>");
    expect(xml).toContain("<ETag>&quot;copied123&quot;</ETag>");
  });
});

describe("generateDeleteResultXml", () => {
  it("generates valid DeleteResult XML with deleted keys", () => {
    const xml = generateDeleteResultXml({
      deleted: ["file1.txt", "file2.txt"],
      errors: [],
    });

    expect(xml).toContain('<DeleteResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">');
    expect(xml).toContain("<Deleted>");
    expect(xml).toContain("<Key>file1.txt</Key>");
    expect(xml).toContain("<Key>file2.txt</Key>");
  });

  it("generates DeleteResult XML with errors", () => {
    const xml = generateDeleteResultXml({
      deleted: ["file1.txt"],
      errors: [
        { key: "file2.txt", code: "AccessDenied", message: "Access denied" },
      ],
    });

    expect(xml).toContain("<Deleted>");
    expect(xml).toContain("<Key>file1.txt</Key>");
    expect(xml).toContain("<Error>");
    expect(xml).toContain("<Key>file2.txt</Key>");
    expect(xml).toContain("<Code>AccessDenied</Code>");
    expect(xml).toContain("<Message>Access denied</Message>");
  });

  it("handles empty deleted array with errors only", () => {
    const xml = generateDeleteResultXml({
      deleted: [],
      errors: [
        { key: "locked.txt", code: "AccessDenied", message: "Cannot delete" },
      ],
    });

    expect(xml).not.toContain("<Deleted>");
    expect(xml).toContain("<Error>");
    expect(xml).toContain("<Key>locked.txt</Key>");
    expect(xml).toContain("<Code>AccessDenied</Code>");
    expect(xml).toContain("<Message>Cannot delete</Message>");
  });

  it("handles empty errors array with deleted only", () => {
    const xml = generateDeleteResultXml({
      deleted: ["file1.txt"],
      errors: [],
    });

    expect(xml).toContain("<Deleted>");
    expect(xml).toContain("<Key>file1.txt</Key>");
    expect(xml).not.toContain("<Error>");
  });

  it("handles both empty deleted and errors arrays", () => {
    const xml = generateDeleteResultXml({
      deleted: [],
      errors: [],
    });

    expect(xml).toContain('<DeleteResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">');
    expect(xml).toContain("</DeleteResult>");
    expect(xml).not.toContain("<Deleted>");
    expect(xml).not.toContain("<Error>");
  });
});

describe("s3ErrorResponse", () => {
  it("returns Response with correct status code", () => {
    const response = s3ErrorResponse("NoSuchKey", "Key not found");

    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toBe("application/xml");
    expect(response.headers.get("x-amz-request-id")).toBeTruthy();
  });

  it("uses correct status codes for different errors", () => {
    expect(s3ErrorResponse("AccessDenied", "").status).toBe(403);
    expect(s3ErrorResponse("NoSuchBucket", "").status).toBe(404);
    expect(s3ErrorResponse("BucketAlreadyExists", "").status).toBe(409);
    expect(s3ErrorResponse("BucketNotEmpty", "").status).toBe(409);
    expect(s3ErrorResponse("InvalidRequest", "").status).toBe(400);
    expect(s3ErrorResponse("InternalError", "").status).toBe(500);
  });

  it("returns valid XML string in response body", async () => {
    const response = s3ErrorResponse("NoSuchKey", "Key not found");
    const body = await response.text();

    expect(body).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(body).toContain("<Error>");
    expect(body).toContain("<Code>NoSuchKey</Code>");
    expect(body).toContain("<Message>Key not found</Message>");
    expect(body).toContain("</Error>");
  });

  it("sets x-amz-request-id when no requestId provided", () => {
    const response = s3ErrorResponse("InternalError", "Server error");

    const requestId = response.headers.get("x-amz-request-id");
    expect(requestId).toBeTruthy();
    expect(typeof requestId).toBe("string");
    expect(requestId!.length).toBeGreaterThan(0);
  });

  it("sets Content-Type header to application/xml", () => {
    const response = s3ErrorResponse("AccessDenied", "Forbidden");

    expect(response.headers.get("Content-Type")).toBe("application/xml");
  });
});

describe("S3_ERROR_STATUS mapping", () => {
  it("maps all error codes to HTTP status", () => {
    expect(S3_ERROR_STATUS.AccessDenied).toBe(403);
    expect(S3_ERROR_STATUS.BucketAlreadyExists).toBe(409);
    expect(S3_ERROR_STATUS.BucketNotEmpty).toBe(409);
    expect(S3_ERROR_STATUS.InternalError).toBe(500);
    expect(S3_ERROR_STATUS.InvalidAccessKeyId).toBe(403);
    expect(S3_ERROR_STATUS.InvalidArgument).toBe(400);
    expect(S3_ERROR_STATUS.InvalidBucketName).toBe(400);
    expect(S3_ERROR_STATUS.InvalidRequest).toBe(400);
    expect(S3_ERROR_STATUS.NoSuchBucket).toBe(404);
    expect(S3_ERROR_STATUS.NoSuchKey).toBe(404);
    expect(S3_ERROR_STATUS.SignatureDoesNotMatch).toBe(403);
    expect(S3_ERROR_STATUS.QuotaExceeded).toBe(403);
    expect(S3_ERROR_STATUS.EntityTooLarge).toBe(400);
  });
});
