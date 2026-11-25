import type { Context, Env, Hono } from "hono";
import { NextRequest } from "./compat/next-server";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
type RouteParams = Record<string, string | string[] | undefined>;
type RouteHandler = (
  request: NextRequest,
  context: { params: Promise<RouteParams> }
) => Promise<Response> | Response;
export type RouteModule = Partial<Record<Method, RouteHandler>>;

export const METHODS: Method[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

export function mountRouteHandlers<E extends Env>(
  app: Hono<E>,
  path: string,
  module: RouteModule,
  buildParams: (context: Context<E>) => RouteParams
) {
  for (const method of METHODS) {
    // Hono dispatches HEAD through its GET route, retaining the original request method.
    if (method === "HEAD" || !(module[method] || (method === "GET" && module.HEAD))) continue;
    app.on(method, path, (c) => {
      const handler = c.req.raw.method === "HEAD" ? module.HEAD ?? module.GET : module[method];
      if (!handler) return c.body(null, 405);
      return handler(new NextRequest(c.req.raw), { params: Promise.resolve(buildParams(c)) });
    });
  }
}
