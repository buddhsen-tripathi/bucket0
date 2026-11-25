/**
 * Hono application for the Worker.
 *
 * - Mounts every `server/routes/**\/route.ts` module at the URL derived from
 *   its path (Next.js App Router conventions: `[param]`, `[[...splat]]`).
 * - Applies the request guards that used to live in proxy.ts.
 * - Falls through to React Router for pages.
 */

import { Hono, type Context } from "hono";
import { createRequestHandler, RouterContextProvider, type ServerBuild } from "react-router";
import { requestContextMiddleware } from "./request-context-middleware";
import { clerkApiMiddleware } from "./clerk-api-middleware";
import { METHODS, mountRouteHandlers, type RouteModule } from "./route-adapter";
import {
  CORS_HEADERS,
  addSecurityHeaders,
  isApiRoute,
  isAuthenticatedFeatureRoute,
  isCorsEnabledRoute,
  isPublicApiRoute,
  isValidRequest,
} from "./guards";
import { HOMEPAGE_LINK_HEADERS } from "@/lib/agent-discovery/site";
import { MARKDOWN_PAGES, prefersMarkdown, withMarkdownHeaders } from "@/lib/agent-discovery/markdown";

type Env = Record<string, unknown>;
interface MountedRoute {
  honoPath: string;
  /** URL prefix before an optional catch-all segment */
  basePath: string;
  catchAll?: string;
  paramCount: number;
  module: RouteModule;
}

const routeModules = import.meta.glob("./routes/**/route.ts", { eager: true }) as unknown as Record<
  string,
  RouteModule
>;

function toRoutes(file: string, module: RouteModule): MountedRoute[] {
  let urlPath = file.replace(/^\.\/routes/, "").replace(/\/route\.ts$/, "");
  // `.well-known` is stored without the leading dot so the glob picks it up.
  urlPath = urlPath.replace(/^\/well-known/, "/.well-known");

  const optionalCatchAll = urlPath.match(/\/\[\[\.\.\.(\w+)\]\]$/);
  const requiredCatchAll = urlPath.match(/\/\[\.\.\.(\w+)\]$/);
  const catchAll = optionalCatchAll?.[1] ?? requiredCatchAll?.[1];
  const basePath = urlPath.replace(/\/\[\[?\.\.\.\w+\]\]?$/, "");
  const honoBase = (basePath || "/").replace(/\[(\w+)\]/g, ":$1");
  const paramCount = (honoBase.match(/:/g) ?? []).length;

  if (!catchAll) {
    return [{ honoPath: honoBase, basePath: honoBase, paramCount, module }];
  }
  const routes: MountedRoute[] = [
    { honoPath: `${honoBase === "/" ? "" : honoBase}/*`, basePath: honoBase, catchAll, paramCount, module },
  ];
  if (optionalCatchAll) {
    routes.unshift({ honoPath: honoBase, basePath: honoBase, catchAll, paramCount, module });
  }
  return routes;
}

const mounted = Object.entries(routeModules)
  .flatMap(([file, module]) => toRoutes(file, module))
  // Static paths before dynamic ones, catch-alls last, so `/api/teams/invitations/accept`
  // wins over `/api/teams/:teamId`.
  .sort((a, b) => {
    const aCatch = a.catchAll ? 1 : 0;
    const bCatch = b.catchAll ? 1 : 0;
    if (aCatch !== bCatch) return aCatch - bCatch;
    if (a.paramCount !== b.paramCount) return a.paramCount - b.paramCount;
    return b.honoPath.length - a.honoPath.length;
  });

function buildParams(c: Context, route: MountedRoute): Record<string, string | string[] | undefined> {
  const params: Record<string, string | string[] | undefined> = { ...c.req.param() };
  if (route.catchAll) {
    // Resolve the concrete base path (dynamic segments substituted) to find the splat.
    let base = route.basePath;
    for (const [name, value] of Object.entries(c.req.param())) {
      base = base.replace(`:${name}`, value);
    }
    const rest = c.req.path.slice(base.length).replace(/^\//, "");
    params[route.catchAll] = rest ? rest.split("/").map(decodeURIComponent) : undefined;
  }
  return params;
}

export const app = new Hono<{ Bindings: Env }>();

app.use("*", async (c, next) => {
  const request = c.req.raw;
  const pathname = new URL(request.url).pathname;

  // CORS preflight for cross-origin API routes
  if (isCorsEnabledRoute(pathname) && request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // Markdown for agents: return markdown when the client prefers it
  if (
    (request.method === "GET" || request.method === "HEAD") &&
    prefersMarkdown(request.headers.get("accept")) &&
    pathname in MARKDOWN_PAGES
  ) {
    const body = MARKDOWN_PAGES[pathname];
    const headers = new Headers(withMarkdownHeaders(body));
    if (pathname === "/") {
      for (const link of HOMEPAGE_LINK_HEADERS) headers.append("Link", link);
    }
    addSecurityHeaders(headers);
    return new Response(request.method === "HEAD" ? null : body, { status: 200, headers });
  }

  // Origin + browser validation for API routes without their own auth scheme
  if (
    isApiRoute(pathname) &&
    !isPublicApiRoute(pathname) &&
    !isAuthenticatedFeatureRoute(pathname) &&
    !isValidRequest(request)
  ) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  await requestContextMiddleware(c, next);

  // Responses from fetch() can carry immutable headers; copy those before decorating.
  let response = c.res;
  try {
    response.headers.set("x-b0-runtime", "workers");
  } catch {
    response = new Response(response.body, response);
    response.headers.set("x-b0-runtime", "workers");
  }

  if (pathname === "/") {
    for (const link of HOMEPAGE_LINK_HEADERS) response.headers.append("Link", link);
  }
  if (isCorsEnabledRoute(pathname)) {
    for (const [key, value] of Object.entries(CORS_HEADERS)) response.headers.set(key, value);
  }
  addSecurityHeaders(response.headers);
  c.res = response;
});

app.use("/api/*", clerkApiMiddleware);

for (const route of mounted) {
  mountRouteHandlers(app, route.honoPath, route.module, (c) => buildParams(c, route));
}

// Everything else is a React Router page.
const reactRouter = createRequestHandler(
  () => import("virtual:react-router/server-build") as Promise<ServerBuild>,
  import.meta.env.MODE
);

app.all("*", (c) => reactRouter(c.req.raw, new RouterContextProvider()));

/** Exposed for debugging: `GET /api/health` lists mounted routes in dev. */
export const mountedRoutes = mounted.map((r) => ({
  path: r.honoPath,
  methods: METHODS.filter((m) => r.module[m]),
}));
