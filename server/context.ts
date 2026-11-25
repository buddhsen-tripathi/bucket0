/**
 * Per-request context shared with the Next.js-compat shims.
 *
 * The Hono app wraps every request in `requestContext.run(...)` so route
 * handlers, React Router loaders, and lib code can call `auth()`,
 * `currentUser()`, and `headers()` without threading the Request through.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type { ExecutionContext } from "hono";
import type { User } from "@clerk/backend";
import type { SessionAuth } from "@/server/compat/clerk";

export interface RequestContext {
  request: Request;
  env: Record<string, unknown>;
  ctx: ExecutionContext;
  /** Lazily populated by `auth()` in server/compat/clerk.ts */
  auth?: Promise<SessionAuth>;
  /** Lazily populated by `currentUser()` */
  user?: Promise<User | null>;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext {
  const store = requestContext.getStore();
  if (!store) {
    throw new Error("No request context: handler called outside of the Hono request scope");
  }
  return store;
}

/** Keep bounded background work alive after the response (or a disconnect).
 * Direct callers outside the Worker request adapter await the work instead.
 */
export async function runInBackground(work: Promise<unknown>): Promise<void> {
  const context = requestContext.getStore();
  if (context) {
    context.ctx.waitUntil(work);
  } else {
    await work;
  }
}
