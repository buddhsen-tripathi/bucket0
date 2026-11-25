import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestThumbnail } from "@/lib/cloud/thumbnail-service";
import { requestContext } from "@/server/context";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));

beforeEach(() => {
  vi.stubEnv("MEDIA_SERVICE_URL", "https://media.example.test");
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.fetch.mockReset();
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("thumbnail source streaming", () => {
  it("passes an existing upload buffer to media without copying its bytes", async () => {
    const input = Buffer.from("image bytes");
    mocks.fetch.mockImplementation(async (_url, request: RequestInit) => {
      if (!(request.body instanceof ReadableStream)) throw new Error("Expected streamed input");
      const reader = request.body.getReader();
      const { value } = await reader.read();
      expect(value).toBe(input);
      return new Response(new Uint8Array([3, 2, 1]));
    });
    expect(await requestThumbnail("image", input, {})).toEqual(Buffer.from([3, 2, 1]));
  });

  it("uses the private media container unless MEDIA_SERVICE_URL overrides it", async () => {
    vi.stubEnv("MEDIA_SERVICE_URL", "");
    const containerFetch = vi.fn(async () => new Response(new Uint8Array([1])));
    const env = { MEDIA_CONTAINER: { getByName: () => ({ fetch: containerFetch }) } };
    const ctx = { props: {}, waitUntil: vi.fn(), passThroughOnException: vi.fn() };
    await requestContext.run({ request: new Request("http://test"), env, ctx }, async () => {
      expect(await requestThumbnail("pdf", Buffer.from("pdf"), {}, "application/pdf")).toEqual(Buffer.from([1]));
    });
    expect(containerFetch).toHaveBeenCalledWith("http://media/thumbnail?kind=pdf", expect.objectContaining({ method: "POST" }));
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
