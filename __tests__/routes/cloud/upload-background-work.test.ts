import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { requestContextMiddleware } from "@/server/request-context-middleware";
import { NextRequest } from "@/server/compat/next-server";

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  uploadStream: vi.fn(),
  saveMetadata: vi.fn(),
  updateMetadata: vi.fn(),
  catalog: vi.fn(),
  thumbnail: vi.fn(),
  rollback: vi.fn(),
}));

vi.mock("@/server/compat/clerk", () => ({
  auth: async () => ({ userId: "u1" }),
  currentUser: async () => ({ emailAddresses: [{ emailAddress: "user@example.test" }] }),
}));
vi.mock("@/lib/cloud/system-service", () => ({
  systemStorage: {
    uploadFile: mocks.upload,
    uploadFileStream: mocks.uploadStream,
  },
}));
vi.mock("@/lib/shared/db-service", () => ({
  dbService: { getUser: async () => ({ plan: "free", storageUsage: 0 }) },
}));
vi.mock("@/lib/shared/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
    insert: () => ({ values: mocks.saveMetadata }),
    update: () => ({ set: () => ({ where: mocks.updateMetadata }) }),
  },
}));
vi.mock("@/lib/payments/plans", () => ({ getPlanLimits: () => ({}) }));
vi.mock("@/lib/payments/rate-limit", () => ({
  RateLimiters: { fileUpload: () => ({ success: true }) },
  createRateLimitHeaders: () => ({}),
}));
vi.mock("@/lib/cloud/upload-validation", () => ({
  sanitizeFilename: (filename: string) => filename,
  validateFileSize: () => null,
  handleStorageQuota: async () => ({ success: true, isNewFile: true, existingSize: 0 }),
  rollbackStorageQuota: mocks.rollback,
}));
vi.mock("@/lib/shared/encryption-utils", () => ({ shouldSkipEncryption: () => true }));
vi.mock("@/lib/cloud/catalog-service", () => ({
  cloudCatalog: { deriveFolderPath: () => "", onFileWritten: mocks.catalog, createFolder: mocks.catalog },
}));
vi.mock("@/lib/cloud/thumbnail-service", () => ({ supportsThumbnail: () => true }));
vi.mock("@/lib/cloud/background-jobs", () => ({ enqueueThumbnail: mocks.thumbnail }));

import { POST as uploadFile } from "@/server/routes/api/cloud/upload/route";
import { POST as createFolder } from "@/server/routes/api/cloud/folder/route";

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (reason: unknown) => void = () => {};
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function withinRequest(request: NextRequest, handler: () => Promise<Response>) {
  const pending: Promise<unknown>[] = [];
  const app = new Hono();
  app.use("*", requestContextMiddleware);
  app.all("*", handler);
  const result = Promise.resolve(app.fetch(request, {}, {
    waitUntil: (promise) => { pending.push(promise); },
    passThroughOnException: () => {},
    props: {},
  }));
  return { result, pending };
}

function uploadRequest() {
  const form = new FormData();
  form.set("file", new File(["image contents"], "photo.png", { type: "image/png" }));
  form.set("filename", "photo.png");
  return new NextRequest("https://bucket0.test/api/cloud/upload", { method: "POST", body: form });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.upload.mockResolvedValue(undefined);
  mocks.uploadStream.mockResolvedValue(undefined);
  mocks.saveMetadata.mockResolvedValue(undefined);
  mocks.updateMetadata.mockResolvedValue(undefined);
  mocks.catalog.mockResolvedValue(undefined);
  mocks.thumbnail.mockResolvedValue(undefined);
  mocks.rollback.mockResolvedValue(undefined);
});

describe("Worker upload lifetime", () => {
  it("finishes catalog writes before responding and retains thumbnail queueing after the response", async () => {
    const catalog = deferred<void>();
    const thumbnail = deferred<void>();
    mocks.catalog.mockReturnValue(catalog.promise);
    mocks.thumbnail.mockReturnValue(thumbnail.promise);
    const request = uploadRequest();
    const { result, pending } = withinRequest(request, () => uploadFile(request));

    await vi.waitFor(() => expect(mocks.catalog).toHaveBeenCalled());
    expect(mocks.saveMetadata).toHaveBeenCalled();
    expect(mocks.thumbnail).not.toHaveBeenCalled();
    let responded = false;
    void result.then(() => { responded = true; });
    await Promise.resolve();
    expect(responded).toBe(false);

    catalog.resolve(undefined);
    const response = await result;
    expect(response.status).toBe(200);
    expect(pending).toHaveLength(2); // Upload transaction and thumbnail job.
    expect(mocks.thumbnail).toHaveBeenCalledWith("u1", "users/u1/photo.png", "personal");

    thumbnail.resolve(undefined);
    await Promise.all(pending);
  });

  it("retains a failing upload until quota rollback completes", async () => {
    const storage = deferred<void>();
    const rollback = deferred<void>();
    mocks.uploadStream.mockReturnValue(storage.promise);
    mocks.rollback.mockReturnValue(rollback.promise);
    const request = uploadRequest();
    const { result, pending } = withinRequest(request, () => uploadFile(request));

    await vi.waitFor(() => expect(mocks.uploadStream).toHaveBeenCalled());
    expect(pending).toHaveLength(1);
    storage.reject(new Error("Storage unavailable"));
    await vi.waitFor(() => expect(mocks.rollback).toHaveBeenCalled());
    let finished = false;
    void pending[0].then(() => { finished = true; });
    await Promise.resolve();
    expect(finished).toBe(false);

    rollback.resolve(undefined);
    expect((await result).status).toBe(500);
    await Promise.all(pending);
    expect(finished).toBe(true);
    expect(mocks.saveMetadata).not.toHaveBeenCalled();
  });

  it("does not acknowledge a new folder until its database catalog entry is written", async () => {
    const catalog = deferred<void>();
    mocks.catalog.mockReturnValue(catalog.promise);
    const request = new NextRequest("https://bucket0.test/api/cloud/folder", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ folderPath: "reports" }),
    });
    const response = createFolder(request);
    let responded = false;
    void response.then(() => { responded = true; });
    await vi.waitFor(() => expect(mocks.catalog).toHaveBeenCalled());
    expect(responded).toBe(false);
    catalog.resolve(undefined);
    expect((await response).status).toBe(200);
  });
});
