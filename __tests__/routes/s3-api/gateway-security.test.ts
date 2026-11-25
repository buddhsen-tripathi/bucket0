import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash, createHmac } from 'crypto';
import { Readable } from 'stream';
import { SignatureV4 } from '@smithy/signature-v4';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GET, HEAD, PUT, DELETE } from '@/server/routes/api/s3-api/[[...path]]/route';
import { GET as dashboardDownload } from '@/server/routes/api/s3-api/files/download/route';
import { NextRequest } from '@/server/compat/next-server';
import { checkHeaderRequest } from '@/lib/s3-api/signature-v4';
import { S3ApiStorageService } from '@/lib/s3-api/storage-service';
import { USER_CONTENT_SANDBOX_CSP } from '@/lib/shared/user-content';

const credentials = { accessKeyId: 'B0IAEXAMPLE', secretAccessKey: 'synthetic-test-secret' };
const mocks = vi.hoisted(() => ({
  credential: vi.fn(), valid: vi.fn(), used: vi.fn(), bucket: vi.fn(),
  getObject: vi.fn(), headObject: vi.fn(), putObject: vi.fn(), deleteObject: vi.fn(), size: vi.fn(),
  check: vi.fn(), reserve: vi.fn(), release: vi.fn(), stats: vi.fn(), auth: vi.fn(),
  acquireLease: vi.fn(), releaseLease: vi.fn(),
}));
vi.mock('@/lib/s3-api', async () => ({
  ...await import('@/lib/s3-api/signature-v4'),
  ...await import('@/lib/s3-api/xml-responses'),
  s3ApiCredentialService: { getCredentialByAccessKey: mocks.credential, isCredentialValid: mocks.valid, updateLastUsed: mocks.used },
  s3ApiBucketService: { getOrCreateBucket: mocks.bucket, bucketExists: mocks.bucket, getBucket: mocks.bucket },
  s3ApiStorageService: {
    getObject: mocks.getObject, headObject: mocks.headObject, putObject: mocks.putObject,
    deleteObject: mocks.deleteObject, getObjectSize: mocks.size,
  },
  s3ApiQuotaService: { checkUploadAllowed: mocks.check, reserveQuota: mocks.reserve, releaseQuota: mocks.release, updateBucketStats: mocks.stats },
  acquireObjectLease: mocks.acquireLease,
  releaseObjectLease: mocks.releaseLease,
}));
vi.mock('@/server/compat/clerk', () => ({ auth: mocks.auth }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.credential.mockResolvedValue({ id: 'key1', userId: 'owner1', secretAccessKey: credentials.secretAccessKey, isActive: true });
  mocks.valid.mockReturnValue({ valid: true });
  mocks.bucket.mockResolvedValue({ bucketName: 'bkt' });
  mocks.size.mockResolvedValue(0);
  mocks.check.mockResolvedValue({ allowed: true });
  mocks.reserve.mockResolvedValue({ success: true });
  mocks.putObject.mockResolvedValue({ etag: '"etag"', size: 4 });
  mocks.auth.mockResolvedValue({ userId: 'owner1' });
  mocks.acquireLease.mockResolvedValue('lease-token');
  mocks.releaseLease.mockResolvedValue(undefined);
});

class Sha256 {
  private hash;
  constructor(secret?: string | ArrayBuffer | ArrayBufferView) {
    this.hash = secret ? createHmac('sha256', toBuffer(secret)) : createHash('sha256');
  }
  update(data: string | ArrayBuffer | ArrayBufferView) { this.hash.update(toBuffer(data)); }
  async digest() { return new Uint8Array(this.hash.digest()); }
  reset() {}
}
function toBuffer(data: string | ArrayBuffer | ArrayBufferView) {
  if (typeof data === 'string') return Buffer.from(data);
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  return Buffer.from(data);
}
const sha256Hex = (body: string) => createHash('sha256').update(body).digest('hex');

/** Header-signed request through bucket0.com/api/s3-api, as an SDK would send it. */
async function headerSigned(method: string, key: string, body: string, signingDate = new Date(), contentSha256 = sha256Hex(body)) {
  const signer = new SignatureV4({ credentials, region: 'auto', service: 's3', sha256: Sha256, uriEscapePath: false, applyChecksum: false });
  const signed = await signer.sign({
    method, protocol: 'https:', hostname: 'bucket0.com', path: `/api/s3-api/bkt/${key}`, query: {},
    headers: { host: 'bucket0.com', 'x-amz-content-sha256': contentSha256 }, body,
  }, { signingDate });
  return { url: `https://bucket0.com/api/s3-api/bkt/${key}`, headers: signed.headers as Record<string, string> };
}
const params = (...path: string[]) => ({ params: Promise.resolve({ path }) });

describe('header-signed request freshness and payload binding', () => {
  it('accepts a fresh header-signed PutObject whose body matches the declared hash', async () => {
    const { url, headers } = await headerSigned('PUT', 'a.txt', 'good');
    const response = await PUT(new NextRequest(new Request(url, { method: 'PUT', headers, body: 'good' })), params('bkt', 'a.txt'));
    expect(response.status).toBe(200);
    expect(mocks.putObject).toHaveBeenCalledWith('owner1', 'bkt', 'a.txt', Buffer.from('good'), expect.any(String), 4);
  });

  it('rejects a captured PutObject replayed with a substituted body', async () => {
    const { url, headers } = await headerSigned('PUT', 'a.txt', 'good');
    const response = await PUT(new NextRequest(new Request(url, { method: 'PUT', headers, body: 'evil' })), params('bkt', 'a.txt'));
    expect(response.status).toBe(400);
    expect(await response.text()).toContain('<Code>XAmzContentSHA256Mismatch</Code>');
    expect(mocks.putObject).not.toHaveBeenCalled();
    expect(mocks.reserve).not.toHaveBeenCalled();
  });

  it('rejects a header-signed request replayed more than 15 minutes later', async () => {
    const { url, headers } = await headerSigned('PUT', 'a.txt', 'good', new Date(Date.now() - 60 * 60 * 1000));
    const response = await PUT(new NextRequest(new Request(url, { method: 'PUT', headers, body: 'good' })), params('bkt', 'a.txt'));
    expect(response.status).toBe(403);
    expect(await response.text()).toContain('<Code>RequestTimeTooSkewed</Code>');
    expect(mocks.putObject).not.toHaveBeenCalled();
    expect(mocks.used).not.toHaveBeenCalled();
  });

  it('checkHeaderRequest enforces date format, scope date, signed x-amz-date, skew and payload hash', () => {
    const now = Date.parse('2026-11-16T12:00:00Z');
    const auth = { accessKeyId: 'k', signature: 's', signedHeaders: ['host', 'x-amz-content-sha256', 'x-amz-date'], date: '20261116', region: 'auto', service: 's3' };
    const base = { method: 'PUT', path: '/', queryString: '', secretAccessKey: 'x', body: Buffer.from('good') };
    const headers = (date: string, sha = sha256Hex('good')) => ({ host: 'h', 'x-amz-date': date, 'x-amz-content-sha256': sha });
    expect(checkHeaderRequest(auth, { ...base, headers: headers('20261116T120500Z') }, now)).toBeNull();
    expect(checkHeaderRequest(auth, { ...base, headers: headers('20261116T113000Z') }, now)).toBe('RequestTimeTooSkewed');
    expect(checkHeaderRequest(auth, { ...base, headers: headers('20261116T124600Z') }, now)).toBe('RequestTimeTooSkewed');
    expect(checkHeaderRequest(auth, { ...base, headers: { host: 'h' } }, now)).toBe('AccessDenied');
    expect(checkHeaderRequest({ ...auth, date: '20261115' }, { ...base, headers: headers('20261116T120000Z') }, now)).toBe('AccessDenied');
    expect(checkHeaderRequest({ ...auth, signedHeaders: ['host'] }, { ...base, headers: headers('20261116T120000Z') }, now)).toBe('AccessDenied');
    expect(checkHeaderRequest(auth, { ...base, headers: headers('20261116T120000Z', sha256Hex('evil')) }, now)).toBe('XAmzContentSHA256Mismatch');
    expect(checkHeaderRequest(auth, { ...base, headers: headers('20261116T120000Z', 'UNSIGNED-PAYLOAD') }, now)).toBeNull();
    expect(checkHeaderRequest(auth, { ...base, headers: headers('20261116T120000Z', 'STREAMING-AWS4-HMAC-SHA256-PAYLOAD') }, now)).toBeNull();
    expect(checkHeaderRequest(auth, { ...base, body: undefined, headers: headers('20261116T120000Z', sha256Hex('')) }, now)).toBeNull();
  });
});

describe('GetObject/HeadObject serve active content under a sandbox CSP', () => {
  const object = (contentType: string) => ({
    body: Readable.from([Buffer.from('<script>alert(1)</script>')]), contentLength: 25, contentType,
    etag: '"e"', lastModified: new Date(0),
  });
  async function presignedGet() {
    const client = new S3Client({ region: 'auto', endpoint: 'https://bucket0.com/api/s3-api', forcePathStyle: true, credentials });
    return getSignedUrl(client, new GetObjectCommand({ Bucket: 'bkt', Key: 'x.html' }), { expiresIn: 60 });
  }

  it('serves caller-chosen text/html from GetObject under a sandbox CSP', async () => {
    mocks.getObject.mockResolvedValue(object('text/html'));
    const response = await GET(new NextRequest(new Request(await presignedGet())), params('bkt', 'x.html'));
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Security-Policy')).toBe(USER_CONTENT_SANDBOX_CSP);
    expect(response.headers.get('Content-Disposition')).toBeNull();
  });

  it('keeps passive previews (image/png) without a sandbox CSP', async () => {
    mocks.getObject.mockResolvedValue(object('image/png'));
    const response = await GET(new NextRequest(new Request(await presignedGet())), params('bkt', 'x.html'));
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Security-Policy')).toBeNull();
  });

  it('sends the sandbox CSP on HeadObject for active content types', async () => {
    mocks.headObject.mockResolvedValue({ ...object('image/svg+xml'), body: undefined });
    const client = new S3Client({ region: 'auto', endpoint: 'https://bucket0.com/api/s3-api', forcePathStyle: true, credentials });
    const { HeadObjectCommand } = await import('@aws-sdk/client-s3');
    const url = await getSignedUrl(client, new HeadObjectCommand({ Bucket: 'bkt', Key: 'x.html' }), { expiresIn: 60 });
    const response = await HEAD(new NextRequest(new Request(url, { method: 'HEAD' })), params('bkt', 'x.html'));
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Security-Policy')).toBe(USER_CONTENT_SANDBOX_CSP);
  });

  it('sends the sandbox CSP from the dashboard inline download route', async () => {
    mocks.getObject.mockResolvedValue(object('text/html'));
    const response = await dashboardDownload(new NextRequest(new Request('https://bucket0.com/api/s3-api/files/download?bucket=bkt&key=x.html&inline=true')));
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Disposition')).toBe('inline');
    expect(response.headers.get('Content-Security-Policy')).toBe(USER_CONTENT_SANDBOX_CSP);
  });
});

describe('dot segments in bucket and key paths', () => {
  it('rejects PutObject whose decoded key contains ../ before touching storage', async () => {
    const response = await PUT(new NextRequest(new Request('https://bucket0.com/api/s3-api/bkt/x', { method: 'PUT', body: 'x' })), params('bkt', '../../userB/bkt/x'));
    expect(response.status).toBe(400);
    expect(await response.text()).toContain('<Code>InvalidArgument</Code>');
    expect(mocks.putObject).not.toHaveBeenCalled();
  });

  it('rejects authenticated GetObject/HeadObject/DeleteObject with dot segments in bucket or key', async () => {
    const client = new S3Client({ region: 'auto', endpoint: 'https://bucket0.com/api/s3-api', forcePathStyle: true, credentials });
    const url = await getSignedUrl(client, new GetObjectCommand({ Bucket: 'bkt', Key: 'x' }), { expiresIn: 60 });
    expect((await GET(new NextRequest(new Request(url)), params('bkt', '../../userB/bkt/x'))).status).toBe(400);
    expect((await GET(new NextRequest(new Request(url)), params('..', 'x'))).status).toBe(400);
    expect((await GET(new NextRequest(new Request(url)), params('bkt', 'a/./b'))).status).toBe(400);
    const head = await headerSigned('HEAD', 'x', '');
    expect((await HEAD(new NextRequest(new Request(head.url, { method: 'HEAD', headers: head.headers })), params('bkt', '..'))).status).toBe(400);
    const del = await headerSigned('DELETE', 'x', '');
    expect((await DELETE(new NextRequest(new Request(del.url, { method: 'DELETE', headers: del.headers })), params('bkt', '../x'))).status).toBe(400);
    expect(mocks.getObject).not.toHaveBeenCalled();
    expect(mocks.headObject).not.toHaveBeenCalled();
    expect(mocks.deleteObject).not.toHaveBeenCalled();
  });

  it('still allows keys that merely contain dots', async () => {
    mocks.getObject.mockResolvedValue({ body: Readable.from([]), contentLength: 0, contentType: 'text/plain', etag: '"e"', lastModified: new Date(0) });
    const client = new S3Client({ region: 'auto', endpoint: 'https://bucket0.com/api/s3-api', forcePathStyle: true, credentials });
    const url = await getSignedUrl(client, new GetObjectCommand({ Bucket: 'bkt', Key: 'x' }), { expiresIn: 60 });
    expect((await GET(new NextRequest(new Request(url)), params('bkt', '.hidden', 'a..b.txt'))).status).toBe(200);
    expect(mocks.getObject).toHaveBeenCalledWith('owner1', 'bkt', '.hidden/a..b.txt', undefined);
  });

  it('storage service refuses to build a tenant key containing dot segments', async () => {
    vi.stubEnv('R2_ACCOUNT_ID', 'acct');
    vi.stubEnv('R2_ACCESS_KEY_ID', 'id');
    vi.stubEnv('R2_SECRET_ACCESS_KEY', 'secret');
    vi.stubEnv('R2_BUCKET_NAME', 'bucket');
    const storage = new S3ApiStorageService();
    await expect(storage.getObject('userA', 'bkt', '../../userB/bkt/x')).rejects.toThrow('Invalid object key');
    await expect(storage.putObject('userA', '..', 'x', Buffer.from('x'), 'text/plain')).rejects.toThrow('Invalid object key');
    vi.unstubAllEnvs();
  });
});

describe('DeleteObject quota accounting', () => {
  it('does not credit quota when the R2 delete fails', async () => {
    mocks.size.mockResolvedValue(100);
    mocks.deleteObject.mockResolvedValue(false);
    const { url, headers } = await headerSigned('DELETE', 'a.txt', '');
    const response = await DELETE(new NextRequest(new Request(url, { method: 'DELETE', headers })), params('bkt', 'a.txt'));
    expect(response.status).toBe(500);
    expect(mocks.release).not.toHaveBeenCalled();
    expect(mocks.stats).not.toHaveBeenCalled();
    expect(mocks.releaseLease).toHaveBeenCalledWith('owner1', 'bkt', 'a.txt', 'lease-token');
  });
});

describe('per-object leases for PutObject/DeleteObject', () => {
  it('rejects a DeleteObject while another change to the same key holds the lease', async () => {
    mocks.acquireLease.mockResolvedValue(null);
    const { url, headers } = await headerSigned('DELETE', 'a.txt', '');
    const response = await DELETE(new NextRequest(new Request(url, { method: 'DELETE', headers })), params('bkt', 'a.txt'));
    expect(response.status).toBe(409);
    expect(await response.text()).toContain('<Code>OperationAborted</Code>');
    expect(mocks.size).not.toHaveBeenCalled();
    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it('rejects a PutObject while another change to the same key holds the lease', async () => {
    mocks.acquireLease.mockResolvedValue(null);
    const { url, headers } = await headerSigned('PUT', 'a.txt', 'data');
    const response = await PUT(new NextRequest(new Request(url, { method: 'PUT', headers, body: 'data' })), params('bkt', 'a.txt'));
    expect(response.status).toBe(409);
    expect(mocks.size).not.toHaveBeenCalled();
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.putObject).not.toHaveBeenCalled();
  });

  it('releases the lease after a successful DeleteObject and credits quota once', async () => {
    mocks.size.mockResolvedValue(100);
    mocks.deleteObject.mockResolvedValue(true);
    const { url, headers } = await headerSigned('DELETE', 'a.txt', '');
    const response = await DELETE(new NextRequest(new Request(url, { method: 'DELETE', headers })), params('bkt', 'a.txt'));
    expect(response.status).toBe(204);
    expect(mocks.release).toHaveBeenCalledTimes(1);
    expect(mocks.release).toHaveBeenCalledWith('owner1', 100);
    expect(mocks.acquireLease.mock.invocationCallOrder[0]).toBeLessThan(mocks.size.mock.invocationCallOrder[0]);
    expect(mocks.releaseLease).toHaveBeenCalledWith('owner1', 'bkt', 'a.txt', 'lease-token');
  });
});
