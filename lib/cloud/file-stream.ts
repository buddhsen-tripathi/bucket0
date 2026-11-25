import { Readable } from "node:stream";
import { systemStorage } from "@/lib/cloud/system-service";
import { createDecryptStream } from "@/lib/cloud/encryption-service";

export interface CloudStreamFile {
  fileKey: string;
  teamId?: string;
  range?: string;
  encrypted: boolean;
  encryptionMode: string;
}

/** Open one R2 object without retaining the complete plaintext in the Worker. */
export async function openCloudFileStream(userId: string, file: CloudStreamFile, signal?: AbortSignal) {
  const prefix = file.teamId ? `teams/${file.teamId}/` : `users/${userId}/`;
  const key = file.fileKey.startsWith(prefix) ? file.fileKey.slice(prefix.length) : file.fileKey;
  const response = file.teamId
    ? await systemStorage.getTeamFileStream(file.teamId, key, file.range, signal)
    : await systemStorage.getFileStream(userId, key, file.range, signal);
  if (!response.Body) throw new Error(`Unable to read ${key}`);

  const reader = response.Body.transformToWebStream().getReader();
  const source = Readable.from((async function* () {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) return;
        yield value;
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  })(), { objectMode: false, highWaterMark: 64 * 1024 });
  const abort = () => {
    void reader.cancel().catch(() => {});
    source.destroy();
  };
  signal?.addEventListener("abort", abort, { once: true });
  source.once("close", () => signal?.removeEventListener("abort", abort));
  if (signal?.aborted) abort();
  if (!file.encrypted || file.encryptionMode === "none") return source;

  const decrypt = createDecryptStream(file.encryptionMode === "chunked_gcm");
  source.once("error", (error) => decrypt.destroy(error));
  source.once("close", () => { if (!source.readableEnded) decrypt.destroy(); });
  decrypt.once("close", () => source.destroy());
  return source.pipe(decrypt);
}

/** Bridge Node decryption streams to fetch without buffering or type coercion. */
export function cloudFileToWebStream(source: Readable): ReadableStream<Uint8Array> {
  const iterator = source[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await iterator.next();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    async cancel() {
      source.destroy();
      await iterator.return?.();
    },
  }, { highWaterMark: 0 });
}
