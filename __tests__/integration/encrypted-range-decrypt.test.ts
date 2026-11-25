import { describe, it, expect } from "vitest";
import { Readable } from "stream";
import {
  encryptBufferChunked,
  encryptChunkForMultipart,
  createDecryptStream,
  DEFAULT_CHUNK_SIZE,
  HEADER_SIZE,
  IV_LENGTH,
  AUTH_TAG_LENGTH,
} from "@/lib/cloud/encryption-service";
import { getEncryptedRangeForPlaintextRange } from "@/lib/cloud/encrypted-range";

/**
 * Integration test: This simulates the actual production flow:
 * 1. Encrypt real data (as upload would)
 * 2. Calculate encrypted byte range for a plaintext range request
 * 3. Slice the encrypted blob to simulate R2 partial fetch
 * 4. Decrypt the partial fetch
 * 5. Extract the requested plaintext slice
 * 6. Verify it matches the original data
 *
 * This is the exact flow in app/api/cloud/view/route.ts
 */

async function decryptStreamToBuffer(
  encrypted: Buffer,
  hasHeader: boolean
): Promise<Buffer> {
  const decryptStream = createDecryptStream(hasHeader);
  const chunks: Buffer[] = [];
  const readable = Readable.from([encrypted]);

  for await (const chunk of readable.pipe(decryptStream)) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

describe("encrypted range request integration (production flow)", () => {
  it("chunked_gcm: range within first chunk returns correct plaintext", async () => {
    // 1. Create test data and encrypt (simulates upload)
    const plaintext = Buffer.alloc(1024, 0);
    for (let i = 0; i < plaintext.length; i++) {
      plaintext[i] = i % 256;
    }
    const encrypted = encryptBufferChunked(plaintext);

    // 2. Client requests bytes 100-199
    const rangeStart = 100;
    const rangeEnd = 199;
    const rangeResult = getEncryptedRangeForPlaintextRange(
      rangeStart,
      rangeEnd,
      "chunked_gcm"
    );
    expect(rangeResult).not.toBeNull();

    // 3. Simulate R2 partial fetch by slicing encrypted blob
    const r2Match = rangeResult!.r2Range.match(/bytes=(\d+)-(\d+)/);
    const r2Start = parseInt(r2Match![1]);
    const r2End = parseInt(r2Match![2]);
    const partialEncrypted = encrypted.subarray(r2Start, r2End + 1);

    // 4. Decrypt (hasHeader=false because we skipped header in range calc)
    const decryptedChunks = await decryptStreamToBuffer(partialEncrypted, false);

    // 5. Slice out the requested plaintext range
    const result = decryptedChunks.subarray(
      rangeResult!.plaintextStartOffset,
      rangeResult!.plaintextStartOffset + rangeResult!.plaintextLength
    );

    // 6. Verify
    const expected = plaintext.subarray(rangeStart, rangeEnd + 1);
    expect(result.length).toBe(expected.length);
    expect(result.equals(expected)).toBe(true);
  });

  it("chunked_gcm_mp: range within first chunk returns correct plaintext", async () => {
    const plaintext = Buffer.alloc(2048, 0);
    for (let i = 0; i < plaintext.length; i++) {
      plaintext[i] = (i * 7) % 256;
    }
    const encrypted = encryptChunkForMultipart(plaintext);

    const rangeStart = 500;
    const rangeEnd = 999;
    const rangeResult = getEncryptedRangeForPlaintextRange(
      rangeStart,
      rangeEnd,
      "chunked_gcm_mp"
    );
    expect(rangeResult).not.toBeNull();

    const r2Match = rangeResult!.r2Range.match(/bytes=(\d+)-(\d+)/);
    const r2Start = parseInt(r2Match![1]);
    const r2End = Math.min(parseInt(r2Match![2]), encrypted.length - 1);
    const partialEncrypted = encrypted.subarray(r2Start, r2End + 1);

    const decryptedChunks = await decryptStreamToBuffer(partialEncrypted, false);
    const result = decryptedChunks.subarray(
      rangeResult!.plaintextStartOffset,
      rangeResult!.plaintextStartOffset + rangeResult!.plaintextLength
    );

    const expected = plaintext.subarray(rangeStart, rangeEnd + 1);
    expect(result.length).toBe(expected.length);
    expect(result.equals(expected)).toBe(true);
  });

  it("chunked_gcm: cross-chunk range returns correct plaintext", async () => {
    // Create data spanning 2 chunks
    const dataSize = DEFAULT_CHUNK_SIZE + 4096;
    const plaintext = Buffer.alloc(dataSize, 0);
    for (let i = 0; i < plaintext.length; i++) {
      plaintext[i] = (i * 13) % 256;
    }
    const encrypted = encryptBufferChunked(plaintext);

    // Request range crossing the chunk boundary
    const rangeStart = DEFAULT_CHUNK_SIZE - 100;
    const rangeEnd = DEFAULT_CHUNK_SIZE + 100;
    const rangeResult = getEncryptedRangeForPlaintextRange(
      rangeStart,
      rangeEnd,
      "chunked_gcm"
    );
    expect(rangeResult).not.toBeNull();
    expect(rangeResult!.chunkCount).toBe(2);

    const r2Match = rangeResult!.r2Range.match(/bytes=(\d+)-(\d+)/);
    const r2Start = parseInt(r2Match![1]);
    const r2End = Math.min(parseInt(r2Match![2]), encrypted.length - 1);
    const partialEncrypted = encrypted.subarray(r2Start, r2End + 1);

    const decryptedChunks = await decryptStreamToBuffer(partialEncrypted, false);
    const result = decryptedChunks.subarray(
      rangeResult!.plaintextStartOffset,
      rangeResult!.plaintextStartOffset + rangeResult!.plaintextLength
    );

    const expected = plaintext.subarray(rangeStart, rangeEnd + 1);
    expect(result.length).toBe(expected.length);
    expect(result.equals(expected)).toBe(true);
  });

  it("full file decrypt matches original (no range)", async () => {
    const plaintext = Buffer.from(
      "This is a complete file that should round-trip through encrypt and stream decrypt"
    );
    const encrypted = encryptBufferChunked(plaintext);

    const decrypted = await decryptStreamToBuffer(encrypted, true);
    expect(decrypted.equals(plaintext)).toBe(true);
  });
});

describe("encryption tamper detection", () => {
  it("detects tampered ciphertext (flipped bit)", async () => {
    const plaintext = Buffer.from("Sensitive data that must not be corrupted");
    const encrypted = encryptBufferChunked(plaintext);

    // Tamper with a byte in the ciphertext (after header + IV)
    const tamperIndex = HEADER_SIZE + IV_LENGTH + 5;
    encrypted[tamperIndex] ^= 0xff;

    // Decryption should throw due to auth tag mismatch
    await expect(async () => {
      await decryptStreamToBuffer(encrypted, true);
    }).rejects.toThrow();
  });

  it("detects tampered auth tag", async () => {
    const plaintext = Buffer.from("More sensitive data");
    const encrypted = encryptBufferChunked(plaintext);

    // Tamper with the last byte (auth tag area)
    encrypted[encrypted.length - 1] ^= 0xff;

    await expect(async () => {
      await decryptStreamToBuffer(encrypted, true);
    }).rejects.toThrow();
  });

  it("detects truncated encrypted data", async () => {
    const plaintext = Buffer.from("Data that will be truncated");
    const encrypted = encryptBufferChunked(plaintext);

    // Truncate by removing last 10 bytes
    const truncated = encrypted.subarray(0, encrypted.length - 10);

    await expect(async () => {
      await decryptStreamToBuffer(truncated, true);
    }).rejects.toThrow();
  });
});

describe("encryption with wrong key", () => {
  it("cannot decrypt data encrypted with different key", async () => {
    const plaintext = Buffer.from("Secret message");
    const encrypted = encryptBufferChunked(plaintext);

    // Temporarily change the encryption key
    const originalKey = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = "fedcba9876543210fedcba9876543210"; // different key

    await expect(async () => {
      await decryptStreamToBuffer(encrypted, true);
    }).rejects.toThrow();

    // Restore
    process.env.ENCRYPTION_KEY = originalKey;
  });
});
