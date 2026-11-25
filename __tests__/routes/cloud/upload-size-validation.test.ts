import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "@/server/compat/next-server";

const mocks = vi.hoisted(() => ({
  quota: vi.fn(),
  getUploadUrl: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/server/compat/clerk", () => ({
  auth: async () => ({ userId: "u1" }),
  currentUser: async () => ({ emailAddresses: [{ emailAddress: "user@example.test" }] }),
}));
vi.mock("@/lib/cloud/system-service", () => ({
  systemStorage: { getUploadUrl: mocks.getUploadUrl },
}));
vi.mock("@/lib/shared/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: mocks.select }) }) }),
    update: () => ({ set: () => ({ where: () => ({ returning: mocks.update }) }) }),
  },
}));
vi.mock("@/lib/payments/rate-limit", () => ({
  RateLimiters: { fileUpload: () => ({ success: true }) },
  createRateLimitHeaders: () => ({}),
}));
vi.mock("@/lib/cloud/upload-validation", () => ({
  sanitizeFilename: (filename: string) => filename,
  validateFileSize: () => null,
  handleStorageQuota: mocks.quota,
  rollbackStorageQuota: vi.fn(),
}));

import { POST as upload } from "@/server/routes/api/cloud/upload/route";
import { DBService } from "@/lib/shared/db-service";

function jsonUpload(size: unknown) {
  return new NextRequest("https://bucket0.test/api/cloud/upload", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ filename: "file.txt", size }),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.select.mockResolvedValue([{ id: "u1", plan: "free", storageUsage: 100, fileCount: 1 }]);
  mocks.update.mockResolvedValue([{ id: "u1" }]);
  mocks.quota.mockResolvedValue({ success: true, isNewFile: true, existingSize: 0 });
  mocks.getUploadUrl.mockResolvedValue("https://r2.test/upload");
});

describe("JSON presigned upload size validation", () => {
  it.each([-1, 1.5, "-1", "10", Number.MAX_SAFE_INTEGER + 1, null])(
    "rejects size %s with 400 before quota handling or URL issuance",
    async (size) => {
      const response = await upload(jsonUpload(size));
      expect(response.status).toBe(400);
      expect(mocks.quota).not.toHaveBeenCalled();
      expect(mocks.getUploadUrl).not.toHaveBeenCalled();
    }
  );

  it("still issues an upload URL for a valid size", async () => {
    const response = await upload(jsonUpload(1024));
    expect(response.status).toBe(200);
    expect(mocks.quota).toHaveBeenCalledWith("u1", 1024, "file.txt", expect.anything(), expect.anything());
    expect(await response.json()).toEqual({ uploadUrl: "https://r2.test/upload" });
  });
});

describe("DBService.incrementUsageIfAllowed", () => {
  it.each([-1, -1024, 1.5, Number.NaN])("refuses delta %s without touching the counter", async (size) => {
    expect(await new DBService().incrementUsageIfAllowed("u1", size, 1)).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("still increments a valid nonnegative delta", async () => {
    expect(await new DBService().incrementUsageIfAllowed("u1", 1024, 1)).toBe(true);
    expect(mocks.update).toHaveBeenCalledOnce();
  });
});
