import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "@/server/compat/next-server";

const mocks = vi.hoisted(() => ({
  getBucket: vi.fn(), size: vi.fn(), put: vi.fn(), check: vi.fn(), reserve: vi.fn(),
  release: vi.fn(), adjust: vi.fn(), stats: vi.fn(), acquire: vi.fn(), releaseLease: vi.fn(),
}));
vi.mock("@/server/compat/clerk", () => ({ auth: async () => ({ userId: "u1" }) }));
vi.mock("@/lib/s3-api", () => ({
  s3ApiBucketService: { getBucket: mocks.getBucket },
  s3ApiStorageService: { getObjectSize: mocks.size, putObject: mocks.put },
  s3ApiQuotaService: { checkUploadAllowed: mocks.check, reserveQuota: mocks.reserve, releaseQuota: mocks.release, adjustQuotaForReplace: mocks.adjust, updateBucketStats: mocks.stats },
  acquireObjectLease: mocks.acquire,
  releaseObjectLease: mocks.releaseLease,
}));

import { POST } from "@/server/routes/api/s3-api/files/upload/route";

const upload = () => POST(new NextRequest("https://bucket0.test/api/s3-api/files/upload?bucket=bkt&key=a.txt", {
  method: "POST", headers: { "content-type": "text/plain" }, body: "hello",
}));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getBucket.mockResolvedValue({ bucketName: "bkt" });
  mocks.check.mockResolvedValue({ allowed: true });
  mocks.reserve.mockResolvedValue({ success: true });
  mocks.adjust.mockResolvedValue({ success: true });
  mocks.acquire.mockResolvedValue("lease");
  mocks.releaseLease.mockResolvedValue(undefined);
  mocks.put.mockRejectedValue(new Error("R2 down"));
});

describe("dashboard S3 upload undoes its quota change when the R2 write fails", () => {
  it("releases the reservation for a new object", async () => {
    mocks.size.mockResolvedValue(0);
    const response = await upload();
    expect(response.status).toBe(500);
    expect(mocks.reserve).toHaveBeenCalledWith("u1", 5);
    expect(mocks.release).toHaveBeenCalledWith("u1", 5);
    expect(mocks.stats).not.toHaveBeenCalled();
    expect(mocks.releaseLease).toHaveBeenCalledWith("u1", "bkt", "a.txt", "lease");
  });

  it("restores the old size for an overwrite", async () => {
    mocks.size.mockResolvedValue(100);
    const response = await upload();
    expect(response.status).toBe(500);
    expect(mocks.adjust).toHaveBeenNthCalledWith(1, "u1", 100, 5);
    expect(mocks.adjust).toHaveBeenNthCalledWith(2, "u1", 5, 100);
    expect(mocks.release).not.toHaveBeenCalled();
  });
});
