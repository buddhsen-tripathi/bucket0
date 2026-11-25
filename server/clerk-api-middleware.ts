import { createMiddleware } from "hono/factory";
import { authenticateClerkRequest } from "./compat/clerk";
import { getRequestContext } from "./context";
import { isAuthenticatedFeatureRoute } from "./guards";

function isClerkApiRoute(pathname: string) {
  // These dashboard routes sit under the S3 gateway's otherwise public prefix.
  return isAuthenticatedFeatureRoute(pathname) || pathname === "/api/teams" ||
    /^\/api\/s3-api\/(?:bucket|credentials|files(?:\/(?:download|upload))?)$/.test(pathname);
}

export const clerkApiMiddleware = createMiddleware(async (c, next) => {
  if (!isClerkApiRoute(c.req.path)) return next();

  const state = await authenticateClerkRequest();
  if (state.headers.has("location")) {
    return new Response(null, { status: 307, headers: state.headers });
  }

  const sessionAuth = state.toAuth();
  if (!sessionAuth) throw new Error("Clerk handshake did not provide a redirect");
  getRequestContext().auth = Promise.resolve(sessionAuth);
  await next();

  // Preserve refreshed session cookies separately, including cookies set by the handler.
  c.res = new Response(c.res.body, c.res);
  state.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "set-cookie") c.res.headers.append(key, value);
  });
  for (const cookie of state.headers.getSetCookie()) c.res.headers.append("set-cookie", cookie);
});
