import { beforeEach, describe, expect, it, vi } from "vitest";
import { S3ServiceException } from "@aws-sdk/client-s3";
import { NextRequest } from "@/server/compat/next-server";

const mocks = vi.hoisted(() => ({
  getUpload: vi.fn(),
  startCompletion: vi.fn(),
  resumeUpload: vi.fn(),
  objectWasCompleted: vi.fn(),
  completeUpload: vi.fn(),
  completeMultipartUpload: vi.fn(),
  catalog: vi.fn(),
}));

vi.mock("@/server/compat/clerk", () => ({ auth: async () => ({ userId: "u1" }) }));
vi.mock("@/lib/shared/db", () => ({ db: {} }));
vi.mock("@/lib/cloud/chunked-upload-tracker", () => ({ chunkedUploadTracker: mocks }));
vi.mock("@/lib/cloud/system-service", () => ({ systemStorage: mocks }));
vi.mock("@/lib/cloud/catalog-service", () => ({ cloudCatalog: { onFileWritten: mocks.catalog } }));
vi.mock("@/lib/cloud/thumbnail-service", () => ({ supportsThumbnail: () => false }));

import { POST } from "@/server/routes/api/cloud/upload/chunked/complete/route";

const upload = {
  id: "reservation-1", userId: "u1", uploadId: "multipart-1", key: "photo.jpg",
  state: "active", size: 10 * 1024 * 1024, contentType: "image/jpeg", encrypted: true,
  operationToken: "attempt-1",
};
const parts = [{ partNumber: 1, etag: "etag-1" }, { partNumber: 2, etag: "etag-2" }];

function request(uploadParts: unknown = parts) {
  return new NextRequest("https://bucket0.test/api/cloud/upload/chunked/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ uploadId: upload.uploadId, key: upload.key, parts: uploadParts }),
  });
}

function serviceError(name: string, status: number) {
  return new S3ServiceException({ name, message: name, $fault: "client", $metadata: { httpStatusCode: status } });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getUpload.mockResolvedValue(upload);
  mocks.startCompletion.mockResolvedValue(upload);
  mocks.resumeUpload.mockResolvedValue(undefined);
  mocks.objectWasCompleted.mockResolvedValue(false);
  mocks.completeUpload.mockResolvedValue(undefined);
  mocks.completeMultipartUpload.mockResolvedValue(undefined);
  mocks.catalog.mockResolvedValue(undefined);
});

describe("multipart completion recovery", () => {
  it.each([
    [[{ partNumber: 1, etag: "etag-1" }]],
    [[{ partNumber: 1, etag: "etag-1" }, { partNumber: 1, etag: "duplicate" }]],
    [[null]],
  ])("rejects invalid/missing parts before locking completion: %j", async (invalidParts) => {
    expect((await POST(request(invalidParts))).status).toBe(400);
    expect(mocks.startCompletion).not.toHaveBeenCalled();
    expect(mocks.completeMultipartUpload).not.toHaveBeenCalled();
  });

  it("makes a definitively rejected completion available for cancellation or retry", async () => {
    mocks.completeMultipartUpload.mockRejectedValue(serviceError("InvalidPart", 400));
    expect((await POST(request())).status).toBe(500);
    expect(mocks.resumeUpload).toHaveBeenCalledWith("u1", "multipart-1", "attempt-1");
    expect(mocks.completeUpload).not.toHaveBeenCalled();
  });

  it("rejects concurrent completion attempts before calling R2", async () => {
    mocks.startCompletion.mockResolvedValue(undefined);
    expect((await POST(request())).status).toBe(409);
    expect(mocks.completeMultipartUpload).not.toHaveBeenCalled();
  });

  it.each([
    new Error("Connection reset"),
    serviceError("InternalError", 500),
    serviceError("NoSuchUpload", 404),
  ])("keeps ambiguous completion failures protected: %s", async (error) => {
    mocks.completeMultipartUpload.mockRejectedValue(error);
    expect((await POST(request())).status).toBe(500);
    expect(mocks.resumeUpload).not.toHaveBeenCalled();
    expect(mocks.completeUpload).not.toHaveBeenCalled();
  });

  it("finalizes metadata when R2 already completed but its response was lost", async () => {
    mocks.completeMultipartUpload.mockRejectedValue(serviceError("NoSuchUpload", 404));
    mocks.objectWasCompleted.mockResolvedValue(true);
    expect((await POST(request())).status).toBe(200);
    expect(mocks.completeUpload).toHaveBeenCalledWith("u1", "multipart-1");
    expect(mocks.resumeUpload).not.toHaveBeenCalled();
    expect(mocks.catalog).toHaveBeenCalledWith("u1", "users/u1/photo.jpg", { isAgentUpload: false });
  });
});
