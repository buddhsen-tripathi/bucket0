/**
 * Replacement for `@clerk/nextjs/server` built on `@clerk/backend`.
 *
 * `auth()` verifies the session once per request (memoized on the request
 * context) and returns Clerk's standard auth object (`userId`, `sessionId`,
 * `getToken`, ...). `currentUser()` and `clerkClient()` match the Next.js
 * signatures so route handlers port unchanged.
 */

import { createClerkClient, type ClerkClient, type SessionAuthObject, type User } from "@clerk/backend";

/** Session-token auth state, matching what `auth()` returned in @clerk/nextjs. */
export type SessionAuth = SessionAuthObject;
import { getRequestContext } from "@/server/context";

export type { Session, User, WebhookEvent } from "@clerk/backend";

let client: ClerkClient | undefined;

function getClient(): ClerkClient {
  if (!client) {
    client = createClerkClient({
      secretKey: process.env.CLERK_SECRET_KEY,
      publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    });
  }
  return client;
}

function authorizedParties(request: Request): string[] {
  const parties = new Set<string>([
    new URL(request.url).origin,
    "https://bucket0.com",
    "https://www.bucket0.com",
  ]);
  if (process.env.NEXT_PUBLIC_APP_URL) {
    parties.add(process.env.NEXT_PUBLIC_APP_URL);
  }
  return [...parties];
}

export function authenticateClerkRequest() {
  const ctx = getRequestContext();
  return getClient().authenticateRequest(ctx.request, { authorizedParties: authorizedParties(ctx.request) });
}

export async function auth(): Promise<SessionAuth> {
  const ctx = getRequestContext();
  if (!ctx.auth) {
    ctx.auth = authenticateClerkRequest().then((state) => {
      const sessionAuth = state.toAuth();
      if (!sessionAuth) throw new Error("Clerk handshake must be handled before the route handler");
      return sessionAuth;
    });
  }
  return ctx.auth;
}

export async function currentUser(): Promise<User | null> {
  const ctx = getRequestContext();
  if (!ctx.user) {
    ctx.user = auth().then(({ userId }) => (userId ? getClient().users.getUser(userId) : null));
  }
  return ctx.user;
}

export async function clerkClient(): Promise<ClerkClient> {
  return getClient();
}
