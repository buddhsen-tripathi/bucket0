import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { mountRouteHandlers } from "@/server/route-adapter";

describe("route dispatch", () => {
  it("uses explicit HEAD handlers without executing GET or reading the object body", async () => {
    const app = new Hono();
    const getObject = vi.fn(() => new Response("object content"));
    const headObject = vi.fn(async (request, { params }) => {
      expect(request.method).toBe("HEAD");
      expect(await params).toEqual({ bucket: "photos" });
      return new Response(null, { headers: { "content-length": "123", "x-amz-bucket-region": "auto" } });
    });
    mountRouteHandlers(app, "/:bucket", { GET: getObject, HEAD: headObject }, (c) => c.req.param());

    const response = await app.request("/photos", { method: "HEAD" });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-length")).toBe("123");
    expect(response.headers.get("x-amz-bucket-region")).toBe("auto");
    expect(await response.text()).toBe("");
    expect(headObject).toHaveBeenCalledOnce();
    expect(getObject).not.toHaveBeenCalled();
  });

  it("retains GET fallback for routes without a HEAD export", async () => {
    const app = new Hono();
    mountRouteHandlers(app, "/", { GET: () => new Response("content", { headers: { etag: "version" } }) }, () => ({}));

    const response = await app.request("/", { method: "HEAD" });

    expect(response.status).toBe(200);
    expect(response.headers.get("etag")).toBe("version");
    expect(await response.text()).toBe("");
  });

  it("supports routes that only export HEAD without turning GET into HEAD", async () => {
    const app = new Hono();
    const head = vi.fn(() => new Response(null, { status: 204 }));
    mountRouteHandlers(app, "/", { HEAD: head }, () => ({}));

    expect((await app.request("/", { method: "HEAD" })).status).toBe(204);
    expect((await app.request("/")).status).toBe(405);
    expect(head).toHaveBeenCalledOnce();
  });
});
