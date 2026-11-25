import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "@/server/compat/next-server";

// Records every db.update(table).set(values).where(cond) call.
const updates: Array<{ table: unknown; values: unknown; where: unknown }> = [];
const selectResults: unknown[][] = [];

function chain(result: unknown) {
  const c: Record<string, unknown> = {};
  for (const m of ["from", "where", "limit", "orderBy", "offset"]) c[m] = () => c;
  c.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return c;
}

vi.mock("@/lib/shared/db", () => ({
  db: {
    select: vi.fn(() => chain(selectResults.shift() ?? [])),
    update: vi.fn((table: unknown) => ({
      set: (values: unknown) => ({
        where: (cond: unknown) => {
          updates.push({ table, values, where: cond });
          return Promise.resolve([]);
        },
      }),
    })),
    delete: vi.fn(() => ({ where: () => Promise.resolve([]) })),
    insert: vi.fn(() => ({ values: () => Promise.resolve([]) })),
  },
}));

vi.mock("@/db/schema", () => ({
  cloudFiles: { id: "cloudFiles.id", userId: "cloudFiles.userId", fileKey: "cloudFiles.fileKey", isAgentUpload: "cloudFiles.isAgentUpload" },
  users: { id: "users.id", storageUsage: "users.storageUsage", fileCount: "users.fileCount" },
  memoryChunks: { fileId: "memoryChunks.fileId" },
  shareLinks: { name: "shareLinks", userId: "shareLinks.userId", fileKey: "shareLinks.fileKey" },
}));

vi.mock("drizzle-orm", () => ({
  eq: (...args: unknown[]) => ["eq", ...args],
  and: (...args: unknown[]) => ["and", ...args],
  desc: (x: unknown) => x,
  sql: () => "sql",
}));

vi.mock("@/lib/cloud/system-service", () => ({
  systemStorage: {
    deleteFile: vi.fn().mockResolvedValue(undefined),
    deleteByKey: vi.fn().mockResolvedValue(undefined),
    copyObject: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/lib/cloud/thumbnail-storage", () => ({
  deleteGeneratedThumbnails: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/cloud/catalog-service", () => ({
  cloudCatalog: {
    deriveFolderPath: vi.fn(() => "docs/"),
    onFileWritten: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/lib/shared/logger", () => ({
  agentLog: { info: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/agent/agent-route-helpers", () => ({
  requireAgentAuth: vi.fn().mockResolvedValue({ userId: "userA", error: null }),
}));

vi.mock("@/server/compat/clerk", () => ({
  auth: vi.fn().mockResolvedValue({ userId: "userA" }),
}));

function shareLinkDeactivations() {
  return updates.filter(
    (u) => (u.table as { name?: string })?.name === "shareLinks"
  );
}

beforeEach(() => {
  updates.length = 0;
  selectResults.length = 0;
});

describe("agent file lifecycle revokes share links", () => {
  it("DELETE /api/agent-bucket/files deactivates links bound to the deleted key", async () => {
    selectResults.push([{ id: "file-1", fileSize: 10 }]);
    const { DELETE } = await import("@/server/routes/api/agent-bucket/files/route");

    const res = await DELETE(
      new NextRequest("http://localhost/api/agent-bucket/files?key=docs/a.txt", { method: "DELETE" })
    );

    expect(res.status).toBe(200);
    const links = shareLinkDeactivations();
    expect(links).toHaveLength(1);
    expect(links[0].values).toEqual({ isActive: false });
    expect(links[0].where).toEqual([
      "and",
      ["eq", "shareLinks.userId", "userA"],
      ["eq", "shareLinks.fileKey", "docs/a.txt"],
    ]);
  });

  it("DELETE does not touch share links when the file is not found", async () => {
    selectResults.push([]);
    const { DELETE } = await import("@/server/routes/api/agent-bucket/files/route");

    const res = await DELETE(
      new NextRequest("http://localhost/api/agent-bucket/files?key=missing.txt", { method: "DELETE" })
    );

    expect(res.status).toBe(404);
    expect(shareLinkDeactivations()).toHaveLength(0);
  });

  it("move-to-drive into a folder deactivates links bound to the original key", async () => {
    // 1: source agent file, 2: resolveTargetKey (no conflict)
    selectResults.push([{ id: "file-1", fileKey: "users/userA/a.txt", fileSize: 10 }], []);
    const { POST } = await import("@/server/routes/api/agent-bucket/files/move-to-drive/route");

    const res = await POST(
      new NextRequest("http://localhost/api/agent-bucket/files/move-to-drive", {
        method: "POST",
        body: JSON.stringify({ fileKey: "a.txt", mode: "move", folder: "docs" }),
      })
    );

    expect(res.status).toBe(200);
    const links = shareLinkDeactivations();
    expect(links).toHaveLength(1);
    expect(links[0].values).toEqual({ isActive: false });
    expect(links[0].where).toEqual([
      "and",
      ["eq", "shareLinks.userId", "userA"],
      ["eq", "shareLinks.fileKey", "a.txt"],
    ]);
  });

  it("move-to-drive to root keeps the key and leaves links active", async () => {
    selectResults.push([{ id: "file-1", fileKey: "users/userA/a.txt", fileSize: 10 }]);
    const { POST } = await import("@/server/routes/api/agent-bucket/files/move-to-drive/route");

    const res = await POST(
      new NextRequest("http://localhost/api/agent-bucket/files/move-to-drive", {
        method: "POST",
        body: JSON.stringify({ fileKey: "a.txt", mode: "move" }),
      })
    );

    expect(res.status).toBe(200);
    expect(shareLinkDeactivations()).toHaveLength(0);
  });
});
