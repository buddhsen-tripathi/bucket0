import { describe, it, expect } from "vitest";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import {
  calculateEncryptedSize,
  encryptBufferChunked,
  decryptBufferChunked,
  encryptChunkForMultipart,
  createEncryptStream,
  createDecryptStream,
  DEFAULT_CHUNK_SIZE,
  HEADER_SIZE,
  IV_LENGTH,
  AUTH_TAG_LENGTH,
} from "@/lib/cloud/encryption-service";

describe("calculateEncryptedSize", () => {
  it("correct for 1 byte", () => {
    const size = calculateEncryptedSize(1);
    // 1 chunk: HEADER + 1 byte plaintext + 1 * (IV + AUTH_TAG)
    expect(size).toBe(HEADER_SIZE + 1 + IV_LENGTH + AUTH_TAG_LENGTH);
  });

  it("correct for exactly 8MB", () => {
    const size = calculateEncryptedSize(DEFAULT_CHUNK_SIZE);
    // 1 chunk
    expect(size).toBe(
      HEADER_SIZE + DEFAULT_CHUNK_SIZE + IV_LENGTH + AUTH_TAG_LENGTH
    );
  });

  it("correct for 8MB + 1 byte (2 chunks)", () => {
    const size = calculateEncryptedSize(DEFAULT_CHUNK_SIZE + 1);
    // 2 chunks
    expect(size).toBe(
      HEADER_SIZE + DEFAULT_CHUNK_SIZE + 1 + 2 * (IV_LENGTH + AUTH_TAG_LENGTH)
    );
  });

  it("encrypted output size matches calculateEncryptedSize", () => {
    const data = Buffer.alloc(1234, "x");
    const encrypted = encryptBufferChunked(data);
    expect(encrypted.length).toBe(calculateEncryptedSize(1234));
  });
});

describe("encryptBufferChunked / decryptBufferChunked round-trip", () => {
  it("small data round-trip", () => {
    const plaintext = Buffer.from("Hello, encryption test!");
    const encrypted = encryptBufferChunked(plaintext);
    const decrypted = decryptBufferChunked(encrypted);
    expect(decrypted).toEqual(plaintext);
  });

  it("exactly 8MB round-trip", () => {
    const plaintext = Buffer.alloc(DEFAULT_CHUNK_SIZE, 0xab);
    const encrypted = encryptBufferChunked(plaintext);
    const decrypted = decryptBufferChunked(encrypted);
    expect(decrypted.length).toBe(plaintext.length);
    expect(decrypted.equals(plaintext)).toBe(true);
  });

  it("8MB + 1 byte (2 chunks) round-trip", () => {
    const plaintext = Buffer.alloc(DEFAULT_CHUNK_SIZE + 1, 0xcd);
    const encrypted = encryptBufferChunked(plaintext);
    const decrypted = decryptBufferChunked(encrypted);
    expect(decrypted.length).toBe(plaintext.length);
    expect(decrypted.equals(plaintext)).toBe(true);
  });
});

describe("encryptChunkForMultipart / createDecryptStream round-trip", () => {
  it("round-trips through multipart encrypt and headerless decrypt", async () => {
    const plaintext = Buffer.from("Multipart encryption test data!");
    const encrypted = encryptChunkForMultipart(plaintext);

    // Decrypt with hasHeader=false (multipart has no header)
    const decryptStream = createDecryptStream(false);
    const chunks: Buffer[] = [];

    const readable = Readable.from([encrypted]);
    const decrypted = readable.pipe(decryptStream);

    for await (const chunk of decrypted) {
      chunks.push(Buffer.from(chunk));
    }

    expect(Buffer.concat(chunks)).toEqual(plaintext);
  });
});

describe("streaming encrypt/decrypt round-trip", () => {
  it("small data via pipe", async () => {
    const plaintext = Buffer.from("Stream encryption test data");

    const encStream = createEncryptStream();
    const decStream = createDecryptStream(true);

    const chunks: Buffer[] = [];
    const source = Readable.from([plaintext]);

    const piped = source.pipe(encStream).pipe(decStream);

    for await (const chunk of piped) {
      chunks.push(Buffer.from(chunk));
    }

    expect(Buffer.concat(chunks)).toEqual(plaintext);
  });

  it("1KB chunks fed individually", async () => {
    const totalSize = 4096;
    const plaintext = Buffer.alloc(totalSize, 0xef);
    const chunkSize = 1024;

    const encStream = createEncryptStream();
    const decStream = createDecryptStream(true);

    // Feed data in small chunks
    const inputChunks: Buffer[] = [];
    for (let i = 0; i < totalSize; i += chunkSize) {
      inputChunks.push(plaintext.subarray(i, i + chunkSize));
    }

    const source = Readable.from(inputChunks);
    const outputChunks: Buffer[] = [];

    const piped = source.pipe(encStream).pipe(decStream);

    for await (const chunk of piped) {
      outputChunks.push(Buffer.from(chunk));
    }

    expect(Buffer.concat(outputChunks)).toEqual(plaintext);
  });

  it("hasHeader=true stream vs hasHeader=false produce correct output", async () => {
    const plaintext = Buffer.from("Test header handling");

    // Encrypt with header (normal upload)
    const encryptedWithHeader = encryptBufferChunked(plaintext);

    // Encrypt without header (multipart)
    const encryptedNoHeader = encryptChunkForMultipart(plaintext);

    // Decrypt with header
    const dec1 = createDecryptStream(true);
    const chunks1: Buffer[] = [];
    const r1 = Readable.from([encryptedWithHeader]);
    for await (const c of r1.pipe(dec1)) chunks1.push(Buffer.from(c));

    // Decrypt without header
    const dec2 = createDecryptStream(false);
    const chunks2: Buffer[] = [];
    const r2 = Readable.from([encryptedNoHeader]);
    for await (const c of r2.pipe(dec2)) chunks2.push(Buffer.from(c));

    expect(Buffer.concat(chunks1)).toEqual(plaintext);
    expect(Buffer.concat(chunks2)).toEqual(plaintext);
  });
});

describe("performance", () => {
  it("8MB encrypt+decrypt < 500ms (verifies O(n) not O(n^2))", () => {
    const data = Buffer.alloc(DEFAULT_CHUNK_SIZE, 0x42);
    const start = performance.now();
    const encrypted = encryptBufferChunked(data);
    decryptBufferChunked(encrypted);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(500);
  });
});

describe("edge cases", () => {
  it("empty buffer encrypt produces header only", () => {
    // encryptBufferChunked with empty buffer should produce just header
    // since the for loop doesn't execute for length 0
    const encrypted = encryptBufferChunked(Buffer.alloc(0));
    expect(encrypted.length).toBe(HEADER_SIZE);
  });
});
