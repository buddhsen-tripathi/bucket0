import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "@/server/compat/next-server";
import { POST } from "@/server/routes/api/cloud/upload/chunked/part/route";

const mocks = vi.hoisted(() => ({ touchUpload: vi.fn(), uploadPart: vi.fn() }));
vi.mock("@/server/compat/clerk", () => ({ auth: async () => ({ userId: "u1" }) }));
vi.mock("@/lib/cloud/chunked-upload-tracker", () => ({ chunkedUploadTracker: { touchUpload: mocks.touchUpload } }));
vi.mock("@/lib/cloud/system-service", () => ({ systemStorage: { uploadPart: mocks.uploadPart } }));
vi.mock("@/lib/shared/logger", () => ({ cloudLog: { error: vi.fn() } }));

const CHUNK_BYTES = 8 * 1024 * 1024;
beforeEach(() => {
  mocks.touchUpload.mockReset().mockResolvedValue({ key: "file", size: CHUNK_BYTES, encrypted: false });
  mocks.uploadPart.mockReset().mockResolvedValue("etag");
});

function request(size: number) {
  const form = new FormData();
  form.set("uploadId", "upload"); form.set("key", "file"); form.set("partNumber", "1"); form.set("encrypt", "false");
  form.set("chunk", new Blob([new Uint8Array(size)]));
  return new NextRequest("http://localhost/api/cloud/upload/chunked/part", { method: "POST", body: form });
}

describe("multipart upload part bounds", () => {
  it("accepts a full 8 MiB chunk with multipart framing and no Content-Length", async () => {
    const input = request(CHUNK_BYTES);
    expect(input.headers.has("content-length")).toBe(false);
    const response = await POST(input);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ etag: "etag", partNumber: 1 });
  });

  it("rejects oversized declared requests before parsing or allocating a chunk", async () => {
    const cancel = vi.fn();
    const init: RequestInit & { duplex: "half" } = {
      method: "POST", headers: { "content-length": String(CHUNK_BYTES + 65537), "content-type": "multipart/form-data; boundary=a" },
      body: new ReadableStream({ cancel }), duplex: "half",
    };
    expect((await POST(new NextRequest("http://localhost/api/cloud/upload/chunked/part", init))).status).toBe(413);
    expect(cancel).toHaveBeenCalledOnce();
    expect(mocks.touchUpload).not.toHaveBeenCalled();
  });

  it("counts and cancels an oversized chunked request while parsing its multipart body", async () => {
    const cancel = vi.fn();
    const prefix = new TextEncoder().encode('--a\r\nContent-Disposition: form-data; name="chunk"; filename="blob"\r\nContent-Type: application/octet-stream\r\n\r\n');
    const init: RequestInit & { duplex: "half" } = {
      method: "POST", headers: { "content-type": "multipart/form-data; boundary=a" }, duplex: "half",
      body: new ReadableStream<Uint8Array>({
        start(controller) { controller.enqueue(prefix); },
        pull(controller) { controller.enqueue(new Uint8Array(64 * 1024)); }, cancel,
      }),
    };
    expect((await POST(new NextRequest("http://localhost/api/cloud/upload/chunked/part", init))).status).toBe(413);
    await vi.waitFor(() => expect(cancel).toHaveBeenCalled());
    expect(mocks.touchUpload).not.toHaveBeenCalled();
  });

  it("rejects a parsed chunk whose Blob size differs from its reservation", async () => {
    mocks.touchUpload.mockResolvedValue({ key: "file", size: 1, encrypted: false });
    expect((await POST(request(2))).status).toBe(400);
    expect(mocks.uploadPart).not.toHaveBeenCalled();
  });
});
