import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import JSZip from "jszip";
import { createFolderZipStream } from "@/lib/cloud/folder-zip-stream";
import { encryptBufferChunked, encryptChunkForMultipart } from "@/lib/cloud/encryption-service";

const { getFileStream } = vi.hoisted(() => ({ getFileStream: vi.fn() }));
vi.mock("@/lib/cloud/system-service", () => ({ systemStorage: { getFileStream } }));

const file = (name: string, encryptionMode = "none") => ({
  fileKey: `users/u1/folder/${name}`, archivePath: name,
  encrypted: encryptionMode !== "none", encryptionMode,
});
const storedBody = (bytes: Uint8Array) => ({
  Body: { transformToWebStream: () => new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(bytes); controller.close(); },
  }) },
});

beforeEach(() => { getFileStream.mockReset(); });

describe("streamed folder ZIP", () => {
  it("preserves empty folders and decrypts plain, chunked and multipart files", async () => {
    const plaintext = Buffer.from("stored file contents");
    const data = [plaintext, encryptBufferChunked(plaintext), encryptChunkForMultipart(plaintext)];
    getFileStream.mockImplementation(async () => storedBody(data.shift()!));
    const stream = createFolderZipStream("u1", "folder", ["empty/"], [
      file("plain.txt"), file("chunked.txt", "chunked_gcm"), file("multipart.txt", "chunked_gcm_mp"),
    ]);
    const zip = await JSZip.loadAsync(await new Response(stream).arrayBuffer());
    expect(zip.file("folder/plain.txt")).not.toBeNull();
    expect(zip.files["folder/empty/"].dir).toBe(true);
    for (const name of ["plain", "chunked", "multipart"]) {
      expect(await zip.file(`folder/${name}.txt`)!.async("string")).toBe(plaintext.toString());
    }
  });

  it("does not open later R2 files or drain the active source while output is paused", async () => {
    let pulled = 0;
    const chunk = randomBytes(64 * 1024);
    const source = new ReadableStream<Uint8Array>({
      pull(controller) { pulled++; controller.enqueue(chunk); },
    });
    getFileStream.mockResolvedValue({ Body: { transformToWebStream: () => source } });
    const reader = createFolderZipStream("u1", "folder", [], [file("one"), file("two")]).getReader();
    expect(getFileStream).not.toHaveBeenCalled();
    // ZIP headers can be emitted before an object is opened.
    while (!getFileStream.mock.calls.length) await reader.read();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(getFileStream).toHaveBeenCalledTimes(1);
    expect(pulled).toBeLessThan(12);
    await reader.cancel();

  });

  it("cancels the active R2 request and never opens later files", async () => {
    const cancel = vi.fn();
    getFileStream.mockResolvedValue({ Body: { transformToWebStream: () => new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(new Uint8Array(64 * 1024)); }, cancel,
    }) } });
    const reader = createFolderZipStream("u1", "folder", [], [file("one"), file("two")]).getReader();
    while (!getFileStream.mock.calls.length) await reader.read();
    await reader.cancel();
    await vi.waitFor(() => expect(cancel).toHaveBeenCalled());
    expect(getFileStream.mock.calls[0][3].aborted).toBe(true);
    expect(getFileStream).toHaveBeenCalledTimes(1);
  });

  it("propagates storage errors to the download response", async () => {
    const error = new Error("R2 read failed");
    getFileStream.mockRejectedValue(error);
    const stream = createFolderZipStream("u1", "folder", [], [file("missing")]);
    await expect(new Response(stream).arrayBuffer()).rejects.toBe(error);
  });

  it("fails the response when stored encrypted bytes fail authentication", async () => {
    const encrypted = encryptBufferChunked(Buffer.from("protected contents"));
    encrypted[encrypted.length - 1] ^= 1;
    getFileStream.mockResolvedValue(storedBody(encrypted));
    const stream = createFolderZipStream("u1", "folder", [], [file("corrupt", "chunked_gcm")]);
    await expect(new Response(stream).arrayBuffer()).rejects.toThrow();
  });

  it("streams a source larger than the Worker memory budget without collecting it", async () => {
    const chunk = new Uint8Array(64 * 1024);
    const totalChunks = 2400; // 150 MiB
    let produced = 0;
    getFileStream.mockResolvedValue({ Body: { transformToWebStream: () => new ReadableStream<Uint8Array>({
      pull(controller) {
        if (produced++ < totalChunks) controller.enqueue(chunk);
        else controller.close();
      },
    }) } });
    const reader = createFolderZipStream("u1", "folder", [], [file("large.bin")]).getReader();
    let archiveBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      archiveBytes += value.byteLength;
    }
    expect(produced).toBe(totalChunks + 1);
    expect(archiveBytes).toBeGreaterThan(0);
    expect(archiveBytes).toBeLessThan(totalChunks * chunk.byteLength);
  }, 15000); // Compressing 150 MiB can exceed the default timeout during parallel checks.
});
