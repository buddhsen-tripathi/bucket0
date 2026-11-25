import { describe, expect, it, vi } from "vitest";
import { readThumbnailBody, ThumbnailBodyTooLarge } from "../../media/body-limit";

describe("media thumbnail body limit", () => {
  it("rejects and cancels an oversized stream without a Content-Length header", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(new Uint8Array(3)); }, cancel,
    });
    await expect(readThumbnailBody(body, 5)).rejects.toBeInstanceOf(ThumbnailBodyTooLarge);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("accepts an exact-limit body split across chunks", async () => {
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new Uint8Array([1, 2]));
      controller.enqueue(new Uint8Array([3, 4, 5]));
      controller.close();
    } });
    expect(await readThumbnailBody(body, 5)).toEqual(Buffer.from([1, 2, 3, 4, 5]));
  });
});
