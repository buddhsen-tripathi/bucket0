import { describe, it, expect } from "vitest";
import { getEncryptedRangeForPlaintextRange } from "@/lib/cloud/encrypted-range";
import {
  DEFAULT_CHUNK_SIZE,
  HEADER_SIZE,
  IV_LENGTH,
  AUTH_TAG_LENGTH,
} from "@/lib/cloud/encryption-service";

const ENCRYPTED_CHUNK_SIZE = DEFAULT_CHUNK_SIZE + IV_LENGTH + AUTH_TAG_LENGTH;

describe("getEncryptedRangeForPlaintextRange", () => {
  it('returns null for mode "none"', () => {
    expect(getEncryptedRangeForPlaintextRange(0, 100, "none")).toBeNull();
  });

  it('returns null for mode ""', () => {
    expect(getEncryptedRangeForPlaintextRange(0, 100, "")).toBeNull();
  });

  it("chunked_gcm single-chunk range (0-100) starts at header offset", () => {
    const result = getEncryptedRangeForPlaintextRange(0, 100, "chunked_gcm");
    expect(result).not.toBeNull();
    // R2 range should start at HEADER_SIZE (5) for chunked_gcm
    expect(result!.r2Range).toBe(
      `bytes=${HEADER_SIZE}-${HEADER_SIZE + ENCRYPTED_CHUNK_SIZE - 1}`
    );
    expect(result!.chunkCount).toBe(1);
    expect(result!.plaintextStartOffset).toBe(0);
  });

  it("chunked_gcm_mp single-chunk range (0-100) starts at byte 0", () => {
    const result = getEncryptedRangeForPlaintextRange(0, 100, "chunked_gcm_mp");
    expect(result).not.toBeNull();
    // No header offset for multipart
    expect(result!.r2Range).toBe(`bytes=0-${ENCRYPTED_CHUNK_SIZE - 1}`);
    expect(result!.chunkCount).toBe(1);
    expect(result!.plaintextStartOffset).toBe(0);
  });

  it("cross-chunk range spans 2 chunks", () => {
    // Byte range that crosses a chunk boundary
    const start = DEFAULT_CHUNK_SIZE - 1; // last byte of chunk 0
    const end = DEFAULT_CHUNK_SIZE + 1; // second byte of chunk 1
    const result = getEncryptedRangeForPlaintextRange(
      start,
      end,
      "chunked_gcm"
    );
    expect(result).not.toBeNull();
    expect(result!.chunkCount).toBe(2);
  });

  it("plaintextStartOffset for mid-chunk start equals start % CHUNK_SIZE", () => {
    const start = DEFAULT_CHUNK_SIZE + 500; // 500 bytes into chunk 1
    const end = DEFAULT_CHUNK_SIZE + 1000;
    const result = getEncryptedRangeForPlaintextRange(
      start,
      end,
      "chunked_gcm"
    );
    expect(result).not.toBeNull();
    expect(result!.plaintextStartOffset).toBe(start % DEFAULT_CHUNK_SIZE);
    expect(result!.plaintextStartOffset).toBe(500);
  });

  it("plaintextLength always equals end - start + 1", () => {
    const start = 1000;
    const end = 5000;
    const result = getEncryptedRangeForPlaintextRange(
      start,
      end,
      "chunked_gcm"
    );
    expect(result).not.toBeNull();
    expect(result!.plaintextLength).toBe(end - start + 1);
    expect(result!.plaintextLength).toBe(4001);
  });

  it("large chunk index (chunk 10) computes correct R2 offset", () => {
    const start = 10 * DEFAULT_CHUNK_SIZE;
    const end = start + 100;
    const result = getEncryptedRangeForPlaintextRange(
      start,
      end,
      "chunked_gcm"
    );
    expect(result).not.toBeNull();
    const expectedR2Start = HEADER_SIZE + 10 * ENCRYPTED_CHUNK_SIZE;
    expect(result!.r2Range).toBe(
      `bytes=${expectedR2Start}-${expectedR2Start + ENCRYPTED_CHUNK_SIZE - 1}`
    );
  });

  it("range within single non-first chunk", () => {
    const start = 3 * DEFAULT_CHUNK_SIZE + 100;
    const end = 3 * DEFAULT_CHUNK_SIZE + 500;
    const result = getEncryptedRangeForPlaintextRange(
      start,
      end,
      "chunked_gcm_mp"
    );
    expect(result).not.toBeNull();
    expect(result!.chunkCount).toBe(1);
    expect(result!.plaintextStartOffset).toBe(100);
    expect(result!.plaintextLength).toBe(401);
    // No header offset for multipart
    const expectedR2Start = 3 * ENCRYPTED_CHUNK_SIZE;
    expect(result!.r2Range).toBe(
      `bytes=${expectedR2Start}-${expectedR2Start + ENCRYPTED_CHUNK_SIZE - 1}`
    );
  });
});
