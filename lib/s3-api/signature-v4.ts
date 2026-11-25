/**
 * AWS Signature Version 4 verification for S3 API requests
 *
 * This module verifies incoming S3 API requests that use AWS Sig v4 authentication.
 * It extracts credentials from the Authorization header and verifies the signature.
 */

import { createHmac, createHash, timingSafeEqual } from 'crypto';

export interface SignatureV4Components {
  accessKeyId: string;
  signature: string;
  signedHeaders: string[];
  date: string;
  region: string;
  service: string;
}

export interface VerifySignatureParams {
  method: string;
  path: string;
  queryString: string;
  headers: Record<string, string>;
  body?: Buffer | string;
  secretAccessKey: string;
}

export interface PresignedAuthorization extends SignatureV4Components {
  amzDateTime: string;
}

/** Parse query authentication before credential lookup, including its validity window. */
export function parsePresignedAuthorization(queryString: string, now = Date.now()): PresignedAuthorization | null {
  const query = new URLSearchParams(queryString);
  for (const name of ['X-Amz-Algorithm', 'X-Amz-Credential', 'X-Amz-Date', 'X-Amz-Expires', 'X-Amz-SignedHeaders', 'X-Amz-Signature']) {
    if (query.getAll(name).length !== 1) return null;
  }
  // Bucket0 issues long-lived keys, not STS session credentials.
  if (query.has('X-Amz-Security-Token') || query.get('X-Amz-Algorithm') !== 'AWS4-HMAC-SHA256') return null;
  const [accessKeyId, date, region, service, terminator, extra] = (query.get('X-Amz-Credential') || '').split('/');
  const amzDateTime = query.get('X-Amz-Date') || '';
  const expires = query.get('X-Amz-Expires') || '';
  const signature = query.get('X-Amz-Signature') || '';
  const signedHeaders = (query.get('X-Amz-SignedHeaders') || '').split(';');
  if (!accessKeyId || !region || service !== 's3' || terminator !== 'aws4_request' || extra !== undefined ||
      !/^\d{8}T\d{6}Z$/.test(amzDateTime) || date !== amzDateTime.slice(0, 8) ||
      !/^[0-9a-f]{64}$/.test(signature) || !/^[1-9]\d{0,5}$/.test(expires) || Number(expires) > 604800 ||
      !signedHeaders.includes('host') || signedHeaders.some(h => !/^[a-z0-9-]+$/.test(h)) ||
      [...new Set(signedHeaders)].sort().join(';') !== signedHeaders.join(';')) return null;
  const timestamp = Date.parse(`${amzDateTime.slice(0, 4)}-${amzDateTime.slice(4, 6)}-${amzDateTime.slice(6, 8)}T${amzDateTime.slice(9, 11)}:${amzDateTime.slice(11, 13)}:${amzDateTime.slice(13, 15)}Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().replace(/[-:]|\.\d{3}/g, '') !== amzDateTime ||
      timestamp > now + 15 * 60 * 1000 || now >= timestamp + Number(expires) * 1000) return null;
  return { accessKeyId, date, region, service, signature, signedHeaders, amzDateTime };
}

/** Query signatures use UNSIGNED-PAYLOAD and exclude only X-Amz-Signature. */
export function verifyPresignedSignature(auth: PresignedAuthorization, params: VerifySignatureParams): boolean {
  if (auth.signedHeaders.some(h => !params.headers[h])) return false;
  const query = new URLSearchParams(params.queryString);
  query.delete('X-Amz-Signature');
  const canonical = createCanonicalRequest(params.method, params.path, query.toString(), params.headers, auth.signedHeaders, 'UNSIGNED-PAYLOAD');
  const toSign = createStringToSign(auth.amzDateTime, auth.date, auth.region, auth.service, canonical);
  const expected = calculateSignature(toSign, getSigningKey(params.secretAccessKey, auth.date, auth.region, auth.service));
  try {
    return timingSafeEqual(Buffer.from(auth.signature, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Parse AWS Signature v4 Authorization header
 *
 * Format: AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request,
 *         SignedHeaders=host;range;x-amz-date,
 *         Signature=fe5f80f77d5fa3beca038a248ff027d0445342fe2855ddc963176630326f1024
 */
export function parseAuthorizationHeader(authHeader: string): SignatureV4Components | null {
  if (!authHeader || !authHeader.startsWith('AWS4-HMAC-SHA256 ')) {
    return null;
  }

  const parts = authHeader.substring('AWS4-HMAC-SHA256 '.length).split(', ');
  const components: Partial<SignatureV4Components> = {};

  for (const part of parts) {
    const [key, value] = part.split('=', 2);

    if (key === 'Credential') {
      // Format: accessKeyId/date/region/service/aws4_request
      const credParts = value.split('/');
      if (credParts.length !== 5) return null;

      components.accessKeyId = credParts[0];
      components.date = credParts[1];
      components.region = credParts[2];
      components.service = credParts[3];
      // credParts[4] is always 'aws4_request'
    } else if (key === 'SignedHeaders') {
      components.signedHeaders = value.split(';');
    } else if (key === 'Signature') {
      components.signature = value;
    }
  }

  // Validate all required components are present
  if (!components.accessKeyId || !components.signature || !components.signedHeaders ||
      !components.date || !components.region || !components.service) {
    return null;
  }

  return components as SignatureV4Components;
}

/**
 * Create canonical request string per AWS Sig v4 spec
 */
function createCanonicalRequest(
  method: string,
  path: string,
  queryString: string,
  headers: Record<string, string>,
  signedHeaders: string[],
  hashedPayload: string
): string {
  // Canonical URI - must be URL encoded
  const canonicalUri = path || '/';

  // SigV4 sorts encoded names and values by ASCII byte order (not locale order).
  const encode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  const queryParams = new URLSearchParams(queryString);
  const sortedParams = Array.from(queryParams.entries())
    .map(([k, v]) => [encode(k), encode(v)])
    .sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0)
    .map(([k, v]) => `${k}=${v}`)
    .join('&');

  // Canonical headers - sorted, lowercased, trimmed values
  const canonicalHeaders = signedHeaders
    .map(h => h.toLowerCase())
    .sort()
    .map(h => `${h}:${(headers[h] || headers[h.toLowerCase()] || '').trim().replace(/\s+/g, ' ')}`)
    .join('\n') + '\n';

  // Signed headers list
  const signedHeadersStr = signedHeaders.map(h => h.toLowerCase()).sort().join(';');

  return [
    method.toUpperCase(),
    canonicalUri,
    sortedParams,
    canonicalHeaders,
    signedHeadersStr,
    hashedPayload
  ].join('\n');
}

/**
 * Create string to sign per AWS Sig v4 spec
 *
 * @param amzDateTime - Full x-amz-date timestamp (YYYYMMDDTHHMMSSZ)
 * @param dateStamp - Date portion only (YYYYMMDD) for credential scope
 */
function createStringToSign(
  amzDateTime: string,
  dateStamp: string,
  region: string,
  service: string,
  canonicalRequest: string
): string {
  // Credential scope uses only the date (YYYYMMDD), not the full timestamp
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const hashedCanonicalRequest = createHash('sha256').update(canonicalRequest).digest('hex');

  return [
    'AWS4-HMAC-SHA256',
    amzDateTime, // Full timestamp: YYYYMMDDTHHMMSSZ
    credentialScope,
    hashedCanonicalRequest
  ].join('\n');
}

/**
 * Derive signing key per AWS Sig v4 spec
 */
function getSigningKey(
  secretAccessKey: string,
  date: string,
  region: string,
  service: string
): Buffer {
  const kDate = createHmac('sha256', `AWS4${secretAccessKey}`).update(date).digest();
  const kRegion = createHmac('sha256', kDate).update(region).digest();
  const kService = createHmac('sha256', kRegion).update(service).digest();
  const kSigning = createHmac('sha256', kService).update('aws4_request').digest();
  return kSigning;
}

/**
 * Calculate the expected signature
 */
function calculateSignature(
  stringToSign: string,
  signingKey: Buffer
): string {
  return createHmac('sha256', signingKey).update(stringToSign).digest('hex');
}

/**
 * Verify AWS Signature v4
 * Returns true if signature is valid, false otherwise
 */
export function verifySignature(
  authComponents: SignatureV4Components,
  params: VerifySignatureParams
): boolean {
  // Get the x-amz-content-sha256 header (AWS CLI/SDKs always send this for S3)
  const amzContentSha256 = params.headers['x-amz-content-sha256'];

  // Determine payload hash for signature verification
  // AWS S3 clients send x-amz-content-sha256 header which takes precedence:
  // - "UNSIGNED-PAYLOAD" for streaming uploads or when body not included in signature
  // - "STREAMING-AWS4-HMAC-SHA256-PAYLOAD" for chunked uploads
  // - Actual SHA256 hex hash of the body for signed payloads
  let payloadHash: string;

  if (amzContentSha256) {
    // Use the header value as the payload hash (client specifies how they signed)
    payloadHash = amzContentSha256;
  } else if (params.body && params.body.length > 0) {
    // No header but body provided - compute hash
    payloadHash = createHash('sha256').update(params.body).digest('hex');
  } else {
    // No header and no body - use empty string hash
    payloadHash = createHash('sha256').update('').digest('hex');
  }

  // Build canonical request
  const canonicalRequest = createCanonicalRequest(
    params.method,
    params.path,
    params.queryString,
    params.headers,
    authComponents.signedHeaders,
    payloadHash
  );

  // Get the x-amz-date header for the string to sign (full timestamp YYYYMMDDTHHMMSSZ)
  const amzDateTime = params.headers['x-amz-date'] || params.headers['X-Amz-Date'] || '';

  // Date stamp from credential scope (YYYYMMDD format)
  const dateStamp = authComponents.date;

  // Build string to sign
  const stringToSign = createStringToSign(
    amzDateTime,
    dateStamp,
    authComponents.region,
    authComponents.service,
    canonicalRequest
  );

  // Derive signing key (uses date portion only, YYYYMMDD)
  const signingKey = getSigningKey(
    params.secretAccessKey,
    dateStamp,
    authComponents.region,
    authComponents.service
  );

  // Calculate expected signature
  const expectedSignature = calculateSignature(stringToSign, signingKey);

  // Timing-safe comparison
  try {
    const sigBuffer = Buffer.from(authComponents.signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    return timingSafeEqual(sigBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

/**
 * Freshness and payload binding for header-signed requests, checked after verifySignature.
 * Returns the S3 error code to reject with, or null when the request is acceptable.
 */
export function checkHeaderRequest(
  authComponents: SignatureV4Components,
  params: VerifySignatureParams,
  now = Date.now()
): 'AccessDenied' | 'RequestTimeTooSkewed' | 'XAmzContentSHA256Mismatch' | null {
  const amzDateTime = params.headers['x-amz-date'] || '';
  if (!/^\d{8}T\d{6}Z$/.test(amzDateTime) || amzDateTime.slice(0, 8) !== authComponents.date ||
      !authComponents.signedHeaders.includes('x-amz-date')) return 'AccessDenied';
  const timestamp = Date.parse(`${amzDateTime.slice(0, 4)}-${amzDateTime.slice(4, 6)}-${amzDateTime.slice(6, 8)}T${amzDateTime.slice(9, 11)}:${amzDateTime.slice(11, 13)}:${amzDateTime.slice(13, 15)}Z`);
  if (!Number.isFinite(timestamp)) return 'AccessDenied';
  if (Math.abs(now - timestamp) > 15 * 60 * 1000) return 'RequestTimeTooSkewed';

  // UNSIGNED-PAYLOAD and STREAMING-* sentinels are not body hashes; a declared hex digest must match the body.
  const amzContentSha256 = params.headers['x-amz-content-sha256'];
  if (amzContentSha256 && /^[0-9a-f]{64}$/i.test(amzContentSha256) &&
      amzContentSha256.toLowerCase() !== createHash('sha256').update(params.body ?? '').digest('hex')) {
    return 'XAmzContentSHA256Mismatch';
  }
  return null;
}

/**
 * Extract headers from Request object into a simple Record
 */
export function extractHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key.toLowerCase()] = value;
  });
  return result;
}

/**
 * Parse S3 path-style URL
 * Returns bucket name and object key
 */
export function parseS3Path(path: string): { bucket: string; key: string } | null {
  // Path format: /{bucket}/{key} or /{bucket}
  const match = path.match(/^\/([^\/]+)(?:\/(.*))?$/);
  if (!match) return null;

  return {
    bucket: match[1],
    key: match[2] || ''
  };
}

/**
 * Parse S3 virtual-hosted-style URL
 * Returns bucket name from host header
 */
export function parseS3Host(host: string, baseDomain: string): string | null {
  // Host format: {bucket}.{baseDomain}
  if (!host.endsWith(`.${baseDomain}`)) return null;
  return host.slice(0, -(baseDomain.length + 1));
}
