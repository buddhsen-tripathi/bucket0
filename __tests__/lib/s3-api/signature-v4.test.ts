import { describe, it, expect } from "vitest";
import { createHmac, createHash } from "crypto";
import {
  parseAuthorizationHeader,
  verifySignature,
  extractHeaders,
  parseS3Path,
  parseS3Host,
} from "@/lib/s3-api/signature-v4";

describe("parseAuthorizationHeader", () => {
  it("parses valid AWS4-HMAC-SHA256 header", () => {
    const header =
      "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-date, Signature=fe5f80f77d5fa3beca038a248ff027d0445342fe2855ddc963176630326f1024";

    const result = parseAuthorizationHeader(header);

    expect(result).not.toBeNull();
    expect(result!.accessKeyId).toBe("AKIAIOSFODNN7EXAMPLE");
    expect(result!.date).toBe("20130524");
    expect(result!.region).toBe("us-east-1");
    expect(result!.service).toBe("s3");
    expect(result!.signedHeaders).toEqual(["host", "range", "x-amz-date"]);
    expect(result!.signature).toBe(
      "fe5f80f77d5fa3beca038a248ff027d0445342fe2855ddc963176630326f1024"
    );
  });

  it("returns null for non-AWS4-HMAC-SHA256 header", () => {
    expect(parseAuthorizationHeader("Basic dXNlcjpwYXNz")).toBeNull();
    expect(parseAuthorizationHeader("Bearer token123")).toBeNull();
    expect(parseAuthorizationHeader("")).toBeNull();
  });

  it("returns null for malformed credential", () => {
    // Missing parts in credential
    const header =
      "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1, SignedHeaders=host, Signature=abc";
    expect(parseAuthorizationHeader(header)).toBeNull();
  });

  it("returns null for missing signature", () => {
    const header =
      "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host";
    expect(parseAuthorizationHeader(header)).toBeNull();
  });

  it("parses Bucket0 access key format", () => {
    const header =
      "AWS4-HMAC-SHA256 Credential=B0IAEXAMPLEEXAMPLE01/20260305/auto/s3/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=abababababababababababababababababababababababababababababababab";

    const result = parseAuthorizationHeader(header);

    expect(result).not.toBeNull();
    expect(result!.accessKeyId).toBe("B0IAEXAMPLEEXAMPLE01");
    expect(result!.region).toBe("auto");
  });

  it("handles whitespace variations with extra spaces in header", () => {
    const header =
      "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request,  SignedHeaders=host;x-amz-date,  Signature=fe5f80f77d5fa3beca038a248ff027d0445342fe2855ddc963176630326f1024";

    // The parser splits on ", " so extra spaces will cause parts to have leading spaces
    // This tests the parser's tolerance (or lack thereof) for whitespace
    const result = parseAuthorizationHeader(header);

    // With extra spaces, the split on ", " will leave a leading space on subsequent parts
    // so "SignedHeaders" won't match — result should be null
    expect(result).toBeNull();
  });

  it("handles empty SignedHeaders value", () => {
    const header =
      "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=, Signature=abcd1234";

    const result = parseAuthorizationHeader(header);

    // Empty string split by ";" yields [""] — a single empty-string element
    expect(result).not.toBeNull();
    expect(result!.signedHeaders).toEqual([""]);
  });

  it("returns null for credential with extra slashes (6+ parts)", () => {
    const header =
      "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request/extra, SignedHeaders=host, Signature=abcd1234";

    const result = parseAuthorizationHeader(header);

    // Credential split yields 6 parts, but parser expects exactly 5
    expect(result).toBeNull();
  });
});

describe("verifySignature", () => {
  const secretAccessKey = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";

  // Helper to compute expected signature
  function computeSignature(
    method: string,
    path: string,
    queryString: string,
    headers: Record<string, string>,
    signedHeaders: string[],
    payloadHash: string,
    amzDate: string,
    dateStamp: string,
    region: string,
    service: string,
    secret: string
  ): string {
    // Canonical headers
    const canonicalHeaders =
      signedHeaders
        .map((h) => h.toLowerCase())
        .sort()
        .map((h) => `${h}:${(headers[h] || headers[h.toLowerCase()] || "").trim()}`)
        .join("\n") + "\n";

    const signedHeadersStr = signedHeaders
      .map((h) => h.toLowerCase())
      .sort()
      .join(";");

    // Sort query params
    const queryParams = new URLSearchParams(queryString);
    const sortedParams = Array.from(queryParams.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");

    // Canonical request
    const canonicalRequest = [
      method.toUpperCase(),
      path || "/",
      sortedParams,
      canonicalHeaders,
      signedHeadersStr,
      payloadHash,
    ].join("\n");

    const hashedCanonicalRequest = createHash("sha256")
      .update(canonicalRequest)
      .digest("hex");

    // String to sign
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      hashedCanonicalRequest,
    ].join("\n");

    // Signing key
    const kDate = createHmac("sha256", `AWS4${secret}`).update(dateStamp).digest();
    const kRegion = createHmac("sha256", kDate).update(region).digest();
    const kService = createHmac("sha256", kRegion).update(service).digest();
    const kSigning = createHmac("sha256", kService).update("aws4_request").digest();

    // Signature
    return createHmac("sha256", kSigning).update(stringToSign).digest("hex");
  }

  it("verifies valid signature for GET request", () => {
    const method = "GET";
    const path = "/";
    const queryString = "";
    const amzDate = "20260305T090000Z";
    const dateStamp = "20260305";
    const region = "auto";
    const service = "s3";
    const host = "bucket0.com";
    const payloadHash = createHash("sha256").update("").digest("hex");

    const headers: Record<string, string> = {
      host: host,
      "x-amz-date": amzDate,
      "x-amz-content-sha256": payloadHash,
    };

    const signedHeaders = ["host", "x-amz-content-sha256", "x-amz-date"];

    const signature = computeSignature(
      method,
      path,
      queryString,
      headers,
      signedHeaders,
      payloadHash,
      amzDate,
      dateStamp,
      region,
      service,
      secretAccessKey
    );

    const authComponents = {
      accessKeyId: "TESTKEY",
      signature,
      signedHeaders,
      date: dateStamp,
      region,
      service,
    };

    const result = verifySignature(authComponents, {
      method,
      path,
      queryString,
      headers,
      secretAccessKey,
    });

    expect(result).toBe(true);
  });

  it("rejects invalid signature", () => {
    const authComponents = {
      accessKeyId: "TESTKEY",
      signature: "invalidsignature1234567890abcdef1234567890abcdef1234567890abcdef",
      signedHeaders: ["host", "x-amz-date"],
      date: "20260305",
      region: "auto",
      service: "s3",
    };

    const result = verifySignature(authComponents, {
      method: "GET",
      path: "/",
      queryString: "",
      headers: {
        host: "bucket0.com",
        "x-amz-date": "20260305T090000Z",
      },
      secretAccessKey,
    });

    expect(result).toBe(false);
  });

  it("verifies signature with query parameters", () => {
    const method = "GET";
    const path = "/mybucket";
    const queryString = "list-type=2&prefix=folder/&max-keys=100";
    const amzDate = "20260305T100000Z";
    const dateStamp = "20260305";
    const region = "us-east-1";
    const service = "s3";
    const payloadHash = createHash("sha256").update("").digest("hex");

    const headers: Record<string, string> = {
      host: "s3.amazonaws.com",
      "x-amz-date": amzDate,
      "x-amz-content-sha256": payloadHash,
    };

    const signedHeaders = ["host", "x-amz-content-sha256", "x-amz-date"];

    const signature = computeSignature(
      method,
      path,
      queryString,
      headers,
      signedHeaders,
      payloadHash,
      amzDate,
      dateStamp,
      region,
      service,
      secretAccessKey
    );

    const authComponents = {
      accessKeyId: "TESTKEY",
      signature,
      signedHeaders,
      date: dateStamp,
      region,
      service,
    };

    const result = verifySignature(authComponents, {
      method,
      path,
      queryString,
      headers,
      secretAccessKey,
    });

    expect(result).toBe(true);
  });

  it("verifies signature with body (PUT request)", () => {
    const method = "PUT";
    const path = "/mybucket/mykey";
    const queryString = "";
    const amzDate = "20260305T110000Z";
    const dateStamp = "20260305";
    const region = "auto";
    const service = "s3";
    const body = Buffer.from("Hello, S3!");
    const payloadHash = createHash("sha256").update(body).digest("hex");

    const headers: Record<string, string> = {
      host: "s3.bucket0.com",
      "x-amz-date": amzDate,
      "x-amz-content-sha256": payloadHash,
      "content-type": "text/plain",
    };

    const signedHeaders = ["content-type", "host", "x-amz-content-sha256", "x-amz-date"];

    const signature = computeSignature(
      method,
      path,
      queryString,
      headers,
      signedHeaders,
      payloadHash,
      amzDate,
      dateStamp,
      region,
      service,
      secretAccessKey
    );

    const authComponents = {
      accessKeyId: "TESTKEY",
      signature,
      signedHeaders,
      date: dateStamp,
      region,
      service,
    };

    const result = verifySignature(authComponents, {
      method,
      path,
      queryString,
      headers,
      body,
      secretAccessKey,
    });

    expect(result).toBe(true);
  });

  it("handles UNSIGNED-PAYLOAD", () => {
    const method = "PUT";
    const path = "/mybucket/large-file";
    const amzDate = "20260305T120000Z";
    const dateStamp = "20260305";
    const region = "auto";
    const service = "s3";

    const headers: Record<string, string> = {
      host: "s3.bucket0.com",
      "x-amz-date": amzDate,
      "x-amz-content-sha256": "UNSIGNED-PAYLOAD",
    };

    const signedHeaders = ["host", "x-amz-content-sha256", "x-amz-date"];

    const signature = computeSignature(
      method,
      path,
      "",
      headers,
      signedHeaders,
      "UNSIGNED-PAYLOAD",
      amzDate,
      dateStamp,
      region,
      service,
      secretAccessKey
    );

    const authComponents = {
      accessKeyId: "TESTKEY",
      signature,
      signedHeaders,
      date: dateStamp,
      region,
      service,
    };

    const result = verifySignature(authComponents, {
      method,
      path,
      queryString: "",
      headers,
      body: Buffer.from("actual body content that differs"),
      secretAccessKey,
    });

    expect(result).toBe(true);
  });

  it("verifies signature for DELETE request", () => {
    const method = "DELETE";
    const path = "/mybucket/mykey";
    const queryString = "";
    const amzDate = "20260305T130000Z";
    const dateStamp = "20260305";
    const region = "auto";
    const service = "s3";
    const payloadHash = createHash("sha256").update("").digest("hex");

    const headers: Record<string, string> = {
      host: "s3.bucket0.com",
      "x-amz-date": amzDate,
      "x-amz-content-sha256": payloadHash,
    };

    const signedHeaders = ["host", "x-amz-content-sha256", "x-amz-date"];

    const signature = computeSignature(
      method,
      path,
      queryString,
      headers,
      signedHeaders,
      payloadHash,
      amzDate,
      dateStamp,
      region,
      service,
      secretAccessKey
    );

    const authComponents = {
      accessKeyId: "TESTKEY",
      signature,
      signedHeaders,
      date: dateStamp,
      region,
      service,
    };

    const result = verifySignature(authComponents, {
      method,
      path,
      queryString,
      headers,
      secretAccessKey,
    });

    expect(result).toBe(true);
  });

  it("verifies signature with path containing trailing slash", () => {
    const method = "GET";
    const path = "/mybucket/";
    const queryString = "";
    const amzDate = "20260305T140000Z";
    const dateStamp = "20260305";
    const region = "auto";
    const service = "s3";
    const payloadHash = createHash("sha256").update("").digest("hex");

    const headers: Record<string, string> = {
      host: "s3.bucket0.com",
      "x-amz-date": amzDate,
      "x-amz-content-sha256": payloadHash,
    };

    const signedHeaders = ["host", "x-amz-content-sha256", "x-amz-date"];

    const signature = computeSignature(
      method,
      path,
      queryString,
      headers,
      signedHeaders,
      payloadHash,
      amzDate,
      dateStamp,
      region,
      service,
      secretAccessKey
    );

    const authComponents = {
      accessKeyId: "TESTKEY",
      signature,
      signedHeaders,
      date: dateStamp,
      region,
      service,
    };

    const result = verifySignature(authComponents, {
      method,
      path,
      queryString,
      headers,
      secretAccessKey,
    });

    expect(result).toBe(true);
  });

  it("verifies signature with URL-encoded path characters", () => {
    const method = "GET";
    const path = "/mybucket/my%20file.txt";
    const queryString = "";
    const amzDate = "20260305T150000Z";
    const dateStamp = "20260305";
    const region = "auto";
    const service = "s3";
    const payloadHash = createHash("sha256").update("").digest("hex");

    const headers: Record<string, string> = {
      host: "s3.bucket0.com",
      "x-amz-date": amzDate,
      "x-amz-content-sha256": payloadHash,
    };

    const signedHeaders = ["host", "x-amz-content-sha256", "x-amz-date"];

    const signature = computeSignature(
      method,
      path,
      queryString,
      headers,
      signedHeaders,
      payloadHash,
      amzDate,
      dateStamp,
      region,
      service,
      secretAccessKey
    );

    const authComponents = {
      accessKeyId: "TESTKEY",
      signature,
      signedHeaders,
      date: dateStamp,
      region,
      service,
    };

    const result = verifySignature(authComponents, {
      method,
      path,
      queryString,
      headers,
      secretAccessKey,
    });

    expect(result).toBe(true);
  });

  it("computes empty hash when no body and no x-amz-content-sha256 header", () => {
    const method = "GET";
    const path = "/mybucket";
    const queryString = "";
    const amzDate = "20260305T160000Z";
    const dateStamp = "20260305";
    const region = "auto";
    const service = "s3";
    const emptyHash = createHash("sha256").update("").digest("hex");

    // Headers without x-amz-content-sha256
    const headers: Record<string, string> = {
      host: "s3.bucket0.com",
      "x-amz-date": amzDate,
    };

    const signedHeaders = ["host", "x-amz-date"];

    // Compute signature using the empty body hash (what the source should derive)
    const signature = computeSignature(
      method,
      path,
      queryString,
      headers,
      signedHeaders,
      emptyHash,
      amzDate,
      dateStamp,
      region,
      service,
      secretAccessKey
    );

    const authComponents = {
      accessKeyId: "TESTKEY",
      signature,
      signedHeaders,
      date: dateStamp,
      region,
      service,
    };

    const result = verifySignature(authComponents, {
      method,
      path,
      queryString,
      headers,
      secretAccessKey,
    });

    expect(result).toBe(true);
  });

  it("returns false for malformed signature hex string without throwing", () => {
    const authComponents = {
      accessKeyId: "TESTKEY",
      signature: "zzzz_not_hex!@#$%^&*()_not_valid_hex_string_at_all_padding!!",
      signedHeaders: ["host", "x-amz-date"],
      date: "20260305",
      region: "auto",
      service: "s3",
    };

    const result = verifySignature(authComponents, {
      method: "GET",
      path: "/",
      queryString: "",
      headers: {
        host: "bucket0.com",
        "x-amz-date": "20260305T090000Z",
      },
      secretAccessKey,
    });

    expect(result).toBe(false);
  });

  it("verifies signature when signedHeaders order does not match", () => {
    const method = "GET";
    const path = "/mybucket/file.txt";
    const queryString = "";
    const amzDate = "20260305T170000Z";
    const dateStamp = "20260305";
    const region = "auto";
    const service = "s3";
    const payloadHash = createHash("sha256").update("").digest("hex");

    const headers: Record<string, string> = {
      host: "s3.bucket0.com",
      "x-amz-date": amzDate,
      "x-amz-content-sha256": payloadHash,
    };

    // Compute signature with sorted headers (canonical order)
    const sortedSignedHeaders = ["host", "x-amz-content-sha256", "x-amz-date"];

    const signature = computeSignature(
      method,
      path,
      queryString,
      headers,
      sortedSignedHeaders,
      payloadHash,
      amzDate,
      dateStamp,
      region,
      service,
      secretAccessKey
    );

    // Pass signedHeaders in reverse (non-canonical) order
    const unsortedSignedHeaders = ["x-amz-date", "x-amz-content-sha256", "host"];

    const authComponents = {
      accessKeyId: "TESTKEY",
      signature,
      signedHeaders: unsortedSignedHeaders,
      date: dateStamp,
      region,
      service,
    };

    const result = verifySignature(authComponents, {
      method,
      path,
      queryString,
      headers,
      secretAccessKey,
    });

    // The verifier sorts signedHeaders internally, so order shouldn't matter
    expect(result).toBe(true);
  });
});

describe("extractHeaders", () => {
  it("extracts headers and lowercases keys", () => {
    const headers = new Headers();
    headers.set("Content-Type", "application/json");
    headers.set("X-Amz-Date", "20260305T090000Z");
    headers.set("HOST", "bucket0.com");

    const result = extractHeaders(headers);

    expect(result["content-type"]).toBe("application/json");
    expect(result["x-amz-date"]).toBe("20260305T090000Z");
    expect(result["host"]).toBe("bucket0.com");
  });

  it("returns empty object for empty headers", () => {
    const headers = new Headers();
    const result = extractHeaders(headers);
    expect(result).toEqual({});
  });

  it("handles headers with multiple values for same key", () => {
    const headers = new Headers();
    headers.set("X-Custom", "value1");
    headers.append("X-Custom", "value2");

    const result = extractHeaders(headers);

    // The Headers API combines multiple values with ", "
    expect(result["x-custom"]).toBe("value1, value2");
  });
});

describe("parseS3Path", () => {
  it("parses bucket only", () => {
    const result = parseS3Path("/mybucket");
    expect(result).toEqual({ bucket: "mybucket", key: "" });
  });

  it("parses bucket with key", () => {
    const result = parseS3Path("/mybucket/folder/file.txt");
    expect(result).toEqual({ bucket: "mybucket", key: "folder/file.txt" });
  });

  it("parses bucket with simple key", () => {
    const result = parseS3Path("/mybucket/file.txt");
    expect(result).toEqual({ bucket: "mybucket", key: "file.txt" });
  });

  it("returns null for root path", () => {
    const result = parseS3Path("/");
    expect(result).toBeNull();
  });

  it("returns null for empty path", () => {
    const result = parseS3Path("");
    expect(result).toBeNull();
  });

  it("parses path with trailing slash", () => {
    const result = parseS3Path("/mybucket/");
    expect(result).toEqual({ bucket: "mybucket", key: "" });
  });

  it("parses deeply nested key", () => {
    const result = parseS3Path("/mybucket/a/b/c/d/file.txt");
    expect(result).toEqual({ bucket: "mybucket", key: "a/b/c/d/file.txt" });
  });

  it("parses key with special characters", () => {
    const result = parseS3Path("/mybucket/file with spaces.txt");
    expect(result).toEqual({ bucket: "mybucket", key: "file with spaces.txt" });
  });

  it("returns null for path with only slashes", () => {
    const result = parseS3Path("///");
    // "///" matches /([^/]+)(?:\/(.*))?$/ — first capture is empty between slashes
    // The regex requires at least one non-slash char for the bucket, so this returns null
    expect(result).toBeNull();
  });
});

describe("parseS3Host", () => {
  it("extracts bucket from virtual-hosted style", () => {
    const result = parseS3Host("mybucket.s3.bucket0.com", "s3.bucket0.com");
    expect(result).toBe("mybucket");
  });

  it("returns null for non-matching domain", () => {
    const result = parseS3Host("mybucket.other.com", "s3.bucket0.com");
    expect(result).toBeNull();
  });

  it("returns null for base domain itself", () => {
    const result = parseS3Host("s3.bucket0.com", "s3.bucket0.com");
    expect(result).toBeNull();
  });

  it("returns null for empty string host", () => {
    const result = parseS3Host("", "s3.bucket0.com");
    expect(result).toBeNull();
  });

  it("handles host with port", () => {
    const result = parseS3Host("mybucket.s3.bucket0.com:443", "s3.bucket0.com");
    // The port is part of the string, so ".s3.bucket0.com" won't match at the end
    expect(result).toBeNull();
  });

  it("extracts nested subdomain from virtual-hosted style", () => {
    const result = parseS3Host("deep.sub.s3.bucket0.com", "s3.bucket0.com");
    // Everything before ".s3.bucket0.com" is the bucket name
    expect(result).toBe("deep.sub");
  });
});
