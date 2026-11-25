export const MAX_THUMBNAIL_BYTES = 64 * 1024 * 1024;

export class ThumbnailBodyTooLarge extends Error {}

/** Count actual bytes, including chunked requests without Content-Length. */
export async function readThumbnailBody(body: ReadableStream<Uint8Array> | null, maxBytes = MAX_THUMBNAIL_BYTES) {
  if (!body) return Buffer.alloc(0);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new ThumbnailBodyTooLarge(`Body exceeds ${maxBytes} bytes`);
      chunks.push(value);
    }
    return Buffer.concat(chunks, size);
  } catch (error) {
    await reader.cancel(error).catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}
