import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clerkApiMiddleware } from "@/server/clerk-api-middleware";
import { auth } from "@/server/compat/clerk";
import { requestContext } from "@/server/context";

const { authenticateRequest } = vi.hoisted(() => ({ authenticateRequest: vi.fn() }));
vi.mock("@clerk/backend", () => ({
  createClerkClient: () => ({ authenticateRequest }),
}));

function createApp() {
  const app = new Hono<{ Bindings: Record<string, unknown> }>();
  const handler = vi.fn(async () => {
    const first = await auth();
    const second = await auth();
    expect(first).toBe(second);
    return Response.json({ userId: first.userId }, { headers: { "set-cookie": "handler=value; Path=/" } });
  });
  app.use("*", (c, next) => requestContext.run({
    request: c.req.raw,
    env: c.env,
    ctx: { waitUntil() {}, passThroughOnException() {}, props: {} },
  }, next));
  app.use("/api/*", clerkApiMiddleware);
  app.get("/api/cloud/view", handler);
  app.get("/api/teams", handler);
  app.get("/api/s3-api/credentials", handler);
  app.get("*", () => new Response("public"));
  return { app, handler };
}

beforeEach(() => {
  authenticateRequest.mockReset();
});

describe("Clerk API request lifecycle", () => {
  it("returns the handshake redirect and cookies before invoking an API handler", async () => {
    const { app, handler } = createApp();
    const headers = new Headers({ location: "https://clerk.example.com/v1/client/handshake", "cache-control": "no-store" });
    headers.append("set-cookie", "__clerk_handshake=nonce; Path=/; HttpOnly");
    authenticateRequest.mockResolvedValue({ status: "handshake", headers, toAuth: () => null });

    const response = await app.request("/api/cloud/view", { headers: { "sec-fetch-dest": "iframe" } });

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(headers.get("location"));
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.getSetCookie()).toEqual(headers.getSetCookie());
    expect(handler).not.toHaveBeenCalled();
  });

  it.each(["/api/cloud/view", "/api/teams", "/api/s3-api/credentials"])(
    "memoizes refreshed authentication and forwards each cookie for %s",
    async (pathname) => {
      const { app, handler } = createApp();
      const headers = new Headers();
      headers.append("set-cookie", "__session=fresh; Path=/; HttpOnly");
      headers.append("set-cookie", "__refresh=new; Path=/; HttpOnly");
      authenticateRequest.mockResolvedValue({ headers, toAuth: () => ({ userId: "user_1" }) });

      const response = await app.request(pathname);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ userId: "user_1" });
      expect(response.headers.getSetCookie()).toEqual([
        "handler=value; Path=/",
        "__session=fresh; Path=/; HttpOnly",
        "__refresh=new; Path=/; HttpOnly",
      ]);
      expect(authenticateRequest).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledOnce();
    }
  );

  it.each(["/api/health", "/api/polar/webhook", "/api/webhooks/clerk", "/api/agent-bucket/files/upload", "/api/s3-api/photos/a.jpg"])(
    "leaves routes with their own authentication independent of Clerk: %s",
    async (pathname) => {
      const { app } = createApp();

      const response = await app.request(pathname);

      expect(response.status).toBe(200);
      expect(authenticateRequest).not.toHaveBeenCalled();
    }
  );

  it("exposes a signed-out auth object so individual handlers retain their access policy", async () => {
    const { app, handler } = createApp();
    authenticateRequest.mockResolvedValue({ headers: new Headers(), toAuth: () => ({ userId: null }) });

    const response = await app.request("/api/cloud/view");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ userId: null });
    expect(handler).toHaveBeenCalledOnce();
  });
});
