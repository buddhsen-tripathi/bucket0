import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AbortMultipartUploadCommand, ListBucketsCommand, S3Client, UploadPartCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GET, PUT, DELETE } from '@/server/routes/api/s3-api/[[...path]]/route';
import { NextRequest } from '@/server/compat/next-server';
import { routeProductionRequest } from '@/server/production-routing';

const credentials = { accessKeyId: 'B0IAEXAMPLE', secretAccessKey: 'synthetic-test-secret' };
const mocks = vi.hoisted(() => ({ credential: vi.fn(), valid: vi.fn(), used: vi.fn(), listBuckets: vi.fn(), storage: vi.fn() }));
vi.mock('@/lib/s3-api', async () => ({
  ...await import('@/lib/s3-api/signature-v4'),
  ...await import('@/lib/s3-api/xml-responses'),
  s3ApiCredentialService: { getCredentialByAccessKey: mocks.credential, isCredentialValid: mocks.valid, updateLastUsed: mocks.used },
  s3ApiBucketService: { listBuckets: mocks.listBuckets, getOrCreateBucket: mocks.storage, bucketExists: mocks.storage },
  s3ApiStorageService: { putObject: mocks.storage, deleteObject: mocks.storage },
  s3ApiQuotaService: {},
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.credential.mockResolvedValue({ id: 'key1', userId: 'owner1', secretAccessKey: credentials.secretAccessKey, isActive: true });
  mocks.valid.mockReturnValue({ valid: true });
  mocks.listBuckets.mockResolvedValue([]);
});

function request(url: string, init?: RequestInit) {
  const routed = routeProductionRequest(new Request(url, init));
  if (!(routed instanceof Request)) throw new Error('Expected routed request');
  return new NextRequest(routed);
}
const params = { params: Promise.resolve({ path: ['test-bucket', 'existing.txt'] }) };

describe('S3 gateway authentication and multipart protection', () => {
  it.each(['https://s3.bucket0.com', 'https://bucket0.com/api/s3-api'])('uses existing key ownership for a presigned request through %s', async endpoint => {
    const client = new S3Client({ region: 'auto', endpoint, forcePathStyle: true, credentials });
    const url = await getSignedUrl(client, new ListBucketsCommand({}), { expiresIn: 60 });
    const response = await GET(request(url), { params: Promise.resolve({ path: [] }) });
    expect(response.status).toBe(200);
    expect(mocks.listBuckets).toHaveBeenCalledWith('owner1');
    expect(mocks.used).toHaveBeenCalledWith('key1');
  });

  it('rejects revoked credentials, tampering, and mixed authentication', async () => {
    const client = new S3Client({ region: 'auto', endpoint: 'https://s3.bucket0.com', forcePathStyle: true, credentials });
    const url = await getSignedUrl(client, new ListBucketsCommand({}), { expiresIn: 60 });
    mocks.valid.mockReturnValue({ valid: false });
    expect((await GET(request(url), params)).status).toBe(403);
    mocks.valid.mockReturnValue({ valid: true });
    expect((await GET(request(url + '&extra=tampered'), params)).status).toBe(403);
    expect((await GET(request(url, { headers: { authorization: 'AWS4-HMAC-SHA256 invalid' } }), params)).status).toBe(403);
    expect(mocks.listBuckets).not.toHaveBeenCalled();
    expect(mocks.used).not.toHaveBeenCalled();
  });

  it('rejects multipart parts and aborts without overwriting or deleting the object', async () => {
    const client = new S3Client({ region: 'auto', endpoint: 'https://s3.bucket0.com', forcePathStyle: true, credentials, requestChecksumCalculation: 'WHEN_REQUIRED' });
    const input = { Bucket: 'test-bucket', Key: 'existing.txt', UploadId: 'not-supported' };
    const part = await getSignedUrl(client, new UploadPartCommand({ ...input, PartNumber: 1 }), { expiresIn: 60 });
    const abort = await getSignedUrl(client, new AbortMultipartUploadCommand(input), { expiresIn: 60 });
    expect((await PUT(request(part, { method: 'PUT', body: 'part bytes' }), params)).status).toBe(400);
    expect((await DELETE(request(abort, { method: 'DELETE' }), params)).status).toBe(400);
    expect(mocks.storage).not.toHaveBeenCalled();
  });
});
