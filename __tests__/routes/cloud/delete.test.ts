import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { NextRequest } from "@/server/compat/next-server";

const mocks = vi.hoisted(() => ({
  selects: [] as unknown[][],
  updateWheres: [] as unknown[],
  deleteFolder: vi.fn(),
  deleteFile: vi.fn(),
  getFileSize: vi.fn(),
  decrementUsage: vi.fn(),
  deletes: 0,
}));

vi.mock("@/server/compat/clerk", () => ({ auth: async () => ({ userId: "u1" }) }));
vi.mock("@/lib/shared/db", () => {
  const result = () => {
    const rows = mocks.selects.shift() ?? [];
    return Object.assign(Promise.resolve(rows), { limit: async () => rows });
  };
  return {
    db: {
      select: () => ({ from: () => ({ where: result }) }),
      update: () => ({ set: () => ({ where: async (w: unknown) => { mocks.updateWheres.push(w); } }) }),
      delete: () => ({ where: async () => { mocks.deletes++; } }),
    },
  };
});
vi.mock("@/lib/cloud/system-service", () => ({
  systemStorage: { deleteFolder: mocks.deleteFolder, deleteFile: mocks.deleteFile, getFileSize: mocks.getFileSize },
}));
vi.mock("@/lib/shared/db-service", () => ({ dbService: { decrementUsage: mocks.decrementUsage } }));
vi.mock("@/lib/cloud/thumbnail-storage", () => ({ deleteGeneratedThumbnails: async () => {} }));
vi.mock("@/lib/cloud/catalog-service", () => ({ cloudCatalog: { removeFolderSubtree: async () => {} } }));

import { DELETE } from "@/server/routes/api/cloud/delete/route";

const request = (key: string) => new NextRequest("https://bucket0.test/api/cloud/delete", {
  method: "DELETE",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ key }),
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.selects = [];
  mocks.updateWheres = [];
  mocks.deletes = 0;
  mocks.deleteFile.mockResolvedValue(undefined);
  mocks.deleteFolder.mockResolvedValue(undefined);
});

describe("My Drive delete leaves Agent Storage files alone", () => {
  it("folder delete keeps Agent Storage objects and their share links", async () => {
    mocks.selects = [
      [{ id: "d1", fileSize: 10 }], // My Drive files in the folder
      [{ fileKey: "users/u1/reports/q3.txt" }], // Agent Storage files under the same path
    ];

    const response = await DELETE(request("reports/"));

    expect(response.status).toBe(200);
    const keep = mocks.deleteFolder.mock.calls[0][2] as Set<string>;
    expect([...keep]).toEqual(["users/u1/reports/q3.txt"]);
    const { sql, params } = new PgDialect().sqlToQuery(mocks.updateWheres[0] as never);
    expect(sql).toContain("not in");
    expect(params).toContain("reports/q3.txt");
    expect(mocks.decrementUsage).toHaveBeenCalledWith("u1", 10, 1);
  });

  it("an agent folder marker at the same path does not keep the deleted folder's own share link active", async () => {
    mocks.selects = [[{ id: "d1", fileSize: 10 }], [{ fileKey: "users/u1/reports/" }, { fileKey: "users/u1/reports/q3.txt" }]];

    await DELETE(request("reports/"));

    const { params } = new PgDialect().sqlToQuery(mocks.updateWheres[0] as never);
    expect(params).toContain("reports/q3.txt");
    expect(params).not.toContain("reports/");
  });

  it("folder delete without Agent Storage files keeps the plain prefix match", async () => {
    mocks.selects = [[{ id: "d1", fileSize: 10 }], []];

    await DELETE(request("reports/"));

    expect((mocks.deleteFolder.mock.calls[0][2] as Set<string>).size).toBe(0);
    expect(new PgDialect().sqlToQuery(mocks.updateWheres[0] as never).sql).not.toContain("not in");
  });

  it("single delete of a key that belongs to Agent Storage returns 404 and touches nothing", async () => {
    mocks.selects = [[], [{ id: "agent1" }]];

    const response = await DELETE(request("q3.txt"));

    expect(response.status).toBe(404);
    expect(mocks.deleteFile).not.toHaveBeenCalled();
    expect(mocks.getFileSize).not.toHaveBeenCalled();
    expect(mocks.deletes).toBe(0);
    expect(mocks.decrementUsage).not.toHaveBeenCalled();
  });

  it("single delete of a file with no catalog row still works", async () => {
    mocks.selects = [[], []];
    mocks.getFileSize.mockResolvedValue(42);

    const response = await DELETE(request("old.txt"));

    expect(response.status).toBe(200);
    expect(mocks.deleteFile).toHaveBeenCalledWith("u1", "old.txt");
    expect(mocks.decrementUsage).toHaveBeenCalledWith("u1", 42, 1);
  });
});
