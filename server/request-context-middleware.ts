import type { MiddlewareHandler } from "hono";
import { requestContext } from "@/server/context";
import { isApiRoute } from "@/server/guards";

/** Preserve API mutations through storage writes and quota rollback on disconnect. */
export const requestContextMiddleware: MiddlewareHandler<{ Bindings: Record<string, unknown> }> = async (c, next) => {
  const request = c.req.raw;
  const work = requestContext.run({ request, env: c.env, ctx: c.executionCtx }, next);
  if (isApiRoute(new URL(request.url).pathname) && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    c.executionCtx.waitUntil(work);
  }
  await work;
};
