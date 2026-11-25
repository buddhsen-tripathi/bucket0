import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "@/server/compat/next-server";

// Mock all external dependencies
vi.mock("@/server/compat/clerk", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/shared/db", () => {
  return {
    db: {
      select: vi.fn(),
    },
  };
});

vi.mock("@/db/schema", () => ({
  cloudFiles: {
    userId: "userId",
    fileKey: "fileKey",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => args),
  and: vi.fn((...args: unknown[]) => args),
}));

vi.mock("@/lib/cloud/system-service", () => ({
  systemStorage: {
    getFileStream: vi.fn(),
  },
}));

vi.mock("@/lib/cloud/encryption-service", () => ({
  createDecryptStream: vi.fn(),
}));

vi.mock("@/lib/shared/http-utils", () => ({
  parseRange: vi.fn().mockReturnValue(null),
  getContentTypeFromExtension: vi.fn().mockReturnValue("application/octet-stream"),
}));

vi.mock("@/lib/cloud/encrypted-range", () => ({
  getEncryptedRangeForPlaintextRange: vi.fn().mockReturnValue(null),
}));

describe("GET /api/cloud/view", () => {
  let GET: (req: NextRequest) => Promise<Response>;

  const mockUpdatedAt = new Date("2024-01-01T00:00:00Z");

  beforeEach(async () => {
    vi.resetModules();

    vi.doMock("@/server/compat/clerk", () => ({
      auth: vi.fn(),
    }));

    vi.doMock("@/lib/shared/db", () => ({
      db: {
        select: vi.fn(),
      },
    }));

    vi.doMock("@/db/schema", () => ({
      cloudFiles: { userId: "userId", fileKey: "fileKey" },
    }));

    vi.doMock("drizzle-orm", () => ({
      eq: vi.fn((...args: unknown[]) => args),
      and: vi.fn((...args: unknown[]) => args),
    }));

    vi.doMock("@/lib/cloud/system-service", () => ({
      systemStorage: { getFileStream: vi.fn() },
    }));

    vi.doMock("@/lib/cloud/encryption-service", () => ({
          createDecryptStream: vi.fn(),
    }));

    vi.doMock("@/lib/shared/http-utils", () => ({
      parseRange: vi.fn().mockReturnValue(null),
      getContentTypeFromExtension: vi.fn().mockReturnValue("application/octet-stream"),
    }));

    vi.doMock("@/lib/cloud/encrypted-range", () => ({
      getEncryptedRangeForPlaintextRange: vi.fn().mockReturnValue(null),
    }));

    const mod = await import("@/server/routes/api/cloud/view/route");
    GET = mod.GET;
  });

  function createRequest(
    params: Record<string, string>,
    headers?: Record<string, string>
  ): NextRequest {
    const url = new URL("http://localhost/api/cloud/view");
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
    return new NextRequest(url.toString(), { headers });
  }

  function setupAuthAndFileRecord(overrides?: {
    encrypted?: boolean;
    encryptionMode?: string;
  }) {
    return async () => {
      const { auth } = await import("@/server/compat/clerk");
      (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        userId: "user-1",
      });

      const { db } = await import("@/lib/shared/db");
      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                mimeType: "image/jpeg",
                fileSize: 1000,
                encrypted: overrides?.encrypted ?? false,
                encryptionMode: overrides?.encryptionMode ?? "none",
                updatedAt: mockUpdatedAt,
              },
            ]),
          }),
        }),
      });
    };
  }

  it("returns 401 when unauthorized", async () => {
    const { auth } = await import("@/server/compat/clerk");
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      userId: null,
    });

    const req = createRequest({ key: "photo.jpg" });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when key is missing", async () => {
    const { auth } = await import("@/server/compat/clerk");
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      userId: "user-1",
    });

    const req = createRequest({});
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns 304 when If-None-Match matches ETag", async () => {
    await setupAuthAndFileRecord()();

    const etag = `"${Buffer.from(`photo.jpg:${mockUpdatedAt.getTime()}`).toString("base64url")}"`;

    const { systemStorage } = await import("@/lib/cloud/system-service");
    const mockBody = {
      transformToWebStream: () =>
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array([1, 2, 3]));
            controller.close();
          },
        }),
    };
    (
      systemStorage.getFileStream as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ Body: mockBody });

    const req = createRequest(
      { key: "photo.jpg" },
      { "if-none-match": etag }
    );
    const res = await GET(req);
    expect(res.status).toBe(304);
  });

  it("returns 304 when If-Modified-Since >= updatedAt", async () => {
    await setupAuthAndFileRecord()();

    // Use a date later than updatedAt
    const futureDate = new Date("2025-01-01T00:00:00Z").toUTCString();

    const req = createRequest(
      { key: "photo.jpg" },
      { "if-modified-since": futureDate }
    );
    const res = await GET(req);
    expect(res.status).toBe(304);
  });

  it("returns 200 with ETag and Last-Modified headers for unencrypted file", async () => {
    await setupAuthAndFileRecord({ encrypted: false, encryptionMode: "none" })();

    const { systemStorage } = await import("@/lib/cloud/system-service");
    const mockBody = {
      transformToWebStream: () =>
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array([1, 2, 3]));
            controller.close();
          },
        }),
    };
    (
      systemStorage.getFileStream as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ Body: mockBody });

    const req = createRequest({ key: "photo.jpg" });
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("ETag")).toBeTruthy();
    expect(res.headers.get("Last-Modified")).toBeTruthy();
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
  });
});
