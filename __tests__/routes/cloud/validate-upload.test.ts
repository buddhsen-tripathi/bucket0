import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "@/server/compat/next-server";

// Mock all external dependencies before importing the route
vi.mock("@/server/compat/clerk", () => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
}));

vi.mock("@/lib/shared/db-service", () => ({
  dbService: {
    getUser: vi.fn(),
    validateUploadAllowed: vi.fn(),
    getUserLimits: vi.fn(),
  },
}));

vi.mock("@/lib/shared/db", () => {
  const mockSelect = vi.fn().mockReturnThis();
  const mockFrom = vi.fn().mockReturnThis();
  const mockWhere = vi.fn().mockReturnThis();
  const mockLimit = vi.fn().mockResolvedValue([]);

  return {
    db: {
      select: mockSelect,
      from: mockFrom,
      where: mockWhere,
      limit: mockLimit,
    },
  };
});

vi.mock("@/db/schema", () => ({
  cloudFiles: {
    userId: "userId",
    fileKey: "fileKey",
    fileSize: "fileSize",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => args),
  and: vi.fn((...args: unknown[]) => args),
}));

vi.mock("@/lib/payments/plans", () => ({
  formatBytes: vi.fn((n: number) => `${n} bytes`),
}));

vi.mock("@/lib/cloud/upload-validation", () => ({
  sanitizeFilename: vi.fn((name: string) => name),
}));

describe("POST /api/cloud/validate-upload", () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    // Re-setup mocks after resetModules
    vi.doMock("@/server/compat/clerk", () => ({
      auth: vi.fn(),
      currentUser: vi.fn(),
    }));
    vi.doMock("@/lib/shared/db-service", () => ({
      dbService: {
        getUser: vi.fn(),
        validateUploadAllowed: vi.fn(),
        getUserLimits: vi.fn(),
      },
    }));
    vi.doMock("@/lib/shared/db", () => {
      const mockLimit = vi.fn().mockResolvedValue([]);
      return {
        db: {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: mockLimit,
              }),
            }),
          }),
        },
      };
    });
    vi.doMock("@/db/schema", () => ({
      cloudFiles: {
        userId: "userId",
        fileKey: "fileKey",
        fileSize: "fileSize",
      },
    }));
    vi.doMock("drizzle-orm", () => ({
      eq: vi.fn((...args: unknown[]) => args),
      and: vi.fn((...args: unknown[]) => args),
    }));
    vi.doMock("@/lib/payments/plans", () => ({
      formatBytes: vi.fn((n: number) => `${n} bytes`),
    }));
    vi.doMock("@/lib/cloud/upload-validation", () => ({
      sanitizeFilename: vi.fn((name: string) => name),
    }));

    const mod = await import("@/server/routes/api/cloud/validate-upload/route");
    POST = mod.POST;
  });

  function createRequest(body: Record<string, unknown>): NextRequest {
    return new NextRequest("http://localhost/api/cloud/validate-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("returns 401 when unauthorized", async () => {
    const { auth, currentUser } = await import("@/server/compat/clerk");
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      userId: null,
    });
    (currentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      null
    );

    const req = createRequest({ filename: "test.txt", size: 100 });
    const res = await POST(req);

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 400 for missing params", async () => {
    const { auth, currentUser } = await import("@/server/compat/clerk");
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      userId: "user-1",
    });
    (currentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      emailAddresses: [{ emailAddress: "test@test.com" }],
    });

    const req = createRequest({ filename: "" }); // missing size
    const res = await POST(req);

    expect(res.status).toBe(400);
  });

  it("new file returns isOverwrite: false", async () => {
    const { auth, currentUser } = await import("@/server/compat/clerk");
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      userId: "user-1",
    });
    (currentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      emailAddresses: [{ emailAddress: "test@test.com" }],
    });

    const { dbService } = await import("@/lib/shared/db-service");
    (dbService.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (
      dbService.validateUploadAllowed as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      allowed: true,
    });
    (dbService.getUserLimits as ReturnType<typeof vi.fn>).mockResolvedValue({
      plan: "free",
      storageUsage: 0,
      storageLimit: 1073741824,
      maxFileSizeBytes: 52428800,
    });

    // DB returns empty (no existing file)
    const { db } = await import("@/lib/shared/db");
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const req = createRequest({ filename: "test.txt", size: 1000 });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.allowed).toBe(true);
    expect(data.isOverwrite).toBe(false);
  });

  it("existing file returns isOverwrite: true", async () => {
    const { auth, currentUser } = await import("@/server/compat/clerk");
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      userId: "user-1",
    });
    (currentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      emailAddresses: [{ emailAddress: "test@test.com" }],
    });

    const { dbService } = await import("@/lib/shared/db-service");
    (dbService.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (
      dbService.validateUploadAllowed as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      allowed: true,
    });
    (dbService.getUserLimits as ReturnType<typeof vi.fn>).mockResolvedValue({
      plan: "free",
      storageUsage: 500,
      storageLimit: 1073741824,
      maxFileSizeBytes: 52428800,
    });

    // DB returns existing file
    const { db } = await import("@/lib/shared/db");
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ fileSize: 500 }]),
        }),
      }),
    });

    const req = createRequest({ filename: "existing.txt", size: 1000 });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.allowed).toBe(true);
    expect(data.isOverwrite).toBe(true);
  });

  it("over quota returns 402", async () => {
    const { auth, currentUser } = await import("@/server/compat/clerk");
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      userId: "user-1",
    });
    (currentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      emailAddresses: [{ emailAddress: "test@test.com" }],
    });

    const { dbService } = await import("@/lib/shared/db-service");
    (dbService.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (
      dbService.validateUploadAllowed as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      allowed: false,
      error: "Storage limit exceeded",
    });
    (dbService.getUserLimits as ReturnType<typeof vi.fn>).mockResolvedValue({
      plan: "free",
      storageUsage: 1073741824,
      storageLimit: 1073741824,
      maxFileSizeBytes: 52428800,
    });

    const { db } = await import("@/lib/shared/db");
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const req = createRequest({ filename: "big.zip", size: 999999999 });
    const res = await POST(req);

    expect(res.status).toBe(402);
    const data = await res.json();
    expect(data.allowed).toBe(false);
  });
});
