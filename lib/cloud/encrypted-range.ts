/**
 * Encrypted Range Request Utilities
 *
 * Calculates which encrypted chunks to fetch from R2 for a given plaintext
 * byte range, enabling partial decryption instead of downloading entire files.
 *
 * Supports:
 * - chunked_gcm: [5-byte header][encrypted chunks...]
 * - chunked_gcm_mp: [encrypted chunks...] (no header, multipart upload)
 *
 * Each encrypted chunk = CHUNK_SIZE + IV_LENGTH + AUTH_TAG_LENGTH = 8388640 bytes
 * Each plaintext chunk = CHUNK_SIZE = 8388608 bytes (8MB)
 */

import {
  DEFAULT_CHUNK_SIZE,
  HEADER_SIZE,
  IV_LENGTH,
  AUTH_TAG_LENGTH,
} from "./encryption-service";

const ENCRYPTED_CHUNK_SIZE = DEFAULT_CHUNK_SIZE + IV_LENGTH + AUTH_TAG_LENGTH;

export interface EncryptedRangeResult {
  /** R2 byte range string, e.g. "bytes=5-8388644" */
  r2Range: string;
  /** Offset into the first decrypted chunk where the requested data starts */
  plaintextStartOffset: number;
  /** How many plaintext bytes to return from the decrypted output */
  plaintextLength: number;
  /** Whether the fetched data starts with a header that must be skipped */
  skipHeader: boolean;
  /** Number of encrypted chunks being fetched */
  chunkCount: number;
}

/**
 * Calculate the R2 byte range needed to serve a plaintext range request
 * for a chunked-encrypted file.
 *
 * @param plaintextStart - Start byte of the requested plaintext range
 * @param plaintextEnd - End byte (inclusive) of the requested plaintext range
 * @param mode - "chunked_gcm" (has 5-byte header) or "chunked_gcm_mp" (no header)
 * @returns Range calculation result, or null if mode doesn't support partial decrypt
 */
export function getEncryptedRangeForPlaintextRange(
  plaintextStart: number,
  plaintextEnd: number,
  mode: string
): EncryptedRangeResult | null {
  if (mode !== "chunked_gcm" && mode !== "chunked_gcm_mp") {
    return null; // Only chunked modes support partial decrypt
  }

  const hasHeader = mode === "chunked_gcm";
  const headerOffset = hasHeader ? HEADER_SIZE : 0;

  // Which plaintext chunks contain the requested range?
  const firstChunkIndex = Math.floor(plaintextStart / DEFAULT_CHUNK_SIZE);
  const lastChunkIndex = Math.floor(plaintextEnd / DEFAULT_CHUNK_SIZE);

  // Calculate R2 byte positions for these encrypted chunks
  const r2Start = headerOffset + firstChunkIndex * ENCRYPTED_CHUNK_SIZE;
  const r2End = headerOffset + (lastChunkIndex + 1) * ENCRYPTED_CHUNK_SIZE - 1;

  // Offset within the first decrypted chunk
  const plaintextStartOffset = plaintextStart - firstChunkIndex * DEFAULT_CHUNK_SIZE;
  const plaintextLength = plaintextEnd - plaintextStart + 1;
  const chunkCount = lastChunkIndex - firstChunkIndex + 1;

  return {
    r2Range: `bytes=${r2Start}-${r2End}`,
    plaintextStartOffset,
    plaintextLength,
    skipHeader: false, // We skip the header in the R2 range calculation
    chunkCount,
  };
}
