import { describe, it, expect, vi, beforeEach } from "vitest";

const counters = new Map<string, number>();
const inserted: unknown[] = [];

vi.mock("@/lib/payments/rate-limit", () => ({
  RateLimiters: {
    contact: vi.fn(async (ip: string) => {
      const n = (counters.get(ip) ?? 0) + 1;
      counters.set(ip, n);
      return { success: n <= 5, limit: 5, remaining: Math.max(5 - n, 0), resetAt: Date.now() + 3600_000 };
    }),
  },
  createRateLimitHeaders: () => ({}),
}));

vi.mock("@/lib/shared/db", () => ({
  db: {
    insert: () => ({
      values: (v: unknown) => {
        inserted.push(v);
        return { returning: async () => [{ id: "m1" }] };
      },
    }),
  },
}));

vi.mock("@/db/schema", () => ({ contactMessages: {} }));
vi.mock("@/lib/shared/logger", () => ({
  contactLog: { info: vi.fn(), error: vi.fn() },
}));

function submit(headers: Record<string, string>) {
  return new Request("http://localhost/api/contact", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({
      name: "Dummy Sender",
      email: "dummy@example.org",
      subject: "general",
      message: "Hello there, this is a test message.",
      _t: 5000,
    }),
  });
}

beforeEach(() => {
  counters.clear();
  inserted.length = 0;
});

describe("POST /api/contact rate-limit actor", () => {
  it("keys the limit on cf-connecting-ip, ignoring rotating x-forwarded-for", async () => {
    const { POST } = await import("@/server/routes/api/contact/route");

    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await POST(
        submit({ "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": `198.51.100.${i}` })
      );
      statuses.push(res.status);
    }

    expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(statuses[5]).toBe(429);
    expect(inserted).toHaveLength(5);
    expect(inserted.every((v) => (v as { ip: string }).ip === "203.0.113.7")).toBe(true);
  });
});
