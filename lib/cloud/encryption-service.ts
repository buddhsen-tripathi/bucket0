/**
 * Encryption Service for Bucket0
 *
 * Implements streaming-friendly AES-128-GCM encryption with chunking.
 * Each chunk is independently encrypted with its own IV and auth tag,
 * allowing for:
 * - Streaming encryption/decryption (memory efficient)
 * - Range requests (seek to specific chunk)
 * - Parallel processing
 * - Tamper detection at chunk level
 *
 * File Format:
 * [1 byte: version][4 bytes: chunk_size_be]
 * [Chunk 0: 16 bytes IV | ciphertext | 16 bytes auth_tag]
 * [Chunk 1: 16 bytes IV | ciphertext | 16 bytes auth_tag]
 * ...
 *
 * Version: 0x01
 * Default chunk size: 8MB (8388608 bytes)
 * Overhead per chunk: 32 bytes (IV + auth tag)
 */

import crypto from "crypto";
import { Transform } from "stream";

// Configuration
const ALGORITHM = "aes-128-gcm";
const VERSION = 0x01;
const DEFAULT_CHUNK_SIZE = 8 * 1024 * 1024; // 8MB
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const HEADER_SIZE = 5; // 1 byte version + 4 bytes chunk size

/**
 * Get the encryption key from environment
 */
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;

  if (!key) {
    throw new Error("ENCRYPTION_KEY environment variable is not set");
  }

  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be 32 hex characters (128 bits)");
  }

  return Buffer.from(key, "hex");
}

/**
 * Header structure for chunked encrypted files
 */
interface ChunkedHeader {
  version: number;
  chunkSize: number;
}

/**
 * Write the file header
 */
function createHeader(chunkSize: number = DEFAULT_CHUNK_SIZE): Buffer {
  const header = Buffer.alloc(HEADER_SIZE);
  header.writeUInt8(VERSION, 0);
  header.writeUInt32BE(chunkSize, 1);
  return header;
}

/**
 * Parse the file header
 */
function parseHeader(data: Buffer): ChunkedHeader {
  if (data.length < HEADER_SIZE) {
    throw new Error("Invalid chunked encryption header: too short");
  }

  const version = data.readUInt8(0);
  if (version !== VERSION) {
    throw new Error(`Unsupported chunked encryption version: ${version}`);
  }

  const chunkSize = data.readUInt32BE(1);
  if (chunkSize < 1024 || chunkSize > 100 * 1024 * 1024) {
    throw new Error(`Invalid chunk size: ${chunkSize}`);
  }

  return { version, chunkSize };
}

/**
 * Encrypt a single chunk
 */
function encryptChunk(plaintext: Buffer, key: Buffer): Buffer {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Format: [IV][ciphertext][authTag]
  return Buffer.concat([iv, encrypted, authTag]);
}

/**
 * Decrypt a single chunk
 */
function decryptChunk(chunkData: Buffer, key: Buffer): Buffer {
  if (chunkData.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error("Chunk data too short");
  }

  const iv = chunkData.subarray(0, IV_LENGTH);
  const authTag = chunkData.subarray(chunkData.length - AUTH_TAG_LENGTH);
  const ciphertext = chunkData.subarray(
    IV_LENGTH,
    chunkData.length - AUTH_TAG_LENGTH
  );

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Calculate encrypted size for a given plaintext size
 */
export function calculateEncryptedSize(
  plaintextSize: number,
  chunkSize: number = DEFAULT_CHUNK_SIZE
): number {
  const numChunks = Math.ceil(plaintextSize / chunkSize);
  const overheadPerChunk = IV_LENGTH + AUTH_TAG_LENGTH; // 32 bytes
  return HEADER_SIZE + plaintextSize + numChunks * overheadPerChunk;
}

/**
 * Calculate original size from encrypted size (approximate - for range requests)
 */
export function calculateOriginalSize(
  encryptedSize: number,
  chunkSize: number = DEFAULT_CHUNK_SIZE
): number {
  // This is an approximation; actual size stored in database
  const dataSize = encryptedSize - HEADER_SIZE;
  const encryptedChunkSize = chunkSize + IV_LENGTH + AUTH_TAG_LENGTH;
  const numChunks = Math.ceil(dataSize / encryptedChunkSize);
  return dataSize - numChunks * (IV_LENGTH + AUTH_TAG_LENGTH);
}

/**
 * Encrypt a buffer using chunked encryption
 * Good for small files that fit in memory
 */
export function encryptBufferChunked(
  plaintext: Buffer,
  chunkSize: number = DEFAULT_CHUNK_SIZE
): Buffer {
  const key = getEncryptionKey();
  const header = createHeader(chunkSize);
  const chunks: Buffer[] = [header];

  // Process in chunks
  for (let offset = 0; offset < plaintext.length; offset += chunkSize) {
    const chunk = plaintext.subarray(offset, offset + chunkSize);
    const encryptedChunk = encryptChunk(chunk, key);
    chunks.push(encryptedChunk);
  }

  return Buffer.concat(chunks);
}

/**
 * Decrypt a buffer using chunked encryption
 * Good for small files that fit in memory
 */
export function decryptBufferChunked(encrypted: Buffer): Buffer {
  const key = getEncryptionKey();
  const header = parseHeader(encrypted);
  const chunkSize = header.chunkSize;
  const encryptedChunkSize = chunkSize + IV_LENGTH + AUTH_TAG_LENGTH;

  const chunks: Buffer[] = [];
  let offset = HEADER_SIZE;

  while (offset < encrypted.length) {
    // Handle last chunk which may be smaller
    const remainingData = encrypted.length - offset;
    const thisChunkSize = Math.min(encryptedChunkSize, remainingData);

    const chunkData = encrypted.subarray(offset, offset + thisChunkSize);
    const decryptedChunk = decryptChunk(chunkData, key);
    chunks.push(decryptedChunk);

    offset += thisChunkSize;
  }

  return Buffer.concat(chunks);
}

/**
 * Streaming encryption transform
 * Encrypts data in chunks as it flows through
 */
export class ChunkedEncryptTransform extends Transform {
  private key: Buffer;
  private chunkSize: number;
  private buffer: Buffer;
  private bufferOffset: number;
  private headerWritten: boolean;

  constructor(chunkSize: number = DEFAULT_CHUNK_SIZE) {
    super();
    this.key = getEncryptionKey();
    this.chunkSize = chunkSize;
    this.buffer = Buffer.allocUnsafe(chunkSize);
    this.bufferOffset = 0;
    this.headerWritten = false;
  }

  _transform(
    chunk: Buffer,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ): void {
    try {
      // Write header on first chunk
      if (!this.headerWritten) {
        this.push(createHeader(this.chunkSize));
        this.headerWritten = true;
      }

      let sourceOffset = 0;
      while (sourceOffset < chunk.length) {
        const spaceLeft = this.chunkSize - this.bufferOffset;
        const bytesToCopy = Math.min(spaceLeft, chunk.length - sourceOffset);
        chunk.copy(this.buffer, this.bufferOffset, sourceOffset, sourceOffset + bytesToCopy);
        this.bufferOffset += bytesToCopy;
        sourceOffset += bytesToCopy;

        // Process complete chunk
        if (this.bufferOffset === this.chunkSize) {
          const encryptedChunk = encryptChunk(this.buffer.subarray(0, this.chunkSize), this.key);
          this.push(encryptedChunk);
          this.bufferOffset = 0;
        }
      }

      callback();
    } catch (error) {
      callback(error as Error);
    }
  }

  _flush(callback: (error?: Error | null) => void): void {
    try {
      // Write header if no data was processed
      if (!this.headerWritten) {
        this.push(createHeader(this.chunkSize));
        this.headerWritten = true;
      }

      // Encrypt remaining data (final partial chunk)
      if (this.bufferOffset > 0) {
        const encryptedChunk = encryptChunk(this.buffer.subarray(0, this.bufferOffset), this.key);
        this.push(encryptedChunk);
      }

      callback();
    } catch (error) {
      callback(error as Error);
    }
  }
}

/**
 * Streaming decryption transform
 * Decrypts data in chunks as it flows through
 */
export class ChunkedDecryptTransform extends Transform {
  private key: Buffer;
  private chunkSize: number;
  private encryptedChunkSize: number;
  private buffer: Buffer;
  private bufferOffset: number;
  private headerParsed: boolean;
  private hasHeader: boolean;

  constructor(hasHeader: boolean = true, chunkSize: number = DEFAULT_CHUNK_SIZE) {
    super();
    this.key = getEncryptionKey();
    this.hasHeader = hasHeader;
    this.chunkSize = chunkSize;
    this.encryptedChunkSize = chunkSize + IV_LENGTH + AUTH_TAG_LENGTH;
    // Pre-allocate for one encrypted chunk (will resize if header says different)
    this.buffer = Buffer.allocUnsafe(this.encryptedChunkSize + HEADER_SIZE);
    this.bufferOffset = 0;
    this.headerParsed = !hasHeader; // If no header, skip header parsing
  }

  private ensureBufferCapacity(needed: number): void {
    if (this.bufferOffset + needed > this.buffer.length) {
      const newBuf = Buffer.allocUnsafe(Math.max(this.buffer.length * 2, this.bufferOffset + needed));
      this.buffer.copy(newBuf, 0, 0, this.bufferOffset);
      this.buffer = newBuf;
    }
  }

  _transform(
    chunk: Buffer,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ): void {
    try {
      this.ensureBufferCapacity(chunk.length);
      chunk.copy(this.buffer, this.bufferOffset);
      this.bufferOffset += chunk.length;

      // Parse header first (only if hasHeader is true)
      if (!this.headerParsed && this.bufferOffset >= HEADER_SIZE) {
        const header = parseHeader(this.buffer);
        this.chunkSize = header.chunkSize;
        this.encryptedChunkSize =
          this.chunkSize + IV_LENGTH + AUTH_TAG_LENGTH;
        // Shift remaining data after header
        const remaining = this.bufferOffset - HEADER_SIZE;
        if (remaining > 0) {
          this.buffer.copy(this.buffer, 0, HEADER_SIZE, this.bufferOffset);
        }
        this.bufferOffset = remaining;
        this.headerParsed = true;
      }

      // Process complete encrypted chunks
      if (this.headerParsed && this.encryptedChunkSize) {
        while (this.bufferOffset >= this.encryptedChunkSize) {
          const encryptedChunk = this.buffer.subarray(
            0,
            this.encryptedChunkSize
          );
          const decryptedChunk = decryptChunk(encryptedChunk, this.key);
          this.push(decryptedChunk);
          // Shift remaining data to front
          const remaining = this.bufferOffset - this.encryptedChunkSize;
          if (remaining > 0) {
            this.buffer.copy(this.buffer, 0, this.encryptedChunkSize, this.bufferOffset);
          }
          this.bufferOffset = remaining;
        }
      }

      callback();
    } catch (error) {
      callback(error as Error);
    }
  }

  _flush(callback: (error?: Error | null) => void): void {
    try {
      // Decrypt final partial chunk
      if (
        this.bufferOffset > 0 &&
        this.bufferOffset >= IV_LENGTH + AUTH_TAG_LENGTH
      ) {
        const decryptedChunk = decryptChunk(this.buffer.subarray(0, this.bufferOffset), this.key);
        this.push(decryptedChunk);
      }

      callback();
    } catch (error) {
      callback(error as Error);
    }
  }
}

/**
 * Create an encryption stream
 * Usage: readableStream.pipe(createEncryptStream()).pipe(writableStream)
 */
export function createEncryptStream(
  chunkSize: number = DEFAULT_CHUNK_SIZE
): Transform {
  return new ChunkedEncryptTransform(chunkSize);
}

/**
 * Create a decryption stream
 * Usage: readableStream.pipe(createDecryptStream()).pipe(writableStream)
 * @param hasHeader - true for files with header (normal upload), false for multipart uploads
 */
export function createDecryptStream(hasHeader: boolean = true): Transform {
  return new ChunkedDecryptTransform(hasHeader);
}

/**
 * Encrypt a buffer for multipart upload
 * NO header - all parts have identical structure for R2 compatibility
 * R2 requires all non-trailing parts to have the same size
 */
export function encryptChunkForMultipart(
  plaintext: Buffer,
  chunkSize: number = DEFAULT_CHUNK_SIZE
): Buffer {
  const key = getEncryptionKey();
  const chunks: Buffer[] = [];

  // NO header for multipart - ensures all parts have same size
  // Decryption uses 'chunked_gcm_headerless' mode from DB

  // Process in encryption chunks
  for (let offset = 0; offset < plaintext.length; offset += chunkSize) {
    const chunk = plaintext.subarray(offset, offset + chunkSize);
    const encryptedChunk = encryptChunk(chunk, key);
    chunks.push(encryptedChunk);
  }

  return Buffer.concat(chunks);
}

// Export constants
export {
  DEFAULT_CHUNK_SIZE,
  HEADER_SIZE,
  IV_LENGTH,
  AUTH_TAG_LENGTH,
  VERSION,
};
