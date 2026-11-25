/**
 * Drop-in replacements for the `next/server` exports the route handlers use:
 * `NextRequest` (adds `nextUrl`) and `NextResponse` (adds static `json`/`redirect`).
 * Both are thin subclasses of the Fetch standard classes so they work in
 * workerd, Node, and Vitest alike.
 */

export class NextRequest extends Request {
  readonly nextUrl: URL;

  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(input, init);
    this.nextUrl = new URL(this.url);
  }
}

export class NextResponse<Body = unknown> extends Response {
  // Carried only for typing parity with Next.js; not used at runtime.
  declare readonly __body?: Body;

  static json<T>(body: T, init?: ResponseInit): NextResponse<T> {
    const headers = new Headers(init?.headers);
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    return new NextResponse<T>(JSON.stringify(body), { ...init, headers });
  }

  static redirect(url: string | URL, init?: number | ResponseInit): NextResponse {
    const status = typeof init === "number" ? init : (init?.status ?? 307);
    const headers = new Headers(typeof init === "object" ? init.headers : undefined);
    headers.set("Location", String(url));
    return new NextResponse(null, { ...(typeof init === "object" ? init : {}), status, headers });
  }
}
