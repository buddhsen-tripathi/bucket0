/**
 * E2E Tests: Upload → Storage → View Round-Trip
 *
 * These tests verify the complete flow:
 * 1. Upload a file (goes through encryption)
 * 2. Store encrypted bytes in mock R2
 * 3. View/download the file (decrypts on the fly)
 * 4. Verify content matches original
 *
 * This simulates the real production flow, only mocking:
 * - R2/S3 storage (in-memory)
 * - Clerk auth
 * - Database
 *
 * Encryption, streaming, and range requests are all REAL.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { Readable } from "stream";
import {
  mockS3Storage,
  createMockSystemStorage,
  createMockAuth,
  createMockDb,
} from "../helpers/mock-s3-storage";
import {
  encryptBufferChunked,
  createEncryptStream,
  createDecryptStream,
  DEFAULT_CHUNK_SIZE,
} from "@/lib/cloud/encryption-service";
import { getEncryptedRangeForPlaintextRange } from "@/lib/cloud/encrypted-range";

// Test user - consistent across all E2E tests
const TEST_USER_ID = "user-bucket0-test";

describe("E2E: Upload → View Round-Trip", () => {
  let mockStorage: ReturnType<typeof createMockSystemStorage>;

  beforeEach(() => {
    // Clear storage between tests
    mockS3Storage.clear();
    mockStorage = createMockSystemStorage();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Small file uploads (buffered path)", () => {
    it("encrypts file on upload and decrypts correctly on view", async () => {
      // 1. Original file content
      const originalContent = "Hello, this is a test file for E2E verification!";
      const originalBuffer = Buffer.from(originalContent);
      const fileName = "test-doc.txt";

      // 2. Encrypt and upload (simulates upload route)
      const encrypted = encryptBufferChunked(originalBuffer);
      await mockStorage.uploadFile(TEST_USER_ID, fileName, encrypted, "text/plain");

      // 3. Verify file is stored in mock R2
      expect(mockS3Storage.has(`users/${TEST_USER_ID}/${fileName}`)).toBe(true);

      // 4. Verify stored content is encrypted (not plaintext)
      const storedBuffer = mockS3Storage.getRawBuffer(`users/${TEST_USER_ID}/${fileName}`);
      expect(storedBuffer).not.toBeNull();
      expect(storedBuffer!.toString()).not.toContain(originalContent);
      expect(storedBuffer!.length).toBeGreaterThan(originalBuffer.length); // Encrypted is larger

      // 5. Fetch and decrypt (simulates view route)
      const response = await mockStorage.getFileStream(TEST_USER_ID, fileName);
      const fetchedStream = response.Body.transformToWebStream();
      const nodeStream = Readable.fromWeb(fetchedStream as import("stream/web").ReadableStream);

      // 6. Decrypt
      const decryptStream = createDecryptStream(true); // has header
      const decryptedStream = nodeStream.pipe(decryptStream);

      const chunks: Buffer[] = [];
      for await (const chunk of decryptedStream) {
        chunks.push(Buffer.from(chunk));
      }
      const decryptedBuffer = Buffer.concat(chunks);

      // 7. Verify decrypted content matches original
      expect(decryptedBuffer.toString()).toBe(originalContent);
    });

    it("handles binary files correctly", async () => {
      // Create binary content with all byte values
      const binaryContent = Buffer.alloc(256);
      for (let i = 0; i < 256; i++) {
        binaryContent[i] = i;
      }
      const fileName = "binary-test.bin";

      // Encrypt and upload
      const encrypted = encryptBufferChunked(binaryContent);
      await mockStorage.uploadFile(TEST_USER_ID, fileName, encrypted, "application/octet-stream");

      // Fetch and decrypt
      const response = await mockStorage.getFileStream(TEST_USER_ID, fileName);
      const fetchedStream = response.Body.transformToWebStream();
      const nodeStream = Readable.fromWeb(fetchedStream as import("stream/web").ReadableStream);
      const decryptStream = createDecryptStream(true);
      const decryptedStream = nodeStream.pipe(decryptStream);

      const chunks: Buffer[] = [];
      for await (const chunk of decryptedStream) {
        chunks.push(Buffer.from(chunk));
      }
      const decryptedBuffer = Buffer.concat(chunks);

      // Verify binary content matches exactly
      expect(decryptedBuffer.equals(binaryContent)).toBe(true);
    });
  });

  describe("Large file uploads (streaming path)", () => {
    it("encrypts large file via streaming and decrypts correctly", async () => {
      // Create a file larger than one chunk
      const chunkCount = 2;
      const largeContent = Buffer.alloc(DEFAULT_CHUNK_SIZE * chunkCount + 1024);
      for (let i = 0; i < largeContent.length; i++) {
        largeContent[i] = (i * 7) % 256;
      }
      const fileName = "large-file.bin";

      // Simulate streaming upload with encryption
      const sourceStream = Readable.from([largeContent]);
      const encryptStream = createEncryptStream();
      const encryptedStream = sourceStream.pipe(encryptStream);

      await mockStorage.uploadFileStream(
        TEST_USER_ID,
        fileName,
        encryptedStream,
        "application/octet-stream"
      );

      // Verify stored
      expect(mockS3Storage.has(`users/${TEST_USER_ID}/${fileName}`)).toBe(true);

      // Fetch and decrypt
      const response = await mockStorage.getFileStream(TEST_USER_ID, fileName);
      const fetchedStream = response.Body.transformToWebStream();
      const nodeStream = Readable.fromWeb(fetchedStream as import("stream/web").ReadableStream);
      const decryptStream = createDecryptStream(true);
      const decryptedStream = nodeStream.pipe(decryptStream);

      const chunks: Buffer[] = [];
      for await (const chunk of decryptedStream) {
        chunks.push(Buffer.from(chunk));
      }
      const decryptedBuffer = Buffer.concat(chunks);

      // Verify content matches
      expect(decryptedBuffer.length).toBe(largeContent.length);
      expect(decryptedBuffer.equals(largeContent)).toBe(true);
    });
  });

  describe("Range requests on encrypted files", () => {
    it("returns correct plaintext slice for range request within single chunk", async () => {
      // Create content
      const content = Buffer.alloc(4096);
      for (let i = 0; i < content.length; i++) {
        content[i] = i % 256;
      }
      const fileName = "range-test.bin";

      // Encrypt and store
      const encrypted = encryptBufferChunked(content);
      await mockStorage.uploadFile(TEST_USER_ID, fileName, encrypted, "application/octet-stream");

      // Request range (bytes 100-199)
      const rangeStart = 100;
      const rangeEnd = 199;

      // Calculate encrypted range
      const rangeResult = getEncryptedRangeForPlaintextRange(rangeStart, rangeEnd, "chunked_gcm");
      expect(rangeResult).not.toBeNull();

      // Fetch partial encrypted data
      const storedBuffer = mockS3Storage.getRawBuffer(`users/${TEST_USER_ID}/${fileName}`)!;
      const r2Match = rangeResult!.r2Range.match(/bytes=(\d+)-(\d+)/);
      const r2Start = parseInt(r2Match![1]);
      const r2End = Math.min(parseInt(r2Match![2]), storedBuffer.length - 1);
      const partialEncrypted = storedBuffer.subarray(r2Start, r2End + 1);

      // Decrypt partial (no header since we skipped it in range calculation)
      const decryptStream = createDecryptStream(false);
      const sourceStream = Readable.from([partialEncrypted]);
      const decryptedStream = sourceStream.pipe(decryptStream);

      const chunks: Buffer[] = [];
      for await (const chunk of decryptedStream) {
        chunks.push(Buffer.from(chunk));
      }
      const decryptedBuffer = Buffer.concat(chunks);

      // Extract the requested plaintext range
      const result = decryptedBuffer.subarray(
        rangeResult!.plaintextStartOffset,
        rangeResult!.plaintextStartOffset + rangeResult!.plaintextLength
      );

      // Verify matches original range
      const expected = content.subarray(rangeStart, rangeEnd + 1);
      expect(result.length).toBe(expected.length);
      expect(result.equals(expected)).toBe(true);
    });

    it("returns correct plaintext slice for cross-chunk range request", async () => {
      // Create content spanning 2 chunks
      const contentSize = DEFAULT_CHUNK_SIZE + 4096;
      const content = Buffer.alloc(contentSize);
      for (let i = 0; i < content.length; i++) {
        content[i] = (i * 13) % 256;
      }
      const fileName = "cross-chunk-range.bin";

      // Encrypt and store
      const encrypted = encryptBufferChunked(content);
      await mockStorage.uploadFile(TEST_USER_ID, fileName, encrypted, "application/octet-stream");

      // Request range crossing chunk boundary
      const rangeStart = DEFAULT_CHUNK_SIZE - 100;
      const rangeEnd = DEFAULT_CHUNK_SIZE + 100;

      // Calculate encrypted range
      const rangeResult = getEncryptedRangeForPlaintextRange(rangeStart, rangeEnd, "chunked_gcm");
      expect(rangeResult).not.toBeNull();
      expect(rangeResult!.chunkCount).toBe(2);

      // Fetch partial encrypted data
      const storedBuffer = mockS3Storage.getRawBuffer(`users/${TEST_USER_ID}/${fileName}`)!;
      const r2Match = rangeResult!.r2Range.match(/bytes=(\d+)-(\d+)/);
      const r2Start = parseInt(r2Match![1]);
      const r2End = Math.min(parseInt(r2Match![2]), storedBuffer.length - 1);
      const partialEncrypted = storedBuffer.subarray(r2Start, r2End + 1);

      // Decrypt
      const decryptStream = createDecryptStream(false);
      const sourceStream = Readable.from([partialEncrypted]);
      const decryptedStream = sourceStream.pipe(decryptStream);

      const chunks: Buffer[] = [];
      for await (const chunk of decryptedStream) {
        chunks.push(Buffer.from(chunk));
      }
      const decryptedBuffer = Buffer.concat(chunks);

      // Extract requested range
      const result = decryptedBuffer.subarray(
        rangeResult!.plaintextStartOffset,
        rangeResult!.plaintextStartOffset + rangeResult!.plaintextLength
      );

      // Verify matches original
      const expected = content.subarray(rangeStart, rangeEnd + 1);
      expect(result.length).toBe(expected.length);
      expect(result.equals(expected)).toBe(true);
    });
  });

  describe("Unencrypted file uploads", () => {
    it("stores and retrieves unencrypted files correctly", async () => {
      // Some file types skip encryption (e.g., archives)
      const content = Buffer.from("Unencrypted content for .zip file");
      const fileName = "archive.zip";

      // Store without encryption
      await mockStorage.uploadFile(TEST_USER_ID, fileName, content, "application/zip");

      // Verify stored content is NOT encrypted (same as original)
      const storedBuffer = mockS3Storage.getRawBuffer(`users/${TEST_USER_ID}/${fileName}`);
      expect(storedBuffer).not.toBeNull();
      expect(storedBuffer!.equals(content)).toBe(true);

      // Fetch directly (no decryption needed)
      const response = await mockStorage.getFileStream(TEST_USER_ID, fileName);
      const fetchedStream = response.Body.transformToWebStream();
      const nodeStream = Readable.fromWeb(fetchedStream as import("stream/web").ReadableStream);

      const chunks: Buffer[] = [];
      for await (const chunk of nodeStream) {
        chunks.push(Buffer.from(chunk));
      }
      const fetchedBuffer = Buffer.concat(chunks);

      expect(fetchedBuffer.equals(content)).toBe(true);
    });

    it("handles range requests on unencrypted files correctly", async () => {
      const content = Buffer.alloc(1000);
      for (let i = 0; i < content.length; i++) {
        content[i] = i % 256;
      }
      const fileName = "unencrypted.bin";

      // Store without encryption
      await mockStorage.uploadFile(TEST_USER_ID, fileName, content, "application/octet-stream");

      // Fetch with range
      const response = await mockStorage.getFileStream(TEST_USER_ID, fileName, "bytes=100-199");
      const fetchedStream = response.Body.transformToWebStream();
      const nodeStream = Readable.fromWeb(fetchedStream as import("stream/web").ReadableStream);

      const chunks: Buffer[] = [];
      for await (const chunk of nodeStream) {
        chunks.push(Buffer.from(chunk));
      }
      const fetchedBuffer = Buffer.concat(chunks);

      // Verify range
      const expected = content.subarray(100, 200);
      expect(fetchedBuffer.length).toBe(expected.length);
      expect(fetchedBuffer.equals(expected)).toBe(true);
    });
  });

  describe("Error handling", () => {
    it("fails to decrypt with wrong key", async () => {
      const content = Buffer.from("Secret data");
      const fileName = "secret.txt";

      // Encrypt with current key
      const encrypted = encryptBufferChunked(content);
      await mockStorage.uploadFile(TEST_USER_ID, fileName, encrypted, "text/plain");

      // Change key
      const originalKey = process.env.ENCRYPTION_KEY;
      process.env.ENCRYPTION_KEY = "fedcba9876543210fedcba9876543210";

      try {
        // Try to decrypt
        const response = await mockStorage.getFileStream(TEST_USER_ID, fileName);
        const fetchedStream = response.Body.transformToWebStream();
        const nodeStream = Readable.fromWeb(fetchedStream as import("stream/web").ReadableStream);
        const decryptStream = createDecryptStream(true);
        const decryptedStream = nodeStream.pipe(decryptStream);

        await expect(async () => {
          const chunks: Buffer[] = [];
          for await (const chunk of decryptedStream) {
            chunks.push(Buffer.from(chunk));
          }
        }).rejects.toThrow();
      } finally {
        // Restore key
        process.env.ENCRYPTION_KEY = originalKey;
      }
    });

    it("fails on tampered encrypted data", async () => {
      const content = Buffer.from("Original data that will be tampered");
      const fileName = "tampered.txt";

      // Encrypt and store
      const encrypted = encryptBufferChunked(content);
      await mockStorage.uploadFile(TEST_USER_ID, fileName, encrypted, "text/plain");

      // Tamper with stored data
      const storedBuffer = mockS3Storage.getRawBuffer(`users/${TEST_USER_ID}/${fileName}`)!;
      storedBuffer[storedBuffer.length - 5] ^= 0xff; // Flip a byte

      // Try to decrypt tampered data
      const response = await mockStorage.getFileStream(TEST_USER_ID, fileName);
      const fetchedStream = response.Body.transformToWebStream();
      const nodeStream = Readable.fromWeb(fetchedStream as import("stream/web").ReadableStream);
      const decryptStream = createDecryptStream(true);
      const decryptedStream = nodeStream.pipe(decryptStream);

      await expect(async () => {
        const chunks: Buffer[] = [];
        for await (const chunk of decryptedStream) {
          chunks.push(Buffer.from(chunk));
        }
      }).rejects.toThrow();
    });

    it("throws on non-existent file", async () => {
      await expect(
        mockStorage.getFileStream(TEST_USER_ID, "does-not-exist.txt")
      ).rejects.toThrow(/NoSuchKey/);
    });
  });

  describe("Multiple files", () => {
    it("handles multiple concurrent uploads correctly", async () => {
      const files = [
        { name: "file1.txt", content: "Content of file 1" },
        { name: "file2.txt", content: "Content of file 2" },
        { name: "file3.txt", content: "Content of file 3" },
      ];

      // Upload all files concurrently
      await Promise.all(
        files.map(async (file) => {
          const buffer = Buffer.from(file.content);
          const encrypted = encryptBufferChunked(buffer);
          await mockStorage.uploadFile(TEST_USER_ID, file.name, encrypted, "text/plain");
        })
      );

      // Verify all files stored
      for (const file of files) {
        expect(mockS3Storage.has(`users/${TEST_USER_ID}/${file.name}`)).toBe(true);
      }

      // Verify all files decrypt correctly
      for (const file of files) {
        const response = await mockStorage.getFileStream(TEST_USER_ID, file.name);
        const fetchedStream = response.Body.transformToWebStream();
        const nodeStream = Readable.fromWeb(fetchedStream as import("stream/web").ReadableStream);
        const decryptStream = createDecryptStream(true);
        const decryptedStream = nodeStream.pipe(decryptStream);

        const chunks: Buffer[] = [];
        for await (const chunk of decryptedStream) {
          chunks.push(Buffer.from(chunk));
        }
        const decryptedBuffer = Buffer.concat(chunks);

        expect(decryptedBuffer.toString()).toBe(file.content);
      }
    });
  });
});
