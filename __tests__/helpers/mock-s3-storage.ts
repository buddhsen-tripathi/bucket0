/**
 * In-Memory S3/R2 Mock Storage
 *
 * Simulates Cloudflare R2 / AWS S3 for E2E testing.
 * Stores actual bytes so encryption/decryption round-trips can be verified.
 */

import { Readable } from "stream";
import { vi } from "vitest";

interface StoredObject {
  body: Buffer;
  contentType: string;
  lastModified: Date;
}

class MockS3Storage {
  private storage: Map<string, StoredObject> = new Map();

  clear() {
    this.storage.clear();
  }

  // Store a file
  put(key: string, body: Buffer, contentType: string) {
    this.storage.set(key, {
      body,
      contentType,
      lastModified: new Date(),
    });
  }

  // Get a file (optionally with range)
  get(key: string, range?: string): { Body: Readable; ContentLength: number; ContentType: string } | null {
    const obj = this.storage.get(key);
    if (!obj) return null;

    let body = obj.body;
    let contentLength = body.length;

    // Handle range requests (e.g., "bytes=0-99")
    if (range) {
      const match = range.match(/bytes=(\d+)-(\d*)/);
      if (match) {
        const start = parseInt(match[1], 10);
        const end = match[2] ? parseInt(match[2], 10) : body.length - 1;
        body = body.subarray(start, end + 1);
        contentLength = body.length;
      }
    }

    return {
      Body: Readable.from([body]),
      ContentLength: contentLength,
      ContentType: obj.contentType,
    };
  }

  // Check if file exists
  has(key: string): boolean {
    return this.storage.has(key);
  }

  // Get raw buffer (for test assertions)
  getRawBuffer(key: string): Buffer | null {
    return this.storage.get(key)?.body ?? null;
  }

  // Delete a file
  delete(key: string) {
    this.storage.delete(key);
  }

  // List files with prefix
  list(prefix: string): Array<{ Key: string; Size: number; LastModified: Date }> {
    const results: Array<{ Key: string; Size: number; LastModified: Date }> = [];
    for (const [key, obj] of this.storage) {
      if (key.startsWith(prefix)) {
        results.push({
          Key: key,
          Size: obj.body.length,
          LastModified: obj.lastModified,
        });
      }
    }
    return results;
  }
}

// Singleton for tests
export const mockS3Storage = new MockS3Storage();

/**
 * Creates mock functions for SystemStorageService methods
 * that use the in-memory storage
 */
export function createMockSystemStorage() {
  return {
    uploadFile: vi.fn(async (userId: string, fileName: string, body: Buffer, contentType: string) => {
      const key = `users/${userId}/${fileName}`;
      mockS3Storage.put(key, body, contentType);
      return { ETag: `"mock-etag-${Date.now()}"` };
    }),

    uploadFileStream: vi.fn(async (
      userId: string,
      fileName: string,
      body: Readable | ReadableStream,
      contentType: string
    ) => {
      const key = `users/${userId}/${fileName}`;

      // Convert stream to buffer
      const chunks: Buffer[] = [];
      const nodeStream = body instanceof Readable
        ? body
        : Readable.fromWeb(body as import("stream/web").ReadableStream);

      for await (const chunk of nodeStream) {
        chunks.push(Buffer.from(chunk));
      }
      const buffer = Buffer.concat(chunks);

      mockS3Storage.put(key, buffer, contentType);
      return { ETag: `"mock-etag-${Date.now()}"` };
    }),

    getFileStream: vi.fn(async (userId: string, fileName: string, range?: string) => {
      const key = `users/${userId}/${fileName}`;
      const result = mockS3Storage.get(key, range);

      if (!result) {
        throw new Error(`NoSuchKey: ${key}`);
      }

      return {
        Body: {
          transformToWebStream: () => {
            // Convert Node Readable to Web ReadableStream
            const reader = result.Body;
            return new ReadableStream({
              async start(controller) {
                for await (const chunk of reader) {
                  controller.enqueue(chunk);
                }
                controller.close();
              },
            });
          },
        },
        ContentLength: result.ContentLength,
        ContentType: result.ContentType,
      };
    }),

    getFileSize: vi.fn(async (userId: string, fileName: string) => {
      const key = `users/${userId}/${fileName}`;
      const buffer = mockS3Storage.getRawBuffer(key);
      return buffer?.length ?? 0;
    }),

    deleteFile: vi.fn(async (userId: string, fileName: string) => {
      const key = `users/${userId}/${fileName}`;
      mockS3Storage.delete(key);
    }),

    listFiles: vi.fn(async (userId: string) => {
      const prefix = `users/${userId}/`;
      return mockS3Storage.list(prefix).map((item) => ({
        key: item.Key.replace(prefix, ""),
        size: item.Size,
        lastModified: item.LastModified,
        etag: `"mock-etag"`,
      }));
    }),

    // Team methods
    uploadTeamFile: vi.fn(async (teamId: string, fileName: string, body: Buffer, contentType: string) => {
      const key = `teams/${teamId}/${fileName}`;
      mockS3Storage.put(key, body, contentType);
      return { ETag: `"mock-etag-${Date.now()}"` };
    }),

    uploadTeamFileStream: vi.fn(async (
      teamId: string,
      fileName: string,
      body: Readable | ReadableStream,
      contentType: string
    ) => {
      const key = `teams/${teamId}/${fileName}`;

      const chunks: Buffer[] = [];
      const nodeStream = body instanceof Readable
        ? body
        : Readable.fromWeb(body as import("stream/web").ReadableStream);

      for await (const chunk of nodeStream) {
        chunks.push(Buffer.from(chunk));
      }
      const buffer = Buffer.concat(chunks);

      mockS3Storage.put(key, buffer, contentType);
      return { ETag: `"mock-etag-${Date.now()}"` };
    }),

    getTeamFileStream: vi.fn(async (teamId: string, fileName: string, range?: string) => {
      const key = `teams/${teamId}/${fileName}`;
      const result = mockS3Storage.get(key, range);

      if (!result) {
        throw new Error(`NoSuchKey: ${key}`);
      }

      return {
        Body: {
          transformToWebStream: () => {
            const reader = result.Body;
            return new ReadableStream({
              async start(controller) {
                for await (const chunk of reader) {
                  controller.enqueue(chunk);
                }
                controller.close();
              },
            });
          },
        },
        ContentLength: result.ContentLength,
        ContentType: result.ContentType,
      };
    }),
  };
}

/**
 * Creates mock for Clerk auth
 */
export function createMockAuth(userId: string | null = "user-bucket0-test") {
  return {
    auth: vi.fn().mockResolvedValue({ userId }),
    currentUser: vi.fn().mockResolvedValue(
      userId
        ? {
            id: userId,
            emailAddresses: [{ emailAddress: "test@example.com" }],
          }
        : null
    ),
  };
}

/**
 * Creates mock for database operations
 */
export function createMockDb() {
  const mockFileRecords = new Map<string, Record<string, unknown>>();

  return {
    mockFileRecords,

    db: {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(async () => {
              // Return empty by default, tests can override
              return [];
            }),
          }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue({}),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue({}),
        }),
      }),
    },

    // Helper to set up a file record for tests
    setFileRecord(fileKey: string, record: Record<string, unknown>) {
      mockFileRecords.set(fileKey, record);
    },

    // Create a mock that returns file records
    createSelectMock(records: Record<string, unknown>[]) {
      return vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(records),
          }),
        }),
      });
    },
  };
}
