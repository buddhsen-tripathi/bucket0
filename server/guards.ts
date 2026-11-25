/**
 * Request guards ported from the Next.js proxy.ts (middleware):
 * route matchers, origin + browser validation, CORS and security headers.
 */

const isProduction = () => process.env.NODE_ENV === "production";

/** Minimal port of Clerk's createRouteMatcher: supports literal paths and `(.*)`. */
function createRouteMatcher(patterns: string[]): (pathname: string) => boolean {
  const regexes = patterns.map((pattern) => {
    const escaped = pattern.replace(/[.*+?^${}|\\]/g, (ch) => (ch === "(" || ch === ")" ? ch : `\\${ch}`));
    return new RegExp(`^${escaped.replace(/\\\.\\\*/g, ".*").replace(/\(\\\.\\\*\)/g, "(.*)")}$`);
  });
  return (pathname) => regexes.some((re) => re.test(pathname));
}

export const isCorsEnabledRoute = createRouteMatcher([
  "/api/s3-api(.*)",
  "/api/agent-bucket/files/upload",
  "/api/agent-bucket/files/download",
  "/api/agent-bucket/files/folder",
  "/api/agent-bucket/files/share",
  "/api/agent-bucket/files",
  "/api/agent-bucket/memory/search",
]);

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, PUT, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, X-Amz-Date, X-Amz-Content-SHA256, X-Amz-Security-Token, X-Amz-User-Agent, x-amz-acl",
  "Access-Control-Expose-Headers":
    "ETag, Content-Length, Content-Type, Content-Range, Content-Disposition, Accept-Ranges, Location, x-amz-request-id, x-amz-bucket-region",
  "Access-Control-Max-Age": "86400",
};

export const isPublicApiRoute = createRouteMatcher([
  "/api/health",
  "/api/polar/webhook",
  "/api/webhooks/clerk",
  "/api/s3-api(.*)",
  "/api/agent-bucket/files/upload",
  "/api/agent-bucket/files/download",
  "/api/agent-bucket/files/folder",
  "/api/agent-bucket/files/share",
  "/api/agent-bucket/files",
  "/api/agent-bucket/memory/search",
  "/s/(.*)",
  "/ts/(.*)",
]);

export const isAuthenticatedFeatureRoute = createRouteMatcher([
  "/api/teams/(.*)",
  "/api/cloud/(.*)",
  "/api/s3/(.*)",
  "/api/user",
  "/api/user/(.*)",
  "/api/polar/checkout",
  "/api/polar/portal",
  "/api/polar/sync",
  "/api/contact",
  "/api/feedback",
  "/api/agent-bucket/keys(.*)",
  "/api/agent-bucket/files/list",
  "/api/agent-bucket/files/move-to-drive",
]);

export const isApiRoute = createRouteMatcher(["/api/(.*)"]);

/**
 * Sec-Fetch-* headers are forbidden headers: only real browsers send them.
 */
function isRealBrowser(req: Request): boolean {
  const secFetchSite = req.headers.get("sec-fetch-site");
  const secFetchMode = req.headers.get("sec-fetch-mode");
  const secFetchDest = req.headers.get("sec-fetch-dest");

  if (!secFetchSite || !secFetchMode) return false;
  if (!["same-origin", "same-site"].includes(secFetchSite)) return false;
  if (!["cors", "same-origin", "no-cors"].includes(secFetchMode)) return false;

  if (secFetchMode === "no-cors") {
    const validEmbeddedDests = ["image", "video", "audio", "document", "embed", "object"];
    if (!secFetchDest || !validEmbeddedDests.includes(secFetchDest)) return false;
  }
  return true;
}

function isValidOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const host = req.headers.get("host");

  if (!isProduction()) {
    if (!origin && !referer) return true;
    const localhostPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/;
    if (origin && localhostPattern.test(origin)) return true;
    if (referer && localhostPattern.test(referer)) return true;
  }

  const expectedOrigins = [`https://${host}`, "https://bucket0.com", "https://www.bucket0.com"];

  if (origin) {
    return expectedOrigins.some((expected) => origin === expected || origin.endsWith(".bucket0.com"));
  }
  if (referer) {
    return expectedOrigins.some((expected) => referer.startsWith(expected) || referer.includes(".bucket0.com"));
  }
  return false;
}

export function isValidRequest(req: Request): boolean {
  if (!isProduction()) return isValidOrigin(req);
  return isValidOrigin(req) && isRealBrowser(req);
}

const csp = () => [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://*.clerk.accounts.dev https://*.clerk.com https://*.bucket0.com https://*.cloudflare.com https://www.googletagmanager.com https://www.google-analytics.com https://static.cloudflareinsights.com https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https: wss://*.clerk.com wss://*.bucket0.com",
  "frame-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "worker-src 'self' blob: https://cdn.jsdelivr.net",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  ...(isProduction() ? ["upgrade-insecure-requests"] : []),
].join("; ");

export function addSecurityHeaders(headers: Headers): void {
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "SAMEORIGIN");
  if (isProduction()) {
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }
  headers.set("X-XSS-Protection", "1; mode=block");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set(
    "Permissions-Policy",
    "geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=()"
  );
  // Routes serving user content may set a stricter sandbox CSP; keep it.
  if (!headers.has("Content-Security-Policy")) headers.set("Content-Security-Policy", csp());
}
