import { describe, it, expect, vi } from "vitest";

/**
 * Builds a drizzle stub: each chain call lands on the table-specific rows.
 * The route hits these chains per request:
 *   .select(...).from(cloudFolders).where(...).orderBy(...)       → folders
 *   .select(...).from(cloudFiles).where(...).orderBy(...).limit(...).offset(...) → file page
 *   .select(count).from(cloudFiles).where(...)                    → totalItems
 */
function makeDbStub(plan: { folders?: unknown[]; files?: unknown[]; totalItems?: number }) {
  function makeChain(opts: { rows: unknown[]; isCountChain?: boolean }) {
    const o: Record<string, unknown> = {};
    o.where = () => o;
    o.orderBy = (..._args: unknown[]) => o;
    o.limit = (_n: unknown) => o;
    o.offset = (_n: unknown) => Promise.resolve(opts.rows);
    // For folders the chain ends at .orderBy(); for the count it ends at .where().
    // Make both thenable so `await chain.orderBy()` and `await chain.where()` resolve.
    const thenable = { then: (resolve: (v: unknown) => unknown) => Promise.resolve(opts.rows).then(resolve) };
    o.where = () => Object.assign({
      orderBy: (..._a: unknown[]) => Object.assign({
        limit: (_l: unknown) => ({ offset: (_o: unknown) => Promise.resolve(opts.rows) }),
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(opts.rows).then(resolve),
      }, thenable),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(opts.rows).then(resolve),
    }, thenable);
    return o;
  }

  const select = vi.fn().mockImplementation((shape?: unknown) => {
    // Heuristic: count query has a single key shaped like { n: ... }
    const isCount =
      shape &&
      typeof shape === "object" &&
      Object.keys(shape as object).length === 1 &&
      Object.keys(shape as object)[0] === "n";

    return {
      from: (table: unknown) => {
        const marker = (table as { __marker?: string } | undefined)?.__marker;
        if (isCount) {
          return makeChain({ rows: [{ n: plan.totalItems ?? (plan.files?.length ?? 0) }] });
        }
        if (marker === "cloudFolders") {
          return makeChain({ rows: plan.folders ?? [] });
        }
        return makeChain({ rows: plan.files ?? [] });
      },
    };
  });

  return { db: { select } };
}

describe("GET /api/cloud/files/list", () => {
  let GET: (req: Request) => Promise<Response>;

  async function setup(plan: { folders?: unknown[]; files?: unknown[]; totalItems?: number }) {
    vi.resetModules();
    const { db } = makeDbStub(plan);

    vi.doMock("@/server/compat/clerk", () => ({ auth: vi.fn(), currentUser: vi.fn() }));
    vi.doMock("@/lib/shared/db-service", () => ({
      dbService: { getUser: vi.fn().mockResolvedValue({ plan: "free", storageUsage: 42 }) },
    }));
    vi.doMock("@/lib/payments/plans", () => ({
      getPlanLimits: vi.fn().mockReturnValue({ maxStorageBytes: 1000, maxFileSizeBytes: 100 }),
      formatBytes: vi.fn((n: number) => `${n}b`),
    }));
    vi.doMock("@/lib/shared/db", () => ({ db }));
    vi.doMock("@/db/schema", () => ({
      cloudFiles: { __marker: "cloudFiles", userId: "userId", folderPath: "folderPath", isAgentUpload: "isAgentUpload", fileKey: "fileKey", fileName: "fileName", id: "id", createdAt: "createdAt" },
      cloudFolders: { __marker: "cloudFolders", userId: "userId", isAgentUpload: "isAgentUpload", parentPath: "parentPath", path: "path", name: "name", createdAt: "createdAt" },
    }));
    vi.doMock("drizzle-orm", () => ({
      and: vi.fn((...a: unknown[]) => ({ _op: "and", a })),
      eq: vi.fn((c: unknown, v: unknown) => ({ _op: "eq", c, v })),
      asc: vi.fn((c: unknown) => ({ _op: "asc", c })),
      desc: vi.fn((c: unknown) => ({ _op: "desc", c })),
      sql: Object.assign((parts: TemplateStringsArray, ...vals: unknown[]) => ({ _op: "sql", parts, vals }), {}),
    }));
    vi.doMock("@/lib/shared/logger", () => ({ cloudLog: { error: vi.fn(), info: vi.fn() } }));

    const mod = await import("@/server/routes/api/cloud/files/list/route");
    GET = mod.GET;
  }

  function req(params: Record<string, string> = {}): Request {
    const u = new URL("http://localhost/api/cloud/files/list");
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    return new Request(u.toString());
  }

  async function authOk() {
    const { auth, currentUser } = await import("@/server/compat/clerk");
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ userId: "u1" });
    (currentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ emailAddresses: [{ emailAddress: "a@b.com" }] });
  }

  it("returns 401 when signed out", async () => {
    await setup({});
    const { auth, currentUser } = await import("@/server/compat/clerk");
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ userId: null });
    (currentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("returns folders + files, strips the user prefix, and reports totalItems", async () => {
    await setup({
      folders: [
        { path: "DesiSolo/", name: "DesiSolo", createdAt: new Date("2024-01-01") },
        { path: "maskG/", name: "maskG", createdAt: new Date("2024-01-02") },
      ],
      files: [
        { id: "f1", fileKey: "users/u1/notes.txt", fileName: "notes.txt", fileSize: 5, mimeType: "text/plain", thumbnailKey: null, isStarred: false, createdAt: new Date("2024-01-01"), updatedAt: new Date("2024-01-01") },
        { id: "f2", fileKey: "users/u1/photo.jpg", fileName: "photo.jpg", fileSize: 10, mimeType: "image/jpeg", thumbnailKey: "cf-thumbnail:personal/u1/f2/0123456789abcdef.webp", isStarred: true, createdAt: new Date("2024-01-02"), updatedAt: new Date("2024-01-03") },
      ],
      totalItems: 2,
    });
    await authOk();
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.path).toBe("");
    expect(body.folders.map((f: { path: string }) => f.path)).toEqual(["DesiSolo/", "maskG/"]);
    expect(body.files.map((f: { key: string }) => f.key)).toEqual(["notes.txt", "photo.jpg"]);
    const photo = body.files.find((f: { key: string }) => f.key === "photo.jpg");
    expect(photo).toMatchObject({ hasThumbnail: true, isStarred: true, mimeType: "image/jpeg" });
    expect(body.pagination).toMatchObject({ offset: 0, totalItems: 2, hasMore: false });
    expect(body).toMatchObject({ usage: 42, limit: 1000, plan: "free", sort: "name", order: "asc" });
  });

  it("reports hasMore=true when offset+returned < total", async () => {
    await setup({
      files: Array.from({ length: 5 }, (_, i) => ({
        id: `id${i}`,
        fileKey: `users/u1/f${i}.txt`,
        fileName: `f${i}.txt`,
        fileSize: 1,
        mimeType: null,
        thumbnailKey: null,
        isStarred: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      totalItems: 50,
    });
    await authOk();
    const res = await GET(req({ limit: "5", offset: "0" }));
    const body = await res.json();
    expect(body.pagination).toMatchObject({ offset: 0, limit: 5, totalItems: 50, hasMore: true });
  });

  it("echoes the requested sort/order (size, desc)", async () => {
    await setup({ files: [], totalItems: 0 });
    await authOk();
    const res = await GET(req({ sort: "size", order: "desc" }));
    const body = await res.json();
    expect(body).toMatchObject({ sort: "size", order: "desc" });
  });

  it("starred view returns no folders (flat, cross-folder)", async () => {
    await setup({
      // Folders are provided but must NOT be queried/returned in the starred view.
      folders: [{ path: "maskG/", name: "maskG", createdAt: new Date() }],
      files: [
        { id: "s1", fileKey: "users/u1/maskG/a.mp4", fileName: "maskG/a.mp4", fileSize: 1, mimeType: null, thumbnailKey: null, isStarred: true, createdAt: new Date(), updatedAt: new Date() },
      ],
      totalItems: 1,
    });
    await authOk();
    const res = await GET(req({ starred: "1" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.folders).toEqual([]);
    expect(body.files.map((f: { key: string }) => f.key)).toEqual(["maskG/a.mp4"]);
  });

  it("recent view forces modified-desc, no folders, single capped page", async () => {
    await setup({
      folders: [{ path: "maskG/", name: "maskG", createdAt: new Date() }],
      files: Array.from({ length: 3 }, (_, i) => ({
        id: `r${i}`,
        fileKey: `users/u1/folder${i}/f${i}.txt`,
        fileName: `folder${i}/f${i}.txt`,
        fileSize: 1,
        mimeType: null,
        thumbnailKey: null,
        isStarred: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    });
    await authOk();
    const res = await GET(req({ recent: "1", sort: "name", order: "asc", offset: "40" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.folders).toEqual([]);
    // Sort is locked to modified-desc and offset is ignored (capped window).
    expect(body).toMatchObject({ sort: "modified", order: "desc" });
    expect(body.pagination).toMatchObject({ offset: 0, hasMore: false });
    // totalItems for recent is the returned count (the capped window), not a global count.
    expect(body.pagination.totalItems).toBe(3);
  });

  it("sanitizes the path parameter (drops .. segments)", async () => {
    await setup({});
    await authOk();
    const res = await GET(req({ path: "../../etc/maskG//" }));
    const body = await res.json();
    expect(body.path).toBe("etc/maskG/");
  });

  it("falls back to defaults for invalid sort / order / limit / offset", async () => {
    await setup({});
    await authOk();
    const res = await GET(req({ sort: "weird", order: "sideways", limit: "abc", offset: "-5" }));
    const body = await res.json();
    expect(body.sort).toBe("name");
    expect(body.order).toBe("asc");
    expect(body.pagination.offset).toBe(0);
  });

  it("returns 500 on DB error", async () => {
    vi.resetModules();
    vi.doMock("@/server/compat/clerk", () => ({ auth: vi.fn(), currentUser: vi.fn() }));
    vi.doMock("@/lib/shared/db-service", () => ({ dbService: { getUser: vi.fn().mockRejectedValue(new Error("db down")) } }));
    vi.doMock("@/lib/payments/plans", () => ({ getPlanLimits: vi.fn(), formatBytes: vi.fn() }));
    vi.doMock("@/lib/shared/db", () => ({ db: { select: vi.fn() } }));
    vi.doMock("@/db/schema", () => ({ cloudFiles: {}, cloudFolders: {} }));
    vi.doMock("drizzle-orm", () => ({ and: vi.fn(), eq: vi.fn(), asc: vi.fn(), desc: vi.fn(), sql: vi.fn() }));
    vi.doMock("@/lib/shared/logger", () => ({ cloudLog: { error: vi.fn(), info: vi.fn() } }));

    const { auth, currentUser } = await import("@/server/compat/clerk");
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ userId: "u1" });
    (currentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ emailAddresses: [{ emailAddress: "a@b.com" }] });
    const { GET } = await import("@/server/routes/api/cloud/files/list/route");
    const res = await GET(req());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("db down");
  });
});
