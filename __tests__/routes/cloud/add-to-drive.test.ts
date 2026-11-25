import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "@/server/compat/next-server";

const mocks = vi.hoisted(() => ({
  selects: [] as unknown[][],
  insert: vi.fn(),
  update: vi.fn(),
  reserve: vi.fn(),
  decrement: vi.fn(),
  getFileStream: vi.fn(),
  uploadFileStream: vi.fn(),
  deleteFile: vi.fn(),
  order: [] as string[],
}));

vi.mock("@/server/compat/clerk", () => ({
  auth: async () => ({ userId: "u1" }),
  currentUser: async () => ({ emailAddresses: [{ emailAddress: "user@example.test" }] }),
}));
vi.mock("@/lib/shared/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => mocks.selects.shift() ?? [] }) }) }),
    insert: () => ({
      values: (row: unknown) => ({ onConflictDoNothing: () => ({ returning: () => mocks.insert(row) }) }),
    }),
    update: mocks.update,
  },
}));
vi.mock("@/lib/shared/db-service", () => ({
  dbService: {
    getUser: async () => ({ plan: "free", storageUsage: 0 }),
    reserveQuotaAtomic: mocks.reserve,
    decrementUsage: mocks.decrement,
  },
}));
vi.mock("@/lib/payments/plans", () => ({ getPlanLimits: () => ({ maxStorageBytes: 1000 }) }));
vi.mock("@/lib/cloud/system-service", () => ({
  systemStorage: {
    getFileStream: mocks.getFileStream,
    getTeamFileStream: mocks.getFileStream,
    uploadFileStream: mocks.uploadFileStream,
    deleteFile: mocks.deleteFile,
  },
}));
vi.mock("@/lib/shared/encryption-utils", () => ({ shouldSkipEncryption: () => true }));
vi.mock("@/lib/cloud/catalog-service", () => ({
  cloudCatalog: { deriveFolderPath: () => "", onFileWritten: async () => {} },
}));

import { POST as addToDrive } from "@/server/routes/api/cloud/share/add-to-drive/route";

function request() {
  return new NextRequest("https://bucket0.test/api/cloud/share/add-to-drive", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ shareLinkId: "link1", shareType: "personal" }),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.order.length = 0;
  mocks.selects = [
    [{ id: "link1", userId: "owner", fileKey: "doc.txt", fileName: "doc.txt", isActive: true, allowAddToDrive: true }],
    [{ fileSize: 600, mimeType: "text/plain", encrypted: false, encryptionMode: "none", iv: "", authTag: null }],
    [], // not saved before
    [], // no name collision
  ];
  mocks.reserve.mockImplementation(async () => { mocks.order.push("reserve"); return { success: true, isNewFile: true, existingSize: 0 }; });
  mocks.decrement.mockResolvedValue(undefined);
  mocks.insert.mockResolvedValue([{ id: "f1" }]);
  mocks.deleteFile.mockResolvedValue(undefined);
  mocks.getFileStream.mockResolvedValue({
    Body: { transformToWebStream: () => new Blob(["hello"]).stream() },
  });
  mocks.uploadFileStream.mockImplementation(async () => { mocks.order.push("upload"); });
});

describe("add-to-drive quota reservation", () => {
  it("reserves quota atomically before the copy and never increments unconditionally", async () => {
    const response = await addToDrive(request());
    expect(response.status).toBe(200);
    expect(mocks.reserve).toHaveBeenCalledWith("u1", "users/u1/doc.txt", 600, 1000);
    expect(mocks.order).toEqual(["reserve", "upload"]);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.decrement).not.toHaveBeenCalled();
  });

  it("returns 403 without copying when the atomic reservation fails", async () => {
    mocks.reserve.mockResolvedValue({ success: false, isNewFile: true, existingSize: 0, quotaExceeded: true });
    const response = await addToDrive(request());
    expect(response.status).toBe(403);
    expect(mocks.getFileStream).not.toHaveBeenCalled();
    expect(mocks.uploadFileStream).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("releases the reservation when the copy fails", async () => {
    mocks.uploadFileStream.mockRejectedValue(new Error("R2 unavailable"));
    const response = await addToDrive(request());
    expect(response.status).toBe(500);
    expect(mocks.decrement).toHaveBeenCalledWith("u1", 600, 1);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("releases the reservation when the catalog insert fails", async () => {
    mocks.insert.mockRejectedValue(new Error("insert failed"));
    const response = await addToDrive(request());
    expect(response.status).toBe(500);
    expect(mocks.decrement).toHaveBeenCalledWith("u1", 600, 1);
  });
});

describe("add-to-drive concurrent saves of one link", () => {
  it("returns 409, releases the reservation and keeps the copy when the winner used the same key", async () => {
    mocks.insert.mockResolvedValue([]); // unique (user, link) index: insert did nothing
    mocks.selects.push([{ fileKey: "users/u1/doc.txt", fileName: "doc.txt" }]);
    const response = await addToDrive(request());
    expect(response.status).toBe(409);
    expect(mocks.decrement).toHaveBeenCalledWith("u1", 600, 1);
    expect(mocks.deleteFile).not.toHaveBeenCalled();
  });

  it("does not give back quota the reservation never charged (winner's row already at the same key)", async () => {
    mocks.reserve.mockResolvedValue({ success: true, isNewFile: false, existingSize: 600 });
    mocks.insert.mockResolvedValue([]);
    mocks.selects.push([{ fileKey: "users/u1/doc.txt", fileName: "doc.txt" }]);
    const response = await addToDrive(request());
    expect(response.status).toBe(409);
    expect(mocks.decrement).not.toHaveBeenCalled();
  });

  it("removes its own copy when the winner saved under a different name", async () => {
    mocks.insert.mockResolvedValue([]);
    mocks.selects.push([{ fileKey: "users/u1/doc_123.txt", fileName: "doc_123.txt" }]);
    const response = await addToDrive(request());
    expect(response.status).toBe(409);
    expect(mocks.decrement).toHaveBeenCalledTimes(1);
    expect(mocks.deleteFile).toHaveBeenCalledWith("u1", "doc.txt");
  });
});
