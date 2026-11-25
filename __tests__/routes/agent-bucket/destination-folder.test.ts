import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "@/server/compat/next-server";

const createKey = vi.fn();
const updateKey = vi.fn();

vi.mock("@/lib/shared/db", () => ({ db: {} }));
vi.mock("@/server/context", () => ({ runInBackground: vi.fn() }));
vi.mock("@/server/compat/clerk", () => ({
  auth: vi.fn().mockResolvedValue({ userId: "userA" }),
}));
vi.mock("@/lib/shared/logger", () => ({
  agentLog: { info: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/agent/agent-key-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agent/agent-key-service")>();
  return { ...actual, agentKeyService: { createKey, updateKey } };
});

const INVALID: unknown[] = [
  "../userB/docs",
  "docs/../../userB",
  "./docs",
  "docs/.",
  "..",
  "/docs",
  "docs\\..\\userB",
  "docs//sub",
  { evil: true },
  123,
  ["docs"],
];

const VALID: unknown[] = [null, "", "docs", "docs/", "ai-uploads/sub", ".hidden", "a..b/c"];

function req(method: string, body: unknown) {
  return new NextRequest("http://localhost/api/agent-bucket/keys", {
    method,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  createKey.mockReset().mockResolvedValue({
    success: true,
    key: {
      id: "k1",
      apiKey: "b0ak_x",
      keyPrefix: "b0ak_x",
      name: "n",
      destination: "drive",
      destinationFolder: null,
      createdAt: new Date(),
    },
  });
  updateKey.mockReset().mockResolvedValue(true);
});

describe("agent key destinationFolder validation", () => {
  it.each(INVALID)("POST rejects %j", async (destinationFolder) => {
    const { POST } = await import("@/server/routes/api/agent-bucket/keys/route");
    const res = await POST(req("POST", { name: "n", destination: "drive", destinationFolder }));
    expect(res.status).toBe(400);
    expect(createKey).not.toHaveBeenCalled();
  });

  it.each(INVALID)("PATCH rejects %j", async (destinationFolder) => {
    const { PATCH } = await import("@/server/routes/api/agent-bucket/keys/route");
    const res = await PATCH(req("PATCH", { id: "k1", destination: "drive", destinationFolder }));
    expect(res.status).toBe(400);
    expect(updateKey).not.toHaveBeenCalled();
  });

  it.each(VALID)("POST accepts %j", async (destinationFolder) => {
    const { POST } = await import("@/server/routes/api/agent-bucket/keys/route");
    const res = await POST(req("POST", { name: "n", destination: "drive", destinationFolder }));
    expect(res.status).toBe(200);
    expect(createKey).toHaveBeenCalled();
  });

  it.each(VALID)("PATCH accepts %j", async (destinationFolder) => {
    const { PATCH } = await import("@/server/routes/api/agent-bucket/keys/route");
    const res = await PATCH(req("PATCH", { id: "k1", destination: "drive", destinationFolder }));
    expect(res.status).toBe(200);
    expect(updateKey).toHaveBeenCalled();
  });

  it("POST and PATCH without destinationFolder still work", async () => {
    const { POST, PATCH } = await import("@/server/routes/api/agent-bucket/keys/route");
    expect((await POST(req("POST", { name: "n" }))).status).toBe(200);
    expect((await PATCH(req("PATCH", { id: "k1", isActive: false }))).status).toBe(200);
  });
});
