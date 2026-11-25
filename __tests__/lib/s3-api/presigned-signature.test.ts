import { describe, expect, it } from 'vitest';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { parsePresignedAuthorization, verifyPresignedSignature } from '@/lib/s3-api/signature-v4';

const now = new Date('2026-11-12T15:30:00Z');
const credentials = { accessKeyId: 'B0IAEXAMPLE', secretAccessKey: 'synthetic-test-secret' };
const client = new S3Client({ region: 'auto', endpoint: 'https://s3.bucket0.com', forcePathStyle: true, credentials, requestChecksumCalculation: 'WHEN_REQUIRED' });

async function signedURL(method = 'GET') {
  const input = { Bucket: 'test-bucket', Key: 'folder/a b+é!.txt' };
  const command = method === 'PUT' ? new PutObjectCommand(input) : new GetObjectCommand({ ...input, ResponseContentDisposition: 'attachment; filename="a b!(x).txt"' });
  return new URL(await getSignedUrl(client, command, { signingDate: now, expiresIn: 60 }));
}

function verify(url: URL, method = 'GET', time = now.getTime(), headers: Record<string, string> = { host: url.host }) {
  const auth = parsePresignedAuthorization(url.search.slice(1), time);
  return auth !== null && verifyPresignedSignature(auth, { method, path: url.pathname, queryString: url.search.slice(1), headers, secretAccessKey: credentials.secretAccessKey });
}

describe('S3 query authentication', () => {
  it('verifies the published AWS signature vector', () => {
    const query = 'X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404';
    const auth = parsePresignedAuthorization(query, Date.parse('2013-05-24T01:00:00Z'));
    if (!auth) throw new Error('AWS example must parse');
    expect(verifyPresignedSignature(auth, { method: 'GET', path: '/test.txt', queryString: query, headers: { host: 'examplebucket.s3.amazonaws.com' }, secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY' })).toBe(true);
  });

  it.each(['GET', 'PUT'])('accepts real AWS SDK %s URLs, including escaped keys and query values', async method => {
    expect(verify(await signedURL(method), method)).toBe(true);
  });

  it('rejects a changed path, host, method or query parameter', async () => {
    const original = await signedURL();
    expect(verify(original, 'DELETE')).toBe(false);
    expect(verify(original, 'GET', now.getTime(), { host: 'bucket0.com' })).toBe(false);
    const path = new URL(original); path.pathname += 'changed';
    expect(verify(path)).toBe(false);
    const query = new URL(original); query.searchParams.set('response-content-disposition', 'inline');
    expect(verify(query)).toBe(false);
  });

  it('enforces expiry and the future clock-skew boundary', async () => {
    const url = await signedURL();
    expect(verify(url, 'GET', now.getTime() + 59999)).toBe(true);
    expect(verify(url, 'GET', now.getTime() + 60000)).toBe(false);
    expect(verify(url, 'GET', now.getTime() - 900001)).toBe(false);
  });

  it.each([
    ['X-Amz-Expires', '0'], ['X-Amz-Expires', '604801'], ['X-Amz-Expires', '1.5'],
    ['X-Amz-Algorithm', 'AWS4-ECDSA-P256-SHA256'], ['X-Amz-Signature', '0'.repeat(63)],
    ['X-Amz-Date', '20260230T153000Z'], ['X-Amz-SignedHeaders', ''],
    ['X-Amz-SignedHeaders', 'host;host'], ['X-Amz-Credential', 'key/20261112/auto/ec2/aws4_request'],
    ['X-Amz-Security-Token', 'unsupported-session'],
  ])('rejects malformed authentication %s=%s', async (name, value) => {
    const url = await signedURL(); url.searchParams.set(name, value);
    expect(parsePresignedAuthorization(url.search.slice(1), now.getTime())).toBeNull();
  });

  it('rejects duplicate auth parameters and missing signed headers', async () => {
    const url = await signedURL();
    url.searchParams.append('X-Amz-Expires', '120');
    expect(verify(url)).toBe(false);
    expect(verify(await signedURL(), 'GET', now.getTime(), {})).toBe(false);
  });
});
