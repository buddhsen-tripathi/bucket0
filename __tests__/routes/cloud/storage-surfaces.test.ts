import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { NextRequest } from "@/server/compat/next-server";

const mocks = vi.hoisted(() => ({
  selects: [] as unknown[][],
  increment: vi.fn(),
  decrement: vi.fn(),
  rollback: vi.fn(),
  upload: vi.fn(),
  uploadStream: vi.fn(),
  getUploadUrl: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  agentAuth: vi.fn(),
}));

vi.mock("@/server/compat/clerk", () => ({
  auth: async () => ({ userId: "u1" }),
  currentUser: async () => ({ emailAddresses: [{ emailAddress: "user@example.test" }] }),
}));
vi.mock("@/lib/shared/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => mocks.selects.shift() ?? [] }) }) }),
    insert: () => ({ values: (values: unknown) => { mocks.insert(values); return { returning: async () => [{ id: "f1" }] }; } }),
    update: () => ({ set: (values: unknown) => ({ where: async () => mocks.update(values) }) }),
    execute: vi.fn(),
  },
}));
vi.mock("@/lib/shared/db-service", () => ({
  dbService: {
    getUser: async () => ({ plan: "free", storageUsage: 0 }),
    incrementUsageIfAllowed: mocks.increment,
    decrementUsage: mocks.decrement,
    rollbackUsage: mocks.rollback,
  },
}));
vi.mock("@/lib/cloud/system-service", () => ({
  systemStorage: { uploadFile: mocks.upload, uploadFileStream: mocks.uploadStream, getUploadUrl: mocks.getUploadUrl },
}));
vi.mock("@/lib/payments/rate-limit", () => ({
  RateLimiters: { fileUpload: () => ({ success: true }) },
  createRateLimitHeaders: () => ({}),
}));
vi.mock("@/lib/shared/encryption-utils", () => ({ shouldSkipEncryption: () => true }));
vi.mock("@/lib/cloud/catalog-service", () => ({
  cloudCatalog: { deriveFolderPath: () => "", onFileWritten: async () => {} },
}));
vi.mock("@/lib/cloud/thumbnail-service", () => ({ supportsThumbnail: () => false }));
vi.mock("@/lib/agent/agent-route-helpers", () => ({ requireAgentAuth: mocks.agentAuth }));
vi.mock("@/lib/agent/memory-service", () => ({ isTextLike: () => false }));
vi.mock("@/lib/cloud/background-jobs", () => ({ enqueueIndex: vi.fn(), enqueueThumbnail: vi.fn() }));

import { handleStorageQuota } from "@/lib/cloud/upload-validation";
import { getPlanLimits } from "@/lib/payments/plans";
import { POST as driveUpload } from "@/server/routes/api/cloud/upload/route";
import { POST as agentUpload } from "@/server/routes/api/agent-bucket/files/upload/route";
import { createChunkedUploadTracker, type UploadRow } from "@/lib/cloud/chunked-upload-tracker";

const limits = getPlanLimits("free");
const agentRow = { fileSize: 5, isAgentUpload: true };
const driveRow = { fileSize: 5, isAgentUpload: false };

function multipart(url: string, filename = "taxes.txt") {
  const form = new FormData();
  form.set("file", new File(["new bytes"], filename, { type: "text/plain" }));
  form.set("filename", filename);
  return new NextRequest(url, { method: "POST", body: form });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.selects = [];
  mocks.increment.mockResolvedValue(true);
  mocks.uploadStream.mockResolvedValue(undefined);
  mocks.agentAuth.mockResolvedValue({ userId: "u1", keyId: "k1", destination: "agent", destinationFolder: null, error: null });
});

describe("handleStorageQuota surface boundary", () => {
  it("rejects a Drive write over an Agent Storage row without reserving quota", async () => {
    mocks.selects = [[agentRow]];
    const result = await handleStorageQuota("u1", 10, "taxes.txt", { plan: "free", storageUsage: 0 }, limits);
    expect(result).toMatchObject({ success: false, surfaceConflict: true });
    expect(mocks.increment).not.toHaveBeenCalled();
    expect(mocks.decrement).not.toHaveBeenCalled();
  });

  it("rejects an agent write over a Drive row without reserving quota", async () => {
    mocks.selects = [[driveRow]];
    const result = await handleStorageQuota("u1", 10, "taxes.txt", { plan: "free", storageUsage: 0 }, limits, true);
    expect(result).toMatchObject({ success: false, surfaceConflict: true });
    expect(mocks.increment).not.toHaveBeenCalled();
  });

  it("still allows same-surface overwrites", async () => {
    mocks.selects = [[agentRow]];
    const result = await handleStorageQuota("u1", 10, "taxes.txt", { plan: "free", storageUsage: 0 }, limits, true);
    expect(result).toEqual({ success: true, isNewFile: false, existingSize: 5 });
    expect(mocks.increment).toHaveBeenCalledWith("u1", 5, 0);
  });
});

describe("upload routes at a colliding key", () => {
  it("agent upload over a Drive file returns 409 and never writes R2 or the Drive row", async () => {
    mocks.selects = [[{ plan: "free", storageUsage: 0 }], [driveRow]];
    const response = await agentUpload(multipart("https://bucket0.test/api/agent-bucket/files/upload"));
    expect(response.status).toBe(409);
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.uploadStream).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("Drive upload over an Agent Storage file returns 409 and never writes R2", async () => {
    mocks.selects = [[agentRow]];
    const response = await driveUpload(multipart("https://bucket0.test/api/cloud/upload"));
    expect(response.status).toBe(409);
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.uploadStream).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("JSON presigned Drive upload over an Agent Storage file returns 409 without an upload URL", async () => {
    mocks.selects = [[agentRow]];
    const response = await driveUpload(new NextRequest("https://bucket0.test/api/cloud/upload", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filename: "taxes.txt", size: 10 }),
    }));
    expect(response.status).toBe(409);
    expect(mocks.getUploadUrl).not.toHaveBeenCalled();
  });

  it("Drive overwrite of a Drive file explicitly keeps the row in My Drive", async () => {
    mocks.selects = [[driveRow], [{ id: "f1" }]];
    const response = await driveUpload(multipart("https://bucket0.test/api/cloud/upload"));
    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ isAgentUpload: false, uploadedVia: null }));
  });
});

describe("chunked upload surface boundary", () => {
  const dialect = new PgDialect();
  const args = { userId: "u1", key: "taxes.txt", size: 10, contentType: "text/plain", encrypted: false, maxStorageBytes: 100, maxFileCount: 0 };

  it("refuses to reserve a Drive chunked upload over an Agent Storage file", async () => {
    const run = vi.fn(async (_query: SQL) => [{ id: "agent-file" }] as unknown as UploadRow[]);
    const tracker = createChunkedUploadTracker(run, { abortMultipartUpload: vi.fn(), getFileMetadata: vi.fn() });
    expect(await tracker.reserveUpload(args)).toEqual({ success: false, reason: "surface" });
    expect(run).toHaveBeenCalledOnce();
    const query = dialect.sqlToQuery(run.mock.calls[0][0]);
    expect(query.sql).toContain("is_agent_upload");
    expect(query.params).toContain("users/u1/taxes.txt");
  });

  it("chunked completion always lands the row in My Drive", async () => {
    const run = vi.fn(async (_query: SQL) => [] as UploadRow[]);
    const tracker = createChunkedUploadTracker(run, { abortMultipartUpload: vi.fn(), getFileMetadata: vi.fn() });
    await tracker.completeUpload("u1", "upload-1");
    const query = dialect.sqlToQuery(run.mock.calls[0][0]).sql;
    expect(query).toMatch(/is_agent_upload = false, uploaded_via = NULL/);
  });
});
