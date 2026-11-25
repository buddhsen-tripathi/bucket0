import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bucketRow: [] as unknown[],
  listObjects: vi.fn(),
  deleteObjects: vi.fn(),
  acquire: vi.fn(),
  release: vi.fn(),
  updates: [] as Record<string, unknown>[],
  deletes: 0,
}));

vi.mock("@/lib/shared/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => mocks.bucketRow }) }) }),
    update: () => ({ set: (values: Record<string, unknown>) => ({ where: async () => { mocks.updates.push(values); } }) }),
    delete: () => ({ where: async () => { mocks.deletes++; } }),
  },
}));
vi.mock("@/lib/s3-api/storage-service", () => ({
  s3ApiStorageService: { listObjects: mocks.listObjects, deleteObjects: mocks.deleteObjects },
}));
vi.mock("@/lib/s3-api/object-lease", () => ({
  acquireObjectLeases: mocks.acquire,
  releaseObjectLeases: mocks.release,
}));

import { s3ApiBucketService } from "@/lib/s3-api/bucket-service";
import { PgDialect } from "drizzle-orm/pg-core";

const dialect = new PgDialect();
const page = (objects: { key: string; size: number }[]) => ({ objects, prefixes: [], isTruncated: false });
/** Bytes subtracted by the first users update (rendered from the drizzle SQL expression). */
function usageDecrement() {
  const expr = mocks.updates[0].storageUsage as Parameters<PgDialect["sqlToQuery"]>[0];
  return dialect.sqlToQuery(expr).params;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.updates = [];
  mocks.deletes = 0;
  mocks.bucketRow = [{ id: "b1", userId: "u1", bucketName: "bkt", storageUsed: 300, objectCount: 2, isActive: true, createdAt: new Date(), updatedAt: new Date() }];
  mocks.release.mockResolvedValue(undefined);
  mocks.deleteObjects.mockResolvedValue(new Set());
});

describe("S3 bucket force delete takes per-object leases", () => {
  it("deletes leased objects, credits sizes read while holding the leases, then removes the bucket", async () => {
    mocks.listObjects
      .mockResolvedValueOnce(page([{ key: "a", size: 100 }, { key: "b", size: 200 }])) // page
      .mockResolvedValueOnce(page([{ key: "a", size: 100 }, { key: "b", size: 250 }])) // re-read under lease
      .mockResolvedValueOnce(page([])); // emptiness check
    mocks.acquire.mockResolvedValue({ token: "t1", keys: ["a", "b"] });

    const result = await s3ApiBucketService.deleteBucket("u1", "bkt", true);

    expect(result).toEqual({ success: true, deletedObjects: 2, freedBytes: 350 });
    expect(mocks.deleteObjects).toHaveBeenCalledWith("u1", "bkt", ["a", "b"]);
    expect(usageDecrement()).toContain(350);
    expect(mocks.release).toHaveBeenCalledWith("u1", "bkt", "t1");
    expect(mocks.deletes).toBe(1);
  });

  it("keeps the bucket and skips an object whose lease another request holds", async () => {
    mocks.listObjects
      .mockResolvedValueOnce(page([{ key: "a", size: 100 }, { key: "b", size: 200 }]))
      .mockResolvedValueOnce(page([{ key: "a", size: 100 }, { key: "b", size: 200 }]));
    mocks.acquire.mockResolvedValue({ token: "t1", keys: ["a"] });

    const result = await s3ApiBucketService.deleteBucket("u1", "bkt", true);

    expect(result.success).toBe(false);
    expect(mocks.deleteObjects).toHaveBeenCalledWith("u1", "bkt", ["a"]);
    expect(usageDecrement()).toContain(100);
    expect(mocks.deletes).toBe(0);
    expect(mocks.release).toHaveBeenCalledWith("u1", "bkt", "t1");
  });

  it("does not credit an object that was deleted elsewhere before the lease was taken", async () => {
    mocks.listObjects
      .mockResolvedValueOnce(page([{ key: "a", size: 100 }]))
      .mockResolvedValueOnce(page([]))
      .mockResolvedValueOnce(page([]));
    mocks.acquire.mockResolvedValue({ token: "t1", keys: ["a"] });

    const result = await s3ApiBucketService.deleteBucket("u1", "bkt", true);

    expect(result).toEqual({ success: true, deletedObjects: 0, freedBytes: 0 });
    expect(mocks.deleteObjects).toHaveBeenCalledWith("u1", "bkt", []);
    expect(mocks.updates).toHaveLength(0);
  });

  it("keeps the bucket when an object was added during the delete", async () => {
    mocks.listObjects
      .mockResolvedValueOnce(page([{ key: "a", size: 100 }]))
      .mockResolvedValueOnce(page([{ key: "a", size: 100 }]))
      .mockResolvedValueOnce(page([{ key: "late", size: 5 }]));
    mocks.acquire.mockResolvedValue({ token: "t1", keys: ["a"] });

    const result = await s3ApiBucketService.deleteBucket("u1", "bkt", true);

    expect(result.success).toBe(false);
    expect(mocks.deletes).toBe(0);
  });

  it("walks multiple pages, re-reading each page with its own continuation token", async () => {
    const truncated = { objects: [{ key: "a", size: 100 }], prefixes: [], isTruncated: true, nextContinuationToken: "p2" };
    mocks.listObjects
      .mockResolvedValueOnce(truncated) // page 1
      .mockResolvedValueOnce(truncated) // page 1 re-read
      .mockResolvedValueOnce(page([{ key: "b", size: 200 }])) // page 2
      .mockResolvedValueOnce(page([{ key: "b", size: 200 }])) // page 2 re-read
      .mockResolvedValueOnce(page([])); // emptiness check
    mocks.acquire
      .mockResolvedValueOnce({ token: "t1", keys: ["a"] })
      .mockResolvedValueOnce({ token: "t2", keys: ["b"] });

    const result = await s3ApiBucketService.deleteBucket("u1", "bkt", true);

    expect(result).toEqual({ success: true, deletedObjects: 2, freedBytes: 300 });
    const tokens = mocks.listObjects.mock.calls.slice(0, 4).map((call) => call[2].continuationToken);
    expect(tokens).toEqual([undefined, undefined, "p2", "p2"]);
    expect(mocks.release.mock.calls.map((call) => call[2])).toEqual(["t1", "t2"]);
  });

  it("releases the leases when the R2 delete throws", async () => {
    mocks.listObjects.mockResolvedValue(page([{ key: "a", size: 100 }]));
    mocks.acquire.mockResolvedValue({ token: "t1", keys: ["a"] });
    mocks.deleteObjects.mockRejectedValue(new Error("R2 down"));

    await expect(s3ApiBucketService.deleteBucket("u1", "bkt", true)).rejects.toThrow("R2 down");
    expect(mocks.release).toHaveBeenCalledWith("u1", "bkt", "t1");
    expect(mocks.updates).toHaveLength(0);
  });

  it("does not credit keys R2 failed to delete", async () => {
    mocks.listObjects
      .mockResolvedValueOnce(page([{ key: "a", size: 100 }, { key: "b", size: 200 }]))
      .mockResolvedValueOnce(page([{ key: "a", size: 100 }, { key: "b", size: 200 }]));
    mocks.acquire.mockResolvedValue({ token: "t1", keys: ["a", "b"] });
    mocks.deleteObjects.mockResolvedValue(new Set(["b"]));

    const result = await s3ApiBucketService.deleteBucket("u1", "bkt", true);

    expect(result.success).toBe(false);
    expect(usageDecrement()).toContain(100);
    expect(mocks.deletes).toBe(0);
  });
});
